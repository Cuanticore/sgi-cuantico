# Requerimiento · Editar una persona desde la pantalla de Personas

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-15 · edición de persona y pertenencias |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-08 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo (ejecución asistida con Claude Code) |
| **Extiende** | REQ-SIG-01 (censo y sincronización) · REQ-SIG-09 (gestión de colaboradores) · el motor de tareas de `lib/sig/generacion.ts` |
| **Estado** | Decisiones D-1 a D-10 tomadas por defecto (§9). **D-2, D-4, D-5, D-7 y D-10 requieren confirmación del líder del SIG antes de construir**: cambian los permisos que hay que pedirle a Azure o la conducta del generador. |

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

Dos listas, una al lado de la otra:

- **Lo que el tenant tiene**: `GET /subscribedSkus` → `skuPartNumber`, `prepaidUnits.enabled`, `consumedUnits`. Se muestra «12 de 25 en uso · 13 libres».
- **Lo que esta persona tiene**: `GET /users/{oid}?$select=assignedLicenses,assignedPlans,usageLocation`.

**P5 · el nombre del SKU no se inventa en el código.** Graph devuelve `SPE_E3`, `ENTERPRISEPACK`, `POWER_BI_STANDARD` — códigos que no le dicen nada a quien abre el popup. El nombre legible entra como **dato parametrizable** (`ParametroSig` o una tabla `LicenciaTenant` de catálogo, según lo que ya use el módulo de parámetros), sembrado con los SKU que Cuántico tiene y editable sin despliegue. Un `Record<string, string>` en el fuente obliga a desplegar el día que la organización compre un producto nuevo, y hasta ese día la pantalla muestra el código crudo.

**P6 · en la versión 1 la pestaña LEE y no escribe** (D-2). Asignar y quitar licencias se sigue haciendo en el portal de Microsoft. Lo que esta pestaña aporta sin escribir nada ya es sustantivo, y es lo que hoy no existe en ninguna parte:

- Responde por el inventario de software por persona, que A.5.9 pide y hoy nadie puede armar sin entrar al portal.
- Deja ver **licencia asignada a cuenta bloqueada**, que es plata quemada y a la vez un indicio: una cuenta que debía estar cerrada y sigue consumiendo un puesto.
- Deja ver quién no tiene licencia y sí tiene tareas, que es alguien que no puede cumplirlas.

**P7 · si falta el permiso, la pestaña nombra el permiso.** `clasificarRecurso(estado, '/subscribedSkus', 'Organization.Read.All')` y `explicarFallo` ya redactan la frase. La pestaña nunca muestra una lista vacía cuando lo que pasó es un 403: vacío y sin-permiso son dos cosas distintas y se ven distinto.

### 3.3 · Contactos

`direccion`, `ciudad`, `telefono` y `correoPersonal` **ya existen** en `Persona` (REQ-SIG-09) y tampoco tienen hoy dónde escribirse. Lo único nuevo son los contactos de emergencia, y van en tabla propia (§4.1).

**P8 · el contacto de emergencia es dato personal de un tercero que nunca autorizó nada.** Es la madre, la pareja o el hermano de un colaborador: no firmó autorización de tratamiento, no está en el censo y no tiene relación con la organización. Eso obliga a tres cosas, y no son opinables (Ley 1581, A.5.34):

1. Entra al inventario de tratamientos como finalidad propia —«atención de emergencias del personal»— usando `TratamientoDatosPersonales`, que ya existe. Un dato personal que no está en el RAT es un hallazgo.
2. Se recoge lo mínimo: nombre, parentesco y teléfono. Nada más. No hay campo de correo, ni de dirección, ni de documento: para llamar en una emergencia no se necesitan.
3. Solo lo ve quien tiene `personas:administrar`. No aparece en la ficha que la propia persona ve en Mi SIG ni en ninguna exportación del censo.

### 3.4 · Grupos de interés

