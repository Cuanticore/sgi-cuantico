// lib/sgsi/planes-libro.ts
//
// El libro de «Planes de tratamiento»: dos hojas —los activos en riesgo alto y las acciones
// que los cubren— tal como se ven en la pantalla al momento de exportar.
//
// Mismo corte que `analisis-libro.ts`: SIN Prisma y SIN sesión, a propósito. Este módulo sólo
// decide cómo se ve el ARCHIVO; la ruta arma las filas y comprueba quién puede pedirlas. Eso
// es lo que permite construir el libro en una prueba y leerle las celdas sin levantar nada.
//
// LO QUE ESTE ARCHIVO NO ES: el informe de valoración, que sale de `/sgsi/informe-valoracion`
// sobre el INVENTARIO COMPLETO. Éste es un volcado de dos vistas puntuales —los riesgos altos
// y los planes que los tratan—, y cada hoja lo dice en su propia fila 2 para que nadie las
// confunda seis meses después.
//
// POR QUÉ LA HOJA 1 SE LLAMA «Riesgos altos» Y NO «Riesgos altos o críticos». Medido contra la
// base: la banda Crítico arranca en 25.0 y el residual máximo que el modelo puede producir es
// 13.0, así que hoy hay CERO riesgos en Crítico — y no puede haberlos con la escala actual.
// Titular la hoja con una banda vacía haría pensar que se trataron todos los críticos, cuando
// lo que pasa es que la escala no llega ahí. La nota de la fila 2 lo explica con el mismo
// número.

import ExcelJS from 'exceljs';
import { colorDeNivel, type NivelRiesgo } from './riesgo-activo';

export interface FilaRiesgoAlto {
  codigo: string;
  nombre: string;
  proceso: string;
  propietario: string | null;
  valor: number;
  valores: { D: number; I: number; C: number };
  criticidad: string | null;
  peorInherente: NivelRiesgo | null;
  peorResidual: NivelRiesgo | null;
  /** Cuántas de sus amenazas están en banda Alto o Crítico. */
  amenazasAltas: number;
  /** Los PT que lo cubren. Vacío = ninguno. */
  planes: string[];
}

export interface FilaPlan {
  codigo: string;
  accion: string;
  tipo: string;
  controlCodigo: string | null;
  controlNombre: string | null;
  madurezActual: number | null;
  madurezObjetivo: number | null;
  salto: number | null;
  queMitiga: string;
  responsable: string;
  aprueba: string;
  fechaObjetivo: string | null;
  estado: string;
  avance: number;
  verificacion: string;
  madurezAlcanzada: number | null;
  origen: string;
  recursos: string | null;
  observacion: string | null;
  fechaAprobacion: string | null;
  fechaCierre: string | null;
  instrumento: string | null;
  riesgoRemanente: string | null;
  justificacionAceptacion: string | null;
  fechaRevisionAceptacion: string | null;
}

export interface ContextoLibroPlanes {
  /** Activos vigentes en total, para que la hoja diga «N de M». */
  totalVigentes: number;
  /** Acciones activas en total, antes del filtro de la pantalla. */
  totalAcciones: number;
  /** El filtro que la pantalla tenía puesto, en palabras. `null` = sin filtro. */
  filtro: string | null;
}

/// El azul de `--hf-brand-nav` y el gris de la nota, los mismos ARGB que usa `analisis-libro.ts`
/// — dos hojas del mismo libro de exportación no pueden tener cada una su propio azul.
const AZUL_ENCABEZADO = 'FF12437F';
const GRIS_NOTA = 'FF6B7570';
/// El mismo rosa apagado que marca «sin plan» en el resto del SGSI.
const FILA_SIN_PLAN = 'FFFDECEB';

/// `colorDeNivel` (lib/sgsi/riesgo-activo.ts) devuelve `var(--hf-risk-*)`: es el contrato que
/// necesita la pantalla, donde el navegador resuelve la cascada de CSS. ExcelJS no tiene
/// cascada — no hay hoja de estilos que consultar — así que necesita el HEX de verdad detrás
/// de cada variable. Este diccionario es el mismo mirror literal que ya usan
/// `informe-documento.ts` y `acta-residual-documento.ts` para el mismo problema: los valores
/// son una copia de `app/globals.css`, y si algún día cambian allá, el test de color de este
/// archivo se pone en rojo — no se desincroniza en silencio.
const HEX_DE_VARIABLE: Record<string, string> = {
  '--hf-risk-critico-bg': 'A52016',
  '--hf-risk-critico-fg': 'FFFFFF',
  '--hf-risk-alto-bg': 'C25A1E',
  '--hf-risk-alto-fg': 'FFFFFF',
  '--hf-risk-medio-bg': 'E0B93C',
  '--hf-risk-medio-fg': '3A2C05',
  '--hf-risk-bajo-bg': 'DFE8E2',
  '--hf-risk-bajo-fg': '3D5648',
};

