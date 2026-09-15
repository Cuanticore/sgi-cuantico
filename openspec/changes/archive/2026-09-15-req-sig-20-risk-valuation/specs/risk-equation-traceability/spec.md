# Delta for risk-equation-traceability

## Purpose

Every figure is traceable to the arithmetic that produced it: live arithmetic beside each value in the Amenazas tab (P7) and a read-only, copyable Ecuación tab that resolves the calculation step by step (P8). All arithmetic comes from `lib/sgsi/formulas.ts` — no client-side reimplementation, because two implementations diverge.

## ADDED Requirements

### Requirement: Live arithmetic beside the data

Each threat row MUST show its arithmetic next to the value that produces it, not in a tooltip: per dimension, `valor del activo × degradación = impacto_d` with the operand values in parentheses; `impacto = max(impacto_D, impacto_I, impacto_C)`; the frequency with its ARO; `inherente = impacto × ARO` with its band; the efficacy (mean of the risk's controls) with the «sin relevancia asignada» warning placed right there; and `residual = impacto × (ARO × (1 − e))` with its band. The parenthesized values MUST change live with each combo, before saving, so values can be probed.

#### Scenario: Combo change updates the numbers live

- GIVEN a threat row with degradación D = Alta (0.8)
- WHEN the combo is changed to Muy alta (1.0)
- THEN the parenthesized value and every dependent figure update immediately, before any save

#### Scenario: No relevance assigned warns beside the efficacy

- GIVEN a risk whose controls have no relevance assigned
- WHEN the row renders
- THEN the efficacy line carries the «sin relevancia asignada» warning beside it

### Requirement: Single arithmetic source

No figure on these screens MAY be recalculated with separate client-side arithmetic; every figure MUST come from `lib/sgsi/formulas.ts`.

#### Scenario: One arithmetic, matched to the fourth decimal

- GIVEN the Ecuación tab for TEC-GEN-0004 × A.24
- WHEN step 7 resolves
- THEN it matches the stored `Riesgo.riesgoResidual` to the fourth decimal — if they differ, there are two arithmetics

### Requirement: Read-only Ecuación tab, seven steps

A new Ecuación tab MUST resolve, for the selected threat, the steps that really ran:

| # | Step |
|---|---|
| 1 | `valor = max(v_D, v_I, v_C)` |
| 2 | `impacto_d = v_d × degradación_d` per dimension |
| 3 | `impacto = max(impacto_D, impacto_I, impacto_C)` — the maximum, not the sum, keeps the 0–5 scale |
| 4 | `inherente = impacto × ARO` with band |
| 5 | `e = media ponderada acotada por el principal`, expandable to the principal/secondary/complementary control-group breakdown when relevance exists, with the no-relevance note (media simple, techo no opera) when it does not |
| 6 | `ARO_res = ARO × (1 − e)` |
| 7 | `residual = impacto × ARO_res` with band |

The tab MUST state that impact does not change between inherent and residual — efficacy reduces the frequency, never the damage; a residual impact would be an implementation error. When `RiesgoDegradacion`, `Riesgo.frecuenciaId`, or `Riesgo.madurezId` carries an exception, the affected step MUST say so and show its written justification.

#### Scenario: Exception surfaces in its step

- GIVEN TEC-GEN-0004 × A.24 with a frequency exception
- WHEN the Ecuación tab renders
- THEN the frequency step shows the exception and its justification, and step 7 matches `riesgoResidual` to the fourth decimal

#### Scenario: Step 5 expands when relevance exists

- GIVEN a risk with control relevance assigned
- WHEN step 5 is expanded
- THEN the principal, secondary, and complementary breakdown shows

### Requirement: Read-only and copyable as text

The Ecuación tab MUST be read-only (editing happens in Amenazas; here it is understood) and MUST be copyable as plain text, to paste into committee minutes or send to an auditor.

#### Scenario: Copy as text for an acta

- GIVEN the rendered Ecuación tab
- WHEN its content is copied
- THEN the clipboard holds the seven steps as plain text
