// lib/sgsi/__tests__/consolidado-libro.test.ts
//
// El V21 llegó con `rowCount` = 1.048.277 y 94 activos: alguien dio formato a columnas
// enteras y Excel dejó registradas un millón de filas vacías en el XML. Recorrer hasta
// `rowCount` acumulando una fila por vuelta agota la memoria del proceso antes de leer un
// solo activo — la carga no fallaba con un mensaje, moría.
//
// Estas pruebas fijan lo único que evita que vuelva a pasar: el recorrido termina en la
// última fila CON DATOS, no en la última fila que Excel dice tener.

import ExcelJS from 'exceljs';
import { conteoDeCodigos, matrizDeHoja, ultimaFilaConDatos } from '../consolidado-libro';

/// Una hoja con datos hasta `hasta` y, después, una fila lejana tocada sólo con estilo.
///
/// Es la forma exacta del archivo real: la fila lejana no tiene texto, pero existe en el
/// XML y por eso `rowCount` la cuenta.
function hojaConColaDeFormato(hasta: number, filaLejana: number): ExcelJS.Worksheet {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet('Matriz de Activos');
  for (let n = 1; n <= hasta; n++) {
    hoja.getRow(n).getCell(1).value = `fila ${n}`;
  }
  hoja.getRow(filaLejana).getCell(1).style = { font: { bold: true } };
  return hoja;
}

describe('ultimaFilaConDatos', () => {
  it('ignora la cola de filas que sólo tienen formato', () => {
    const hoja = hojaConColaDeFormato(10, 50_000);

    expect(hoja.rowCount).toBeGreaterThanOrEqual(50_000);
    expect(ultimaFilaConDatos(hoja, 5)).toBe(10);
  });

  it('no mira más allá de las columnas que le piden', () => {
    const wb = new ExcelJS.Workbook();
    const hoja = wb.addWorksheet('h');
    hoja.getRow(3).getCell(2).value = 'dentro';
    hoja.getRow(80).getCell(40).value = 'fuera del ancho declarado';

    expect(ultimaFilaConDatos(hoja, 5)).toBe(3);
  });

  it('devuelve 0 en una hoja sin un solo dato', () => {
    const wb = new ExcelJS.Workbook();
    const hoja = wb.addWorksheet('h');
    hoja.getRow(900).getCell(1).style = { font: { italic: true } };

    expect(ultimaFilaConDatos(hoja, 5)).toBe(0);
  });
});

describe('matrizDeHoja con una hoja inflada', () => {
  it('devuelve una fila por fila con datos, no una por fila declarada', () => {
    const hoja = hojaConColaDeFormato(10, 50_000);

    const matriz = matrizDeHoja(hoja, 3);

    // Diez filas con datos: ni 50.000, ni el arreglo gigante que agotaba la memoria.
    expect(matriz).toHaveLength(10);
    // El desfase de uno se sigue pagando acá: `matriz[i]` es la fila `i + 1` de Excel.
    expect(matriz[0][0]).toBe('fila 1');
    expect(matriz[9][0]).toBe('fila 10');
  });

  it('conserva el ancho declarado aunque la hoja tenga menos columnas', () => {
    const hoja = hojaConColaDeFormato(2, 50_000);

    expect(matrizDeHoja(hoja, 25).every((f) => f.length === 25)).toBe(true);
  });
});

describe('conteoDeCodigos con una hoja inflada', () => {
  it('cuenta los activos reales sin recorrer el millón de filas vacías', () => {
    const wb = new ExcelJS.Workbook();
    const hoja = wb.addWorksheet('Matriz de Activos');
    // La matriz empieza en la fila 8: código en la columna 2, nombre en la 6.
    hoja.getRow(8).getCell(6).value = 'Activo con código';
    hoja.getRow(8).getCell(2).value = 'COM-APP-0001';
    hoja.getRow(9).getCell(6).value = 'Activo sin código';
    hoja.getRow(10).getCell(6).value = 'Otro sin código';
    hoja.getRow(200_000).getCell(1).style = { font: { bold: true } };

    expect(conteoDeCodigos(wb)).toEqual({ conCodigo: 1, sinCodigo: 2 });
  });
});
