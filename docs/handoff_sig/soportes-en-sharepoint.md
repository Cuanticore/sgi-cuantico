# Requerimiento · Los soportes del SIG quedan en SharePoint, en la carpeta de cada persona

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-13 · publicación de soportes |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-08 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo (ejecución asistida con Claude Code) |
| **Extiende** | REQ-SIG-02 (leer/aceptar/firmar) · `docs/handoff_a/lectura-aceptacion-firma.md` |
| **Estado** | Decisiones D-1 a D-4 **cerradas** (§10) · listo para ejecutar. D-4 confirmada el 08/09/2026: la carpeta queda como está y el acceso lo controla la aplicación. |

---

## 1 · Objetivo

Que **cada soporte que la aplicación genera** quede también en SharePoint, dentro de la carpeta de la persona a la que pertenece, para que un auditor —o quien lidera el SIG— lo encuentre navegando la biblioteca documental **sin entrar a la aplicación ni pedirle nada a nadie**.

Hoy el artefacto de una firma existe solo dentro de Postgres (`evidencia_archivo.bytes`) y se sirve por `app/api/sig/acta/route.ts`. Es íntegro y trazable, pero **invisible desde el sistema documental**: la carpeta del SIG en SharePoint no tiene ni una de las actas que la aplicación lleva firmadas.

Lo que este requerimiento agrega es **una sola cosa**: un publicador que copia esos artefactos a SharePoint y sabe decir, por cada uno, si está publicado, dónde, y si no, por qué no.

---

## 2 · La ruta destino, decodificada

El enlace entregado por el solicitante trae la ruta URL-codificada (`%2F` = `/`, `%2E` = `.`) y un `viewid`, que es el identificador de la vista de la biblioteca y **no forma parte de la ruta**. Decodificado:

| Pieza | Valor |
|---|---|
| Host del tenant | `cuanticore.sharepoint.com` |
| Sitio | `/sites/Cuantico` |
| Biblioteca | `Shared Documents` (aparece como «Documentos» en la interfaz en español) |
| Carpeta base | `09. SISTEMA INTEGRADO DE GESTION/14. Seguridad de la Informacion/11. Automatizaciones y requerimientos SIG/2. Soportes SIG` |
| Carpeta por persona | `…/2. Soportes SIG/<carpeta de la persona>` (§4) |

**Es el mismo sitio que la aplicación ya lee.** `app/lib/sharepoint.ts` resuelve el sitio con `SHAREPOINT_SITE_URL` + `SHAREPOINT_SITE_NAME` y la biblioteca buscando el drive llamado `Documents` o `Shared Documents`. Ese código se **reutiliza**; no se abre un segundo camino a Graph. Verificar en el `.env` de producción que esas dos variables ya apunten a `cuanticore.sharepoint.com` y `Cuantico`; si apuntan a otro sitio, este requerimiento necesita variables propias y hay que decirlo antes de empezar, no después.

**Nueva variable** (la carpeta base no se codifica en el fuente: cambia con la organización documental y un cambio de carpeta no debe ser un despliegue):

```
SHAREPOINT_SOPORTES_PATH=09. SISTEMA INTEGRADO DE GESTION/14. Seguridad de la Informacion/11. Automatizaciones y requerimientos SIG/2. Soportes SIG
```

**P1 · la carpeta base no se crea, se exige.** Si Graph responde 404 sobre `SHAREPOINT_SOPORTES_PATH`, el publicador **falla y lo dice**; no crea la ruta. Crearla convertiría una variable mal escrita en un árbol de carpetas fantasma dentro de la biblioteca del SIG, y nadie sabría por qué las actas «se publicaron» donde no están.

---

## 3 · Qué se publica

| Soporte | Origen en la base | ¿Entra ahora? |
|---|---|---|
| **Acta de aceptación y firma** | `ActaAceptacion.pdfId` → `Evidencia` + `EvidenciaArchivo` | **Sí.** Es el soporte auditable por excelencia y el único artefacto que la app genera hoy por sí misma. |
| Anexos que sube la persona | `Evidencia` con dueño `control`/`registro`/`hallazgo`/`evento` | **No** (D-2). Volumen y contenido heterogéneos, y su dueño no siempre es una persona. |
| Acta de borrado seguro | `ActaBorradoSeguro` | **No.** Hoy no genera artefacto propio: es una fila más su evidencia adjunta. |
| Hoja de vida FOR-TEC-04 | `docs/handoff_tecnologia/hoja-de-vida-for-tec-04.md` | **No.** Es por equipo, no por persona. |

