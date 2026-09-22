// lib/sgsi/analisis-libro.ts
//
// El libro de «Análisis de riesgos»: lo que la grilla está mostrando, con estilos.
//
// Sin Prisma y sin sesión, a propósito — el mismo corte que `inventario-libro.ts`. La ruta
// comprueba la sesión y arma las filas; esto sólo decide cómo se ve el ARCHIVO, así que una
// prueba puede construir el libro y leerle los colores sin levantar nada.
//
// POR QUÉ NO ES EL EXPORT DE AG GRID. Exportar a Excel con formato es una función de AG Grid
// Enterprise (999 USD por desarrollador). No hizo falta: `exceljs` ya es dependencia de este
// proyecto y ya genera los otros cinco libros del SGSI, así que el formato se escribe acá y
// queda además bajo nuestro control — los colores de banda son LOS MISMOS que pinta la
// pantalla, cosa que el export de la librería no podría saber.
//
// LO QUE ESTE ARCHIVO NO ES: el informe de valoración. Ése sale de `/sgsi/informe-valoracion`
// sobre el inventario completo. Éste es un volcado de lo que quien exporta está viendo, y la
// hoja lo dice en su primera línea para que no se confundan seis meses después.

import ExcelJS from 'exceljs';
import { colorDeNivel, type NivelRiesgo } from './riesgo-activo';
import { colorDeNivelValor } from './valoracion-figura';
import { textoDeEstadoPlan } from './columnas-analisis';
import type { EstadoPlanActivo } from './analisis-riesgos';

export interface FilaAnalisisExport {
  codigo: string;
  nombre: string;
  valor: number;
  valores: { D: number; I: number; C: number };
  criticidad: string | null;
  proceso: string;
  propietario: string | null;
  cantidadAmenazas: number;
  peorInherente: NivelRiesgo | null;
  peorResidual: NivelRiesgo | null;
  estadoPlan: EstadoPlanActivo;
}

export interface ContextoLibroAnalisis {
  /// Los que superan el umbral — el alcance de la pantalla.
  enAnalisis: number;
  /// Los vigentes del inventario, para que la hoja diga «30 de 378» igual que la pantalla.
  totalVigentes: number;
  umbral: number;
}

/// El azul de `--hf-brand-nav`, en el formato ARGB que pide ExcelJS.
const AZUL_ENCABEZADO = 'FF12437F';
const GRIS_NOTA = 'FF6B7570';
const FILA_ALARMANTE = 'FFFDECEB';

/// EL MISMO ORDEN QUE LA PANTALLA, incluido «Plan» en tercera posición. Si el archivo sacara
/// las columnas en otro orden, quien exporta tendría que volver a buscar dónde quedó cada
/// una — y el archivo existe justamente para llevarse lo que se estaba viendo.
const COLUMNAS: { encabezado: string; ancho: number }[] = [
  { encabezado: 'Código', ancho: 18 },
  { encabezado: 'Nombre', ancho: 42 },
  { encabezado: 'Plan', ancho: 16 },
  { encabezado: 'Valor', ancho: 8 },
  { encabezado: 'D', ancho: 5 },
  { encabezado: 'I', ancho: 5 },
  { encabezado: 'C', ancho: 5 },
  { encabezado: 'Criticidad', ancho: 12 },
  { encabezado: 'Proceso', ancho: 26 },
  { encabezado: 'Propietario', ancho: 30 },
  { encabezado: 'Amenazas', ancho: 11 },
  { encabezado: 'Peor inherente', ancho: 18 },
  { encabezado: 'Peor residual', ancho: 18 },
];

/// Sin `#`, y en ARGB: ExcelJS no acepta el `#rrggbb` de CSS.
function argb(css: string): string {
  const hex = css.replace('#', '').trim();
  if (hex.length === 6) return `FF${hex.toUpperCase()}`;
  if (hex.length === 8) return hex.toUpperCase();
  // Un color que no se pueda traducir no puede tumbar el archivo: se deja sin relleno, que
  // es exactamente lo que «no sé de qué color va» significa.
  return '';
}

