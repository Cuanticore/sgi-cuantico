// app/lib/acceso-local.ts
//
// Entrar sin Directorio Activo cuando se trabaja en la propia máquina.
//
// POR QUÉ NO ES `SGI_ROL_DEV` OTRA VEZ. Esa variable existió y se retiró el 08/09/2026:
// otorgaba el ROL directamente, sin mirar ningún grupo. Con eso el entorno local no
// ejercitaba el camino real —grupo → rol → permiso— y un acceso que funciona en la máquina
// de quien programa y falla en el servidor oculta exactamente el defecto que hay que
// encontrar.
//
// Acá se emiten GRUPOS, que es lo mismo que emite el Directorio. El camino se recorre
// entero: `lib/sgsi/permisos.ts` deriva el rol igual que en producción, y si mañana cambia
// la tabla de permisos, local cambia con ella. Lo único que no se hace es el viaje a Azure.
//
// DOS CONDICIONES PARA HABILITARLO, no una. Una variable de entorno se copia de un `.env` a
// otro sin querer; `NODE_ENV` no. Si alcanzara con la variable, un descuido abriría el
// acceso en el servidor — y ahí no hay Directorio que valga.

/// Sólo lo que hace falta mirar del entorno, para poder probarlo sin tocar `process.env`.
export interface EntornoDeAcceso {
  NODE_ENV?: string;
  SGI_LOGIN_LOCAL?: string;
}

/// Si el acceso local está disponible. Ver el encabezado: exige las dos condiciones.
export function accesoLocalHabilitado(env: EntornoDeAcceso = process.env): boolean {
  if (env.NODE_ENV === 'production') return false;
  return env.SGI_LOGIN_LOCAL === 'true';
}

/// Los grupos que escribió la persona en el formulario local, uno por coma.
///
/// Una lista vacía NO es un error: es el camino de cualquiera que no pertenece a un grupo
/// reconocido, que entra como Colaborador. Poder probar ese caso en local es justamente
/// parte del asunto.
export function gruposDeCredenciales(crudo: string | undefined | null): string[] {
  if (!crudo) return [];
  return crudo
    .split(',')
    .map((g) => g.trim())
    .filter((g) => g !== '');
}

/// Los grupos que van al token, vengan de donde vengan.
///
/// EL PERFIL DEL DIRECTORIO MANDA. Si alguna vez llegaran los dos, gana Azure: el acceso
/// local no puede escalar los permisos de una sesión real.
///
/// Devuelve `undefined` —y no `[]`— cuando no hay nada que decir. El token se reutiliza entre
/// peticiones y `profile` sólo llega al iniciar sesión: escribir una lista vacía acá borraría
/// los grupos de una sesión ya establecida.
export function gruposDelToken(
  profile: { groups?: unknown } | undefined | null,
  usuario: { grupos?: unknown } | undefined | null,
): string[] | undefined {
  const deAzure = profile?.groups;
  if (Array.isArray(deAzure)) {
    return deAzure.filter((g): g is string => typeof g === 'string');
  }

  const deLocal = usuario?.grupos;
  if (Array.isArray(deLocal)) {
    return deLocal.filter((g): g is string => typeof g === 'string');
  }

  return undefined;
}
