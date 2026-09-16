// lib/sgsi/informe-libro.ts
//
// El informe de valoración, como libro de Excel.
//
// Sin Prisma y sin sesión: la ruta comprueba el permiso y carga las filas, y esta función
// sólo decide cómo es el ARCHIVO. Es el mismo corte que `inventario-libro.ts` y
// `plantilla-libro.ts`, y sirve para lo mismo: una prueba puede construir el libro y leerle
// las celdas sin levantar una base.
//
// ── POR QUÉ EL EXCEL NO ES EL DOCUMENTO ─────────────────────────────────────────────────
//
// El Word y el PDF son el informe: prosa, capítulos, matrices, algo que se firma. El Excel no
// intenta serlo, y eso es deliberado. Quien pide el informe en Excel no lo quiere para leerlo
// — lo quiere para filtrar, sumar y cruzar contra otra cosa. Así que acá las tablas son
// PLANAS y cada fila lleva su proceso repetido, en vez de agrupar con celdas combinadas.
//
// Una celda combinada se ve mejor y rompe la tabla dinámica, el filtro y el `SUMAR.SI` — que
// son exactamente las tres cosas para las que alguien abre este archivo.
//
// ── UNA HOJA POR CLASE DE COSA, NO UNA POR PROCESO ──────────────────────────────────────
//
// Doce hojas iguales con un proceso en cada una obligan a doce filtros para responder una
// pregunta que cruza procesos. Cuatro hojas —resumen, activos, matrices, aceptaciones— con la
// columna «Proceso» responden todas las preguntas con un filtro.

import ExcelJS from 'exceljs';
import type { ProcesoDelInforme } from './informe-valoracion';
import { SIN_CALCULAR } from './informe-valoracion';
import type { ColumnaFrecuencia, FilaImpacto } from './matriz-clasica';

export interface DatosLibro {
  capitulos: readonly ProcesoDelInforme[];
  generadoEn: Date;
  alcance: string;
  filasImpacto: readonly FilaImpacto[];
  columnasFrecuencia: readonly ColumnaFrecuencia[];
  umbralValoracion: number;
  totalActivos: number;
  totalEnAnalisis: number;
  totalAceptaciones: number;
}

const CABECERA = { argb: 'FFF1F4F7' };
const TINTA_CABECERA = { argb: 'FF5B6875' };

/// Los mismos hexadecimales de `--hf-risk-*`, en el formato ARGB que pide ExcelJS. Por
/// posición de banda, como en el documento.
const RAMPA_ARGB = ['FFA52016', 'FFC25A1E', 'FFE0B93C', 'FFDFE8E2'];
const TINTA_RAMPA = ['FFFFFFFF', 'FFFFFFFF', 'FF3A2C05', 'FF3D5648'];

function encabezar(hoja: ExcelJS.Worksheet, titulos: string[], anchos: number[]): void {
  hoja.addRow(titulos);
  const fila = hoja.getRow(hoja.rowCount);
  fila.font = { bold: true, size: 9, color: TINTA_CABECERA };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: CABECERA };
  titulos.forEach((_, i) => {
    hoja.getColumn(i + 1).width = anchos[i] ?? 18;
  });
  // La fila de encabezados se congela y se le pone autofiltro. Es lo primero que hace quien
  // abre el archivo, así que hacerlo acá le ahorra el paso y evita que filtre mal por
  // seleccionar un rango que no incluye la última fila.
  hoja.views = [{ state: 'frozen', ySplit: hoja.rowCount }];
  hoja.autoFilter = {
    from: { row: hoja.rowCount, column: 1 },
    to: { row: hoja.rowCount, column: titulos.length },
  };
}

