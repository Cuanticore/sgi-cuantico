# Proposal: REQ-SIG-20 · Risk Valuation Process

## Intent

The app shows screens, not the process: which assets enter analysis, where figures come from, what to do when residual stays critical. `FichaActivo.tsx` derives threats for all 299 assets though only 37 reach `umbral_valoracion`. Source: `docs/handoff_sig/proceso-valoracion-de-riesgos.md`.

## Scope

### In Scope

- P1 · Gating: tabs disabled with reason; server rejects below-threshold writes; derivation pass removed
- P5 · Grid: drop inherent/residual columns; value filter with counts; move `color` filter
- P4 · Page `/sgsi/valoracion-riesgos`: cards, rows, six filters
- P3 · `?activo=<code>&tab=` overlay; one component, two wrappers
- P2 · Critical residual: save succeeds (D17); prefilled popup; `plan pendiente`; named bands: `/sgsi/planes` + lists; `ACEPTAR` exits; unit is the control
- P7/P8 · Live arithmetic; read-only Ecuación tab, copyable, from `formulas.ts`
- P6 · One note → `Bitacora` row per changed field, single transaction; note-less save fails
- P9 · `CriticidadNegocio`: declared, FOR-SIG-12 column 26, five RTO/RPO levels in minutes, importer, checks
- Recalc: 37 / 725; exports empty, never 0

### Out of Scope

- Exigencia rule (REQ-SIG-23); 272-pair relevance; maturity fixes (REQ-SIG-21/22); formula/curve/catalog; chart libs; plan-per-risk

## Capabilities

### New Capabilities

- `risk-analysis-scope`: gating
- `risk-inventory-view`: grid
- `risk-analysis-page`: cards, filters, bands
- `asset-overlay-url`: `?activo` overlay
- `critical-risk-treatment-plan`: signal, never block
- `risk-equation-traceability`: Ecuación
- `end-of-session-notes`: per-field audit
- `business-criticality`: RTO/RPO catalog

### Modified Capabilities

None — `openspec/specs/` is empty.

## Approach

Blocks: Base 1.5d → Trazabilidad 3d → El camino 5d → El cierre 8d + tests 2d (19.5). Threshold from `Parametro.umbral_valoracion` (3 moves all, no recompile). Arithmetic only from `lib/sgsi/formulas.ts`; ramp reused unchanged (REQ-SIG-18 §4.4). Nothing hard-codes 37 (244 one point below); missing data fails with the asset code.

## Affected Areas

| Area | Impact | Change |
|---|---|---|
| `app/components/sgsi/activos/FichaActivo.tsx` | Modified | gating, preview removal, Ecuación, notes |
| `app/components/sgsi/inventario/InventarioActivos.tsx` | Modified | columns, filters |
| `app/sgsi/valoracion-riesgos/` | New | analysis page |
| `app/sgsi/acciones/riesgos.ts` | Modified | threshold rejection, notes transaction |
| `lib/sgsi/consolidado-lectura.ts` | Modified | column 26 import |
| `prisma/schema.prisma` + migration + seed | New | `CriticidadNegocio`, `Activo.criticidadId` |
| `app/components/sgsi/SidebarSgsi.tsx` | Modified | menu entry |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Preview removal breaks consumers | Med | audit first |
| Overlay couples to page ficha | Med | one component, two wrappers |
| Migration in production | Low | additive nullable; gated backup |
| D-1/D-4/D-6 open | Low | non-blocking; recommendations default |
| `validate_palette.js` absent | Low | ramp unchanged |

## Rollback Plan

Deploy gate: preflight + backup + `prisma migrate deploy`. Revert the deploy commit; the additive migration may stay applied; restore backup if recalc touched data.

## Dependencies

- REQ-SIG-21/22/23 build on this change; not created — `dependsOn` empty
- Closed: D-2, D-3, D-5. Open non-blocking: D-1 page name (recommend "Análisis de riesgos"), D-4 plan-on-control, D-6 `color` move

## Success Criteria

- [ ] Value-3 asset: tabs disabled + explained; server rejects; derivation never executes
- [ ] 299 / 37 / 725; threshold 3 regenerates without code change
- [ ] Ecuación matches `Riesgo.riesgoResidual` to 4th decimal
- [ ] Critical residual saves; popup prefills; bands both lists; `ACEPTAR` exits
- [ ] Three edits → three `Bitacora` rows, one note; note-less save fails
- [ ] Five criticality rows, minutes numeric; column 26 imports null-with-warning
