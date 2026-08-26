// lib/sgsi/inventario-libro.ts
//
// Builds the asset inventory export workbook, replicating the client's own
// «FOR-SIG-12 Inventario de activos de información.xlsx» — the reference file the team
// fills by hand — so the exported document IS the form, not a report ABOUT it.
//
// Mirror of the reference structure:
//
//   Dashboard           KPI summary (total, críticos, valor promedio…)
//   Matriz de Activos   one row per asset, dropdowns per column, row 8 onward
//   Listas              the catalogues that drive the dropdowns, as named ranges
//
// No Prisma and no session here, on purpose. The route checks the session and loads the
// rows; this function only decides what the FILE looks like, so a test can build the
// workbook and read its dropdowns back. Same split as `plantilla-libro.ts`.
//
// The columns and the named ranges reproduce the reference letter for letter: the
// dropdowns work because the same names (LstTipo, LstCargo, SUB_<CODIGO>…) resolve to the
// same places. What is ours and not in the form — código heredado, riesgo inherente,
// riesgo residual — travels after U, as a plain column with a header, so the matrix stays
// the form and the host still has the data.

import ExcelJS from 'exceljs';

export interface FilaActivoExport {
  codigo: string;
  codigoHeredado: string | null;
  nombre: string;
  descripcion: string;
  tipo: string; // "[SW] Aplicaciones (software)"
  subtipo: string; // "[prp] Desarrollo propio"
  proceso: string;
  custodio: string | null;
  propietario: string | null;
  ubicacion: string | null;
  entorno: string | null;
  datosCliente: 'Sí' | 'No' | 'Por definir';
  datosPersonales: 'Sí' | 'No' | 'Por definir';
  expuestoInternet: 'Sí' | 'No' | 'Por definir';
  proveedor: string | null;
  superior: string | null;
  valorD: string; // "4 — Alto"
  valorI: string;
  valorC: string;
  valorActivo: number;
  nivelActivo: string;
  riesgoInherente: string | null;
  riesgoResidual: string | null;
}

export interface CatalogosExportActivos {
  tipos: { id: number; codigo: string; nombre: string }[];
  subtipos: { tipoId: number; codigo: string; nombre: string }[];
  procesos: string[];
  responsables: string[];
  proveedores: string[];
  entornos: string[];
  ubicaciones: string[];
  escala: { valor: number; etiqueta: string }[];
}

/// Column letter for a 1-based index.
function letra(indice: number): string {
  if (indice < 1 || indice > 26) throw new Error(`Columna fuera de rango: ${indice}`);
  return String.fromCharCode(64 + indice);
}

interface ConValidaciones {
  dataValidations: { add(rango: string, validacion: ExcelJS.DataValidation): void };
}
const validaciones = (hoja: ExcelJS.Worksheet): ConValidaciones['dataValidations'] =>
  (hoja as unknown as ConValidaciones).dataValidations;

/// The 21 columns of the Matriz de Activos, in the reference's own order and wording.
/// Column letters B..U are fixed by the letter the reference uses.
const COLUMNAS: { letra: string; encabezado: string; ancho: number; rango: string | null }[] = [
  { letra: 'B', encabezado: 'Código', ancho: 14, rango: null },
  { letra: 'C', encabezado: 'Nombre del activo', ancho: 38, rango: null },
  { letra: 'D', encabezado: 'Descripción', ancho: 46, rango: null },
  { letra: 'E', encabezado: 'Tipo de activo', ancho: 30, rango: 'LstTipo' },
  { letra: 'F', encabezado: 'Subtipo de activo', ancho: 32, rango: 'DEPENDIENTE' },
  { letra: 'G', encabezado: 'Proceso o área', ancho: 24, rango: 'LstProceso' },
  { letra: 'H', encabezado: 'Responsable (custodio)', ancho: 24, rango: 'LstCargo' },
  { letra: 'I', encabezado: 'Propietario del activo', ancho: 24, rango: 'LstCargo' },
  { letra: 'J', encabezado: 'Ubicación', ancho: 18, rango: 'LstUbicacion' },
  { letra: 'K', encabezado: 'Entorno', ancho: 16, rango: 'LstEntorno' },
  { letra: 'L', encabezado: '¿Contiene datos de cliente?', ancho: 20, rango: 'LstSiNo' },
  { letra: 'M', encabezado: '¿Contiene datos personales (Ley 1581)?', ancho: 24, rango: 'LstSiNo' },
  { letra: 'N', encabezado: '¿Está expuesto a Internet?', ancho: 20, rango: 'LstSiNo' },
  { letra: 'O', encabezado: 'Proveedor o subencargado', ancho: 24, rango: 'LstProveedor' },
  { letra: 'P', encabezado: 'Depende del activo superior', ancho: 24, rango: 'LstActivo' },
  { letra: 'Q', encabezado: 'Valor en Disponibilidad', ancho: 20, rango: 'MgValorEt' },
  { letra: 'R', encabezado: 'Valor en Integridad', ancho: 20, rango: 'MgValorEt' },
  { letra: 'S', encabezado: 'Valor en Confidencialidad', ancho: 20, rango: 'MgValorEt' },
  { letra: 'T', encabezado: 'Valor del activo (0 a 5)', ancho: 18, rango: null },
  { letra: 'U', encabezado: 'Nivel del activo', ancho: 16, rango: null },
];

