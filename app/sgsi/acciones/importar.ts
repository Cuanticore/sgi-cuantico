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
} from '@/lib/sgsi/plantilla';
import { leerFilas, esFormatoLegacy, claveLegacy, LEGACY_NORMALIZAR, type Catalogos, type FilaResuelta } from '@/lib/sgsi/plantilla-lectura';
import { diagnosticoDeFormato, type Sustitucion } from '@/lib/sgsi/consolidado';
import { encabezadoDeMatriz, hojasDelLibro } from '@/lib/sgsi/consolidado-libro';
import { escribirPlan, planificarCarga, type PlanDeCarga } from '@/lib/sgsi/consolidado-carga';
import type { CatalogosConsolidado } from '@/lib/sgsi/consolidado-lectura';
import { autorConPermiso, ejecutar, type Resultado } from './sesion';

/// Batch entry: each line, or each `;`-separated fragment, becomes one evidence entry.
/// Batch entry: each line, or each `;`-separated fragment, becomes one evidence entry.
import type ExcelJS from 'exceljs';

/// Something wrong with the FILE, not with the code: a message the person can act on.
class PlantillaError extends Error {}

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
async function abrir(datos: FormData): Promise<string[][]> {
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
    const orden = COLUMNAS_PLANTILLA.map((col) => col.clave);
    const filaCruda: string[] = [];
    for (let c = 1; c <= Math.max(hojaDatos.columnCount, 21); c++) {
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
    for (let filaDatos = filaEncabezado + 1; filaDatos <= hojaDatos.rowCount; filaDatos++) {
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
    return matrizLegacy;
  }

  const matriz: string[][] = [];
  for (let n = 1; n <= hoja.rowCount; n++) {
    const cruda = hoja.getRow(n);
    matriz.push(COLUMNAS_PLANTILLA.map((_, i) => texto(cruda.getCell(i + 1).value)));
  }
  return matriz;
}

async function leer(datos: FormData): Promise<{ filas: FilaLeida[]; resueltas: FilaResuelta[] }> {
  const [matriz, catalogo] = await Promise.all([abrir(datos), catalogos()]);
  const lectura = leerFilas(matriz, catalogo);
  if (lectura.filas.length === 0) {
    throw new PlantillaError(
      'No encontré filas con datos. Revisá que hayas llenado la hoja «Activos» y que quede algo más que la fila de ejemplo.',
    );
  }
  return lectura;
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
  const [tipos, subtipos, areas, cargos, ubicaciones, entornos, proveedores, escala] =
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
    ]);
  return { tipos, subtipos, areas, cargos, ubicaciones, entornos, proveedores, escala };
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
  );
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

    const { filas, resueltas } = await leer(datos);
    const conErrores = filas.length - resueltas.length;

    return {
      ok: true,
      mensaje:
        conErrores === 0
          ? `${resueltas.length} ${resueltas.length === 1 ? 'fila lista' : 'filas listas'} para importar.`
          : `${resueltas.length} de ${filas.length} filas están listas. Las otras ${conErrores} tienen algo que corregir y no se van a importar.`,
      filas,
      validas: resueltas.length,
      conErrores,
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

    let lectura;
    try {
      lectura = await leer(datos);
    } catch (error) {
      if (error instanceof PlantillaError) return { ok: false, mensaje: error.message };
      throw error;
    }
    const { filas, resueltas } = lectura;
    if (resueltas.length === 0) {
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

    // One transaction for the whole batch. Half an inventory looks plausible and hides
    // what is missing, and the counters would already have moved for the rows that made
    // it in.
    await prisma.$transaction(async (tx) => {
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
      }
    }, {
      // Prisma's default interactive-transaction timeout is 5 s, and this loop runs four
      // awaited queries PER ROW. Two hundred rows is eight hundred round trips, so the
      // default aborts a perfectly valid import on the clock and reports it as a failure of
      // the data. `maxWait` is the queue wait for a connection, `timeout` the work itself.
      maxWait: 10_000,
      timeout: 120_000,
    });

    // FROM HERE ON THE ASSETS ARE COMMITTED. Anything that fails below is a failure to
    // FINISH, never a failure to save, and it must not be reported as one: told "no se pudo
    // importar" after the rows landed, the obvious next move is to import the same file
    // again, and the second run creates a second set of assets with new codes.
    const omitidas = filas.length - resueltas.length;
    const rango = codigos.length > 1 ? `${codigos[0]} … ${codigos[codigos.length - 1]}` : codigos[0];
    const importados =
      `Se importaron ${codigos.length} ${codigos.length === 1 ? 'activo' : 'activos'} (${rango}). ` +
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
