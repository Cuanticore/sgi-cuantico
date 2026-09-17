# Sentinel Incident Mirror Specification

## Purpose

Sentinel triages incidents but the SGSI never learns of them — `evento_seguridad` sits at zero rows because nobody transcribes by hand what Sentinel already has. This capability adds a read-only mirror of `SecurityIncident`, synced idempotently by a job under `TRABAJOS`/`IMPLEMENTACIONES`, plus a read-only query view. No write ever reaches Sentinel.

## Requirements

### Requirement: Idempotent upsert keyed by IncidentNumber

The sync job MUST upsert each mirror row by `IncidentNumber`. Re-running the sync for an already-mirrored incident MUST update that row, never insert a second one.

#### Scenario: Re-sync same incident
- GIVEN a mirror row for `IncidentNumber` 4021 already exists
- WHEN the sync job runs again over the same incident
- THEN the mirror still has exactly one row for 4021, with refreshed fields

### Requirement: Dedup via arg_max over an append-only table

`SecurityIncident` is append-only — Sentinel writes a new row per update, never mutates one in place. The sync query MUST use `arg_max(TimeGenerated, *) by IncidentNumber` to keep only the latest row per incident before upserting.

#### Scenario: Query collapses history to latest row
- GIVEN incident 4021 has three historical rows in `SecurityIncident`
- WHEN the sync job queries Log Analytics
- THEN it receives exactly one row for 4021 — the one with the latest `TimeGenerated`

### Requirement: Refresh scope excludes promoted state

Each sync MUST refresh Sentinel-owned fields (`Title`, `Description`, `Status`, `Severity`, `Classification`, timestamps, `Owner`, `IncidentUrl`, `Labels`, `AlertIds`) on the mirror row. The sync MUST NOT touch a promoted `EventoSeguridad` row or rewrite its `descripcion`, which was composed once at promotion time and is immutable (O15).

#### Scenario: Sentinel updates a field after promotion
- GIVEN incident 4021 was promoted and its `EventoSeguridad.descripcion` was composed
- WHEN the sync job re-syncs 4021 with a changed `Description` in Sentinel
- THEN the mirror row's `Description` updates, but `EventoSeguridad.descripcion` for 4021 stays exactly as first composed

#### Scenario: Mirror stays current for an unpromoted incident
- GIVEN a mirror row not yet promoted
- WHEN it is re-synced
- THEN its Sentinel-owned fields refresh and its (unpromoted) state is unchanged

### Requirement: One-way flow — never writes to Sentinel

The sync job and the query view MUST only read from Log Analytics. No code path in this capability MAY write, update, or delete data in Sentinel or the underlying Log Analytics workspace.

#### Scenario: Sync job issues only read queries
- GIVEN a completed sync run
- WHEN its Log Analytics API calls are inspected
- THEN every call is a query (read); none is a write, update, or delete

### Requirement: Noisy failure on missing configuration or upstream errors

The sync job MUST fail loudly — recording the failure in `EjecucionTrabajo` with a descriptive error — when Log Analytics credentials are absent or malformed, or when Azure returns an error. It MUST NOT swallow the error or leave the mirror silently stale.

#### Scenario: Missing credentials
- GIVEN the container has no Log Analytics service-principal credentials configured
- WHEN the sync job runs
- THEN it fails immediately naming the missing configuration, and `EjecucionTrabajo` records the failure

#### Scenario: Azure unreachable or errors
- GIVEN Azure Log Analytics returns an error or times out
- WHEN the sync job runs
- THEN the job fails with the upstream error recorded in `EjecucionTrabajo`; no partial silent success is reported

#### Scenario: Zero rows returned
- GIVEN the Sentinel query returns zero incidents
- WHEN the sync job runs
- THEN the job completes successfully with zero upserts recorded — an empty result is not an error, only an empty answer

### Requirement: Sentinel vocabulary stored in its own column

`Severity` from Sentinel MUST be stored in a mirror-only column with its own name. It MUST NOT feed, alias, or default the SGSI's severity, which is derived from CID impacts and never stored directly (O5).

#### Scenario: Mirror keeps Severity separate from SGSI severity
- GIVEN a mirrored incident with `Severity = "Medium"`
- WHEN its mirror row and any promoted `EventoSeguridad` are inspected
- THEN the mirror shows `Severity = "Medium"` in its own column, and no SGSI severity field derives its value from it

### Requirement: Read-only query view

The query view MUST list mirrored incidents read-only, exposing fields needed to identify and triage (`IncidentNumber`, `Title`, `Status`, `Severity`, timestamps, promotion state), gated only by an authenticated session — consistent with a read surface, not a permissioned one.

#### Scenario: View shows deduplicated count
- GIVEN 19 deduplicated incidents in `SecurityIncident`
- WHEN the query view is opened
- THEN it lists 19 rows, one per `IncidentNumber`
