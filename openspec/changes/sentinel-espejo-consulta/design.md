# Design: Espejo de consulta de Microsoft Sentinel

## Enfoque técnico

Cuatro capas, cortadas donde el repo ya corta: un módulo **puro** con todas las decisiones
(`lib/sig/sentinel.ts`, `lib/sig/sentinel-fallo.ts`), un cliente **de red sin decisiones**
(`lib/sig/sentinel-consulta.ts`), un **trabajo** que escribe el espejo
(`lib/sig/trabajos-sentinel.ts`) y una **acción + vista** que promueve y consulta. Es el
mismo reparto de `graph-fallo.ts` (puro, probado) / `graph-consulta.ts` (red, sin reglas),
y por la misma razón: lo probable no puede importar Prisma ni tocar la red.

Todo Next usado acá tiene precedente vivo en este worktree 16.3.2 —
`export const dynamic = 'force-dynamic'` (`app/sgsi/eventos/page.tsx:13`), `revalidatePath`
dentro de `'use server'` (`app/sig/acciones/eventos.ts:11,85`) y una server action importada
por un componente cliente (`Eventos.client.tsx`). Se sigue el precedente del repo, no una
lectura de la documentación.

## Decisiones de arquitectura

| # | Decisión | Alternativa descartada | Por qué |
|---|---|---|---|
| D1 | Tabla espejo `IncidenteSentinel`, clave `numeroIncidente String @unique` | `Int`; o clave compuesta con `TimeGenerated` | Es un identificador ajeno: nunca se suma ni se ordena como número. `TimeGenerated` en la clave reproduciría el append-only de Sentinel dentro del SGI, que es justo lo que el `arg_max` viene a cerrar |
| D2 | El vínculo espejo↔evento vive en `EventoSeguridad`, no en el espejo | `eventoId Int? @unique` en el espejo | Dos columnas para el mismo hecho son dos verdades. Además las columnas de origen tienen que poder apuntar a un sistema que no tenga tabla espejo; por eso son referencia de texto y no FK |
| D3 | `origenSistema` es enum `SistemaOrigenEvento` | `String?` libre | El conjunto es cerrado por construcción: agregar un sistema exige código nuevo (trabajo + mapeo), o sea migración de todos modos. Texto libre admite `sentinel` y `Sentinel` como dos sistemas |
| D4 | Taxonomía de fallo propia (`sentinel-fallo.ts`), no reusar `graph-fallo.ts` | Parametrizar `graph-fallo.ts` con producto y variables | Las causas NO coinciden. Un 403 de Log Analytics es «al service principal le falta el **rol** Log Analytics Reader sobre el workspace» — asignación RBAC en el portal, nada que ver con «agregar permiso de APLICACIÓN y conceder consentimiento». Reusar produciría el defecto exacto que `graph-fallo.ts` existe para evitar: mandar a alguien a arreglar lo que no está roto |
| D5 | Dos clasificadores separados: token y consulta | Uno solo, como en Graph | Un 400 del endpoint de consulta **con token válido** es un error de KQL o de petición, no una credencial. Compartirlo mandaría a rotar un secreto bueno |
| D6 | El trabajo **nunca borra** filas del espejo | Reconciliar bajas | Un incidente que deja de aparecer conserva su último estado conocido y su `sincronizadoEn` se envejece, cosa que la vista muestra. Borrar destruiría la evidencia de que existió |
| D7 | El espejo **no escribe bitácora**; su rastro es `EjecucionTrabajo` | Registrar cada upsert | 19 filas por hora de una copia de otro sistema ahogarían la bitácora. La bitácora registra decisiones del SGSI; la única decisión acá es promover, y esa sí se registra |
| D8 | `enCurso` lo **declara** quien promueve; el sistema solo sugiere | Derivarlo de `estadoSentinel !== 'Closed'` | Un incidente abierto en la bandeja de triage no es lo mismo que un ataque en curso. `sugerirEnCurso()` marca la casilla; el valor guardado es la afirmación de una persona |
| D9 | `sincronizadoEn` se escribe explícito en cada corrida | `@updatedAt` | La pregunta es «cuándo confirmó el espejo que esto sigue así», y es verdad también cuando nada cambió. `@updatedAt` no dispara si el update queda vacío |
| D10 | El botón Promover se oculta sin `sgsi:escribir`; el control real es `autorConPermiso` | Solo ocultar el botón | Ocultar es ergonomía. Una server action es alcanzable por quien sepa formar la petición |
| D11 | La ventana de tiempo va **solo** en el `timespan` del cuerpo de la petición; el KQL no lleva ningún `ago()` | Predicado de tiempo en el KQL; o los dos | Con los dos, la ventana más angosta gana en silencio y hay dos sitios donde buscar por qué falta una fila. Explícito en el cuerpo además evita depender del valor por omisión del endpoint cuando `timespan` se omite |

