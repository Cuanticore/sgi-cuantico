// lib/sgsi/plantilla.ts
//
// The import template's contract: which columns exist, in what order, and which ones are
// required. It lives here — not in the server action — because three places need it and
// they must not drift: the route that generates the .xlsx, the action that reads it back,
// and the popup that renders the preview table.
//
// No 'server-only' guard: the popup is a client component and shows these headers.

export interface ColumnaPlantilla {
  clave: string;
  encabezado: string;
  /// Column width in the generated workbook.
  ancho: number;
  obligatoria: boolean;
}

/// The template's shape. Column ORDER is the contract: the reader addresses cells by
/// position, so inserting a column in the middle changes what an already distributed
/// template means. Append at the end.
export const COLUMNAS_PLANTILLA: ColumnaPlantilla[] = [
  { clave: 'codigoHeredado', encabezado: 'Código heredado', ancho: 20, obligatoria: false },
  { clave: 'nombre', encabezado: 'Nombre del activo', ancho: 38, obligatoria: true },
  { clave: 'descripcion', encabezado: 'Descripción', ancho: 44, obligatoria: false },
  { clave: 'tipo', encabezado: 'Tipo MAGERIT', ancho: 30, obligatoria: true },
  { clave: 'subtipo', encabezado: 'Subtipo', ancho: 32, obligatoria: true },
  { clave: 'area', encabezado: 'Proceso o área', ancho: 28, obligatoria: true },
  { clave: 'custodio', encabezado: 'Custodio', ancho: 26, obligatoria: true },
  { clave: 'propietario', encabezado: 'Propietario', ancho: 26, obligatoria: false },
  { clave: 'ubicacion', encabezado: 'Ubicación', ancho: 18, obligatoria: false },
  { clave: 'entorno', encabezado: 'Entorno', ancho: 18, obligatoria: false },
  { clave: 'datosCliente', encabezado: '¿Contiene datos de cliente?', ancho: 22, obligatoria: false },
  {
    clave: 'datosPersonales',
    encabezado: '¿Contiene datos personales (Ley 1581)?',
    ancho: 24,
    obligatoria: false,
  },
  { clave: 'expuestoInternet', encabezado: '¿Está expuesto a Internet?', ancho: 22, obligatoria: false },
  { clave: 'proveedor', encabezado: 'Proveedor', ancho: 26, obligatoria: false },
  { clave: 'valorD', encabezado: 'Valor en Disponibilidad', ancho: 20, obligatoria: true },
  { clave: 'valorI', encabezado: 'Valor en Integridad', ancho: 20, obligatoria: true },
  { clave: 'valorC', encabezado: 'Valor en Confidencialidad', ancho: 20, obligatoria: true },
];

/// The columns the preview table shows. The full seventeen do not fit in a popup, and
/// these are the ones a person checks before committing: what it is, where it goes, and
/// how it is valued.
export const COLUMNAS_PREVISTA = [
  'codigoHeredado',
  'nombre',
  'tipo',
  'subtipo',
  'area',
  'custodio',
  'valorD',
  'valorI',
  'valorC',
] as const;

/// One row as it was read, with its verdict. `lectura` echoes the raw cell text so the
/// preview shows what the person actually typed, not the id it resolved to.
export interface FilaLeida {
  /// Row number in the sheet, so an error message points at a line they can find.
  fila: number;
  lectura: Record<string, string>;
  errores: string[];
}

export interface Analisis {
  ok: boolean;
  mensaje: string;
  filas: FilaLeida[];
  validas: number;
  conErrores: number;
}

/// Maximum upload size. Far above any plausible inventory, far below anything that would
/// hurt to parse.
export const TOPE_ARCHIVO = 8 * 1024 * 1024;
