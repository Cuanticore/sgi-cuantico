// lib/sgsi/formulas.ts
//
// The model's formulas, from MET-SIG-01 v3 section 7, implemented exactly as written:
//
//   valor(a)             = max(v_D, v_I, v_C)              calculated, never captured
//   impacto_d(a,t)       = v_d(a) × degradacion_d(t)
//   impacto(a,t)         = max(impacto_D, impacto_I, impacto_C)
//   riesgo(a,t)          = impacto(a,t) × aro(t)           inherent, or potential
//   eficacia(a,t)        = aggregated efficacy of the threat's controls
//   aro_residual(a,t)    = aro(t) × (1 − eficacia(a,t))
//   riesgo_residual(a,t) = impacto(a,t) × aro_residual(a,t)
//
// THERE IS NO RESIDUAL IMPACT. Only the preventive effect is modelled: efficacy reduces
// frequency, never impact. Controls that limit damage are reflected by lowering the
// THREAT's degradation, so there is one judgement per row and not two. If a residual
// impact ever appears in a report, it is an implementation error.
//
// Decimal, not float. `1 - 0.9` is 0.09999999999999998 in binary floating point, and
// 5 × that is 0.4999999999999999, which classifies as Bajo against a 0.5 threshold when
// the true value is Medio. The artefact is already visible in the workbook.

import Decimal from 'decimal.js';

export { Decimal };

/// Four decimal places, half-up, at every persistence point.
export function redondear(valor: Decimal.Value): Decimal {
  return new Decimal(valor).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

export interface ValoresDimension {
  D: number;
  I: number;
  C: number;
}

/// One critical dimension is enough to make the asset critical.
///
/// THE MAXIMUM OVER AN ARBITRARY SET OF DIMENSIONS. `Dimension` admits five codes —
/// D, I, C, A, T — and three are seeded today, so anything that aggregates the register
/// has to iterate the ACTIVE dimensions instead of three constants (REQ-SIG-18 §3). This
/// is the one implementation of the rule; `valorActivo` below is the three-dimension
/// entry point every screen already calls, and it delegates here so that there is still
/// exactly one place where the value can be wrong.
///
/// The caller decides what "no dimension at all" means: an empty list would have no
/// maximum, so it is rejected rather than answered with a zero. Not valued and valued
/// at zero are different facts and confusing them inflates the lowest level with assets
/// nobody ever looked at.
export function valorMaximo(valores: readonly number[]): Decimal {
  if (valores.length === 0) {
    throw new Error('valorMaximo: sin dimensiones valoradas no hay máximo que calcular');
  }
  return new Decimal(Math.max(...valores));
}

export function valorActivo(valores: ValoresDimension): Decimal {
  return valorMaximo([valores.D, valores.I, valores.C]);
}

/// The value of a dimension multiplied by the fraction the threat degrades in it.
export function impactoDimension(valor: number, degradacion: Decimal.Value): Decimal {
  return redondear(new Decimal(valor).times(degradacion));
}

/// The accumulated impact of the asset-threat pair, on the same 0-5 scale as the value.
export function impactoAcumulado(
  valores: ValoresDimension,
  degradaciones: Record<keyof ValoresDimension, Decimal.Value>,
): Decimal {
  const porDimension = (['D', 'I', 'C'] as const).map((d) =>
    impactoDimension(valores[d], degradaciones[d]),
  );
  return porDimension.reduce((mayor, actual) => (actual.gt(mayor) ? actual : mayor));
}

/// Weighs the impact with the expected frequency. Read as expected damage per year.
export function riesgoPotencial(impacto: Decimal.Value, aro: Decimal.Value): Decimal {
  return redondear(new Decimal(impacto).times(aro));
}

/// Efficacy reduces how often the threat materialises, and nothing else.
export function aroResidual(aro: Decimal.Value, eficacia: Decimal.Value): Decimal {
  return redondear(new Decimal(aro).times(new Decimal(1).minus(eficacia)));
}

/// The impact does not change: what drops is the frequency.
export function riesgoResidual(impacto: Decimal.Value, aroRes: Decimal.Value): Decimal {
  return redondear(new Decimal(impacto).times(aroRes));
}

export interface EntradaRiesgo {
  valores: ValoresDimension;
  degradaciones: Record<keyof ValoresDimension, Decimal.Value>;
  aro: Decimal.Value;
  eficacia: Decimal.Value;
}

export interface SalidaRiesgo {
  impacto: Decimal;
  riesgoPotencial: Decimal;
  frecuenciaResidual: Decimal;
  riesgoResidual: Decimal;
}

/// The single arithmetic path. Every figure in the application comes through here, so
/// there is one place where a number can be wrong and one place to fix it.
export function calcularRiesgo(entrada: EntradaRiesgo): SalidaRiesgo {
  const impacto = impactoAcumulado(entrada.valores, entrada.degradaciones);
  const potencial = riesgoPotencial(impacto, entrada.aro);
  const frecuenciaResidual = aroResidual(entrada.aro, entrada.eficacia);
  return {
    impacto,
    riesgoPotencial: potencial,
    frecuenciaResidual,
    riesgoResidual: riesgoResidual(impacto, frecuenciaResidual),
  };
}

/// An asset enters the analysis when its value reaches the threshold, 4 by default.
export function entraAlAnalisis(valores: ValoresDimension, umbral: number): boolean {
  return valorActivo(valores).gte(umbral);
}
