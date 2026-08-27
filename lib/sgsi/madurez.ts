// lib/sgsi/madurez.ts
//
// Maturity arithmetic, per MET-SIG-01 v3 section 8.2. Pure on purpose: no Prisma, no
// I/O, no framework. The Controles screen recomputes the whole dashboard client-side
// while the user drags maturity selects, and the seed verifies the same numbers
// server-side, so both must call one implementation.
//
// THE RULE THAT IS EASY TO GET WRONG
//
// The maturity index is the mean of EFFICACY, not the mean of the level. Efficacy is a
// ratio scale and can be averaged; the L0-L5 level is ordinal and averaging it is
// incorrect in rigour. Efficacy is also what feeds residual risk, so maturity and risk
// speak the same language. The mean LEVEL is kept only as a comparison between periods,
// never as "the organisation's maturity": an L5 offsetting an L0 hides exactly what
// needs managing.

/// CMM level to efficacy, per PILAR (CCN-CERT). The big jump is L2 to L3.
export const EFICACIA_POR_NIVEL = [0, 0.1, 0.5, 0.9, 0.95, 1] as const;

export function eficaciaDeNivel(nivel: number | null): number {
  if (nivel === null || nivel < 0 || nivel > 5) return 0;
  return EFICACIA_POR_NIVEL[nivel];
}

export function media(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/// The correct statistic for an ordinal scale, and it resists extremes.
export function mediana(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[medio - 1] + orden[medio]) / 2 : orden[medio];
}

export type EstadoSoa = 'si' | 'parcial' | 'no';

/// SOA derivation per ISO 27001 6.1.3 d. «Aplica con alcance adaptado» is NOT an
/// exclusion: the control covers the scope through the remote operating model (the
/// seven physical controls of DEC-SIG-01 6.3), and it counts in every indicator. Only
/// «No aplica» excludes.
export function esAplicable(soa: EstadoSoa): boolean {
  return soa !== 'no';
}

/// Human label for the SOA state, used in the bitácora and the export.
export function etiquetaSoa(soa: EstadoSoa): string {
  return soa === 'no' ? 'No aplica' : soa === 'parcial' ? 'Aplica con alcance adaptado' : 'Aplica';
}

/// Pure validation of a SOA change, shared by the action and the UI so both refuse the
/// same inputs. Returns error messages, empty when valid. Rule 6.1.3 d: NO and PARCIAL
/// require a written justification an auditor can review.
export function validarNuevoSoa(soa: EstadoSoa, justificacion: string): string[] {
  const errores: string[] = [];
  const j = justificacion.trim();
  if ((soa === 'no' || soa === 'parcial') && j.length === 0) {
    errores.push(
      soa === 'no'
        ? '«No aplica» exige justificación escrita: es la declaración de exclusión que el auditor revé.'
        : '«Aplica con alcance adaptado» exige justificación escrita: cómo se alcanza el objetivo en el modelo de operación remota.',
    );
  }
  return errores;
}

/// Rule 2: a control whose scope coverage is partial rarely sustains L4/L5 in an audit.
/// Only an advertencia, not a rejection — the warning is shown to the author, who decides.
export function advertenciaParcialNivelAlto(actual: number | null): boolean {
  return actual !== null && actual >= 4;
}

export interface ControlMadurez {
  soa: EstadoSoa;
  lineaBase: number | null;
  actual: number | null;
  objetivo: number | null;
}

export interface MetricasMadurez {
  total: number;
  aplicables: number;
  parciales: number;
  noAplicables: number;
  /// Mean of efficacy, as a percentage. The headline metric.
  indice: number;
  /// Median of the level.
  nivelTipico: number;
  /// Mean of the level. REFERENCE ONLY — never report this as "the maturity".
  nivelMedio: number;
  enL3: number;
  pctL3: number;
  enObjetivo: number;
  brechas: number;
  avanceMedio: number;
  brechaTotal: number;
  /// Applicable controls whose baseline is the GAP of 2 mar 2026. A.7.13 is declared
  /// applicable but was never evaluated by the GAP, so it is absent here (92 of 93).
  conLineaBase: number;
}

export function metricasMadurez(controles: readonly ControlMadurez[]): MetricasMadurez {
  const aplicables = controles.filter((c) => esAplicable(c.soa));
  const parciales = aplicables.filter((c) => c.soa === 'parcial').length;
  // A non-applicable control is excluded from every average. Letting a single zero in
  // is the defect the applicability flag exists to prevent.
  //
  // So is an applicable control that nobody has scored yet: «Sin evaluar» (A.7.13)
  // and «Por evaluar» (los siete de alcance adaptado) are pending judgments, not L0s.
  // Feeding zero would write a decision that was never made into every mean.
  const evaluados = aplicables.filter((c) => c.actual !== null);
  const niveles = evaluados.map((c) => c.actual as number);

  const enL3 = evaluados.filter((c) => (c.actual as number) >= 3).length;
  const enObjetivo = evaluados.filter(
    (c) => c.objetivo !== null && (c.actual as number) >= c.objetivo,
  ).length;
  // Gaps are never aggregated into a decimal: a control at L1 is a concrete action
  // with an owner and a date. This counts them, it does not average them.
  const brechas = evaluados.filter((c) => (c.actual as number) <= 2).length;
  const brechaTotal = evaluados.reduce(
    (suma, c) => suma + Math.max(0, (c.objetivo ?? 0) - (c.actual as number)),
    0,
  );
  const avances = aplicables
    .filter((c) => c.lineaBase !== null && c.actual !== null)
    .map((c) => (c.actual as number) - (c.lineaBase as number));

  return {
    total: controles.length,
    aplicables: aplicables.length,
    parciales,
    noAplicables: controles.length - aplicables.length,
    indice: media(evaluados.map((c) => eficaciaDeNivel(c.actual))) * 100,
    nivelTipico: mediana(niveles),
    nivelMedio: media(niveles),
    enL3,
    pctL3: evaluados.length === 0 ? 0 : (enL3 / evaluados.length) * 100,
    enObjetivo,
    brechas,
    avanceMedio: media(avances),
    brechaTotal,
    conLineaBase: aplicables.filter((c) => c.lineaBase !== null).length,
  };
}

/// Aggregated efficacy of the controls that mitigate one threat, per MET-SIG-01
/// section 7.4: a weighted mean capped by the principal control.
///
///     e(t) = MIN( sum(wi * ei) / sum(wi) , e_principal + delta )
///
/// The cap is the essential part of the rule. If the principal control of an
/// information leak is data-loss prevention and it sits at L2, the efficacy of that
/// threat cannot exceed 55%, however mature the policies, the awareness and the
/// network are. It only bites when the principal is weak.
///
/// Probabilistic composition — one minus the product of the complements — is expressly
/// ruled out: four controls at L3 would yield 99.995%. MAGERIT efficacy is not an
/// independent probability of blocking but a degree of implementation quality, and
/// controls operated by the same organisation share failure modes.
export function eficaciaAmenaza(
  controles: readonly { nivel: number | null; peso: number; esPrincipal: boolean }[],
  delta = 0.05,
): number {
  if (controles.length === 0) return 0;

  const sumaPesos = controles.reduce((a, c) => a + c.peso, 0);
  if (sumaPesos === 0) return 0;
  const ponderada =
    controles.reduce((a, c) => a + c.peso * eficaciaDeNivel(c.nivel), 0) / sumaPesos;

  const principal = controles.find((c) => c.esPrincipal);
  if (!principal) return ponderada;

  return Math.min(ponderada, eficaciaDeNivel(principal.nivel) + delta);
}