## Modelo de datos

### `IncidenteSentinel` (`@@map("incidente_sentinel")`)

`id`, `numeroIncidente String @unique @map("numero_incidente")`, `titulo`, `descripcion String?`,
`severidadSentinel String @map("severidad_sentinel")`, `estadoSentinel String @map("estado_sentinel")`,
`clasificacion String?`, `comentarioClasificacion String? @map("comentario_clasificacion")`,
`creadoEnSentinel DateTime @map("creado_en_sentinel")`, `primeraActividad DateTime? @map("primera_actividad")`,
`ultimaActividad DateTime? @map("ultima_actividad")`, `cerradoEnSentinel DateTime? @map("cerrado_en_sentinel")`,
`url String`, `proveedor String`, `propietarioCorreo String? @map("propietario_correo")`,
`etiquetas String?`, `alertas String?`, `sincronizadoEn DateTime @map("sincronizado_en")`.
`@@index([estadoSentinel, creadoEnSentinel])`.

**Qué se normaliza**: fechas (a `DateTime`, para poder ordenar y comparar) y
`propietarioCorreo` (extraído del JSON `Owner`, porque es el único campo que alguien lee).
**Qué queda crudo**: `etiquetas` y `alertas`, como texto JSON (`aTextoJson`, porque la API
los devuelve ya parseados). Explotarlos a tablas inventaría un modelo de alertas que el SGI
no usa y que Sentinel ya tiene.
**`severidadSentinel` y `estadoSentinel` llevan el sufijo en el nombre** (O5): son el
vocabulario de Sentinel, no la severidad del SGSI —que es derivada de los impactos CID y no
se almacena nunca— ni el estado del evento, que sale de `estadoDelEvento()`.
`clasificacion` se guarda y **jamás** alimenta `veredicto`/`justificacion`.

### Columnas nuevas en `EventoSeguridad`

`origenSistema SistemaOrigenEvento? @map("origen_sistema")`,
`origenIdExterno String? @map("origen_id_externo")`, `origenUrl String? @map("origen_url")`,
`@@unique([origenSistema, origenIdExterno], map: "evento_origen_unico")`.

**Nullable es obligatorio, no una comodidad**: en Postgres dos filas con `NULL` no colisionan
en un índice único, así que todo evento reportado a mano pasa sin tocar la restricción,
mientras dos promociones del mismo `IncidentNumber` chocan. Con `NOT NULL` y un centinela
(`''`), el segundo evento manual del año sería rechazado.

`origenUrl` se guarda en vez de componerse: la URL trae suscripción, grupo de recursos y
workspace; armarla en el SGI incrustaría la topología de Azure en una vista y se rompería en
silencio el día que el workspace se mueva.

Migración `prisma/migrations/{ts}_espejo_sentinel/migration.sql`: `CREATE TYPE`,
`CREATE TABLE`, tres `ALTER TABLE "evento_seguridad" ADD COLUMN`, el índice único y
`CHECK` `evento_origen_completo`: sistema e id externo van juntos o no van.
El CHECK `evidencia_un_solo_origen` no se toca.

## Módulo puro — `lib/sig/sentinel.ts` (+ `__tests__/sentinel.test.ts`)

```ts
export const KQL_INCIDENTES: string;              // con arg_max(TimeGenerated, *) by IncidentNumber, SIN ago()
export const TIMESPAN_SINCRONIZACION: string;     // ISO-8601, p. ej. 'P365D'
export interface RespuestaLogAnalytics { tables: { name: string; columns: { name: string; type: string }[]; rows: unknown[][] }[] }
export function aFilas(r: RespuestaLogAnalytics): ResultadoSentinel<Record<string, unknown>[]>;
export function claveIncidente(valor: unknown): string;
export function aTextoJson(valor: unknown): string | null;
export function normalizarIncidente(fila: Record<string, unknown>): IncidenteEspejo;
export function correoDelPropietario(owner: unknown): string | null;
export function descripcionPromovida(titulo: string, descripcion: string | null): string;
export function sugerirEnCurso(estadoSentinel: string): boolean;
export function clasificarSincronizacion(existentes: readonly IncidenteEspejo[], entrantes: readonly IncidenteEspejo[]): { nuevos: IncidenteEspejo[]; actualizados: IncidenteEspejo[]; sinCambios: string[] };
export function variablesSentinelQueFaltan(entorno: Record<string, string | undefined>): string[];
```

