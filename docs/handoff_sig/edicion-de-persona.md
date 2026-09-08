# Requerimiento · Editar una persona desde la pantalla de Personas

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-15 · edición de persona y pertenencias |
| **Versión** | 1.1 |
| **Fecha** | 2026-09-08 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo (ejecución asistida con Claude Code) |
| **Extiende** | REQ-SIG-01 (censo y sincronización) · REQ-SIG-09 (gestión de colaboradores) · el motor de tareas de `lib/sig/generacion.ts` |
| **Estado** | **Listo para construir.** Las cinco decisiones que esperaban confirmación las resolvió el líder del SIG el 2026-09-08 y están registradas con su respuesta en §9: D-2 (las licencias ya se leen con el consentimiento vigente), D-5 (ninguna tarea nace vencida), D-7 (una sola registración de aplicación), D-9 (el módulo es del grupo de responsables) y D-10 (Todos no se desmarca). D-4 sigue fuera de alcance por diseño. |

---

## 1 · Objetivo

Que desde la tabla de Personas se pueda abrir a una persona en un popup y **decir a qué área, a qué cargo y a qué grupos de interés pertenece** —y que al guardar la aplicación diga, con un número, cuántas tareas le quedaron asignadas por esa pertenencia.

El popup lleva además las licencias que la persona tiene en el tenant, sus datos de contacto con los contactos de emergencia, y el botón que bloquea su cuenta en el Directorio Activo.

Los grupos de interés son lo que permite dirigir una obligación a un conjunto de gente que no coincide con un área ni con un cargo. Los dos casos que lo motivan:

| Contenido | Grupo de interés | Hoy se puede expresar? |
|---|---|---|
| Curso de concienciación en seguridad | **Todos** | Sí, con el alcance `TODOS` |
| Codificación segura | **Desarrolladores** | **No.** Hay que nombrar a las personas una por una, y quien entre después no la recibe |

**No es cosmética. Es la pieza que le falta al motor de tareas.**

---

## 2 · El estado real de la pantalla hoy

`Persona.areaId` y `Persona.cargoId` existen en el esquema desde REQ-SIG-01. El generador ya los usa: `lib/sig/generacion.ts:150-151` resuelve el alcance `AREA` con `p.areaId === obligacion.alcanceAreaId` y el alcance `CARGO` con `p.cargoId === obligacion.alcanceCargoId`.

**Y no hay un solo camino de escritura en toda la aplicación.** Buscar `areaId` en `app/` devuelve lecturas, filtros de tablero, alcances de obligación y un `areaId: 1` sembrado en semillas — ninguna asignación a una persona. La ficha del colaborador (`app/sig/colaboradores/[id]/Ficha.client.tsx:35-36`) **muestra** `area` y `cargo`; nadie los escribe.

Por eso las 90 filas del censo muestran «—» en las dos columnas. Y por eso:

> **Toda obligación con alcance `AREA` o con alcance `CARGO` genera exactamente cero asignaciones hoy, y no lo dice.**

No las rechaza —`resolverAlcance` devuelve lista vacía y `planificarGeneracion` hace `continue` sin registrar rechazo (`generacion.ts:288`)—, así que en la pantalla de obligaciones una obligación por área se ve idéntica a una que ya está al día. El alcance por activo tiene la misma dependencia: el propietario de un activo es un **cargo**, y los destinatarios son «quienes lo ocupan» (`generacion.ts:189-193`); sin cargos asignados, esas obligaciones caen todas en el responsable de seguimiento como faltante de propietario.

Un requerimiento que solo agregara un formulario de teléfonos sería trabajo perdido. Lo que este popup habilita es la generación de tareas por pertenencia, que es el corazón del sistema.

**Lo que ya existe y se reusa** (no se construye de nuevo):

| Pieza | Dónde | Para qué en este requerimiento |
|---|---|---|
| Cáscara de popup | `app/components/sgsi/Popup.tsx` | Overlay, Escape, foco de vuelta, cuerpo con scroll a 61vh. Ya resuelto |
| Panel de persona | `Personas.client.tsx` (estado `elegida`) | La fila ya es un botón y ya abre un panel. **Este requerimiento lo convierte en el popup**, no agrega un segundo camino |
| Reasignar pendientes | `app/sig/acciones/tareas.ts:498` | La carga de quien se bloquea o cambia de área |
| Previsión antes de guardar | `lib/sig/prevision.ts` | «esto es lo que va a generar», ya escrito para Nueva obligación |
| Clasificación de fallos de Graph | `lib/sgsi/graph-fallo.ts` | Que la pestaña de licencias diga qué permiso falta en vez de «error» |
| Bitácora | `lib/sgsi/bitacora.ts` | Todo cambio con anterior, nuevo y motivo |

---

## 3 · El popup

Se abre al hacer clic en la fila —que ya es un botón— y reemplaza al panel de reasignación actual, que pasa a ser el pie de la pestaña de datos base. Ancho 760 px. Cabecera con el nombre, el correo y el chip de rol; ninguno de los tres es editable (D-1).

**P1 · las pestañas son navegación de teclado real.** `role="tablist"` / `role="tab"` / `role="tabpanel"`, flechas para moverse, `aria-selected`. Hoy no hay componente de pestañas en el proyecto —los chips de Activas/Inactivas/Todas son botones con estado— así que se crea `app/components/sgsi/Pestanas.tsx` y se usa desde ahí, no en línea dentro del popup: la cuarta copia siempre deriva.

**P2 · el popup entero exige `personas:administrar`.** Es lo que ya guarda el botón de sincronizar (`app/sig/personas/page.tsx:20`). Sin el permiso, la fila abre un popup de **solo lectura**: el censo es visible para quien entra a la pantalla, pero nada de lo que hay dentro se puede cambiar. Un popup que se abre y no guarda es mejor que un botón que desaparece sin explicación.

### 3.1 · Datos base

| Campo | Origen | Editable |
|---|---|---|
| Nombre | Directorio | **No** (D-1) |
| Correo corporativo | Directorio | **No** (D-1) |
| Área | SIG | **Sí** — `select` de `Area` activas, ordenadas por `orden` |
| Cargo | SIG | **Sí** — `select` de `CargoResponsable` activos |
| Documento de identidad, tipo de contrato, tipo de colaborador, fecha de ingreso | SIG (REQ-SIG-09) | **Sí** — ya están en el esquema y hoy tampoco tienen dónde escribirse |

