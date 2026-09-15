# Delta for risk-inventory-view

## Purpose

Refocuses the asset inventory grid on "what we have and what it is worth": the inherent/residual risk columns leave the grid, a value filter with live counts arrives, and the orphaned `color` (risk band) filter moves to the risk analysis page where risk is actually shown.

## ADDED Requirements

### Requirement: Grid without risk columns

The inventory grid MUST NOT show the inherent-risk or residual-risk columns. The inventory answers what exists and what it is worth; risk figures live on the analysis page and in the matrices.

#### Scenario: Grid renders without risk columns

- GIVEN the inventory grid after this change
- WHEN it renders
- THEN no inherent-risk or residual-risk column appears

### Requirement: Value filter with visible counts

The grid MUST offer a value filter whose options display counts computed from the data: Todos (total), 5, 4, 4 y 5, 3, and 2. Counts MUST NOT be hard-coded — 244 assets sit one point below the analysis threshold and valuation revisions move these numbers.

#### Scenario: Counts match the V19 dataset

- GIVEN the V19 dataset (299 assets: 3 at value 5, 34 at value 4, 244 at value 3, 18 at value 2)
- WHEN the value filter renders
- THEN it shows 5 · 3, 4 · 34, 4 y 5 · 37, 3 · 244, 2 · 18, and Todos 299

#### Scenario: Counts follow valuation changes

- GIVEN an asset valued 3
- WHEN its valuation is raised to 4 and the grid is viewed again
- THEN the counts for 3, 4, and 4 y 5 reflect the new distribution without any code change

### Requirement: Color filter relocated to the analysis page (D-6)

The `color` filter — the row's risk band — MUST be removed from the inventory grid, where it filters by a column that no longer exists, and MUST be moved to the risk analysis page, which does display risk. The filter is moved, not deleted.

#### Scenario: Color filter gone from the grid, present on the page

- GIVEN the inventory grid and the risk analysis page after this change
- WHEN both filter rows render
- THEN the inventory shows no `color` filter and the analysis page offers the residual-band filter
