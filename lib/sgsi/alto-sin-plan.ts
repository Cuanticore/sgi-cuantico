// lib/sgsi/alto-sin-plan.ts
//
// Qué amenaza, dentro de un popup de planes, no se puede dejar pasar: banda residual alta
// (o crítica) y sin plan registrado todavía.
//
// ── ESTE MÓDULO ES EL ÚNICO DUEÑO DEL CRITERIO ──────────────────────────────────────────
//
// `lib/sgsi/columnas-analisis.ts` traía su propia `BANDAS_ALARMANTES` privada mientras este
// archivo declaraba otra igual. La duplicación se cerró el 22/09/2026, en la dirección que ya
// estaba escrita acá: ese archivo importa de éste y borró la suya. Dos listas que se separan es
// cómo la grilla y este popup terminan diciendo cosas distintas sobre la misma amenaza.
//
// ── POR QUÉ `Crítico` SIGUE EN LA LISTA AUNQUE HOY NO TENGA NINGUNA FILA ────────────────
//
// La banda `Crítico` empieza en 25.0 y el residual máximo real del modelo, hoy, es 13.0: no
// hay ni un solo riesgo en esa banda en este momento. Se incluye igual porque el predicado no
// depende de qué haya hoy sino de qué significa `Crítico`: el día que la escala cambie o entre
// un riesgo que la alcance, tiene que marcarse sin que nadie tenga que acordarse de agregarlo.
//
// ── ESTE CRITERIO ES RESIDUAL, NO BRECHA — Y ES A PROPÓSITO ─────────────────────────────
//
// Este módulo marca por BANDA RESIDUAL, y desde el 22/09/2026 el rojo de la grilla también:
// `claseDeFila` pinta `fila-alarmante` con `FilaAnalisis.altoSinPlan`, que es esta misma
// pregunta agregada al activo. La BRECHA DE CONTROL (`estadoPlan === 'pendiente'`) —que es la
// otra pregunta, la de madurez— se mudó al acento ámbar `fila-brecha-pendiente`.
//
// Los dos rojos contestan lo mismo, pero a distinta escala: acá una amenaza, allá el activo
// entero. Un activo rojo en la grilla trae al menos una amenaza marcada en este popup, y ésa es
// la garantía que la reconciliación buscaba. El ámbar NO viaja acá: es una afirmación sobre el
// activo —su control no alcanza lo exigido— y este popup no conoce ese estado.
//
// La decisión completa está en `docs/superpowers/specs/2026-09-22-acento-alto-sin-plan-design.md`.

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