`ResultadoSentinel` y `FalloSentinel` viven en `sentinel-fallo.ts` y `sentinel.ts` los
importa. Una sola dirección, para que no aparezca un ciclo.

`aFilas` mapea **por nombre de columna**, leyendo `columns[]`. Indexar por posición hace que
un reordenamiento de Azure corra todos los campos un lugar sin que nada falle.

`claveIncidente` existe porque Log Analytics devuelve JSON tipado: `IncidentNumber` puede
llegar como número. Si el trabajo normaliza de una forma y la acción de otra, la clave del
upsert se bifurca y el espejo duplica en producción con los tests en verde.

`aTextoJson` es el mismo problema con otra cara: `Labels` y `AlertIds` son `dynamic` en KQL,
así que la API los devuelve ya parseados —arreglo u objeto—, no como cadena. La conversión a
texto vive en el módulo puro para que el trabajo y cualquier lector futuro coincidan;
`normalizarIncidente` la usa para `etiquetas` y `alertas`. `correoDelPropietario` recibe
`unknown` por lo mismo: `Owner` puede llegar como objeto o como cadena JSON, y las dos
formas tienen que dar el mismo correo.

`clasificarSincronizacion` compara una **proyección** que excluye `id` y `sincronizadoEn`;
sin eso toda fila se reporta «actualizada» para siempre y el criterio de éxito 1 deja de
significar algo. Devuelve **claves**, no un conteo, porque D9 exige refrescar
`sincronizadoEn` también en las filas sin cambios.

## Módulo puro — `lib/sig/sentinel-fallo.ts` (+ tests)

`FalloSentinel`: `SIN_CONFIGURAR` | `CREDENCIAL_RECHAZADA` | `SIN_ROL` (403: falta
**Log Analytics Reader** sobre el workspace) | `WORKSPACE_NO_EXISTE` (404: `SENTINEL_WORKSPACE_ID`
equivocado) | `CONSULTA_INVALIDA` (400 en `/query` con token bueno) | `TABLA_AUSENTE`
(respondió sin `tables` o sin las columnas esperadas: Sentinel no está onboardeado) |
`DEMASIADAS_CONSULTAS` | `RESPUESTA_INESPERADA` | `SIN_RED`.
`clasificarTokenSentinel`, `clasificarConsultaSentinel`, `explicarFalloSentinel`.

**Cero filas no es un fallo**: `tables[0].rows.length === 0` es una respuesta legítima y el
trabajo termina EXITOSO con `creados: 0`.

## Cliente de red — `lib/sig/sentinel-consulta.ts` (`import 'server-only'`)

```ts
export async function tokenDeLogAnalytics(): Promise<ResultadoSentinel<string>>;
export async function consultarLogAnalytics(kql: string): Promise<ResultadoSentinel<RespuestaLogAnalytics>>;
```

Token: `POST https://login.microsoftonline.com/${SENTINEL_TENANT_ID}/oauth2/v2.0/token`,
`grant_type=client_credentials`, `scope=https://api.loganalytics.io/.default`.
Consulta: `POST https://api.loganalytics.io/v1/workspaces/${SENTINEL_WORKSPACE_ID}/query`,
cuerpo `{ query: kql, timespan: TIMESPAN_SINCRONIZACION }`, `Authorization: Bearer`.
El `timespan` va explícito y es la **única** ventana de tiempo (D11).

Comprueba las variables **antes** de intentar la llamada y devuelve `SIN_CONFIGURAR` con los
nombres exactos. Nunca lanza: todo `catch` cae en `SIN_RED`.

**Cómo se aísla**: devuelve la `RespuestaLogAnalytics` cruda. Todo el mapeo vive en el módulo
puro, así que las pruebas alimentan una respuesta literal capturada en la exploración — sin
mockear `fetch`, sin red. Este archivo no toma ninguna decisión, igual que `graph-consulta.ts`.

## El trabajo

`lib/sig/trabajos-sentinel.ts` → `sincronizarIncidentesSentinel(autor: string, hoy: Date): Promise<ResultadoTrabajo>`.

Catálogo (`trabajos-catalogo.ts`) y cableado (`trabajos.ts` → `IMPLEMENTACIONES`) entran en
**el mismo commit**: `trabajos.ts:191-199` valida la coincidencia al cargar el módulo y una
mitad sin la otra tumba el arranque. Import perezoso dentro de `IMPLEMENTACIONES`, como
`abandonar-intentos-scorm`.

