# Personas y Tareas del SIG — Especificación y diseño

**Fecha:** 2026-08-31
**Código:** REQ-SIG-02
**Versión:** 1.0
**Módulo:** A — Personas e identidad + Motor de tareas del SIG
**Superficies:** «Mi SIG» (bandeja personal) · «Operación» (control operacional, ISO 9001/27001 numeral 8)
**Origen:** pedido del líder del SIG del 31/08/2026
**Antecedentes:** `docs/handoff_v2/requisitos/REQ-SIG-01-requerimiento.txt` · `2026-08-24-sgsi-handoff-v2-design.md`
**Estado:** Aprobado, sin implementar

---

## 1. Contexto y descomposición

El SIG hoy son dos dominios bajo un mismo shell: Indicadores (SGC) y SGSI, este último completo hasta la fase 8 del plan maestro más tres iteraciones. El líder del SIG pidió cuatro dominios nuevos, que se descomponen así:

| | Sub-proyecto | Por qué es una unidad |
|---|---|---|
| **0** | Personas e identidad | Persona ↔ cuenta de AD ↔ cargo ↔ área. Pequeño, pero bloquea a los tres siguientes. |
| **A** | Tareas del SIG: Control operacional §8 + Mi SIG | Un motor con dos vistas: obligación recurrente → instancia con fecha límite → registro de realizado con evidencia. |
| **B** | Mejora: NC y ACPM | Hallazgo → causa raíz → plan → eficacia → cierre. Sus acciones son tareas: consume el motor de A. |
| **C** | Auditorías internas | Programa → plan → lista de verificación → hallazgos → informe. Reusa la primitiva de listas de verificación de A y alimenta a B. |

**Este documento especifica 0 + A**, que se construyen juntos porque A no existe sin la entidad Persona. B y C llevarán cada uno su propia especificación, en ese orden.

### 1.1 Hallazgos del código que condicionan el diseño

Verificados sobre el repositorio antes de diseñar:

1. **No hay personas.** Los responsables son `CargoResponsable`, que es solo un nombre único (`prisma/schema.prisma:210`). No hay correo, ni vínculo con la identidad, ni área.
2. **Los permisos salen de grupos de AD, no de la base** (`lib/sgsi/permisos.ts`). Existen tres roles —SIG-Seguridad, SIG-Propietarios, SIG-Auditoría— y **ninguno para un empleado raso**. El grupo propio de Cuántico, `Responsables SIG`, mapea a SIG-Seguridad.
3. **`SGI_ACCESO_SIN_GRUPO` es un paliativo peligroso**: con él, cualquier cuenta autenticada obtiene un rol completo del SGSI —inventario, riesgos, banderas de datos personales, exposición a Internet— porque sin él nadie entraba.
4. **Ya existe lectura del Directorio** por Microsoft Graph (`lib/sgsi/directorio.ts`: `displayName` + `userPrincipalName`) y **envío de correo** por SMTP (`lib/sgsi/notificaciones.ts`).
5. **La evidencia con anexos ya está resuelta** (`Evidencia` + `EvidenciaArchivo`): versionado, baja lógica y bytes en la base de datos por decisión del 27/08/2026. Su única atadura es que `Evidencia.controlId` es obligatorio.
6. **No existe `Proceso` en la base.** Los procesos del SGC viven en el Excel de SharePoint (`app/lib/excel-parser.ts`).
7. **Regla transversal del proyecto:** los datos se calculan, no se almacenan. `riesgosGlobales()` es la única fuente de riesgos y ninguna matriz está precocinada.

### 1.2 Origen de las obligaciones

Las tareas del SIG **no están consolidadas en ninguna parte**: cada procedimiento define sus actividades y su periodicidad. Este módulo las inventaría por primera vez. No hay, por tanto, una carga inicial desde un archivo como la hubo con el Excel MAGERIT: el inventario se construye capturando obligación por obligación, y el campo `procedimientoOrigen` es el que mantiene la trazabilidad con el documento del que sale cada una.

