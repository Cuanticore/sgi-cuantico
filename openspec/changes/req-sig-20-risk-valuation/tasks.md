# Tasks: REQ-SIG-20 · Risk Valuation Process

Source order: `docs/handoff_sig/proceso-valoracion-de-riesgos.md` §13 (four blocks, the two
first are the base of the rest) + `design.md` D1–D7. Phases below map 1:1 to the spec's blocks,
plus a Phase 0 (baseline) and the spec's own Phase 5 (tests/adjustment).

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 5,500–7,000 (26 files, incl. tests; matches the 19.5-day estimate) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes — see flag below |
| Suggested split | 5 blocks × internal checkpoints (A–E), see Suggested Work Units |
| Delivery strategy | single-pr (session preflight) |
| Chain strategy | size-exception (forced by single-pr per guard rules) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

**Flag, not resolved here.** The session fixed delivery = single-pr with a 1500-line budget.
The estimate above (5,500–7,000) is 3.5–4.5× that budget even under the raised cap. A literal
one-PR-under-1500-lines delivery is not mechanically achievable for this change without
dropping scope. The checkpoints below (A–E) are marked so the orchestrator can pause for
`size:exception` approval at each one without splitting a task — but if the maintainer instead
wants true chained/stacked PRs, checkpoints A–E are also valid PR boundaries. This choice is
left to the user/orchestrator, not decided here.

### Suggested Work Units (also the size:exception checkpoints)

| Unit | Goal | Checkpoint | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Phase 1 — gating + grid + recalc | A | `npm test -- FichaActivo inventario-filtros riesgos` | Open a value-3 and a value-5 ficha; run `generarRiesgos` against a seeded copy | Revert Phase 1 files; no schema touched |
| 2 | Phase 2 — live arithmetic + Ecuación | B | `npm test -- ecuacion PestanaEcuacion` | Open Amenazas/Ecuación tabs for TEC-GEN-0004 × A.24 | Revert Phase 2 files; Phase 1 stands alone |
| 3a | Phase 3.1–3.7 — overlay | C1 | `npm test -- OverlayActivo` | Open `?activo=…` from 3 real routes | Remove overlay mount from `layout.tsx`; full page still works |
| 3b | Phase 3.8–3.13 — analysis page | C2 | `npm test -- analisis-riesgos` | Visit `/sgsi/valoracion-riesgos` | Remove sidebar entry + route; nothing else depends on it yet |
| 4a | Phase 4.1–4.7 — criticality + migration | D | `npm test -- consolidado-lectura criticidad` | Import a FOR-SIG-12 with/without column 26 | Additive migration may stay per proposal Rollback Plan |
| 4b | Phase 4.8–4.19 — plan debt + notes | E | `npm test -- deuda-planes origen-plan riesgos` (notes) | Save a madurez leaving residual Crítico; close popup unregistered | Revert Phase 4b files; 4a's schema stands alone |
| 5 | Phase 5 — full regression | — | `npm test && npx tsc --noEmit -p tsconfig.json && npm run lint` | Run all 15 §14 acceptance criteria | N/A — verification only, no revert |

## Open Items & Flags (per artifact, not resolved silently)

1. **722 vs 725 non-obsolete risks.** Verified today against the DB: 722, not the 725 the spec/
   design/proposal all state. Task 1.9 investigates and documents the cause (leading
   hypothesis: `excluidoManual` exclusions via `quitarAmenazaDelActivo`) before treating either
   number as ground truth. Do not silently edit the spec scenario's asserted count.
2. **P5's `color`-filter relocation (D-6) targets a page that doesn't exist until Phase 3.**
   Task 1.7 removes it from the grid and preserves the underlying logic; task 3.11 wires it into
   the analysis page. The grid ships without a band filter for the span between Phase 1 and
   Phase 3 delivery.
3. **`RiesgoCalculo` snapshot writer (D4) is scheduled in Phase 1 (task 1.8), not Phase 4** where
   the design narratively introduces it — because it's the same `generarRiesgos` call Phase 1
   already exercises, and Phase 4's plan-debt age (task 4.10) needs snapshot history to exist
   before it ships. Deliberate resequencing, flagged.