El diseño **no debe cerrarse a las actas**: la tabla de §5 lleva `evidenciaId` y no `actaId`, para que sumar un tipo de soporte mañana sea una fila de configuración y no una segunda máquina de publicar.

**Advertencia sobre el formato, para que nadie se sorprenda en la reunión de auditoría.** El campo se llama `pdfId`, pero lo que hoy se genera y se guarda es **texto plano** (`app/sig/acciones/firma.ts:181-186`: `archivoNombre: ACT-2026-0001.txt`, `archivoMime: text/plain`). No hay librería de PDF en `package.json`. Este requerimiento **publica lo que existe, tal como existe** —un `.txt` legible con los cinco numerales del acta— y **no** convierte nada a PDF. Convertirlo es un requerimiento aparte con su propia decisión (qué librería, qué plantilla, qué pasa con las actas ya firmadas y su huella SHA-256, que cambiaría). Publicar primero y convertir después es seguro; hacer ambas cosas a la vez pone en riesgo la integridad de la huella de lo ya firmado.

---

## 4 · La carpeta de la persona

**D-3 · el nombre de la carpeta es la parte local del correo corporativo.** `daniel.medina@cuantico.com` → carpeta `daniel.medina`.

Por qué así:

- `Persona.correo` (el `userPrincipalName` normalizado) es **único** por definición del tenant y es **la llave con la que la app ya identifica a la persona** contra Microsoft Graph.
- Es **legible** para quien navega la biblioteca, que es todo el punto de este requerimiento.
- No contiene ninguno de los caracteres que SharePoint prohíbe.
- Un homónimo no la rompe. «Apellido Nombre» sí: hay dos personas que se llaman igual y la carpeta de una se llenaría con los soportes de la otra, que es exactamente el incidente de confidencialidad que el SGSI no puede permitirse.
- La cédula sería única y estable, pero pone un dato de identidad en una ruta que se comparte por enlace.

**P2 · la carpeta se direcciona por su `id`, no por su nombre.** Al crearla se guarda el `driveItem.id` en `Persona.carpetaSoportesId`, y todas las subidas posteriores van contra ese `id`. Si alguien renombra o mueve la carpeta desde SharePoint —y alguien lo hará—, las publicaciones siguen cayendo en la carpeta correcta en vez de crear una segunda carpeta con el nombre viejo. El nombre es cosmética; el `id` es la identidad.

**P3 · la carpeta se crea con el primer soporte, no antes.** No se pre-crean carpetas para todo el censo: una carpeta vacía por cada persona que nunca firmó nada convierte la biblioteca en ruido y hace más difícil ver quién sí tiene soportes.

**P4 · si el correo cambia, la carpeta se renombra por `id`.** El trabajo programado compara `Persona.correo` con `Persona.carpetaSoportesRuta`; si difieren, hace un `PATCH` del nombre sobre el `id` guardado. No se crea una carpeta nueva: los soportes de una persona viven en un solo lugar aunque su cuenta haya cambiado de nombre.

**Nombre del archivo:**

```
ACT-2026-0014 — POL-SIG-02 v3 — 2026-09-08.txt
```

Código del acta (único, es la llave), documento aceptado con su versión congelada, y fecha de aceptación. Ordenado por nombre, el listado de la carpeta se lee como la historia de lo que esa persona aceptó.

**P5 · saneamiento del nombre.** SharePoint rechaza `" * : < > ? / \ |`, los espacios al inicio o al final, y los nombres que empiezan por `~$`; y la ruta completa no puede pasar de 400 caracteres. El módulo puro reemplaza lo prohibido por `-`, colapsa espacios, recorta el nombre del archivo a 120 caracteres y **preserva siempre el código del acta al inicio**, porque es lo que permite reencontrar el soporte desde la base.

---

## 5 · Modelo de datos

### 5.1 `PublicacionSoporte` (nueva)