Casillas —no un `select`: **una persona pertenece a varios a la vez**. Arrancan dos grupos, y la pestaña está hecha para que el tercero sea una fila de datos y no un despliegue:

| Grupo | Código | Quién está | Para qué |
|---|---|---|---|
| **Todos** | `TODOS` | Toda persona activa, por construcción (P9) | Concienciación en seguridad, políticas de obligada lectura |
| **Desarrolladores** | `DESARROLLADORES` | Se marca a mano | Codificación segura y el resto de las obligaciones de desarrollo seguro de REQ-SIG-08 (PRO-TEC-04 y sus puertas, `lib/sig/desarrollo.ts`) |

**P9 · «Todos» no se guarda como membresía: se resuelve.** El grupo lleva la marca `derivado = true` y su pertenencia es «toda persona con `activa = true`», calculada al generar. La casilla se dibuja marcada y deshabilitada, con la frase de por qué.

Es la diferencia entre que el requisito «por defecto una persona está en Todos» sea **una promesa** o sea **un hecho**. Con filas de membresía, la promesa se cumple mientras nadie se olvide de crear la fila: el alta de una persona nueva por sincronización, una transacción que falló a mitad, una migración que corrió antes de que existiera el grupo — y el resultado de cualquiera de las tres es una persona que **no recibe el curso de concienciación y no aparece en ninguna lista de faltantes**, porque para el sistema simplemente no pertenece. Derivado, ese estado no se puede alcanzar.

Y evita la otra mitad del problema: `AlcanceObligacion` ya tiene el valor `TODOS`, que significa exactamente «toda persona activa» (`generacion.ts:153`). Dos formas de decir lo mismo divergen — es lo que este mismo proyecto ya documentó con «Líderes SIG» y «Lideres SIG» coexistiendo en producción (`schema.prisma:222-235`).

**P10 · por eso el selector de obligaciones guarda `TODOS` cuando el grupo elegido es Todos.** La pantalla ofrece una sola opción, «Un grupo de interés», con la lista de grupos; si se elige Todos, la obligación se guarda con `alcance: 'TODOS'` y sin `alcanceGrupoInteresId`. Si se elige cualquier otro, con `alcance: 'GRUPO_INTERES'` y su id. Consecuencias, todas buenas: en la base sigue habiendo **una** representación de «todo el mundo», las obligaciones que ya usan `TODOS` no se migran, y el día que se agregue un grupo derivado más (`ACTIVOS_CON_PORTATIL`, por ejemplo) el patrón ya está.

**P11 · un grupo de interés NO otorga ningún permiso.** Es pertenencia de gestión: sirve para dirigir obligaciones y para reportar. El acceso a la aplicación lo siguen dando —solo— los grupos del Directorio (`lib/sgsi/permisos.ts`). Si un grupo administrado dentro del SIG pudiera otorgar acceso, habría dos fuentes de autorización y la pregunta «quién autorizó este permiso» dejaría de tener respuesta en Azure, que es exactamente la propiedad que `permisos.ts:1-6` está construido para conservar. El popup lo dice en una línea bajo el título de la pestaña.

**P12 · marcar un grupo tiene la misma consecuencia que cambiar de área**: previsión antes de guardar, conteo real al guardar, y al desmarcar, los pendientes de ese grupo se listan y no se borran (P4). Marcar Desarrolladores a alguien en septiembre no le cobra el curso de codificación segura del primer trimestre: rige el piso de pertenencia (P15), que para un grupo es `MiembroGrupoInteres.desde`.

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
| `derivado` | `Boolean @default(false)` | **P9.** `true` en Todos: la pertenencia se calcula, no se guarda, y la casilla va marcada y deshabilitada |
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
- El selector de `NuevaObligacion.tsx:69` ofrece **«Un grupo de interés · quienes pertenezcan a él»** con la lista de grupos activos, y aplica P10: elegir Todos guarda `alcance: 'TODOS'`.
- **La opción suelta «Todas las personas» sale del selector.** No se borra el valor del enum —lo usan las obligaciones que ya existen y es lo que se guarda al elegir Todos— pero deja de ofrecerse como una opción aparte. Dos entradas en la misma lista que producen exactamente el mismo conjunto es cómo alguien crea la obligación dos veces.

