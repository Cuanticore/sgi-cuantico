# Delta for risk-analysis-scope

## Purpose

Gates risk analysis by the valuation threshold stored in `Parametro.umbral_valoracion`. An asset below the threshold is outside the analysis: its tabs are disabled with a reason, the server rejects writes, and the derivation pass never executes. Being outside means not calculated — not calculated as zero (D-5, closed).

## ADDED Requirements

### Requirement: Threshold-gated tabs with visible reason

The Amenazas and Matrices tabs of `FichaActivo` SHALL be enabled only when `max(D, I, C) >= Parametro.umbral_valoracion`. Below the threshold the tabs MUST remain visible and disabled (a tab that silently disappears reads as a defect), and a hover explanation MUST state the asset's value, the threshold with its parameter source, and how to raise the valuation in the previous tab. The threshold MUST be read from the database and MUST NOT be hard-coded in any code path.

#### Scenario: Value-3 asset opens its ficha

- GIVEN an asset with `max(D, I, C) = 3` and `umbral_valoracion = 4`
- WHEN the ficha opens
- THEN Amenazas and Matrices are visible and disabled, and the hover states the value 3, the threshold 4 from `Parametro.umbral_valoracion`, and points to the valuation tab

#### Scenario: Threshold change re-enables without recompile

- GIVEN an asset with `max(D, I, C) = 3`
- WHEN `umbral_valoracion` is changed to 3 in the database and the ficha is reopened
- THEN the tabs enable with no code change or recompilation

### Requirement: Server-side rejection of below-threshold writes

Server actions that write degradación, frecuencia, or madurez of a risk SHALL reject the write when the asset is below the threshold. A disabled tab is help, not control; the guard also lives on the server.

#### Scenario: Server rejects a below-threshold write

- GIVEN an asset below the threshold
- WHEN a server action attempts to write a risk degradación for that asset
- THEN the action rejects the write

### Requirement: Derivation pass never executes below the threshold

For an asset below the threshold the derivation pass MUST NOT execute — the acceptance criterion is "does not execute", not "is not visible". The preview of threats with calculated inherent/residual figures MUST be removed entirely (not behind a button, not collapsed), the Amenazas tab MUST list no threat row, the Matrices tab MUST count no risk, and the tab badge MUST show no count.

#### Scenario: Derivation runs only for the asset in analysis

- GIVEN one asset of value 3 and one of value 5
- WHEN both fichas are opened
- THEN the derivation pass executes only for the value-5 asset, and the value-3 ficha lists zero threat rows, counts zero risks, and shows no badge count

### Requirement: Not calculated is not zero

Below-threshold assets MUST NOT carry calculated risk figures on any screen, and risk generation MUST skip them (no `Riesgo` rows). Exports or APIs that must emit the full inventory row anyway MUST emit the risk fields empty, never `0`. Risks of assets that drop below the threshold become obsolete.

#### Scenario: Regeneration figures with the V19 dataset

- GIVEN the V19 dataset (299 active assets) and threshold 4
- WHEN risk generation runs after all other changes of REQ-SIG-20
- THEN 37 assets carry at least one non-obsolete risk, 725 non-obsolete risks exist, and the 262 below-threshold assets have no `Riesgo` rows

#### Scenario: Raising the threshold scope moves counts without code change

- GIVEN 244 assets valued 3, one point below the threshold
- WHEN `umbral_valoracion` changes to 3 and risks are regenerated
- THEN the in-analysis asset count rises with no code change, and nothing in the screens assumes a fixed 37

#### Scenario: Export emits empty, never zero

- GIVEN a below-threshold asset in a full-inventory export
- WHEN the export renders that row
- THEN its risk fields are empty, not `0`