**P3 · debajo de los dos `select`, la previsión.** Antes de guardar, el popup dice cuántas tareas produciría el cambio, con su desglose por origen. El desglose es obligatorio y no un adorno: **el cargo arrastra los activos**. Una persona a la que se le pone un cargo que es propietario de 40 activos, con una obligación anual de revisión de accesos por tipo de activo, recibe 40 asignaciones. Un número pelado de «40» sin decir de dónde sale hace que alguien lo lea como un error y no guarde.

```
Al guardar se le asignarán 47 tareas
  · 6 por el área Tecnología
  · 1 por el cargo Coordinador de Infraestructura
  · 40 por los activos cuyo propietario es ese cargo
```

**P4 · quitar o cambiar el área no retira las tareas ya asignadas, y el popup lo dice.** Una asignación puede tener un registro de realizado detrás, así que no se borra nunca (es la misma razón por la que R9 reasigna en vez de cerrar). Al cambiar el área, el popup lista los pendientes que venían de obligaciones del área anterior y ofrece **reasignar** (`reasignarPendientesDe`) o **anular con motivo** (`anularAsignacion`). Si no se hace ninguna de las dos, quedan donde están y el mensaje de guardado lo dice: «quedaron 6 pendientes del área anterior». Callarlo dejaría a alguien respondiendo por un área a la que ya no pertenece, que es justo el hallazgo que un auditor levanta.

### 3.2 · Licencias

**No hace falta pedirle nada a Azure: el consentimiento vigente ya alcanza para las dos consultas.** Se comprobó contra el tenant el 2026-09-08 (D-2). El requerimiento **no pide permisos nuevos para esta pestaña**, y eso importa: pedir un permiso que ya está concedido manda a alguien a buscar en el portal de Azure un problema que no existe.

Dos listas, una al lado de la otra:

| Lista | Consulta | Qué trae |
|---|---|---|
| **Lo que esta persona tiene** | `GET /users/{oid}/licenseDetails` | Una entrada por licencia, con `skuPartNumber` y el detalle de `servicePlans` — qué servicios de esa licencia están habilitados y cuáles no |
| **Lo que el tenant tiene** | `GET /subscribedSkus` | `skuPartNumber`, `prepaidUnits.enabled` y `consumedUnits`: «12 de 25 en uso · 13 libres» |

**P5 · se prefiere `licenseDetails` a `assignedLicenses`.** Los dos responden «qué licencia tiene», y `assignedLicenses` viene gratis en el objeto del usuario, pero devuelve **solo `skuId` en forma de GUID** y una lista de planes deshabilitados, también en GUID. `licenseDetails` devuelve el `skuPartNumber` y los nombres de los planes de servicio. La diferencia práctica es entre una pantalla que dice `SPE_E3` y una que dice `6fd2c87f-b296-42f0-b197-1e91e994b900`, y entre resolver los GUID en el código —una tabla que envejece en silencio— o no tener que resolverlos.

**P6 · el nombre comercial del SKU no se inventa en el código.** Ni `SPE_E3` ni `ENTERPRISEPACK` le dicen nada a quien abre el popup. El nombre legible («Microsoft 365 E3») entra como **dato parametrizable**, con el mismo criterio que el resto del módulo de parámetros, sembrado con los SKU que Cuántico tiene hoy y editable sin despliegue. Un `Record<string, string>` en el fuente obliga a desplegar el día que la organización compre un producto nuevo, y hasta ese día la pantalla muestra el código crudo. **Y el código crudo se sigue mostrando junto al nombre**: es lo que hay que teclear en el portal, y es la única forma de reconocer un SKU que todavía no está parametrizado.

**P7 · la pestaña LEE y no escribe** (D-2). Asignar y quitar licencias se sigue haciendo en el portal de Microsoft. Lo que aporta sin escribir nada es lo que hoy no existe en ninguna parte:

- El **inventario de software por persona**, que A.5.9 pide y que hoy no se puede armar sin entrar al portal cuenta por cuenta.
- El cruce **licencia activa en cuenta bloqueada o inactiva**: plata quemada, y a la vez el indicio de una cuenta que debía estar cerrada y sigue ocupando un puesto. Es el cruce que la aplicación puede hacer y el portal no, porque el portal no sabe quién salió de la organización.
- Quién **no tiene licencia y sí tiene tareas**: alguien a quien se le está exigiendo algo que no puede cumplir.

**P8 · si una de las dos consultas falla, la pestaña dice cuál y por qué, y muestra la otra.** Son dos llamadas independientes y se tratan como tales: `clasificarRecurso` y `explicarFallo` ya redactan la frase con el recurso y el permiso, y `graph-fallo.ts` ya distingue credencial vencida de permiso faltante de falta de red. Sin el inventario del tenant, la lista de la persona sigue siendo útil; degradar las dos porque una falló pierde información que sí se tiene. **Una lista vacía y un 403 no se ven igual nunca.**

### 3.3 · Contactos

`direccion`, `ciudad`, `telefono` y `correoPersonal` **ya existen** en `Persona` (REQ-SIG-09) y tampoco tienen hoy dónde escribirse. Lo único nuevo son los contactos de emergencia, y van en tabla propia (§4.1).

**P9 · el contacto de emergencia es dato personal de un tercero que nunca autorizó nada.** Es la madre, la pareja o el hermano de un colaborador: no firmó autorización de tratamiento, no está en el censo y no tiene relación con la organización. Eso obliga a tres cosas, y no son opinables (Ley 1581, A.5.34):

1. Entra al inventario de tratamientos como finalidad propia —«atención de emergencias del personal»— usando `TratamientoDatosPersonales`, que ya existe. Un dato personal que no está en el RAT es un hallazgo.
2. Se recoge lo mínimo: nombre, parentesco y teléfono. Nada más. No hay campo de correo, ni de dirección, ni de documento: para llamar en una emergencia no se necesitan.
3. Solo lo ve quien tiene `personas:administrar`. No aparece en la ficha que la propia persona ve en Mi SIG ni en ninguna exportación del censo.

### 3.4 · Grupos de interés

Casillas —no un `select`: **una persona pertenece a varios a la vez**. Arrancan dos grupos, y la pestaña está hecha para que el tercero sea una fila de datos y no un despliegue:

| Grupo | Código | Quién está | Para qué |
|---|---|---|---|
| **Todos** | `TODOS` | Toda persona activa, por construcción (P10) | Concienciación en seguridad, políticas de obligada lectura |
| **Desarrolladores** | `DESARROLLADORES` | Se marca a mano | Codificación segura y el resto de las obligaciones de desarrollo seguro de REQ-SIG-08 (PRO-TEC-04 y sus puertas, `lib/sig/desarrollo.ts`) |

