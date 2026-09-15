# Delta for end-of-session-notes

## Purpose

Notes at the end of the session, without losing the audit trail: edits accumulate unprompted, one dialog at save time collects a single note, and the save emits one `Bitacora` row per changed field carrying that same note as motive — all in one transaction. The note-less save failure is the single deliberate save-block in REQ-SIG-20, stated as such against house rule D17.

## ADDED Requirements

### Requirement: Changes accumulate without prompting

While editing, changes MUST accumulate without asking for reasons, and the screen MUST show the running draft count (e.g. «3 cambios sin guardar»).

#### Scenario: Draft counter, no per-change modal

- GIVEN an edit session on TEC-GEN-0004 × A.24
- WHEN three fields are changed
- THEN no per-change reason modal appears and the screen shows «3 cambios sin guardar»

### Requirement: Single save dialog with a mandatory notes field

On save, one dialog MUST list what changed — each field with its old value → new value — and offer one notes field, mandatory: «Notas — qué cambió en la realidad y por qué».

#### Scenario: Dialog lists the pending changes

- GIVEN three accumulated changes (degradación, frecuencia, madurez)
- WHEN save is invoked
- THEN the dialog lists the three fields with old → new values, plus the empty mandatory notes field

### Requirement: One Bitacora row per changed field in one transaction

On confirm, the system MUST write one `Bitacora` row per changed field — previous value, new value, and the SAME note as `motivo` — and MUST store the note in `Riesgo.justificacion`, all in a single transaction with the change (invariant 7: the bitácora lives in the same transaction as the fact).

#### Scenario: Three changes, three rows, one note

- GIVEN the dialog confirmed with the note «ajuste tras revisión de servidores»
- WHEN the save commits
- THEN three `Bitacora` rows exist — one per changed field — each carrying that same note as motive, written in one transaction

#### Scenario: Per-field traceability survives

- GIVEN the `Bitacora` row of a degradación change
- WHEN someone asks who lowered that degradación and when
- THEN the row answers with user, timestamp, previous value, new value, and the note

### Requirement: Note-less save fails — the one deliberate block

Saving without a note MUST fail. This is the single deliberate exception to house rule D17 («la aplicación registra y señala; no impide») in this change, and it is required because `Riesgo.justificacion` mandates that an exception without a written reason cannot be stored.

#### Scenario: Empty note blocks the save

- GIVEN the save dialog with an empty note
- WHEN confirm is pressed
- THEN the save fails and neither data nor `Bitacora` rows are written