Con esto, los dos casos del §1 quedan así:

| Contenido | Alcance | Guardado |
|---|---|---|
| Curso de concienciación en seguridad | Grupo de interés → Todos | `alcance: 'TODOS'` |
| Codificación segura | Grupo de interés → Desarrolladores | `alcance: 'GRUPO_INTERES'`, `alcanceGrupoInteresId: <id>` |

---

## 5 · «Al guardar se informa el número de tareas asignadas»

### 5.1 · El número es un hecho, no una previsión

**P13 · guardar la pertenencia y generar las asignaciones ocurren en la MISMA transacción**, con la bitácora adentro. Nada de esto sale a la red, así que la regla de REQ-SIG-13 (P10: ninguna llamada a Graph dentro de una transacción) no se viola. Si se guardara primero y se generara después, existiría el estado «tiene el área pero no las tareas», y ese estado es indistinguible de «el área no genera nada» — que es precisamente el problema que este requerimiento viene a cerrar.

**P14 · se genera solo para esa persona, reusando el núcleo puro.** `planificarGeneracion` recibe un arreglo de personas: se le pasa una. No se corre `correrTrabajo('generar-asignaciones')`, que generaría para todo el censo y devolvería un total en el que las tareas de esta persona quedan sumadas con las de los demás. El número que el popup informa tiene que ser **el de esta persona**, o no sirve para nada.

El mensaje lleva la lista, no solo el conteo, con el mismo tratamiento que ya tiene el panel de reasignación: código, título y fecha límite. «Se asignaron 47 tareas» sin decir cuáles obliga a salir de la pantalla para saber qué se acaba de crear.

### 5.2 · El defecto que hay que arreglar para que el número no sea una emboscada

`generacion.ts:132-133` declara la regla:

> «Quienes debe alcanzar una obligación, resuelto HOY (R2): quien ingrese después recibe los periodos siguientes, **nunca los pasados**.»

**El código no cumple su propia regla.** `resolverAlcance` sí resuelve el *quién* hoy, pero los *periodos* los produce `periodosHasta`, que arranca en `obligacion.fechaInicio` y camina hasta `hoy + horizonteDias` (`periodos.ts:137-149`). No hay piso por persona. Entonces:

- Una obligación **mensual** que empezó en enero le crea **nueve periodos vencidos** a quien entre al área hoy.
- Una obligación **flotante** le crea su primer ciclo con `apertura = obligacion.fechaInicio` (`generacion.ts:...periodoFlotante`), es decir con la fecha límite ya cumplida: nace vencida.

Esto no lo introduce este requerimiento: **ya le pasa a cada persona nueva que entra por la sincronización**, para todas las obligaciones de alcance `TODOS`. Lo que este requerimiento hace es volverlo imposible de ignorar, porque ahora hay un popup que va a imprimir el número en la cara de quien guarda.

**P15 · el piso de periodos es la pertenencia.** `PersonaGenerable` suma `desde: Date`, y ningún periodo cuya apertura sea anterior a ese `desde` se genera. El piso se calcula así:

```
piso = max(
  fechaIngreso ?? creadaEn,        // desde cuándo es colaborador
  areaDesde | cargoDesde | miembro.desde   // según el alcance que se esté resolviendo
)
```

Para el alcance `TODOS` —y por lo tanto para el grupo derivado Todos— el piso es solo el primer término: no hay fecha de pertenencia porque la pertenencia no tiene principio distinto del ingreso.

Para el anclaje `FLOTANTE`, la apertura del primer ciclo es `max(obligacion.fechaInicio, piso)` en vez de `obligacion.fechaInicio`.