Verificado contra el repositorio documental del SIG: existe el formato `FOR-CAL-11 Cronograma SGC v1` (16/01/2026), una carta Gantt semanal con estructura PHVA y control Planeado/Ejecutado, **sin diligenciar**. Confirma el diagnóstico y aporta un patrón: la vista de calendario debe distinguir lo planeado de lo ejecutado, no solo la fecha límite.

---

## 2. Alcance

### 2.1 Dentro del alcance

- Entidad **Persona**, espejo de Azure AD por Microsoft Graph, con área, cargo y estado administrados en la aplicación.
- Rol **Colaborador** y retiro del interruptor `SGI_ACCESO_SIN_GRUPO`.
- **Contenidos reutilizables**: capacitación, lectura, lista de verificación y tarea.
- **Programa de obligaciones**: qué contenido, a quién, cada cuánto y con qué plazo.
- Generación automática de **asignaciones** y su ciclo de vida completo, vencimiento incluido.
- **Registro de realizado** diferenciado por tipo, con anexos.
- Pantalla **Mi SIG** y pantallas de **Operación**: obligaciones, calendario, tareas, contenidos y personas.
- Notificaciones por correo, bitácora e indicadores de cumplimiento.
- Reasignación de pendientes cuando una persona se desvincula.

### 2.2 Fuera del alcance

| Qué | Por qué |
|---|---|
| Gestión documental del SIG | No forma parte de este pedido. Una lectura referencia el documento por código, nombre, versión y enlace; su ciclo de vida se administra donde hoy vive. |
| NC/ACPM y auditorías internas | Son los módulos B y C. A deja el gancho: una asignación vencida podrá originar una NC cuando B exista. |
| Motor de exámenes | Una capacitación **registra** el resultado de la evaluación (calificación y aprobado o no). No se construye banco de preguntas ni corrección automática. |
| Firma electrónica | Ya estaba fuera en REQ-SIG-01 §2.2. El acuse queda con usuario, fecha, hora y versión leída. |
| Migrar `AccionPlan` del SGSI | Las acciones del plan de tratamiento siguen donde están. Unificarlas es trabajo del módulo B, cuando exista una segunda fuente de acciones. |
| Acotar los permisos del SGSI por área | `Persona.areaId` lo habilita (ver §6.2), pero aplicarlo al SGSI es una decisión aparte. |

---

## 3. Modelo de datos

Seis entidades nuevas. Rige la regla transversal: **lo derivable se calcula, no se almacena.**

### 3.1 `Persona`

| Campo | Tipo | Nota |
|---|---|---|
| `oid` | `String @unique` | Object id de Azure AD. Identificador estable aunque cambie el correo. |
| `correo` | `String @unique` | UPN. |
| `nombre` | `String` | `displayName` del Directorio. |
| `activa` | `Boolean @default(true)` | Baja lógica. Nunca hay borrado físico. |
| `sincronizadaEn` | `DateTime?` | Última vez que el Directorio confirmó los datos. |
| `areaId` | `Int?` → `Area` | Administrado en la aplicación, no en AD. |
| `cargoId` | `Int?` → `CargoResponsable` | Reusa el catálogo de cargos existente, sin modificarlo. |

**La aplicación no guarda roles.** El rol lo dan los grupos del Directorio, como hoy (`lib/sgsi/permisos.ts` cabecera): es la respuesta que un auditor busca cuando pregunta quién autorizó un permiso. `Persona` guarda área y cargo, que son atributos del SIG, no permisos.

**AD manda** sobre nombre, correo y existencia. **El SIG manda** sobre área, cargo y rol. El `upsert` ocurre al iniciar sesión, y hay una sincronización completa contra Graph a petición del líder, reusando `lib/sgsi/directorio.ts`. Una persona que desaparece del Directorio se marca `activa=false`; no se borra.

