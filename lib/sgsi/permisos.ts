// lib/sgsi/permisos.ts
//
// Permissions derive from Directory group membership. The application stores no roles of
// its own: what a person can do is what their AD groups say, which is the answer an
// auditor is looking for when they ask who authorised a change.
//
//   SIG-Seguridad     read and write across the whole SGSI, parameterisation included
//   SIG-Propietarios  value and treat the assets of their own process
//   SIG-Auditoría     read only, with access to the bitácora and the evidence
//
// EL PISO ES COLABORADOR
//
// Toda cuenta autenticada del tenant que no esté en ninguno de esos grupos es Colaborador:
// ve sus propias tareas en Mi SIG y nada más. No es un grupo del Directorio — es lo que
// queda cuando no hay ninguno, y por eso `Rol.grupos` viene vacío.
//
// Esto reemplazó a `SGI_ACCESO_SIN_GRUPO`, que existía porque sin grupo reconocido no se
// entraba a ninguna parte, y cuyo efecto era darle a cualquiera que iniciara sesión el
// inventario de activos, el registro de riesgos, las banderas de datos personales de la
// Ley 1581 y la parametrización del método. Con Colaborador como piso, esa variable dejó
// de tener razón de ser y se retiró. Si quedó puesta en un `.env` viejo, no hace nada.

export const GRUPOS = {
  seguridad: 'SIG-Seguridad',
  propietarios: 'SIG-Propietarios',
  auditoria: 'SIG-Auditoría',
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
  // Values and treats, but does not touch the parameterisation: the scales and the
  // thresholds are the Committee's, not an owner's.
  //
  // KNOWN LIMITATION, stated because the alternative is a comment that lies: these two
  // permissions are ORGANISATION-WIDE. An owner of one process can value and treat the
  // assets of any other. Scoping them to the owner's own area would need a mapping from an
  // Active Directory identity to an `area`, and no such mapping exists — the token carries
  // group membership, not a process. Until the organisation decides how that mapping is
  // maintained, the mitigation is the bitácora: every valuation and every treatment records
  // its author, so an out-of-scope change is attributable even though it is not prevented.
  //
  // Evidencia: un propietario aporta notas, enlaces y anexos (evidencia del control),
  // pero no cambia madurez ni aplicabilidad — eso sigue siendo `sgsi:escribir`.
  [GRUPOS.propietarios]: [
    'misig:ver',
    'operacion:ver',
    'mejora:ver',
    'mejora:escribir',
    'estrategico:ver',
    'estrategico:escribir',
    'auditoria:ver',
    'sgsi:ver',
    'activo:valorar',
    'riesgo:tratar',
    'evidencia:escribir',
  ],
  // Reads everything and changes nothing. The log and the evidence are precisely what an
  // auditor comes for.
  [GRUPOS.auditoria]: ['misig:ver', 'operacion:ver', 'mejora:ver', 'estrategico:ver', 'auditoria:ver', 'sgsi:ver', 'bitacora:ver', 'evidencia:ver'],
};

export interface Rol {
  grupos: Grupo[];
  permisos: Set<Permiso>;
  /// True when the role came from a fallback rather than from the token. Always false
  /// since the fallback was retired, but the interface keeps it: removing it would force
  /// touching ShellSig.tsx and EncabezadoSig.tsx, which are not part of this plan.
  esPorDefecto: boolean;
}

/// Lo que recibe una cuenta autenticada sin ningún grupo reconocido: sus propias tareas.
const COLABORADOR: Rol = {
  grupos: [],
  permisos: new Set<Permiso>(['misig:ver', 'mejora:reportar']),
  esPorDefecto: false,
};

/// Every identifier the Directory may present for one of the three groups, mapped to it.
///
/// The claim does not always carry display names. With `groupMembershipClaims` set to
/// `SecurityGroup` — the usual setting — Azure emits group OBJECT IDS, and matching only
/// on names silently yields no access: the token is fine, the tenant is fine, and every
/// screen reports «Sin acceso al SGSI».
///
/// So identifiers are listed here explicitly rather than inferred. Nothing is derived
/// from a pattern and nothing is matched loosely, because a wrong entry in this table
/// grants permissions in the tool the organisation uses to govern permissions.
///
/// `Responsables SIG` is Cuantico's own group and carries the SIG lead's permissions:
/// full read and write, parameterisation included. Both its display name and its object
/// id are listed, so the mapping holds whichever form the claim takes — the alternative
/// is a tenant that works until somebody changes the claim configuration.
const ALIAS: Readonly<Record<string, Grupo>> = {
  [GRUPOS.seguridad]: GRUPOS.seguridad,
  [GRUPOS.propietarios]: GRUPOS.propietarios,
  [GRUPOS.auditoria]: GRUPOS.auditoria,

  'Responsables SIG': GRUPOS.seguridad,
  'd04a62e7-11ce-4faf-a1b2-7e77fb7ba59b': GRUPOS.seguridad,
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

/// Derives the role from the token's groups. Sin grupo reconocido, Colaborador.
export function rolDesdeGrupos(grupos: readonly string[] | undefined | null): Rol {
  const encontrados = reconocidos(grupos ?? []);
  if (encontrados.length === 0) return COLABORADOR;
  return { grupos: encontrados, permisos: permisosDe(encontrados), esPorDefecto: false };
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
    [GRUPOS.seguridad]: 'Líder del SIG',
    [GRUPOS.propietarios]: 'Propietario de activos',
    [GRUPOS.auditoria]: 'Auditoría',
  };
  return rol.grupos.map((g) => etiquetas[g]).join(' · ');
}
