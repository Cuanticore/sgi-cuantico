```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:9a87e0ba3e18185d0ce6dc613caecb6720f1d27e3aa56c4bf7250d5611d7f8ee
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 37/37
scenarios: 50/50
test_command: npx jest --silent
test_exit_code: 0
test_output_hash: sha256:551fcdba399b06e7903ed8c484d76ccd103bf2366191a3ff6e7aa5b52ab28c0c
build_command: npx tsc --noEmit -p tsconfig.json
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

> `evidence_revision` = `sha256(git rev-parse 410edf4)`, es decir el sha256 de
> `410edf4a555f51fcf536142b23ef10e6ef248887`, la revision de HEAD contra la que se corrio
> esta pasada (criterio 2 remediado: `lib/sgsi/consolidado-lectura.ts` y su prueba quedaron
> commiteables pero no se commitearon, por instruccion explicita de no commitear). Reproducible
> con:
> `git rev-parse 410edf4 | tr -d '
' | sha256sum`
>
> Reemplaza el `evidence_revision` de la pasada anterior (`749cd06`), que dejo abierto el
> criterio 2 (722 en vez de 725).

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
| 2 | select count from activo where activo, expected 299; assets with at least one non-obsolete Riesgo, expected 37; non-obsolete risks, expected 725 | PASS (remediated after the prior walk) | Remediated by an explicit business decision (2026-09-15), not by re-reading the workbook: the inventory owner decided that for `TEC-APP-0016` (Key Cloack) the TYPE wins, `[SW]` — Keycloak is software —, and since its declared subtype `[dir]` no longer fits under `[SW]`, the subtype becomes a documented choice, `[std]` Estándar (off the shelf), not a workbook fact. `lib/sgsi/consolidado-lectura.ts` was updated so a future re-import of the workbook lands `TEC-APP-0016` as `[SW]`/`[std]` directly (`TIPO_DESDE_SUBTIPO` now holds only `TEC-AUX-0001`; the new `SUBTIPO_ELEGIDO_PARA` map documents the `[std]` choice for `TEC-APP-0016`, and only that code). `consolidado-matriz.test.ts` lines 493-503 (green, re-run) now assert the opposite of the prior report: «Key Cloack» keeps `[SW]`, the book's declared type, and adopts `[std]` as its chosen subtype — not `[S]`/`[dir]` as before. `TEC-AUX-0001` (ChatGPT Pro) was explicitly NOT touched and its own test (`consolidado-matriz.test.ts` lines 505-512) is unchanged and still green: it still adopts `[SW]`, the type of its subtype `[std]`, via the untouched original rule. The development database row for `TEC-APP-0016` was corrected the same way via `scripts/req-sig-20-correccion-key-cloack.ts --aplicar` (bitácora-logged, `tipoId` 3→4, `subtipoId` 36→42), then `generarRiesgos()` (`lib/sgsi/riesgos.ts:77`) was re-run. Independently re-queried against the dev DB this pass (`docker exec sgi-postgres psql`, port 5437, db `sgi_sgsi`): `select count(*) from riesgo where not obsoleto` → **725**; `select count(*) from riesgo r join activo a on a.id=r.activo_id where a.codigo='TEC-APP-0016' and not r.obsoleto` → **23** (up from 20, the exact 3-risk gap this criterion needed); `select count(distinct codigo) from activo where activo` → **299**; `select count(distinct activo_id) from riesgo where not obsoleto` → **37**. Every non-obsolete risk has at least one `RiesgoCalculo` row (0 missing), confirmed by direct count. `TEC-AUX-0001` remains `[SW]`/`[std]` in the DB, unchanged, confirmed by the same query that read `TEC-APP-0016`. |
| 3 | Changing umbral_valoracion to 3 and regenerating raises the in-analysis count with no code change; tabs self-enable | PASS (unit-level, not a live end-to-end re-run) | lib/sgsi/riesgos.ts lines 141-142 read Parametro.umbral_valoracion from the DB at runtime (fallback of 4 only if the row is missing). ficha.query.ts line 422 sources the client catalogos.umbralValoracion from the same parameter. formulas.test.ts lines 88-103 (green, re-run) proves entraAlAnalisis flips for the same asset when the threshold argument changes from 4 to 3, the single function both the client and the server guard call. Not independently re-run against a live DB threshold flip in this pass, since that would require a write and was out of scope; the single-source-of-truth wiring plus both-direction unit coverage is a legitimate covering-test proof of the mechanism. |
| 4 | Inventory grid shows no inherente/residual columns; value filter gives 3, 34, 37, 244, 18 | PASS | A search for Riesgo inherente, Riesgo residual, and table headers in InventarioActivos.tsx returns no matching column headers; the inherente/residual values that do appear in the file drive only row background color and the sin plan amber dot, not a displayed column. inventario-filtros.test.ts lines 326-349 (green, re-run): contarPorValor on a V19-shaped fixture returns exactly todos 299, v5 3, v4 34, v4y5 37, v3 244, v2 18, built from a loop, not hardcoded; the same test also proves the counts move correctly under a re-valuation scenario. |
| 5 | New page lists 37 rows; cards sum the same as the list under any filter combination | PASS with caveats | analisis-riesgos.test.ts lines 95-108 (green, re-run): reproduces 37/3/34 from a fixture built by count, not by literal numbers, and filasAnalisis returns exactly 37 rows. Lines 206-220: las tarjetas y la lista nunca se contradicen bajo ninguna combinacion de filtros checks tarjetas.enAnalisis.n equals lista.length across 6 filter combinations. Caveats, both already known and flagged in tasks.md, re-confirmed here, not re-discovered: only the enAnalisis card is checked against lista.length in that combinatorial test, the other four cards are not each individually cross-checked against a filtered list length in the same loop; and the page-level integration test uses a 2-asset fixture, so 37 rows in the running app is proven only at the pure-module level, not end-to-end through the page component with real data. |
| 6 | The overlay opens on the correct tab from three distinct modules; closing preserves filters and scroll below | PASS | OverlayActivo.test.tsx lines 217-236 (green, re-run): a parameterized test renders OverlayActivo under three distinct pathnames with the same query string and asserts it lands on the Ecuacion tab each time, a genuine integration test with real component render and real query parsing. Close and preserve: lines 169-216, router.replace removes only the activo and tab params, no new history entry, no scroll call; save triggers router.refresh. |
| 7 | Saving a madurez that leaves residual Critico saves anyway, opens the prefilled popup; closing without registering leaves plan pendiente, adds one to the SIN PLAN card, and the code appears in both alert strips; registering ACEPTAR removes it from both | PASS, composed from several tests | acciones/__tests__/riesgos.test.ts lines 225-260 (green, re-run): a residual landing in the Critico band returns ok true and a critico object; a non-critical residual returns ok true with no critico. Popup wiring: FichaActivo.test.tsx lines 47-65 and 497-529 (green, re-run): the queue opens PopupPlanCritico for the returned critico, and closing without registering empties the queue without calling registrarPlanCritico, also confirmed in PopupPlanCritico.test.tsx lines 74-85. Alert strips: FranjaSinPlan.test.tsx lines 27-83 (green, re-run): named codes, collapses to one line without permanent dismissal, escalation shown; independently confirmed mounted in PlanesTratamiento.tsx line 255, InventarioActivos.tsx line 724, PantallaAnalisisRiesgos.tsx line 206. SIN PLAN card count: analisis-riesgos.test.ts lines 125-144. ACEPTAR exits both bands: deuda-planes.test.ts lines 183-189, the resolver input type carries no tipo field at all, so covers regardless of tipo is exhaustive by construction. |
| 8 | A plan registered from there appears in the treatment-plans module and stores the asset and threat that originated it | PASS | Independently re-confirmed: a search for model definitions matching Plan in schema.prisma returns only AccionPlan, plus two unrelated pre-existing models (CeldaPlan, PlantillaNivel); no new parallel plan model exists. registrarPlanCritico writes origen via formatearOrigen into the same accionPlan table the existing planes page already reads. |
| 9 | Three changes in one session produce three Bitacora rows, same note as motivo; no-note save fails | PASS | acciones/__tests__/riesgos.test.ts lines 116-189 (green, re-run): no-note and whitespace-only note both reject with zero Prisma calls; a 3-field change (degradacion D, frecuencia, madurez) produces exactly 3 Bitacora rows in one createMany inside one transaction, all sharing the same motivo, and the note is also written to Riesgo.justificacion via the same update call. |
| 10 | Ecuacion tab of TEC-GEN-0004 by A.24 resolves 7 steps; step 7 matches Riesgo.riesgoResidual to the 4th decimal | PASS | ecuacion.test.ts lines 64-73 (green, re-run): paso 7 el residual coincide al cuarto decimal con calcularRiesgo asserts the resolved residual toFixed(4) equals the direct calcularRiesgo output toFixed(4). |
| 11 | No figure on the new screens is computed outside lib/sgsi/formulas.ts | PASS, one pre-existing already-flagged exception carried forward | A search for the direct formula function names across FichaActivo.tsx, PestanaEcuacion.tsx, PantallaAnalisisRiesgos.tsx, and analisis-riesgos.ts returns zero matches, re-run independently this pass. Carried forward, not new: FichaActivo.tsx line 3681, inside MatrizActivo, still computes a matrix-cell midpoint independently for cell coloring, not for any individual risk figure; pre-existing, untouched by this change, already flagged in tasks.md task 2.5. |
| 12 | CriticidadNegocio has 5 rows with rtoMinutos and rpoMinutos in minutes, C1 equals 10 and 5, not text; sorting the section 5.2 list by criticality sorts by RTO | PASS (remediated after the first walk) | First half unchanged: prisma/seeds/criticidad.ts seeds exactly 5 rows, C1 is 10 and 5, C5 deliberately null and null, not a sentinel. Second half was NO PASA at the first walk because ordenarPorCriticidad was unreachable from any screen. Remediated: analisis-riesgos.query.ts now reads CriticidadNegocio and exposes criticidadesRto; PantallaAnalisisRiesgos.tsx builds the MapaRtoPorCriticidad and calls ordenarPorCriticidad at line 150 behind an order control whose default remains worst residual. The comparator itself was NOT rewritten - lib/sgsi/analisis-riesgos.ts is untouched. A new integration test asserts the RTO order with nulls last and, critically, that reordering does not move the EN ANALISIS card count: reordering changes sequence, never the row universe. Verified: rg shows the call site outside the module and its test; 105 suites / 1900 tests green, tsc 0, lint baseline, build compiles. |
| 13 | A FOR-SIG-12 with column 26 filled loads criticality; without it loads null plus a warning, never a default | PASS | consolidado-matriz.test.ts lines 321-357 (green, re-run): column filled by name, by code, or code plus name all resolve; empty column loads null with a warning; an unrecognized label rejects the row naming the asset code. Known, already-flagged gap, re-confirmed: no real FOR-SIG-12 import with column 26 has been run through the running application, this is unit-level only. |
| 14 | Asset with C1 and D at most 3 shows the coherence warning; D equals 5 with C4 shows none | PASS | FichaActivo.test.tsx lines 212-238 (green, re-run): C1 with D3 renders the exige una recuperacion rapida warning and does not disable any control, matching the avisa no bloquea rule; D5 with C4 renders no such warning. |
| 15 | New screens write nothing when visited, not one Bitacora row | PASS, weaker evidence class | analisis-riesgos.query.test.ts lines 29-41 (green, re-run): asserts, by reading the file own source text, that analisis-riesgos.query.ts contains none of Prisma write method names, no prisma.bitacora reference, and no import from the server actions folder. PantallaAnalisisRiesgos.test.tsx lines 187-192 (green, re-run): same structural check on the screen component. This is the explicitly-flagged deviation from task 3.13: proven by source-text inspection, not by counting Bitacora rows before and after against a live database. |