**P10 · «Todos» no se guarda como membresía: se resuelve.** El grupo lleva la marca `derivado = true` y su pertenencia es «toda persona con `activa = true`», calculada al generar. La casilla se dibuja marcada y deshabilitada, con la frase de por qué.

Es la diferencia entre que el requisito «por defecto una persona está en Todos» sea **una promesa** o sea **un hecho**. Con filas de membresía, la promesa se cumple mientras nadie se olvide de crear la fila: el alta de una persona nueva por sincronización, una transacción que falló a mitad, una migración que corrió antes de que existiera el grupo — y el resultado de cualquiera de las tres es una persona que **no recibe el curso de concienciación y no aparece en ninguna lista de faltantes**, porque para el sistema simplemente no pertenece. Derivado, ese estado no se puede alcanzar.

Y evita la otra mitad del problema: `AlcanceObligacion` ya tiene el valor `TODOS`, que significa exactamente «toda persona activa» (`generacion.ts:153`). Dos formas de decir lo mismo divergen — es lo que este mismo proyecto ya documentó con «Líderes SIG» y «Lideres SIG» coexistiendo en producción (`schema.prisma:222-235`).

**P11 · por eso el selector de obligaciones guarda `TODOS` cuando el grupo elegido es Todos.** La pantalla ofrece una sola opción, «Un grupo de interés», con la lista de grupos; si se elige Todos, la obligación se guarda con `alcance: 'TODOS'` y sin `alcanceGrupoInteresId`. Si se elige cualquier otro, con `alcance: 'GRUPO_INTERES'` y su id. Consecuencias, todas buenas: en la base sigue habiendo **una** representación de «todo el mundo», las obligaciones que ya usan `TODOS` no se migran, y el día que se agregue un grupo derivado más (`ACTIVOS_CON_PORTATIL`, por ejemplo) el patrón ya está.

**P12 · un grupo de interés NO otorga ningún permiso.** Es pertenencia de gestión: sirve para dirigir obligaciones y para reportar. El acceso a la aplicación lo siguen dando —solo— los grupos del Directorio (`lib/sgsi/permisos.ts`). Si un grupo administrado dentro del SIG pudiera otorgar acceso, habría dos fuentes de autorización y la pregunta «quién autorizó este permiso» dejaría de tener respuesta en Azure, que es exactamente la propiedad que `permisos.ts:1-6` está construido para conservar. El popup lo dice en una línea bajo el título de la pestaña.

**P13 · marcar un grupo tiene la misma consecuencia que cambiar de área**: previsión antes de guardar, conteo real al guardar, y al desmarcar, los pendientes de ese grupo se listan y no se borran (P4). Marcar Desarrolladores a alguien en septiembre no le cobra el curso de codificación segura del primer trimestre: rige el piso de pertenencia (P16), que para un grupo es `MiembroGrupoInteres.desde`.

---

## 4 · Modelo de datos

### 4.1 `ContactoEmergencia` (nueva)

| Campo | Tipo | Nota |
|---|---|---|
| `id` | `Int @id` | |
| `personaId` | `Int` → `Persona` | |
| `nombre` | `String` | |
| `parentesco` | `String` | Texto libre: la lista cerrada de parentescos siempre le queda corta a alguien |
| `telefono` | `String` | |
| `orden` | `Int @default(1)` | A quién se llama primero |

`@@index([personaId])`. Tabla y no dos columnas en `Persona`: casi todo el mundo da dos contactos, y con columnas el segundo se llama `contacto2_nombre` y el tercero no cabe.

### 4.2 `GrupoInteres` y `MiembroGrupoInteres` (nuevas)

`GrupoInteres`:

| Campo | Tipo | Nota |
|---|---|---|
| `id` | `Int @id` | |
| `codigo` | `String @unique` | `TODOS`, `DESARROLLADORES` |
| `nombre` | `String` | Lo que se ve en la casilla y en el selector de obligaciones |
| `descripcion` | `String?` | Qué clase de obligación le corresponde. Se muestra bajo la casilla |
| `derivado` | `Boolean @default(false)` | **P10.** `true` en Todos: la pertenencia se calcula, no se guarda, y la casilla va marcada y deshabilitada |
| `activo` | `Boolean @default(true)` | |
| `orden` | `Int` | |

La migración siembra los dos: `TODOS` con `derivado = true` y `DESARROLLADORES` con `derivado = false` y sin miembros. Nadie queda en Desarrolladores hasta que alguien lo marque — poblarlo adivinando por cargo o por área sería inventar una pertenencia que después nadie sabe de dónde salió.

`MiembroGrupoInteres`: `id`, `grupoId`, `personaId`, `desde @db.Date`, `hasta @db.Date?`, `@@unique([grupoId, personaId])`, `@@index([personaId])`.

`hasta` en vez de borrar la fila: quién estaba en Desarrolladores en marzo es una pregunta de auditoría, y una fila borrada no la contesta. La membresía **vigente** es `hasta IS NULL`, y es la única que el generador mira.

**Un grupo derivado nunca tiene filas en esta tabla.** La acción de guardar lo rechaza en vez de crearlas: si Todos tuviera además filas, habría dos respuestas a «quién pertenece» y ganaría la que consulte cada pantalla.

### 4.3 Se agrega a `Persona`

| Campo | Tipo | Nota |
|---|---|---|
| `areaDesde` | `DateTime? @db.Date` | Desde cuándo pertenece al área. Lo usa el piso de periodos (§5) |
| `cargoDesde` | `DateTime? @db.Date` | Ídem para el cargo |

**Por qué se guarda una fecha que la bitácora parece contener ya.** No es lo mismo. La bitácora registra **cuándo se digitó el cambio**; `areaDesde` es **desde cuándo la persona pertenece al área**, que es una declaración de quien administra y que normalmente es anterior (el traslado fue el 1.º, se registró el 15). Generar tareas contra la fecha de digitación le regalaría o le cobraría periodos a la persona según la diligencia de quien escribe en el sistema. Es el mismo criterio por el que `retiradoEn` es una fecha y no un booleano (`schema.prisma:1046-1053`).

### 4.4 Alcance por grupo de interés en las obligaciones

