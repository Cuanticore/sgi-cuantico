// lib/sgsi/alto-sin-plan.ts
//
// Qué amenaza, dentro de un popup de planes, no se puede dejar pasar: banda residual alta
// (o crítica) y sin plan registrado todavía.
//
// ── DUPLICACIÓN TEMPORAL Y DELIBERADA ───────────────────────────────────────────────────
//
// `lib/sgsi/columnas-analisis.ts` ya trae su propia `BANDAS_ALARMANTES` privada, para pintar
// la fila alarmante de la grilla. Esta lista debería ser una sola: dos listas que se separan
// es cómo la grilla y este popup terminan diciendo cosas distintas sobre la misma amenaza.
// No se toca ese archivo acá porque está tomado por otra sesión, migrándolo a AG Grid en
// paralelo. Cuando se libere, `columnas-analisis.ts` tiene que importar `BANDAS_ALARMANTES`
// de este módulo y borrar la suya — no al revés, y no las dos.
//
// ── POR QUÉ `Crítico` SIGUE EN LA LISTA AUNQUE HOY NO TENGA NINGUNA FILA ────────────────
//
// La banda `Crítico` empieza en 25.0 y el residual máximo real del modelo, hoy, es 13.0: no
// hay ni un solo riesgo en esa banda en este momento. Se incluye igual porque el predicado no
// depende de qué haya hoy sino de qué significa `Crítico`: el día que la escala cambie o entre
// un riesgo que la alcance, tiene que marcarse sin que nadie tenga que acordarse de agregarlo.

/// Las bandas que no se pueden dejar sin plan.
export const BANDAS_ALARMANTES: readonly string[] = ['Crítico', 'Alto'];

/// `null` —«sin calcular»— es falso: «no se sabe» no es «alto». Es la misma doctrina que
/// sostiene el informe de valoración y la grilla.
export function esBandaAlarmante(banda: string | null): boolean {
  if (banda === null) return false;
  return BANDAS_ALARMANTES.includes(banda);
}

/// Una amenaza suelta, que es la unidad del popup.
export function esAmenazaAlarmanteSinPlan(a: { banda: string | null; tienePlan: boolean }): boolean {
  return esBandaAlarmante(a.banda) && !a.tienePlan;
}
