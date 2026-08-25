// lib/sgsi/catalogos.ts
//
// The support catalogues of screen 9, described once: eight of them, plus two filtered
// views of `cargo_responsable` that the asset sheet offers as separate lists.
//
// They are NOT interchangeable, and the differences are structural rather than cosmetic:
// `Area.prefijo` is baked into every emitted asset code, `CapacidadOperativa` is a radar
// axis with a non-nullable FK pointing at it and no vigency flag at all, and three of the
// them have no `orden` column. Keeping those facts in one table is what stops the same
// validation being written ten times and getting it right nine.
//
// This module is deliberately free of `server-only` and of Prisma: the actions need the
// table, and the client island needs the type.

export type Catalogo =
  | 'area'
  | 'cargo'
  /// Two independently curated VIEWS of `cargo_responsable`, not two tables. See
  /// `esPropietario` / `esCustodio` in the schema for why. Screen 9 administers the whole
  /// catalogue as `cargo`; the asset sheet's two dropdowns administer their own list.
  | 'cargoPropietario'
  | 'cargoCustodio'
  | 'proveedor'
  | 'ubicacion'
  | 'entorno'
  | 'tratamiento'
  | 'estadoTratamiento'
  | 'capacidad';

export interface ReglaCatalogo {
  /// The `@@map` name. It is what the bitácora records as `tabla`, so a trail entry can be
  /// traced back to a row without knowing which screen wrote it.
  tabla: string;
  /// Article included, so a message reads as Spanish instead of as a template.
  etiqueta: string;
  /// What the usage count counts, for the message and for the row label.
  sustantivoUso: string;
  /// Off for CapacidadOperativa: `Control.capacidadId` is not nullable and the model has
  /// no vigency flag, so neither an alta nor a baja can be expressed at the DB level.
  permiteAlta: boolean;
  permiteBaja: boolean;
  /// Proveedor, Ubicacion and Entorno have no `orden` column — they are read by name.
  tieneOrden: boolean;
  /// Area only. The prefix is inside the code of every asset of the area, and the code is
  /// immutable, so it is required on alta and can never be edited afterwards.
  pidePrefijo: boolean;
  /// CapacidadOperativa only: narrow columns and radar axes cannot fit the full name.
  usaNombreCorto: boolean;
  /// Set on the two filtered views of `cargo_responsable`. It changes what "retirar" MEANS:
  /// not a logical delete of the position, but taking it out of THIS list. The row stays
  /// active, keeps its other flag, and keeps answering for the records that point at it.
  banderaCargo?: 'esPropietario' | 'esCustodio';
}

export const CATALOGOS: Record<Catalogo, ReglaCatalogo> = {
  area: {
    tabla: 'area',
    etiqueta: 'el proceso o área',
    sustantivoUso: 'activo',
    permiteAlta: true,
    permiteBaja: true,
    tieneOrden: true,
    pidePrefijo: true,
    usaNombreCorto: false,
  },
  cargo: {
    tabla: 'cargo_responsable',
    etiqueta: 'el cargo responsable',
    sustantivoUso: 'referencia',
    permiteAlta: true,
    permiteBaja: true,
    tieneOrden: true,
    pidePrefijo: false,
    usaNombreCorto: false,
  },
  cargoPropietario: {
    tabla: 'cargo_responsable',
    etiqueta: 'la lista de propietarios',
    sustantivoUso: 'referencia',
    permiteAlta: true,
    permiteBaja: true,
    tieneOrden: true,
    pidePrefijo: false,
    usaNombreCorto: false,
    banderaCargo: 'esPropietario',
  },
  cargoCustodio: {
    tabla: 'cargo_responsable',
    etiqueta: 'la lista de custodios',
    sustantivoUso: 'referencia',
    permiteAlta: true,
    permiteBaja: true,
    tieneOrden: true,
    pidePrefijo: false,
    usaNombreCorto: false,
    banderaCargo: 'esCustodio',
  },
  proveedor: {
    tabla: 'proveedor',
    etiqueta: 'el proveedor',
    sustantivoUso: 'activo',
    permiteAlta: true,
    permiteBaja: true,
    tieneOrden: false,
    pidePrefijo: false,
    usaNombreCorto: false,
  },
  ubicacion: {
    tabla: 'ubicacion',
    etiqueta: 'la ubicación',
    sustantivoUso: 'activo',
    permiteAlta: true,
    permiteBaja: true,
    tieneOrden: false,
    pidePrefijo: false,
    usaNombreCorto: false,
  },
  entorno: {
    tabla: 'entorno',
    etiqueta: 'el entorno',
    sustantivoUso: 'activo',
    permiteAlta: true,
    permiteBaja: true,
    tieneOrden: false,
    pidePrefijo: false,
    usaNombreCorto: false,
  },
  tratamiento: {
    tabla: 'tratamiento_riesgo',
    etiqueta: 'la opción de tratamiento',
    sustantivoUso: 'riesgo',
    permiteAlta: true,
    permiteBaja: true,
    tieneOrden: true,
    pidePrefijo: false,
    usaNombreCorto: false,
  },
  estadoTratamiento: {
    tabla: 'estado_tratamiento',
    etiqueta: 'el estado del tratamiento',
    sustantivoUso: 'riesgo',
    permiteAlta: true,
    permiteBaja: true,
    tieneOrden: true,
    pidePrefijo: false,
    usaNombreCorto: false,
  },
  capacidad: {
    tabla: 'capacidad_operativa',
    etiqueta: 'la capacidad operativa',
    sustantivoUso: 'control',
    permiteAlta: false,
    permiteBaja: false,
    tieneOrden: true,
    pidePrefijo: false,
    usaNombreCorto: true,
  },
};

/// Three letters, uppercase. The prefix ends up inside `AAA-TTT-NNNN`, which is immutable
/// and never reused, so a prefix that has to be corrected later cannot be.
export const PREFIJO_AREA = /^[A-Z]{3}$/;

/// Compares names the way a person reads them: «Nube» and «nube» are the same value, and
/// so are «Producción» and «Produccion». Two rows with the same name split the records
/// between them and neither tells the truth.
export function mismoNombre(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), 'es', { sensitivity: 'base' }) === 0;
}

/// Pluralises the usage count. Every noun in the table takes a plain «s».
export function conteoUsos(usos: number, sustantivo: string): string {
  return `${usos} ${sustantivo}${usos === 1 ? '' : 's'}`;
}
