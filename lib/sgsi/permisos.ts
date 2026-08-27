// lib/sgsi/permisos.ts
//
// Permissions derive from Directory group membership. The application stores no roles of
// its own: what a person can do is what their AD groups say, which is the answer an
// auditor is looking for when they ask who authorised a change.
//
//   SIG-Seguridad     read and write across the whole SGSI, parameterisation included
//   SIG-Propietarios  value and treat the assets of their own process
//   SIG-Auditoría     read only, with access to the bitácora and the evidence
//   Domain Users      no access: the application does not appear in the portal
//
// Those three are the roles. The Directory groups that map onto them are listed in
// `ALIAS`, by display name AND by object id, because the claim carries object ids under
// the usual `groupMembershipClaims` setting. Cuantico's `Responsables SIG` maps to
// SIG-Seguridad.
//
// WHEN THE CLAIM IS NOT THERE
//
// Emitting the `groups` claim is a decision in the Azure app registration, and until it
// is made the token carries no groups at all. Two ways to handle that, and only one of
// them is honest:
//
//   · Treat "no groups" as "no permissions". Correct in production, and it would make
//     the application unusable on a tenant that has not been configured yet — silently,
//     because the screens would just be empty.
//   · Fall back to an explicit role, named in an environment variable, and say on screen
//     that the role is a fallback rather than a claim.
//
// The second is what this does. `SGI_ROL_POR_DEFECTO` is read only when the token has no
// groups; in production, with no variable set, the fallback is no access.

export const GRUPOS = {
  seguridad: 'SIG-Seguridad',
  propietarios: 'SIG-Propietarios',
  auditoria: 'SIG-Auditoría',
} as const;

export type Grupo = (typeof GRUPOS)[keyof typeof GRUPOS];

export type Permiso =
  | 'sgsi:ver'
  | 'sgsi:escribir'
  | 'activo:valorar'
  | 'riesgo:tratar'
  | 'parametrizacion:escribir'
  | 'bitacora:ver'
  | 'evidencia:ver'
  | 'evidencia:escribir';

const POR_GRUPO: Record<Grupo, Permiso[]> = {
  [GRUPOS.seguridad]: [
    'sgsi:ver',
    'sgsi:escribir',
    'activo:valorar',
    'riesgo:tratar',
    'parametrizacion:escribir',
    'bitacora:ver',
    'evidencia:ver',
    'evidencia:escribir',
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
  [GRUPOS.propietarios]: ['sgsi:ver', 'activo:valorar', 'riesgo:tratar', 'evidencia:escribir'],
  // Reads everything and changes nothing. The log and the evidence are precisely what an
  // auditor comes for.
  [GRUPOS.auditoria]: ['sgsi:ver', 'bitacora:ver', 'evidencia:ver'],
};

export interface Rol {
  grupos: Grupo[];
  permisos: Set<Permiso>;
  /// True when the role came from `SGI_ROL_POR_DEFECTO` rather than from the token. The
  /// interface says so, because a permission nobody granted should not look granted.
  esPorDefecto: boolean;
}

const SIN_ACCESO: Rol = { grupos: [], permisos: new Set(), esPorDefecto: false };

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

/// The role granted to an authenticated session whose token carries NO recognised group.
///
/// `SGI_ACCESO_SIN_GRUPO` is the switch, and what it does is deliberately blunt: set it and
/// the Directory stops being the gate. Anyone who can sign in to the tenant gets the role
/// named here — the whole inventory, the whole risk register, the Ley 1581 personal-data
/// flags, the internet-exposure flags, the custodians and the owners. Set to
/// `SIG-Seguridad` it also grants the writes: valuing assets, recording treatment, and
/// reparameterising the method itself.
///
/// It exists because the organisation asked for it, and it is a VARIABLE rather than a
/// deleted gate for three reasons: reverting is one value, the sidebar can say out loud
/// where the role came from, and an auditor reading this sees a decision instead of an
/// oversight. Unset — which is the default, and what production should carry — the answer
/// for a session with no recognised group is no access.
///
/// `SGI_ROL_POR_DEFECTO` is the older, narrower name: it only ever applied when the claim
/// was absent entirely. It is still read so an existing environment keeps working, but the
/// new name is the one that describes what actually happens.
function accesoSinGrupo(): Grupo[] {
  const configurado = process.env.SGI_ACCESO_SIN_GRUPO ?? process.env.SGI_ROL_POR_DEFECTO ?? '';
  return reconocidos([configurado]);
}

/// Derives the role from the token's groups.
///
/// A recognised group always wins. Failing that, `SGI_ACCESO_SIN_GRUPO` decides, and the
/// result is flagged `esPorDefecto` so the interface can say the Directory did not grant it.
export function rolDesdeGrupos(grupos: readonly string[] | undefined | null): Rol {
  const encontrados = reconocidos(grupos ?? []);

  if (encontrados.length > 0) {
    return { grupos: encontrados, permisos: permisosDe(encontrados), esPorDefecto: false };
  }

  // Reached both when the claim is absent AND when it carries only groups that are not
  // ours. Those used to be different answers — the second was a flat no, on the reasoning
  // that a working claim listing other groups IS the Directory saying no. They are the same
  // answer now, by decision: the organisation wants every authenticated account in.
  const sinGrupo = accesoSinGrupo();
  if (sinGrupo.length === 0) return SIN_ACCESO;

  return { grupos: sinGrupo, permisos: permisosDe(sinGrupo), esPorDefecto: true };
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
  if (rol.grupos.length === 0) return 'Sin acceso al SGSI';
  const etiquetas: Record<Grupo, string> = {
    [GRUPOS.seguridad]: 'Líder del SIG',
    [GRUPOS.propietarios]: 'Propietario de activos',
    [GRUPOS.auditoria]: 'Auditoría',
  };
  return rol.grupos.map((g) => etiquetas[g]).join(' · ');
}
