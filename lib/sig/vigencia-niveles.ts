// lib/sig/vigencia-niveles.ts
//
// Separar, en la auditoría del árbol de niveles, lo que queda por hacer de lo que ya se hizo.
//
// Un nodo absorbido por una fusión no se borra: queda `activo = false` y **conserva su nombre
// original**, que es lo que permite deshacer la fusión. Esa lápida es evidencia, no deuda.
//
// Antes de la primera fusión daba igual contar sobre todos los nodos, porque todos estaban
// vivos. Después deja de dar igual: el 22/09/2026, con producción ya estandarizada —0 nombres
// sin normalizar y 0 colisiones entre nodos vivos—, el informe seguía titulando «3 nombres sin
// normalizar · 2 colisiones». Los cinco nodos eran lápidas. Quien lo leyera sin ese contexto
// concluiría que la fusión quedó a medias y la repetiría.
//
// La regla: **el trabajo pendiente se cuenta entre nodos activos.** Un grupo de colisión deja
// de ser pendiente en cuanto le queda un solo nodo vivo, sin importar cuántas lápidas arrastre.

/** Lo mínimo que hace falta para decidir vigencia. Cualquier nivel con más campos sirve. */
type ConVigencia = { nombre: string; activo: boolean };

/**
 * Los nodos VIVOS cuyo nombre todavía no está normalizado. Las lápidas se excluyen: su nombre
 * viejo es deliberado.
 */
export function nombresPendientes<T extends ConVigencia>(
  niveles: readonly T[],
  normalizar: (s: string) => string = (s) => s.toUpperCase(),
): T[] {
  return niveles.filter((n) => n.activo && n.nombre !== normalizar(n.nombre));
}

/**
 * Parte los grupos de colisión en los que todavía exigen una fusión y los que ya la tuvieron.
 *
 * Un grupo es pendiente si le quedan **dos o más nodos activos**: sólo entonces hay dos nombres
 * vivos que colapsarían en uno. Con uno o ninguno, la fusión ya ocurrió.
 */
export function separarColisiones<T extends ConVigencia>(
  grupos: readonly (readonly T[])[],
): { pendientes: readonly T[][]; lapidas: readonly T[][] } {
  const pendientes: T[][] = [];
  const lapidas: T[][] = [];
  for (const grupo of grupos) {
    if (grupo.filter((n) => n.activo).length >= 2) pendientes.push([...grupo]);
    else lapidas.push([...grupo]);
  }
  return { pendientes, lapidas };
}
