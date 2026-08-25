// lib/sgsi/plantilla-libro.ts
//
// Builds the import template workbook, modelled on the client's own
// «FOR-SIG-12 Inventario de activos de información.xlsx».
//
// No Prisma and no session here, on purpose. The route loads the catalogues and checks the
// session; deciding what the FILE looks like happens in this function, where a test can drive
// it with real catalogue rows and then read the produced .xlsx back to prove the dropdowns
// are there. Same split as `plantilla-lectura.ts`: IO at the edge, decisions in the middle.
//
// WHAT FOR-SIG-12 DOES THAT THE FIRST VERSION DID NOT
//
// Its lists are not a reference sheet you read — they are DROPDOWNS you pick from, driven by
// named ranges on a `Listas` sheet. That removes most import errors at the source instead of
// reporting them afterwards: a value chosen from a combo cannot be misspelled, cannot carry a
// stray space, and cannot be an accented variant of a real one.
//
// The mechanism worth copying exactly is its dependent subtype column:
//
//   F8:F241  list  INDIRECT("SUB_"&SUBSTITUTE(SUBSTITUTE(LEFT($E8,FIND("]",$E8)),"[",""),"]",""))
//
// The type cell holds «[SW] Aplicaciones (software)», the formula extracts `SW`, and the
// subtype combo resolves to the named range `SUB_SW`. So the subtype list narrows to the
// chosen type — which prevents the single most common import error there is: a valid subtype
// under the wrong type.
//
// EVERY LIST COMES FROM THE DATABASE, never transcribed. FOR-SIG-12 shows the failure mode
// itself: its Ubicación column is an INLINE list, `"Física,Nube,Local,No aplica"`, and those
// are exactly the four values the catalogue no longer offers.

import type { DataValidation, Workbook, Worksheet } from 'exceljs';
import { COLUMNAS_PLANTILLA } from './plantilla';

/// `worksheet.dataValidations` is real at runtime but absent from exceljs 4.4's `.d.ts`.
///
/// It is used instead of the documented `cell.dataValidation` because that one produces
/// INVALID XML here: assigning it per cell in a loop makes the writer emit two overlapping
/// ranges per column — `D3:D402` beside `D10:D402` — and overlapping data validations are
/// illegal under ECMA-376, so Excel opens the file with «we found a problem with some
/// content». Declaring the collection is the narrower risk: if a future exceljs renames it
/// the build breaks loudly, whereas the per-cell path breaks silently in the user's Excel.
interface ConValidaciones {
  dataValidations: { add(rango: string, validacion: DataValidation): void };
}
const validaciones = (hoja: Worksheet): ConValidaciones['dataValidations'] =>
  (hoja as unknown as ConValidaciones).dataValidations;

/// How many rows carry the dropdowns. FOR-SIG-12 validates 234 rows because that is its
/// inventory; a blank template cannot know how many will be pasted in, and a row past the
/// validated range silently loses its combos.
export const FILAS_CON_COMBO = 400;

/// Row 1 is the header, row 2 the example, so the first fillable row is 3.
const PRIMERA_FILA = 3;

/// The named range behind each column. `null` is free text; `DEPENDIENTE` is the subtype
/// formula, resolved per row.
const RANGO_POR_CLAVE: Record<string, string | null> = {
  codigoHeredado: null,
  nombre: null,
  descripcion: null,
  tipo: 'LstTipo',
  subtipo: 'DEPENDIENTE',
  area: 'LstProceso',
  custodio: 'LstCustodio',
  propietario: 'LstPropietario',
  ubicacion: 'LstUbicacion',
  entorno: 'LstEntorno',
  datosCliente: 'LstSiNo',
  datosPersonales: 'LstSiNo',
  expuestoInternet: 'LstSiNo',
  proveedor: 'LstProveedor',
  valorD: 'LstValor',
  valorI: 'LstValor',
  valorC: 'LstValor',
};

