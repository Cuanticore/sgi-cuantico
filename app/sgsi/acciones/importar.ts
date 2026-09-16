'use server';

// app/sgsi/acciones/importar.ts
//
// Bulk asset import from the template.
//
// Two actions, one reader. ANALYSE parses and validates without touching anything and
// hands back a row-by-row verdict; IMPORT parses THE SAME FILE AGAIN and writes only what
// validates. Sending the parsed rows back from the browser would have been cheaper and
// wrong: the client can put anything in that payload, including area and subtype ids that
// never appeared in the file.
//
// This module is IO only — open the workbook, load the catalogues, write the rows. What a
// row MEANS lives in lib/sgsi/plantilla-lectura.ts, pure and unit-tested.
//
// The write is one transaction. A partially imported inventory is worse than none: the
// figures look plausible and the missing rows are invisible.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrarAlta } from '@/lib/sgsi/bitacora';
import { generarRiesgos } from '@/lib/sgsi/riesgos';
import {
  COLUMNAS_PLANTILLA,
  TOPE_ARCHIVO,
  type Analisis,
  type FilaLeida,
  type OpcionesCatalogo,
} from '@/lib/sgsi/plantilla';
import { leerFilas, esFormatoLegacy, claveLegacy, LEGACY_NORMALIZAR, type Catalogos, type FilaResuelta } from '@/lib/sgsi/plantilla-lectura';
import { diagnosticoDeFormato, type Sustitucion } from '@/lib/sgsi/consolidado';
import {
  CATALOGOS_CURABLES,
  esCreable,
  indiceDeAlias,
  problemasDeResoluciones,
  type CatalogoCurable,
  type FaltanteCatalogo,
  type Resolucion,
} from '@/lib/sgsi/catalogos-curables';
import {
  conteoDeCodigos,
  encabezadoDeMatriz,
  hojasDelLibro,
  ultimaFilaConDatos,
} from '@/lib/sgsi/consolidado-libro';
import { escribirPlan, planificarCarga, type PlanDeCarga } from '@/lib/sgsi/consolidado-carga';
import type { CatalogosConsolidado } from '@/lib/sgsi/consolidado-lectura';
import { autorConPermiso, ejecutar, type Resultado } from './sesion';

/// Batch entry: each line, or each `;`-separated fragment, becomes one evidence entry.
/// Batch entry: each line, or each `;`-separated fragment, becomes one evidence entry.
import type ExcelJS from 'exceljs';
import type { Prisma } from '@prisma/client';

/// Something wrong with the FILE, not with the code: a message the person can act on.
class PlantillaError extends Error {}

/// Aborta la transacción cuando, ya creados los catálogos, no queda ni una fila que escribir.
///
/// Es un throw y no un `return` porque sólo revirtiendo la transacción desaparecen los
/// cargos y proveedores recién insertados. Sin esto quedarían registrados para una
/// importación que no ocurrió, y nadie va a salir a buscarlos después.
class SinFilasTrasResolver extends Error {}

/// Flattens a cell to text. ExcelJS hands back objects for rich text, formulas and
/// hyperlinks, and a "[object Object]" in a preview table tells nobody anything.
function texto(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join('').trim();
    if (typeof o.text === 'string') return o.text.trim();
    if (o.result !== undefined && o.result !== null) return String(o.result).trim();
    return '';
  }
  return String(v).trim();
}

async function catalogos(): Promise<Catalogos> {
  const [tipos, subtipos, areas, cargos, ubicaciones, entornos, proveedores, escala, existentes] =
    await Promise.all([
      prisma.tipoMagerit.findMany({ where: { activo: true }, select: { id: true, codigo: true } }),
      prisma.subtipoMagerit.findMany({
        where: { activo: true },
        select: { id: true, tipoId: true, codigo: true },
      }),
      prisma.area.findMany({ where: { activa: true }, select: { id: true, nombre: true } }),
      // Retirados incluidos a propósito: los valores que la organización retiró de los
      // desplegables (p. ej. «Nube», «Jhon Tamayo», nombres de área como custodio)
      // siguen explicando los registros vigentes y son legítimos en una importación
      // del formato histórico FOR-SIG-12. El desplegable — y el exportador — solo
      // ofrecen los activos.
      prisma.cargoResponsable.findMany({ select: { id: true, nombre: true } }),
      prisma.ubicacion.findMany({ select: { id: true, nombre: true } }),
      prisma.entorno.findMany({ select: { id: true, nombre: true } }),
      prisma.proveedor.findMany({ select: { id: true, nombre: true } }),
      prisma.escalaValor.findMany({
        orderBy: { orden: 'asc' },
        select: { valor: true, etiqueta: true },
      }),
      prisma.activo.findMany({
        where: { codigoHeredado: { not: null } },
        select: { codigoHeredado: true },
      }),
    ]);

  return {
    tipos,
    subtipos,
    areas,
    cargos,
    ubicaciones,
    entornos,
    proveedores,
    escala,
    heredadosExistentes: new Set(
      existentes.map((a) => (a.codigoHeredado ?? '').trim().toLowerCase()),
    ),
  };
}