- `AlcanceObligacion` suma el valor **`GRUPO_INTERES`**. El nombre completo y no `GRUPO`: en este dominio «grupo» a secas ya significa grupo del Directorio, que es lo que otorga permisos (`permisos.ts`), y son dos cosas que no se pueden confundir en una revisión de accesos.
- `Obligacion` suma `alcanceGrupoInteresId Int?` → `GrupoInteres`.
- `resolverAlcance` (`generacion.ts:145`) y `personasAlcanzadas` (`prevision.ts:101`) lo resuelven **los dos**. Son una duplicación consciente y declarada (`prevision.ts:10-13`), así que la prueba que ya compara previsión contra generación cubre también el alcance nuevo. El `switch` de `prevision.ts` es exhaustivo contra el enum importado de Prisma —lo dice `prevision.ts:26-33`— así que agregar el valor al enum **rompe la compilación** hasta que se resuelva en ambos lados. Eso es deseado: es lo que evita que un alcance nuevo devuelva cero en silencio, como le pasó a `NIVEL_ACTIVO`.
- El selector de `NuevaObligacion.tsx:69` ofrece **«Un grupo de interés · quienes pertenezcan a él»** con la lista de grupos activos, y aplica P11: elegir Todos guarda `alcance: 'TODOS'`.
- **La opción suelta «Todas las personas» sale del selector.** No se borra el valor del enum —lo usan las obligaciones que ya existen y es lo que se guarda al elegir Todos— pero deja de ofrecerse como una opción aparte. Dos entradas en la misma lista que producen exactamente el mismo conjunto es cómo alguien crea la obligación dos veces.

Con esto, los dos casos del §1 quedan así:

| Contenido | Alcance | Guardado |
|---|---|---|
| Curso de concienciación en seguridad | Grupo de interés → Todos | `alcance: 'TODOS'` |
| Codificación segura | Grupo de interés → Desarrolladores | `alcance: 'GRUPO_INTERES'`, `alcanceGrupoInteresId: <id>` |

---

## 5 · «Al guardar se informa el número de tareas asignadas»

### 5.1 · El número es un hecho, no una previsión

**P14 · guardar la pertenencia y generar las asignaciones ocurren en la MISMA transacción**, con la bitácora adentro. Nada de esto sale a la red, así que la regla P10 de REQ-SIG-13 —ninguna llamada a Graph dentro de una transacción de Prisma— no se viola. Si se guardara primero y se generara después, existiría el estado «tiene el área pero no las tareas», y ese estado es indistinguible de «el área no genera nada» — que es precisamente el problema que este requerimiento viene a cerrar.

**P15 · se genera solo para esa persona, reusando el núcleo puro.** `planificarGeneracion` recibe un arreglo de personas: se le pasa una. No se corre `correrTrabajo('generar-asignaciones')`, que generaría para todo el censo y devolvería un total en el que las tareas de esta persona quedan sumadas con las de los demás. El número que el popup informa tiene que ser **el de esta persona**, o no sirve para nada.

El mensaje lleva la lista, no solo el conteo, con el mismo tratamiento que ya tiene el panel de reasignación: código, título y fecha límite. «Se asignaron 47 tareas» sin decir cuáles obliga a salir de la pantalla para saber qué se acaba de crear.

### 5.2 · Ninguna tarea nace vencida

**La tarea es de la persona, así que su reloj empieza cuando la persona la recibe** — no cuando el calendario abrió el periodo, ni cuando la obligación se escribió. Es la regla que decidió el líder del SIG (D-5) y es también la que el código ya declara y no cumple.

`generacion.ts:132-133` dice:

> «Quienes debe alcanzar una obligación, resuelto HOY (R2): quien ingrese después recibe los periodos siguientes, **nunca los pasados**.»

**El código no la cumple.** `resolverAlcance` sí resuelve el *quién* hoy, pero los *periodos* los produce `periodosHasta`, que arranca en `obligacion.fechaInicio` y camina hasta `hoy + horizonteDias` (`periodos.ts:137-149`), sin piso por persona; y la fecha límite es siempre `apertura del periodo + plazoDias` (`periodos.ts:124-125`), sin mirar desde cuándo la persona está sujeta a ella. Los tres casos que hoy producen una tarea nacida vencida:

| Caso | Qué pasa hoy |
|---|---|
| **Persona nueva** en la organización | Una obligación mensual iniciada en enero le crea **nueve periodos vencidos** el día que entra |
| **Pertenencia nueva** (área, cargo o grupo de interés) | Lo mismo, contado desde el inicio de la obligación y no desde el traslado |
| **Obligación nueva** con fecha de inicio anterior a hoy | Le crea a **todo el mundo** los periodos ya transcurridos, todos vencidos |
| **Anclaje flotante** | El primer ciclo abre en `obligacion.fechaInicio`, con la fecha límite ya cumplida (`periodoFlotante`) |

Nada de esto lo introduce este requerimiento: **ya le pasa a cada persona nueva que entra por la sincronización**, para toda obligación de alcance `TODOS`. Lo que el requerimiento hace es volverlo imposible de ignorar, porque ahora hay un popup que imprime el número en la cara de quien guarda.

**P16 · el piso.** `PersonaGenerable` suma `desde: Date` y `ObligacionGenerable` suma `creadaEn`. El piso de una asignación es el más tardío de tres instantes, porque no se puede exigir algo antes de que exista quien lo debe, la pertenencia que lo obliga, o la obligación misma:

```
piso = max(
  obligacion.creadaEn,                      // la obligación no existía antes
  persona.fechaIngreso ?? persona.creadaEn,  // la persona no era colaboradora antes
  areaDesde | cargoDesde | miembro.desde     // no pertenecía antes (según el alcance)
)
```

`Obligacion.creadaEn` ya está en el esquema (`schema.prisma:1315`). Para el alcance `TODOS` —y por lo tanto para el grupo derivado Todos— el tercer término no aplica: la pertenencia no tiene principio distinto del ingreso.

**P17 · el piso no solo salta periodos: corre la fecha.** Dos efectos, y el segundo es el que cumple lo pedido:

1. **Un periodo cuya ventana entera terminó antes del piso no se genera.** Los nueve meses de enero a agosto no existen para quien llega en septiembre.
2. **El periodo en curso se genera con el plazo completo contado desde el piso:**

```
fechaApertura = max(apertura del periodo, piso)
fechaLimite   = fechaApertura + plazoDias
```

Sin el punto 2 la regla quedaría a medias, y de la peor manera: una obligación mensual con plazo de 15 días, a alguien que entra el día 28, le crearía la tarea del mes en curso con fecha límite el día 16 — **vencida el mismo instante en que se crea**. Con el punto 2, esa persona tiene sus 15 días.

