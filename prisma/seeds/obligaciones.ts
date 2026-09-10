// prisma/seeds/obligaciones.ts
//
// REQ-SIG-17 · la primera carga del SIG: 22 contenidos, 27 obligaciones y la cabecera del
// DOFA y del PESTEL 2026. Es lo que enciende el motor de tareas.
//
// **Lee del libro de carga, no del cronograma.** `docs/handoff_sig/carga-obligaciones-v1.xlsx`
// tiene la derivación ya hecha y revisada fila por fila (§4.7); el cronograma original es la
// trazabilidad y vive en su hoja `Fuente`.
//
// Idempotente como las otras siete semillas: correrla dos veces no duplica nada.
//
// ── Lo que NO hace, y es deliberado ───────────────────────────────────────────────────────
//
//   · No carga `Asignacion` ni `RegistroRealizado`. Los produce el sistema al operar;
//     cargarlos estrenaría la base con ejecuciones que nadie hizo.
//   · No carga `EntradaContexto`. Las casillas del DOFA y del PESTEL **no existen en ningún
//     archivo del repositorio documental** (§6): sembrarlas sería falsificar el análisis de
//     contexto de la organización. La cabecera con su acta sí es lo que un auditor pide.
//   · No carga el bloque B (46 planes, 308 hallazgos): `Hallazgo.fechaDeteccion` es
//     obligatoria y está vacía en las 46 filas. D-7 está abierta a propósito.
//   · No agrega `BIMESTRAL` al enum. Las filas 26 y 31 van `TRIMESTRAL` a sabiendas (D-3),
//     así que el sistema va a pedir cuatro comités al año donde la organización planeó seis.

import { join } from 'node:path';
import ExcelJS from 'exceljs';
import type { PrismaClient, Prisma, TipoContenido } from '@prisma/client';

import { registrar, registrarAlta } from '../../lib/sgsi/bitacora';
import { validarDatosObligacion } from '../../lib/sig/obligacion-validacion';

const LIBRO = join(process.cwd(), 'docs', 'handoff_sig', 'carga-obligaciones-v1.xlsx');

/// Quien queda como autor de la bitácora. No es una persona: es una carga.
const USUARIO = 'REQ-SIG-17 · carga inicial del SIG';

/// Los mismos prefijos que `app/sig/acciones/tareas.ts:566`. Se repiten acá porque ese
/// archivo es `'use server'` y no se puede importar de él sin volverlo server action; son
/// cuatro literales que el esquema fija, no una regla que pueda divergir.
const PREFIJO_CODIGO: Record<TipoContenido, string> = {
  CAPACITACION: 'CAP',
  LECTURA: 'LEC',
  VERIFICACION: 'LVE',
  TAREA: 'TAR',
};

/// §4.4 · G-1 · el libro declara `FOR-CAL-10`, que en el listado maestro es el Plan de
/// comunicaciones. El cronograma es `FOR-CAL-11`, y es lo que se registra.
const FUENTE = 'FOR-CAL-11 Cronograma SGC';

/// El título del contenido `C16`, el que las nueve obligaciones de indicadores comparten
/// (§4.4). Se usa para medir el criterio 4 del §8 sin confundirlo con las otras por área.
const TITULO_INDICADORES = 'Seguimiento de indicadores de gestión del proceso';

export interface ResumenObligaciones {
  cargosCreados: number;
  contenidosCreados: number;
  contenidosYaExistian: number;
  versionesCreadas: number;
  obligacionesCreadas: number;
  obligacionesYaExistian: number;
  contextosCreados: number;
  contextosActualizados: number;
  /// Cifras absolutas al terminar, para comparar contra los criterios del §8.
  totales: {
    contenidos: number;
    obligaciones: number;
    obligacionesActivas: number;
    porPeriodicidad: Record<string, number>;
    porAlcance: Record<string, number>;
    contenidosDeIndicadores: number;
    conFechaAnterior: number;
    esProveedor: number;
    analisisContexto: number;
    entradaContexto: number;
    asignaciones: number;
    hallazgos: number;
  };
}

