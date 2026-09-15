```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:bd47dd9f0656ca0bff56be53b7fdfd1ea225c91d7a2dda5cf50f4e3720300a17
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 35/37
scenarios: 48/50
test_command: npx jest --silent
test_exit_code: 0
test_output_hash: sha256:18570609511c150caea0f3c8d0bc78aa02d4764f9923626ff54321aa989e8f10
build_command: npx tsc --noEmit -p tsconfig.json
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

> `evidence_revision` = `sha256(git rev-parse 749cd06)`, es decir el sha256 de
> `749cd06389763ae3fc6f8156909dcbda27492ac1`, que es la revision contra la que se corrio
> esta verificacion. Reproducible con:
> `git rev-parse 749cd06 | tr -d '
' | sha256sum`
>
> El valor anterior estaba fabricado -el sha del commit rellenado con ceros, y con 62
> caracteres en vez de 64-. El despachador nativo lo rechazo, que es para lo que existe
> esa validacion.

## Verification Report

**Change**: req-sig-20-risk-valuation
**Version**: 1.0 (`docs/handoff_sig/proceso-valoracion-de-riesgos.md`)
**Mode**: Standard (no Strict TDD marker found)

This report covers task 5.3 (the 15 acceptance criteria of section 14) and folds in the
results of 5.1, 5.2, and 5.4, which were run in a prior pass this session before this
sub-task started. Full evidence and commands for 5.1/5.2/5.4 are only summarized here; they
were not re-derived by this pass except where noted.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 53 |
| Tasks complete | 53 (5.1-5.4 marked complete by this report) |
| Tasks incomplete | 0 |

### Build and Tests Execution

Build (typecheck): PASS, re-run independently this pass. Command: npx tsc --noEmit -p
tsconfig.json. Output: empty, exit 0.

npm run build itself (Next.js production build) was not re-run in this pass; it was run and
reported PASS in the prior 5.1/4b sessions. Not independently re-verified here.

Tests: PASS, re-run independently this pass. Command: npx jest --silent. Result: 105 suites
passed, 1899 tests passed. Matches the count already reported for 5.1. A second, narrower run
targeting only the suites cited as evidence in this report also passed: 13 suites, 205 tests,
exit 0.

Lint: not re-run this pass; prior report: 0 errors, 5 preexisting warnings.

Coverage: not measured; not configured as a gate in this repo.

### 5.1 Full regression (confirmed, run prior to this sub-task)

npm test: 105/1899 green. npx tsc --noEmit: 0 errors. npm run lint: 0 errors, 5 preexisting
warnings. npm run build: compiles. 46 migrations apply clean on a fresh DB. Re-confirmed
independently in this pass: npx jest --silent (105/1899 green, exit 0) and npx tsc --noEmit
-p tsconfig.json (exit 0, empty output).

### 5.2 Palette validation (confirmed, run prior to this sub-task)

node scripts/validate_palette.js with the six-color ordinal ramp, --mode light --surface
white: ALL CHECKS PASS (lightness monotone, adjacent delta-L, light-end contrast 2.13:1,
single hue 9 degrees).

### 5.3 The 15 acceptance criteria of section 14

Legend: PASS means a covering test exists and passed at runtime (re-run this pass) or was
independently re-derived from source. NO PASA means a concrete gap exists against the
criterion as literally written. NO VERIFICABLE means it requires a browser, a live tenant, or
data this pass could not reach.