- `nombre: 'sincronizar-incidentes-sentinel'`, `cuando: 'Cada hora, :10'`, `disponible: true`.
- `creados` = **solo filas espejo nuevas**. Contar las actualizadas haría que una corrida
  idempotente reportara 19 creados cada hora y el criterio 1 sería inverificable desde la
  bitácora.
- `detalle`: `"19 incidentes; 0 nuevos, 2 actualizados, 17 sin cambios"`.
- Después de los upserts, **un solo** `incidenteSentinel.updateMany({ where: { numeroIncidente: { in: todasLasClaves } }, data: { sincronizadoEn: ahora } })`. La clasificación solo alimenta `creados` y `detalle`; quien escribe `sincronizadoEn` es el `updateMany`, y por eso también las filas sin cambios quedan refrescadas (D9).
- Ante `!ok` lanza con `explicarFalloSentinel(fallo)`; `correrTrabajo` lo atrapa y deja
  `EjecucionTrabajo` FALLIDO con el mensaje. Mismo contrato que `enviar-notificaciones`.

## La acción de promoción — `app/sig/acciones/sentinel.ts` (`'use server'`)

```ts
export async function promoverIncidenteSentinel(
  numeroIncidente: string,
  datos: { enCurso: boolean; dondeId?: number },
): Promise<ResultadoEvento>;
```

1. `autorConPermiso('sgsi:escribir')` — promover es decisión del SGSI, no observación
   espontánea; O1 no aplica y reportar a mano sigue sin pedir permiso.
2. `const dondeId = idOpcional(datos.dondeId, 'el lugar')` (`sesion.ts:50`). Sin eso, un
   `<select>` de lugares vacío manda `undefined` o `0` hasta Prisma y la pantalla muestra un
   error crudo de base de datos — el defecto que `idOpcional` existe para cerrar
   (`sesion.ts:29-34`).
3. Resuelve `Persona` por `correo`; sin ficha, no promueve.
4. Lee el espejo por `claveIncidente(numeroIncidente)`; si no está, dice que hay que
   sincronizar.
5. Si ya fue promovido, devuelve `ok: false` con el código del evento existente. **La
   consulta es para el mensaje; la garantía es el índice único** — el `P2002` se atrapa y
   produce el mismo mensaje, para que un doble clic sea una frase y no un 500.
6. Transacción: `contadorEvento.upsert` → `codigoEvento(anio, n)` → `eventoSeguridad.create`
   con `descripcion: descripcionPromovida(titulo, descripcion)` (O15, se compone una vez y
   no se reescribe), `fechaOcurrencia: primeraActividad ?? creadoEnSentinel` (cuándo ocurrió,
   no cuándo Sentinel se enteró; el respaldo es obligatorio porque `FirstActivityTime` puede
   venir nula), `enCurso: datos.enCurso`, `dondeId`, `reportadoPorId: persona.id`,
   `veredicto: null`, `justificacion: null`, y las tres columnas de origen.
7. Bitácora **dentro de la transacción**, dos entradas: `registrarAlta` (el evento existe) y
   `registrar` con `campo: 'promoción'`, `nuevo: 'Microsoft Sentinel · {numero}'`,
   `motivo: 'promoción del espejo de Sentinel'`. Sin la segunda, el rastro no responde quién
   decidió que esto entrara al SGSI.
8. `revalidatePath('/sgsi/sentinel')` y `revalidatePath('/sgsi/eventos')`.

## La vista

`app/sgsi/sentinel/page.tsx` (server, `dynamic = 'force-dynamic'`) lee el espejo y los
eventos ya promovidos, arma las filas y renderiza
`app/sgsi/sentinel/Sentinel.client.tsx` (`'use client'`). Entrada en `SidebarSgsi.tsx`,
grupo Operación, después de Eventos: `{ etiqueta: 'Incidentes de Sentinel', abreviatura: 'SEN', href: '/sgsi/sentinel' }`.

Lectura: la gatea el middleware de `/sgsi`, igual que el resto de la sección. Escritura: la
página calcula `puede(await rolActual(), 'sgsi:escribir')` para decidir si dibuja Promover.

**Cómo deja claro que Sentinel es el registro autoritativo**: cada fila lleva el enlace
profundo `origenUrl` («Ver en Sentinel»); el encabezado dice en una frase que esto es una
copia de solo lectura refrescada por el trabajo y que las alertas, entidades y línea de
tiempo viven en Sentinel; cada fila muestra `sincronizadoEn` para que nadie lea una copia
vieja como si fuera actual; y **no hay ningún control de edición en la pantalla** — la única
acción es Promover. Una pantalla sin dónde editar es la afirmación más clara posible sobre
quién es el dueño del registro.

## Variables de entorno