**El mismo piso rige para el cron.** No es una regla del popup: si el popup se negara a crear los periodos pasados y el trabajo de las 05:00 los creara igual, el número informado al guardar sería falso doce horas después. Una sola regla, en el módulo puro, para los dos disparos.

**Consecuencia que hay que aceptar y decir en voz alta:** el histórico no se toca. Las asignaciones vencidas que ya existen por este defecto siguen existiendo, porque cada una puede tener un registro detrás. Lo que cambia es que no se crean nuevas. Corregir el histórico es un requerimiento aparte, con su propia decisión sobre qué hacer con lo ya cerrado.

---

## 6 · Bloquear usuario en el Directorio

Es la acción más destructiva que la aplicación va a tener. Deja a una persona sin poder trabajar.

**P16 · el bloqueo es una operación de cuatro pasos y ninguno es opcional.**

| # | Paso | Por qué |
|---|---|---|
| 1 | Motivo obligatorio (mínimo 10 caracteres) | Va a `Bitacora.motivo`. Un bloqueo sin motivo es indefendible ante el afectado y ante un auditor |
| 2 | `PATCH /users/{oid}` con `{ "accountEnabled": false }` | El bloqueo propiamente dicho |
| 3 | `POST /users/{oid}/revokeSignInSessions` | **Sin esto el bloqueo no bloquea.** El token de acceso que la persona ya tiene sigue siendo válido hasta una hora; deshabilitar la cuenta no lo invalida. Un bloqueo por incidente de seguridad que deja a la persona dentro una hora más no contiene nada |
| 4 | `Persona.activa = false` + bitácora, en transacción | No se espera al cron de sincronización: la pantalla tiene que decir la verdad al recargar |

**P17 · confirmación escribiendo el correo de la persona.** No un «¿está seguro?». El popup pide teclear `daniel.medina@cuantico.com` para habilitar el botón. Es lo que se usa para las operaciones irreversibles y acá la irreversibilidad es de la persona, no del dato.

**P18 · tres bloqueos que la aplicación se niega a hacer:**

1. **La propia cuenta.** Quien administra no se puede autobloquear: perdería el acceso con el que arreglarlo.
2. **La última cuenta con rol `RESPONSABLE`.** Se consulta la membresía del grupo del SIG —`oidsDelGrupoSig()`, que la pantalla ya llama— y si bloquear deja el grupo en cero, se rechaza con esa frase. Un SIG sin ningún administrador se arregla en Azure, por alguien que quizá no esté disponible el viernes a las 7 p. m.
3. **Una persona ya inactiva.** No hay nada que bloquear: o ya salió del Directorio, o es una de las 54 cuentas invitadas que `esColaboradorDeLaOrganizacion` filtra por `userType === 'Guest'` (`lib/sgsi/graph-usuario.ts:18-22`). Bloquear la cuenta de un aliado de Tiindux o de la UNAD desde la herramienta del SIG sería salirse del alcance de la organización y romperle la colaboración a otro.

**P19 · el bloqueo no cierra, no anula y no reasigna tareas por su cuenta.** Muestra los pendientes abiertos —el popup ya los tiene, la columna PENDIENTES los cuenta— y ofrece reasignarlos con `reasignarPendientesDe`, que exige motivo. Cerrarlas automáticamente inventaría cumplimiento; anularlas en silencio borraría carga real que alguien tiene que asumir. Es la regla R9, que ya está escrita y probada.

**P20 · el bloqueo no es la desvinculación.** El bloqueo contiene hoy (A.5.11, A.8.3); la desvinculación es el trámite de REQ-SIG-09 con revocación de accesos, paz y salvo y obligaciones subsistentes (`lib/sig/ciclos.ts`). El popup **enlaza** al trámite y dice que el bloqueo no lo reemplaza. Fundirlos haría que un bloqueo preventivo por sospecha de incidente —del que la persona puede volver limpia el lunes— arrancara una desvinculación que nadie pidió.

