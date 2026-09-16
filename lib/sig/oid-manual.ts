// lib/sig/oid-manual.ts
//
// El `oid` sintético de una persona dada de alta a mano, y cómo reconocerlo.
//
// ── POR QUÉ ESTO NO PUEDE VIVIR EN LA ACCIÓN ────────────────────────────────────────────
//
// Vivía ahí, como `export const` dentro de `app/sig/acciones/colaborador-alta.ts`, y rompía
// la compilación entera de esa pantalla. Un módulo `'use server'` puede exportar SÓLO
// funciones asíncronas: cada export se convierte en un punto de entrada invocable desde el
// navegador, y una constante no lo es. Al encontrar una, el compilador descarta todos los
// exports del módulo —«The module has no exports at all»— y la página que importaba
// `crearColaborador` dejaba de encontrarlo.
//
// Los `export interface` y `export type` sí están permitidos ahí, porque se borran al
// compilar y nunca llegan a ser un punto de entrada. La diferencia no es de estilo.
//
// ── QUÉ DECIDE ──────────────────────────────────────────────────────────────────────────
//
// `Persona.oid` es el object id de Azure AD: obligatorio, único, y la identidad estable que
// sobrevive a un cambio de correo. Una persona que todavía no existe en el Directorio no
// tiene uno, y dejarlo vacío no es opción porque la columna es NOT NULL.
//
// Se inventa uno con el prefijo `manual:`, que un oid de Azure NUNCA puede tener —son UUID, y
// un UUID no lleva dos puntos—. Eso hace que las dos poblaciones sean distinguibles con una
// consulta y que no puedan colisionar. Cuando la sincronización encuentre a esta persona por
// correo, reemplazará el oid sintético por el real: ése es el momento en que la excepción se
// cierra.

/// El prefijo que distingue un oid inventado por nosotros de uno de Azure AD.
export const PREFIJO_OID_MANUAL = 'manual:';

/// Si este `oid` es de los que inventamos, y por lo tanto la persona todavía no está en el
/// Directorio.
///
/// Se pregunta por el prefijo y no por `Persona.origen`: `origen` es una declaración que
/// alguien puede editar, y el oid es el hecho. El día que las dos discrepen, la que dice la
/// verdad sobre si hay cuenta en Azure es ésta.
export function esOidManual(oid: string | null | undefined): boolean {
  return typeof oid === 'string' && oid.startsWith(PREFIJO_OID_MANUAL);
}
