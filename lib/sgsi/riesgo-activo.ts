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
