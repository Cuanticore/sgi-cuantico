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
// queda además bajo nuestro control — los colores de banda salen de la MISMA paleta que pinta
// la pantalla (`PALETA_RIESGO` en `riesgo-activo.ts`), cosa que el export de la librería no
// podría saber.
//
// ESA AFIRMACIÓN FUE FALSA HASTA EL 22/09/2026, y conviene que quede escrito. `argb()` sólo
// entendía hex de 6 u 8 caracteres, y lo que `colorDeNivel` devuelve es `var(--hf-risk-*)`:
// devolvía `''`, `pintarBanda` se salía antes del relleno y antes de la fuente, y las columnas
// «Peor inherente» y «Peor residual» salían en TEXTO PLANO mientras esta cabecera prometía lo
// contrario. Sobrevivió porque ninguna prueba leía el archivo generado, sólo la clase en
// pantalla; `__tests__/analisis-libro.test.ts` lee ahora el relleno de la celda.
//
// LO QUE ESTE ARCHIVO NO ES: el informe de valoración. Ése sale de `/sgsi/informe-valoracion`
// sobre el inventario completo. Éste es un volcado de lo que quien exporta está viendo, y la
// hoja lo dice en su primera línea para que no se confundan seis meses después.

import ExcelJS from 'exceljs';
import { colorDeNivel, hexDeColorDeRiesgo, type NivelRiesgo } from './riesgo-activo';
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

/// Una fila de la MATRIZ: el par (activo, amenaza), que es la unidad que se trata.
///
/// POR QUÉ ES OTRA UNIDAD Y NO UNA COLUMNA MÁS. La hoja por activo contesta «¿cuál activo está
/// peor?»; una matriz de riesgos contesta «¿cuáles riesgos hay que tratar, y sobre qué activo?».
/// Son dos preguntas, y meter la segunda en la primera obliga a que una celda lleve una lista —
/// que es lo que la hoja «Por activo» hace en su última columna, a propósito, para quien quiera
/// el resumen y no el detalle.
///
/// `id` NO SE GENERA ACÁ. Es el código del registro `riesgo` —`R-0512`—, el mismo que usan el
/// motor, los planes y las actas. Un consecutivo inventado para el Excel le daría al archivo una
/// identidad que ningún otro sitio del sistema reconoce.
export interface FilaRiesgoExport {
  id: string;
  amenazaCodigo: string;
  amenaza: string;
  activoCodigo: string;
  activoNombre: string;
  valor: number;
  valores: { D: number; I: number; C: number };
  criticidad: string | null;
  proceso: string;
  propietario: string | null;
  residual: NivelRiesgo | null;
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
  // La columna 14: el detalle resumido. Quien quiera la fila por riesgo tiene la otra hoja;
  // ésta es para leer de un vistazo QUÉ amenazas obligan a tratar este activo. Vacía cuando no
  // hay ninguna en banda alta, que es información y no un hueco.
  { encabezado: 'Riesgos Alto y Crítico', ancho: 46 },
];

/// Sin `#`, y en ARGB: ExcelJS no acepta el `#rrggbb` de CSS.
///
/// La `var(--hf-risk-*)` la resuelve `hexDeColorDeRiesgo` contra `PALETA_RIESGO`, el único
/// dueño del hex. Este archivo NO tiene su propio diccionario de colores a propósito: tenerlo
/// —o no tenerlo, que fue el caso— es de donde vino el defecto de las dos columnas en blanco.
function argb(css: string): string {
  const hex = (hexDeColorDeRiesgo(css) ?? '').replace('#', '').trim();
  if (hex.length === 6) return `FF${hex.toUpperCase()}`;
  if (hex.length === 8) return hex.toUpperCase();
  // Un color que no se pueda traducir no puede tumbar el archivo: se deja sin relleno, que
  // es exactamente lo que «no sé de qué color va» significa.
  return '';
}

/// Las columnas de la matriz, en el orden del formato que el SIG ya usa en su libro.
const COLUMNAS_MATRIZ: { encabezado: string; ancho: number }[] = [
  { encabezado: 'Id', ancho: 12 },
  { encabezado: 'Riesgo', ancho: 46 },
  { encabezado: 'Código activo', ancho: 18 },
  { encabezado: 'Nombre del activo', ancho: 42 },
  { encabezado: 'Valor', ancho: 8 },
  { encabezado: 'D', ancho: 5 },
  { encabezado: 'I', ancho: 5 },
  { encabezado: 'C', ancho: 5 },
  { encabezado: 'Criticidad', ancho: 14 },
  { encabezado: 'Proceso', ancho: 26 },
  { encabezado: 'Propietario', ancho: 30 },
  { encabezado: 'Riesgo Residual', ancho: 18 },
];