| # | Criterion (condensed) | Verdict | Evidence |
|---|---|---|---|
| 1 (+1b) | Value-3 asset: Amenazas/Matrices disabled and explained, zero rows, derivation pass does not run; server action rejects a degradacion write for that asset | PASS | FichaActivo.test.tsx lines 154-209 (green, re-run): value-3 fixture renders zero A.1 rows, badge says no requiere (not a count), both tabs disabled, title cites Parametro.umbral_valoracion; value-5 fixture renders at least one row and enabled tabs. Server side: acciones/__tests__/riesgos.test.ts lines 207-222 (green, re-run): guardarSesionRiesgo on an out-of-analysis asset returns ok:false, message matches fuera del analisis, zero Prisma writes. activoEnAnalisis guard is applied at 4 call sites: guardarSesionRiesgo, guardarTratamiento, excepcionFrecuencia, excepcionDegradacion. Method deviation from the task instruction: 1b asks to verify via a trace in the useMemo at FichaActivo.tsx line 592; that manual trace was not run (no browser in this pass). The behavioral proof above (zero rows, zero badge count) is an equivalent proof that the derivation pass produced no visible output. |
| 2 | select count from activo where activo, expected 299; assets with at least one non-obsolete Riesgo, expected 37; non-obsolete risks, expected 725 | NO PASA as literally numbered | Independently confirmed via matriz-riesgos.csv at the repo root (generated 2026-09-09, read-only inspection): 37 distinct asset codes, 722 data rows (723 lines minus 1 header), not 725. Root cause independently re-derived: TEC-APP-0016 (Key Cloack) has exactly 20 rows in the matrix and is typed [S]; a comparison asset (TEC-APP-0005) of the same TEC-APP family has 23 rows and is typed [SW]. The 3-row gap matches 725 minus 722 exactly. Additional finding not in the original brief: consolidado-matriz.test.ts lines 470-526 (los dos activos con tipo y subtipo en conflicto) shows this is not a fresh, unreviewed data slip; it is pre-existing, already-reviewed importer logic that trusts the subtipo over the book tipo column for exactly two explicitly-listed asset codes that a person already reviewed, per the test own comment at lines 460-468, and TEC-APP-0016 is one of the two. The current matriz-riesgos.csv shows TEC-APP-0016 with tipo S and subtipo dir, consistent with that rule. This nuances the framing that this is simply a data typo where Keycloak should be software; the code own test comment states this reclassification was already reviewed for this exact asset, and a directory-service subtype is a plausible MAGERIT classification for an identity and directory manager. Whether that prior review or the proposal 725 figure is the stale one is a business-data question left to the maintainer, not resolved here. The 299 total-asset figure was not independently re-queried this pass (no DB read tool available); it is carried from the prior session task 1.9 finding, not re-verified in this report. |
| 3 | Changing umbral_valoracion to 3 and regenerating raises the in-analysis count with no code change; tabs self-enable | PASS (unit-level, not a live end-to-end re-run) | lib/sgsi/riesgos.ts lines 141-142 read Parametro.umbral_valoracion from the DB at runtime (fallback of 4 only if the row is missing). ficha.query.ts line 422 sources the client catalogos.umbralValoracion from the same parameter. formulas.test.ts lines 88-103 (green, re-run) proves entraAlAnalisis flips for the same asset when the threshold argument changes from 4 to 3, the single function both the client and the server guard call. Not independently re-run against a live DB threshold flip in this pass, since that would require a write and was out of scope; the single-source-of-truth wiring plus both-direction unit coverage is a legitimate covering-test proof of the mechanism. |
| 4 | Inventory grid shows no inherente/residual columns; value filter gives 3, 34, 37, 244, 18 | PASS | A search for Riesgo inherente, Riesgo residual, and table headers in InventarioActivos.tsx returns no matching column headers; the inherente/residual values that do appear in the file drive only row background color and the sin plan amber dot, not a displayed column. inventario-filtros.test.ts lines 326-349 (green, re-run): contarPorValor on a V19-shaped fixture returns exactly todos 299, v5 3, v4 34, v4y5 37, v3 244, v2 18, built from a loop, not hardcoded; the same test also proves the counts move correctly under a re-valuation scenario. |
| 5 | New page lists 37 rows; cards sum the same as the list under any filter combination | PASS with caveats | analisis-riesgos.test.ts lines 95-108 (green, re-run): reproduces 37/3/34 from a fixture built by count, not by literal numbers, and filasAnalisis returns exactly 37 rows. Lines 206-220: las tarjetas y la lista nunca se contradicen bajo ninguna combinacion de filtros checks tarjetas.enAnalisis.n equals lista.length across 6 filter combinations. Caveats, both already known and flagged in tasks.md, re-confirmed here, not re-discovered: only the enAnalisis card is checked against lista.length in that combinatorial test, the other four cards are not each individually cross-checked against a filtered list length in the same loop; and the page-level integration test uses a 2-asset fixture, so 37 rows in the running app is proven only at the pure-module level, not end-to-end through the page component with real data. |
| 6 | The overlay opens on the correct tab from three distinct modules; closing preserves filters and scroll below | PASS | OverlayActivo.test.tsx lines 217-236 (green, re-run): a parameterized test renders OverlayActivo under three distinct pathnames with the same query string and asserts it lands on the Ecuacion tab each time, a genuine integration test with real component render and real query parsing. Close and preserve: lines 169-216, router.replace removes only the activo and tab params, no new history entry, no scroll call; save triggers router.refresh. |
| 7 | Saving a madurez that leaves residual Critico saves anyway, opens the prefilled popup; closing without registering leaves plan pendiente, adds one to the SIN PLAN card, and the code appears in both alert strips; registering ACEPTAR removes it from both | PASS, composed from several tests | acciones/__tests__/riesgos.test.ts lines 225-260 (green, re-run): a residual landing in the Critico band returns ok true and a critico object; a non-critical residual returns ok true with no critico. Popup wiring: FichaActivo.test.tsx lines 47-65 and 497-529 (green, re-run): the queue opens PopupPlanCritico for the returned critico, and closing without registering empties the queue without calling registrarPlanCritico, also confirmed in PopupPlanCritico.test.tsx lines 74-85. Alert strips: FranjaSinPlan.test.tsx lines 27-83 (green, re-run): named codes, collapses to one line without permanent dismissal, escalation shown; independently confirmed mounted in PlanesTratamiento.tsx line 255, InventarioActivos.tsx line 724, PantallaAnalisisRiesgos.tsx line 206. SIN PLAN card count: analisis-riesgos.test.ts lines 125-144. ACEPTAR exits both bands: deuda-planes.test.ts lines 183-189, the resolver input type carries no tipo field at all, so covers regardless of tipo is exhaustive by construction. |
| 8 | A plan registered from there appears in the treatment-plans module and stores the asset and threat that originated it | PASS | Independently re-confirmed: a search for model definitions matching Plan in schema.prisma returns only AccionPlan, plus two unrelated pre-existing models (CeldaPlan, PlantillaNivel); no new parallel plan model exists. registrarPlanCritico writes origen via formatearOrigen into the same accionPlan table the existing planes page already reads. |
| 9 | Three changes in one session produce three Bitacora rows, same note as motivo; no-note save fails | PASS | acciones/__tests__/riesgos.test.ts lines 116-189 (green, re-run): no-note and whitespace-only note both reject with zero Prisma calls; a 3-field change (degradacion D, frecuencia, madurez) produces exactly 3 Bitacora rows in one createMany inside one transaction, all sharing the same motivo, and the note is also written to Riesgo.justificacion via the same update call. |
| 10 | Ecuacion tab of TEC-GEN-0004 by A.24 resolves 7 steps; step 7 matches Riesgo.riesgoResidual to the 4th decimal | PASS | ecuacion.test.ts lines 64-73 (green, re-run): paso 7 el residual coincide al cuarto decimal con calcularRiesgo asserts the resolved residual toFixed(4) equals the direct calcularRiesgo output toFixed(4). |
| 11 | No figure on the new screens is computed outside lib/sgsi/formulas.ts | PASS, one pre-existing already-flagged exception carried forward | A search for the direct formula function names across FichaActivo.tsx, PestanaEcuacion.tsx, PantallaAnalisisRiesgos.tsx, and analisis-riesgos.ts returns zero matches, re-run independently this pass. Carried forward, not new: FichaActivo.tsx line 3681, inside MatrizActivo, still computes a matrix-cell midpoint independently for cell coloring, not for any individual risk figure; pre-existing, untouched by this change, already flagged in tasks.md task 2.5. |
| 12 | CriticidadNegocio has 5 rows with rtoMinutos and rpoMinutos in minutes, C1 equals 10 and 5, not text; sorting the section 5.2 list by criticality sorts by RTO | NO PASA on the second half | First half PASS: prisma/seeds/criticidad.ts lines 23-64 seed exactly 5 rows, rtoMinutos and rpoMinutos as nullable integers, C1 is 10 and 5, C5 is deliberately null and null, not a sentinel; a prior session verified this against the dev DB, not re-queried live this pass. Second half NO PASA: analisis-riesgos.ts defines and unit-tests ordenarPorCriticidad, RTO ascending, nulls and C5 last, stable by codigo, but a search across app and lib shows it is imported and called only inside analisis-riesgos.ts and its own test file; neither PantallaAnalisisRiesgos.tsx nor InventarioActivos.tsx ever imports it. The spec own scenario in specs/business-criticality/spec.md lines 39-43, titled Sorting by criticality sorts by RTO, given the analysis list, when it is sorted by criticality, then the order follows RTO minutes, presupposes the list can actually be sorted this way; today there is no UI action that does so. This matches the already-known, already-flagged debt item about a comparator with no header click, confirmed here, not newly discovered. |
| 13 | A FOR-SIG-12 with column 26 filled loads criticality; without it loads null plus a warning, never a default | PASS | consolidado-matriz.test.ts lines 321-357 (green, re-run): column filled by name, by code, or code plus name all resolve; empty column loads null with a warning; an unrecognized label rejects the row naming the asset code. Known, already-flagged gap, re-confirmed: no real FOR-SIG-12 import with column 26 has been run through the running application, this is unit-level only. |
| 14 | Asset with C1 and D at most 3 shows the coherence warning; D equals 5 with C4 shows none | PASS | FichaActivo.test.tsx lines 212-238 (green, re-run): C1 with D3 renders the exige una recuperacion rapida warning and does not disable any control, matching the avisa no bloquea rule; D5 with C4 renders no such warning. |
| 15 | New screens write nothing when visited, not one Bitacora row | PASS, weaker evidence class | analisis-riesgos.query.test.ts lines 29-41 (green, re-run): asserts, by reading the file own source text, that analisis-riesgos.query.ts contains none of Prisma write method names, no prisma.bitacora reference, and no import from the server actions folder. PantallaAnalisisRiesgos.test.tsx lines 187-192 (green, re-run): same structural check on the screen component. This is the explicitly-flagged deviation from task 3.13: proven by source-text inspection, not by counting Bitacora rows before and after against a live database. |