### 3.2 `ContenidoSig`

| Campo | Tipo | Nota |
|---|---|---|
| `codigo` | `String @unique` | `CAP-001`, `LEC-003`, `LVE-002`, `TAR-004`. Generado por el sistema, consecutivo por tipo. |
| `tipo` | `enum TipoContenido` | `CAPACITACION` · `LECTURA` · `VERIFICACION` · `TAREA` |
| `titulo`, `descripcion` | `String` | |
| `procedimientoOrigen` | `String?` | Código y nombre del procedimiento del que sale la obligación. Texto, porque no hay gestión documental. |
| `version` | `Int @default(1)` | Sube al editar un contenido ya publicado (regla R10). |
| `activo` | `Boolean @default(true)` | |

Bloques condicionales por tipo, siguiendo el precedente de `AccionPlan`:

- **LECTURA** — `documentoCodigo`, `documentoNombre`, `documentoVersion`, `documentoUrl`.
- **CAPACITACION** — `duracionHoras`, `modalidad`, `exigeEvaluacion`, `notaMinima`.
- **VERIFICACION** — sus ítems en `ItemVerificacion`.
- **TAREA** — sin campos adicionales.

### 3.3 `ItemVerificacion`

`contenidoId`, `orden`, `texto`, `obligatorio`, `permiteNoAplica`. Solo para contenidos de tipo VERIFICACION. Es la primitiva que el módulo C reusará para las listas de auditoría.

### 3.4 `Obligacion`

| Campo | Tipo | Nota |
|---|---|---|
| `contenidoId` | `Int` → `ContenidoSig` | |
| `alcance` | `enum AlcanceObligacion` | `PERSONA` · `CARGO` · `AREA` · `TODOS` |
| `alcancePersonaId` / `alcanceCargoId` / `alcanceAreaId` | `Int?` | Exactamente uno según el alcance; ninguno cuando es `TODOS`, que significa todas las personas activas. |
| `periodicidad` | `enum Periodicidad` | `UNICA` · `DIARIA` · `SEMANAL` · `MENSUAL` · `TRIMESTRAL` · `SEMESTRAL` · `ANUAL` |
| `fechaInicio` | `Date` | Primer periodo. |
| `plazoDias` | `Int` | Días desde la apertura del periodo hasta la fecha límite. |
| `diasAviso` | `Int` | Anticipación del aviso por correo. |
| `notificar` | `Boolean @default(true)` | Interruptor por obligación, para no inundar. |
| `responsableSeguimientoId` | `Int` → `Persona` | Quien recibe el resumen y responde por el cumplimiento. |
| `activa` | `Boolean @default(true)` | |

Es el registro del numeral 8: la lista maestra de obligaciones del SIG.

### 3.5 `Asignacion`

| Campo | Tipo | Nota |
|---|---|---|
| `obligacionId` | `Int?` | Nulo cuando es una asignación puntual, fuera de programa. |
| `contenidoId` | `Int?` | Nulo en una asignación puntual sin contenido reutilizable. Ver la nota de abajo. |
| `titulo`, `descripcion` | `String?` | Obligatorios cuando no hay `contenidoId`; ignorados cuando lo hay. |
| `personaId` | `Int` | |
| `periodo` | `String` | Etiqueta legible del periodo: `2026-T3`, `2026-09`, `2026`. |
| `fechaApertura`, `fechaLimite` | `Date` | |
| `estado` | `enum EstadoAsignacion` | `PENDIENTE` · `REALIZADA` · `NO_APLICA` · `ANULADA` |
| `fechaCierre` | `DateTime?` | |
| `cerradaPor` | `Int?` → `Persona` | Distinto de `personaId` solo en un cierre administrativo. |
| `motivo` | `String?` | Obligatorio en prórroga, anulación, no aplica y cierre administrativo. |

`@@unique([obligacionId, personaId, periodo])` — es lo que hace idempotente la generación.

