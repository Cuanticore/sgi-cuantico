# Delta for risk-analysis-page

## Purpose

The new page at `/sgsi/valoracion-riesgos` answers "which assets enter the analysis and how are they doing" for the assets at or above the threshold — a work list, not a report. Page name is decision D-1 (open, non-blocking): recommended label «Análisis de riesgos» to avoid two near-homonymous adjacent menu entries next to the existing «Valoración de activos»; the requested fallback is «Valoración de riesgos».

## ADDED Requirements

### Requirement: Route and menu placement

The page MUST live at `/sgsi/valoracion-riesgos`, in sidebar group «SGSI · Seguridad de la información», immediately after «Valoración de activos».

#### Scenario: Menu entry routes to the page

- GIVEN the SGSI sidebar
- WHEN it renders
- THEN the new entry appears directly after «Valoración de activos» and routes to `/sgsi/valoracion-riesgos`

### Requirement: Summary cards that filter the list

A row of five clickable cards MUST filter the list: EN ANÁLISIS (n of total), MUY ALTOS (value 5), ALTOS (value 4), RESIDUAL CRÍTICO (require a plan), and SIN PLAN (overdue). Card counts and list rows MUST agree under any combination of active filters. SIN PLAN is the working number the SIG leader checks.

#### Scenario: Cards match the list on the V19 dataset

- GIVEN the V19 dataset, threshold 4, and no filters
- WHEN the page renders
- THEN EN ANÁLISIS shows 37 de 299 and the list has 37 rows

#### Scenario: Card click rescopes list and cards together

- GIVEN the filter proceso = Gestión Tecnológica active
- WHEN the SIN PLAN card is clicked
- THEN the list shows that process's unplanned critical assets and every card recounts over that same scope

### Requirement: One row per in-analysis asset, worst residual first

The list MUST show one row per in-analysis asset sorted by worst residual descending, with columns Código, Nombre, Valor (color chip on the REQ-SIG-18 §4.4 validated ramp), Criticidad, Proceso, Propietario, Persona, Amenazas, Peor inherente (with band), Peor residual (with band), and Plan — ✓ with link, «pendiente» in amber, or «—» when the residual does not require a plan. Clicking a row MUST open the asset popup (asset-overlay-url) on the Amenazas tab without leaving the page.

#### Scenario: Row click opens the overlay in place

- GIVEN the list
- WHEN a row is clicked
- THEN the asset overlay opens on Amenazas over the page, and closing it preserves the page's filters and scroll

### Requirement: Six filters rescoping list and cards

One filter row MUST offer proceso, propietario (cargo), persona, valor (4 · 5 · ambos), banda del residual, and estado del plan. Filters MUST rescope both the list and the cards. The persona filter draws from `Activo.personaId`, which is currently sparse: returning few results is not a defect.

#### Scenario: Filter combination narrows both scopes

- GIVEN the page
- WHEN valor = 5 and banda del residual = Crítico are set
- THEN only value-5 assets with critical residual remain listed, and the cards recount over that same scope

### Requirement: Visiting writes nothing

Visiting the page MUST NOT write anything — not one `Bitacora` row.

#### Scenario: No writes on visit

- GIVEN the page
- WHEN it is visited and its filters and cards are used
- THEN no `Bitacora` row is created