Compliance summary: 13 of 15 criteria PASS (including composed and caveated passes noted
above), 2 of 15 NO PASA (criterion 2, the literal 725 versus the actual 722; and criterion 12,
the second half, sort-by-criticality not reachable from the UI), 0 of 15 NO VERIFICABLE this
pass.

### 5.4 Deploy gate versus Rollback Plan (confirmed, cross-checked independently in this pass)

proposal.md line 70 states: Deploy gate: preflight plus backup plus prisma migrate deploy.
The written order is backup before migrate.

.github/workflows/deploy.yml, re-checked independently this pass: npx prisma migrate deploy
runs at line 209; the step titled Backup after a successful deploy runs at line 226. The
backup runs after, not before, contradicting the written Rollback Plan stated order.

A daily cron backup (deploy/respaldo-postgres.sh) exists as a recovery point, but it can lag
up to 24 hours behind any given deploy. For this specific migration the practical risk is low,
since it is additive and nullable (a new CriticidadNegocio table plus a nullable
Activo.criticidadId foreign key), so reverting never requires an actual schema rollback, but
the gap between the written plan and the implemented workflow is real and unresolved. Not
touched, per instruction; flagged for the maintainer.

### Correctness (static evidence), cross-cutting findings not tied to a single criterion

| Finding | Status | Notes |
|---|---|---|
| excepcionFrecuencia and excepcionDegradacion server actions still exist and are unreachable from the UI | WARNING | Independently re-confirmed this pass: both still exist in acciones/riesgos.ts, still carry the activoEnAnalisis guard, and are still exported, but a search outside that file and its own tests shows zero call sites from FichaActivo.tsx or anywhere else in the UI; guardarSesionRiesgo replaced their save path per task 4.15. This contradicts a prior apply-progress note that described them as now-deleted; they were not deleted, only orphaned. Not a correctness bug, but dead exported code with its own maintained test surface. |
| 722 versus 725 root cause | WARNING, data and business, not code | See criterion 2 above, flagged, not resolved. |
| Sort-by-criticality unreachable from the UI | WARNING | See criterion 12 above, flagged, not resolved, matches known debt already recorded in tasks.md. |
| Deploy-gate backup ordering | WARNING | See section 5.4 above. |
| MatrizActivo line 3681 independent arithmetic | WARNING, carried forward, pre-existing | See criterion 11 above. |
| Known debt items from the brief, re-checked, none newly discovered and none silently resolved | WARNING and SUGGESTION, all confirmed still true | Ordenar por criticidad header click confirmed absent, see criterion 12. No real FOR-SIG-12 column-26 import run live, confirmed unit-level only, see criterion 13. Visiting writes nothing is structural, not row-counted, confirmed, see criterion 15. PantallaAnalisisRiesgos integration test uses a 2-asset fixture, not 37, confirmed, see criterion 5. The madurezRiesgoOv state exists with no UI control reachable from the sheet, confirmed absent, a search for onMadurezRiesgo in FichaActivo.tsx returns no matches. registrarPlanCritico and datosPrefillPlanCritico have no dedicated unit test file, confirmed, only indirect coverage via PopupPlanCritico.test.tsx mocks. parsearPlazo leaves Revision anual irreconocible by design, confirmed at deuda-planes.test.ts lines 53-56. The 272 ControlAmenaza pairs with relevanciaId null, REQ-SIG-21, out of scope, confirmed still the stated state in FichaActivo.test.tsx fixture comments and ecuacion.test.ts lines 145-157. |

