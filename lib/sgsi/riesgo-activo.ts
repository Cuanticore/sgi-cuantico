// lib/sgsi/riesgo-activo.ts
//
// Collapses an asset's risk figures into ONE inherent/residual level for the inventory.
// It used to live in the inventory component, which worked for the screen and made the
// export build its own copy — and two copies of an undecided rule is how the second one
// lands on the wrong side of an audit. The screen and the workbook read one module.
//
// THE UNRATIFIED RULE — README open question 2: how to collapse many risks into one level
// is undecided by the client. MAXIMUM is the working assumption: it is the only option
// that cannot hide a critical risk behind a mass of low ones, which is the failure mode
// an inventory column must not have. Swapping it for the mean or a percentile is a change
// to `nivelDeRiesgoDelActivo` and to nothing else.

import { clasificar, type Umbral } from './clasificar';

export interface UmbralRiesgo extends Umbral {
  nombre: string;
  desde: string;
  hasta: string;
  orden: number;
}

export interface NivelRiesgo {
  /// 1–5, on the same ordinal ladder as the asset value, so the row-colour rule
  /// ("residual ≥ 4", "inherente ≤ 3") keeps the meaning the handoff gives it.
  nivel: number;
  /// The band's own name — Crítico, Alto, Medio, Bajo — never a number alone.
  banda: string;
  /// The figure the band was read from, for the cell's tooltip.
  figura: string;
}

/// The top of the valuation scale. Both the asset value and the risk-band ladder are
/// read against it.
const TOPE_DE_ESCALA = 5;

/// Reduces an asset's risk figures to a single level. Returns null when there is nothing
/// to classify — no risks at all, or figures that have not been calculated yet. The
/// caller decides how to word the absence; it is never a zero.
export function nivelDeRiesgoDelActivo(
  figuras: readonly (string | null)[],
  bandas: readonly UmbralRiesgo[],
): NivelRiesgo | null {
  // The band ladder is anchored to the top of the value scale: the worst band is 5 and
  // each step down subtracts one, floored at 1. With the four bands in use — Crítico,
  // Alto, Medio, Bajo — that reads 5, 4, 3, 2, which is what makes "residual ≥ 4" mean
  // "Alto or Crítico" exactly as the handoff's row-colour rule intends.
  const nivelDeBanda = (nombre: string): number => {
    const banda = bandas.find((b) => b.nombre === nombre);
    if (!banda) return 1;
    return Math.max(1, TOPE_DE_ESCALA - (banda.orden - 1));
  };

  let mayor: NivelRiesgo | null = null;
  for (const figura of figuras) {
    if (figura === null) continue;
    const banda = clasificar(figura, bandas);
    if (banda === null) continue;
    const nivel = nivelDeBanda(banda);
    // The aggregation. This comparison is the whole of the unratified decision.
    if (mayor === null || nivel > mayor.nivel) mayor = { nivel, banda, figura };
  }
  return mayor;
}

// ============================================================================
// La banda del renglón (REQ-SIG-18 §7, movida acá en REQ-SIG-20 §4/P5 — D-6)
// ============================================================================
//
// Vivía como función local de `InventarioActivos.tsx`. REQ-SIG-20 §4 retira el filtro
// `color` de la grilla del inventario —ya no muestra ninguna columna de riesgo— y la tarea
// 3.11 lo recablea en la página de análisis (`/sgsi/valoracion-riesgos`) como el filtro
// «banda del residual». Las dos pantallas necesitan la MISMA regla, así que la regla se
// muda a este módulo puro en vez de quedar atada a un componente `'use client'`: dos
// lugares leyendo una función importada es una decisión; dos copias de la misma función es
// el defecto que este cambio persigue en cada corte.

export type ColorRenglon = 'rojo' | 'verde' | 'blanco';