**P18 · la etiqueta del periodo NO cambia, y esto es lo que sostiene la idempotencia.** `fechaApertura` se corre; `periodo` sigue siendo `2026-09`, la del calendario. La llave única es `@@unique([obligacionId, personaId, periodo, activoId])` (`schema.prisma:1376`): si la etiqueta llevara la fecha de ingreso, el cron crearía **una segunda fila para el mismo periodo** y se perdería la garantía T1 que permite reintentar sin miedo.

**Consecuencia que hay que aceptar y decir en voz alta:** dos personas pueden tener el mismo periodo de la misma obligación con **fechas límite distintas**. Es correcto —el plazo es de la tarea de cada uno, no del calendario— y no obliga a cambiar ninguna pantalla: `esVencida` ya se calcula contra el `fechaLimite` de cada asignación (`lib/sig/cierre.ts`), y `prorrogarAsignacion` ya mueve la fecha de una asignación individual desde antes de este requerimiento (`tareas.ts:337-376`). Lo que sí hay que hacer es que la ficha diga «tiene plazo hasta el 12 porque entró al área el 28», o alguien va a reportar las dos fechas como un defecto.

**El mismo piso rige para el cron.** No es una regla del popup: si el popup se negara a crear los periodos pasados y el trabajo de las 05:00 los creara igual, el número informado al guardar sería falso doce horas después. Una sola regla, en el módulo puro, para los dos disparos.

**Y el histórico no se toca.** Las asignaciones vencidas que ya existen por este defecto siguen existiendo, porque cada una puede tener un registro de realizado detrás. Lo que cambia es que no se crean nuevas. Limpiar lo anterior es un requerimiento aparte, con su propia decisión sobre lo ya cerrado.

---

## 6 · Bloquear usuario en el Directorio

Es la acción más destructiva que la aplicación va a tener. Deja a una persona sin poder trabajar.

**P19 · el bloqueo es una operación de cuatro pasos y ninguno es opcional.**

| # | Paso | Por qué |
|---|---|---|
| 1 | Motivo obligatorio (mínimo 10 caracteres) | Va a `Bitacora.motivo`. Un bloqueo sin motivo es indefendible ante el afectado y ante un auditor |
| 2 | `PATCH /users/{oid}` con `{ "accountEnabled": false }` | El bloqueo propiamente dicho |
| 3 | `POST /users/{oid}/revokeSignInSessions` | **Sin esto el bloqueo no bloquea.** El token de acceso que la persona ya tiene sigue siendo válido hasta una hora; deshabilitar la cuenta no lo invalida. Un bloqueo por incidente de seguridad que deja a la persona dentro una hora más no contiene nada |
| 4 | `Persona.activa = false` + bitácora, en transacción | No se espera al cron de sincronización: la pantalla tiene que decir la verdad al recargar |

**P20 · confirmación escribiendo el correo de la persona.** No un «¿está seguro?». El popup pide teclear `daniel.medina@cuantico.com` para habilitar el botón. Es lo que se usa para las operaciones irreversibles y acá la irreversibilidad es de la persona, no del dato.

**P21 · tres bloqueos que la aplicación se niega a hacer:**

1. **La propia cuenta.** Quien administra no se puede autobloquear: perdería el acceso con el que arreglarlo.
2. **La última cuenta con rol `RESPONSABLE`.** Se consulta la membresía del grupo del SIG —`oidsDelGrupoSig()`, que la pantalla ya llama— y si bloquear deja el grupo en cero, se rechaza con esa frase. Un SIG sin ningún administrador se arregla en Azure, por alguien que quizá no esté disponible el viernes a las 7 p. m.
3. **Una persona ya inactiva.** No hay nada que bloquear: o ya salió del Directorio, o es una de las 54 cuentas invitadas que `esColaboradorDeLaOrganizacion` filtra por `userType === 'Guest'` (`lib/sgsi/graph-usuario.ts:18-22`). Bloquear la cuenta de un aliado de Tiindux o de la UNAD desde la herramienta del SIG sería salirse del alcance de la organización y romperle la colaboración a otro.

**P22 · el bloqueo no cierra, no anula y no reasigna tareas por su cuenta.** Muestra los pendientes abiertos —el popup ya los tiene, la columna PENDIENTES los cuenta— y ofrece reasignarlos con `reasignarPendientesDe`, que exige motivo. Cerrarlas automáticamente inventaría cumplimiento; anularlas en silencio borraría carga real que alguien tiene que asumir. Es la regla R9, que ya está escrita y probada.

**P23 · el bloqueo no es la desvinculación.** El bloqueo contiene hoy (A.5.11, A.8.3); la desvinculación es el trámite de REQ-SIG-09 con revocación de accesos, paz y salvo y obligaciones subsistentes (`lib/sig/ciclos.ts`). El popup **enlaza** al trámite y dice que el bloqueo no lo reemplaza. Fundirlos haría que un bloqueo preventivo por sospecha de incidente —del que la persona puede volver limpia el lunes— arrancara una desvinculación que nadie pidió.

**P24 · desbloquear existe, y por el mismo camino.** Mismo permiso, mismo motivo obligatorio, `accountEnabled: true` y `Persona.activa = true`. Sin desbloqueo, el clic equivocado no tiene remedio dentro de la aplicación y hay que salir a buscar a quien administre Azure.

**P25 · el botón no se dibuja si el permiso no está concedido.** `GRAPH_BLOQUEO_HABILITADO` (§10) empieza en `false`. Un botón que existe y responde 403 se lee como que la aplicación está rota, y alguien va a probarlo tres veces con tres personas distintas antes de concluirlo.

---

## 7 · Permisos en Azure

Hoy la aplicación **lee** el Directorio con la misma registración que usa para SharePoint (`SHAREPOINT_TENANT_ID`, `SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET` — `lib/sgsi/directorio.ts:52-59`): `/users` para el censo y los miembros del grupo del SIG para el rol. **Ese consentimiento ya alcanza para las dos pestañas de lectura**, licencias incluidas (D-2). Todo lo que sigue lo pide **solo el bloqueo**, y va sobre la misma registración (D-7).

**Dos permisos, los dos de APLICACIÓN —no delegados— y con consentimiento de administrador:**

