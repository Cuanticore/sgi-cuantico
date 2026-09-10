// scripts/req-sig-18-correccion-responsables.ts
//
// REQ-SIG-18 §15 · la corrección de los registros de responsable del inventario.
//
// Se corre ANTES de construir la pantalla de Valoración: la Tabla A y la Tabla B leen
// `propietarioId` y `custodioId`, así que una casilla en null es una fila «sin asignar» que
// no debería existir.
//
// **Es la Ruta B** (§15.5): V19 ya entró, los nulls ya están en la base, y renombrar el
// catálogo no los llena — eso sólo arregla las cargas futuras. Hay que reasignar por código.
//
// ── Cómo se corre ─────────────────────────────────────────────────────────────────────────
//
//   npx tsx scripts/req-sig-18-correccion-responsables.ts            ← ENSAYO, no escribe
//   npx tsx scripts/req-sig-18-correccion-responsables.ts --aplicar  ← escribe
//
// El ensayo es el modo por defecto a propósito: esto reescribe el responsable de 35 activos
// y quien lo corre tiene que poder ver la lista antes de que ocurra.
//
// ── Lo que hace, y lo que NO ──────────────────────────────────────────────────────────────
//
// Llena **sólo las casillas que están en null** y cuyo valor en V19 resuelve a un cargo real.
// Una casilla que ya tiene un cargo distinto del que dice el libro **no se toca**: puede ser
// una corrección manual deliberada, y sobreescribirla sería exactamente el `UPDATE` masivo
// que el §12 del requerimiento prohíbe. Esas discrepancias se reportan y no se aplican.
//
// ── La bitácora ───────────────────────────────────────────────────────────────────────────
//
// Invariante 7: va en la misma transacción que el hecho. Se usa `registrar()`, el mismo que
// llama `crearActivo`.
//
// **Una desviación del ejemplo del §15.4, y es deliberada.** Ese ejemplo pone
// `anterior: 'Cada usuario'` —el valor del libro— y `nuevo: 'Operations & Services Manager'`.
// Para los diez de H-19 funciona, pero para las 26 del catálogo el valor del libro y el
// cargo resuelto son **la misma cadena** («Architecture and Technology Manager»), y
// `registrar()` arranca filtrando los cambios donde anterior === nuevo (`bitacora.ts:45`):
// se perderían 26 de las 36 filas de auditoría, en silencio.
//
// Así que `anterior` es **lo que la fila tenía de verdad** —null, que `texto()` rinde como
// «(vacío)»— y el valor original del libro va en el `motivo`, que es donde vive el porqué.
// Con eso la bitácora dice la verdad sobre el cambio y el criterio 6 del §15.7 cuadra.

import ExcelJS from 'exceljs';

import { prisma } from '../lib/db';
import { registrar, type Cambio } from '../lib/sgsi/bitacora';
import { traducirResponsable } from '../lib/sgsi/responsables-v19';

// ─── Configuración ────────────────────────────────────────────────────────────────────────

const LIBRO =
  process.env.REQ_SIG_18_LIBRO ??
  'C:/Users/fjans/Downloads/FOR-SIG-12 Consolidado de Activos de Información V19.xlsx';

const HOJA = 'Matriz de Activos';
/// El encabezado está en la fila 7 y los datos arrancan en la 8. Verificado contra el libro.
const PRIMERA_FILA = 8;
/// `COLUMNAS_MATRIZ` de `consolidado-lectura.ts`: 12 es Custodio y 13 es Propietario. En ese
/// orden, que es el del libro y **no** el que sugiere la tabla del §15.1.
const COL = { codigo: 2, custodio: 12, propietario: 13 } as const;

const USUARIO = process.env.REQ_SIG_18_USUARIO ?? 'REQ-SIG-18 · corrección de registros';

const RENOMBRE = {
  de: 'Architecture Manager',
  a: 'Architecture and Technology Manager',
} as const;

/// §15.2 · las tres altas, con sus banderas **según el uso real en V19**. Poner las dos en
/// `true` ofrecería en el desplegable de propietario dos cargos que la organización no usa
/// así.
const ALTAS = [
  { nombre: 'Project Manager', esPropietario: false, esCustodio: true },
  { nombre: 'Data Analytics Manager', esPropietario: false, esCustodio: true },
  { nombre: 'Quality Analyst', esPropietario: true, esCustodio: true },
] as const;

const MOTIVO_H19 = 'REQ-SIG-18 §15.3 · H-19 · rol genérico reasignado a cargo real';
const MOTIVO_CATALOGO =
  'REQ-SIG-18 §15.2 · el cargo faltaba en el catálogo y la carga dejó la casilla vacía';

