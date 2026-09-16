# Tasks: Espejo de consulta de Microsoft Sentinel

Convención de rutas: `lib/sig/` (no `lib/sgsi/`) para todo el código nuevo — mismo
directorio que `trabajos.ts`/`trabajos-catalogo.ts`/`trabajos-notificaciones.ts`/
`trabajos-scorm.ts`. `lib/sgsi/graph-*.ts` es solo precedente de patrón, no de ubicación.

`IncidenteEspejo` es un tipo del módulo puro (`sentinel.ts`), NO `Prisma.IncidenteSentinel`.
Ningún archivo de Fase 1 importa `@prisma/client`.

Restricción dura: declarar en `TRABAJOS` (trabajos-catalogo.ts) e implementar en
`IMPLEMENTACIONES` (trabajos.ts) van en la MISMA tarea (3.1) — `trabajos.ts:191-199`
revienta el arranque si difieren.

Restricción dura: la migración se genera y aplica SOLO contra la base dev del puerto 5437
(`docker-compose.dev.yml`). Nunca contra producción. Sin merge/PR — el trabajo queda en
`jhonj182/sentinel-espejo-consulta`.

`e2e/eventos-reporte.spec.ts` (4 casos) NO se toca y debe seguir en verde al final.

## Fase 0 — Migración de base de datos [secuencial, bloquea 1.3/3/4/5]

- [ ] **0.1** — En `prisma/schema.prisma`: agregar `enum SistemaOrigenEvento { SENTINEL }`,
  el modelo `IncidenteSentinel` (D1–D9 del diseño; `numeroIncidente String @unique`,
  `severidadSentinel`/`estadoSentinel` con sufijo, `etiquetas`/`alertas` como texto JSON,
  `sincronizadoEn` explícito) y en `EventoSeguridad`: `origenSistema`, `origenIdExterno`,
  `origenUrl` (los tres nullable) + `@@unique([origenSistema, origenIdExterno], map:
  "evento_origen_unico")`.
  → Spec: *Sentinel vocabulary stored in its own column*, *One promotion per incident*.
  - Generar: `npx prisma migrate dev --name espejo_sentinel --create-only`.
  - Editar `migration.sql` a mano para añadir `CONSTRAINT evento_origen_completo CHECK
    ((origen_sistema IS NULL) = (origen_id_externo IS NULL))` — Prisma no lo emite desde
    el schema. No tocar el CHECK `evidencia_un_solo_origen` existente.
  - Aplicar SOLO contra dev (puerto 5437 de `docker-compose.dev.yml`): `npx prisma migrate
    deploy`. Verificar con `npx prisma generate && npx tsc --noEmit` (0 errores).
  - Prueba manual (sin jest, DB real): insertar evento con `origen_sistema='SENTINEL'` y
    `origen_id_externo=NULL` → rechazado por el CHECK; dos eventos manuales con ambas
    columnas `NULL` → ambos aceptados (NULL no colisiona en índice único); segunda fila
    con `(SENTINEL, '4021')` → viola `evento_origen_unico`.

## Fase 1 — Módulos puros (TDD estricto) [1.1 y 1.2 en paralelo entre sí; 1.3 depende de 1.1]

- [ ] **1.1** RED — `lib/sig/__tests__/sentinel-fallo.test.ts`: casos para
  `clasificarTokenSentinel`/`clasificarConsultaSentinel`/`explicarFalloSentinel` (403→
  `SIN_ROL` con frase de **rol** Log Analytics Reader, no "permiso de aplicación"; 404→
  `WORKSPACE_NO_EXISTE`; 400 con token válido→`CONSULTA_INVALIDA`; sin `tables`/columnas→
  `TABLA_AUSENTE`; 0 filas NO es fallo). Debe fallar (módulo no existe).
  → Spec: *Noisy failure on missing configuration or upstream errors*.
  - Verificar: `npm test -- sentinel-fallo` falla por import faltante.
- [ ] **1.2** GREEN — `lib/sig/sentinel-fallo.ts`: implementar `FalloSentinel` (8 variantes)
  y las tres funciones hasta que 1.1 pase.
  - Verificar: `npm test -- sentinel-fallo` verde, ninguna frase repetida entre variantes.