| Para | Permiso | Por qué ese y no otro |
|---|---|---|
| Bloquear y desbloquear | **`User.EnableDisableAccount.All`** | Habilita escribir **solo** `accountEnabled`. `User.ReadWrite.All` daría escritura sobre **todos los atributos de todas las cuentas del tenant** a un secreto que vive en un `.env`: con él se cambia el correo de cualquiera, incluido el de un administrador. Es el mismo razonamiento que llevó a `Sites.Selected` en REQ-SIG-13 §8, y un SGSI que se concede permisos excesivos a sí mismo es un hallazgo con razón |
| Revocar sesiones | **`User.RevokeSessions.All`** | Es el permiso propio de `revokeSignInSessions`. No requiere el anterior ni viceversa, y sin él el bloqueo no bloquea (P18) |

**Nada de licencias en esta tabla, y es deliberado.** No se pide `Organization.Read.All`: las dos consultas de §3.2 responden con lo que ya está concedido. Lo que sí hay que hacer al construir es **anotar en este documento qué permiso las habilitó** —el consentimiento vigente incluye lectura de directorio, y de ahí sale— para que dentro de un año, si alguien recorta permisos y la pestaña se cae, el diagnóstico esté escrito y no haya que redescubrirlo. Y no se pide `LicenseAssignment.ReadWrite.All`, porque la pestaña no escribe (D-2).

**Dos cosas que verificar al conceder, y de las que el desarrollo no puede responder solo:**

1. **Que la aplicación no pueda tocar cuentas privilegiadas.** Microsoft restringe que una aplicación con estos permisos modifique usuarios con roles administrativos, pero la restricción y su alcance hay que **comprobarlos en el consentimiento**, no darlos por ciertos desde acá. Si no alcanza, se acota con Administrative Units. Es la contrapartida de D-7: una sola registración concentra la capacidad de publicar documentos y de deshabilitar cuentas, así que el alcance de la segunda tiene que estar comprobado.
2. **Que el consentimiento quede registrado en la bitácora del SGSI.** Un permiso nuevo sobre el Directorio es un cambio de control de acceso privilegiado (A.8.2). Quién lo concedió, cuándo y con qué justificación es parte del expediente, no un detalle de configuración.

---

## 8 · Bitácora y datos personales

**P26 · cada campo que cambia escribe su propia fila** (`tabla: 'persona'`, `campo`, `valorAnterior`, `valorNuevo`), y todo el guardado va en una transacción, igual que la sincronización. Una fila «se editó la persona» no responde qué cambió.

**P27 · el motivo se exige donde la decisión tiene consecuencia, y no en todas partes.** Obligatorio en: bloqueo, desbloqueo, anulación de pendientes y reasignación. Opcional en: teléfono, dirección, contactos, documento. Pedir motivo para corregir un teléfono convierte el campo en un trámite y lo que se obtiene son cien filas que dicen «actualización».

**P28 · la corrida de sincronización se sigue derivando de la bitácora, y este requerimiento no la puede ensuciar.** La franja de la pantalla reconstruye la última corrida buscando filas con `tabla: 'persona'` que comparten `ocurridoEn` (`page.tsx:49-59`), y ese rastro funciona porque hoy `sincronizarDirectorio` es su único escritor. **Este popup va a ser el segundo.** Sin hacer nada, una edición manual de tres campos se leería como una corrida de sincronización con tres actualizaciones. Se resuelve marcando el origen: la sincronización escribe `motivo: 'sincronización con el Directorio Activo'` (ya lo hace, `personas.ts:103`) y `resumirCorrida` filtra por ese motivo. **Es parte de este requerimiento, no una mejora aparte**: si no se hace, la franja empieza a mentir el día del despliegue.

**P29 · no se registra la lectura, y la pantalla no finge que sí.** El popup muestra documento de identidad, dirección y contactos de emergencia. La aplicación no tiene registro de accesos de lectura (la `ip` de `Bitacora` solo la puebla el flujo de anexos) y este requerimiento no lo construye. Lo que sí hace es limitar quién puede abrirlo (P2) y no exportar nunca los contactos de emergencia (P9.3).

**P30 · la marca de origen de la bitácora es también lo que hace legible el grupo derivado.** Una obligación de alcance `TODOS` no escribe filas de membresía, así que en la bitácora no hay rastro de «entró a Todos». El rastro que sí existe —y el que responde la pregunta de auditoría— es el alta de la persona y las asignaciones que se le crearon. Es correcto y hay que decirlo en el documento de trabajos: **para el grupo Todos, la evidencia de pertenencia es el alta**.

---

## 9 · Decisiones

**D-1 · El nombre y el correo no se editan en el SIG.** Se muestran de solo lectura, con la nota de que los manda el Directorio.
*Por qué:* `planificarSincronizacion` compara el nombre del Directorio contra el guardado y **genera un cambio que lo sobrescribe** (`personas.ts:86-106`). Un nombre editado en el popup duraría hasta las 05:00 del día siguiente. Un campo editable cuyo valor se revierte solo es peor que un campo bloqueado: parece funcionar. Y la doctrina ya está escrita en el esquema: «AD manda sobre nombre, correo y existencia; el SIG manda sobre área y cargo».
*Si se revierte:* habría que sacar el nombre del plan de sincronización, y con eso el SIG deja de reflejar los cambios de apellido del Directorio.

**D-2 · Las licencias se leen con el consentimiento vigente, y la pestaña no escribe.** ✅ **Confirmado el 2026-09-08: la lectura ya se probó contra el tenant y funciona con los permisos actuales.**
*Lo que eso resuelve:* el requerimiento **no pide ni un permiso nuevo** para esta pestaña. La versión anterior de este documento pedía `Organization.Read.All` por precaución y se corrigió: pedir un permiso ya concedido cuesta una reunión con quien administra Azure y no compra nada.
*Por qué no escribe:* la escritura exigiría `LicenseAssignment.ReadWrite.All` sobre todo el tenant; pelea con la licenciación por grupo si el tenant la usa —el portal muestra la asignación como directa y el grupo la vuelve a poner—; y **quitar una licencia de Exchange arranca el reloj de 30 días para el borrado del buzón**, una consecuencia que no puede vivir detrás de una casilla en un popup del SIG.
*El camino para asignar, cuando se quiera:* no es darle escritura a la aplicación. Es que marcar la licencia deseada cree una `Solicitud` (el modelo ya existe, con solicitante / autoriza / ejecuta) para que TI la aplique, con la traza de quién la pidió y quién la autorizó. Requerimiento aparte.