| Campo | Tipo | Nota |
|---|---|---|
| `id` | `Int @id` | |
| `evidenciaId` | `Int @unique` → `Evidencia` | La llave es la evidencia y no el acta: así el segundo tipo de soporte no exige una tabla nueva |
| `personaId` | `Int` → `Persona` | A quién pertenece el soporte. Es lo que decide la carpeta |
| `estado` | `EstadoPublicacion` | `PENDIENTE` · `PUBLICADO` · `BLOQUEADO` |
| `intentos` | `Int @default(0)` | |
| `ultimoIntentoEn` | `DateTime?` | |
| `causaFallo` | `String?` | La `causa` de `FalloGraph` (§6), tal cual |
| `detalleFallo` | `String?` | La frase de `explicarFallo()` |
| `driveItemId` | `String?` | El archivo en SharePoint |
| `webUrl` | `String?` | El enlace que se muestra en la ficha del colaborador |
| `rutaPublicada` | `String?` | Ruta completa al momento de publicar, para el registro histórico |
| `nombreArchivo` | `String?` | |
| `publicadoEn` | `DateTime?` | |

`@@index([estado, ultimoIntentoEn])` — es la consulta del trabajo programado.

**Por qué una tabla y no una columna `publicadoEn` en `Evidencia`.** Un booleano o una fecha no pueden responder «¿por qué no está en SharePoint?», y esa es justamente la pregunta que alguien va a hacer. La cola necesita intentos, causa y detalle, o el módulo vuelve a la situación que `lib/sgsi/graph-fallo.ts` documenta y corrige: un `null` que significa cinco cosas distintas.

**`BLOQUEADO` y no `FALLIDO`.** Un 403 o un 404 no se arreglan reintentando; se arreglan en Azure o en el `.env`. La fila queda bloqueada, visible, con su causa, y el trabajo deja de gastar llamadas en ella hasta que alguien la desbloquee.

### 5.2 Se agrega a `Persona`

| Campo | Tipo | Nota |
|---|---|---|
| `carpetaSoportesId` | `String?` | El `driveItem.id` de su carpeta (P2) |
| `carpetaSoportesRuta` | `String?` | El nombre con el que se creó, para detectar el renombre (P4) |

---

## 6 · El publicador

Dos módulos, con la frontera que ya rige en `lib/`: **lo que decide es puro y se prueba; lo que toca la red vive aparte.**

### 6.1 `lib/sig/soportes-sharepoint.ts` — puro, con pruebas

```ts
nombreDeCarpeta(correo: string): string
nombreDeArchivo(acta: { codigo, documentoCodigo, documentoVersion, aceptadoEn }): string
sanear(nombre: string): string
rutaCompleta(base: string, carpeta: string, archivo: string): string
debeReintentar(causa: FalloGraph['causa'], intentos: number): boolean
esperaAntesDeReintentar(intentos: number): number   // milisegundos
```

Sin Prisma y sin `axios`, para que corra en jest — mismo criterio que `lib/sig/trabajos-catalogo.ts` frente a `trabajos.ts`.

### 6.2 `app/lib/sharepoint.ts` — se extiende, no se duplica

Exportar `getToken`, `getSiteId` y `getDriveId` (hoy son privadas) y agregar:

```ts
resolverCarpetaBase(): Promise<ResultadoGraph<{ driveId, carpetaBaseId }>>
asegurarCarpetaDePersona(correo): Promise<ResultadoGraph<{ id, nombre }>>
subirSoporte(carpetaId, nombre, bytes, mime): Promise<ResultadoGraph<{ id, webUrl }>>
```

Endpoints de Graph:

| Paso | Llamada |
|---|---|
| Carpeta base | `GET /sites/{siteId}/drives/{driveId}/root:/{SHAREPOINT_SOPORTES_PATH}:` |
| Crear carpeta de persona | `POST /drives/{driveId}/items/{carpetaBaseId}/children` con `{ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }` |
| Renombrar (P4) | `PATCH /drives/{driveId}/items/{carpetaSoportesId}` con `{ name }` |
| Subir (< 4 MB) | `PUT /drives/{driveId}/items/{carpetaId}:/{nombre}:/content?@microsoft.graph.conflictBehavior=fail` |

**P6 · `conflictBehavior: fail`, nunca `replace` ni `rename`.** `replace` permitiría sobrescribir un soporte firmado, que es la única cosa que un acta no puede admitir. `rename` llenaría la carpeta de `ACT-2026-0014 1.txt`. Con `fail`, un 409 significa «ya está publicado»: el publicador consulta el ítem por ruta, guarda su `id` y su `webUrl`, y marca `PUBLICADO`. **El reintento es idempotente**, que es lo que un cron necesita.

**P7 · los ids de sitio y de drive se memorizan en el proceso.** Son estables y hoy se vuelven a resolver en cada llamada (dos viajes a Graph antes de cada operación útil). Caché en memoria del módulo, con invalidación al reiniciar. No es optimización prematura: `app/lib/sharepoint.ts:6-15` ya documenta que estos viajes se comieron todo el presupuesto de render del tablero.