- [ ] **1.3** RED — `lib/sig/__tests__/sentinel.test.ts`: `aFilas` (columnas en otro orden
  da lo mismo), `KQL_INCIDENTES` (contiene `arg_max(TimeGenerated, *) by IncidentNumber`,
  NO contiene `ago(`), `claveIncidente` (`42` y `'42'` iguales), `aTextoJson` (array
  parseado == cadena JSON equivalente; `null`/`undefined`→`null`), `correoDelPropietario`
  (JSON roto→`null` sin lanzar), `descripcionPromovida` (sin separador colgante si
  descripción vacía), `sugerirEnCurso` (`Closed`→false, `New`/`Active`→true),
  `clasificarSincronizacion` (mismos datos→0 nuevos/0 actualizados/todas en `sinCambios`;
  `id`/`sincronizadoEn` distintos NO cuentan como cambio), `variablesSentinelQueFaltan`
  (nombra solo la que falta; blanco cuenta como ausente), `ventanaDeSincronizacion`
  (sin `SENTINEL_TIMESPAN_SINCRONIZACION`→`'P30D'`; variable presente→ese valor; blanco→
  default). Debe fallar (módulo no existe).
  → Spec: *Idempotent upsert*, *Dedup via arg_max*, *Refresh scope excludes promoted
  state*, *Sentinel vocabulary in its own column*.
  - Verificar: `npm test -- lib/sig/__tests__/sentinel.test.ts` falla por import faltante.
- [ ] **1.4** GREEN — `lib/sig/sentinel.ts`: implementar todo lo listado en 1.3, incluida
  `ventanaDeSincronizacion(entorno): string` (default `'P30D'`, override por
  `SENTINEL_TIMESPAN_SINCRONIZACION`; comentario documentando que P30D cubre los 19
  incidentes medidos en el workspace real con retención de 730 días, y que un primer
  llenado puede pedir ventana mayor). Importa `ResultadoSentinel`/`FalloSentinel` de 1.2,
  ninguna dirección inversa.
  - Verificar: `npm test -- lib/sig/__tests__/sentinel.test.ts` verde.

## Fase 2 — Cliente de red [depende de 1.2 y 1.4]

- [ ] **2.1** — `lib/sig/sentinel-consulta.ts` (`import 'server-only'`):
  `tokenDeLogAnalytics()` y `consultarLogAnalytics(kql)`. Comprueba
  `variablesSentinelQueFaltan` antes de llamar; usa `ventanaDeSincronizacion(process.env)`
  como único `timespan` (D11 — el KQL nunca lleva `ago()`); todo `catch` cae en `SIN_RED`,
  nunca lanza.
  → Spec: *One-way flow — never writes to Sentinel*, *Noisy failure on missing config*.
  - Sin jest (red real). Verificar: `npx tsc --noEmit` sin errores de tipos.
- [ ] **2.2** — Añadir a `.env.example`: bloque `SENTINEL_TENANT_ID`,
  `SENTINEL_CLIENT_ID`, `SENTINEL_CLIENT_SECRET`, `SENTINEL_WORKSPACE_ID`,
  `SENTINEL_TIMESPAN_SINCRONIZACION` (comentada, con nota de que sin ella cae en `P30D`).
  Explicar por qué no reusa `AZURE_AD_*` ni `SHAREPOINT_*` (RBAC distinto).
  - Verificar: revisión visual, `git diff .env.example`.

## Fase 3 — El trabajo [depende de Fase 0, 1.4, 2.1]

- [ ] **3.1** — En el MISMO commit: `lib/sig/trabajos-catalogo.ts` (nueva entrada
  `nombre: 'sincronizar-incidentes-sentinel'`, `cuando: 'Cada hora, :10'`,
  `disponible: true`) y `lib/sig/trabajos.ts` (`IMPLEMENTACIONES` con import perezoso de
  `lib/sig/trabajos-sentinel.ts`, mismo patrón que `abandonar-intentos-scorm`). Crear
  `lib/sig/trabajos-sentinel.ts` → `sincronizarIncidentesSentinel(autor, hoy)`: consulta,
  `clasificarSincronizacion`, upsert por `claveIncidente`, `creados` = solo filas nuevas,
  `updateMany` final de `sincronizadoEn` sobre todas las claves (D9), `!ok` lanza con
  `explicarFalloSentinel(fallo)`.
  → Spec: *Idempotent upsert keyed by IncidentNumber*, *Noisy failure on missing config
  or upstream errors*, *Sync completes successfully with zero upserts*.
  - `lib/sig/__tests__/trabajos.test.ts` usa `toContain`/bucles genéricos, no una lista
    cerrada: agregar la entrada no rompe las aserciones existentes. Confirmar corriendo
    `npm test -- trabajos-catalogo` verde sin editar el archivo de test.
  - Sin jest para `trabajos-sentinel.ts` (Prisma). Verificar a mano contra el workspace
    real; anotar la corrida en `EjecucionTrabajo` y confirmar `creados`/`detalle` contra
    el conteo real (19 incidentes esperados con `P30D`).
  - Verificar arranque: `npx tsc --noEmit` (el guard de `trabajos.ts:191-199` no lanza al
    importar el módulo).