**D-3 · Los grupos de interés viven en el SIG y no otorgan permisos** (§3.4, P12).
*Por qué:* «Desarrolladores» es un conjunto de gestión, no un grupo de seguridad. Espejar grupos de Azure tiene el problema que `permisos.ts:155-158` ya documenta para el grupo de Microsoft 365 que se retiró: «un grupo al que la gente se agrega para un chat es un grupo que nadie revisa antes de repartir el registro de activos». Y administrar la membresía en el SIG sin escribir en Azure mantiene una sola fuente de autorización.
*Si se revierte a espejo de Azure:* la pertenencia solo se cambia en Azure y hay que esperar la sincronización; el SIG pierde la capacidad de agrupar a gente que no tiene grupo propio en el Directorio.

**D-4 · Escribir la membresía en los grupos reales de Azure queda fuera del alcance, por diseño.** No espera confirmación: si algún día se quisiera, es un requerimiento nuevo y esta decisión es lo que hay que discutir primero.
*Por qué:* exigiría `GroupMember.ReadWrite.All`, que incluye poder agregar a alguien al grupo `Líderes SIG` — el grupo que otorga acceso a la propia aplicación. Una herramienta que puede darse acceso a sí misma no es auditable.

**D-5 · Ninguna tarea nace vencida. La tarea es de la persona y su plazo cuenta desde que la recibe** (§5.2, P16 a P18). ✅ **Confirmado el 2026-09-08, en estas palabras: «las tareas son de las personas y no deben estar vencidas si se les agrega una nueva tarea o son nuevos en la compañía».**
*Alcance de la decisión:* **cambia la conducta del generador para todo el sistema**, no solo para el popup. Rige los cuatro casos de la tabla de §5.2 —persona nueva, pertenencia nueva, obligación nueva con inicio retroactivo, y el anclaje flotante— y rige igual en el cron, porque si el popup y el cron discreparan, el número informado al guardar sería falso a la mañana siguiente.
*Por qué también era necesaria por dentro:* es la regla R2 que `generacion.ts:132-133` ya declara y que el código no cumple. Sin el piso, poner un área a alguien hoy le crea nueve meses de tareas vencidas; y sin correr la fecha (P17), la tarea del periodo en curso puede nacer vencida el mismo instante en que se crea.
*Lo que la decisión NO hace:* no toca el histórico. Las vencidas que ya existen siguen existiendo.

**D-6 · La generación al guardar corre en la misma transacción y solo para esa persona** (§5.1).
*Por qué:* el número informado tiene que ser un hecho verificable con un `count(*)`, no una previsión que el cron puede desmentir.

**D-7 · Se usa la misma registración de aplicación que ya existe.** ✅ **Confirmado el 2026-09-08.**
*Qué se aceptó al decidirlo:* la registración de `SHAREPOINT_CLIENT_ID` tendrá, con REQ-SIG-13, escritura sobre el sitio del SIG, y ahora suma deshabilitar cuentas del Directorio. Las dos capacidades quedan detrás de **un** secreto en el `.env` de un servidor. Separarlas habría acotado el daño de una fuga al costo de un segundo secreto que rotar.
*Lo que esta decisión exige a cambio, y no es negociable:* el secreto entra al ciclo de rotación con nombre propio, y la verificación 2 de §7 —que la aplicación no pueda tocar cuentas privilegiadas— deja de ser una recomendación y pasa a ser un requisito de despliegue. Con las dos capacidades juntas, ese límite es lo único que queda entre una credencial filtrada y el tenant.
*No se agregan variables de entorno para el Directorio*, precisamente porque no hay una segunda registración.

**D-8 · El bloqueo no arranca la desvinculación** (P23).

**D-9 · El módulo entero es del grupo de responsables, y `personas:bloquear` se le concede a él.** ✅ **Confirmado el 2026-09-08: «este módulo es restringido al grupo de responsables, no hay problema».**
*Qué queda entonces:* el popup exige `personas:administrar` (P2) y el bloqueo exige `personas:bloquear`; hoy los dos los tiene `Líderes SIG` y nadie más. No se crea ningún grupo nuevo en el Directorio ni se pide ninguna separación de funciones adicional.
*Por qué el permiso se declara aparte igual, si hoy lo tiene el mismo grupo:* `permisos.ts:16-19` establece que el vocabulario de permisos se conserva entero aunque los escalones intermedios se hayan retirado, precisamente para que reabrir uno sea **agregar una entrada en `POR_GRUPO`** y nunca recorrer las pantallas de nuevo. Un permiso propio hoy es una línea; extraerlo mañana de un `personas:administrar` que ya quedó repartido por diez pantallas no lo es. Y deja legible en el código que bloquear una cuenta no es lo mismo que editar un teléfono, aunque hoy los autorice la misma gente.

**D-10 · El grupo «Todos» es derivado y no se puede desmarcar** (P10, P11). ✅ **Confirmado el 2026-09-08: «de acuerdo, todos no se puede desmarcar».**
*Por qué:* «por defecto una persona está en Todos» se puede construir de dos maneras y solo una es verificable. Con filas de membresía creadas al vuelo, la persona a la que le falte la fila —por un alta que falló, por una migración que corrió antes— **no recibe el curso de concienciación y no figura en ninguna lista de faltantes**, porque para el sistema no pertenece. Derivada, esa situación no existe. Y elimina el segundo riesgo: que `alcance: 'TODOS'` y «grupo Todos» empiecen a responder distinto.
*Qué se pierde:* no se puede excluir a nadie de Todos con un clic. Eso es deliberado — una persona fuera de la concienciación en seguridad es una **excepción que necesita justificación**, no una casilla.
*Si se revierte* (que Todos se pueda desmarcar): hay que hacerlo con membresía explícita **más motivo obligatorio y fecha**, tratarlo como excepción visible en `/sig/estado` —igual que hoy se cuentan las anomalías— y aceptar el modo de falla del párrafo anterior. Y hay que decidir qué gana cuando una obligación de alcance `TODOS` (las que ya existen) alcanza a alguien excluido del grupo Todos: hoy la alcanzaría, y eso sería una exclusión que no excluye.

---

## 10 · Variables de entorno nuevas

```
# ─── Bloqueo de cuentas en el Directorio (REQ-SIG-15) ─────────────────────────
# El botón no se dibuja mientras esto sea false. Ponerlo en true SOLO cuando estén
# concedidos los permisos de APLICACIÓN User.EnableDisableAccount.All y
# User.RevokeSessions.All (§7) y el líder del SIG haya confirmado D-7.
GRAPH_BLOQUEO_HABILITADO=false
```

Se agrega a `.env.example` con este comentario. **Es la única variable nueva del requerimiento.** La pestaña de licencias no necesita ninguna —ni permiso nuevo (D-2)— y si alguna de sus dos consultas fallara, lo dice con el nombre del recurso y del permiso (P8).

