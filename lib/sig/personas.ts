// lib/sig/personas.ts
//
// Qué cambia en el SIG cuando se lee el Directorio Activo. Puro a propósito: sin Prisma,
// sin sesión y sin red, porque es la lógica que puede apagarle la cuenta a toda la
// organización y tiene que ser probable sin levantar nada.
//
// La identidad es el `oid` de Azure, no el correo. Un matrimonio, un apellido corregido o
// una migración de dominio cambian el UPN sin cambiar a la persona.

export interface EntradaDirectorio {
  oid: string;
  nombre: string;
  correo: string;
}

export interface PersonaExistente extends EntradaDirectorio {
  activa: boolean;
}

export interface CambioPersona {
  oid: string;
  campo: 'nombre' | 'correo';
  anterior: string;
  nuevo: string;
}

export interface PlanSincronizacion {
  altas: EntradaDirectorio[];
  cambios: CambioPersona[];
  inactivaciones: PersonaExistente[];
  reactivaciones: EntradaDirectorio[];
  /// Entradas del Directorio descartadas por venir sin oid o sin correo.
  ignoradas: number;
  /// True cuando el plan se descarta entero por no ser confiable. El llamador no debe
  /// aplicar nada.
  abortado: boolean;
  motivo: string | null;
}

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

const PLAN_VACIO: Omit<PlanSincronizacion, 'abortado' | 'motivo' | 'ignoradas'> = {
  altas: [],
  cambios: [],
  inactivaciones: [],
  reactivaciones: [],
};

/// Compara lo que dice el Directorio contra lo que tiene la base y devuelve qué hacer.
///
/// Nunca borra: quien desaparece se inactiva. Y si el Directorio viene vacío, no devuelve
/// nada que aplicar — una lista vacía es indistinguible de una organización sin gente, y
/// la segunda no ocurre nunca.
export function planificarSincronizacion(
  directorio: readonly EntradaDirectorio[],
  existentes: readonly PersonaExistente[],
): PlanSincronizacion {
  const validas = directorio.filter((e) => e.oid.trim() !== '' && e.correo.trim() !== '');
  const ignoradas = directorio.length - validas.length;

  if (validas.length === 0) {
    return {
      ...PLAN_VACIO,
      ignoradas,
      abortado: true,
      motivo:
        'El Directorio devolvió un listado vacío. No se aplica nada: una lectura vacía ' +
        'no distingue entre un fallo de permisos y una organización sin personas.',
    };
  }

  const porOid = new Map(existentes.map((p) => [p.oid, p]));
  const vistos = new Set<string>();

  const altas: EntradaDirectorio[] = [];
  const cambios: CambioPersona[] = [];
  const reactivaciones: EntradaDirectorio[] = [];

  for (const cruda of validas) {
    const entrada: EntradaDirectorio = {
      oid: cruda.oid,
      nombre: cruda.nombre.trim(),
      correo: normalizarCorreo(cruda.correo),
    };
    vistos.add(entrada.oid);

    const actual = porOid.get(entrada.oid);
    if (!actual) {
      altas.push(entrada);
      continue;
    }

    if (actual.nombre !== entrada.nombre) {
      cambios.push({
        oid: entrada.oid,
        campo: 'nombre',
        anterior: actual.nombre,
        nuevo: entrada.nombre,
      });
    }
    if (normalizarCorreo(actual.correo) !== entrada.correo) {
      cambios.push({
        oid: entrada.oid,
        campo: 'correo',
        anterior: normalizarCorreo(actual.correo),
        nuevo: entrada.correo,
      });
    }
    if (!actual.activa) reactivaciones.push(entrada);
  }

  const inactivaciones = existentes.filter((p) => p.activa && !vistos.has(p.oid));

  return { altas, cambios, inactivaciones, reactivaciones, ignoradas, abortado: false, motivo: null };
}