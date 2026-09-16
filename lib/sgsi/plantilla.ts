// lib/sgsi/plantilla.ts
//
// The import template's contract: which columns exist, in what order, and which ones are
// required. It lives here — not in the server action — because three places need it and
// they must not drift: the route that generates the .xlsx, the action that reads it back,
// and the popup that renders the preview table.
//
// No 'server-only' guard: the popup is a client component and shows these headers.

import type { CatalogoCurable, FaltanteCatalogo } from './catalogos-curables';
import type { ParteConsolidado } from './consolidado';

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
  // ── Lo que el FOR-SIG-12 V21 agrego, AL FINAL y no intercalado ────────────────────────
  //
  // El camino no-legacy lee esta plantilla POR POSICION, asi que meter una columna en el
  // medio correria todas las de la derecha en cada archivo ya descargado. Agregadas al
  // final, una plantilla vieja sigue alineando sus diecisiete primeras columnas y estas
  // llegan vacias, que es exactamente lo que esa plantilla queria decir.
  { clave: 'cantidad', encabezado: 'Cantidad', ancho: 12, obligatoria: false },
  { clave: 'n1', encabezado: 'Nivel 1', ancho: 20, obligatoria: false },
  { clave: 'n2', encabezado: 'Nivel 2', ancho: 20, obligatoria: false },
  { clave: 'n3', encabezado: 'Nivel 3', ancho: 24, obligatoria: false },
  { clave: 'superior', encabezado: 'Depende del activo superior', ancho: 24, obligatoria: false },
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
  /// Sólo cuando el archivo es el Consolidado de Activos V19 (REQ-SIG-12).
  ///
  /// Va aparte de `filas` porque el consolidado no es UNA hoja: son cuatro, y cada una tiene
  /// su conteo, sus rechazos y sus avisos. Aplanarlo todo en la lista de filas obligaría a
  /// leer cada mensaje para saber de qué hoja habla, que es justo lo que el parte tiene que
  /// responder de un vistazo.
  consolidado?: ParteConsolidado;
  /// Lo que el libro nombra y el catálogo no tiene, agrupado por valor.
  ///
  /// Va aparte de los errores de fila porque NO es un error de la fila: que un cargo no
  /// esté registrado no dice nada sobre si debe existir. Es una decisión pendiente, y la
  /// pantalla la presenta como tal — una por valor, no una por fila.
  faltantes?: FaltanteCatalogo[];
  /// Los nombres vigentes de cada catálogo curable, para el selector de «mapear a».
  opciones?: OpcionesCatalogo;
}

/// Nombres vigentes por catálogo, en el orden en que la pantalla los ofrece.
export type OpcionesCatalogo = Record<CatalogoCurable, string[]>;

/// Maximum upload size. Far above any plausible inventory, far below anything that would
/// hurt to parse.
export const TOPE_ARCHIVO = 8 * 1024 * 1024;
