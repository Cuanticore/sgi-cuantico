# Proposal: Espejo de consulta de Microsoft Sentinel

## Intent

Sentinel detecta y el analista tria allí, pero no registra causa raíz, lección aprendida, costo ni roles múltiples (reportó/evaluó/cerró) que ISO 27001 A.5.27 exige. Hoy `evento_seguridad` tiene CERO filas: el módulo existe y nadie lo usa porque nadie transcribe a mano lo que ya está en Sentinel.

## Scope

### In Scope

- Tabla espejo nueva (modelo Prisma aditivo), clave estable `IncidentNumber`.
- Trabajo de sincronización de solo lectura en `TRABAJOS` + `IMPLEMENTACIONES`, contra Log Analytics con el service principal de rol Log Analytics Reader ya existente.
- Vista de consulta de solo lectura del espejo.
- Server action de promoción a `EventoSeguridad`: exige `sgsi:escribir`, registra en bitácora.
- Columnas de origen NULLABLE en `EventoSeguridad` (sistema, id externo, url) con unicidad.
- Módulo puro en `lib/sig/` con el mapeo Sentinel→evento, con tests.

### Out of Scope

- Poblar `ActivoAfectado`: emparejar vía `Despliegue.ip`/`Despliegue.servidor` es heurístico sobre texto libre y merece su propia decisión.
- Escribir hacia Sentinel: el flujo es de un solo sentido.
- Mapear `Classification` a `veredicto`/`justificacion`: fabricaría veredictos sin justificar (O3).
- Mapear `Severity` a la severidad del SGSI: esa es derivada de los impactos CID y nunca se almacena (O5). El espejo guarda el vocabulario de Sentinel, en columna propia y con nombre propio.
- Resolver `Owner.email` a una `Persona`: `reportadoPorId` es únicamente quien promueve.
- Tocar el módulo de reporte existente.

## Capabilities

### New Capabilities

- `sentinel-incident-mirror`: espejo de solo lectura, poblado idempotentemente, y su vista de consulta.
- `sentinel-incident-promotion`: promoción manual, con permiso, del espejo a `EventoSeguridad`.

### Modified Capabilities

None.

## Approach

Todo es aditivo. El trabajo deduplica con `arg_max(TimeGenerated,*) by IncidentNumber` — `SecurityIncident` es append-only; sin eso el espejo duplica. Upsert por `IncidentNumber`. Promover compone la `descripcion` UNA VEZ desde `Title` + `Description` y nunca la reescribe (O15); `reportadoPorId` es quien promueve, no una persona ficticia. Requiere los secretos de Log Analytics en el contenedor; la conectividad a Azure ya está verificada. Contrato de datos en explore #3138.

## Affected Areas

| Área | Impacto | Cambio |
|---|---|---|
| `prisma/schema.prisma` + migración | New | tabla espejo; columnas de origen nullable |
| `lib/sig/` (+ `__tests__`) | New | mapeo puro |
| `lib/sig/trabajos-catalogo.ts`, `trabajos.ts` | Modified | declaración + implementación |
| `app/sig/acciones/` | New | acción de promoción |
| `app/sgsi/` | New | vista de consulta |
| `app/sgsi/eventos/`, `app/sig/acciones/eventos.ts`, `lib/sig/eventos.ts` | Sin cambios | reporte intacto |

Invariantes preservadas: O1 (reportar sigue abierto a cualquier autenticado), O3, O5, O15. El CHECK `evidencia_un_solo_origen` no se toca.

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Catálogo↔implementación inconsistente rompe el arranque (`trabajos.ts:191-199`) | Alta | `disponible:true` e implementación en el mismo commit |
| Espejo duplicado (tabla append-only) | Alta | `arg_max` + upsert por `IncidentNumber` |
| Promover dos veces el mismo incidente | Media | unicidad sobre las columnas de origen |
| Credenciales Azure ausentes en runtime | Media | el trabajo falla con detalle; `EjecucionTrabajo` deja rastro |
| Migración en producción | Baja | aditiva y nullable; deploy con backup |

## Rollback Plan

Revertir el commit de deploy. La migración aditiva puede quedar aplicada sin daño (tabla nueva + columnas nullable). Para desactivar solo la sincronización: poner el trabajo en `disponible:false` junto con su entrada en `IMPLEMENTACIONES`.

## Success Criteria

- [ ] Re-sincronizar el mismo `IncidentNumber` crea cero filas espejo y cero `EventoSeguridad` nuevos.
- [ ] Un evento promovido queda con `veredicto = null` y `justificacion = null`; re-sincronizar no modifica su `descripcion`.
- [ ] Promover sin `sgsi:escribir` falla; reportar a mano sigue funcionando sin permiso.
- [ ] `npm test` verde, incluida la consistencia catálogo↔implementación.
- [ ] La vista muestra tantas filas como incidentes deduplicados haya en `SecurityIncident` (19 al momento de explorar); ninguna escritura sale hacia Sentinel.