/// Traduce un color CSS —literal o `var(--x)`— al ARGB que pide ExcelJS. Un color que no se
/// pueda traducir no puede tumbar el archivo: se deja sin relleno, que es exactamente lo que
/// «no sé de qué color va» significa.
function argb(css: string): string {
  const variable = /^var\((--[\w-]+)\)$/.exec(css.trim());
  const crudo = variable ? HEX_DE_VARIABLE[variable[1]] : css;
  if (crudo === undefined) return '';
  const hex = crudo.replace('#', '').trim();
  if (hex.length === 6) return `FF${hex.toUpperCase()}`;
  if (hex.length === 8) return hex.toUpperCase();
  return '';
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// Hoja 1 · «Riesgos altos»
// ══════════════════════════════════════════════════════════════════════════════════════════

const COLUMNAS_RIESGOS: { encabezado: string; ancho: number }[] = [
  { encabezado: 'Código', ancho: 18 },
  { encabezado: 'Activo', ancho: 42 },
  { encabezado: 'Proceso', ancho: 26 },
  { encabezado: 'Propietario', ancho: 30 },
  { encabezado: 'Valor', ancho: 8 },
  { encabezado: 'D', ancho: 5 },
  { encabezado: 'I', ancho: 5 },
  { encabezado: 'C', ancho: 5 },
  { encabezado: 'Criticidad', ancho: 12 },
  { encabezado: 'Peor inherente', ancho: 18 },
  { encabezado: 'Peor residual', ancho: 18 },
  { encabezado: 'Amenazas en Alto', ancho: 15 },
  { encabezado: 'Planes', ancho: 26 },
  { encabezado: 'Estado del plan', ancho: 15 },
];

function construirHojaRiesgos(
  wb: ExcelJS.Workbook,
  filas: readonly FilaRiesgoAlto[],
  ctx: ContextoLibroPlanes,
): void {
  const hoja = wb.addWorksheet('Riesgos altos', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  hoja.mergeCells(1, 1, 1, COLUMNAS_RIESGOS.length);
  const titulo = hoja.getCell(1, 1);
  titulo.value = 'Riesgos altos';
  titulo.font = { size: 14, bold: true, color: { argb: AZUL_ENCABEZADO } };
  hoja.getRow(1).height = 22;

  // La nota dice, con sus propios números, por qué la banda Crítico nunca trae filas — para
  // que quien la lea seis meses después no lo confunda con «se trataron todos».
  hoja.mergeCells(2, 1, 2, COLUMNAS_RIESGOS.length);
  const nota = hoja.getCell(2, 1);
  nota.value =
    `${filas.length} activos con riesgo residual en banda Alto, de ${ctx.totalVigentes} vigentes. ` +
    'La banda Crítico no tiene filas: su umbral (25) está por encima del residual máximo que el ' +
    'modelo puede producir. Este filtro NO depende del filtro de la pantalla.';
  nota.font = { size: 9, italic: true, color: { argb: GRIS_NOTA } };
  hoja.getRow(2).height = 14;

  const encabezado = hoja.getRow(3);
  COLUMNAS_RIESGOS.forEach((c, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = c.encabezado;
    celda.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ENCABEZADO } };
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hoja.getColumn(i + 1).width = c.ancho;
  });
  encabezado.height = 20;

  filas.forEach((f) => {
    const sinPlan = f.planes.length === 0;
    const fila = hoja.addRow([
      f.codigo,
      f.nombre,
      f.proceso,
      f.propietario ?? '—',
      f.valor,
      f.valores.D,
      f.valores.I,
      f.valores.C,
      f.criticidad ?? 'sin clasificar',
      textoDeBanda(f.peorInherente),
      textoDeBanda(f.peorResidual),
      f.amenazasAltas,
      sinPlan ? 'sin plan' : f.planes.join(', '),
      sinPlan ? 'Pendiente' : 'Con plan',
    ]);

    fila.font = { size: 10 };
    fila.alignment = { vertical: 'middle' };
    fila.getCell(1).font = { size: 10, bold: true, name: 'Consolas' };
    for (const col of [5, 6, 7, 8, 12]) {
      fila.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' };
    }

    // El renglón entero se tiñe cuando el activo no tiene ni un plan que lo cubra: es lo
    // primero que tiene que saltar a la vista en una hoja que ya de por sí sólo trae riesgo
    // alto.
    if (sinPlan) {
      for (let c = 1; c <= COLUMNAS_RIESGOS.length; c++) {
        fila.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILA_SIN_PLAN } };
      }
    }

    // Las dos bandas, con el color de su casilla en la matriz. `null` NO se pinta: pintarlo
    // diría que el riesgo es alto, y lo que pasa es que no se sabe.
    pintarBanda(fila.getCell(10), f.peorInherente);
    pintarBanda(fila.getCell(11), f.peorResidual);
  });

  hoja.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLUMNAS_RIESGOS.length } };
}