export async function construirLibroAnalisis(
  filas: readonly FilaAnalisisExport[],
  ctx: ContextoLibroAnalisis,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIG CUANTICO';
  wb.created = new Date();

  const hoja = wb.addWorksheet('Análisis de riesgos', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // ── Fila 1 · el título ──────────────────────────────────────────────────────────────
  hoja.mergeCells(1, 1, 1, COLUMNAS.length);
  const titulo = hoja.getCell(1, 1);
  titulo.value = 'Análisis de riesgos';
  titulo.font = { size: 14, bold: true, color: { argb: AZUL_ENCABEZADO } };
  hoja.getRow(1).height = 22;

  // ── Fila 2 · el alcance, dicho para que nadie lo confunda con el informe ────────────
  hoja.mergeCells(2, 1, 2, COLUMNAS.length);
  const nota = hoja.getCell(2, 1);
  nota.value =
    `${filas.length} activos exportados de los ${ctx.enAnalisis} que alcanzan el umbral de ` +
    `${ctx.umbral}, sobre ${ctx.totalVigentes} vigentes. ` +
    'Es lo que se estaba viendo en pantalla, no el informe de valoración.';
  nota.font = { size: 9, italic: true, color: { argb: GRIS_NOTA } };
  hoja.getRow(2).height = 14;

  // ── Fila 3 · los encabezados ────────────────────────────────────────────────────────
  const encabezado = hoja.getRow(3);
  COLUMNAS.forEach((c, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = c.encabezado;
    celda.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ENCABEZADO } };
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hoja.getColumn(i + 1).width = c.ancho;
  });
  encabezado.height = 20;

  // ── Las filas ───────────────────────────────────────────────────────────────────────
  filas.forEach((f) => {
    const fila = hoja.addRow([
      f.codigo,
      f.nombre,
      textoDeEstadoPlan(f.estadoPlan),
      f.valor,
      f.valores.D,
      f.valores.I,
      f.valores.C,
      f.criticidad ?? 'sin clasificar',
      f.proceso,
      f.propietario ?? '—',
      f.cantidadAmenazas,
      textoDeNivelExport(f.peorInherente),
      textoDeNivelExport(f.peorResidual),
    ]);

    fila.font = { size: 10 };
    fila.alignment = { vertical: 'middle' };
    fila.getCell(1).font = { size: 10, bold: true, name: 'Consolas' };
    // Valor, D, I, C y Amenazas: cifras, centradas.
    for (const col of [4, 5, 6, 7, 11]) {
      fila.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' };
    }

    // El acento del renglón: residual Crítico o Alto, sin mirar si hay plan.
    //
    // NO ES EL MISMO CRITERIO QUE LA PANTALLA, y el comentario anterior afirmaba que sí. Desde
    // el 22/09/2026 `claseDeFila` pinta rojo sólo cuando ese residual alto **no tiene plan que
    // lo cubra**, y ámbar cuando lo que falta es madurez de control. Este libro tiñe todo lo
    // alto, con plan o sin él, así que marca MÁS filas que la grilla.
    //
    // No es un defecto —un volcado que señale todo lo alto es defendible— pero que archivo y
    // pantalla se lean juntos exigiría que `FilaAnalisisExport` trajera `altoSinPlan`, y eso es
    // un cambio aparte con su propia prueba.
    if (esAlarmante(f.peorResidual)) {
      for (let c = 1; c <= COLUMNAS.length; c++) {
        fila.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILA_ALARMANTE } };
      }
    }

    // El valor del activo, con el color de su nivel: el mismo de la insignia en pantalla.
    const relleno = argb(colorDeNivelValor(f.valor));
    if (relleno !== '') {
      fila.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: relleno } };
      fila.getCell(4).font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    }

    // Las dos bandas, con el color de su casilla en la matriz. `null` NO se pinta: pintarlo
    // diría que el riesgo es alto, y lo que pasa es que no se sabe.
    pintarBanda(fila.getCell(12), f.peorInherente);
    pintarBanda(fila.getCell(13), f.peorResidual);
  });

  // El filtro de Excel sobre el encabezado: quien reciba el archivo sigue pudiendo recortar,
  // que es la mitad de para qué se exporta.
  hoja.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLUMNAS.length } };

  return wb;
}

function textoDeNivelExport(nivel: NivelRiesgo | null): string {
  return nivel === null ? 'sin calcular' : `${nivel.nivel} · ${nivel.banda}`;
}

function esAlarmante(nivel: NivelRiesgo | null): boolean {
  return nivel !== null && ['Crítico', 'Alto'].includes(nivel.banda);
}

function pintarBanda(celda: ExcelJS.Cell, nivel: NivelRiesgo | null): void {
  const color = colorDeNivel(nivel);
  if (color === null) {
    celda.font = { size: 10, italic: true, color: { argb: GRIS_NOTA } };
    return;
  }
  const fondo = argb(color.bg);
  if (fondo === '') return;
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fondo } };
  celda.font = { size: 10, bold: true, color: { argb: argb(color.fg) || 'FF1A211E' } };
  celda.alignment = { horizontal: 'center', vertical: 'middle' };
}