**P8 · los fallos se clasifican con `lib/sgsi/graph-fallo.ts`, no con `catch (e)`.** `clasificarToken` y `clasificarRecurso` ya distinguen credencial vencida, permiso faltante, recurso inexistente, throttling y falta de red. Reusarlos es lo que permite que la pantalla diga qué hacer en vez de «error al publicar». El permiso que se nombra en `clasificarRecurso(estado, recurso, permiso)` es el de §8.

**P9 · reintentos con espera creciente, y un techo.** Intentos 1 a 6 con esperas de 1 min, 5 min, 15 min, 1 h, 6 h y 24 h. `DEMASIADAS_CONSULTAS` respeta el `Retry-After` de la respuesta. `SIN_CONFIGURAR` **no gasta intento** (no hay nada que reintentar hasta que las variables existan). `SIN_PERMISO` y `NO_EXISTE` pasan a `BLOQUEADO` en el primer golpe: reintentar un 403 durante un día lo esconde, y el 403 es información que alguien necesita ver hoy.

---

## 7 · Cuándo corre

**Dos disparos, un solo camino de código.**

1. **Al firmar**, después de que la transacción hace *commit*. La fila `PublicacionSoporte` se crea `PENDIENTE` **dentro** de la transacción de `app/sig/acciones/firma.ts`; la llamada a Graph se hace **fuera**, sin bloquear la respuesta y sin propagar su error a quien firmó.

   **P10 · ninguna llamada a Graph dentro de una transacción de Prisma.** El cliente HTTP tiene 10 s de timeout: una transacción que espera a Graph sostiene sus bloqueos 10 s en el peor caso, y la firma —que es lo que le importa a la persona— quedaría a merced de la disponibilidad de Microsoft. **Si Graph está caído, la firma se completa igual** y su soporte queda pendiente de publicar. Esto es D-1 (§10) puesto en código.

2. **Trabajo programado `publicar-soportes`**, que es la red de seguridad y el único mecanismo que hace falta entender cuando algo no aparece. Registrarlo en `lib/sig/trabajos-catalogo.ts` (`cuando: 'Cada hora, :20'`) y en `docs/handoff_sig/trabajos-programados.md §3`, e implementarlo en `trabajos.ts` como los demás, con su `EjecucionTrabajo` (`creados` = soportes publicados, `detalle` = pendientes y bloqueados por causa).

   Drena `PENDIENTE` ordenado por `ultimoIntentoEn`, respeta `esperaAntesDeReintentar`, y **se detiene al primer `SIN_CONFIGURAR`, `CREDENCIAL_RECHAZADA` o `SIN_RED`**: si la causa es del entorno, los 300 soportes siguientes van a fallar igual y 300 llamadas condenadas solo llenan el registro de ruido.

3. **Histórico.** La migración inserta una fila `PENDIENTE` por cada `ActaAceptacion` que ya tiene `pdfId`. No hay script aparte: el mismo trabajo las drena, con el mismo código y los mismos reintentos. Un script de una sola vez sería una segunda implementación del publicador, y sería la que nadie prueba.

---

## 8 · Permisos en Azure (lo que hay que pedirle al administrador)

La aplicación hoy **lee** de SharePoint. Escribir necesita un permiso que no tiene.

**Pedir `Sites.Selected` como permiso de APLICACIÓN** —no delegado— con consentimiento del administrador, y luego **conceder rol `write` únicamente sobre el sitio `Cuantico`**:

```
POST https://graph.microsoft.com/v1.0/sites/{siteId}/permissions
{ "roles": ["write"],
  "grantedToIdentities": [{ "application": { "id": "<SHAREPOINT_CLIENT_ID>", "displayName": "SIG Cuántico" } }] }
```

**Por qué `Sites.Selected` y no `Files.ReadWrite.All`.** `Files.ReadWrite.All` da escritura sobre **todo** SharePoint y OneDrive del tenant a una credencial que vive en un `.env` de un servidor. `Sites.Selected` la limita a un sitio. Es el control A.8.2 (derechos de acceso privilegiado) aplicado a la propia herramienta del SGSI: una herramienta de gestión de seguridad que se concede permisos excesivos a sí misma es un hallazgo, y con razón.

