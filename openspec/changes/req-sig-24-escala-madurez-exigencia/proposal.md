# Proposal: REQ-SIG-24 · Escala de madurez en porcentaje y exigencia como compuerta

## Intent

La banda residual «Crítico» es **inalcanzable por construcción**: con la eficacia declarada (90-95 %) el residual queda en el 5-10 % del inherente, y llegar a 25 exigiría un inherente de 250 cuando el máximo del modelo es 50. Todo lo que cuelga de esa banda —tarjeta RESIDUAL CRÍTICO, deuda de planes, franja «sin plan», escalado— está construido, probado y no puede dispararse nunca. Causa raíz: la curva PILAR tiene **un solo valor (50 %) entre el 30 % y el 90 %**, que es donde se decide la banda, y tres escalones apiñados en el techo. Fuente: `docs/handoff_sig/escala-de-madurez-y-exigencia.md`.

## Scope

### In Scope

- §3 · `EscalaMadurez` pasa a **once escalones de 0 a 100 de diez en diez**, con rúbrica por escalón; el motor lee la eficacia **del catálogo**, no de `EFICACIA_POR_NIVEL`
- §4 · Techo del motor: `e_efectiva = MIN(e, 0.95)` en todo camino de cálculo → `residual ≥ 0.05 × inherente`
- §5 · Traducción **por eficacia** (L3 y L4 → 90 %), marcada con `Control.recalificadoEn = null`; doble índice traducido/recalificado
- §6 · Exigencia en porcentaje: dos escaleras (criticidad sobre D, valor sobre la dimensión), C1 = 90 % **+ verificación vigente**
- §6.2 · `brecha` en puntos, cinco estados, `sin-principal` nunca es cumplimiento
- §7 · La compuerta pasa de «banda residual Crítico» a «brecha > 0» en `analisis-riesgos.ts` y `deuda-planes.ts`
- Cableado: franja de brechas en la ficha, columna y tarjeta en `/sgsi/valoracion-riesgos`

### Out of Scope

- Recalibrar `UmbralRiesgo` (ya no urgente con la compuerta movida; decisión separada)
- Recalificar los 93 controles (criterio del SIG, a mano, con bitácora — REQ-SIG-22 §3.2)
- Asignar las 272 relevancias (REQ-SIG-21, prerequisito para que la brecha sea evaluable)
- Cambiar la frecuencia de ninguna amenaza (el caso A.24 va aparte)
- Bajar niveles automáticamente, por regla o por migración

## Capabilities

### New Capabilities

- `maturity-percentage-scale`: once escalones, rúbrica, catálogo como fuente, techo 0.95, traducción marcada
- `control-requirement-gap`: exigencia en %, brecha en puntos, verificación vigente para C1, cinco estados

### Modified Capabilities

- `critical-risk-treatment-plan`: la compuerta deja de leer la banda residual y pasa a leer la brecha
- `risk-analysis-page`: columna Brecha y tarjeta recontada sobre brechas; el orden por peor residual no cambia

## Approach

Cinco fases, de adentro hacia afuera, para que cada una sea verificable sola: **núcleo puro** (madurez + exigencia, TDD, sin Prisma) → **persistencia** (catálogo, migración, traducción) → **compuerta** (analisis-riesgos, deuda-planes) → **pantallas** → **verificación**. El núcleo primero porque es donde vive la corrección y donde las pruebas son baratas; las pantallas al final porque son veinte sitios que sólo cambian de etiqueta.

La eficacia deja de estar duplicada: hoy vive en `EscalaMadurez.eficacia` (que sólo se muestra) **y** en `EFICACIA_POR_NIVEL` (que es lo que multiplica). Las dos pueden divergir. Esta fase deja una sola fuente, la tabla, como ya ocurre con `umbral_valoracion` y con `UmbralRiesgo`.

## Affected Areas

| Area | Impact | Change |
|---|---|---|
| `lib/sgsi/madurez.ts` | Modified | eficacia desde catálogo, techo 0.95, umbrales por % en vez de por nivel |
| `lib/sgsi/exigencia.ts` | Modified | tabla en %, verificación vigente, dos estados nuevos |
| `lib/sgsi/riesgos.ts` · `ecuacion.ts` | Modified | techo aplicado en el único camino aritmético |
| `lib/sgsi/analisis-riesgos.ts` · `deuda-planes.ts` | Modified | compuerta por brecha |
| `prisma/schema.prisma` + migración + `seeds/escalas.ts` | Modified | 11 filas, `Control.recalificadoEn`, remapeo de FK |
| `app/components/sgsi/controles/*` | Modified | selector de 11 escalones sin 100 %, doble índice, rúbrica |
| `app/components/sgsi/activos/FichaActivo.tsx` · `PestanaEcuacion.tsx` | Modified | franja de brechas, etiquetas en % |
| `app/components/sgsi/valoracion-riesgos/PantallaAnalisisRiesgos.tsx` | Modified | columna Brecha, tarjeta |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| El remapeo de FK (`Control.lineaBaseId/actualId/objetivoId`, `Riesgo.madurezId`, `AccionPlan` ×2) deja filas apuntando a escalones borrados | Media | La migración **inserta los escalones nuevos, remapea y sólo entonces borra**, en una transacción; `nivel` pasa a ser el porcentaje, así que L3(3)→90 es un `UPDATE` explícito por valor, no por posición |
| La traducción se lee como recalificación y nadie vuelve a mirar los 93 controles | **Alta** | `recalificadoEn = null` + doble índice: la diferencia entre los dos números es visible en la pantalla de Madurez desde el primer día |
| Un 100 % escrito por script o por una excepción de madurez borra un riesgo | Baja | Techo `MIN(e, 0.95)` en `calcularRiesgo`, no en la interfaz: ningún camino lo esquiva |
| La brecha aparece como «cero» donde en realidad no es evaluable | Media | `sin-principal` y `principal-sin-evaluar` son estados propios; las pantallas los dicen en palabras y remiten a REQ-SIG-21 |
| `Obligacion.controlAnexoA` es texto: un código mal escrito rompe el vínculo de verificación en silencio | Media | La lectura falla nombrando el código (D-3); nunca devuelve «sin verificación» por no resolver |

## Rollback Plan

La migración es **aditiva y reversible por datos**: los seis escalones viejos se conservan como filas hasta que el remapeo verifique `count(*) = 0` apuntando a ellos. Revertir es `UPDATE` inverso con el mismo mapa más `DELETE` de los cinco escalones nuevos. `Control.recalificadoEn` es una columna nullable: dejarla no rompe nada. Deploy gated por `.github/workflows/deploy.yml` (preflight + `prisma migrate deploy`); respaldo diario en `deploy/respaldo-postgres.sh`.
