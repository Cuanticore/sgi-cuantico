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

export interface ControlMadurez {
  aplica: boolean;
  lineaBase: number | null;
  actual: number | null;
  objetivo: number | null;
}

export interface MetricasMadurez {
  total: number;
  aplicables: number;
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
}

export function metricasMadurez(controles: readonly ControlMadurez[]): MetricasMadurez {
  const aplicables = controles.filter((c) => c.aplica);
  // A non-applicable control is excluded from every average. Letting a single zero in
  // is the defect the applicability flag exists to prevent.
  const niveles = aplicables.map((c) => c.actual ?? 0);

  const enL3 = aplicables.filter((c) => (c.actual ?? 0) >= 3).length;
  const enObjetivo = aplicables.filter(
    (c) => c.objetivo !== null && (c.actual ?? 0) >= c.objetivo,
  ).length;
  // Gaps are never aggregated into a decimal: a control at L1 is a concrete action
  // with an owner and a date. This counts them, it does not average them.
  const brechas = aplicables.filter((c) => (c.actual ?? 0) <= 2).length;
  const brechaTotal = aplicables.reduce(
    (suma, c) => suma + Math.max(0, (c.objetivo ?? 0) - (c.actual ?? 0)),
    0,
  );
  const avances = aplicables
    .filter((c) => c.lineaBase !== null && c.actual !== null)
    .map((c) => (c.actual as number) - (c.lineaBase as number));

  return {
    total: controles.length,
    aplicables: aplicables.length,
    noAplicables: controles.length - aplicables.length,
    indice: media(aplicables.map((c) => eficaciaDeNivel(c.actual))) * 100,
    nivelTipico: mediana(niveles),
    nivelMedio: media(niveles),
    enL3,
    pctL3: aplicables.length === 0 ? 0 : (enL3 / aplicables.length) * 100,
    enObjetivo,
    brechas,
    avanceMedio: media(avances),
    brechaTotal,
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