export interface CatalogosPlantilla {
  tipos: { id: number; codigo: string; nombre: string }[];
  subtipos: { tipoId: number; codigo: string; nombre: string }[];
  areas: { nombre: string }[];
  custodios: { nombre: string }[];
  propietarios: { nombre: string }[];
  ubicaciones: { nombre: string }[];
  entornos: { nombre: string }[];
  proveedores: { nombre: string }[];
  escala: { valor: number; etiqueta: string }[];
}

/// Column letter for a 1-based index. Seventeen columns never reach AA, but a silent wrong
/// letter would put a dropdown on the wrong column, so the guard stays.
function letra(indice: number): string {
  if (indice < 1 || indice > 26) throw new Error(`Columna fuera de rango: ${indice}`);
  return String.fromCharCode(64 + indice);
}

/// Writes one list down a column of `Listas` and registers its named range.
///
/// The label sits in row 4 and the values start at row 5, exactly as FOR-SIG-12 lays it out.
/// The range covers ONLY the values: one that included the label would offer «Proveedores»
/// as a choosable provider.
function escribirLista(
  wb: Workbook,
  hoja: Worksheet,
  columna: number,
  nombreRango: string,
  etiqueta: string,
  valores: string[],
): void {
  const col = letra(columna);
  const celda = hoja.getCell(`${col}4`);
  celda.value = etiqueta;
  celda.font = { bold: true, size: 9 };
  hoja.getColumn(columna).width = Math.min(46, Math.max(16, ...valores.map((v) => v.length + 2), 16));

  valores.forEach((v, i) => {
    hoja.getCell(`${col}${5 + i}`).value = v;
  });

  // An empty list would produce Listas!$C$5:$C$4 — an inverted range Excel rejects, and the
  // file then opens with a repair prompt. Clamping to one row keeps the range valid and the
  // combo visibly empty, which is the honest rendering of a catalogue with nothing in it.
  const ultima = 5 + Math.max(0, valores.length - 1);
  wb.definedNames.add(`Listas!$${col}$5:$${col}$${ultima}`, nombreRango);
}