/// Abre el archivo subido como workbook, o falla con algo que la persona pueda accionar.
///
/// Separado de `abrir` porque el Consolidado V19 necesita CUATRO hojas y no una matriz en
/// orden de plantilla: el libro entero se lee una vez y cada camino toma lo suyo.
async function abrirWorkbook(datos: FormData): Promise<ExcelJS.Workbook> {
  const archivo = datos.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) {
    throw new PlantillaError('Elegí el archivo de la plantilla.');
  }
  if (archivo.size > TOPE_ARCHIVO) {
    throw new PlantillaError(
      `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el tope es 8 MB. ¿Es la plantilla correcta?`,
    );
  }
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await archivo.arrayBuffer());
    return wb;
  } catch (error) {
    throw new PlantillaError(
      'No pude abrir el archivo como Excel. Guardalo en formato .xlsx desde la plantilla y volvé a intentar. ' +
        (error instanceof Error ? `(${error.message})` : ''),
    );
  }
}

/// Reduce el archivo a una matriz de texto en orden de columnas de la plantilla.
/// Dos formatos aceptados:
///   1. Nuestra plantilla (hoja «Activos», encabezado fila 1, 17 columnas).
///   2. El formato histórico FOR-SIG-12 (hoja «1. Matriz de Activos», encabezado en la
///      fila 7 con B..U, títulos arriba) — se alinea columna por columna.
async function abrir(datos: FormData): Promise<{ matriz: string[][]; filaDeEncabezado: number }> {
  const wb = await abrirWorkbook(datos);
  const hoja = wb.getWorksheet('Activos') ?? wb.worksheets[0];
  if (!hoja) throw new PlantillaError('El archivo no tiene ninguna hoja con datos.');

  const texto = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
      if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join('').trim();
      if (typeof o.text === 'string') return o.text.trim();
      if (o.result !== undefined && o.result !== null) return String(o.result).trim();
      return '';
    }
    return String(v).trim();
  };

  const LEGACY_ABC = 'sgsi/legacy';

  // --- Formato heredado FOR-SIG-12 -------------------------------------------------
  // El workbook histórico trae el Instructivo PRIMERO, el Dashboard en segundo y la
  // «Matriz de Activos» después. Se busca el encabezado legacy en TODAS las hojas
  // (primeras 12 filas de cada una); la hoja que lo tenga es la de datos.
  let legacy: { hoja: typeof hoja; fila: number } | null = null;
  for (const hoja2 of wb.worksheets) {
    for (let n = 1; n <= Math.min(12, hoja2.rowCount); n++) {
      const cruda = hoja2.getRow(n);
      const fila: string[] = [];
      for (let c = 1; c <= Math.max(hoja2.columnCount, 21); c++) {
        fila.push(texto(cruda.getCell(c).value));
      }
      if (esFormatoLegacy(fila)) {
        legacy = { hoja: hoja2, fila: n };
        break;
      }
    }
    if (legacy) break;
  }

  if (legacy) {
    const { hoja: hojaDatos, fila: filaEncabezado } = legacy;
    const anchoLegacy = Math.max(hojaDatos.columnCount, 21);
    const orden = COLUMNAS_PLANTILLA.map((col) => col.clave);
    const filaCruda: string[] = [];
    for (let c = 1; c <= anchoLegacy; c++) {
      filaCruda.push(texto(hojaDatos.getRow(filaEncabezado).getCell(c).value));
    }
    const indiceClave = new Map<string, number>();
    for (let c = 0; c < filaCruda.length; c++) {
      const clave = claveLegacy(filaCruda[c]);
      if (clave && !indiceClave.has(clave)) indiceClave.set(clave, c);
    }
    const normalizar = (clave: string, v: string): string => {
      const mapa = (clave === 'ubicacion' || clave === 'entorno' || clave === 'proveedor' || clave === 'area')
        ? (LEGACY_NORMALIZAR[clave] as Record<string, string>)
        : {};
      return mapa[v] ?? v;
    };
    const matrizLegacy: string[][] = [orden.map(() => '')];
    // Hasta la última fila CON DATOS, no hasta `rowCount`: el V21 declara 1.048.277 filas
    // para 94 activos porque le dieron formato a columnas enteras, y acumular una fila por
    // vuelta hasta ahí agota la memoria del proceso antes de leer el primer activo.
    const ultimaLegacy = ultimaFilaConDatos(hojaDatos, anchoLegacy);
    for (let filaDatos = filaEncabezado + 1; filaDatos <= ultimaLegacy; filaDatos++) {
      const cruda2 = hojaDatos.getRow(filaDatos);
      const celdas: string[] = [];
      for (const clave of orden) {
        const idx = indiceClave.get(clave);
        if (idx === undefined) {
          celdas.push('');
          continue;
        }
        celdas.push(normalizar(clave, texto(cruda2.getCell(idx + 1).value)));
      }
      matrizLegacy.push(celdas);
    }
    void LEGACY_ABC;
    // El encabezado del FOR-SIG-12 historico esta en la fila 7, no en la 1: sin decirlo, el
    // parte numeraria las filas corridas seis lugares.
    return { matriz: matrizLegacy, filaDeEncabezado: filaEncabezado };
  }

  const matriz: string[][] = [];
  // Mismo corte que el camino legacy, por la misma razón.
  const ultima = ultimaFilaConDatos(hoja, COLUMNAS_PLANTILLA.length);
  for (let n = 1; n <= ultima; n++) {
    const cruda = hoja.getRow(n);
    matriz.push(COLUMNAS_PLANTILLA.map((_, i) => texto(cruda.getCell(i + 1).value)));
  }
  // La plantilla que genera la aplicación trae el encabezado arriba de todo.
  return { matriz, filaDeEncabezado: 1 };
}

