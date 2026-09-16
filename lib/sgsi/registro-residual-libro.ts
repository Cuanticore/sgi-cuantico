// lib/sgsi/registro-residual-libro.ts
//
// El registro de aprobación del riesgo residual, en Excel.
//
// LAS ETIQUETAS VIVEN EN `filasDelRegistro`, QUE ES PURA Y SE PRUEBA; `exceljs` sólo pinta.
// Es el mismo reparto de `lib/sgsi/inventario-libro.ts`, y la razón es que lo que alguien
// discute de una exportación nunca es el ancho de la columna: es qué dice la celda cuando no
// hay dato.

import ExcelJS from 'exceljs';

export interface RenglonRegistro {
  codigo: string;
  nombre: string;
  proceso: string;
  banda: string;
  cifra: string;
  planCodigo: string | null;
  firmante: string | null;
  fechaFirma: string | null;
}

export interface FilaRegistro {
  codigo: string;
  nombre: string;
  proceso: string;
  banda: string;
  cifra: string;
  planCodigo: string;
  firmante: string;
  fechaFirma: string;
  observacion: string;
}

/// Una celda vacía en un registro que se archiva no dice nada: no distingue «nadie firmó» de
/// «se nos olvidó llenarlo». La palabra sí, y por eso la ausencia se nombra.
///
/// La fecha es la excepción y queda vacía a propósito: «Pendiente de firma» ya lo dijo, y una
/// palabra en una columna de fechas rompe cualquier ordenamiento o filtro que alguien aplique
/// después sobre la hoja.
export function filasDelRegistro(renglones: readonly RenglonRegistro[]): FilaRegistro[] {
  return renglones.map((r) => ({
    codigo: r.codigo,
    nombre: r.nombre,
    proceso: r.proceso,
    banda: r.banda,
    cifra: r.cifra,
    planCodigo: r.planCodigo ?? '—',
    firmante: r.firmante ?? 'Pendiente de firma',
    fechaFirma: r.fechaFirma ?? '',
    observacion:
      r.banda === 'Crítico'
        ? 'Excepción al criterio de aceptación: la banda Crítica se declara no aceptable — mitigar o evitar.'
        : '',
  }));
}

export async function libroDelRegistro(renglones: readonly RenglonRegistro[]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Riesgo residual');
  hoja.columns = [
    { key: 'codigo', header: 'CÓDIGO', width: 16 },
    { key: 'nombre', header: 'ACTIVO', width: 40 },
    { key: 'proceso', header: 'PROCESO', width: 24 },
    { key: 'banda', header: 'BANDA', width: 12 },
    { key: 'cifra', header: 'RESIDUAL', width: 12 },
    { key: 'planCodigo', header: 'PLAN', width: 12 },
    { key: 'firmante', header: 'FIRMÓ', width: 28 },
    { key: 'fechaFirma', header: 'FECHA', width: 14 },
    { key: 'observacion', header: 'OBSERVACIÓN', width: 70 },
  ];
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  for (const f of filasDelRegistro(renglones)) hoja.addRow(f);
  return Buffer.from(await libro.xlsx.writeBuffer());
}
