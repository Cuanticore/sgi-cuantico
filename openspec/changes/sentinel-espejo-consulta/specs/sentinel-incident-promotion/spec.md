# Sentinel Incident Promotion Specification

## Purpose

Promotion turns a mirrored Sentinel incident into a real `EventoSeguridad`, decided and owned by a person, without inventing verdicts or personas Sentinel never gave. It requires the SGSI's write permission — a deliberate decision, unlike the spontaneous open reporting path the SGSI already has (O1), which this capability MUST leave untouched.

## Requirements

### Requirement: Promotion requires sgsi:escribir

Promoting a mirrored incident to `EventoSeguridad` MUST require the `sgsi:escribir` permission, checked with `autorConPermiso(...)`. A session without that permission MUST be rejected before any `EventoSeguridad` row is created.

#### Scenario: Promotion without permission is rejected
- GIVEN an authenticated session without `sgsi:escribir`
- WHEN it attempts to promote a mirrored incident
- THEN the action fails and no `EventoSeguridad` row is created

#### Scenario: Promotion with permission succeeds
- GIVEN an authenticated session with `sgsi:escribir`
- WHEN it promotes a mirrored incident
- THEN a new `EventoSeguridad` row is created, linked to the mirror by its origin columns

### Requirement: reportadoPorId is the promoter, never a resolved identity

`reportadoPorId` on the created `EventoSeguridad` MUST be the person executing the promotion. The system MUST NOT resolve Sentinel's `Owner.email` to a `Persona`, and MUST NOT use any system or service account as the reporter.

#### Scenario: Promoter becomes reportadoPorId
- GIVEN analyst Ana, authenticated with `sgsi:escribir`, promotes incident 4021 whose Sentinel `Owner.email` belongs to a different person
- WHEN the `EventoSeguridad` is created
- THEN `reportadoPorId` is Ana's id, and no `Persona` lookup or link is attempted from `Owner.email`

### Requirement: descripcion composed once, never rewritten (O15)

At promotion, `descripcion` MUST be composed exactly once from Sentinel's `Title` and `Description`. No later re-sync or repeated promotion attempt MAY rewrite it.

#### Scenario: First promotion composes the description
- GIVEN a mirrored incident not yet promoted
- WHEN it is promoted
- THEN `EventoSeguridad.descripcion` is composed from that incident's `Title` and `Description`

### Requirement: No fabricated verdict or SGSI severity

Promotion MUST NOT map Sentinel's `Classification`/`ClassificationComment` to `veredicto`/`justificacion`, and MUST NOT map `Severity` to the SGSI's severity. Both fields start `null`; the SGSI's own evaluation flow sets them later, per O3 (no unjustified verdicts) and O5 (severity is derived from CID impacts, never stored directly, null ≠ NINGUNO).

#### Scenario: Promoted event has no verdict or SGSI severity yet
- GIVEN incident 4021 with `Classification = "FalsePositive"` and `Severity = "Medium"` in Sentinel
- WHEN it is promoted
- THEN the resulting `EventoSeguridad` has `veredicto = null` and `justificacion = null`, and no SGSI severity field is set from Sentinel's `Severity`

### Requirement: One promotion per incident

An incident already promoted MUST NOT be promoted again. Uniqueness on `EventoSeguridad`'s origin columns (source system, external id) enforces this at the data layer.

#### Scenario: Second promotion attempt is rejected
- GIVEN incident 4021 already promoted to an `EventoSeguridad`
- WHEN a promotion is attempted again for 4021
- THEN it fails and no second `EventoSeguridad` row is created for that incident

### Requirement: Manual reporting stays open, unaffected (O1)

The existing manual reporting path (`app/sgsi/eventos/`, `lib/sig/eventos.ts`) MUST remain reachable by any authenticated person, without requiring `sgsi:escribir` or any prior permission. This capability adds a second, permission-gated path — it does not replace or gate the first.

#### Scenario: Manual report still needs only a session
- GIVEN an authenticated person without `sgsi:escribir`
- WHEN they report a security event manually through the existing flow
- THEN the report is created — no permission beyond an authenticated session is required