## Fase 4 — Acción de promoción [depende de Fase 0, 1.4; en paralelo con Fase 3]

- [ ] **4.1** — `app/sig/acciones/sentinel.ts` (`'use server'`):
  `promoverIncidenteSentinel(numeroIncidente, { enCurso, dondeId })`.
  `autorConPermiso('sgsi:escribir')` primero; `idOpcional(datos.dondeId, 'el lugar')`;
  resolver `Persona` por correo (sin ficha, no promueve); leer espejo por
  `claveIncidente`; si no existe, mensaje pidiendo sincronizar; si ya promovido, `ok:
  false` con el código existente (más `P2002` atrapado como red de seguridad); dentro de
  `$transaction`: `contadorEvento.upsert` → `codigoEvento` → `eventoSeguridad.create` con
  `descripcion: descripcionPromovida(...)`, `veredicto: null`, `justificacion: null`,
  `fechaOcurrencia: primeraActividad ?? creadoEnSentinel`, columnas de origen; dos
  entradas de bitácora (`registrarAlta` + `registrar` con `campo: 'promoción'`) desde
  `@/lib/sgsi/bitacora`, igual que `app/sig/acciones/eventos.ts`. `revalidatePath` de
  `/sgsi/sentinel` y `/sgsi/eventos`.
  → Spec: *Promotion requires sgsi:escribir*, *reportadoPorId is the promoter*,
  *descripcion composed once*, *No fabricated verdict or SGSI severity*, *One promotion
  per incident*.
  - **Sin voseo en los mensajes nuevos.** No copiar las frases voseo existentes en
    `app/sig/acciones/eventos.ts` ("Contá qué pasó", "no tenés que clasificarlo") ni en
    `sesion.ts:17` — son del módulo de reporte manual, que la restricción 1 prohíbe tocar.
    Todo mensaje nuevo en `sentinel.ts` en "tú"/impersonal.
  - Sin jest (Prisma + server action). Verificar a mano: sesión sin `sgsi:escribir` →
    rechazado sin fila creada; sesión con permiso → fila creada con `origenSistema`/
    `origenIdExterno` poblados; segundo intento sobre el mismo incidente → falla con el
    código existente, sin segunda fila (confirmar con `SELECT count(*)` en dev).
  - Verificar tipos: `npx tsc --noEmit`.

## Fase 5 — Vista [depende de Fase 3 y 4]

- [ ] **5.1** — `app/sgsi/sentinel/page.tsx` (server, `dynamic = 'force-dynamic'`, mismo
  patrón que `app/sgsi/eventos/page.tsx:13`): lee `incidenteSentinel` + eventos
  promovidos, calcula `puede(await rolActual(), 'sgsi:escribir')`, renderiza
  `app/sgsi/sentinel/Sentinel.client.tsx` (`'use client'`). Cada fila muestra
  `origenUrl` ("Ver en Sentinel"), `sincronizadoEn` y el estado de promoción; sin ningún
  control de edición; Promover solo si `puede(...)` es verdadero.
  → Spec: *Read-only query view*.
  - En `app/components/sgsi/SidebarSgsi.tsx`, grupo Operación (junto a `EVT` línea ~111):
    `{ etiqueta: 'Incidentes de Sentinel', abreviatura: 'SEN', href: '/sgsi/sentinel' }`.
  - Sin jest (server component + Prisma). Verificar a mano: 19 incidentes deduplicados →
    19 filas, una por `IncidentNumber`; sesión sin `sgsi:escribir` → botón Promover
    ausente; `npx tsc --noEmit` y `npm run lint` sin errores nuevos.

## Fase 6 — Verificación integral [secuencial, al final]

- [ ] **6.1** — Correr en orden y confirmar cada uno en verde antes de continuar:
  1. `npx prisma generate`
  2. `npm test` (línea base 1969 + los nuevos de `sentinel.ts`/`sentinel-fallo.ts`, 0
     fallos)
  3. `npx tsc --noEmit` (0 errores)
  4. `npm run lint` (0 errores)
  5. `npx playwright test` (incluye `e2e/eventos-reporte.spec.ts`, 4 casos, SIN
     modificar — sigue verde; confirma que el módulo de reporte manual no fue tocado)
  → Spec: *Manual reporting stays open, unaffected (O1)* + guardia de regresión.
  - Si `e2e/eventos-reporte.spec.ts` falla, DETENER: algo de Fase 3/4/5 tocó el módulo
    de reporte — revertir ese cambio antes de seguir, no ajustar el test.
