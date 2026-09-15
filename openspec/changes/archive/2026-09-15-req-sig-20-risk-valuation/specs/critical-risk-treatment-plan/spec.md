# Delta for critical-risk-treatment-plan

## Purpose

A residual in the Crítico band requires a treatment plan — requires, never blocks (house rule D17, D-2 closed). The prefilled popup, the «plan pendiente» state, and the alert bands in two lists make the debt unhideable. The plan's unit is the control, born from the asset and the threat (D-4).

## ADDED Requirements

### Requirement: Critical residual saves, popup opens prefilled

A save leaving a residual in Crítico MUST succeed and MUST open the treatment-plan popup prefilled.

#### Scenario: Save succeeds, popup opens

- GIVEN a saved madurez leaves the residual in Crítico
- WHEN the save is confirmed
- THEN the save persists and the prefilled popup opens

### Requirement: Popup prefill sources

The popup MUST prefill each field:

| Field | Source |
|---|---|
| Control | Principal control of the critical threat, or lowest-maturity when no relevance is assigned |
| Tipo | `MITIGAR` default; `ACEPTAR`, `TRANSFERIR`, `EVITAR` available |
| Riesgo de origen | The triggering asset and threat |
| Madurez actual → objetivo | Control's current; registrant sets the target |
| Responsable | The asset's owner, editable |
| Fecha | Today plus `CriterioAceptacion.plazoEjecucion` |

#### Scenario: Fields prefilled

- GIVEN the popup opened from a critical residual
- WHEN it renders
- THEN control, tipo `MITIGAR`, origin, maturity, owner, and date are prefilled

### Requirement: Plan pendiente state

Closing the popup without registering leaves the save already made; the risk MUST be marked «plan pendiente» with a date, count in the SIN PLAN card, and generate an obligation for the owner. After `CriterioAceptacion.plazoPlan` days without a plan, the debt escalates.

#### Scenario: Close without registering

- GIVEN the prefilled popup after a critical save
- WHEN it closes without registering
- THEN the risk is «plan pendiente» with date, the SIN PLAN card gains one, and the obligation sits with the owner

### Requirement: Named alert band in two lists

The alert MUST list asset codes — not a bare count — each opening its ficha via the asset-overlay-url contract. It MUST appear in `/sgsi/planes` and the asset lists (inventory and analysis page), where the row also carries an amber dot with «sin plan» on hover. The band MUST NOT be dismissible forever: it collapses to one line and returns full next session. It MUST show at most five assets plus «+n más» linking to the analysis page filtered by sin plan, with pending age against `CriterioAceptacion.plazoPlan`.

#### Scenario: Bands name three unplanned assets

- GIVEN three assets with critical residual and no plan
- WHEN `/sgsi/planes` and the asset lists render
- THEN both bands name the three codes with pending age, and those rows carry the amber dot

#### Scenario: More than five shows a link

- GIVEN seven unplanned critical assets
- WHEN the band renders
- THEN five codes appear plus «+n más» linking to the analysis page filtered by sin plan

### Requirement: ACEPTAR exits the band

A registered plan of type `ACEPTAR` MUST remove the asset from both bands: accepting is planning. `ACEPTAR` MUST require written justification, a review date, and the approver from `CriterioAceptacion.aprueba` — the alert pursues silence, not high risk.

#### Scenario: ACEPTAR removes the asset from both bands

- GIVEN an asset present in both alert bands
- WHEN an `ACEPTAR` plan with justification, review date, and approver is registered
- THEN the asset leaves both bands

### Requirement: The unit is the control (D-4)

The `AccionPlan` MUST remain over a control while storing its originating asset and threat, publishing in the existing treatment-plans module; no parallel per-asset or per-risk plan list MAY be created.

#### Scenario: Plan appears in the module with its origin

- GIVEN a plan registered from the critical popup
- WHEN the treatment-plans module opens
- THEN the plan is listed with its origin asset and threat stored
