// lib/sgsi/declaracion-libro.ts
//
// Builds the Statement of Applicability workbook: one row per control of Annex A and the
// columns an auditor asks to see in a SOA declaration (ISO 27001 6.1.3 d) — state,
// written justification, owner and date of the last change.
//
// No Prisma and no session here, on purpose: the route checks the session and loads the
// rows; this function only decides what the FILE looks like, so a test can build the
// workbook and read its cells back. Same IO-at-the-edge split as plantilla-libro.ts.
//
// The maturity level is included because the SOA of the reference implementation carries
// the assessed maturity against each control: it is the document the Committee approves
// and the auditor validates, and a declaration without figures is a wish.

import ExcelJS from 'exceljs';

export interface FilaDeclaracion {
  codigo: string;
  nombre: string;
  dominio: string;
  capacidad: string;
  /// 'Aplica' | 'Aplica con alcance adaptado' | 'No aplica'
  estado: string;
  descripcion: string;
  justificacion: string;
  responsable: string;
  fechaCambio: string;
  madurez: string;
  version: string;
  fechaAprobacion: string;
  aprobadoPor: string;
}

const CABECERA = [
  { key: 'codigo', titulo: 'CÓDIGO', ancho: 10 },
  { key: 'nombre', titulo: 'CONTROL', ancho: 60 },
  { key: 'descripcion', titulo: 'DESCRIPCIÓN DEL CONTROL (ISO/IEC 27002:2022)', ancho: 80 },
  { key: 'estado', titulo: 'APLICA · SOA', ancho: 16 },
  { key: 'justificacion', titulo: 'JUSTIFICACIÓN DE LA INCLUSIÓN', ancho: 80 },
  { key: 'version', titulo: 'VERSIÓN SOA', ancho: 12 },
  { key: 'fechaAprobacion', titulo: 'FECHA APROBACIÓN', ancho: 16 },
  { key: 'aprobadoPor', titulo: 'APROBÓ', ancho: 24 },
  { key: 'responsable', titulo: 'RESPONSABLE', ancho: 24 },
  { key: 'fechaCambio', titulo: 'FECHA ÚLTIMO CAMBIO', ancho: 18 },
  { key: 'madurez', titulo: 'MADUREZ ACTUAL', ancho: 12 },
] as const;

export async function construirDeclaracion(
  filas: FilaDeclaracion[],
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SGSI';
  wb.created = new Date();

  const hoja = wb.addWorksheet('Declaración de aplicabilidad');
  hoja.views = [{ state: 'frozen', ySplit: 1 }];

  hoja.columns = CABECERA.map((c) => ({ ...c }));

  const filaCabecera = hoja.getRow(1);
  for (const col of CABECERA) {
    const celda = filaCabecera.getCell(col.key);
    celda.value = col.titulo;
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  }
  // The brand colour of the grid header, mirrored on paper.
  filaCabecera.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12437F' } };
    celda.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  filaCabecera.height = 22;

  for (const f of filas) {
    const fila = hoja.addRow({
      codigo: f.codigo,
      nombre: f.nombre,
      descripcion: f.descripcion,
      estado: f.estado,
      justificacion: f.justificacion,
      version: f.version,
      fechaAprobacion: f.fechaAprobacion,
      aprobadoPor: f.aprobadoPor,
      responsable: f.responsable,
      fechaCambio: f.fechaCambio,
      madurez: f.madurez,
    });
    // The state column is tinted so a print version is readable at a glance: the
    // auditor pages through a thousand rows, not a screen.
    const celdaEstado = fila.getCell('estado');
    celdaEstado.font = { bold: true, size: 10, color: { argb: 'FF12437F' } };
    celdaEstado.alignment = { horizontal: 'center' };
    celdaEstado.fill =
      f.estado === 'No aplica'
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBFCFB' } }
        : f.estado === 'Aplica con alcance adaptado'
          ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E6' } }
          : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FD' } };
    fila.getCell('codigo').font = { name: 'Consolas', size: 10 };
    fila.getCell('madurez').alignment = { horizontal: 'center' };
    fila.getCell('version').alignment = { horizontal: 'center' };
    fila.getCell('fechaAprobacion').alignment = { horizontal: 'center' };
    fila.getCell('fechaCambio').alignment = { horizontal: 'center' };
  }

  hoja.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: hoja.rowCount, column: CABECERA.length },
  };

  return wb;
}
