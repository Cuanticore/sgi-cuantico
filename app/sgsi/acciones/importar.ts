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

/// Open the upload and reduce it to a matrix of cell text in template column order.
/// Two formats accepted:
///   1. Nuestra plantilla (hoja «Activos», encabezado fila 1, 17 columnas).
///   2. El formato histórico FOR-SIG-12 (hoja «1. Matriz de Activos», encabezado en la
///      fila 7 con B..U, títulos arriba) — se alinea columna por columna.
async function abrir(datos: FormData): Promise<string[][]> {
  const archivo = datos.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) {
    throw new PlantillaError('Elegí el archivo de la plantilla.');
  }
  if (archivo.size > TOPE_ARCHIVO) {
    throw new PlantillaError(
      `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el tope es 8 MB. ¿Es la plantilla correcta?`,
    );
  }

  let hoja;
  let wb: ExcelJS.Workbook | null = null;
  try {
    const ExcelJS = (await import('exceljs')).default;
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await archivo.arrayBuffer());
    hoja = wb.getWorksheet('Activos') ?? wb.worksheets[0];
  } catch (error) {
    throw new PlantillaError(
      'No pude abrir el archivo como Excel. Guardalo en formato .xlsx desde la plantilla y volvé a intentar. ' +
        (error instanceof Error ? `(${error.message})` : ''),
    );
  }
  if (!hoja || !wb) throw new PlantillaError('El archivo no tiene ninguna hoja con datos.');

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

/// Dry run: reads the file, validates it and writes nothing.
export async function analizarPlantilla(datos: FormData): Promise<Analisis> {
  const vacio: Analisis = { ok: false, mensaje: '', filas: [], validas: 0, conErrores: 0 };
  try {
    await autorConPermiso('sgsi:escribir');
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

/// Writes the rows that validate, in one transaction, and regenerates the risk set.
export async function importarPlantilla(datos: FormData): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('sgsi:escribir');

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