### 3.6 `RegistroRealizado`

Uno a uno con la asignación cerrada. `fechaHora`, `nota`, más el bloque de su tipo. Quién lo registró **no se repite aquí**: es `Asignacion.cerradaPor`.

- **LECTURA** — `versionLeida` (la versión del documento en el momento del acuse).
- **CAPACITACION** — `asistio`, `calificacion`, `aprobado`.
- **VERIFICACION** — `RespuestaItem[]`: `itemId`, `respuesta` (`CUMPLE` · `NO_CUMPLE` · `NO_APLICA`), `nota`.
- **TAREA** — solo la nota.

Inmutable una vez creado. Corregir es reabrir, y la reapertura conserva el registro anterior (regla R8).

### 3.7 `EnvioNotificacion`

`tipo` (`SEMANAL` · `MENSUAL` · `NUEVA` · `PROXIMIDAD` · `VENCIMIENTO`), `periodo` (`2026-S36`, `2026-09`), `personaId`, `enviadoEn`, `resultado` (`ENVIADO` · `SIN_SMTP` · `FALLO`), `detalle`.

`@@unique([tipo, periodo, personaId])` — es lo que hace idempotente el envío: correr de nuevo el disparador tras una caída no duplica correos, y ante un incumplimiento «no me llegó el aviso» deja de ser una afirmación imposible de verificar.

### 3.8 Tres decisiones explícitas

1. **«Vencida» no es un estado guardado, se calcula.** El estado almacenado es `PENDIENTE`, `REALIZADA`, `NO_APLICA` o `ANULADA`; vencida es `PENDIENTE && fechaLimite < hoy`, y extemporáneo es `fechaCierre > fechaLimite`. No hay proceso nocturno que pueda quedarse atrás y mentir sobre el cumplimiento. Es la misma regla que sostiene `riesgosGlobales()`.
2. **Los anexos reusan la evidencia existente.** `Evidencia.controlId` pasa a opcional y se agrega `registroId` opcional, con la restricción de que exactamente uno esté presente. El módulo hereda versionado, baja lógica y bytes en base sin duplicar código. La alternativa —una tabla espejo— habría duplicado el manejo de archivos.
3. **La generación es idempotente y bajo demanda.** Un solo procedimiento, «generar asignaciones faltantes hasta la fecha X», invocable desde la pantalla o desde una tarea programada, que nunca duplica.

---

## 4. Pantallas

El header de 58 px pasa de dos pestañas a cinco: **Mi SIG · Indicadores · Estratégico · SGSI · Operación** (`app/components/sgsi/EncabezadoSig.tsx`). «Estratégico» la aporta el módulo D. Un Colaborador solo ve la primera; las demás no se renderizan.

### 4.1 Mi SIG (`/mi-sig`)

Una sola pantalla, sin barra lateral. Encabezado con la persona, su área y su cargo, y tres contadores: vencidas, por vencer y realizadas en el periodo. Debajo, la bandeja agrupada en ese orden —vencidas siempre arriba— con las realizadas colapsadas.

Cada tarjeta lleva el tipo, el título, el procedimiento del que sale la obligación y la fecha límite con los días que faltan o que sobran **escritos**, nunca solo en color (paso 43 del plan maestro).

El cierre abre un panel lateral distinto según el tipo:

| Tipo | Panel de cierre |
|---|---|
| LECTURA | Enlace al documento y casilla «declaro haber leído la versión N». Registra usuario, fecha, hora y versión. |
| CAPACITACION | Asistencia, calificación cuando la exige, anexo opcional. |
| VERIFICACION | Los ítems con cumple / no cumple / no aplica y nota. Los obligatorios deben responderse. |
| TAREA | Nota y anexo. |

Un botón exporta el **histórico personal**: todas mis asignaciones con sus registros, que es lo que a una persona le piden en una auditoría.

### 4.2 Operación