// ─── Lectura del libro ────────────────────────────────────────────────────────────────────

interface FilaContenido {
  clave: string;
  filaCron: string;
  numeral: string;
  tipo: TipoContenido;
  titulo: string;
  descripcion: string;
  documentoCodigo: string | null;
  documentoNombre: string | null;
  exigeFirma: boolean;
  exigeEvaluacion: boolean;
}

interface FilaObligacion {
  clave: string;
  contenido: string;
  filaCron: string;
  numeral: string;
  alcance: 'AREA' | 'CARGO';
  destino: string;
  periodicidad: 'MENSUAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';
  fechaInicio: Date;
  plazoDias: number;
  diasAviso: number;
  anclaje: 'ANCLADA' | 'FLOTANTE';
  esProveedor: boolean;
  notificar: boolean;
  activa: boolean;
}

/// Las celdas combinadas del encabezado lanzan al leer `.text`, y una fórmula devuelve un
/// objeto. Ninguna fila de datos del libro es de esas, pero leer defensivamente evita que un
/// cambio de formato del libro se manifieste como un stack trace en vez de un dato faltante.
function celda(hoja: ExcelJS.Worksheet, fila: number, columna: number): string {
  try {
    const v = hoja.getCell(fila, columna).value;
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object') {
      const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
      if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('').trim();
      return String(o.text ?? o.result ?? '').trim();
    }
    return String(v).trim();
  } catch {
    return '';
  }
}

/// «sí» / «SÍ» / «si» → true. Cualquier otra cosa, incluido el guion largo, → false.
function esSi(valor: string): boolean {
  const v = valor.trim().toLowerCase();
  return v === 'sí' || v === 'si';
}

/// El índice de cada columna por su encabezado, para que agregar una columna al libro no
/// desplace la lectura. Un libro que se lee por posición se rompe en silencio el día que
/// alguien inserte una columna.
function columnas(hoja: ExcelJS.Worksheet): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (let c = 1; c <= hoja.columnCount; c++) {
    const nombre = celda(hoja, 1, c).trim().toUpperCase();
    if (nombre !== '') mapa[nombre] = c;
  }
  return mapa;
}

function exigir(mapa: Record<string, number>, nombre: string, hoja: string): number {
  const c = mapa[nombre];
  if (c === undefined) {
    throw new Error(
      `El libro de carga no tiene la columna «${nombre}» en la hoja «${hoja}». ` +
        `Columnas encontradas: ${Object.keys(mapa).join(', ')}.`,
    );
  }
  return c;
}

const TIPOS_VALIDOS: TipoContenido[] = ['CAPACITACION', 'LECTURA', 'VERIFICACION', 'TAREA'];