/// La rama Nivel 1 → Nivel 2 → Nivel 3 del libro, resuelta al id del GRADO 3.
///
/// E1 · es una jerarquia de verdad, no tres columnas sueltas: cada grado se busca DENTRO de
/// su padre, asi que dos ramas distintas pueden tener un «Ambientes» cada una sin
/// confundirse. Se reutiliza lo que ya exista y solo se crea lo que falta — dos activos de
/// la misma rama no pueden fabricar dos jerarquias paralelas.
///
/// `null` cuando la rama esta incompleta. Un activo sin nivel 3 queda «sin ubicar», que es
/// un estado legitimo del inventario; inventarle un grado 3 llamado como su grado 2 seria
/// escribir una afirmacion que nadie hizo.
async function idDeNivel3(
  tx: Prisma.TransactionClient,
  n1: string,
  n2: string,
  n3: string,
): Promise<number | null> {
  const nombres = [n1.trim(), n2.trim(), n3.trim()];
  if (nombres.some((n) => n === '')) return null;

  let padreId: number | null = null;
  for (let grado = 1; grado <= 3; grado++) {
    const nombre = nombres[grado - 1];
    // Anotados a mano: sin esto TypeScript entra en un ciclo de inferencia — el tipo de la
    // consulta depende de `padreId` y `padreId` se reasigna con el resultado.
    const existente: { id: number } | null = await tx.nivelActivo.findFirst({
      where: { grado, nombre, padreId },
      select: { id: true },
    });
    if (existente) {
      padreId = existente.id;
      continue;
    }
    const creado: { id: number } = await tx.nivelActivo.create({
      // `clase` solo va en el grado 1: un grado 2 o 3 la hereda de su raiz, y guardarla otra
      // vez permitiria que un hijo contradijera a su padre.
      data: { grado, nombre, padreId },
      select: { id: true },
    });
    padreId = creado.id;
  }
  return padreId;
}

async function leer(
  datos: FormData,
  resoluciones: Resolucion[] = [],
): Promise<{
  filas: FilaLeida[];
  resueltas: FilaResuelta[];
  faltantes: FaltanteCatalogo[];
  matriz: string[][];
  filaDeEncabezado: number;
  catalogo: Catalogos;
}> {
  const [libro, base] = await Promise.all([abrir(datos), catalogos()]);
  const { matriz, filaDeEncabezado } = libro;
  const catalogo: Catalogos = { ...base, alias: indiceDeAlias(resoluciones) };
  const lectura = leerFilas(matriz, catalogo, filaDeEncabezado);
  if (lectura.filas.length === 0) {
    throw new PlantillaError(
      'No encontré filas con datos. Revisa que hayas llenado la hoja «Activos» y que quede algo más que la fila de ejemplo.',
    );
  }
  return { ...lectura, matriz, filaDeEncabezado, catalogo };
}

/// Las decisiones que la persona tomó sobre los faltantes, tal como viajan en el formulario.
///
/// Se validan acá y no en la pantalla: una server action es una frontera de confianza, y lo
/// que llega por `FormData` puede no venir de la pantalla. Un cuerpo mal formado no es un
/// error del sistema — es una petición que se descarta sin decisiones.
function resolucionesDe(datos: FormData): Resolucion[] {
  const crudo = datos.get('resoluciones');
  if (typeof crudo !== 'string' || crudo.trim() === '') return [];

  let leido: unknown;
  try {
    leido = JSON.parse(crudo);
  } catch {
    return [];
  }
  if (!Array.isArray(leido)) return [];

  const salida: Resolucion[] = [];
  for (const r of leido) {
    if (typeof r !== 'object' || r === null) continue;
    const { catalogo, valor, accion, destino, nombre: nombreCrudo } = r as Record<
      string,
      unknown
    >;
    const r2 = { nombre: nombreCrudo };
    if (typeof catalogo !== 'string' || typeof valor !== 'string') continue;
    if (!(CATALOGOS_CURABLES as readonly string[]).includes(catalogo)) continue;
    const c = catalogo as CatalogoCurable;
    if (accion === 'crear') {
      // Sin `nombre` se registra lo que dice el libro. Es el caso normal: sólo se corrige
      // cuando el libro trae el nombre mal escrito.
      const nombre =
        typeof r2.nombre === 'string' && r2.nombre.trim() !== '' ? r2.nombre : valor;
      salida.push({ catalogo: c, valor, accion: 'crear', nombre });
    }
    else if (accion === 'mapear' && typeof destino === 'string') {
      salida.push({ catalogo: c, valor, accion: 'mapear', destino });
    }
  }
  return salida;
}

/// Los nombres vigentes de cada catálogo curable, para el selector de «mapear a».
function opcionesDe(catalogo: Catalogos): OpcionesCatalogo {
  const ordenar = (xs: { nombre: string }[]) =>
    xs.map((x) => x.nombre).sort((a, b) => a.localeCompare(b, 'es'));
  return {
    cargo: ordenar(catalogo.cargos),
    proveedor: ordenar(catalogo.proveedores),
    ubicacion: ordenar(catalogo.ubicaciones),
    entorno: ordenar(catalogo.entornos),
    area: ordenar(catalogo.areas),
  };
}