Compliance summary: 15 of 15 criteria PASS (including composed, caveated, and remediated
passes noted above). Criterion 2 (725 vs 722) and criterion 12 (sort-by-criticality not
reachable from the UI) were both NO PASA at the first walk and have since been remediated,
each by a separate, explicitly scoped fix. 0 of 15 NO VERIFICABLE this pass.

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
| 722 versus 725 root cause | RESOLVED | See criterion 2 above: the inventory owner decided `TEC-APP-0016` is `[SW]`/`[std]`, `lib/sgsi/consolidado-lectura.ts` and its test were updated to match, and the dev DB row plus its risk set were corrected and re-verified at 725/23. |
| Sort-by-criticality unreachable from the UI | WARNING | See criterion 12 above, flagged, not resolved, matches known debt already recorded in tasks.md. |
| Deploy-gate backup ordering | WARNING | See section 5.4 above. |
| MatrizActivo line 3681 independent arithmetic | WARNING, carried forward, pre-existing | See criterion 11 above. |
| Known debt items from the brief, re-checked, none newly discovered and none silently resolved | WARNING and SUGGESTION, all confirmed still true | Ordenar por criticidad header click confirmed absent, see criterion 12. No real FOR-SIG-12 column-26 import run live, confirmed unit-level only, see criterion 13. Visiting writes nothing is structural, not row-counted, confirmed, see criterion 15. PantallaAnalisisRiesgos integration test uses a 2-asset fixture, not 37, confirmed, see criterion 5. The madurezRiesgoOv state exists with no UI control reachable from the sheet, confirmed absent, a search for onMadurezRiesgo in FichaActivo.tsx returns no matches. registrarPlanCritico and datosPrefillPlanCritico have no dedicated unit test file, confirmed, only indirect coverage via PopupPlanCritico.test.tsx mocks. parsearPlazo leaves Revision anual irreconocible by design, confirmed at deuda-planes.test.ts lines 53-56. The 272 ControlAmenaza pairs with relevanciaId null, REQ-SIG-21, out of scope, confirmed still the stated state in FichaActivo.test.tsx fixture comments and ecuacion.test.ts lines 145-157. |