`SENTINEL_TENANT_ID`, `SENTINEL_CLIENT_ID`, `SENTINEL_CLIENT_SECRET`, `SENTINEL_WORKSPACE_ID`.

Nuevas y separadas a propósito. `AZURE_AD_*` es el registro del **inicio de sesión**, que no
necesita ningún RBAC de Azure; apuntar el trabajo ahí obligaría a concederle Log Analytics
Reader a la aplicación por la que entra toda la empresa. `SHAREPOINT_*` es peor: ese service
principal tiene permisos de escritura en Graph y deshabilita cuentas.

`SENTINEL_WORKSPACE_ID` es variable y no constante porque identifica el entorno: quemada,
pruebas leería los incidentes de producción y el fallo sería invisible, porque los datos se
verían bien.

Si falta alguna: no se intenta la llamada, el trabajo falla nombrando **exactamente** cuál
falta, `EjecucionTrabajo` lo deja escrito, y la vista sigue mostrando lo que el espejo ya
tenía. Nada revienta con un 500.

## Estrategia de pruebas (TDD estricto)

| Qué | Cómo |
|---|---|
| `aFilas` mapea por nombre | Respuesta con las columnas en otro orden sigue dando lo mismo |
| `KQL_INCIDENTES` | Contiene `arg_max(TimeGenerated, *) by IncidentNumber` (sin eso el espejo duplica) y **no** contiene `ago(` (D11: una sola ventana, la del `timespan`) |
| `TIMESPAN_SINCRONIZACION` | Es ISO-8601 válido y no está vacío |
| `claveIncidente` | `42` y `'42'` producen la misma clave |
| `aTextoJson` | Arreglo parseado y cadena JSON equivalente producen el mismo texto; `null`/`undefined` → `null` |
| `correoDelPropietario` | JSON válido → correo; JSON roto → `null` sin lanzar; ausente → `null` |
| `descripcionPromovida` | Compone título y descripción; descripción vacía no deja separador colgando |
| `sugerirEnCurso` | `Closed` → `false`; `New` y `Active` → `true` |
| `clasificarSincronizacion` | Mismos datos → 0 nuevos, 0 actualizados y **todas** las claves en `sinCambios` (criterio 1 + D9); un campo distinto → actualizado; número nuevo → nuevo; `id` y `sincronizadoEn` distintos NO cuentan como cambio |
| `variablesSentinelQueFaltan` | Nombra la que falta, no las cuatro; en blanco cuenta como ausente |
| `sentinel-fallo` | Ninguna frase se repite; 403 habla del **rol** y no de permisos de aplicación; 404 habla del workspace id; cero filas no es fallo |

Sin jest: `sentinel-consulta.ts` (red), `trabajos-sentinel.ts` (Prisma), la acción y la
vista. Se verifican a mano contra el workspace real, con la corrida registrada en
`EjecucionTrabajo`.

## Migración y despliegue

Aditiva: tabla nueva, tipo nuevo y tres columnas nullable. `npx prisma migrate deploy` con
respaldo previo. Sin backfill: el espejo se llena en la primera corrida del trabajo.
Reversa: revertir el commit; la migración puede quedar aplicada sin daño. Para apagar solo la
sincronización, `disponible: false` **junto con** la baja en `IMPLEMENTACIONES`.

## Preguntas abiertas

- [x] ~~**El valor de la ventana hay que verificarlo contra el workspace real.**~~
  **RESUELTO el 2026-09-15**, medido contra `law-sentinel-cuantico`
  (customerId `a38e310c-7fad-42ad-9375-9a3c102e8b12`):

  | Ventana | Incidentes deduplicados |
  |---|---|
  | `P1D` | 3 |
  | `P7D` | **19** |
  | `P30D` | **19** |
  | `P90D` | 19 |

  Retención: el workspace tiene 30 días por omisión, pero la tabla `SecurityIncident`
  está configurada en **730 días interactivos / 2556 totales** (fase F2, para evidencia
  ISO). O sea que la retención **no** es más angosta que la ventana y no manda sobre ella
  —el riesgo que esta pregunta anticipaba no se materializa.

  **Decisión: `P30D` por omisión**, configurable por entorno. Los 19 incidentes actuales
  caben en 7 días, así que `P30D` deja margen amplio sin truncar. El primer llenado puede
  querer una ventana mayor; por eso es configurable y no una constante.

  Nota de implementación: quedó como función pura `ventanaDeSincronizacion(entorno)` en vez
  de la constante `TIMESPAN_SINCRONIZACION` que este documento proponía más arriba, para que
  el override por variable de entorno quede cubierto por jest en lugar de leer `process.env`
  dentro del cliente de red.