/// Builds the workbook. The caller writes it out.
export async function construirPlantilla(cat: CatalogosPlantilla): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIG Cuantico';

  // --- Sheet 1: the rows to fill --------------------------------------------------
  const hoja = wb.addWorksheet('Activos', { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = COLUMNAS_PLANTILLA.map((c) => ({
    header: c.obligatoria ? `${c.encabezado} *` : c.encabezado,
    key: c.clave,
    width: c.ancho,
  }));

  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true, size: 10 };
  encabezado.alignment = { vertical: 'middle', wrapText: true };
  encabezado.height = 32;
  encabezado.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4EF' } };
    celda.border = { bottom: { style: 'thin', color: { argb: 'FFC9E3D8' } } };
  });

  // One filled row as an example, marked so the importer skips it and nobody wonders whether
  // it is real data.
  const tipo0 = cat.tipos[0];
  const sub0 = cat.subtipos.find((s) => s.tipoId === tipo0?.id);
  hoja.addRow({
    codigoHeredado: 'EJEMPLO — borrá esta fila',
    nombre: 'Servidor de base de datos productiva',
    descripcion: 'Ejemplo. Reemplazá o eliminá esta fila antes de importar.',
    tipo: tipo0 ? `${tipo0.codigo} ${tipo0.nombre}` : '',
    subtipo: sub0 ? `${sub0.codigo} ${sub0.nombre}` : '',
    area: cat.areas[0]?.nombre ?? '',
    custodio: cat.custodios[0]?.nombre ?? '',
    propietario: '',
    ubicacion: cat.ubicaciones[0]?.nombre ?? '',
    entorno: cat.entornos[0]?.nombre ?? '',
    datosCliente: 'Por definir',
    datosPersonales: 'Por definir',
    expuestoInternet: 'No',
    proveedor: '',
    valorD: cat.escala.find((e) => e.valor === 4)?.etiqueta ?? '',
    valorI: cat.escala.find((e) => e.valor === 4)?.etiqueta ?? '',
    valorC: cat.escala.find((e) => e.valor === 3)?.etiqueta ?? '',
  });
  hoja.getRow(2).font = { italic: true, color: { argb: 'FF8A938E' }, size: 10 };

  // --- Sheet 2: the lists that drive the dropdowns --------------------------------
  const listas = wb.addWorksheet('Listas');
  listas.getCell('B2').value = 'LISTAS DE APOYO';
  listas.getCell('B2').font = { bold: true, size: 12 };
  listas.getCell('B3').value =
    'Alimenta los desplegables de la hoja «Activos». Se genera desde la base al descargar la plantilla: no la edites a mano.';
  listas.getCell('B3').font = { size: 9, color: { argb: 'FF8A938E' } };
  listas.getColumn(1).width = 3;
  listas.getColumn(2).width = 3;

  // Column B holds the notes above, so the lists start at C, as in FOR-SIG-12.
  let n = 2;
  const col = () => ++n;

  escribirLista(wb, listas, col(), 'LstProceso', 'Procesos o áreas', cat.areas.map((a) => a.nombre));
  // Two lists, not one. FOR-SIG-12 points both H (custodio) and I (propietario) at a single
  // `LstCargo`, and REQ-SIG-01:212 says the same — the split is a later decision of theirs.
  escribirLista(wb, listas, col(), 'LstCustodio', 'Custodios', cat.custodios.map((c) => c.nombre));
  escribirLista(wb, listas, col(), 'LstPropietario', 'Propietarios', cat.propietarios.map((c) => c.nombre));
  escribirLista(wb, listas, col(), 'LstUbicacion', 'Ubicaciones', cat.ubicaciones.map((u) => u.nombre));
  escribirLista(wb, listas, col(), 'LstEntorno', 'Entornos', cat.entornos.map((e) => e.nombre));
  escribirLista(wb, listas, col(), 'LstProveedor', 'Proveedores', cat.proveedores.map((p) => p.nombre));
  escribirLista(wb, listas, col(), 'LstSiNo', 'Sí / No', ['Sí', 'No', 'Por definir']);
  escribirLista(wb, listas, col(), 'LstValor', 'Escala de valoración', cat.escala.map((e) => e.etiqueta));
  escribirLista(wb, listas, col(), 'LstTipo', 'Tipos MAGERIT', cat.tipos.map((t) => `${t.codigo} ${t.nombre}`));

  // One list per MAGERIT type, named SUB_<CODIGO>, which is what the dependent formula
  // resolves to. `[Media]` becomes SUB_Media — the code inside the brackets verbatim, so a
  // type whose code is not a legal defined name would break the link silently. Those are
  // skipped and reported by the caller rather than producing a dead dropdown.
  const LEGAL = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const conLista: string[] = [];
  const sinLista: string[] = [];
  for (const t of cat.tipos) {
    const codigo = t.codigo.replace(/^\[|\]$/g, '');
    const propios = cat.subtipos.filter((s) => s.tipoId === t.id);
    if (!LEGAL.test(codigo) || propios.length === 0) {
      sinLista.push(t.codigo);
      continue;
    }
    escribirLista(
      wb,
      listas,
      col(),
      `SUB_${codigo}`,
      `Subtipos de ${t.codigo}`,
      propios.map((s) => `${s.codigo} ${s.nombre}`),
    );
    conLista.push(codigo);
  }

  // --- The dropdowns -------------------------------------------------------------
  const indice = new Map(COLUMNAS_PLANTILLA.map((c, i) => [c.clave, i + 1]));
  const colTipo = letra(indice.get('tipo') as number);

  const ultimaFila = PRIMERA_FILA + FILAS_CON_COMBO - 1;

  /// Shared by every column. The two choices in it are deliberate:
  ///
  ///   · `allowBlank` — the optional columns are legitimately empty, and a REQUIRED one left
  ///     empty is reported by the importer with its row number, which is a better error than
  ///     Excel refusing the keystroke without saying why.
  ///   · `errorStyle: 'warning'`, not a stop. A hard stop makes pasting a block impossible,
  ///     and pasting is how an inventory of two hundred rows actually arrives.
  const base = {
    type: 'list' as const,
    allowBlank: true,
    showErrorMessage: true,
    errorStyle: 'warning' as const,
    errorTitle: 'Valor fuera de la lista',
    error:
      'Elegí un valor del desplegable. Si el que necesitás no está, agregalo en el catálogo de la aplicación y volvé a descargar la plantilla.',
  };

  for (const c of COLUMNAS_PLANTILLA) {
    const rango = RANGO_POR_CLAVE[c.clave];
    if (rango === null || rango === undefined) continue;
    const letraCol = letra(indice.get(c.clave) as number);

    if (rango === 'DEPENDIENTE') {
      // The only column that genuinely needs one validation PER ROW: its formula names the
      // type cell of that same row, so there is nothing to coalesce.
      for (let fila = PRIMERA_FILA; fila <= ultimaFila; fila++) {
        validaciones(hoja).add(`${letraCol}${fila}`, {
          ...base,
          formulae: [
            `INDIRECT("SUB_"&SUBSTITUTE(SUBSTITUTE(LEFT($${colTipo}${fila},FIND("]",$${colTipo}${fila})),"[",""),"]",""))`,
          ],
        });
      }
      continue;
    }

    // ONE range per column, not one validation per cell.
    //
    // Assigning `cell.dataValidation` in a loop made exceljs emit TWO overlapping ranges for
    // every column — `D3:D402` next to `D10:D402`. Overlapping data validations are invalid
    // per ECMA-376, and Excel greets the file with «we found a problem with some content»,
    // which is a terrible first impression for a template whose whole job is to be easy.
    validaciones(hoja).add(`${letraCol}${PRIMERA_FILA}:${letraCol}${ultimaFila}`, {
      ...base,
      formulae: [`=${rango}`],
    });
  }

  // --- Sheet 3: how to fill it ---------------------------------------------------
  const notas = wb.addWorksheet('Cómo llenarla');
  notas.getColumn(1).width = 4;
  notas.getColumn(2).width = 112;
  const lineas: [string, boolean][] = [
    ['Cómo llenar la plantilla', true],
    ['', false],
    ['1. Borrá la fila de ejemplo — la fila 2, marcada «EJEMPLO».', false],
    ['2. Casi toda celda tiene desplegable: elegí de la lista en lugar de escribir.', false],
    ['3. Elegí primero el TIPO MAGERIT. El SUBTIPO se limita solo a los subtipos de ese tipo.', false],
    ['', false],
    ['Lo que NO se llena, porque se calcula:', true],
    ['· El código del activo: lo genera el sistema como AAA-TTT-NNNN, inmutable y no reutilizable.', false],
    ['· El valor del activo: es el mayor de D, I y C.', false],
    ['', false],
    ['Sobre las listas:', true],
    [
      'Se generan desde la base cada vez que descargás la plantilla, así que reflejan los catálogos vigentes. Si falta un valor, agregalo en la aplicación — Parámetros, o el botón + en la ficha del activo — y volvé a descargarla. No agregues valores a mano en la hoja «Listas»: no quedan en el sistema y la importación los va a rechazar.',
      false,
    ],
    ['', false],
    [
      `Contenido de esta descarga: ${cat.tipos.length} tipos · ${cat.subtipos.length} subtipos · ${cat.areas.length} procesos · ${cat.custodios.length} custodios · ${cat.propietarios.length} propietarios · ${cat.ubicaciones.length} ubicaciones · ${cat.entornos.length} entornos · ${cat.proveedores.length} proveedores. Los desplegables cubren ${FILAS_CON_COMBO} filas.`,
      false,
    ],
  ];
  if (sinLista.length > 0) {
    lineas.push(['', false]);
    lineas.push([
      `Atención: ${sinLista.join(', ')} no tiene lista de subtipos en esta descarga, así que su columna de subtipo queda sin desplegable.`,
      true,
    ]);
  }
  lineas.forEach(([texto, negrita], i) => {
    const celda = notas.getCell(`B${i + 2}`);
    celda.value = texto;
    celda.font = { bold: negrita, size: negrita ? 11 : 10 };
    celda.alignment = { wrapText: true, vertical: 'top' };
  });

  return wb;
}