export async function construirLibroInforme(datos: DatosLibro): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIG Cuantico · SGSI';
  libro.created = datos.generadoEn;

  // ── Resumen ──────────────────────────────────────────────────────────────────────────
  const resumen = libro.addWorksheet('Resumen');
  resumen.addRow(['Informe de valoración de activos de información']).font = { bold: true, size: 14 };
  resumen.addRow([]);
  resumen.addRow(['Alcance', datos.alcance]);
  resumen.addRow(['Generado', datos.generadoEn.toISOString().slice(0, 10)]);
  resumen.addRow(['Activos incluidos', datos.totalActivos]);
  resumen.addRow(['Dentro del análisis', datos.totalEnAnalisis]);
  resumen.addRow(['Umbral de valoración', datos.umbralValoracion]);
  resumen.addRow(['Aceptaciones formales', datos.totalAceptaciones]);
  resumen.addRow([]);
  resumen.addRow([
    'Nota',
    `«${SIN_CALCULAR}» no es «bajo»: es que la eficacia de los controles de esa amenaza todavía no está establecida, así que el residual es desconocido.`,
  ]);
  resumen.getColumn(1).width = 24;
  resumen.getColumn(2).width = 90;
  resumen.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  resumen.addRow([]);
  encabezar(
    resumen,
    ['Proceso', 'Activos', 'En análisis', 'Aceptaciones'],
    [40, 12, 14, 14],
  );
  for (const c of datos.capitulos) {
    resumen.addRow([c.proceso, c.activos, c.enAnalisis, c.aceptaciones.length]);
  }

  // ── Activos ──────────────────────────────────────────────────────────────────────────
  const activos = libro.addWorksheet('Activos');
  encabezar(
    activos,
    [
      'Proceso', 'Código', 'Activo', 'Tipo', 'Responsable',
      'Valor', 'Nivel', 'En análisis', 'Banda inherente', 'Banda residual',
    ],
    [34, 16, 40, 28, 26, 8, 14, 12, 16, 16],
  );
  const bandas = ordenDeBandas(datos.capitulos);
  for (const c of datos.capitulos) {
    for (const f of c.filas) {
      const fila = activos.addRow([
        c.proceso,
        f.codigo,
        f.nombre,
        f.tipo,
        f.responsable ?? '',
        f.valor,
        f.nivelValor,
        // «Sí»/«No» y no TRUE/FALSE: se filtra escribiendo, y un booleano de Excel se
        // traduce distinto según el idioma de la instalación.
        f.entraAlAnalisis ? 'Sí' : 'No',
        f.bandaInherente ?? SIN_CALCULAR,
        f.bandaResidual ?? SIN_CALCULAR,
      ]);
      pintarBanda(fila.getCell(10), f.bandaResidual, bandas);
    }
  }

  // ── Matrices ─────────────────────────────────────────────────────────────────────────
  //
  // Plana, con una fila por casilla. Una cuadrícula por proceso se vería como en el Word y
  // sería inservible para una tabla dinámica, que es para lo que se abre este archivo.
  const matrices = libro.addWorksheet('Matrices');
  encabezar(
    matrices,
    ['Proceso', 'Matriz', 'Impacto', 'Frecuencia', 'Veces al año', 'Banda de la casilla', 'Riesgos'],
    [34, 14, 16, 16, 14, 20, 10],
  );
  for (const c of datos.capitulos) {
    for (const m of [c.matrizInherente, c.matrizResidual]) {
      if (m === null) continue;
      datos.filasImpacto.forEach((fi, i) => {
        datos.columnasFrecuencia.forEach((col, j) => {
          matrices.addRow([
            c.proceso,
            m.cara === 'inherente' ? 'Inherente' : 'Residual',
            fi.nombre,
            col.nombre,
            col.vecesAno,
            m.bandas[i]?.[j] ?? '',
            m.conteos[i]?.[j] ?? 0,
          ]);
        });
      });
    }
  }

  // ── Aceptaciones ─────────────────────────────────────────────────────────────────────
  const aceptaciones = libro.addWorksheet('Aceptaciones');
  encabezar(
    aceptaciones,
    ['Proceso', 'Plan', 'Activo', 'Nombre del activo', 'Justificación', 'Fecha de revisión'],
    [34, 14, 16, 40, 60, 18],
  );
  aceptaciones.getColumn(5).alignment = { wrapText: true, vertical: 'top' };
  for (const c of datos.capitulos) {
    for (const a of c.aceptaciones) {
      aceptaciones.addRow([
        c.proceso,
        a.planCodigo,
        a.activoCodigo,
        a.activoNombre,
        a.justificacion ?? '',
        // Sin fecha se escribe el texto y no una celda vacía: una aceptación que nadie vuelve
        // a mirar tiene que poder filtrarse, y un vacío se confunde con «no cargado aún».
        a.fechaRevision ?? 'SIN FECHA DE REVISIÓN',
      ]);
    }
  }

  return libro;
}

/// El orden de las bandas, tomado del conteo residual de cualquier capítulo. Es el del
/// catálogo, que es el que da el color.
function ordenDeBandas(capitulos: readonly ProcesoDelInforme[]): string[] {
  const c = capitulos.find((x) => x.porBandaResidual.length > 0);
  return (c?.porBandaResidual ?? []).map((b) => b.etiqueta).filter((e) => e !== SIN_CALCULAR);
}

function pintarBanda(celda: ExcelJS.Cell, banda: string | null, bandas: readonly string[]): void {
  if (banda === null) return;
  const i = bandas.indexOf(banda);
  if (i < 0) return;
  const k = Math.min(i, RAMPA_ARGB.length - 1);
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RAMPA_ARGB[k] } };
  celda.font = { bold: true, color: { argb: TINTA_RAMPA[k] } };
}
