// lib/sgsi/permisos.ts
//
// Permissions derive from Directory group membership. The application stores no roles of
// its own: what a person can do is what their AD groups say, which is the answer an
// auditor is looking for when they ask who authorised a change.
//
// DOS CASOS DE ACCESO, NO MÁS (decisión del líder del SIG, 01/09/2026)
//
//   Mi SIG          toda cuenta autenticada de la organización, sin pertenecer a nada
//   Todo lo demás   solo quien está en `Responsables SIG`
//
// Antes había tres grupos —`SIG-Seguridad`, `SIG-Propietarios` y `SIG-Auditoría`— con
// escalones intermedios: valorar sin parametrizar, leer sin escribir. Se retiraron. Dos de
// ellos nunca llegaron a existir en el Directorio, y un permiso que nadie tiene no protege
// nada: sólo reparte la regla en más lugares donde puede quedar mal escrita.
//
// El vocabulario de permisos SÍ se conserva entero. Cada pantalla sigue pidiendo el permiso
// que le corresponde en vez de preguntar por un grupo, así que reabrir un escalón mañana es
// agregar una entrada en `POR_GRUPO` — nunca recorrer las pantallas de nuevo.
//
// EL PISO ES COLABORADOR
//
// Quien no está en `Responsables SIG` es Colaborador: ve sus propias tareas en Mi SIG y
// nada más. No es un grupo del Directorio — es lo que queda cuando no hay ninguno, y por
// eso `Rol.grupos` viene vacío.
//
// Esto reemplazó a `SGI_ACCESO_SIN_GRUPO`, que existía porque sin grupo reconocido no se
// entraba a ninguna parte, y cuyo efecto era darle a cualquiera que iniciara sesión el
// inventario de activos, el registro de riesgos, las banderas de datos personales de la
// Ley 1581 y la parametrización del método. Con Colaborador como piso, esa variable dejó
// de tener razón de ser y se retiró. Si quedó puesta en un `.env` viejo, no hace nada.

export const GRUPOS = {
  seguridad: 'SIG-Seguridad',
} as const;

export type Grupo = (typeof GRUPOS)[keyof typeof GRUPOS];

export type Permiso =
  | 'misig:ver'
  | 'operacion:ver'
  | 'operacion:escribir'
  | 'operacion:administrar'
  | 'mejora:reportar'
  | 'mejora:ver'
  | 'mejora:escribir'
  | 'mejora:cerrar'
  | 'estrategico:ver'
  | 'estrategico:escribir'
  | 'estrategico:parametrizar'
  | 'auditoria:ver'
  | 'auditoria:ejecutar'
  | 'auditoria:administrar'
  | 'sgsi:ver'
  | 'sgsi:escribir'
  | 'activo:valorar'
  | 'riesgo:tratar'
  | 'parametrizacion:escribir'
  | 'bitacora:ver'
  | 'evidencia:ver'
  | 'evidencia:escribir'
  | 'personas:administrar';

const POR_GRUPO: Record<Grupo, Permiso[]> = {
  [GRUPOS.seguridad]: [
    'misig:ver',
    'operacion:ver',
    'operacion:escribir',
    'operacion:administrar',
    'mejora:ver',
    'mejora:escribir',
    'mejora:cerrar',
    'estrategico:ver',
    'estrategico:escribir',
    'estrategico:parametrizar',
    'auditoria:ver',
    'auditoria:ejecutar',
    'auditoria:administrar',
    'sgsi:ver',
    'sgsi:escribir',
    'activo:valorar',
    'riesgo:tratar',
    'parametrizacion:escribir',
    'bitacora:ver',
    'evidencia:ver',
    'evidencia:escribir',
    'personas:administrar',
  ],
};

/// De dónde salió el rol. Toda pantalla que muestre permisos tiene que poder decirlo: un
/// acceso que no vino del Directorio y se ve idéntico a uno que sí, engaña al que lee.
export type OrigenRol = 'directorio' | 'simulado';

export interface Rol {
  grupos: Grupo[];
  permisos: Set<Permiso>;
  origen: OrigenRol;
}

/// Lo que recibe una cuenta autenticada sin ningún grupo reconocido: sus propias tareas.
const COLABORADOR: Rol = {
  grupos: [],
  permisos: new Set<Permiso>(['misig:ver', 'mejora:reportar']),
  origen: 'directorio',
};