const VALORES_SI_NO = ['Sí', 'No', 'Por definir'];

/// The reference writes the level from a lookup unit on the same 0–5 scale.
function nivelPorValor(escala: { valor: number; etiqueta: string }[]): Map<number, string> {
  return new Map(escala.map((e) => [e.valor, e.etiqueta.split('—')[1]?.trim() ?? e.etiqueta]));
}

enum Fila { TITULO = 2, VERSION = 3, FECHA = 4, ENCABEZADO = 7, DATOS = 8 }

/// Writes one list down a column of `Listas` and registers its named range: label at row 5
/// (row 4 holds the title in the reference), values from row 6 onward.
function escribirLista(
  wb: ExcelJS.Workbook,
  hoja: ExcelJS.Worksheet,
  columna: string,
  nombreRango: string,
  etiqueta: string,
  valores: string[],
): void {
  hoja.getCell(`${columna}5`).value = etiqueta;
  hoja.getCell(`${columna}5`).font = { bold: true, size: 9 };
  const ancho = valores.reduce((m, v) => Math.max(m, v.length), Math.max(etiqueta.length, 16));
  hoja.getColumn(columna).width = Math.min(46, ancho + 2);

  valores.forEach((v, i) => {
    hoja.getCell(`${columna}${6 + i}`).value = v;
  });

  const ultima = 6 + Math.max(0, valores.length - 1);
  wb.definedNames.add(`Listas!$${columna}$6:$${columna}$${ultima}`, nombreRango);
}