/// Inserta lo que la persona marcó para crear y devuelve el catálogo con esas filas dentro.
///
/// Corre DENTRO de la transacción de la importación a propósito. Crear los catálogos aparte
/// y escribir después deja cargos y proveedores huérfanos si la carga falla: inventados para
/// una importación que no ocurrió, y que nadie va a salir a buscar.
async function crearFaltantes(
  tx: Prisma.TransactionClient,
  base: Catalogos,
  resoluciones: readonly Resolucion[],
): Promise<Catalogos> {
  const aumentado: Catalogos = {
    ...base,
    cargos: [...base.cargos],
    proveedores: [...base.proveedores],
    ubicaciones: [...base.ubicaciones],
    entornos: [...base.entornos],
  };

  for (const r of resoluciones) {
    if (r.accion !== 'crear' || !esCreable(r.catalogo)) continue;
    // El nombre decidido, que puede diferir del texto del libro cuando éste venía mal
    // escrito. La fila lo encuentra igual: `indiceDeAlias` traduce el uno al otro.
    const nombre = r.nombre.trim();

    if (r.catalogo === 'cargo') {
      // `orden` va al final de la lista: la organización decide después dónde ubicarlo, y
      // los dos flags quedan en su default —ofrecido como propietario y como custodio—
      // porque la aplicación no puede saber cuál de los dos es. Esa es su decisión.
      const ultimo = await tx.cargoResponsable.aggregate({ _max: { orden: true } });
      const creado = await tx.cargoResponsable.create({
        data: { nombre, orden: (ultimo._max.orden ?? 0) + 1 },
        select: { id: true, nombre: true },
      });
      aumentado.cargos.push(creado);
      continue;
    }

    if (r.catalogo === 'proveedor') {
      const creado = await tx.proveedor.create({
        data: { nombre },
        select: { id: true, nombre: true },
      });
      aumentado.proveedores.push(creado);
      continue;
    }

    if (r.catalogo === 'ubicacion') {
      const creado = await tx.ubicacion.create({
        data: { nombre },
        select: { id: true, nombre: true },
      });
      aumentado.ubicaciones.push(creado);
      continue;
    }

    const creado = await tx.entorno.create({
      data: { nombre },
      select: { id: true, nombre: true },
    });
    aumentado.entornos.push(creado);
  }

  return aumentado;
}

// ─── El Consolidado de Activos V19 (REQ-SIG-12) ────────────────────────────────────────
//
// **Este camino se decide ANTES que el histórico, y ahí está todo el asunto.** V19 cumple
// `esFormatoLegacy` —trae «Código», «Proceso o Área», «Custodio» y «Valor en
// Disponibilidad»— así que sin esta bifurcación entraría por el lector viejo, que mapea el
// código del libro a `codigoHeredado` y emite uno nuevo desde `ContadorCodigo`. Con eso, los
// 297 activos entran renombrados y las 40 dependencias, los 129 despliegues y las 720
// aristas del grafo quedan apuntando a la nada. En silencio.

/// Los catálogos que el consolidado necesita, que son los del importador más el `prefijo`
/// del área y la `abreviatura` del tipo: `ContadorCodigo` se indexa por (área, tipo), y la
/// serie del código viene como texto (§5.7).
async function catalogosDelConsolidado(): Promise<CatalogosConsolidado> {
  const [tipos, subtipos, areas, cargos, ubicaciones, entornos, proveedores, escala, criticidades] =
    await Promise.all([
      prisma.tipoMagerit.findMany({
        where: { activo: true },
        select: { id: true, codigo: true, abreviatura: true },
      }),
      prisma.subtipoMagerit.findMany({
        where: { activo: true },
        select: { id: true, tipoId: true, codigo: true },
      }),
      prisma.area.findMany({
        where: { activa: true },
        select: { id: true, nombre: true, prefijo: true },
      }),
      // Los cargos retirados entran a propósito, igual que en el camino histórico: un valor
      // que la organización sacó del desplegable sigue explicando los registros vigentes.
      prisma.cargoResponsable.findMany({ select: { id: true, nombre: true } }),
      prisma.ubicacion.findMany({ select: { id: true, nombre: true } }),
      prisma.entorno.findMany({ select: { id: true, nombre: true } }),
      prisma.proveedor.findMany({ select: { id: true, nombre: true } }),
      prisma.escalaValor.findMany({
        orderBy: { orden: 'asc' },
        select: { valor: true, etiqueta: true },
      }),
      // REQ-SIG-20 §11 (P9) · contra qué resuelve la columna 26. Los niveles retirados NO
      // entran a propósito: `CriticidadNegocio` es un catálogo fijo de cinco filas, no un
      // desplegable curable, así que no hay un "retirado" legítimo que preservar aquí como
      // sí lo hay para cargos o proveedores.
      prisma.criticidadNegocio.findMany({
        where: { activo: true },
        select: { id: true, codigo: true, nombre: true },
      }),
    ]);
  return { tipos, subtipos, areas, cargos, ubicaciones, entornos, proveedores, escala, criticidades };
}