/// Las tres reglas que dio el cliente, más el caso que no cubren.
///
///   · rojo   — riesgo residual de 4 a 5
///   · verde  — riesgo inherente de 4 a 5 y residual de 1 a 3
///   · blanco — riesgo inherente de 1 a 3
///
/// Lo que decide el blanco es el riesgo INHERENTE, no el valor del activo: no es la misma
/// lectura — un activo valorado 5 cuyas amenazas son infrecuentes carga un riesgo inherente
/// bajo, y pintarlo de rojo diría que es peligroso por ser valioso.
///
/// EL HUECO: inherente 4-5 con el residual todavía sin calcular no encaja en ninguna de las
/// tres. Dejado literal, cada renglón de riesgo alto perdería su color hasta que existan los
/// 272 pares de relevancia — justo los renglones que tienen que verse. Por eso un residual
/// sin calcular sobre un inherente alto se pinta ROJO: nadie mostró todavía que los controles
/// lo bajan, y tratar lo desconocido como tratado es el único error que esta pantalla no
/// puede cometer. El renglón lo dice en palabras, para que nunca se confunda con un residual
/// medido.
export function colorDeRenglon(
  inherente: NivelRiesgo | null,
  residual: NivelRiesgo | null,
): ColorRenglon {
  // El residual nunca puede superar al inherente —los controles solo reducen—, así que esta
  // cláusula se revisa primero por fidelidad a la regla enunciada, no porque pueda
  // contradecir a la siguiente.
  if (residual !== null && residual.nivel >= 4) return 'rojo';
  // Sin ningún riesgo: el activo no alcanza el umbral de análisis. Nada que colorear.
  if (inherente === null) return 'blanco';
  if (inherente.nivel <= 3) return 'blanco';
  return residual === null ? 'rojo' : 'verde';
}

/// El color nunca es el único portador: el renglón dice su propio estado en palabras para
/// quien no pueda verlo, y las tarjetas de arriba dicen lo mismo en pantalla.
///
/// Los dos rojos se distinguen a propósito. Uno es un residual medido de 4 o 5; el otro es
/// un riesgo inherente alto cuyo residual todavía nadie calculó. Se ven igual y no
/// significan lo mismo, y a quien no puede ver el color es exactamente a quien no hay que
/// decirle que una suposición es una medición.
export function textoDeRenglon(
  color: ColorRenglon,
  inherente: NivelRiesgo | null,
  residual: NivelRiesgo | null,
): string {
  if (color === 'verde') return 'Renglón verde — riesgo inherente de 4 a 5 y residual de 1 a 3';
  if (color === 'blanco') {
    return inherente === null
      ? 'Renglón blanco — el activo no alcanza el umbral de valoración, no tiene riesgos'
      : 'Renglón blanco — riesgo inherente de 1 a 3';
  }
  return residual === null
    ? 'Renglón rojo — riesgo inherente de 4 a 5 y residual sin calcular'
    : 'Renglón rojo — riesgo residual de 4 a 5';
}

// ============================================================================
// EL COLOR DE UNA BANDA
// ============================================================================

/// Rampa de severidad, la peor primero. Se indexa por la POSICIÓN de la banda y no por su
/// nombre, así que renombrar una banda nunca la vuelve gris en silencio.
///
/// Vive acá y no en cada pantalla porque `FichaActivo` y la lista de Análisis la mostraban
/// cada una con su copia, y dos copias de una escala de color es como la segunda queda con
/// un token que ya no existe. Son nombres de variables CSS: este módulo ya decide
/// presentación en `colorDeRenglon`, así que no es una frontera nueva.
export const RAMPA_RIESGO = [
  { bg: 'var(--hf-risk-critico-bg)', fg: 'var(--hf-risk-critico-fg)' },
  { bg: 'var(--hf-risk-alto-bg)', fg: 'var(--hf-risk-alto-fg)' },
  { bg: 'var(--hf-risk-medio-bg)', fg: 'var(--hf-risk-medio-fg)' },
  { bg: 'var(--hf-risk-bajo-bg)', fg: 'var(--hf-risk-bajo-fg)' },
];

/// El color de un nivel de riesgo de activo.
///
/// `NivelRiesgo.nivel` viene de `nivelDeRiesgoDelActivo`: 5 es la peor banda y cada escalón
/// hacia abajo resta uno. La rampa se indexa al revés —0 es la peor—, así que el índice es
/// `5 − nivel`, acotado a la rampa.
///
/// Es el MISMO color con el que la matriz pinta la casilla donde ese activo cae, porque
/// desde la opción B una casilla ocupada se pinta con la banda de su peor contenido. Que el
/// renglón y la casilla coincidan no es cosmético: es lo que permite leer la lista y la
/// matriz como dos vistas de la misma cosa.
export function colorDeNivel(nivel: NivelRiesgo | null): { bg: string; fg: string } | null {
  if (nivel === null) return null;
  const i = Math.min(Math.max(5 - nivel.nivel, 0), RAMPA_RIESGO.length - 1);
  return RAMPA_RIESGO[i];
}