export async function construirLibroAnalisis(
  filas: readonly FilaAnalisisExport[],
  riesgos: readonly FilaRiesgoExport[],
  ctx: ContextoLibroAnalisis,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIG CUANTICO';
  wb.created = new Date();

  // LA MATRIZ VA PRIMERO, y no es orden alfabético: es la hoja que se vino a buscar. La de por
  // activo queda detrás, para quien necesite el panorama completo del análisis.
  hojaMatriz(wb, riesgos);

  const hoja = wb.addWorksheet('Por activo', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // ── Fila 1 · el título ──────────────────────────────────────────────────────────────
  hoja.mergeCells(1, 1, 1, COLUMNAS.length);
  const titulo = hoja.getCell(1, 1);
  titulo.value = 'Análisis de riesgos · por activo';
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

  // Las amenazas altas de cada activo, agrupadas una sola vez y no dentro del bucle: con 30
  // activos y 29 riesgos la diferencia no se nota, pero recorrer la lista entera por fila es
  // cuadrático y este libro también lo genera quien exporta 378.
  const altasPorActivo = new Map<string, string[]>();
  for (const r of riesgos) {
    const lista = altasPorActivo.get(r.activoCodigo);
    const texto = `${r.amenazaCodigo} · ${r.amenaza}`;
    if (lista) lista.push(texto);
    else altasPorActivo.set(r.activoCodigo, [texto]);
  }

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
      (altasPorActivo.get(f.codigo) ?? []).join('\n'),
    ]);

    fila.getCell(14).alignment = { vertical: 'top', wrapText: true };
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

/// La hoja de la matriz: una fila por par (activo, amenaza) en banda Alto o Crítico.
///
/// LOS DATOS DEL ACTIVO SE REPITEN EN CADA FILA, y es deliberado. Combinar las celdas del activo
/// se vería como la matriz en papel, pero **las celdas combinadas rompen el autofiltro y el
/// ordenamiento de Excel**, y este formato lleva filtro en todos los encabezados. Un archivo más
/// bonito que no se puede filtrar es peor que uno repetitivo que sí.
function hojaMatriz(wb: ExcelJS.Workbook, riesgos: readonly FilaRiesgoExport[]): void {
  const hoja = wb.addWorksheet('Matriz de riesgos', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  hoja.mergeCells(1, 1, 1, COLUMNAS_MATRIZ.length);
  const titulo = hoja.getCell(1, 1);
  titulo.value = 'Matriz de riesgos';
  titulo.font = { size: 14, bold: true, color: { argb: AZUL_ENCABEZADO } };
  hoja.getRow(1).height = 22;

  const activos = new Set(riesgos.map((r) => r.activoCodigo)).size;
  hoja.mergeCells(2, 1, 2, COLUMNAS_MATRIZ.length);
  const nota = hoja.getCell(2, 1);
  nota.value =
    `${riesgos.length} riesgo(s) en banda Alto o Crítico, sobre ${activos} activo(s). ` +
    'Una fila por par activo–amenaza; el Id es el del riesgo en la aplicación.';
  nota.font = { size: 9, italic: true, color: { argb: GRIS_NOTA } };
  hoja.getRow(2).height = 14;

  const encabezado = hoja.getRow(3);
  COLUMNAS_MATRIZ.forEach((c, i) => {
    const celda = encabezado.getCell(i + 1);
    celda.value = c.encabezado;
    celda.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ENCABEZADO } };
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hoja.getColumn(i + 1).width = c.ancho;
  });
  encabezado.height = 20;

  riesgos.forEach((r) => {
    const fila = hoja.addRow([
      r.id,
      r.amenaza,
      r.activoCodigo,
      r.activoNombre,
      r.valor,
      r.valores.D,
      r.valores.I,
      r.valores.C,
      r.criticidad ?? 'sin clasificar',
      r.proceso,
      r.propietario ?? '—',
      textoDeNivelExport(r.residual),
    ]);

    fila.font = { size: 10 };
    fila.alignment = { vertical: 'middle' };
    fila.getCell(1).font = { size: 10, bold: true, name: 'Consolas' };
    fila.getCell(3).font = { size: 10, bold: true, name: 'Consolas' };
    for (const col of [5, 6, 7, 8]) {
      fila.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' };
    }

    // Toda fila de esta hoja es alarmante por construcción —por eso está acá—, así que el
    // tinte no discrimina nada y se omite: lo que discrimina es la banda, y ésa va con color.
    const relleno = argb(colorDeNivelValor(r.valor));
    if (relleno !== '') {
      fila.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: relleno } };
      fila.getCell(5).font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    }
    pintarBanda(fila.getCell(12), r.residual);
  });

  hoja.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLUMNAS_MATRIZ.length } };
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