**P21 · desbloquear existe, y por el mismo camino.** Mismo permiso, mismo motivo obligatorio, `accountEnabled: true` y `Persona.activa = true`. Sin desbloqueo, el clic equivocado no tiene remedio dentro de la aplicación y hay que salir a buscar a quien administre Azure.

**P22 · el botón no se dibuja si el permiso no está concedido.** `GRAPH_BLOQUEO_HABILITADO` (§10) empieza en `false`. Un botón que existe y responde 403 se lee como que la aplicación está rota, y alguien va a probarlo tres veces con tres personas distintas antes de concluirlo.

---

## 7 · Permisos en Azure

Hoy la aplicación **lee** el Directorio con la misma registración que usa para SharePoint (`SHAREPOINT_TENANT_ID`, `SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET` — `lib/sgsi/directorio.ts:52-59`): `User.Read.All` para `/users` y la lectura de miembros del grupo del SIG.

Lo nuevo, **todo como permiso de APLICACIÓN con consentimiento de administrador**, y todo en su mínima expresión:

| Para | Permiso | Por qué ese y no otro |
|---|---|---|
| Licencias del tenant (`/subscribedSkus`) | `Organization.Read.All` | Es el único que habilita ese recurso. Es de lectura |
| Licencias de la persona | *(ya cubierto por `User.Read.All`)* | `assignedLicenses` sale en `/users/{id}` |
| Bloquear / desbloquear | **`User.EnableDisableAccount.All`** | Habilita escribir **solo** `accountEnabled`. `User.ReadWrite.All` daría escritura sobre **todos los atributos de todas las cuentas del tenant** a un secreto que vive en un `.env`: con él se puede cambiar el correo de cualquiera, incluido el de un administrador. Es el mismo razonamiento que llevó a `Sites.Selected` en REQ-SIG-13 §8, y un SGSI que se concede permisos excesivos a sí mismo es un hallazgo con razón |
| Revocar sesiones | **`User.RevokeSessions.All`** | Es el permiso propio de `revokeSignInSessions`. No requiere el anterior ni viceversa |
| *(solo si se aprueba D-2)* asignar licencias | **`LicenseAssignment.ReadWrite.All`** | Es el permiso específico de `assignLicense`. **No** `User.ReadWrite.All`, que es lo que la mayoría de los tutoriales sugiere y que trae de regalo todo lo del punto anterior |

**Tres cosas que verificar al conceder, y de las que el desarrollo no puede responder solo:**

1. **Que la aplicación no pueda tocar cuentas privilegiadas.** Microsoft restringe que una aplicación con estos permisos modifique usuarios con roles administrativos, pero la restricción y su alcance hay que **comprobarlos en el consentimiento**, no darlos por ciertos desde acá. Si no alcanza, se acota con Administrative Units.
2. **Si se separa la registración.** Sumar escritura sobre el Directorio a la misma registración que ya escribe en SharePoint concentra en un secreto la capacidad de publicar documentos y de deshabilitar cuentas. Ver D-7.
3. **Que la licenciación por grupo no pelee.** Si el tenant asigna licencias por pertenencia a grupo —lo habitual—, una asignación directa desde la aplicación convive mal con ella: el portal la muestra como directa y el grupo la vuelve a poner. Es otra razón para D-2.

---

## 8 · Bitácora y datos personales

**P23 · cada campo que cambia escribe su propia fila** (`tabla: 'persona'`, `campo`, `valorAnterior`, `valorNuevo`), y todo el guardado va en una transacción, igual que la sincronización. Una fila «se editó la persona» no responde qué cambió.

**P24 · el motivo se exige donde la decisión tiene consecuencia, y no en todas partes.** Obligatorio en: bloqueo, desbloqueo, anulación de pendientes y reasignación. Opcional en: teléfono, dirección, contactos, documento. Pedir motivo para corregir un teléfono convierte el campo en un trámite y lo que se obtiene son cien filas que dicen «actualización».

