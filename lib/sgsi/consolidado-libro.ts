// lib/sgsi/consolidado-libro.ts
//
// El puente entre el archivo .xlsx y las funciones puras: convierte las hojas del
// Consolidado V19 en matrices de texto de celda.
//
// Vive separado de la acción a propósito. La prueba de paridad del §8 tiene que leer el
// MISMO libro con el MISMO lector que la carga, o no prueba la carga: prueba otra lectura
// que se le parece.

import type ExcelJS from 'exceljs';
import type { HojasConsolidado } from './consolidado-carga';

/// Aplana una celda a texto.
///
/// ExcelJS devuelve objetos para texto enriquecido, fórmulas e hipervínculos, y un
/// «[object Object]» en una columna de códigos es una referencia rota que nadie puede
/// diagnosticar. Cada rama saca el texto que la persona ve en la hoja.
export function textoDeCelda(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as {
      text?: unknown;
      result?: unknown;
      richText?: { text: string }[];
      hyperlink?: unknown;
    };
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join('').trim();
    if (typeof o.text === 'string') return o.text.trim();
    if (o.result !== undefined && o.result !== null) return String(o.result).trim();
    return '';
  }
  return String(v).trim();
}

/// Toda la hoja como texto, con `matriz[i]` = fila `i + 1` de Excel.
///
/// El desfase de uno se paga UNA vez, acá, para que los números de columna de los mapeos
/// sean los mismos que la persona ve en la barra de Excel. Que cada lector lo resuelva por
/// su cuenta es cómo se cuela un off-by-one que desplaza una columna entera sin fallar.
export function matrizDeHoja(hoja: ExcelJS.Worksheet, columnas: number): string[][] {
  const matriz: string[][] = [];
  for (let n = 1; n <= hoja.rowCount; n++) {
    const cruda = hoja.getRow(n);
    const celdas: string[] = [];
    for (let c = 1; c <= columnas; c++) celdas.push(textoDeCelda(cruda.getCell(c).value));
    matriz.push(celdas);
  }
  return matriz;
}

/// Cuántas columnas leer de cada hoja. Fijas y no `columnCount`, porque ExcelJS informa el
/// ancho REAL del contenido: una hoja cuya última columna quedó vacía en todas las filas
/// devuelve una menos, y el mapeo por número se correría sin avisar.
const ANCHOS = {
  matriz: 25,
  dependencias: 5,
  ambiente: 25,
  grafoAristas: 8,
} as const;

/// Busca una hoja por nombre, sin distinguir mayúsculas ni acentos.
///
/// Quien renombró «Detalle de Ambiente» con mayúscula no rompió el archivo, y hacerlo fallar
/// por eso convierte un detalle de tipeo en un diagnóstico equivocado.
export function hojaPorNombre(
  wb: ExcelJS.Workbook,
  nombre: string,
): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find(
    (w) => w.name.trim().localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0,
  );
}

export const NOMBRES_DE_HOJA = {
  matriz: 'Matriz de Activos',
  dependencias: 'Dependencias',
  ambiente: 'Detalle de ambiente',
  grafoAristas: 'Grafo (aristas)',
} as const;

/// Las cuatro hojas del consolidado, o `null` si falta alguna de las tres de carga.
///
/// **«Grafo (aristas)» puede faltar sin que la carga se caiga.** Es la única de las cuatro
/// que no aporta filas: sólo deriva el TIPO de cada dependencia (D-1), y sin ella todas caen
/// en el `USA` por defecto que la decisión ya declara. Exigirla convertiría un refinamiento
/// en un requisito, y un libro sin esa hoja sigue siendo cargable.
export function hojasDelLibro(wb: ExcelJS.Workbook): HojasConsolidado | null {
  const matriz = hojaPorNombre(wb, NOMBRES_DE_HOJA.matriz);
  const dependencias = hojaPorNombre(wb, NOMBRES_DE_HOJA.dependencias);
  const ambiente = hojaPorNombre(wb, NOMBRES_DE_HOJA.ambiente);
  const grafoAristas = hojaPorNombre(wb, NOMBRES_DE_HOJA.grafoAristas);

  if (!matriz || !dependencias || !ambiente) return null;

  return {
    matriz: matrizDeHoja(matriz, ANCHOS.matriz),
    dependencias: matrizDeHoja(dependencias, ANCHOS.dependencias),
    ambiente: matrizDeHoja(ambiente, ANCHOS.ambiente),
    grafoAristas: grafoAristas ? matrizDeHoja(grafoAristas, ANCHOS.grafoAristas) : [],
  };
}

/// La fila de encabezado de la «Matriz de Activos» (fila 7), para el diagnóstico de formato.
export function encabezadoDeMatriz(wb: ExcelJS.Workbook): string[] {
  const hoja = hojaPorNombre(wb, NOMBRES_DE_HOJA.matriz);
  if (!hoja) return [];
  const fila = hoja.getRow(7);
  const salida: string[] = [];
  for (let c = 1; c <= ANCHOS.matriz; c++) salida.push(textoDeCelda(fila.getCell(c).value));
  return salida;
}