const APLICAR = process.argv.includes('--aplicar');

// ─── Utilidades ───────────────────────────────────────────────────────────────────────────

/// La misma comparación que el importador (`consolidado-lectura.ts:150`).
const igual = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0;

function celda(hoja: ExcelJS.Worksheet, fila: number, columna: number): string {
  try {
    const v = hoja.getCell(fila, columna).value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
      if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('').trim();
      return String(o.text ?? o.result ?? '').trim();
    }
    return String(v).trim();
  } catch {
    // Las celdas combinadas del encabezado lanzan al leer `.text`. No es un dato perdido:
    // ninguna fila de activo está combinada.
    return '';
  }
}

function seccion(titulo: string): void {
  console.log(`\n── ${titulo} ${'─'.repeat(Math.max(0, 76 - titulo.length))}`);
}

// ─── Paso 1 · el catálogo de cargos (§15.2) ───────────────────────────────────────────────

/// Devuelve el catálogo **como queda después de este paso**, y no lo que hay en la base.
///
/// Es lo que hace útil al ensayo: en modo ENSAYO el renombrado y las altas no se escriben,
/// así que consultar la base otra vez daría el catálogo viejo y el paso 2 reportaría las 26
/// casillas como irresolubles — un falso negativo que esconde justamente el trabajo que el
/// ensayo tiene que mostrar. Las altas que todavía no existen llevan id negativo: en ENSAYO
/// nadie las usa para escribir, y en APLICAR ya son las reales.
async function corregirCatalogo(): Promise<{ id: number; nombre: string }[]> {
  seccion('Paso 1 · el catálogo de cargos');

  const existentes = await prisma.cargoResponsable.findMany({
    select: { id: true, nombre: true, orden: true },
    orderBy: { orden: 'asc' },
  });
  console.log(`   catálogo actual: ${existentes.length} cargos`);

  const viejo = existentes.find((c) => igual(c.nombre, RENOMBRE.de));
  const nuevo = existentes.find((c) => igual(c.nombre, RENOMBRE.a));

  if (viejo && nuevo) {
    // Justo el incidente que §15.2 quiere evitar. No se resuelve solo y no se adivina cuál
    // conservar: hay siete llaves foráneas apuntando a `CargoResponsable`.
    throw new Error(
      `Los DOS cargos existen a la vez: «${RENOMBRE.de}» (id ${viejo.id}) y «${RENOMBRE.a}» ` +
        `(id ${nuevo.id}). Es la duplicación que §15.2 previene. Hay que decidir cuál ` +
        'conservar y repuntar las llaves foráneas a mano; el script no lo hace por su cuenta.',
    );
  }

  if (viejo) {
    console.log(`   renombrar id ${viejo.id}: «${RENOMBRE.de}» → «${RENOMBRE.a}»`);
    if (APLICAR) {
      await prisma.$transaction(async (tx) => {
        await tx.cargoResponsable.update({
          where: { id: viejo.id },
          data: { nombre: RENOMBRE.a },
        });
        await registrar({ bitacora: tx.bitacora }, USUARIO, [
          {
            tabla: 'cargo_responsable',
            registroId: String(viejo.id),
            campo: 'nombre',
            anterior: RENOMBRE.de,
            nuevo: RENOMBRE.a,
            motivo:
              'REQ-SIG-18 §15.2 · el catálogo lo llamaba con el nombre viejo. Se RENOMBRA la ' +
              'fila y no se crea una segunda: hay siete llaves foráneas apuntando acá.',
          },
        ]);
      });
    }
  } else if (nuevo) {
    console.log(`   renombrado ya aplicado (id ${nuevo.id}) · nada que hacer`);
  } else {
    throw new Error(
      `No existe ni «${RENOMBRE.de}» ni «${RENOMBRE.a}» en el catálogo. El script no crea ` +
        'el cargo por su cuenta: si el catálogo no es el que el requerimiento describe, hay ' +
        'que revisar por qué antes de escribir nada.',
    );
  }

  // El catálogo proyectado: lo que había, con el renombrado ya reflejado.
  const proyectado: { id: number; nombre: string }[] = existentes.map((c) => ({
    id: c.id,
    nombre: igual(c.nombre, RENOMBRE.de) ? RENOMBRE.a : c.nombre,
  }));
  let idFicticio = 0;

  let orden = Math.max(0, ...existentes.map((c) => c.orden));
  for (const alta of ALTAS) {
    const ya = existentes.find((c) => igual(c.nombre, alta.nombre));
    if (ya) {
      console.log(`   «${alta.nombre}» ya existe (id ${ya.id}) · nada que hacer`);
      continue;
    }
    orden += 1;
    const banderas = `esPropietario=${alta.esPropietario} esCustodio=${alta.esCustodio}`;
    console.log(`   alta: «${alta.nombre}» · orden ${orden} · ${banderas}`);
    if (APLICAR) {
      const ordenDeEsta = orden;
      const creadoId = await prisma.$transaction(async (tx) => {
        const creado = await tx.cargoResponsable.create({
          data: {
            nombre: alta.nombre,
            esPropietario: alta.esPropietario,
            esCustodio: alta.esCustodio,
            activo: true,
            orden: ordenDeEsta,
          },
        });
        await registrar({ bitacora: tx.bitacora }, USUARIO, [
          {
            tabla: 'cargo_responsable',
            registroId: String(creado.id),
            campo: 'alta',
            anterior: null,
            nuevo: `${alta.nombre} · ${banderas}`,
            motivo:
              'REQ-SIG-18 §15.2 · cargo real que V19 usa y el catálogo no tenía. Las banderas ' +
              'van según su uso real en el libro, no en true por defecto.',
          },
        ]);
        return creado.id;
      });
      proyectado.push({ id: creadoId, nombre: alta.nombre });
    } else {
      idFicticio -= 1;
      proyectado.push({ id: idFicticio, nombre: alta.nombre });
    }
  }

  return proyectado;
}

