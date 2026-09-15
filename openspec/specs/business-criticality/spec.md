# Delta for business-criticality

## Purpose

`CriticidadNegocio` — how much interruption the business tolerates — is declared (D-3, closed) in FOR-SIG-12 column 26, never derived from the worst residual: that would say an asset is critical because it is badly protected. Five levels over RTO/RPO, stored in minutes. The exigencia rule that consumes criticality is REQ-SIG-23, out of scope: this change creates the column, catalog, load, editing, and visualization only.

## ADDED Requirements

### Requirement: Declared, five levels on RTO/RPO

Criticality MUST be a business declaration. The catalog MUST offer five levels:

| Nivel | RTO | RPO |
|---|---|---|
| C1 · Crítica continua | ≤ 10 min | ≤ 5 min |
| C2 · Crítica | ≤ 4 h | ≤ 1 h |
| C3 · Importante | ≤ 24 h | ≤ 8 h |
| C4 · Estándar | ≤ 72 h | ≤ 24 h |
| C5 · Sin compromiso | sin SLA | sin SLA |

C5 is a value, not an absence; an unclassified asset MUST stay null and be listed as missing.

#### Scenario: Two value-5 assets, different criticality

- GIVEN MINTRACE (C1) and UNAD (C4), both with D = 5
- WHEN both are viewed
- THEN each shows its declared criticality — valuation alone determines nothing

### Requirement: Stored in minutes, seeded with five rows

The `CriticidadNegocio` catalog (`codigo`, `nombre`, `rtoMinutos`, `rpoMinutos`, `descripcion`, `orden`, `activo`) MUST store RTO and RPO as numeric minutes, `Activo.criticidadId` MUST reference it, and the seed MUST contain the five levels.

#### Scenario: Five numeric rows

- GIVEN the seeded catalog
- WHEN it is queried
- THEN five rows exist with numeric `rtoMinutos` and `rpoMinutos`, C1 holding 10 and 5

#### Scenario: Sorting by criticality sorts by RTO

- GIVEN the analysis list with mixed criticalities
- WHEN it is sorted by criticality
- THEN the order follows RTO minutes

### Requirement: Importer resolves FOR-SIG-12 column 26

The importer MUST resolve column 26 («Criticidad de negocio (RTO/RPO)», beside the D/I/C valuation) against the catalog. Null MUST be allowed with a warning, like the custodio. An unresolved cargo or criticality MUST fail naming the asset code — never invented data or defaults.

#### Scenario: Column filled loads criticality

- GIVEN a FOR-SIG-12 with column 26 filled
- WHEN the import runs
- THEN those assets load with their declared criticality

#### Scenario: Column absent loads null with a warning

- GIVEN a FOR-SIG-12 without column 26
- WHEN the import runs
- THEN assets load with null criticality and a warning — never a default value

#### Scenario: Unresolved value fails with the code

- GIVEN a FOR-SIG-12 with an unrecognized criticality label
- WHEN the import runs
- THEN it fails naming the asset code

### Requirement: Editing and visualization

Criticality MUST be editable in the ficha's General tab, beside the valuation, and MUST appear with its chip in the analysis list and the inventory.

#### Scenario: Edited in General, shown in the lists

- GIVEN an asset's ficha on the General tab
- WHEN its criticality is changed and saved
- THEN the analysis list and the inventory show the new value with its chip

### Requirement: Two coherence checks

The screen MUST flag C1 or C2 with `D ≤ 3` as suspicious and ask to review the valuation. It MUST NOT flag `D = 5` with C4 or C5 — catastrophic loss and three-day recovery are distinct; confusing them is the error this column exists to avoid.

#### Scenario: Suspicious combination warns

- GIVEN an asset with criticality C1 and D = 3
- WHEN its ficha renders
- THEN the coherence warning asks to review the valuation

#### Scenario: Valid combination stays silent

- GIVEN an asset with D = 5 and criticality C4
- WHEN its ficha renders
- THEN no coherence warning appears