/// El plan del consolidado, o `null` si este libro no es el consolidado.
///
/// Un `CONSOLIDADO_INCOMPLETO` **no cae al camino histórico**: falla. Un archivo que trae
/// las hojas del consolidado se armó para ser el consolidado, y para ese archivo el otro
/// camino es el destructivo — le reescribiría los códigos. La respuesta correcta a «le falta
/// la columna Nivel 3» es decirlo, no elegir el camino que rompe.
async function planDelConsolidado(
  wb: ExcelJS.Workbook,
): Promise<{ plan: PlanDeCarga; catalogos: CatalogosConsolidado } | null> {
  const diagnostico = diagnosticoDeFormato(
    encabezadoDeMatriz(wb),
    wb.worksheets.map((w) => w.name),
    conteoDeCodigos(wb),
  );
  // `ALTAS` tiene la forma del consolidado pero sus filas llegan sin codigo: son activos
  // que se inventarian por primera vez, no un inventario que sustituya al cargado. Se
  // devuelve `null` para que caiga al camino ADITIVO, que emite cada codigo desde
  // `ContadorCodigo` — y, sobre todo, que no vacia `activo` antes de escribir.
  if (diagnostico.formato === 'ALTAS') return null;
  if (diagnostico.formato === 'HISTORICO') return null;
  if (diagnostico.formato === 'CONSOLIDADO_INCOMPLETO') {
    throw new PlantillaError(
      'Este archivo parece el Consolidado de Activos pero le falta ' +
        `${diagnostico.faltantes.join(', ')}. No lo cargo como formato histórico porque eso le ` +
        'reescribiría los códigos y rompería las dependencias, los despliegues y el grafo.',
    );
  }

  const hojas = hojasDelLibro(wb);
  if (!hojas) {
    throw new PlantillaError(
      'El Consolidado necesita las hojas «Matriz de Activos», «Dependencias» y «Detalle de ambiente».',
    );
  }
  const catalogos = await catalogosDelConsolidado();
  return { plan: planificarCarga(hojas, catalogos), catalogos };
}

/// El parte del consolidado, traducido a las `filas` que la pantalla ya sabe dibujar.
///
/// Una línea por cada fila con algo que decir, con su hoja adelante: la tabla de la revisión
/// muestra hoja, referencia y motivo sin que la pantalla tenga que aprender cuatro formas
/// distintas de fila.
function filasDelParte(plan: PlanDeCarga): FilaLeida[] {
  const filas: FilaLeida[] = [];
  for (const b of plan.bloques) {
    for (const r of b.rechazadas) {
      filas.push({
        fila: r.fila,
        lectura: { hoja: b.hoja, bloque: b.titulo, referencia: r.referencia },
        errores: [r.mensaje],
      });
    }
    for (const a of b.avisos) {
      filas.push({
        fila: a.fila,
        lectura: { hoja: b.hoja, bloque: b.titulo, referencia: a.referencia, aviso: a.mensaje },
        errores: [],
      });
    }
  }
  return filas;
}

/// Cuenta lo que la carga va a borrar, para decirlo ANTES de pedir confirmación.
///
/// `riesgosConDecision` se cuenta aparte del total a propósito: los derivados los regenera
/// `generarRiesgos` sin esfuerzo, pero un tratamiento, un estado, un responsable, una
/// observación, una justificación o una exclusión manual son trabajo humano del SGSI y no
/// vuelven de ningún cálculo.
async function contarLoQueSeBorra(): Promise<Sustitucion> {
  const [
    activos,
    valoraciones,
    riesgos,
    riesgosConDecision,
    dependencias,
    despliegues,
    actasBorrado,
    activosAfectados,
    asignaciones,
  ] = await Promise.all([
    prisma.activo.count(),
    prisma.activoValor.count(),
    prisma.riesgo.count(),
    prisma.riesgo.count({
      where: {
        OR: [
          { tratamientoId: { not: null } },
          { estadoId: { not: null } },
          { responsableId: { not: null } },
          { observacion: { not: null } },
          { justificacion: { not: null } },
          { excluidoManual: true },
        ],
      },
    }),
    prisma.dependenciaActivo.count(),
    prisma.despliegue.count(),
    prisma.actaBorradoActivo.count(),
    prisma.activoAfectado.count(),
    prisma.asignacion.count({ where: { activoId: { not: null } } }),
  ]);
  return {
    activos,
    valoraciones,
    riesgos,
    riesgosConDecision,
    dependencias,
    despliegues,
    actasBorrado,
    activosAfectados,
    asignaciones,
  };
}

function resumenDelPlan(plan: PlanDeCarga): string {
  const conPadre = plan.despliegues.filter((d) => d.activoCodigo !== null).length;
  return (
    `Consolidado de Activos V19: ${plan.activos.length} activos, ` +
    `${plan.niveles.length} niveles en 3 grados, ${plan.aristas.length} dependencias y ` +
    `${plan.despliegues.length} despliegues (${conPadre} con activo padre, ` +
    `${plan.despliegues.length - conPadre} pendientes de asociar).`
  );
}