Verificar además cuál es el permiso de lectura ya concedido: si es `Files.Read.All` o `Sites.Read.All`, conviene migrarlo también a `Sites.Selected` (rol `write` ya cubre la lectura) y quitar el amplio. Eso es una tarea de administración, no de código, y va con su registro en `Bitacora`.

---

## 9 · Que se pueda ver sin abrir la base

**P11 · el estado de publicación es visible en la aplicación.** Tres lugares, ninguno nuevo:

- **Ficha del colaborador** (`app/sig/colaboradores/[id]/page.tsx`, donde ya se listan las actas con su huella): junto a cada acta, el enlace a SharePoint (`webUrl`) o la frase de por qué no está publicada. Es la pantalla de los responsables, que son quienes tienen acceso a la carpeta (D-4/P12).
- **`/mi-sig/historial`**, donde la persona ve sus propios cierres: **la ruta de la aplicación**, no el `webUrl` — el colaborador no tiene permiso sobre la carpeta y ese enlace le daría «acceso denegado» (P12).
- **`/mi-sig/diagnostico`**: cuántos soportes están pendientes y cuántos bloqueados, con la causa. Es la pantalla que ya existe para responder «por qué no funciona lo de Graph».
- **`/sig/estado`**: los bloqueados cuentan como anomalía. Un soporte que la aplicación cree publicado y no está es peor que uno que nunca se intentó, porque nadie lo va a buscar.

**Nunca se afirma que algo está en SharePoint sin el `driveItemId` que lo respalde.** Es la misma regla que ya rige para el censo del directorio: la pantalla dice la verdad o dice que no sabe.

---

## 10 · Decisiones

**D-1 · La base es la fuente de verdad; SharePoint es copia publicada.** Los bytes siguen en `evidencia_archivo` y la app sigue sirviendo el archivo por su propia ruta. Se publica de forma asíncrona con reintentos.
*Por qué:* el acta se genera en la misma transacción que cierra la asignación (regla F5 de REQ-SIG-02). Meter una llamada de red en ese camino haría que una caída de Microsoft impidiera firmar. Y la huella SHA-256 que sostiene la integridad ya está en la base: SharePoint no la mejora.
*Si se revierte* («SharePoint primario»): la app deja de poder entregar el acta cuando Graph no responda, y hay que rehacer `app/api/sig/acta/route.ts` como redirección firmada.

**D-2 · En esta versión solo se publican las actas de aceptación y firma.** Los anexos que sube la gente no.
*Por qué:* son el volumen grande y el contenido menos predecible (hasta `.zip` de 20 MB, lista blanca de 13 extensiones), su dueño puede ser un control o un hallazgo y no una persona, y el requerimiento pide «una carpeta por persona». Sumarlos después es una fila más en el mapeo de §3, no un rediseño.

**D-3 · La carpeta se llama como la parte local del correo corporativo** (§4).

**D-4 · Los permisos de la carpeta se mantienen como están: `2. Soportes SIG` ya está restringida a los responsables. Los colaboradores llegan a su soporte por la aplicación, no por permiso de SharePoint.** Decidido por el líder del SIG el 08/09/2026.

*Por qué esto cierra el asunto:* el acta contiene **nombre, número de documento, cargo, dirección IP y agente del navegador** de quien firmó. Con la carpeta restringida a los responsables, ese conjunto de datos solo lo lee quien ya debe leerlo, y no hace falta romper la herencia ni administrar permisos por carpeta de persona.

*La consecuencia que el desarrollo tiene que respetar, y es la parte que importa:* la credencial del publicador es un **permiso de aplicación**. Escribe y lee **sin mirar** los permisos de SharePoint de nadie. Eso es lo que hace que el esquema funcione —el colaborador no necesita acceso a la biblioteca para que su acta quede archivada— y a la vez traslada **todo** el control de acceso a la aplicación:

- **P12 · el enlace a SharePoint solo se le muestra a quien puede abrirlo.** En la ficha del colaborador (`/sig/colaboradores/[id]`), que ya exige rol de responsable, se muestra el `webUrl`. En `/mi-sig` y `/mi-sig/historial`, donde la persona ve sus propios soportes, se muestra **la ruta de la aplicación** (`/api/sig/acta`), nunca el `webUrl`. Un enlace que lleva a «acceso denegado» hace que la herramienta parezca rota y genera un ticket por cada acta.
- **P13 · la aplicación es el único control de acceso al contenido del soporte.** `app/api/sig/acta/route.ts` ya acota por la sesión; ninguna ruta nueva puede entregar bytes de un soporte por su `driveItemId` ni por su `PublicacionSoporte.id` sin verificar que quien pide es su titular o un responsable. Con permiso de aplicación de por medio, un `id` adivinable sería acceso a la cédula de cualquiera.