async function leerLibro(): Promise<{ contenidos: FilaContenido[]; obligaciones: FilaObligacion[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(LIBRO);

  const hc = wb.worksheets.find((h) => h.name === 'Contenidos');
  const ho = wb.worksheets.find((h) => h.name === 'Obligaciones');
  if (!hc || !ho) {
    throw new Error(
      `El libro «${LIBRO}» tiene que traer las hojas «Contenidos» y «Obligaciones». ` +
        `Trae: ${wb.worksheets.map((h) => h.name).join(', ')}.`,
    );
  }

  const cc = columnas(hc);
  const contenidos: FilaContenido[] = [];
  for (let f = 2; f <= hc.rowCount; f++) {
    const clave = celda(hc, f, exigir(cc, 'CLAVE', 'Contenidos'));
    if (clave === '') continue;
    const tipoTexto = celda(hc, f, exigir(cc, 'TIPO', 'Contenidos')).toUpperCase();
    if (!TIPOS_VALIDOS.includes(tipoTexto as TipoContenido)) {
      throw new Error(
        `Contenidos · fila ${f} (${clave}): el TIPO «${tipoTexto}» no es uno de ` +
          `${TIPOS_VALIDOS.join(', ')}. No se adivina un tipo.`,
      );
    }
    const titulo = celda(hc, f, exigir(cc, 'TITULO', 'Contenidos'));
    if (titulo === '') {
      throw new Error(`Contenidos · fila ${f} (${clave}): el TITULO está vacío.`);
    }
    const doc = celda(hc, f, exigir(cc, 'DOCUMENTO_CODIGO', 'Contenidos'));
    const docNombre = celda(hc, f, exigir(cc, 'DOCUMENTO_NOMBRE', 'Contenidos'));
    contenidos.push({
      clave,
      filaCron: celda(hc, f, exigir(cc, 'FILA CRON.', 'Contenidos')),
      numeral: celda(hc, f, exigir(cc, 'NUMERAL ISO', 'Contenidos')),
      tipo: tipoTexto as TipoContenido,
      titulo,
      descripcion: celda(hc, f, exigir(cc, 'DESCRIPCION', 'Contenidos')),
      documentoCodigo: doc === '' || doc === '—' ? null : doc,
      documentoNombre: docNombre === '' || docNombre === '—' ? null : docNombre,
      exigeFirma: esSi(celda(hc, f, exigir(cc, 'EXIGE_FIRMA', 'Contenidos'))),
      exigeEvaluacion: esSi(celda(hc, f, exigir(cc, 'EXIGE_EVALUACION', 'Contenidos'))),
    });
  }

  const co = columnas(ho);
  const obligaciones: FilaObligacion[] = [];
  for (let f = 2; f <= ho.rowCount; f++) {
    const clave = celda(ho, f, exigir(co, 'CLAVE', 'Obligaciones'));
    if (clave === '') continue;
    const alcance = celda(ho, f, exigir(co, 'ALCANCE', 'Obligaciones')).toUpperCase();
    if (alcance !== 'AREA' && alcance !== 'CARGO') {
      throw new Error(
        `Obligaciones · fila ${f} (${clave}): el ALCANCE «${alcance}» no es AREA ni CARGO. ` +
          'REQ-SIG-17 §4.4 sólo usa esos dos.',
      );
    }
    const fi = celda(ho, f, exigir(co, 'FECHA_INICIO', 'Obligaciones'));
    const fecha = new Date(`${fi.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(fecha.getTime())) {
      throw new Error(`Obligaciones · fila ${f} (${clave}): FECHA_INICIO «${fi}» no es una fecha.`);
    }
    const plazo = Number(celda(ho, f, exigir(co, 'PLAZO_DIAS', 'Obligaciones')));
    const aviso = Number(celda(ho, f, exigir(co, 'DIAS_AVISO', 'Obligaciones')));
    if (!Number.isFinite(plazo) || !Number.isFinite(aviso)) {
      throw new Error(
        `Obligaciones · fila ${f} (${clave}): PLAZO_DIAS o DIAS_AVISO no son números. ` +
          'Son las dos únicas columnas que no salen de un dato del cronograma (D-6).',
      );
    }
    obligaciones.push({
      clave,
      contenido: celda(ho, f, exigir(co, 'CONTENIDO', 'Obligaciones')),
      filaCron: celda(ho, f, exigir(co, 'FILA CRON.', 'Obligaciones')),
      numeral: celda(ho, f, exigir(co, 'NUMERAL ISO', 'Obligaciones')),
      alcance,
      destino: celda(ho, f, exigir(co, 'DESTINO DEL ALCANCE', 'Obligaciones')),
      periodicidad: celda(ho, f, exigir(co, 'PERIODICIDAD', 'Obligaciones')).toUpperCase() as
        FilaObligacion['periodicidad'],
      fechaInicio: fecha,
      plazoDias: plazo,
      diasAviso: aviso,
      anclaje: celda(ho, f, exigir(co, 'ANCLAJE', 'Obligaciones')).toUpperCase() as
        FilaObligacion['anclaje'],
      esProveedor: esSi(celda(ho, f, exigir(co, 'ES_PROVEEDOR', 'Obligaciones'))),
      notificar: esSi(celda(ho, f, exigir(co, 'NOTIFICAR', 'Obligaciones'))),
      activa: esSi(celda(ho, f, exigir(co, 'ACTIVA', 'Obligaciones'))),
    });
  }

  return { contenidos, obligaciones };
}

// ─── Paso 0 · la precondición dura ────────────────────────────────────────────────────────

/// §2 · `Obligacion.responsableSeguimientoId` es FK obligatoria a `Persona`, y `Persona` sale
/// del Directorio por Graph. **Sin personas no hay carga**, y `Persona.oid` es el object id
/// de Azure AD: fabricarlo dejaría la base mintiendo en la columna que identifica a la gente.
/// `OrigenPersona.MANUAL` existe para marcar eso como anomalía, no como atajo.
async function exigirPersonas(prisma: PrismaClient): Promise<{ katherine: number; daniel: number }> {
  const buscar = async (patron: string) =>
    prisma.persona.findFirst({
      where: { nombre: { contains: patron, mode: 'insensitive' }, activa: true },
      select: { id: true, nombre: true },
    });

  const katherine = await buscar('Quiroga');
  const daniel = await buscar('Medina');
  const laura = await buscar('Agudelo');

  const faltan: string[] = [];
  if (!katherine) faltan.push('Katherine Quiroga (Profesional de Calidad y Procesos)');
  if (!daniel) faltan.push('Daniel Medina (CEO)');
  if (!laura) faltan.push('Laura Agudelo (Líder de Gestión de Calidad)');

  if (faltan.length > 0) {
    throw new Error(
      'REQ-SIG-17 §2 · precondición dura sin cumplir: falta en `Persona` ' +
        `${faltan.join(', ')}.\n` +
        'La carga NO continúa. `Obligacion.responsableSeguimientoId` es FK obligatoria a ' +
        '`Persona`, y `Persona.oid` es el object id de Azure AD: no se fabrica.\n' +
        'Hay que correr la sincronización del Directorio primero.',
    );
  }
  return { katherine: katherine!.id, daniel: daniel!.id };
}

// ─── Paso 1 · los dos cargos ──────────────────────────────────────────────────────────────

/// D-4 y D-5. `Profesional de Calidad y Procesos` es el responsable de seguimiento de las 27,
/// así que sin él **ninguna** obligación tiene el campo obligatorio. `Líder de proceso` es la
/// traducción del conjunto «Líderes de Proceso» del cronograma, que no es un cargo en la
/// fuente.
const CARGOS_NUEVOS = [
  'Profesional de Calidad y Procesos',
  'Líder de proceso',
] as const;

async function sembrarCargos(prisma: PrismaClient): Promise<number> {
  let creados = 0;
  for (const nombre of CARGOS_NUEVOS) {
    const ya = await prisma.cargoResponsable.findFirst({ where: { nombre }, select: { id: true } });
    if (ya) continue;
    const ultimo = await prisma.cargoResponsable.aggregate({ _max: { orden: true } });
    await prisma.$transaction(async (tx) => {
      const creado = await tx.cargoResponsable.create({
        data: {
          nombre,
          // Los dos son cargos de gestión del SIG: responden por actividades, no por activos.
          // `esPropietario`/`esCustodio` quedan en false para no ofrecerlos en el desplegable
          // de responsables de activo, que es de lo que no son.
          esPropietario: false,
          esCustodio: false,
          activo: true,
          orden: (ultimo._max.orden ?? 0) + 1,
        },
      });
      await registrarAlta({ bitacora: tx.bitacora }, USUARIO, 'cargo_responsable', String(creado.id));
    });
    creados += 1;
  }
  return creados;
}

// ─── El contador de códigos ───────────────────────────────────────────────────────────────

/// **Sincroniza `ContadorContenido` con los códigos que YA se emitieron.**
///
/// Hace falta por un defecto de `prisma/seeds/demo.ts`: creó cinco contenidos con el código
/// escrito a mano (`TAR-001`, `CAP-001`, `CAP-004`, `LEC-001`, `LVE-001`) **sin tocar el
/// contador**, que quedó vacío. `ContenidoSig.codigo` es único, así que emitir con el
/// contador en cero produciría `TAR-001` otra vez y la transacción entera fallaría.
///
/// No es inventar un dato: es hacer que el contador diga la verdad sobre lo que ya salió.
/// La alternativa —escribir los códigos a mano— la prohíbe el §4.4: «del contador atómico,
/// **no se fabrica a mano**».
async function sincronizarContador(tx: Prisma.TransactionClient): Promise<void> {
  for (const tipo of TIPOS_VALIDOS) {
    const prefijo = PREFIJO_CODIGO[tipo];
    const existentes = await tx.contenidoSig.findMany({
      where: { codigo: { startsWith: `${prefijo}-` } },
      select: { codigo: true },
    });
    let maximo = 0;
    for (const { codigo } of existentes) {
      const n = Number(codigo.slice(prefijo.length + 1));
      if (Number.isFinite(n) && n > maximo) maximo = n;
    }
    const contador = await tx.contadorContenido.findUnique({ where: { tipo } });
    const actual = contador?.ultimoValor ?? 0;
    if (maximo > actual) {
      await tx.contadorContenido.upsert({
        where: { tipo },
        update: { ultimoValor: maximo },
        create: { tipo, ultimoValor: maximo },
      });
    }
  }
}

async function emitirCodigo(tx: Prisma.TransactionClient, tipo: TipoContenido): Promise<string> {
  const contador = await tx.contadorContenido.upsert({
    where: { tipo },
    update: { ultimoValor: { increment: 1 } },
    create: { tipo, ultimoValor: 1 },
  });
  return `${PREFIJO_CODIGO[tipo]}-${String(contador.ultimoValor).padStart(3, '0')}`;
}

// ─── Pasos 2 y 3 · contenidos y obligaciones, en UNA transacción ──────────────────────────

/// El destino de un alcance `AREA` viene como «EST · Gestión Estratégica»: el prefijo es lo
/// que identifica al área, y es lo único estable — el nombre se puede reescribir.
function prefijoDeArea(destino: string): string {
  return destino.split('·')[0].trim();
}

function nombreDeCargo(destino: string): string {
  return destino.trim();
}

export async function seedObligaciones(prisma: PrismaClient): Promise<ResumenObligaciones> {
  const { katherine, daniel } = await exigirPersonas(prisma);
  const cargosCreados = await sembrarCargos(prisma);
  const { contenidos, obligaciones } = await leerLibro();

  let contenidosCreados = 0;
  let contenidosYaExistian = 0;
  let versionesCreadas = 0;
  let obligacionesCreadas = 0;
  let obligacionesYaExistian = 0;

  // §7 · los pasos 2 y 3 van juntos: 22 contenidos sin sus obligaciones es un catálogo que
  // nadie ejecuta, y 27 obligaciones apuntando a contenidos a medias no arrancan.
  await prisma.$transaction(
    async (tx) => {
      await sincronizarContador(tx);

      // Los catálogos que los destinos resuelven. Se leen DENTRO de la transacción para que
      // los dos cargos del paso 1 ya estén visibles.
      const areas = await tx.area.findMany({ select: { id: true, prefijo: true } });
      const cargos = await tx.cargoResponsable.findMany({ select: { id: true, nombre: true } });
      const idDeArea = new Map(areas.map((a) => [a.prefijo, a.id]));
      const idDeCargo = new Map(cargos.map((c) => [c.nombre.trim().toLowerCase(), c.id]));

      // clave del libro (`C01`) → id del contenido en la base.
      const idPorClave = new Map<string, number>();

      for (const c of contenidos) {
        // La idempotencia va por TÍTULO y no por código: el código lo emite el contador, así
        // que en la segunda corrida sería distinto y no serviría para reconocer la fila.
        const ya = await tx.contenidoSig.findFirst({
          where: { titulo: c.titulo },
          select: { id: true },
        });
        if (ya) {
          idPorClave.set(c.clave, ya.id);
          contenidosYaExistian += 1;
          continue;
        }

        const codigo = await emitirCodigo(tx, c.tipo);
        const creado = await tx.contenidoSig.create({
          data: {
            codigo,
            tipo: c.tipo,
            titulo: c.titulo,
            descripcion: c.descripcion,
            // §4.4 · con el numeral ISO y la fila del cronograma: la fila es lo que permite
            // volver a la celda exacta, y el numeral es lo que el auditor cita. G-5: el
            // numeral errado de la fila 48 se conserva textual acá, no se corrige.
            procedimientoOrigen: `${FUENTE} · numeral ISO 9001 ${c.numeral} · fila ${c.filaCron}`,
            documentoCodigo: c.documentoCodigo,
            documentoNombre: c.documentoNombre,
            // Nada en el cronograma los pide; ponerlos en true inventaría un requisito.
            exigeFirma: c.exigeFirma,
            exigeEvaluacion: c.exigeEvaluacion,
            version: 1,
          },
        });
        // La v1 nace con el contenido, en la MISMA transacción. `publicadaPorId = null`
        // porque estas 22 versiones no tuvieron autor, y firmarlas en nombre de alguien
        // sería falsificar.
        await tx.versionContenido.create({
          data: {
            contenidoId: creado.id,
            version: 1,
            titulo: creado.titulo,
            descripcion: creado.descripcion,
            documentoCodigo: creado.documentoCodigo,
            documentoNombre: creado.documentoNombre,
            publicadaPorId: null,
          },
        });
        await registrarAlta({ bitacora: tx.bitacora }, USUARIO, 'contenido_sig', codigo);
        idPorClave.set(c.clave, creado.id);
        contenidosCreados += 1;
        versionesCreadas += 1;
      }

      for (const o of obligaciones) {
        const contenidoId = idPorClave.get(o.contenido);
        if (contenidoId === undefined) {
          throw new Error(
            `Obligaciones · ${o.clave}: apunta al contenido «${o.contenido}» que la hoja ` +
              'Contenidos no trae. No se adivina un contenido.',
          );
        }

        let alcanceAreaId: number | undefined;
        let alcanceCargoId: number | undefined;
        if (o.alcance === 'AREA') {
          const prefijo = prefijoDeArea(o.destino);
          alcanceAreaId = idDeArea.get(prefijo);
          if (alcanceAreaId === undefined) {
            throw new Error(
              `Obligaciones · ${o.clave}: el área con prefijo «${prefijo}» no está en el ` +
                `catálogo. Áreas disponibles: ${[...idDeArea.keys()].join(', ')}.`,
            );
          }
        } else {
          const nombre = nombreDeCargo(o.destino);
          alcanceCargoId = idDeCargo.get(nombre.toLowerCase());
          if (alcanceCargoId === undefined) {
            throw new Error(
              `Obligaciones · ${o.clave}: el cargo «${nombre}» no está en el catálogo. ` +
                'Si es uno de los dos que D-4 y D-5 crean, el paso 1 falló.',
            );
          }
        }

        // Idempotencia: el par (contenido, destino) identifica la fila. Las nueve de
        // indicadores comparten `contenidoId` y difieren en el área, así que el par las
        // distingue; para las de cargo, el cargo.
        const ya = await tx.obligacion.findFirst({
          where: {
            contenidoId,
            alcance: o.alcance,
            alcanceAreaId: alcanceAreaId ?? null,
            alcanceCargoId: alcanceCargoId ?? null,
          },
          select: { id: true },
        });
        if (ya) {
          obligacionesYaExistian += 1;
          continue;
        }

        // §8 criterio 6 · las mismas guardas que `crearObligacion`, desde el módulo puro.
        const datos = {
          contenidoId,
          alcance: o.alcance,
          alcanceAreaId,
          alcanceCargoId,
          periodicidad: o.periodicidad,
          fechaInicio: o.fechaInicio,
          plazoDias: o.plazoDias,
          diasAviso: o.diasAviso,
          notificar: o.notificar,
          responsableSeguimientoId: katherine,
        };
        const errores = validarDatosObligacion(datos);
        if (errores.length > 0) {
          throw new Error(
            `Obligaciones · ${o.clave} (fila ${o.filaCron} del cronograma) no pasa las ` +
              `guardas de crearObligacion: ${errores.join('. ')}.`,
          );
        }

        const creada = await tx.obligacion.create({
          data: {
            contenidoId,
            alcance: o.alcance,
            alcanceAreaId: alcanceAreaId ?? null,
            alcanceCargoId: alcanceCargoId ?? null,
            periodicidad: o.periodicidad,
            fechaInicio: o.fechaInicio,
            plazoDias: o.plazoDias,
            diasAviso: o.diasAviso,
            anclaje: o.anclaje,
            // Son numerales de ISO 9001, no controles del Anexo A de 27001.
            controlAnexoA: null,
            esProveedor: o.esProveedor,
            notificar: o.notificar,
            activa: o.activa,
            responsableSeguimientoId: katherine,
          },
        });
        await registrarAlta({ bitacora: tx.bitacora }, USUARIO, 'obligacion', String(creada.id));
        obligacionesCreadas += 1;
      }
    },
    // 22 contenidos + 22 versiones + 27 obligaciones + su bitácora, con lecturas de catálogo
    // en medio. El default de 5 s no alcanza en un arranque frío.
    { timeout: 120_000 },
  );

  const { contextosCreados, contextosActualizados } = await sembrarContexto(prisma, daniel);
  const totales = await medir(prisma);

  return {
    cargosCreados,
    contenidosCreados,
    contenidosYaExistian,
    versionesCreadas,
    obligacionesCreadas,
    obligacionesYaExistian,
    contextosCreados,
    contextosActualizados,
    totales,
  };
}

// ─── Paso 4 · la cabecera del DOFA y del PESTEL ───────────────────────────────────────────

/// §6 · dos filas y **cero entradas**. `Aprobación PESTEL.docx` prueba que el análisis existe
/// y fue aprobado el 22/04/2026; no contiene una sola casilla. Sembrar entradas inventadas
/// sería falsificar el análisis de contexto de la organización.
const CONTEXTOS = [
  { tipo: 'DOFA' as const, anio: 2026 },
  { tipo: 'PESTEL' as const, anio: 2026 },
];

const ACTA_CONTEXTO = 'Aprobación PESTEL_DOFA 2026';
const FECHA_APROBACION = new Date('2026-04-22T00:00:00.000Z');

async function sembrarContexto(
  prisma: PrismaClient,
  aprobadoPorId: number,
): Promise<{ contextosCreados: number; contextosActualizados: number }> {
  let contextosCreados = 0;
  let contextosActualizados = 0;

  for (const c of CONTEXTOS) {
    const ya = await prisma.analisisContexto.findFirst({
      where: { tipo: c.tipo, anio: c.anio },
      select: {
        id: true,
        fechaAprobacion: true,
        actaReferencia: true,
        aprobadoPorId: true,
        vigente: true,
      },
    });

    if (!ya) {
      await prisma.$transaction(async (tx) => {
        const creado = await tx.analisisContexto.create({
          data: {
            tipo: c.tipo,
            anio: c.anio,
            fechaAprobacion: FECHA_APROBACION,
            actaReferencia: ACTA_CONTEXTO,
            aprobadoPorId,
            vigente: true,
          },
        });
        await registrarAlta({ bitacora: tx.bitacora }, USUARIO, 'analisis_contexto', String(creado.id));
      });
      contextosCreados += 1;
      continue;
    }

    // Ya existe, y `prisma/seeds/demo.ts` la dejó con 2026-01-15 y sin aprobador. El §6 fija
    // 2026-04-22 aprobado por Daniel Medina, con su acta. Se CORRIGE en vez de agregar una
    // segunda: dos DOFA de 2026 serían dos respuestas a «cuál es el análisis vigente».
    const cambios = [
      {
        tabla: 'analisis_contexto',
        registroId: String(ya.id),
        campo: 'fecha_aprobacion',
        anterior: ya.fechaAprobacion,
        nuevo: FECHA_APROBACION,
      },
      {
        tabla: 'analisis_contexto',
        registroId: String(ya.id),
        campo: 'acta_referencia',
        anterior: ya.actaReferencia,
        nuevo: ACTA_CONTEXTO,
      },
      {
        tabla: 'analisis_contexto',
        registroId: String(ya.id),
        campo: 'aprobado_por',
        anterior: ya.aprobadoPorId,
        nuevo: aprobadoPorId,
      },
    ];

    const escritas = await prisma.$transaction(async (tx) => {
      await tx.analisisContexto.update({
        where: { id: ya.id },
        data: {
          fechaAprobacion: FECHA_APROBACION,
          actaReferencia: ACTA_CONTEXTO,
          aprobadoPorId,
          vigente: true,
        },
      });
      return registrar({ bitacora: tx.bitacora }, USUARIO, [
        ...cambios.map((x) => ({
          ...x,
          motivo:
            'REQ-SIG-17 §6 · el acta de aprobación es del 22/04/2026 (Aprobación PESTEL.docx), ' +
            'no la fecha con la que la fila fue sembrada',
        })),
      ]);
    });
    // `registrar()` filtra lo que no cambió, así que cero filas significa que ya estaba bien.
    if (escritas > 0) contextosActualizados += 1;
  }

  return { contextosCreados, contextosActualizados };
}

// ─── Las cifras del §8 ────────────────────────────────────────────────────────────────────

async function medir(prisma: PrismaClient): Promise<ResumenObligaciones['totales']> {
  const [
    contenidos,
    obligaciones,
    obligacionesActivas,
    porPeriodicidad,
    porAlcance,
    conFechaAnterior,
    esProveedor,
    analisisContexto,
    entradaContexto,
    asignaciones,
    hallazgos,
  ] = await Promise.all([
    prisma.contenidoSig.count(),
    prisma.obligacion.count(),
    prisma.obligacion.count({ where: { activa: true } }),
    prisma.obligacion.groupBy({ by: ['periodicidad'], _count: { _all: true } }),
    prisma.obligacion.groupBy({ by: ['alcance'], _count: { _all: true } }),
    prisma.obligacion.count({ where: { fechaInicio: { lt: new Date('2026-09-01T00:00:00.000Z') } } }),
    prisma.obligacion.count({ where: { esProveedor: true } }),
    prisma.analisisContexto.count(),
    prisma.entradaContexto.count(),
    prisma.asignacion.count(),
    prisma.hallazgo.count(),
  ]);

  // §8 criterio 4 · las NUEVE de indicadores comparten `contenidoId`. Se acota por el título
  // del contenido y no por `alcance: 'AREA'` a secas: hay otras obligaciones por área —la de
  // satisfacción del cliente, y las que `prisma/seeds/demo.ts` haya dejado— y contarlas todas
  // juntas devolvía 3 y hacía parecer que las nueve NO compartían contenido.
  const deIndicadores = await prisma.obligacion.findMany({
    where: { alcance: 'AREA', contenido: { titulo: TITULO_INDICADORES } },
    select: { contenidoId: true },
  });

  return {
    contenidos,
    obligaciones,
    obligacionesActivas,
    porPeriodicidad: Object.fromEntries(
      porPeriodicidad.map((p) => [p.periodicidad, p._count._all]),
    ),
    porAlcance: Object.fromEntries(porAlcance.map((p) => [p.alcance, p._count._all])),
    contenidosDeIndicadores: new Set(deIndicadores.map((o) => o.contenidoId)).size,
    conFechaAnterior,
    esProveedor,
    analisisContexto,
    entradaContexto,
    asignaciones,
    hallazgos,
  };
}