Barra lateral de cinco entradas, con el patrón colapsable existente (`OBL`, `CAL`, `TAR`, `CON`, `PER`).

| Pantalla | Qué resuelve |
|---|---|
| **Obligaciones** | La lista maestra del §8: contenido, tipo, procedimiento origen, a quién aplica, periodicidad, plazo, responsable de seguimiento y cumplimiento del último periodo. Filtros por área, procedimiento, tipo, periodicidad y estado. |
| **Calendario** | Mes y semana, con las asignaciones en su fecha límite. Filtros por área, persona, tipo y obligación. Clic en un día abre su lista. |
| **Tareas** | Lista plana de todas las asignaciones, con filtros y acciones masivas: reasignar, prorrogar, anular. |
| **Contenidos** | Alta y edición de contenidos reutilizables y sus ítems de verificación, con el patrón de los catálogos del SGSI. |
| **Personas** | Nombre, correo, área, cargo, rol, estado y última sincronización, con el botón de sincronizar contra el Directorio. Al inactivar a alguien, muestra sus pendientes para reasignar. |

Se mantiene el cross-filtrado tipo Power BI del paso 39: toda tarjeta con dato navega a su pantalla con el filtro puesto.

---

## 5. Reglas de negocio

| # | Regla |
|---|---|
| **R1** | **Generación idempotente.** Se crean las asignaciones de todo periodo ya abierto, hasta un horizonte de 90 días hacia adelante. Única por obligación, persona y periodo: correrla dos veces no duplica nada. Una obligación de periodicidad `UNICA` genera un solo periodo, etiquetado con su fecha de inicio. |
| **R2** | **El alcance se resuelve al generar, no al definir.** Una obligación dirigida a un cargo o a un área alcanza a quien lo ocupe en ese momento. Quien ingrese después recibe los periodos siguientes, nunca los pasados. |
| **R3** | **La vencida sigue viva.** Sigue exigible hasta que se cierre, y el periodo siguiente nace igual. Se puede cerrar tarde; que fue extemporáneo se deduce de las fechas, no se captura. |
| **R4** | **El cierre se valida en el servidor.** Ítems obligatorios de una verificación, acuse de una lectura, nota mínima de una capacitación. La interfaz ayuda; no es la que decide. |
| **R5** | **Cierre propio, con excepción administrativa.** La persona asignada cierra lo suyo. Un miembro de `Responsables SIG` es administrador y puede cerrar cualquier asignación: exige motivo, guarda `cerradaPor ≠ personaId`, queda marcado como **cierre administrativo** —visible en la bandeja de la persona y señalado en las exportaciones— y se contabiliza en un indicador propio, separado del cumplimiento normal. Reasignar, prorrogar y anular también son suyos. **Advertencia registrada:** usado de rutina, el cierre administrativo vacía el valor probatorio del registro, porque el auditor pregunta quién hizo la tarea, no quién la marcó. Por eso se distingue y se cuenta aparte. |
| **R6** | **Prorrogar deja huella.** Cambia la fecha límite con motivo obligatorio y valor anterior en bitácora. El hecho de haber prorrogado no desaparece. |
| **R7** | **Anular y «no aplica» exigen motivo.** Nunca hay borrado físico, coherente con REQ-SIG-01 §7. |
| **R8** | **Reabrir no sobrescribe.** El registro anterior se conserva y se crea uno nuevo. |
| **R9** | **Desvinculación no cierra nada.** Al inactivar a una persona, sus asignaciones abiertas van a un panel de reasignación. No se cierran solas ni se borran. |
| **R10** | **Editar un contenido publicado sube su versión,** y los registros ya cerrados conservan la versión que se realizó. Sin esto, un acuse de lectura no es verificable. |
| **R11** | **Desactivar una obligación** deja de generar periodos nuevos y no toca los ya generados. |

---

## 6. Roles y permisos

Permisos nuevos: `misig:ver` (siempre sobre lo propio), `operacion:ver`, `operacion:escribir`, `operacion:administrar`.