**P25 · la corrida de sincronización se sigue derivando de la bitácora, y este requerimiento no la puede ensuciar.** La franja de la pantalla reconstruye la última corrida buscando filas con `tabla: 'persona'` que comparten `ocurridoEn` (`page.tsx:49-59`), y ese rastro funciona porque hoy `sincronizarDirectorio` es su único escritor. **Este popup va a ser el segundo.** Sin hacer nada, una edición manual de tres campos se leería como una corrida de sincronización con tres actualizaciones. Se resuelve marcando el origen: la sincronización escribe `motivo: 'sincronización con el Directorio Activo'` (ya lo hace, `personas.ts:103`) y `resumirCorrida` filtra por ese motivo. **Es parte de este requerimiento, no una mejora aparte**: si no se hace, la franja empieza a mentir el día del despliegue.

**P26 · no se registra la lectura, y la pantalla no finge que sí.** El popup muestra documento de identidad, dirección y contactos de emergencia. La aplicación no tiene registro de accesos de lectura (la `ip` de `Bitacora` solo la puebla el flujo de anexos) y este requerimiento no lo construye. Lo que sí hace es limitar quién puede abrirlo (P2) y no exportar nunca los contactos de emergencia (P8.3).

**P27 · la marca de origen de la bitácora es también lo que hace legible el grupo derivado.** Una obligación de alcance `TODOS` no escribe filas de membresía, así que en la bitácora no hay rastro de «entró a Todos». El rastro que sí existe —y el que responde la pregunta de auditoría— es el alta de la persona y las asignaciones que se le crearon. Es correcto y hay que decirlo en el documento de trabajos: **para el grupo Todos, la evidencia de pertenencia es el alta**.

---

## 9 · Decisiones

**D-1 · El nombre y el correo no se editan en el SIG.** Se muestran de solo lectura, con la nota de que los manda el Directorio.
*Por qué:* `planificarSincronizacion` compara el nombre del Directorio contra el guardado y **genera un cambio que lo sobrescribe** (`personas.ts:86-106`). Un nombre editado en el popup duraría hasta las 05:00 del día siguiente. Un campo editable cuyo valor se revierte solo es peor que un campo bloqueado: parece funcionar. Y la doctrina ya está escrita en el esquema: «AD manda sobre nombre, correo y existencia; el SIG manda sobre área y cargo».
*Si se revierte:* habría que sacar el nombre del plan de sincronización, y con eso el SIG deja de reflejar los cambios de apellido del Directorio.

**D-2 · La pestaña de Licencias solo LEE en la versión 1.** ⚠️ **Requiere confirmación.**
*Por qué:* la escritura exige `LicenseAssignment.ReadWrite.All` sobre todo el tenant, pelea con la licenciación por grupo si el tenant la usa, y **quitar una licencia de Exchange arranca el reloj de 30 días para el borrado del buzón** — una consecuencia que no debería vivir detrás de una casilla en un popup del SIG. La lectura ya entrega el inventario de software por persona y el cruce «licencia activa en cuenta bloqueada», que es lo que hoy no existe.
*La alternativa intermedia, si se quiere avanzar sin darle escritura a la aplicación:* marcar la licencia deseada crea una `Solicitud` (el modelo ya existe, con solicitante / autoriza / ejecuta) para que TI la aplique, y queda la traza de quién la pidió y quién la autorizó.

**D-3 · Los grupos de interés viven en el SIG y no otorgan permisos** (§3.4, P11).
*Por qué:* «Desarrolladores» es un conjunto de gestión, no un grupo de seguridad. Espejar grupos de Azure tiene el problema que `permisos.ts:155-158` ya documenta para el grupo de Microsoft 365 que se retiró: «un grupo al que la gente se agrega para un chat es un grupo que nadie revisa antes de repartir el registro de activos». Y administrar la membresía en el SIG sin escribir en Azure mantiene una sola fuente de autorización.
*Si se revierte a espejo de Azure:* la pertenencia solo se cambia en Azure y hay que esperar la sincronización; el SIG pierde la capacidad de agrupar a gente que no tiene grupo propio en el Directorio.