---

## 11 · Verificación — hecho significa demostrado

**Los cuatro primeros son pruebas unitarias del módulo puro, en jest, sin base de datos.** Es la frontera que ya rige en `lib/` y la razón por la que la regla de D-5 se puede demostrar en vez de probarse a mano contra el calendario.

| # | Qué se comprueba | Cómo |
|---|---|---|
| 1 | El alcance `GRUPO_INTERES` resuelve igual en previsión y en generación | La prueba que ya compara `personasAlcanzadas` con `resolverAlcance`, extendida al valor nuevo |
| 2 | **Ninguna asignación nace vencida** | Para los cuatro casos de la tabla de §5.2, y con `plazoDias` corto a propósito: **toda** asignación devuelta por `planificarGeneracion` cumple `fechaLimite >= hoy`. Es una sola aserción sobre el plan completo, y es la prueba que fija D-5 |
| 3 | El periodo en curso se genera con el plazo completo | Obligación mensual, `plazoDias = 15`, pertenencia el día 28: **una** asignación, `fechaApertura` = día 28, `fechaLimite` = día 28 + 15. Sin P17 esta prueba falla con fecha límite el día 16 |
| 4 | Los periodos cerrados antes de la pertenencia no existen | Obligación mensual iniciada en enero + `areaDesde` = hoy → **un** periodo, no nueve. Variante flotante: apertura hoy, no enero. Variante obligación nueva con inicio retroactivo: nada anterior a `creadaEn` |
| 5 | La etiqueta del periodo no cambió | La asignación del caso 3 tiene `periodo = '2026-09'`, no una etiqueta con la fecha de ingreso. Correr el plan dos veces no produce una segunda fila (P18) |
| 6 | Los dos casos que motivan el requerimiento | Concienciación → la reciben las 36 personas activas, incluida una creada después. Codificación segura → solo los marcados en Desarrolladores, y nadie más |
| 7 | El grupo derivado no admite miembros | Intentar guardar una membresía en Todos: rechazada. `SELECT count(*)` sobre `miembro_grupo_interes` unido a `grupo_interes` con `derivado` = 0 |
| 8 | El número informado es el número creado | Guardar el área y comparar el mensaje contra `SELECT count(*) FROM asignacion WHERE persona_id = X AND creada_en > …` |
| 9 | El cron no agrega nada después | Correr `generar-asignaciones` tras el guardado: cero asignaciones nuevas para esa persona. Si aparece una, el número del popup era mentira |
| 10 | Idempotencia | Guardar la misma área dos veces: la segunda informa cero |
| 11 | El desglose por origen es correcto | Persona con cargo propietario de N activos y una obligación por tipo: el desglose separa área, cargo y activos |
| 12 | Quitar el área no borra pendientes | Cambiar de área: los pendientes anteriores siguen existiendo, se listan, y el mensaje los cuenta |
| 13 | **Las licencias se leen sin conceder nada** | Con el `.env` de producción tal como está hoy: las dos consultas de §3.2 responden. **Y se anota en §7 qué permiso las habilitó** (D-2) |
| 14 | Una consulta caída no tumba la otra | Forzar un 403 en `/subscribedSkus`: la lista de la persona se sigue mostrando y el bloque del tenant nombra el recurso y el permiso (P8) |
| 15 | El bloqueo bloquea de verdad | Con una cuenta de prueba con sesión abierta: tras bloquear, la sesión deja de servir **sin esperar una hora**; `accountEnabled=false` en Azure; `Persona.activa=false`; bitácora con motivo |
| 16 | Los tres bloqueos prohibidos | Autobloqueo, último responsable del SIG y persona inactiva: los tres rechazados con su frase |
| 17 | Los pendientes de quien se bloquea siguen abiertos | Ninguna asignación cerrada ni anulada por el bloqueo (P22) |
| 18 | El desbloqueo restituye | La cuenta vuelve, `Persona.activa=true`, y quedan las dos filas de bitácora |
| 19 | Sin la variable, sin botón | `GRAPH_BLOQUEO_HABILITADO` ausente o `false`: el botón no está en el DOM |
| 20 | La franja de sincronización no se ensucia | Editar tres campos a mano y recargar: la franja sigue mostrando la última corrida **de sincronización**, no la edición (P28) |
| 21 | Teclado y foco | Pestañas navegables con flechas, `aria-selected` correcto, Escape cierra, el foco vuelve a la fila |

---

## 12 · Qué NO hace este requerimiento

- **No edita el nombre ni el correo** (D-1).
- **No crea personas.** El origen es el Directorio; `origen: MANUAL` es una anomalía por la regla C1 de REQ-SIG-09, no una vía de alta.
- **No borra personas.** La baja es lógica y ya está resuelta.
- **No asigna ni quita licencias** (D-2). Solo las lee.
- **No escribe membresías en grupos de Azure** (D-4).
- **No otorga permisos con los grupos de interés** (P12).
- **No administra los grupos de interés desde una pantalla propia.** Los dos se siembran en la migración; crear un tercero es una fila. La pantalla de administración de grupos —crear, renombrar, desactivar— es otro requerimiento y no hace falta para los dos casos que motivan este.
- **No cierra, anula ni reasigna tareas por su cuenta** al cambiar de área o de grupo, ni al bloquear (P4, P22).
- **No reemplaza el trámite de desvinculación** de REQ-SIG-09 (P23).
- **No corrige el histórico de asignaciones vencidas** que el defecto de §5.2 ya creó. Deja de crear nuevas; limpiar lo anterior es un requerimiento con su propia decisión sobre lo ya cerrado.
- **No mueve la fecha límite de ninguna asignación que ya exista.** La regla de D-5 se aplica **al generar**, y ninguna migración de este requerimiento recalcula fechas de asignaciones creadas. Mover la fecha límite de una tarea abierta es una prórroga, y la prórroga tiene su propio camino con motivo (`prorrogarAsignacion`) y su propia fila en la bitácora. Un `UPDATE` masivo de fechas límite borraría la diferencia entre un plazo que la organización concedió y uno que un despliegue cambió.
- **No pide permisos nuevos para las tres pestañas de lectura.** El único permiso nuevo del requerimiento es el del bloqueo (§7).
- **No deja que la persona edite sus propios datos de contacto.** El autoservicio en Mi SIG es deseable y es otro requerimiento: cambia quién puede escribir, y con eso las reglas de bitácora y de validación.
- **No borra buzones ni datos al bloquear.** El bloqueo deshabilita y revoca sesiones. Nada más.
