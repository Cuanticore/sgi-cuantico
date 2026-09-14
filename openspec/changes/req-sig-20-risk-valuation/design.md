# Design: REQ-SIG-20 · Risk Valuation Process

## Technical Approach

Four blocks. **Base**: threshold gating — client stops deriving, server rejects, inventory swaps risk columns for a counted value filter. **Trazabilidad**: pure steps over `formulas.ts` — live arithmetic + read-only copyable Ecuación tab. **El camino**: one `FichaActivo`, two wrappers — overlay contract + `/sgsi/valoracion-riesgos`. **El cierre**: derived plan debt (D17: signal, never block); one batched save → one `Bitacora` row per changed field with the note; `CriticidadNegocio` declared/seeded/imported/shown. Threshold live; nothing hard-codes 37.

## Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|---|---|---|---|
| D1 | Overlay (P3) | root-layout `OverlayActivo` (Suspense) on `?activo=`; fetch via `abrirOverlayActivo`; close `router.replace`, save `router.refresh`; URL tabs `general\|amenazas\|matrices\|ecuacion` → internal `valoracion\|amenazas\|resumen\|ecuacion`, full page accepts both | per-page overlays; second ficha | layouts can't read searchParams — root mount is the only "any screen" answer; `resumen` is the "Matrices" tab; unknown code → notice |
| D2 | Gating (P1) | derivation `useMemo` (FichaActivo:592) returns `[]` unless `entra`; previews (2446, 3458) deleted; badge count-free; tabs visible + disabled, hover states value/threshold/`Parametro` source; `activoEnAnalisis()` guard in `acciones/riesgos.ts` rejects below-threshold degradación/frecuencia/madurez writes | disabled-only UI | acceptance is "does not execute"; the tab helps, the action controls |
| D3 | Ecuación (P8) | pure `lib/sgsi/ecuacion.ts` composes `formulas.ts`/`madurez.ts` into seven steps; exceptions surface per step with justification; copy emits plain text | component arithmetic | one arithmetic ⇒ step 7 equals stored `riesgoResidual` to the fourth decimal by construction |
| D4 | Plan debt + popup (P2) | "sin plan" derived, never stored: non-obsolete Crítico-band risk without active `AccionPlan` matching origin; origin = machine-checked `AccionPlan.origen` prefix (`lib/sgsi/origen-plan.ts`); age walks `RiesgoCalculo` streak, snapshotted by `generarRiesgos` (batched `createMany`); `PopupPlanCritico` prefills per the spec table and saves via `guardarAccion`/`crearAccionDesdeControl` dedupe; `ACEPTAR` blocks already enforced | `Riesgo.planPendienteEn` column; Bitácora last-touch; per-asset list | no new tables/columns allowed; `RiesgoCalculo` exists, readerless; D-4: unit is the control; registered `ACEPTAR` exits both bands |
| D5 | Notes (P6) | `guardarSesionRiesgo(codigo, borrador, nota)`: note mandatory (the single deliberate block); one `$transaction` → `registrar()` one `Bitacora` row per changed field, note as `motivo`, note → `Riesgo.justificacion`, upserts exceptions + `madurezId`; then `generarRiesgos`; response carries the critical trigger | per-change modals | record vs narrative; invariant 7; `madurezId` gains first writer |
| D6 | Criticality (P9) | `CriticidadNegocio` (int minutes; C5 null = sin SLA), additive nullable `Activo.criticidadId`, migration + five-row seed; importer column 26: empty → null + warning, unrecognized → rejected naming the code; edit in General; chips in lists; sort by RTO; C1/C2 + D ≤ 3 warns, D = 5 + C4/C5 silent | derive from residual; text minutes | D-3: business declaration — "critical because badly protected" is backwards; minutes sort and compare |
| D7 | Analysis page (P4) | REQ-SIG-18 pattern: server page + query + client screen + pure `lib/sgsi/analisis-riesgos.ts` (rows by worst residual, five cards, six URL-driven filters); cards/list recount together; ramp reused unchanged (`valoracion-figura.ts`); «Análisis de riesgos» after «Valoración de activos»; visit writes nothing | second report screen; new ramp | proven, tested, linkable-filter pattern |

## Data Flow

Save → popup → band:

```
Ficha ──guardarSesionRiesgo(cód, borrador, nota)──▶ action
        │ tx: Bitacora×n (nota=motivo) + justificacion + excepciones + madurezId
        │ generarRiesgos: recompute + RiesgoCalculo snapshot
        ◀─ {ok, crítico?: prefill}
        └▶ PopupPlanCritico ──close w/o register──▶ debt DERIVED, no write
/sgsi/planes + lists ──deuda-planes──▶ codes + age vs plazoPlan
```