// ─── Paso 2 · las casillas de responsable (§15.1 y §15.3) ─────────────────────────────────

interface Deseado {
  codigo: string;
  custodio: string;
  propietario: string;
}

async function leerLibro(): Promise<Deseado[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(LIBRO);
  const hoja = wb.worksheets.find((h) => h.name === HOJA);
  if (!hoja) {
    throw new Error(`El libro no tiene la hoja «${HOJA}». Hojas: ${wb.worksheets.map((h) => h.name).join(', ')}`);
  }

  const filas: Deseado[] = [];
  for (let f = PRIMERA_FILA; f <= hoja.rowCount; f++) {
    const codigo = celda(hoja, f, COL.codigo);
    if (codigo === '') continue;
    filas.push({
      codigo,
      custodio: celda(hoja, f, COL.custodio),
      propietario: celda(hoja, f, COL.propietario),
    });
  }
  return filas;
}

interface Pendiente {
  codigo: string;
  campo: 'custodio' | 'propietario';
  cargoId: number;
  cargoNombre: string;
  enElLibro: string;
  traducidoDe: string | null;
}

async function corregirCasillas(cargos: { id: number; nombre: string }[]): Promise<void> {
  seccion('Paso 2 · las casillas de responsable');

  const libro = await leerLibro();
  console.log(`   libro: ${libro.length} filas con código`);

  const activos = await prisma.activo.findMany({
    where: { activo: true },
    select: { id: true, codigo: true, custodioId: true, propietarioId: true },
  });
  const porCodigo = new Map(activos.map((a) => [a.codigo, a]));
  const nombreDeCargo = new Map(cargos.map((c) => [c.id, c.nombre]));
  console.log(
    `   base: ${activos.length} activos vigentes · ${cargos.length} cargos` +
      `${APLICAR ? '' : ' (catálogo proyectado del paso 1)'}`,
  );

  const pendientes: Pendiente[] = [];
  const sinResolver: string[] = [];
  const discrepancias: string[] = [];
  const fueraDelLibro: string[] = [];

  for (const fila of libro) {
    const activo = porCodigo.get(fila.codigo);
    if (!activo) {
      fueraDelLibro.push(fila.codigo);
      continue;
    }

    for (const campo of ['custodio', 'propietario'] as const) {
      const enElLibro = fila[campo];
      // Un vacío DECLARADO no es un problema: son los 18 sin custodio de H-20, y siguen
      // siendo trabajo pendiente legítimo. No se inventa nada.
      if (enElLibro === '') continue;

      const t = traducirResponsable(enElLibro);
      const cargo = cargos.find((c) => igual(c.nombre, t.nombre));
      if (!cargo) {
        // «No inventes datos que falten»: se reporta con el código del activo y se falla.
        sinResolver.push(`${fila.codigo} · ${campo} · «${enElLibro}» → «${t.nombre}»`);
        continue;
      }

      const actual = campo === 'custodio' ? activo.custodioId : activo.propietarioId;
      if (actual === cargo.id) continue;
      if (actual !== null) {
        // Ya tiene un cargo distinto del que dice el libro. NO se toca: puede ser una
        // corrección manual deliberada, y sobreescribirla sería el UPDATE masivo que el §12
        // prohíbe. Se reporta.
        discrepancias.push(
          `${fila.codigo} · ${campo} · base «${nombreDeCargo.get(actual) ?? actual}» ` +
            `≠ libro «${cargo.nombre}»`,
        );
        continue;
      }

      pendientes.push({
        codigo: fila.codigo,
        campo,
        cargoId: cargo.id,
        cargoNombre: cargo.nombre,
        enElLibro,
        traducidoDe: t.original,
      });
    }
  }

  if (fueraDelLibro.length > 0) {
    console.log(`\n   ${fueraDelLibro.length} código(s) del libro que no están en la base:`);
    console.log(`     ${fueraDelLibro.slice(0, 12).join(' ')}${fueraDelLibro.length > 12 ? ' …' : ''}`);
  }

  if (discrepancias.length > 0) {
    console.log(`\n   ${discrepancias.length} casilla(s) que YA tienen un cargo distinto · NO se tocan:`);
    for (const d of discrepancias.slice(0, 20)) console.log(`     ${d}`);
    if (discrepancias.length > 20) console.log(`     … y ${discrepancias.length - 20} más`);
  }

  if (sinResolver.length > 0) {
    console.error(`\n   ${sinResolver.length} casilla(s) cuyo cargo NO resuelve:`);
    for (const s of sinResolver) console.error(`     ${s}`);
    throw new Error(
      'Hay valores de responsable que no resuelven a ningún cargo del catálogo. La ' +
        'corrección NO se aplica a medias: o el catálogo está incompleto, o el libro trae un ' +
        'valor nuevo que necesita decisión. Nada de valores por defecto en silencio.',
    );
  }

  // §15.7 criterio 8 · «recargar V19 después de la corrección no reintroduce ningún null de
  // responsable». Se demuestra acá y no reimportando: este bucle acaba de aplicar a los 299
  // valores del libro **la misma traducción y la misma búsqueda** que `opcional()` usa ahora
  // en el importador (`consolidado-lectura.ts`). Cero irresolubles ⇒ una reimportación no
  // puede dejar una casilla escrita en null. Es el criterio que se puede olvidar sin que
  // nada se rompa hoy, y por eso se imprime siempre.
  const escritos = libro.reduce(
    (t, f) => t + (f.custodio === '' ? 0 : 1) + (f.propietario === '' ? 0 : 1),
    0,
  );
  console.log(
    `\n   criterio 8 · de ${escritos} valores de responsable escritos en el libro, ` +
      `${sinResolver.length} no resuelven (esperado 0)`,
  );

  seccion(`Casillas por corregir · ${pendientes.length}`);
  const porValor = new Map<string, Pendiente[]>();
  for (const p of pendientes) {
    const clave = `${p.campo} → ${p.cargoNombre}${p.traducidoDe ? `  (de «${p.traducidoDe}»)` : ''}`;
    (porValor.get(clave) ?? porValor.set(clave, []).get(clave)!).push(p);
  }
  for (const [clave, lista] of [...porValor.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`   ${String(lista.length).padStart(3)}  ${clave}`);
    console.log(`        ${lista.map((p) => p.codigo).join(' ')}`);
  }

  if (!APLICAR) {
    console.log('\n   ENSAYO · no se escribió nada. Volvé a correr con --aplicar.');
    return;
  }

  let casillas = 0;
  let filasDeBitacora = 0;
  for (const p of pendientes) {
    const activo = porCodigo.get(p.codigo)!;
    const anterior = p.campo === 'custodio' ? activo.custodioId : activo.propietarioId;
    const cambio: Cambio = {
      tabla: 'activo',
      registroId: p.codigo,
      campo: p.campo,
      anterior: anterior === null ? null : (nombreDeCargo.get(anterior) ?? String(anterior)),
      nuevo: p.cargoNombre,
      motivo:
        p.traducidoDe === null
          ? `${MOTIVO_CATALOGO} · V19 decía «${p.enElLibro}»`
          : `${MOTIVO_H19} · V19 decía «${p.traducidoDe}»`,
    };

    await prisma.$transaction(async (tx) => {
      // Condicional al valor actual: sin esto, una segunda corrida movería `updatedAt` sin
      // motivo. `count` viene del `updateMany`, así que si otra corrida se adelantó, esta
      // no escribe ni la fila de bitácora.
      const r = await tx.activo.updateMany({
        where:
          p.campo === 'custodio'
            ? { id: activo.id, custodioId: anterior }
            : { id: activo.id, propietarioId: anterior },
        data: p.campo === 'custodio' ? { custodioId: p.cargoId } : { propietarioId: p.cargoId },
      });
      if (r.count === 0) return;
      casillas += r.count;
      filasDeBitacora += await registrar({ bitacora: tx.bitacora }, USUARIO, [cambio]);
    });
  }

  console.log(`\n   aplicadas ${casillas} casilla(s) · ${filasDeBitacora} fila(s) de bitácora`);
}