4. **D-1 page label** — task 3.12 uses the recommended «Análisis de riesgos» (proposal + design
   agree, non-blocking). Not a contradiction; recorded because it's still formally open.
5. **`CriterioAceptacion.plazoPlan`/`plazoEjecucion` are free-text strings** (e.g. "15 días").
   Task 4.10 writes and owns the parser; design's own Open Questions flags this as unresolved
   format. Confirm "No requiere" handling with the SIG lead if a plazo reads unparseable.
6. **Persona filter (P4 §5.3) will return sparse results** — `Activo.personaId` is mostly empty
   today (same caveat REQ-SIG-18 §6.6 already accepted). Not a defect; task 3.10 does not need
   to compensate for it.
7. **size:exception vs 1500-line budget** — see forecast flag above.

## Phase 0: Baseline

- [ ] 0.1 Confirm green baseline before any change: `npm test` (89 suites / 1743 tests, all
      pass), `npx tsc --noEmit -p tsconfig.json` (0 errors), `npm run lint` (0 errors, 5
      preexisting warnings). A different result means an environment problem, not this plan's.

## Phase 1: Base — P1 gating · P5 grid · recálculo (1.5d) — Checkpoint A

- [ ] 1.1 RED integration test in `app/components/sgsi/activos/__tests__/FichaActivo.test.tsx`:
      a value-3 asset renders zero threat rows, zero badge count, and Amenazas/Matrices visible
      **and disabled**; a value-5 asset renders ≥1 row. Fails today because the preview at
      `FichaActivo.tsx:2446/3458` still lists rows for value-3. AC: spec `risk-analysis-scope`
      "Derivation pass never executes"; proposal AC1, AC1b.
- [ ] 1.2 Make 1.1 pass: `FichaActivo.tsx` — the `useMemo` at lines 592–797 returns `[]` unless
      `entra` (line 530's `entraAlAnalisis`); delete the preview paragraphs at 2446 and 3458
      entirely (not behind a flag); badge (~1197) shows no count on empty `filas`.
- [ ] 1.3 Tabs visible+disabled with hover reason (value, threshold, `Parametro.umbral_valoracion`
      source, pointer to the valuation tab) — same file, covered by 1.1's test. AC: spec
      `risk-analysis-scope` "Threshold-gated tabs with visible reason".
- [ ] 1.4 Server-side rejection — add `activoEnAnalisis()` guard (reads `Activo` valores +
      `Parametro.umbral_valoracion`, reuses `entraAlAnalisis`) in `app/sgsi/acciones/riesgos.ts`;
      apply to `guardarTratamiento`, `excepcionFrecuencia`, `excepcionDegradacion`. Wiring —
      touches Prisma, no new unit test per repo convention; verify by running against a seeded
      value-3 fixture and confirming rejection. AC: spec `risk-analysis-scope` "Server-side
      rejection", proposal AC1.
- [ ] 1.5 Drop inherent/residual risk columns from `app/components/sgsi/inventario/
      InventarioActivos.tsx`. AC: spec `risk-inventory-view` "Grid without risk columns".
- [ ] 1.6 RED test `lib/sgsi/__tests__/inventario-filtros.test.ts`: value filter counts
      5·3, 4·34, "4 y 5"·37, 3·244, 2·18, Todos·299 from a V19-shaped fixture, never hard-coded.
      Run: `npm test -- inventario-filtros` → FAIL until implemented.
- [ ] 1.7 Make 1.6 pass in `lib/sgsi/inventario-filtros.ts`; **remove** the `color` filter from
      `InventarioActivos.tsx`'s rendered UI but **keep** its underlying band logic
      (`inventario-filtros.ts:19-46,167-237`) intact — task 3.11 rewires it into the analysis
      page (see Open Item 2). AC: spec `risk-inventory-view` "Color filter relocated (D-6)".
- [ ] 1.8 RED test extending `lib/sgsi/__tests__/riesgos.test.ts`: after `generarRiesgos` runs,
      every non-obsolete `Riesgo` has ≥1 matching `RiesgoCalculo` row whose four decimals equal
      the `Riesgo`'s. Implement the batched `createMany` snapshot writer in `lib/sgsi/riesgos.ts`
      right after the per-risk create/update loop (~line 208). This is D4's first writer for a
      table with zero writers today. See Open Item 3 for why it's here, not Phase 4. Verify:
      `npm test -- riesgos` PASS; confirm `consolidado-carga.ts:362`'s `deleteMany({})` still
      clears the table on a fresh load.
- [ ] 1.9 Run `generarRiesgos()` against the current data and record the actual non-obsolete
      risk count. Investigate the 722-vs-725 gap (Open Item 1) — check `Riesgo.excluidoManual`
      rows first — and document the finding in the PR description instead of editing the spec's
      asserted number in silence. AC: proposal Success Criteria "299 / 37 / 725"; spec
      `risk-analysis-scope` "Regeneration figures with the V19 dataset".
- [ ] 1.10 RED test: with `Parametro.umbral_valoracion` changed to 3 in a fixture DB, re-running
      `generarRiesgos` raises the in-analysis count with no code change. AC: spec
      `risk-analysis-scope` "Threshold change re-enables without recompile"; proposal AC3.
- [ ] 1.11 Verify `lib/sgsi/riesgo-activo.ts`'s `nivelDeRiesgoDelActivo` returns null/empty (not
      `0`) for a below-threshold asset with zero `Riesgo` rows, as consumed by
      `app/api/sgsi/exportar-activos/route.ts`; add a case to its test suite if not already
      covered. AC: spec `risk-analysis-scope` "Not calculated is not zero" / "Export emits
      empty, never zero".