Threshold → recalc (no code change):

```
DB: umbral 4→3 ─▶ next save/import ─▶ generarRiesgos (reads Parametro live)
   ─▶ 244 re-enter: risks created/reactivated, dropouts obsoleto ─▶ revalidate
```

Overlay:

```
any URL + ?activo=C&tab=ecuacion ─▶ OverlayActivo ─▶ same FichaActivo
close ─▶ router.replace   save ─▶ router.refresh
```

## File Changes

| File | Action | Description |
|---|---|---|
| `prisma/schema.prisma` | Modify | criticality model + FK |
| `prisma/migrations/<ts>_criticidad_negocio/` | Create | additive migration |
| `prisma/seeds/criticidad.ts` | Create | five levels in minutes |
| `app/components/sgsi/activos/FichaActivo.tsx` | Modify | gating, Ecuación, notes, criticality, overlay |
| `app/components/sgsi/activos/ficha.query.ts` | Modify | criticality, relevance flag, overlay action |
| `app/components/sgsi/activos/OverlayActivo.tsx` | Create | overlay wrapper |
| `app/components/sgsi/activos/PestanaEcuacion.tsx` | Create | seven steps, copy |
| `app/components/sgsi/activos/PopupPlanCritico.tsx` | Create | prefilled plan popup |
| `app/layout.tsx` | Modify | mount overlay |
| `app/sgsi/inventario/[codigo]/page.tsx` | Modify | tab aliases |
| `app/sgsi/acciones/riesgos.ts` | Modify | guard, `guardarSesionRiesgo` |
| `app/sgsi/acciones/plan.ts` | Modify | risk-origin prefill |
| `lib/sgsi/riesgos.ts` | Modify | `RiesgoCalculo` snapshot |
| `lib/sgsi/ecuacion.ts` (+tests) | Create | seven-step resolution |
| `lib/sgsi/deuda-planes.ts` (+tests) | Create | sin-plan + age |
| `lib/sgsi/origen-plan.ts` (+tests) | Create | origin prefix |
| `lib/sgsi/analisis-riesgos.ts` (+tests) | Create | rows, cards, filters |
| `app/sgsi/valoracion-riesgos/page.tsx` | Create | server page |
| `app/components/sgsi/valoracion-riesgos/` | Create | query + screen |
| `app/components/sgsi/planes/FranjaSinPlan.tsx` | Create | alert band, amber dots |
| `app/components/sgsi/planes/PlanesTratamiento.tsx` | Modify | mount band |
| `app/components/sgsi/inventario/InventarioActivos.tsx` | Modify | drop columns, value filter, amber dot |
| `lib/sgsi/inventario-filtros.ts` | Modify | drop `color`, value counts |
| `app/components/sgsi/SidebarSgsi.tsx` | Modify | menu entry |
| `lib/sgsi/consolidado-lectura.ts` | Modify | column 26 |
| `app/api/sgsi/exportar-activos/route.ts` | Modify | empty, never `0` |

## Interfaces / Contracts

```ts
// URL: ?activo=<code>&tab=general|amenazas|matrices|ecuacion
// guardarSesionRiesgo per D5; borrador fields null = inherit the threat.
// AccionPlan.origen — machine-checked prefix, one owner module:
`origen:v1|R-0123|TEC-GEN-0004|A.24 · <human rationale>`
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | step-7 parity (fourth decimal); debt streak + age; origin round-trip; column 26; value-filter counts (3 · 34 · 37 · 244 · 18); `plazoPlan` parse | Jest, collocated `__tests__`, RED first (strict TDD) |
| Integration | derivation trace (value-5 once, value-3 never); notes dialog (3 rows, note-less fails); copy; cards ↔ list agree; overlay close | Testing Library (jsdom) |
| E2E | — | not available |

## Threat Matrix

N/A — application routes and URL parameters only; no shell, subprocess, VCS/PR automation, executable classification, or process integration.

## Migration / Rollout

One additive migration behind the deploy gate (preflight + backup + `prisma migrate deploy`); rollback: revert the commit, migration may stay, restore backup if recalc touched data. Run `generarRiesgos` last — V19 expects 299 / 37 / 725.

## Open Questions

- [ ] D-1 label — «Análisis de riesgos» recommended; one-line swap
- [ ] `plazoPlan` string («15 días»); parser covers `N días` / «No requiere»
- [ ] persona filter sparse until `Activo.personaId` is maintained