**D-4 · Escribir la membresía en los grupos reales de Azure queda fuera.** ⚠️ **Requiere confirmación si se quiere.**
*Por qué:* exigiría `GroupMember.ReadWrite.All`, que incluye poder agregar a alguien al grupo `Líderes SIG` — el grupo que otorga acceso a la propia aplicación. Una herramienta que puede darse acceso a sí misma no es auditable.

**D-5 · Ningún periodo anterior a la pertenencia se genera, ni en el popup ni en el cron** (§5.2, P15). ⚠️ **Requiere confirmación: cambia la conducta del generador para todo el sistema, no solo para este popup.**
*Por qué:* es la regla R2 que `generacion.ts:132-133` ya declara y que el código no cumple. Sin el piso, poner un área a alguien hoy le crea nueve meses de tareas vencidas.
*Si se revierte* (aceptar la retroactividad): el popup tiene que informar el desglose «47 tareas, de las cuales 31 nacen vencidas», y hay que decidir qué se le dice a la persona que las recibe.

**D-6 · La generación al guardar corre en la misma transacción y solo para esa persona** (§5.1).
*Por qué:* el número informado tiene que ser un hecho verificable con un `count(*)`, no una previsión que el cron puede desmentir.

**D-7 · Se usa la misma registración de aplicación que ya existe.** ⚠️ **Requiere confirmación.**
*Por qué es una decisión y no un detalle:* la registración de `SHAREPOINT_CLIENT_ID` ya tendrá, con REQ-SIG-13, escritura sobre el sitio del SIG; sumarle deshabilitar cuentas concentra ambas capacidades en un secreto de un `.env` de un servidor. Separarlas en dos registraciones acota el daño de una fuga, al costo de un segundo secreto que rotar. **Lo decide quien administra la seguridad del tenant, no el desarrollo.**

**D-8 · El bloqueo no arranca la desvinculación** (P20).

**D-9 · `personas:bloquear` es un permiso propio, hoy concedido al único grupo que existe.**
*Por qué:* `permisos.ts:16-19` establece que el vocabulario de permisos se conserva entero aunque los escalones intermedios se hayan retirado, precisamente para que reabrir uno sea agregar una entrada en `POR_GRUPO` y nunca recorrer las pantallas de nuevo. Declararlo ahora deja la separación lista para el día en que el SIG tenga un grupo administrador más chico que `Líderes SIG`.

**D-10 · El grupo «Todos» es derivado y no se puede desmarcar** (P9, P10). ⚠️ **Requiere confirmación.**
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

Se agrega a `.env.example` con este comentario. Todo lo demás reusa las variables que ya existen; la pestaña de licencias no necesita ninguna: si falta `Organization.Read.All`, lo dice con el nombre del permiso (P7).

---

## 11 · Verificación — hecho significa demostrado