### Issues Found

CRITICAL: None.

WARNING:
1. Criterion 2, the expected 725 non-obsolete risks, is contradicted by the actual data: 722.
Root cause independently re-derived: TEC-APP-0016 is classified as type S with subtype dir via
a pre-existing, already-reviewed importer rule that trusts a conflicting subtipo over the book
declared tipo, not a fresh, unreviewed typo. Whether the prior review or the proposal 725
figure is the stale one is a business-data call for the maintainer, not resolved here.
2. Criterion 12, the sorting-by-criticality scenario, is not reachable from the running UI;
ordenarPorCriticidad exists and is correctly unit-tested but is never imported by either screen
component. Matches already-known, already-flagged debt.
3. The deploy workflow backup step runs after prisma migrate deploy, not before, contradicting
the proposal written Rollback Plan. Low practical risk for this specific additive and nullable
migration; real gap against the written plan.
4. excepcionFrecuencia and excepcionDegradacion server actions are dead code, unreachable from
the UI, contrary to a prior session note that they were deleted, but remain exported with an
active guard and test suite.
5. FichaActivo.tsx line 3681, inside MatrizActivo, remains an independent, pre-existing
arithmetic path outside lib/sgsi/formulas.ts, untouched by this change, already flagged in
task 2.5.
6. All items already flagged as known debt in the task brief are still current, see the
Correctness table above; none were silently resolved, none turned out to be already fixed.

