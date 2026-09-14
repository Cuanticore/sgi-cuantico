# Delta for asset-overlay-url

## Purpose

One URL contract to open any asset ficha as an overlay from any module: `?activo=<code>` with optional `&tab=amenazas|matrices|ecuacion|general`. One ficha component, two wrappers — if two fichas exist, the page ficha and the overlay diverge.

## ADDED Requirements

### Requirement: Overlay opens over any screen

Any screen MUST accept `?activo=<code>` and open the ficha as an overlay on top of the current view. The optional `&tab=` parameter MUST land directly on amenazas, matrices, ecuacion, or general.

#### Scenario: Deep-linked tab from three distinct modules

- GIVEN `/sgsi/valoracion-riesgos`, `/estrategico/riesgos`, and `/sgsi/planes`
- WHEN each is opened with `?activo=TEC-GEN-0004&tab=ecuacion`
- THEN the overlay opens on the Ecuación tab in all three

### Requirement: Closing returns exactly to the origin

Closing the overlay MUST return to the exact prior state — filters and scroll intact — and MUST remove the parameter without stacking browser history.

#### Scenario: Close preserves the underlying screen

- GIVEN the analysis page with filters set and scrolled
- WHEN the overlay closes
- THEN the page shows the same filters and scroll position, and no history entry is added

### Requirement: Saving refreshes the underlying screen

After a save inside the overlay, the underlying screen MUST refresh its data without a reload: a valuation changed from the list is reflected in the row.

#### Scenario: Row reflects the change without reload

- GIVEN the overlay opened from a row of the analysis page
- WHEN the asset's valuation is saved in the overlay
- THEN the underlying row shows the new valuation without a page reload

### Requirement: Full-page route remains

`/sgsi/inventario/[codigo]` MUST remain as the full-page ficha: the one that can be shared by email and works without context.

#### Scenario: Direct URL works with no context

- GIVEN a fresh browser session
- WHEN `/sgsi/inventario/TEC-GEN-0004` is opened
- THEN the full ficha page renders

### Requirement: Unknown code does not open an empty overlay

A code that does not exist MUST NOT open an empty overlay: the screen notifies and stays as it was.

#### Scenario: Unknown asset code

- GIVEN any screen
- WHEN it is opened with `?activo=<unknown-code>`
- THEN a notice appears and the underlying screen remains unchanged

### Requirement: One component, two wrappers

The overlay and the full page MUST be the same ficha component in two wrappers; a second, divergent ficha MUST NOT be created.

#### Scenario: Same ficha both ways

- GIVEN the same asset opened as overlay and as full page
- WHEN both render
- THEN both present the same component with identical tabs and behavior