export async function construirLibroInventario(
  filas: FilaActivoExport[],
  cat: CatalogosExportActivos,
): Promise<ExcelJS.Workbook> {
  const ExcelJSModule = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIG Cuantico';

  // --- Sheet 1: Dashboard ---------------------------------------------------------
  const dash = wb.addWorksheet('Dashboard');
  dash.getCell('B2').value = 'DASHBOARD — INVENTARIO DE ACTIVOS DE INFORMACIÓN';
  dash.getCell('B2').font = { bold: true, size: 14 };
  dash.getCell('B3').value = "FOR-SIG-12 · Fuente: hoja «Matriz de Activos»";
  dash.getCell('B3').font = { italic: true, size: 9, color: { argb: 'FF8A938E' } };

  const ultimaFila = Fila.DATOS + Math.max(0, filas.length - 1);
  const filasDatos = filas.length === 0 ? 1 : filas.length;

  const marcas = [
    ['', 'Total de activos', `=COUNTA('Matriz de Activos'!C${Fila.DATOS}:C${ultimaFila})`],
    ['', 'Activos críticos (Alto + Muy Alto)', `=COUNTIF('Matriz de Activos'!U${Fila.DATOS}:U${ultimaFila},"Muy Alto")+COUNTIF('Matriz de Activos'!U${Fila.DATOS}:U${ultimaFila},"Alto")`],
    ['', '% de activos críticos', `=ROUND((COUNTIF('Matriz de Activos'!U${Fila.DATOS}:U${ultimaFila},"Muy Alto")+COUNTIF('Matriz de Activos'!U${Fila.DATOS}:U${ultimaFila},"Alto"))/COUNTA('Matriz de Activos'!C${Fila.DATOS}:C${ultimaFila})*100,1)&"%"`],
    ['', 'Valor promedio del activo', `=ROUND(AVERAGE('Matriz de Activos'!T${Fila.DATOS}:T${ultimaFila}),2)`],
    ['', '% con descripción diligenciada', `=ROUND(COUNTIF('Matriz de Activos'!D${Fila.DATOS}:D${ultimaFila},"?*")/COUNTA('Matriz de Activos'!C${Fila.DATOS}:C${ultimaFila})*100,1)&"%"`],
  ] as const;
  marcas.forEach(([, etiqueta, formula], i) => {
    const r = 5 + i;
    dash.getCell(`B${r}`).value = etiqueta;
    dash.getCell(`B${r}`).font = { bold: true, size: 10 };
    dash.getCell(`C${r}`).value = { formula };
    dash.getCell(`C${r}`).font = { bold: true, size: 11 };
  });
  dash.getColumn('B').width = 34;
  dash.getColumn('C').width = 22;
  void filasDatos;

  // --- Sheet 2: Matriz de Activos ------------------------------------------------
  const matriz = wb.addWorksheet('Matriz de Activos');
  matriz.getCell('B2').value = 'INVENTARIO DE ACTIVOS DE INFORMACIÓN';
  matriz.getCell('B2').font = { bold: true, size: 14 };
  matriz.getCell('C3').value = 'Versión';
  matriz.getCell('D3').value = 1;
  matriz.getCell('C4').value = 'Fecha';
  matriz.getCell('D4').value = new Date();
  matriz.getCell('D4').numFmt = 'dd/mm/yyyy';

  const nivelPorValorMap = nivelPorValor(cat.escala);

  filas.forEach((f, i) => {
    const r = Fila.DATOS + i;
    const valores: Record<string, string | number | null> = {
      B: f.codigo,
      C: f.nombre,
      D: f.descripcion,
      E: f.tipo,
      F: f.subtipo,
      G: f.proceso,
      H: f.custodio,
      I: f.propietario,
      J: f.ubicacion,
      K: f.entorno,
      L: f.datosCliente,
      M: f.datosPersonales,
      N: f.expuestoInternet,
      O: f.proveedor,
      P: f.superior,
      Q: f.valorD,
      R: f.valorI,
      S: f.valorC,
      T: f.valorActivo,
      U: f.nivelActivo,
      W: f.codigoHeredado,
      X: f.riesgoInherente,
      Y: f.riesgoResidual,
    };
    for (const [letraCol, valor] of Object.entries(valores)) {
      if (valor !== null) matriz.getCell(`${letraCol}${r}`).value = valor;
    }
  });

  // Header in row 7, styled like the form; data from row 8 down.
  for (const col of COLUMNAS) {
    const celda = matriz.getCell(`${col.letra}${Fila.ENCABEZADO}`);
    celda.value = col.encabezado;
    celda.font = { bold: true, size: 10 };
    celda.alignment = { vertical: 'middle', wrapText: true };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12437F' } };
    celda.border = { bottom: { style: 'thin', color: { argb: 'FF0E2F5B' } } };
    matriz.getColumn(col.letra).width = col.ancho;
  }
  // Carries the fields the form does not have (código heredado, riesgo).
  for (const letraCol of ['W', 'X', 'Y']) {
    matriz.getColumn(letraCol).width = 20;
  }
  matriz.getCell('W7').value = 'Código heredado';
  matriz.getCell('X7').value = 'Riesgo inherente';
  matriz.getCell('Y7').value = 'Riesgo residual';
  matriz.views = [{ state: 'frozen', ySplit: Fila.ENCABEZADO }];

  // Dropdowns from the named ranges — the columns the form defines.
  for (const col of COLUMNAS) {
    if (!col.rango) continue;
    if (col.rango === 'DEPENDIENTE') {
      for (let r = Fila.DATOS; r <= ultimaFila; r++) {
        validaciones(matriz).add(`${col.letra}${r}`, {
          type: 'list',
          allowBlank: true,
          formulae: [
            `INDIRECT("SUB_"&SUBSTITUTE(SUBSTITUTE(LEFT($E${r},FIND("]",$E${r})),"[",""),"]",""))`,
          ],
        });
      }
      continue;
    }
    validaciones(matriz).add(`${col.letra}${Fila.DATOS}:${col.letra}${ultimaFila}`, {
      type: 'list',
      allowBlank: true,
      formulae: [`=${col.rango}`],
    });
  }

  // --- Sheet 3: Listas -----------------------------------------------------------
  const listas = wb.addWorksheet('Listas');
  listas.getCell('B2').value = 'LISTAS DE APOYO';
  listas.getCell('B2').font = { bold: true, size: 12 };
  listas.getCell('B3').value =
    'Alimenta los desplegables de la hoja «Matriz de Activos». Se genera desde la base al exportar: no la edites a mano.';
  listas.getCell('B3').font = { size: 9, color: { argb: 'FF8A938E' } };
  listas.getColumn('A').width = 3;
  listas.getColumn('B').width = 3;

  const escribir = (letraCol: string, nombre: string, etiqueta: string, valores: string[]) =>
    escribirLista(wb, listas, letraCol, nombre, etiqueta, valores);

  escribir('C', 'LstProceso', 'Proceso', cat.procesos);
  escribir('D', 'LstCargo', 'Cargo', cat.responsables);
  escribir('E', 'LstProveedor', 'Proveedor', cat.proveedores);
  escribir('F', 'LstEntorno', 'Entorno', cat.entornos);
  escribir('G', 'LstUbicacion', 'Ubicación', cat.ubicaciones);
  escribir('H', 'LstSiNo', 'Sí / No', VALORES_SI_NO);
  escribir('I', 'LstTipo', 'Tipo', cat.tipos.map((t) => `${t.codigo} ${t.nombre}`));
  escribir('J', 'MgValorEt', 'Escala', cat.escala.map((e) => e.etiqueta));
  escribir('K', 'LstActivo', 'Activo', filas.map((f) => f.codigo).filter(Boolean));

  // Subtipos by type, under SUB_<CODIGO>, as the dependent formula expects.
  const LEGAL = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const letrasSub = ['L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V'];
  let iSub = 0;
  for (const t of cat.tipos) {
    const codigo = t.codigo.replace(/^\[|\]$/g, '');
    const propios = cat.subtipos.filter((s) => s.tipoId === t.id);
    if (!LEGAL.test(codigo) || propios.length === 0) continue;
    const letraCol = letrasSub[iSub++];
    if (!letraCol) break; // 11 types max (10 today), layout is wide but finite.
    escribir(letraCol, `SUB_${codigo}`, `Subtipo ${t.codigo}`, propios.map((s) => `${s.codigo} ${s.nombre}`));
  }

  return wb;
}