/// Dry run: reads the file, validates it and writes nothing.
export async function analizarPlantilla(datos: FormData): Promise<Analisis> {
  const vacio: Analisis = { ok: false, mensaje: '', filas: [], validas: 0, conErrores: 0 };
  try {
    await autorConPermiso('sgsi:escribir');

    const wb = await abrirWorkbook(datos);
    const consolidado = await planDelConsolidado(wb);
    if (consolidado) {
      const { plan } = consolidado;
      const filas = filasDelParte(plan);
      const rechazadas = plan.bloques.reduce((n, b) => n + b.rechazadas.length, 0);
      const sustitucion = await contarLoQueSeBorra();
      return {
        ok: true,
        mensaje: `${resumenDelPlan(plan)} SUSTITUYE al inventario actual: se borran ${sustitucion.activos} activos y todo lo que cuelga de ellos.`,
        filas,
        validas: plan.activos.length,
        conErrores: rechazadas,
        consolidado: {
          bloques: plan.bloques,
          criterios: [],
          seriesSinContador: plan.seriesSinContador,
          sustitucion,
        },
      };
    }

    const resoluciones = resolucionesDe(datos);
    const { filas, resueltas, faltantes, catalogo } = await leer(datos, resoluciones);
    const conErrores = filas.length - resueltas.length;

    // Los faltantes de catálogo se cuentan aparte del resumen de filas porque no son un
    // defecto del libro: son decisiones pendientes. Decir «12 filas tienen algo que
    // corregir» cuando lo único que pasa es que falta registrar un cargo manda a la persona
    // a revisar doce filas que están bien.
    const pendientes = faltantes.length;
    const resumen =
      conErrores === 0
        ? `${resueltas.length} ${resueltas.length === 1 ? 'fila lista' : 'filas listas'} para importar.`
        : `${resueltas.length} de ${filas.length} filas están listas. Las otras ${conErrores} tienen algo que corregir y no se van a importar.`;

    return {
      ok: true,
      mensaje:
        pendientes === 0
          ? resumen
          : `${resumen} Antes hay que decidir qué hacer con ${pendientes} ${pendientes === 1 ? 'nombre que el catálogo no tiene' : 'nombres que el catálogo no tiene'}.`,
      filas,
      validas: resueltas.length,
      conErrores,
      faltantes,
      opciones: opcionesDe(catalogo),
    };
  } catch (error) {
    if (error instanceof PlantillaError) return { ...vacio, mensaje: error.message };
    console.error('[sgsi] no se pudo analizar la plantilla', error);
    return {
      ...vacio,
      mensaje: error instanceof Error ? error.message : 'No se pudo leer la plantilla.',
    };
  }
}

/// Escribe el Consolidado V19 en el orden del §5, en una transacción, y regenera los riesgos.
async function cargarConsolidadoV19(plan: PlanDeCarga, autor: string): Promise<Resultado> {
  if (plan.activos.length === 0) {
    return {
      ok: false,
      mensaje: 'Ninguna fila de la Matriz de Activos pasó la validación, así que no importé nada.',
    };
  }

  const [dimensiones, escala] = await Promise.all([
    prisma.dimension.findMany({ select: { codigo: true, id: true } }),
    prisma.escalaValor.findMany({ select: { valor: true, id: true } }),
  ]);
  const porCodigoDim = new Map(dimensiones.map((d) => [d.codigo, d.id]));
  const porValor = new Map(escala.map((e) => [e.valor, e.id]));

  await prisma.$transaction(
    async (tx) => {
      await escribirPlan(tx, plan, porCodigoDim, porValor);
      // Una sola entrada de bitácora y no 297: el hecho auditable es la carga del libro, no
      // cada fila. Con una por activo, la bitácora de ese día no dejaría ver nada más.
      await registrarAlta(tx, autor, 'activo', `consolidado V19 · ${plan.activos.length} activos`);
    },
    {
      // El bucle hace dos consultas por activo más los niveles, así que 297 filas son
      // ~700 viajes. Los 5 s por omisión de Prisma abortarían una carga perfectamente
      // válida por reloj y lo reportarían como un problema de los datos.
      maxWait: 15_000,
      timeout: 180_000,
    },
  );

  // DE ACÁ EN ADELANTE EL INVENTARIO ESTÁ COMPROMETIDO. Lo que falle abajo es un fallo al
  // TERMINAR, nunca al guardar, y no se puede reportar como tal: a quien le dicen «no se
  // pudo importar» lo obvio es volver a importar, y esta carga borra el inventario primero.
  const cabecera = resumenDelPlan(plan);

  let riesgos = 0;
  let cola = '';
  try {
    // §5.8 · sólo sobre activos. Un despliegue no es un activo y no genera riesgos (E5).
    const diagnostico = await generarRiesgos(prisma);
    riesgos = diagnostico.riesgosGenerados;
    cola =
      ` El análisis quedó con ${diagnostico.riesgosGenerados} riesgos vigentes sobre ` +
      `${diagnostico.activosEnAnalisis} activos que alcanzan el umbral.`;
  } catch (error) {
    console.error('[sgsi] el consolidado se cargó pero falló la generación de riesgos', error);
    cola =
      ' PERO no se pudo recalcular el conjunto de riesgos: ' +
      `${error instanceof Error ? error.message : 'error desconocido'}. ` +
      'El inventario YA está guardado — no vuelvas a importar el archivo.';
  }
  void riesgos;

  try {
    for (const ruta of [
      '/',
      '/sgsi',
      '/sgsi/inventario',
      '/sgsi/matrices',
      '/sgsi/planes',
      '/tecnologia/grafo',
      '/tecnologia/mapa',
      '/tecnologia/dependencias',
    ]) {
      revalidatePath(ruta);
    }
  } catch (error) {
    console.error('[sgsi] el consolidado se cargó pero falló revalidatePath', error);
  }

  const sinContador =
    plan.seriesSinContador.length === 0
      ? ''
      : ` ${plan.seriesSinContador.length} series del libro no tienen par (área, tipo) en los ` +
        'catálogos y no se les pudo sembrar contador; la app tampoco puede emitir esos códigos, ' +
        'así que no hay riesgo de repetirlos.';

  return { ok: true, mensaje: cabecera + cola + sinContador, cambios: plan.activos.length };
}