// ─── Criterios de aceptación (§15.7) ──────────────────────────────────────────────────────

async function verificar(): Promise<void> {
  seccion('Criterios de aceptación · §15.7');

  const [viejo, nuevo, cargos, sinProp, sinCust, filasBitacora] = await Promise.all([
    prisma.cargoResponsable.count({ where: { nombre: RENOMBRE.de } }),
    prisma.cargoResponsable.count({ where: { nombre: RENOMBRE.a } }),
    prisma.cargoResponsable.count(),
    prisma.activo.count({ where: { activo: true, propietarioId: null } }),
    prisma.activo.count({ where: { activo: true, custodioId: null } }),
    prisma.bitacora.count({
      where: { tabla: 'activo', campo: { in: ['propietario', 'custodio'] }, motivo: { startsWith: 'REQ-SIG-18' } },
    }),
  ]);

  const linea = (n: string, real: number | string, esperado: number | string) => {
    const ok = String(real) === String(esperado);
    console.log(`   ${ok ? 'OK  ' : 'MAL '} ${n.padEnd(52)} real ${String(real).padStart(4)}  esperado ${esperado}`);
    return ok;
  };

  const r: boolean[] = [];
  r.push(linea(`1a · cargos «${RENOMBRE.de}»`, viejo, 0));
  r.push(linea(`1b · cargos «${RENOMBRE.a}»`, nuevo, 1));
  // El §15.7 dice 14 contando los 11 de `listas.json`. La base tiene DOS más sembrados por
  // otro lado —«Cada titular» (prisma/data/activos.json) y «Comité del SIG»
  // (prisma/seeds/escalas.ts)— así que el número real es 13 + 3 = 16.
  r.push(linea('2 · total de cargos (13 + 3 altas)', cargos, 16));
  r.push(linea('3 · activos vigentes sin propietario', sinProp, 0));
  r.push(linea('4 · activos vigentes sin custodio (H-20)', sinCust, 18));

  const H19: Record<string, string> = {
    'TEC-APP-0007': 'Operations & Services Manager',
    'TEC-APP-0008': 'Operations & Services Manager',
    'TEC-APP-0009': 'Operations & Services Manager',
    'TEC-APP-0010': 'Operations & Services Manager',
    'TEC-APP-0011': 'Operations & Services Manager',
    'TEC-APP-0012': 'Operations & Services Manager',
    'TEC-APP-0013': 'Operations & Services Manager',
    'TEC-APP-0014': 'Operations & Services Manager',
    'TEC-APP-0015': 'Chief Legal Officer',
    'TEC-EQU-0008': 'Chief Operating Officer',
  };
  const diez = await prisma.activo.findMany({
    where: { codigo: { in: Object.keys(H19) } },
    select: { codigo: true, propietario: { select: { nombre: true } } },
  });
  // `Activo.codigo` es nullable en el esquema, así que no se puede indexar con él a secas.
  // Un activo sin código no puede ser uno de los diez —se buscan POR código— pero el tipo
  // no lo sabe y tiene razón en exigirlo.
  const esperado = (a: { codigo: string | null }) => (a.codigo === null ? undefined : H19[a.codigo]);
  const malos = diez.filter((a) => a.propietario?.nombre !== esperado(a));
  r.push(linea('5 · los 10 de H-19 con su propietario', diez.length - malos.length, 10));
  for (const m of malos) {
    console.log(
      `        ${m.codigo ?? '(sin código)'}: «${m.propietario?.nombre ?? '(vacío)'}» ` +
        `≠ «${esperado(m) ?? '(no esperado)'}»`,
    );
  }

  console.log(`   ——  6 · filas de bitácora REQ-SIG-18 sobre activo: ${filasBitacora}`);
  console.log(`\n   ${r.every(Boolean) ? 'TODOS LOS CRITERIOS CUADRAN' : 'HAY CRITERIOS QUE NO CUADRAN'}`);
}

// ─── Entrada ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`REQ-SIG-18 §15 · corrección de responsables · ${APLICAR ? 'APLICAR' : 'ENSAYO'}`);
  console.log(`libro: ${LIBRO}`);
  const cargos = await corregirCatalogo();
  await corregirCasillas(cargos);
  await verificar();
}

main()
  .catch((e) => {
    console.error(`\nFALLÓ: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