| # | Qué se comprueba | Cómo |
|---|---|---|
| 1 | El alcance `GRUPO_INTERES` resuelve igual en previsión y en generación | La prueba en jest que ya compara `personasAlcanzadas` con `resolverAlcance`, extendida al valor nuevo |
| 1b | Los dos casos que motivan el requerimiento | Obligación de concienciación → la reciben las 36 personas activas, incluida una creada después. Obligación de codificación segura → solo los marcados en Desarrolladores, y nadie más |
| 1c | El grupo derivado no admite miembros | Intentar guardar una membresía en Todos: rechazada. `SELECT count(*) FROM miembro_grupo_interes m JOIN grupo_interes g … WHERE g.derivado` = 0 |
| 2 | El piso de pertenencia | Obligación mensual con `fechaInicio` en enero + persona con `areaDesde` = hoy → **un** periodo, no nueve. Y la variante flotante: apertura = hoy, no enero |
| 3 | El número informado es el número creado | Guardar el área y comparar el mensaje contra `SELECT count(*) FROM asignacion WHERE persona_id = X AND creada_en > …` |
| 4 | El cron no agrega nada después | Correr `generar-asignaciones` tras el guardado: cero asignaciones nuevas para esa persona. Si aparece una, el número del popup era mentira |
| 5 | Idempotencia | Guardar la misma área dos veces: la segunda informa cero |
| 6 | El desglose por origen es correcto | Persona con cargo propietario de N activos y una obligación por tipo: el desglose separa área, cargo y activos |
| 7 | Quitar el área no borra pendientes | Cambiar de área: los pendientes anteriores siguen existiendo, se listan, y el mensaje los cuenta |
| 8 | Licencias sin permiso ≠ licencias vacías | Con `Organization.Read.All` sin conceder, la pestaña nombra el permiso que falta (`explicarFallo`) |
| 9 | El bloqueo bloquea de verdad | Con una cuenta de prueba con sesión abierta: tras bloquear, la sesión deja de servir **sin esperar una hora**; `accountEnabled=false` en Azure; `Persona.activa=false`; bitácora con motivo |
| 10 | Los tres bloqueos prohibidos | Autobloqueo, último responsable del SIG y persona inactiva: los tres rechazados con su frase |
| 11 | Los pendientes de quien se bloquea siguen abiertos | Ninguna asignación cerrada ni anulada por el bloqueo (P19) |
| 12 | El desbloqueo restituye | La cuenta vuelve, `Persona.activa=true`, y quedan las dos filas de bitácora |
| 13 | Sin la variable, sin botón | `GRAPH_BLOQUEO_HABILITADO` ausente o `false`: el botón no está en el DOM |
| 14 | La franja de sincronización no se ensucia | Editar tres campos a mano y recargar: la franja sigue mostrando la última corrida **de sincronización**, no la edición (P25) |
| 14b | Marcar un grupo no es retroactivo | Marcar Desarrolladores hoy con una obligación trimestral iniciada en enero: un periodo, el vigente (P15) |
| 15 | Teclado y foco | Pestañas navegables con flechas, `aria-selected` correcto, Escape cierra, el foco vuelve a la fila |

---

## 12 · Qué NO hace este requerimiento

- **No edita el nombre ni el correo** (D-1).
- **No crea personas.** El origen es el Directorio; `origen: MANUAL` es una anomalía por la regla C1 de REQ-SIG-09, no una vía de alta.
- **No borra personas.** La baja es lógica y ya está resuelta.
- **No asigna ni quita licencias** (D-2). Solo las lee.
- **No escribe membresías en grupos de Azure** (D-4).
- **No otorga permisos con los grupos de interés** (P11).
- **No administra los grupos de interés desde una pantalla propia.** Los dos se siembran en la migración; crear un tercero es una fila. La pantalla de administración de grupos —crear, renombrar, desactivar— es otro requerimiento y no hace falta para los dos casos que motivan este.
- **No cierra, anula ni reasigna tareas por su cuenta** al cambiar de área o de grupo, ni al bloquear (P4, P19).
- **No reemplaza el trámite de desvinculación** de REQ-SIG-09 (P20).
- **No corrige el histórico de asignaciones vencidas** que el defecto de §5.2 ya creó. Deja de crear nuevas; limpiar lo anterior es un requerimiento con su propia decisión sobre lo ya cerrado.
- **No deja que la persona edite sus propios datos de contacto.** El autoservicio en Mi SIG es deseable y es otro requerimiento: cambia quién puede escribir, y con eso las reglas de bitácora y de validación.
- **No borra buzones ni datos al bloquear.** El bloqueo deshabilita y revoca sesiones. Nada más.