/// Writes the rows that validate, in one transaction, and regenerates the risk set.
export async function importarPlantilla(datos: FormData): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

    try {
      const wb = await abrirWorkbook(datos);
      const consolidado = await planDelConsolidado(wb);
      if (consolidado) return await cargarConsolidadoV19(consolidado.plan, autor);
    } catch (error) {
      if (error instanceof PlantillaError) return { ok: false, mensaje: error.message };
      throw error;
    }

    const resoluciones = resolucionesDe(datos);

    let lectura;
    try {
      lectura = await leer(datos, resoluciones);
    } catch (error) {
      if (error instanceof PlantillaError) return { ok: false, mensaje: error.message };
      throw error;
    }
    const { filas, faltantes, matriz, filaDeEncabezado, catalogo } = lectura;
    let { resueltas } = lectura;

    // La validación va ANTES de abrir la transacción: descubrir a mitad de camino que un
    // destino no existe deja el trabajo de la persona a medias sin decirle qué corregir.
    const problemas = problemasDeResoluciones(faltantes, resoluciones, opcionesDe(catalogo));
    if (problemas.length > 0) {
      return { ok: false, mensaje: problemas.join(' ') };
    }

    const hayQueCrear = resoluciones.some((r) => r.accion === 'crear');
    // El chequeo de «ninguna fila pasó» NO puede ir antes de crear los catálogos: si todas
    // las filas fallaban por un cargo que la persona acaba de mandar a crear, `resueltas`
    // vale 0 acá y saldríamos sin crearlo. Con creaciones pendientes se decide después de
    // la relectura, ya dentro de la transacción.
    if (!hayQueCrear && resueltas.length === 0) {
      return {
        ok: false,
        mensaje: `Ninguna de las ${filas.length} filas pasó la validación, así que no importé nada.`,
      };
    }

    const [areas, tipos, escala, dimensiones] = await Promise.all([
      prisma.area.findMany(),
      prisma.tipoMagerit.findMany(),
      prisma.escalaValor.findMany(),
      prisma.dimension.findMany(),
    ]);
    const porArea = new Map(areas.map((a) => [a.id, a]));
    const porTipo = new Map(tipos.map((t) => [t.id, t]));
    const porCodigoDim = new Map(dimensiones.map((d) => [d.codigo, d.id]));
    const porValor = new Map(escala.map((e) => [e.valor, e.id]));

    const codigos: string[] = [];
    const pendientesDeSuperior: { id: number; superior: string }[] = [];

    // One transaction for the whole batch. Half an inventory looks plausible and hides
    // what is missing, and the counters would already have moved for the rows that made
    // it in.
    let creados = 0;

    try {
      await prisma.$transaction(async (tx) => {
      if (hayQueCrear) {
        // Se crea y se RELEE dentro de la misma transacción. La relectura es pura y la
        // matriz ya está en memoria, así que cuesta nada; lo que compra es que los ids de
        // los cargos y proveedores recién insertados sean los que escriben las filas, sin
        // una segunda consulta que podría ver otro estado.
        const aumentado = await crearFaltantes(tx, catalogo, resoluciones);
        creados = aumentado.cargos.length - catalogo.cargos.length
          + aumentado.proveedores.length - catalogo.proveedores.length
          + aumentado.ubicaciones.length - catalogo.ubicaciones.length
          + aumentado.entornos.length - catalogo.entornos.length;
        resueltas = leerFilas(matriz, aumentado, filaDeEncabezado).resueltas;
        if (resueltas.length === 0) {
          // Abortar revierte los catálogos recién creados: si no entra ni una fila, no
          // quedan cargos inventados para una importación que no ocurrió.
          throw new SinFilasTrasResolver();
        }
      }

      for (const f of resueltas) {
        const area = porArea.get(f.areaId);
        const tipo = porTipo.get(f.tipoId);
        if (!area || !tipo) throw new Error(`La fila ${f.fila} quedó sin área o sin tipo.`);

        // Same rule as crearActivo: a counter per (area, type), incremented atomically,
        // never MAX()+1 — codes are immutable and deletes are logical, so a maximum over
        // live rows would hand out a number a retired asset still holds.
        const contador = await tx.contadorCodigo.upsert({
          where: { areaId_tipoId: { areaId: area.id, tipoId: tipo.id } },
          update: { ultimoValor: { increment: 1 } },
          create: { areaId: area.id, tipoId: tipo.id, ultimoValor: 1 },
        });
        if (contador.ultimoValor > 9999) {
          throw new Error(
            `Se agotó el espacio de numeración para ${area.prefijo}-${tipo.abreviatura}.`,
          );
        }
        const codigo = `${area.prefijo}-${tipo.abreviatura}-${String(contador.ultimoValor).padStart(4, '0')}`;

        const activo = await tx.activo.create({
          data: {
            codigo,
            codigoHeredado: f.codigoHeredado,
            nombre: f.nombre,
            descripcion: f.descripcion,
            areaId: f.areaId,
            tipoId: f.tipoId,
            subtipoId: f.subtipoId,
            custodioId: f.custodioId,
            propietarioId: f.propietarioId,
            ubicacionId: f.ubicacionId,
            entornoId: f.entornoId,
            proveedorId: f.proveedorId,
            datosCliente: f.datosCliente,
            datosPersonales: f.datosPersonales,
            expuestoInternet: f.expuestoInternet,
            cantidad: f.cantidad,
            // E2 · el activo apunta al NIVEL 3 y a ningun otro grado. La rama se crea de
            // arriba hacia abajo reutilizando lo que ya exista, porque dos activos de la
            // misma rama no pueden fabricar dos jerarquias paralelas.
            nivelId: await idDeNivel3(tx, f.n1, f.n2, f.n3),
          },
        });

        await tx.activoValor.createMany({
          data: (
            [
              ['D', f.valorD],
              ['I', f.valorI],
              ['C', f.valorC],
            ] as const
          ).map(([cod, valor]) => {
            const dimensionId = porCodigoDim.get(cod);
            const valorId = porValor.get(valor);
            if (!dimensionId || !valorId) {
              throw new Error(`La fila ${f.fila} tiene una valoración que no existe en la escala.`);
            }
            return { activoId: activo.id, dimensionId, valorId };
          }),
        });

        await registrarAlta(tx, autor, 'activo', codigo);
        codigos.push(codigo);
        if (f.superior !== null) pendientesDeSuperior.push({ id: activo.id, superior: f.superior });
      }

      // SEGUNDA PASADA · el superior, cuando todo el lote ya existe. Un activo puede
      // declarar como superior a otro que viene mas abajo en la misma hoja, asi que
      // resolverlo sobre la marcha fallaria por orden de filas y no por el dato.
      //
      // El libro apunta por el codigo QUE EL TRAE —el heredado—, no por el que se acaba de
      // emitir: el que llena la hoja no puede conocer un codigo que todavia no existe.
      for (const p of pendientesDeSuperior) {
        const destino = await tx.activo.findFirst({
          where: { OR: [{ codigoHeredado: p.superior }, { codigo: p.superior }] },
          select: { id: true },
        });
        if (destino && destino.id !== p.id) {
          await tx.activo.update({ where: { id: p.id }, data: { superiorId: destino.id } });
        }
      }
      }, {
        // Prisma's default interactive-transaction timeout is 5 s, and this loop runs four
        // awaited queries PER ROW. Two hundred rows is eight hundred round trips, so the
        // default aborts a perfectly valid import on the clock and reports it as a failure of
        // the data. `maxWait` is the queue wait for a connection, `timeout` the work itself.
        maxWait: 10_000,
        timeout: 120_000,
      });
    } catch (error) {
      if (error instanceof SinFilasTrasResolver) {
        return {
          ok: false,
          mensaje:
            `Ninguna de las ${filas.length} filas pasó la validación ni siquiera con los ` +
            'nombres resueltos, así que no importé nada y tampoco registré los catálogos nuevos.',
        };
      }
      throw error;
    }

    // FROM HERE ON THE ASSETS ARE COMMITTED. Anything that fails below is a failure to
    // FINISH, never a failure to save, and it must not be reported as one: told "no se pudo
    // importar" after the rows landed, the obvious next move is to import the same file
    // again, and the second run creates a second set of assets with new codes.
    const omitidas = filas.length - resueltas.length;
    const rango = codigos.length > 1 ? `${codigos[0]} … ${codigos[codigos.length - 1]}` : codigos[0];
    const importados =
      `Se importaron ${codigos.length} ${codigos.length === 1 ? 'activo' : 'activos'} (${rango}). ` +
      // Los catálogos creados se dicen SIEMPRE, y no como detalle: son filas nuevas en el
      // vocabulario de la organización, no un efecto secundario de la carga. Quien importó
      // tiene que saber qué quedó registrado a su nombre.
      (creados > 0
        ? `Registré ${creados} ${creados === 1 ? 'nombre nuevo' : 'nombres nuevos'} en los catálogos. `
        : '') +
      (omitidas > 0 ? `Quedaron ${omitidas} filas afuera por errores. ` : '');

    let diagnostico;
    try {
      // A valuation that reaches the threshold is what brings the risks into existence.
      diagnostico = await generarRiesgos(prisma);
    } catch (error) {
      console.error('[sgsi] los activos se importaron pero falló la generación de riesgos', error);
      return {
        ok: true,
        mensaje:
          `${importados}PERO no se pudo recalcular el conjunto de riesgos: ` +
          `${error instanceof Error ? error.message : 'error desconocido'}. ` +
          'Los activos YA están guardados — no vuelvas a importar el archivo. ' +
          'Guardá cualquier valoración o madurez para que el recálculo corra de nuevo.',
        cambios: codigos.length,
      };
    }

    // Guarded for the same reason as the block above, one statement further along. Next 16
    // does not throw here in a Server Action's request phase — the revalidate helper takes
    // the 'request' branch — but the invariant "a committed import is never reported as a
    // failure" must not rest on a framework internal. A stale page is a nuisance; telling
    // somebody their import failed when it did not is a duplicate inventory.
    try {
      for (const ruta of ['/', '/sgsi', '/sgsi/inventario', '/sgsi/matrices', '/sgsi/planes']) {
        revalidatePath(ruta);
      }
    } catch (error) {
      console.error('[sgsi] la importación se completó pero falló revalidatePath', error);
    }

    return {
      ok: true,
      mensaje:
        importados +
        `El análisis quedó con ${diagnostico.riesgosGenerados} riesgos vigentes sobre ${diagnostico.activosEnAnalisis} activos que alcanzan el umbral.`,
      cambios: codigos.length,
    };
  });
}