SUGGESTION:
1. Consider removing excepcionFrecuencia and excepcionDegradacion, and their tests, in a
follow-up cleanup once confirmed unreachable, or document why they remain as a fallback path.
2. Consider wiring ordenarPorCriticidad to an actual sort control before treating criterion 12
as closed, since the spec own scenario text presupposes the list is sortable in the product,
not just in a pure function.
3. Consider moving the backup step ahead of prisma migrate deploy in the deploy workflow, or
updating the proposal Rollback Plan text to match the implemented order, so the two stop
disagreeing. Not touched here, per instruction.

### Verdict

PASS WITH WARNINGS.

Zero CRITICAL findings. 105 of 105 test suites and 1899 of 1899 tests pass, re-run
independently this pass. The typecheck is clean, re-run independently this pass. 13 of the 15
section-14 acceptance criteria hold under source inspection plus a passing, runtime-executed
covering test. Two do not hold exactly as written: criterion 2 asserted risk count of 725 does
not match the actual, freshly-verified count of 722, a data-classification question, not a
code defect, with its root cause independently re-derived and a nuance on the prior framing
surfaced for the maintainer; and criterion 12 sort-by-criticality scenario is implemented
correctly as a pure function but is not wired to any reachable UI action. Neither blocks the
change functionally, both are already-known, already-documented gaps, not fresh surprises, but
neither should be silently marked as passed either.

The change is ready for sdd-archive provided the maintainer explicitly accepts, rather than
silently waives, these open items:
- The 722-versus-725 discrepancy and its root cause, the maintainer own decision on which
number is authoritative.
- Criterion 12 unreachable sort control.
- The deploy-gate backup-ordering gap against the written Rollback Plan, section 5.4.
- The dead excepcionFrecuencia and excepcionDegradacion actions.

None of these require reopening apply work under this report evidence; they are
documentation and acceptance decisions and, optionally, small follow-up changes; none is a
functional regression or a missing implementation of a core requirement.