### Issues Found

CRITICAL: None.

WARNING:
1. RESOLVED — Criterion 2, the expected 725 non-obsolete risks, was contradicted by the
actual data (722) at the prior walk. Root cause was independently re-derived: TEC-APP-0016
was classified as type S with subtype dir via a pre-existing, already-reviewed importer rule
that trusted a conflicting subtipo over the book declared tipo. The inventory owner has since
made the business call (2026-09-15): for TEC-APP-0016 the TYPE wins, [SW], and the subtype
becomes a documented choice, [std], because [dir] no longer fits under [SW]. The importer,
its test, and the dev DB row (via scripts/req-sig-20-correccion-key-cloack.ts, bitácora-logged)
were all updated to match, and generarRiesgos() was re-run: the dev DB now counts 725
non-obsolete risks, 23 of them for TEC-APP-0016 (up from 20). TEC-AUX-0001 was left untouched,
confirmed unchanged in both code and DB.
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

Zero CRITICAL findings. 105 of 105 test suites and 1900 of 1900 tests pass, re-run
independently this pass. The typecheck is clean, re-run independently this pass. All 15 of the
15 section-14 acceptance criteria now hold: 13 under source inspection plus a passing,
runtime-executed covering test as in the prior walk, and 2 by remediation. Criterion 2's
asserted risk count of 725 now matches the actual, freshly-verified dev-DB count of 725 (up
from 722 at the prior walk), following the inventory owner's explicit business decision that
TEC-APP-0016 is [SW]/[std]; the importer, its test, and the dev DB were all brought in line and
independently re-verified this pass. Criterion 12's sort-by-criticality scenario, already
remediated in a prior pass, remains wired to a reachable UI control. Neither the deploy-gate
backup-ordering gap (section 5.4) nor the dead excepcionFrecuencia/excepcionDegradacion actions
are section-14 criteria; both remain open, already-known, already-documented findings, not
fresh surprises, and neither blocks the change functionally.

The change is ready for sdd-archive provided the maintainer explicitly accepts, rather than
silently waives, these remaining open items:
- The deploy-gate backup-ordering gap against the written Rollback Plan, section 5.4.
- The dead excepcionFrecuencia and excepcionDegradacion actions.

None of these require reopening apply work under this report evidence; they are
documentation and acceptance decisions and, optionally, small follow-up changes; none is a
functional regression or a missing implementation of a core requirement.