| Rol · grupo de AD | Mi SIG | Operación | Personas | Cierre administrativo |
|---|---|---|---|---|
| **Colaborador** — toda cuenta autenticada del tenant | sus asignaciones | — | — | — |
| **Responsables SIG** → SIG-Seguridad | las suyas | lectura y escritura total | administra y sincroniza | **sí**, con motivo |
| **SIG-Propietarios** | las suyas | lectura acotada a su área | — | no |
| **SIG-Auditoría** | las suyas | lectura total y bitácora | lectura | no |

### 6.1 Retiro de `SGI_ACCESO_SIN_GRUPO`

El interruptor existía porque sin grupo reconocido no se entraba a ninguna parte. Con Colaborador como piso deja de tener razón de ser, y se retira junto con su alias `SGI_ROL_POR_DEFECTO`, actualizando `.env.example` y el comentario de cabecera de `lib/sgsi/permisos.ts`.

### 6.2 Limitación que este módulo habilita cerrar

`lib/sgsi/permisos.ts:65-71` documenta que los permisos de propietario son de toda la organización porque no existe mapa entre una identidad de AD y un área. `Persona.areaId` es ese mapa. Acotar con él los permisos del SGSI queda habilitado y **fuera de esta especificación**.

---

## 7. Notificaciones, bitácora e indicadores

### 7.1 Correos

Por SMTP, reusando `lib/sgsi/notificaciones.ts`. Sin SMTP configurado la función devuelve `{ configurado: false }` y el llamador lo registra; no falla en silencio.

**Avisos por asignación**, con el interruptor `notificar` de la obligación: asignación nueva, aviso de proximidad según `diasAviso`, y aviso de vencimiento.

**Resumen semanal · lunes.** Dos destinatarios distintos, con contenidos distintos:

| Destinatario | Contenido |
|---|---|
| Cada persona con pendientes | Sus asignaciones **vencidas**, con la antigüedad de cada una, y las que vencen **esta semana**. Ordenadas por fecha límite. Un enlace directo a Mi SIG. |
| Cada `responsableSeguimiento` de una obligación | El estado de **las obligaciones que él responde**: cuántas asignaciones abiertas, cuántas vencidas y de quién. No las tareas propias — eso va en el correo anterior. |

**Resumen mensual · primer día hábil.** Al líder del SIG y a cada líder de proceso, acotado a su área: cumplimiento del mes que cerró, deuda vencida con la antigüedad de la más vieja, las obligaciones con peor cumplimiento, los cierres administrativos del mes, y lo que vence el mes entrante.

### 7.2 Reglas de los resúmenes

| # | Regla |
|---|---|
| **N1** | **Sin nada que decir, no se envía.** Cero pendientes y cero vencidos significa que no sale correo. Un correo semanal que dice «no tienes nada» enseña a ignorar el correo semanal. |
| **N2** | **Un correo por persona, agrupado.** Nunca uno por tarea. Diez pendientes son diez líneas de un mismo correo. |
| **N3** | **Idempotencia por periodo y destinatario.** Un envío por semana o por mes y por persona, registrado en `EnvioNotificacion` (`tipo`, `periodo`, `personaId`, `enviadoEn`, `resultado`). Un reintento tras un fallo de SMTP no duplica lo ya enviado. |
| **N4** | **Queda registro de que se avisó.** El envío se registra aunque falle, con su detalle. Ante un incumplimiento, «no me llegó el aviso» es una afirmación verificable. |
| **N5** | **Interruptores en tres niveles**: global por variable de entorno, por obligación (`notificar`) y por persona (quien no quiera el semanal puede apagarlo; el mensual del líder no se apaga). |
| **N6** | **Zona horaria `America/Bogotá`** y hora de envío parametrizable. El día del semanal y el del mensual también. |
| **N7** | **El disparo es idempotente y recuperable.** Igual que la generación de asignaciones: un procedimiento «enviar los resúmenes pendientes hasta hoy» que se puede correr de nuevo si el servidor estuvo caído, sin duplicar.