---

## 11 · Variables de entorno nuevas

```
# ─── Soportes del SIG en SharePoint (REQ-SIG-13) ──────────────────────────────
# Carpeta base, relativa a la biblioteca «Shared Documents» del sitio.
SHAREPOINT_SOPORTES_PATH=09. SISTEMA INTEGRADO DE GESTION/14. Seguridad de la Informacion/11. Automatizaciones y requerimientos SIG/2. Soportes SIG
# Sin ella, el publicador NO corre y lo dice; nunca adivina una carpeta.
# Requiere permiso de APLICACIÓN Sites.Selected con rol «write» sobre el sitio (§8).
```

Se agregan a `.env.example` con este comentario. Reutiliza `SHAREPOINT_TENANT_ID`, `SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET`, `SHAREPOINT_SITE_URL` y `SHAREPOINT_SITE_NAME`, que ya existen.

---

## 12 · Verificación — hecho significa demostrado

| # | Qué se comprueba | Cómo |
|---|---|---|
| 1 | Nombres de carpeta y archivo, saneamiento y política de reintentos | Pruebas unitarias de `lib/sig/soportes-sharepoint.ts` en jest, incluyendo un correo con homónimo, un título con `/` y `:`, y una ruta de 400+ caracteres |
| 2 | Una firma nueva aparece en SharePoint | Firmar en el entorno real y ver el archivo en `…/2. Soportes SIG/<correo local>/` con el nombre esperado |
| 3 | **Graph caído no rompe la firma** | Invalidar `SHAREPOINT_CLIENT_SECRET`, firmar: la firma se completa, la fila queda `PENDIENTE` con causa `CREDENCIAL_RECHAZADA` y la pantalla lo dice |
| 4 | Reintentar es idempotente | Correr `publicar-soportes` dos veces: la segunda no crea un duplicado ni un `… 1.txt`; el 409 se resuelve como `PUBLICADO` |
| 5 | El histórico queda publicado | `SELECT count(*) FROM publicacion_soporte WHERE estado='PUBLICADO'` = `SELECT count(*) FROM acta_aceptacion WHERE pdf_id IS NOT NULL` |
| 6 | El renombre de carpeta no crea una segunda | Renombrar la carpeta a mano en SharePoint, publicar otra acta: cae en la misma carpeta (P2/P4) |
| 7 | El 403 se ve y no se esconde | Quitar el rol `write` del sitio, correr el trabajo: fila `BLOQUEADO` con la frase de `explicarFallo` y el nombre del permiso |
| 8 | El permiso concedido es el mínimo | Captura del registro de la aplicación en Azure: `Sites.Selected` con rol `write` **solo** sobre el sitio `Cuantico` |
| 9 | **Nadie ve un enlace que no puede abrir** | Con una cuenta de colaborador sin acceso a la biblioteca: `/mi-sig/historial` entrega el acta por la ruta de la aplicación y **no** muestra ningún `webUrl` (P12) |
| 10 | El soporte no se entrega por un `id` adivinable | Pedir el acta de otra persona por su `PublicacionSoporte.id` y por su `driveItemId`: rechazado en los dos casos (P13) |

---

## 13 · Qué NO hace este requerimiento

- **No convierte el acta en PDF.** Publica el `.txt` que la aplicación genera hoy (§3). Cambiar el formato altera la huella SHA-256 de lo ya firmado y es un requerimiento aparte.
- **No publica los anexos** que suben las personas (D-2).
- **No lee de SharePoint hacia la aplicación.** Un archivo que alguien deje a mano en la carpeta de una persona no se importa ni se registra: no tiene acta, ni huella, ni trazabilidad, y tratarlo como soporte del SIG sería inventar evidencia.
- **No borra de SharePoint.** La baja lógica de una evidencia (`activo=false`) deja el archivo publicado y anota la baja en `PublicacionSoporte`. Borrar el soporte de una auditoría de certificación es exactamente el artefacto que la auditoría busca.
- **No pre-crea carpetas** para el censo completo (P3).
- **No toca los permisos de la carpeta ni concede acceso a los colaboradores.** La carpeta queda restringida a los responsables y la aplicación es la que da acceso a cada persona a su propio soporte (D-4).
