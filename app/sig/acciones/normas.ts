'use server';

// app/sig/acciones/normas.ts
//
// Importación de los numerales de una norma auditable desde un libro de Excel.
//
// El botón «Cargar norma» de la pantalla de Normas era un `alert()` con un texto
// explicativo: «los numerales son un catálogo, no una constante del código». La frase era
// correcta y no había nada detrás — ninguna acción de servidor, ninguna forma de cargarlos.
//
// Dos pasos separados a propósito, igual que el importador de activos: primero se ANALIZA y
// se muestra qué va a pasar con cada fila, y sólo después se IMPORTA. El catálogo es
// normativo: los numerales son la referencia que citan las notas de auditoría, y actualizar
// el título de uno ya auditado reescribe lo que esas notas señalan. Eso no se hace sin que
// alguien lo vea antes.

import { prisma } from '@/lib/db';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import {
  autorConPermiso,
  ejecutar,
  exigirId,
  type Resultado,
} from '@/app/sgsi/acciones/sesion';
import {
  encabezadosValidos,
  leerNumerales,
  type Lectura,
  type Matriz,
} from '@/lib/sig/plantilla-normas';

export interface Analisis extends Resultado {
  lectura: Lectura | null;
  norma: { codigo: string; nombre: string } | null;
}

/// Convierte el libro en una matriz de celdas. Se usa el valor calculado de una fórmula
/// cuando la hay: una plantilla que alguien armó con referencias a otra hoja igual tiene
/// que poder importarse.
async function matrizDelLibro(archivo: File): Promise<Matriz> {
  const ExcelJS = (await import('exceljs')).default;
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await archivo.arrayBuffer());
  const hoja = libro.worksheets[0];
  if (!hoja) return [];

  const matriz: Matriz = [];
  hoja.eachRow({ includeEmpty: false }, (fila) => {
    const celdas: (string | number | null)[] = [];
    for (let c = 1; c <= 3; c++) {
      const v = fila.getCell(c).value;
      if (v !== null && typeof v === 'object' && 'result' in (v as object)) {
        celdas.push(((v as { result?: unknown }).result ?? null) as string | number | null);
      } else if (v !== null && typeof v === 'object' && 'richText' in (v as object)) {
        celdas.push((v as { richText: { text: string }[] }).richText.map((t) => t.text).join(''));
      } else {
        celdas.push(v as string | number | null);
      }
    }
    matriz.push(celdas);
  });
  return matriz;
}

async function existentesDe(normaId: number) {
  const filas = await prisma.requisitoNorma.findMany({
    where: { normaId },
    select: { numeral: true, titulo: true, auditable: true },
  });
  return filas;
}

/// Paso 1: leer el libro y decir qué va a pasar. No escribe nada.
export async function analizarNormaExcel(datos: FormData): Promise<Analisis> {
  return ejecutar<Analisis>(async () => {
    await autorConPermiso('auditoria:administrar');

    const normaId = Number(datos.get('normaId'));
    exigirId(normaId, 'la norma');
    const archivo = datos.get('archivo');
    if (!(archivo instanceof File) || archivo.size === 0) {
      return { ok: false, mensaje: 'Elegí el archivo de la plantilla.', lectura: null, norma: null };
    }

    const norma = await prisma.normaAuditable.findUnique({
      where: { id: normaId },
      select: { codigo: true, nombre: true },
    });
    if (!norma) {
      return { ok: false, mensaje: 'La norma no existe.', lectura: null, norma: null };
    }

    const matriz = await matrizDelLibro(archivo);
    if (!encabezadosValidos(matriz)) {
      return {
        ok: false,
        mensaje:
          'La primera hoja no tiene los encabezados de la plantilla (Numeral · Título · Auditable). ' +
          'Descargá la plantilla y usá esa: importar la hoja equivocada es peor que no importar.',
        lectura: null,
        norma,
      };
    }

    const lectura = leerNumerales(matriz, await existentesDe(normaId));
    return {
      ok: true,
      mensaje: `${lectura.listas} fila(s) listas · ${lectura.conErrores} con errores.`,
      lectura,
      norma,
    };
  });
}

export interface ResultadoImportacion extends Resultado {
  agregados: number;
  actualizados: number;
}

/// Paso 2: escribir. Sólo las filas sin errores, en una transacción con la bitácora adentro.
///
/// Las que ya están iguales no se tocan: reescribirlas dejaría una entrada de bitácora por
/// cada corrida del importador, y una bitácora llena de cambios que no cambiaron nada es una
/// bitácora que nadie lee.
export async function importarNormaExcel(datos: FormData): Promise<ResultadoImportacion> {
  return ejecutar<ResultadoImportacion>(async () => {
    const autor = await autorConPermiso('auditoria:administrar');

    const normaId = Number(datos.get('normaId'));
    exigirId(normaId, 'la norma');
    const archivo = datos.get('archivo');
    if (!(archivo instanceof File) || archivo.size === 0) {
      return { ok: false, mensaje: 'Elegí el archivo de la plantilla.', agregados: 0, actualizados: 0 };
    }

    const matriz = await matrizDelLibro(archivo);
    if (!encabezadosValidos(matriz)) {
      return {
        ok: false,
        mensaje: 'La hoja no corresponde a la plantilla de numerales.',
        agregados: 0,
        actualizados: 0,
      };
    }

    const lectura = leerNumerales(matriz, await existentesDe(normaId));
    const aplicables = lectura.filas.filter(
      (f) => f.errores.length === 0 && f.decision !== 'SIN_CAMBIO',
    );
    if (aplicables.length === 0) {
      return {
        ok: true,
        mensaje:
          lectura.conErrores > 0
            ? `No se importó nada: las ${lectura.conErrores} fila(s) con errores hay que corregirlas primero.`
            : 'El catálogo ya coincide con la plantilla: no hay nada que cambiar.',
        agregados: 0,
        actualizados: 0,
      };
    }

    let agregados = 0;
    let actualizados = 0;
    await prisma.$transaction(async (tx) => {
      for (const f of aplicables) {
        if (f.decision === 'AGREGAR') {
          const creado = await tx.requisitoNorma.create({
            data: {
              normaId,
              numeral: f.numeral,
              titulo: f.titulo,
              orden: f.orden,
              auditable: f.auditable,
            },
          });
          await registrarAlta(tx, autor, 'requisito_norma', String(creado.id));
          agregados++;
        } else {
          const previo = await tx.requisitoNorma.findUnique({
            where: { normaId_numeral: { normaId, numeral: f.numeral } },
            select: { id: true, titulo: true, auditable: true },
          });
          if (!previo) continue;
          await tx.requisitoNorma.update({
            where: { id: previo.id },
            data: { titulo: f.titulo, auditable: f.auditable, orden: f.orden },
          });
          await registrar(tx, autor, [
            {
              tabla: 'requisito_norma',
              registroId: String(previo.id),
              campo: 'titulo',
              anterior: previo.titulo,
              nuevo: f.titulo,
              motivo: `importación de numerales · ${f.numeral}`,
            },
          ]);
          actualizados++;
        }
      }
    });

    const sobran = lectura.conErrores;
    return {
      ok: true,
      mensaje:
        `${agregados} numeral(es) agregado(s), ${actualizados} actualizado(s).` +
        (sobran > 0 ? ` Quedaron ${sobran} fila(s) con errores sin importar.` : ''),
      agregados,
      actualizados,
    };
  });
}