/// Every identifier the Directory may present for the one group that grants access.
///
/// The claim does not always carry display names. With `groupMembershipClaims` set to
/// `SecurityGroup` — the usual setting — Azure emits group OBJECT IDS, and matching only
/// on names silently yields no access: the token is fine, the tenant is fine, and every
/// screen reports «Sin acceso al SGSI».
///
/// So identifiers are listed here explicitly rather than inferred. Nothing is derived
/// from a pattern and nothing is matched loosely, because a wrong entry in this table
/// grants permissions in the tool the organisation uses to govern permissions. That is
/// also why an object id nobody has confirmed does not go in: an id whose group is a
/// guess is a guess about who runs the SGSI.
///
/// `Responsables SIG` is Cuantico's own group and the only one that grants anything.
/// `SIG-Seguridad` stays listed as its canonical name so a tenant that names the group
/// that way keeps working; both forms map to the same single role.
const ALIAS: Readonly<Record<string, Grupo>> = {
  [GRUPOS.seguridad]: GRUPOS.seguridad,

  // `Líderes SIG` es el grupo vigente: de SEGURIDAD, creado el 01/09/2026 para reemplazar
  // al de Microsoft 365. Ese tipo es el que Azure emite en el token con la configuración
  // habitual, así que con él la pertenencia llega sola y no hace falta preguntarle a Graph.
  //
  // El acento va en el nombre porque así se llama: la comparación pliega mayúsculas pero
  // NO pliega acentos, y «Lideres SIG» no coincidiría.
  'Líderes SIG': GRUPOS.seguridad,
  '2e0f4290-e91c-4f45-a663-77ece2d2a50e': GRUPOS.seguridad,

  // El grupo de Microsoft 365 al que reemplaza. Se conserva mientras se verifica que el
  // nuevo funciona; una vez confirmado hay que retirarlo, porque un grupo de colaboración
  // que además otorga el sistema entero es una segunda puerta que nadie recuerda cerrar.
  'Responsables SIG': GRUPOS.seguridad,

  // Los dos object ids del mismo grupo. Se conservan ambos porque no hay forma de
  // comprobar desde la aplicación cuál está vigente: el registro de Azure no tiene
  // `Group.Read.All`, así que Graph responde 403 a cualquier consulta sobre grupos.
  //
  // `d04a62e7…` venía de antes y nunca abrió una sesión real. `f51b3ad7…` es el que el
  // líder del SIG confirmó el 01/09/2026 como el grupo al que pertenece, después de que
  // su cuenta quedara en Colaborador teniendo la membresía puesta — que es el síntoma
  // exacto de un identificador ausente de esta tabla.
  //
  // Dejar el viejo no otorga nada de más: si ya no existe, ningún token lo presenta.
  'd04a62e7-11ce-4faf-a1b2-7e77fb7ba59b': GRUPOS.seguridad,
  'f51b3ad7-497b-43ea-b646-d1dc482cff5d': GRUPOS.seguridad,
};

function reconocidos(valores: readonly string[]): Grupo[] {
  // Object ids are case-insensitive and Azure is not consistent about the case it emits,
  // so comparison is folded. Display names are folded with them: two of our groups
  // differing only by case is not a distinction anyone would intend.
  const porClave = new Map<string, Grupo>(
    Object.entries(ALIAS).map(([clave, grupo]) => [clave.toLowerCase(), grupo]),
  );
  // De-duplicated: a token that presents both the name and the object id of the same
  // group must not list it twice, or the header prints «Líder del SIG · Líder del SIG».
  const vistos = new Set<Grupo>();
  for (const v of valores) {
    const g = porClave.get(v.trim().toLowerCase());
    if (g) vistos.add(g);
  }
  return [...vistos];
}

/// Groups to impersonate while developing, from `SGI_ROL_DEV`. Accepts the same
/// identifiers the Directory claim carries: `Responsables SIG` or `SIG-Seguridad`.
///
/// This is the SAME capability `SGI_ACCESO_SIN_GRUPO` had, and that variable was retired
/// because it granted the whole SGSI — assets, risks, the Ley 1581 flags, the method's
/// parameterisation — to any account that signed in, IN PRODUCTION. So the difference is
/// the guard, not the intent:
///
///   · `NODE_ENV === 'production'` ignores the variable outright. Setting it on the
///     production server does nothing; it cannot be switched on by configuration alone.
///   · A token that already carries a recognised group WINS. The override only fills the
///     gap left by a session with no group, so it can never raise or lower a real one.
///   · The role it returns is flagged `esPorDefecto`, and every surface that renders a
///     role says on screen that it did not come from the Directory. A fake role that
///     looks real is how it stops being a testing tool.
function gruposDeDesarrollo(): Grupo[] {
  if (process.env.NODE_ENV === 'production') return [];
  const declarado = process.env.SGI_ROL_DEV;
  if (!declarado) return [];
  return reconocidos(declarado.split(','));
}

/// Deriva el rol. Sin grupo reconocido, Colaborador.
///
/// El orden no es casual. El Directorio manda: si el token trae el grupo, nada de lo que
/// venga después puede subir ni bajar ese rol. La lista puente actúa solo cuando el
/// Directorio no dijo nada, y el override de desarrollo queda último porque es el único que
/// no representa una autorización real.
///
/// `correo` es opcional para no obligar a cada llamador a tenerlo, pero sin él la lista
/// puente no puede aplicar: quien derive el rol de una sesión debería pasarlo.
export function rolDesdeGrupos(grupos: readonly string[] | undefined | null): Rol {
  const encontrados = reconocidos(grupos ?? []);
  if (encontrados.length > 0) {
    return { grupos: encontrados, permisos: permisosDe(encontrados), origen: 'directorio' };
  }

  const desarrollo = gruposDeDesarrollo();
  if (desarrollo.length > 0) {
    return { grupos: desarrollo, permisos: permisosDe(desarrollo), origen: 'simulado' };
  }

  return COLABORADOR;
}

function permisosDe(grupos: readonly Grupo[]): Set<Permiso> {
  const permisos = new Set<Permiso>();
  for (const g of grupos) for (const p of POR_GRUPO[g]) permisos.add(p);
  return permisos;
}

export function puede(rol: Rol, permiso: Permiso): boolean {
  return rol.permisos.has(permiso);
}

/// Human-readable label for the header and the audit trail.
export function nombreDelRol(rol: Rol): string {
  if (rol.grupos.length === 0) return 'Colaborador';
  const etiquetas: Record<Grupo, string> = {
    [GRUPOS.seguridad]: 'Responsable SIG',
  };
  return rol.grupos.map((g) => etiquetas[g]).join(' · ');
}