function textoDeBanda(nivel: NivelRiesgo | null): string {
  return nivel === null ? 'sin calcular' : `${nivel.nivel} · ${nivel.banda}`;
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

// ══════════════════════════════════════════════════════════════════════════════════════════
// Hoja 2 · «Planes de tratamiento»
// ══════════════════════════════════════════════════════════════════════════════════════════

/// Primero el orden de la pantalla —hasta «Estado» inclusive—, y detrás lo que en pantalla no
/// cabe. Quien exporta viene de ver la grilla: un archivo que reordene esas primeras once lo
/// obliga a buscar dónde quedó cada columna que ya conocía.
const COLUMNAS_PLANES: { encabezado: string; ancho: number }[] = [
  { encabezado: 'Código', ancho: 16 },
  { encabezado: 'Acción', ancho: 42 },
  { encabezado: 'Tipo', ancho: 14 },
  { encabezado: 'Control', ancho: 32 },
  { encabezado: 'Madurez actual', ancho: 13 },
  { encabezado: 'Madurez objetivo', ancho: 15 },
  { encabezado: 'Salto', ancho: 8 },
  { encabezado: 'Qué mitiga', ancho: 34 },
  { encabezado: 'Responsable', ancho: 24 },
  { encabezado: 'Fecha objetivo', ancho: 14 },
  { encabezado: 'Estado', ancho: 14 },
  { encabezado: 'Avance', ancho: 10 },
  { encabezado: 'Verificación', ancho: 30 },
  { encabezado: 'Madurez alcanzada', ancho: 16 },
  { encabezado: 'Aprueba', ancho: 24 },
  { encabezado: 'Origen y justificación', ancho: 34 },
  { encabezado: 'Recursos', ancho: 24 },
  { encabezado: 'Observaciones', ancho: 30 },
  { encabezado: 'Fecha de aprobación', ancho: 16 },
  { encabezado: 'Fecha de cierre', ancho: 14 },
  { encabezado: 'Instrumento', ancho: 20 },
  { encabezado: 'Riesgo remanente', ancho: 24 },
  { encabezado: 'Justificación de la aceptación', ancho: 34 },
  { encabezado: 'Fecha de revisión', ancho: 16 },
];

function construirHojaPlanes(
  wb: ExcelJS.Workbook,
  filas: readonly FilaPlan[],
  ctx: ContextoLibroPlanes,
): void {
  const hoja = wb.addWorksheet('Planes de tratamiento', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  hoja.mergeCells(1, 1, 1, COLUMNAS_PLANES.length);
  const titulo = hoja.getCell(1, 1);
  titulo.value = 'Planes de tratamiento';
  titulo.font = { size: 14, bold: true, color: { argb: AZUL_ENCABEZADO } };
  hoja.getRow(1).height = 22;

  hoja.mergeCells(2, 1, 2, COLUMNAS_PLANES.length);
  const nota = hoja.getCell(2, 1);
  const filtro = ctx.filtro === null ? ' Sin filtro.' : ` Filtro aplicado: ${ctx.filtro}.`;
  nota.value = `${filas.length} acciones de ${ctx.totalAcciones} activas.${filtro}`;
  nota.font = { size: 9, italic: true, color: { argb: GRIS_NOTA } };
  hoja.getRow(2).height = 14;

  const encabezado = hoja.getRow(3);
  COLUMNAS_PLANES.forEach((c, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = c.encabezado;
    celda.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ENCABEZADO } };
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hoja.getColumn(i + 1).width = c.ancho;
  });
  encabezado.height = 20;

  filas.forEach((p) => {
    const sinControl = p.controlCodigo === null;
    const fila = hoja.addRow([
      p.codigo,
      p.accion,
      p.tipo,
      sinControl ? 'sin control' : `${p.controlCodigo} · ${p.controlNombre ?? ''}`,
      // Sin control, las tres quedan VACÍAS — nunca en cero: un cero diría que el salto es
      // cero, y lo que pasa es que la fila no aplica. `FilaPlan` ya llega con `null` en las
      // tres cuando no hay control, así que pasar el valor tal cual basta.
      p.madurezActual,
      p.madurezObjetivo,
      p.salto,
      p.queMitiga,
      p.responsable,
      p.fechaObjetivo ?? '—',
      p.estado,
      p.avance,
      p.verificacion,
      p.madurezAlcanzada,
      p.aprueba,
      p.origen,
      p.recursos ?? '—',
      p.observacion ?? '—',
      p.fechaAprobacion ?? '—',
      p.fechaCierre ?? '—',
      p.instrumento ?? '—',
      p.riesgoRemanente ?? '—',
      p.justificacionAceptacion ?? '—',
      p.fechaRevisionAceptacion ?? '—',
    ]);

    fila.font = { size: 10 };
    fila.alignment = { vertical: 'middle', wrapText: true };
    fila.getCell(1).font = { size: 10, bold: true, name: 'Consolas' };
    for (const col of [5, 6, 7, 12, 14]) {
      fila.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' };
    }
  });

  hoja.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLUMNAS_PLANES.length } };
}

// ══════════════════════════════════════════════════════════════════════════════════════════

export async function construirLibroPlanes(
  riesgos: readonly FilaRiesgoAlto[],
  planes: readonly FilaPlan[],
  ctx: ContextoLibroPlanes,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIG CUANTICO';
  wb.created = new Date();

  construirHojaRiesgos(wb, riesgos, ctx);
  construirHojaPlanes(wb, planes, ctx);

  return wb;
}
