// lib/sig/pendientes-libro.ts
//
// Cómo se ve el archivo de pendientes exportado. Una hoja, una fila por asignación abierta.
//
// **Sin Prisma y sin sesión, a propósito.** La ruta comprueba la sesión y trae las filas;
// esto sólo decide cómo se ve el FILE, así que una prueba puede construir el libro y leerlo
// de vuelta. Es el mismo corte que `lib/sgsi/inventario-libro.ts` explica en su encabezado,
// y es lo que permite que el formato esté probado sin montar la pantalla ni tocar la base.
//
// ── LA REGLA QUE ESTE ARCHIVO EXISTE PARA SOSTENER ───────────────────────────────────────
//
// Un curso cuyo paquete no reporta avance deja la celda **vacía**. No en cero.
//
// En una pantalla, un cero y un hueco se distinguen mirando. En una hoja de cálculo no: el
// cero se suma, se promedia y entra a un gráfico. Es la peor superficie posible para
// confundir «no sé» con «cero», y por eso el caso tiene prueba propia.

import ExcelJS from 'exceljs';

/// El encabezado, exportado porque es el contrato: la prueba lo compara y la ruta no lo
/// vuelve a escribir. Dos listas de columnas son dos listas que mañana discrepan.
export const ENCABEZADOS = [
  'Código',
  'Título',
  'Tipo',
  'Persona',
  'Correo',
  'Área',
  'Cargo',
  'Periodo',
  'Fecha límite',
  'Días',
  'Estado del plazo',
  'Avance del curso',
  'Intentos',
] as const;

export interface FilaPendienteExport {
  codigo: string;
  titulo: string;
  tipo: string;
  persona: string;
  correo: string;
  area: string | null;
  cargo: string | null;
  periodo: string;
  /// `YYYY-MM-DD`.
  fechaLimite: string;
  /// Días hasta el vencimiento; **negativos cuando ya venció**, para que ordenar por esta
  /// columna ponga arriba lo que más urge sin tener que leer la de al lado.
  dias: number;
  vencida: boolean;
  /// 0–100, o `null` cuando el paquete no reportó avance. `null` **no** es 0.
  avance: number | null;
  intentos: number;
}

export async function construirLibroPendientes(
  filas: FilaPendienteExport[],
  titulo: string,
): Promise<ExcelJS.Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIG Cuántico';
  libro.created = new Date();

  // El nombre de la hoja es fijo y el título descriptivo va en las propiedades del libro:
  // Excel corta los nombres de hoja a 31 caracteres y prohíbe varios signos, así que
  // «Pendientes de <nombre largo>» llegaría mutilado o rompería el archivo.
  const hoja = libro.addWorksheet('Pendientes');
  libro.title = titulo;

  hoja.columns = ENCABEZADOS.map((h) => ({ header: h, width: anchoDe(h) }));
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];

  for (const f of filas) {
    hoja.addRow([
      f.codigo,
      f.titulo,
      f.tipo,
      f.persona,
      f.correo,
      // `null` y no cadena vacía: una celda vacía se filtra como vacía, y un `''` no.
      f.area,
      f.cargo,
      f.periodo,
      f.fechaLimite,
      f.dias,
      f.vencida ? 'Vencida' : 'En plazo',
      // **Acá está la regla.** `null` deja la celda vacía; un 0 reportado sí se escribe.
      f.avance,
      f.intentos,
    ]);
  }

  // Un autofiltro sobre el encabezado, aunque no haya filas: quien abre el archivo vacío ve
  // igual qué columnas tiene, que es parte de la respuesta «no tiene nada abierto».
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ENCABEZADOS.length } };

  return libro.xlsx.writeBuffer();
}

function anchoDe(encabezado: string): number {
  if (encabezado === 'Título') return 42;
  if (encabezado === 'Persona' || encabezado === 'Correo') return 30;
  if (encabezado === 'Área' || encabezado === 'Cargo') return 24;
  if (encabezado === 'Estado del plazo' || encabezado === 'Avance del curso') return 18;
  return 14;
}