**Bitácora** reusando `lib/sgsi/bitacora.ts`: alta, edición y desactivación de contenidos y obligaciones; cada corrida de generación con su conteo; prórroga, reasignación, anulación, cierre administrativo y reapertura; cambio de área, cargo o rol de una persona; y cada sincronización con el Directorio. Con autor, fecha, valor anterior y motivo.

**Indicadores**, todos calculados:

- Cumplimiento del periodo: realizadas a tiempo sobre asignadas.
- Cumplimiento por área, por procedimiento y por tipo de contenido.
- Deuda vencida: cantidad y antigüedad de la más vieja.
- Cobertura de capacitación vigente: personas al día sobre personas alcanzadas.
- Cierres administrativos, como contador separado.

Alimentan la pantalla de Operación y la tarjeta del SIG en el tablero de Indicadores.

---

## 8. Pruebas

Pruebas unitarias siguiendo el patrón de `lib/sgsi/__tests__`:

- Idempotencia de la generación.
- Resolución del alcance por cargo y por área, con altas y bajas.
- Frontera del día en `America/Bogotá` para vencida y extemporáneo.
- Validaciones de cierre por cada tipo de contenido.
- Permisos: un colaborador no ve lo ajeno, auditoría no escribe, y el cierre administrativo exige el grupo y el motivo.

---

## 9. Criterios de aceptación

| Criterio | Verificación |
|---|---|
| Inventario | Las obligaciones de los procedimientos quedan registradas y aparecen en la lista y en el calendario. |
| Idempotencia | Tres corridas seguidas de la generación no crean una asignación de más. |
| Rotación | Un ingreso nuevo recibe el periodo siguiente y ninguno pasado; una baja deja sus pendientes listados para reasignar. |
| Evidencia | Un acuse guarda usuario, fecha, hora y versión leída; subir una versión nueva del documento no altera el acuse anterior. |
| Deuda | Una asignación vencida sigue abierta mientras el periodo siguiente ya existe. |
| Cierre administrativo | Queda marcado, con motivo, visible para la persona y contado aparte del cumplimiento. |
| Acceso | Una cuenta sin ningún grupo del SIG entra, ve Mi SIG y no alcanza ninguna pantalla del SGSI, comprobado por llamada directa a la API y no solo en la interfaz. |
| Rendimiento | Bandeja y calendario por debajo de dos segundos con 200 personas y doce meses de asignaciones. |
| Resumen semanal | Una persona con dos vencidas y una por vencer recibe **un** correo con las tres, ordenadas por fecha límite; una persona sin pendientes no recibe ninguno. |
| Idempotencia del envío | Correr el disparador dos veces en la misma semana no envía el resumen dos veces, y el segundo intento queda registrado como ya enviado. |
| Registro del aviso | Un envío fallido por SMTP caído queda en `EnvioNotificacion` con resultado `FALLO` y su detalle, no se pierde. |
| Resumen mensual | El líder de un proceso recibe el cumplimiento **de su área**, no el de toda la organización. |

---

## 10. Qué sigue

1. Plan de implementación de este módulo (skill `writing-plans`).
2. Módulo **B — Mejora: NC y ACPM** (`2026-08-31-sig-mejora-nc-acpm-design.md`), que consume el motor de tareas de este módulo.
3. Módulo **D — Gestión estratégica** (`2026-08-31-sig-gestion-estrategica-design.md`): partes interesadas, requisitos legales, y riesgos y oportunidades organizacionales.
4. Módulo **C — Auditorías internas** (`2026-08-31-sig-auditorias-internas-design.md`), que alimenta a B. Nota: C **no** reusa `ItemVerificacion` — su lista de verificación es la matriz proceso × numeral de la norma, con su propio catálogo de requisitos normativos.