## Phase 2: Trazabilidad — P7 fórmulas visibles · P8 pestaña Ecuación (3.0d) — Checkpoint B

- [ ] 2.1 RED test `lib/sgsi/__tests__/ecuacion.test.ts` (new module doesn't exist yet): seven
      steps compose `formulas.ts`/`madurez.ts`; TEC-GEN-0004 × A.24 fixture's step 7 matches
      `Riesgo.riesgoResidual` to the 4th decimal. Run: `npm test -- ecuacion` → FAIL
      (`Cannot find module '../ecuacion'`).
- [ ] 2.2 Implement `lib/sgsi/ecuacion.ts` to pass 2.1: pure, no client re-implementation; each
      step states whether it ran under `RiesgoDegradacion`/`frecuenciaId`/`madurezId` exception
      and carries its justification. Verify: `npm test -- ecuacion` PASS. AC: spec
      `risk-equation-traceability` "Read-only Ecuación tab, seven steps", "Exception surfaces in
      its step"; proposal AC10.
- [ ] 2.3 `app/components/sgsi/activos/PestanaEcuacion.tsx` (new) — renders the 7 steps
      read-only, expandable step 5 (principal/secondary/complementary) when relevance exists,
      copy-as-plain-text control. Test: clipboard (jsdom mock) holds the 7 steps as text after
      copy. AC: spec `risk-equation-traceability` "Read-only and copyable as text".
- [ ] 2.4 Live arithmetic beside the data (P7) — extend the Amenazas rows in `FichaActivo.tsx`:
      `valor × degradación = impacto_d` per dimension with parenthesized operands,
      `impacto = max(...)`, frequency/ARO, `inherente`, efficacy with "sin relevancia asignada"
      warning beside it, `residual`. Integration test: combo change updates the parenthesized
      value and every dependent figure before any save call fires. AC: spec
      `risk-equation-traceability` "Live arithmetic beside the data".
- [ ] 2.5 Single-arithmetic audit — grep `FichaActivo.tsx` and `PestanaEcuacion.tsx` for any
      independent recompute of impact/inherent/residual; task closes only when every displayed
      figure traces to a `formulas.ts`/`ecuacion.ts` call. AC: spec `risk-equation-traceability`
      "Single arithmetic source"; proposal AC11.

## Phase 3: El camino — P3 overlay URL · P4 página nueva (5.0d)

### 3a — Overlay (P3) — Checkpoint C1

- [ ] 3.1 RED integration test: `?activo=<unknown-code>` on any screen shows a notice and leaves
      the underlying screen unchanged (no empty overlay). Fails until `OverlayActivo.tsx`
      exists.
- [ ] 3.2 `app/components/sgsi/activos/OverlayActivo.tsx` (new) — root-mounted (Suspense),
      reads `?activo=&tab=`, fetches via `abrirOverlayActivo`, renders the same `FichaActivo`.
      Makes 3.1 pass. AC: spec `asset-overlay-url` "Unknown code does not open an empty overlay".
- [ ] 3.3 Mount in `app/layout.tsx`. Close → `router.replace` (param removed, no history entry);
      save → `router.refresh`. Test: close preserves filters/scroll of a filtered underlying
      screen, no new history entry. AC: spec `asset-overlay-url` "Closing returns exactly to the
      origin", "Saving refreshes the underlying screen".
- [ ] 3.4 Tab alias mapping: URL `general|amenazas|matrices|ecuacion` → internal
      `valoracion|amenazas|resumen|ecuacion`; unit test for the mapping function.
- [ ] 3.5 `app/sgsi/inventario/[codigo]/page.tsx` — accept both tab spellings; confirm the
      full-page route still renders standalone. AC: spec `asset-overlay-url` "Full-page route
      remains".
- [ ] 3.6 `app/components/sgsi/activos/ficha.query.ts` — add the `abrirOverlayActivo` fetch
      action.
- [ ] 3.7 Deep-link test opening `?activo=TEC-GEN-0004&tab=ecuacion` from three distinct mock
      routes; all three land on the Ecuación tab. Structural check: overlay and full page render
      the identical `FichaActivo` component — no second ficha created. AC: spec
      `asset-overlay-url` "Deep-linked tab from three distinct modules", "One component, two
      wrappers"; proposal AC6.

### 3b — Analysis page (P4) — Checkpoint C2

- [ ] 3.8 RED test `lib/sgsi/__tests__/analisis-riesgos.test.ts` (new module doesn't exist yet):
      rows sorted by worst residual descending; five card counts (EN ANÁLISIS, MUY ALTOS,
      ALTOS, RESIDUAL CRÍTICO, SIN PLAN); six filter predicates (proceso, propietario, persona,
      valor, banda, estado del plan) rescope both. Fixture reproduces 37/3/34 from the V19
      distribution.
- [ ] 3.9 Implement `lib/sgsi/analisis-riesgos.ts` to pass 3.8. AC: spec `risk-analysis-page`
      "Summary cards that filter the list", "One row per in-analysis asset", "Six filters
      rescoping list and cards".
- [ ] 3.10 `app/sgsi/valoracion-riesgos/page.tsx` + `app/components/sgsi/valoracion-riesgos/`
      (query + client screen) — server page wiring 3.9; row click opens the overlay on Amenazas
      without leaving the page (reuses 3.2). Integration test: page renders 37 rows on the V19
      fixture; cards and list agree under a filter combination. AC: proposal AC5.
- [ ] 3.11 Wire the residual-band filter into this page's filter row, reusing the logic
      preserved in task 1.7 (resolves Open Item 2). AC: spec `risk-inventory-view` "Color filter
      relocated", second half.
- [ ] 3.12 `app/components/sgsi/SidebarSgsi.tsx` — new entry «Análisis de riesgos» (D-1
      recommended label, see Open Item 4) directly after «Valoración de activos». AC: spec
      `risk-analysis-page` "Route and menu placement".
- [ ] 3.13 RED test: visiting the page and exercising its filters/cards creates zero `Bitacora`
      rows. AC: spec `risk-analysis-page` "Visiting writes nothing"; proposal AC15.

## Phase 4: El cierre — P2 plan crítico · P6 notas · P9 criticidad (8.0d)

### 4a — Criticality + migration (P9) — Checkpoint D

- [ ] 4.1 **Migration guard, mandatory before 4.3.** Run `git diff prisma/schema.prisma` and
      confirm the diff contains **only** the `CriticidadNegocio` model and `Activo.criticidadId`
      FK — nothing else. This repo has shipped a mis-named migration before because the schema
      was edited ahead of `migrate dev`, which diffs the whole file. Do not run 4.3 until this
      diff is clean.
- [ ] 4.2 `prisma/schema.prisma` — add `CriticidadNegocio` (`codigo`, `nombre`, `rtoMinutos`,
      `rpoMinutos`, `descripcion`, `orden`, `activo`, all minutes as `Int?`/`Int` per level) and
      additive nullable `Activo.criticidadId` FK. AC: spec `business-criticality` "Stored in
      minutes, seeded with five rows".
- [ ] 4.3 After 4.1 passes: `npx prisma migrate dev --name criticidad_negocio`. Expected: one new
      migration directory touching only the criticality table/column — this is the **one**
      migration the prompt allows.
- [ ] 4.4 `prisma/seeds/criticidad.ts` (new) — five rows: C1 (10/5), C2 (240/60), C3 (1440/480),
      C4 (4320/1440), C5 (null/null — "sin SLA" is a value, not empty; do not seed a large
      sentinel number). Verify: seeded query returns 5 rows, C1.rtoMinutos = 10. AC: spec
      `business-criticality` "Five numeric rows"; proposal AC12.
- [ ] 4.5 RED test extending `lib/sgsi/__tests__/consolidado-lectura.test.ts`: column 26 filled
      loads criticality; column absent loads null + warning; unrecognized label fails naming the
      asset code. Implement in `lib/sgsi/consolidado-lectura.ts` following the existing
      `opcional()`/custodio pattern (line ~297). AC: spec `business-criticality` "Importer
      resolves FOR-SIG-12 column 26"; proposal AC13.
- [ ] 4.6 `FichaActivo.tsx` General tab — edit criticidad; chip in `InventarioActivos.tsx` and
      the analysis list (3.10); sort-by-criticality sorts by RTO. AC: spec `business-criticality`
      "Editing and visualization".
- [ ] 4.7 RED test for the two coherence checks (pure predicate, e.g.
      `lib/sgsi/__tests__/criticidad-coherencia.test.ts`): C1/C2 with D≤3 warns; D=5 with C4/C5
      stays silent. Implement and surface the warning in the ficha. AC: spec
      `business-criticality` "Two coherence checks"; proposal AC14.

### 4b — Plan debt + notes (P2, P6) — Checkpoint E

- [ ] 4.8 RED test `lib/sgsi/__tests__/origen-plan.test.ts` (new module): the machine-checked
      `origen:v1|R-0123|TEC-GEN-0004|A.24 · <rationale>` prefix formats and round-trip parses.
- [ ] 4.9 Implement `lib/sgsi/origen-plan.ts` to pass 4.8.
- [ ] 4.10 RED test `lib/sgsi/__tests__/deuda-planes.test.ts` (new module): "sin plan" derives
      (non-obsolete Crítico-band risk, no active `AccionPlan` matching origin via 4.9) and is
      **never stored**; age walks the `RiesgoCalculo` streak from task 1.8 against
      `CriterioAceptacion.plazoPlan`. Own the string parser for `plazoPlan`/`plazoEjecucion`
      ("N días", "No requiere" — see Open Item 5); confirm ambiguous formats with the SIG lead.
- [ ] 4.11 Implement `lib/sgsi/deuda-planes.ts` to pass 4.10. AC: spec
      `critical-risk-treatment-plan` "Plan pendiente state".
- [ ] 4.12 `app/components/sgsi/activos/PopupPlanCritico.tsx` (new) — prefilled per design D4:
      control = principal of the critical threat (or lowest-maturity without relevance), tipo
      default `MITIGAR` (`ACEPTAR`/`TRANSFERIR`/`EVITAR` available), origin = triggering
      asset+threat, madurez actual→objetivo, responsable = asset owner (editable), fecha = hoy +
      `plazoEjecucion`. Test: all six fields prefilled from a fixture. AC: spec
      `critical-risk-treatment-plan` "Popup prefill sources".
- [ ] 4.13 `app/sgsi/acciones/plan.ts` — risk-origin prefill wiring: writes `AccionPlan.origen`
      via 4.9's formatter; reuses existing `guardarAccion`/`crearAccionDesdeControl` dedupe, no
      parallel plan list. AC: spec `critical-risk-treatment-plan` "The unit is the control (D-4)".
- [ ] 4.14 RED test for `guardarSesionRiesgo(codigo, borrador, nota)` in
      `app/sgsi/acciones/riesgos.ts`: note-less save fails with **zero** writes (data and
      `Bitacora`) — the one deliberate D17 exception; a 3-field change produces exactly 3
      `Bitacora` rows sharing the same note as `motivo`, one `$transaction`, note also written to
      `Riesgo.justificacion`. Implement: upserts exceptions + `madurezId` (D5's first writer),
      then calls `generarRiesgos`; response carries the critical-band trigger. AC: spec
      `end-of-session-notes` "One Bitacora row per changed field", "Note-less save fails";
      proposal AC9.
- [ ] 4.15 `FichaActivo.tsx` notes UI — changes accumulate unprompted with a running draft count
      («N cambios sin guardar»); one save dialog lists old→new per field plus the mandatory
      notes textarea. Integration test: three changes → dialog lists three rows; empty note
      blocks save with no partial write. AC: spec `end-of-session-notes` "Changes accumulate
      without prompting", "Single save dialog with a mandatory notes field".
- [ ] 4.16 Critical-save popup wiring: a save leaving residual Crítico opens 4.12 prefilled and
      **succeeds regardless**; closing without registering marks "plan pendiente" with a date and
      increments the SIN PLAN card (3.9). Integration test per spec
      `critical-risk-treatment-plan` "Save succeeds, popup opens" + "Close without registering".
      AC: proposal AC7.
- [ ] 4.17 `app/components/sgsi/planes/FranjaSinPlan.tsx` (new) — named codes (not a bare count),
      each opening via the overlay contract (3.2); max 5 + "+n más" link to the filtered
      analysis page; shows pending age; collapses to one line, never dismissible forever. Mount
      in `/sgsi/planes` via `PlanesTratamiento.tsx` (modify) and in `InventarioActivos.tsx` +
      the analysis page with the amber dot ("sin plan" on hover). AC: spec
      `critical-risk-treatment-plan` "Named alert band in two lists"; proposal AC7, AC8.
- [ ] 4.18 RED test: registering an `ACEPTAR` plan (justification + review date + approver from
      `CriterioAceptacion.aprueba`) removes the asset from both bands. AC: spec
      `critical-risk-treatment-plan` "ACEPTAR exits the band".
- [ ] 4.19 Structural check: `AccionPlan` stores origin asset/threat but is filed under the
      existing control-based treatment-plans module; confirm no parallel per-asset/per-risk list
      was created anywhere in 4.12–4.17. AC: spec `critical-risk-treatment-plan` "Plan appears in
      the module with its origin".

## Phase 5: Pruebas, ajuste y verificación (2.0d)

- [ ] 5.1 Full regression: `npm test` (all suites pass, baseline 89/1743 preserved plus this
      change's new suites), `npx tsc --noEmit -p tsconfig.json` (0 errors — `next.config.js` has
      `ignoreBuildErrors: true`, so this step is not optional), `npm run lint` (0 errors, ≤5
      preexisting warnings, no new ones).
- [ ] 5.2 `node scripts/validate_palette.js` — the value/band chips in the new lists (3.10, 4.6)
      and tabs (2.3) validate against the approved ordinal ramp. Proposal Criterion 10 is now
      checkable because this script exists (written 2026-09-14, commit `1087f7a`).
- [ ] 5.3 Walk all 15 acceptance criteria in `docs/handoff_sig/proceso-valoracion-de-riesgos.md`
      §14 against the shipped change; record pass/fail per item in the PR description, including
      the 722-vs-725 finding from 1.9.
- [ ] 5.4 Confirm the deploy gate matches the proposal's Rollback Plan: preflight + backup ahead
      of `prisma migrate deploy`; the migration stays additive/nullable so a revert never
      requires a schema rollback, only a data restore if recalculation touched data.
