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
  | 'evidencia:ver';

const POR_GRUPO: Record<Grupo, Permiso[]> = {
  [GRUPOS.seguridad]: [
    'sgsi:ver',
    'sgsi:escribir',
    'activo:valorar',
    'riesgo:tratar',
    'parametrizacion:escribir',
    'bitacora:ver',
    'evidencia:ver',
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
  [GRUPOS.propietarios]: ['sgsi:ver', 'activo:valorar', 'riesgo:tratar'],
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

function reconocidos(valores: readonly string[]): Grupo[] {
  const nombres = Object.values(GRUPOS) as string[];
  // Azure can emit display names or object ids depending on how the claim is configured.
  // Only names are matched here; mapping object ids is a tenant-specific table and
  // guessing at it would grant permissions by accident.
  return valores.filter((v): v is Grupo => nombres.includes(v));
}

/// Derives the role from the token's groups, falling back to the environment variable
/// only when the claim is absent.
export function rolDesdeGrupos(grupos: readonly string[] | undefined | null): Rol {
  const encontrados = reconocidos(grupos ?? []);

  if (encontrados.length > 0) {
    return { grupos: encontrados, permisos: permisosDe(encontrados), esPorDefecto: false };
  }

  // A token that carries groups, none of which is ours, is a Domain Users member: the
  // claim worked and the answer is no.
  if ((grupos?.length ?? 0) > 0) return SIN_ACCESO;

  const porDefecto = reconocidos([process.env.SGI_ROL_POR_DEFECTO ?? '']);
  if (porDefecto.length === 0) return SIN_ACCESO;

  return { grupos: porDefecto, permisos: permisosDe(porDefecto), esPorDefecto: true };
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
