# REQ-SIG-07 · Operación del SGSI

**Fecha:** 02/09/2026 · **Versión:** 1.0 · **Estado:** especificado, sin implementar
**Módulos del análisis original:** M3 (eventos e incidentes), M2 y M4 (verificaciones y medición), M6 (solicitudes y accesos)
**Superficie:** sección «Operación del SGSI» dentro de la pestaña **SGSI**
**Diseño aprobado:** `docs/handoff_operacion/design/` — seis artboards
**Decisión que la habilita:** D13 del [registro del 02/09/2026](../../handoff_sig/decisiones-2026-09-02.md)

> **Sobre el nombre.** La pestaña que antes se llamaba «Operación» pasó a llamarse **Actividades**. Este módulo conserva «Operación del SGSI» porque ya no colisiona: es una sección dentro de SGSI, no una pestaña, y «operación» es el numeral 8 de la norma, que es exactamente lo que agrupa.

---

## 1. Contexto

Los seis artboards se diseñaron y aprobaron el 01/09/2026 a partir del artefacto «Registros SGSI», y quedaron como lo único del paquete sin especificación formal. Esta spec los convierte en modelo, sin agregar pantallas ni cambiar decisiones ya tomadas.

Tres cosas que el módulo devuelve al sistema y que hoy no existen en ninguna parte:

1. **El evento de seguridad.** REQ-SIG-01 §2.2 lo dejó explícitamente fuera de alcance. Es el único mecanismo del SGSI que quedó sin construir, y es el que alimenta el origen `incidente` que el módulo de Mejora ya acepta.
2. **La medición con umbral.** La cláusula 9.1 pide medir; hoy se mide en hojas de cálculo y el umbral vive en la cabeza de quien la mantiene.
3. **El acceso como relación con vigencia.** La matriz del consultor pone una columna por empleado, así que cada ingreso altera la estructura de la tabla y el histórico se pierde al sobrescribir la celda.

---

## 2. Alcance

### 2.1 Dentro del alcance

- Reporte de eventos de seguridad, abierto a toda la organización.
- Evaluación con veredicto y ciclo de vida completo del incidente.
- Verificaciones programadas con listas de comprobación y su histórico de ejecuciones.
- Métricas del SGSI con umbral, serie histórica y alerta.
- Solicitudes con aprobación, en cuatro tipos y un solo flujo.
- Accesos y perfiles como relaciones con vigencia, consultables a cualquier fecha.

### 2.2 Fuera del alcance

- **El hallazgo.** No se replica: vive en Mejora (REQ-SIG-03) con su origen apuntando acá. Es la misma tabla que usan auditoría, verificaciones y proveedores, y por eso se puede responder cuántos hallazgos abiertos hay en total.
- **El motor de tareas.** Las verificaciones se programan con el motor del módulo A (REQ-SIG-02), no con un segundo planificador. Ver §3.3.
- **La gestión de identidades en el directorio.** El módulo registra qué acceso tiene quién y con qué sustento; no crea ni revoca cuentas en Azure AD.
- **El riesgo.** La materialización de un riesgo por un incidente ya está resuelta en `MaterializacionRiesgo`.

---

## 3. Modelo de datos

### 3.1 `EventoSeguridad` — una entidad, el veredicto adentro

Mismo patrón que `Hallazgo`: **una sola entidad cuyo código no encodifica el tipo**. Un evento no cambia de identidad al declararse incidente; gana un veredicto.

| Campo | Tipo |
|---|---|
| `codigo` | `String @unique` — `EVT-2026-0031`, inmutable |
| `descripcion` | `String` — lo que reportó quien lo vio, **no se edita nunca** |
| `fechaOcurrencia` | `DateTime` |
| `enCurso` | `Boolean` — «¿sigue ocurriendo?» |
| `dondeId` | `Int?` → catálogo `LugarEvento` |
| `otrosEnterados` | `String?` |
| `reportadoPorId` | `Int` → `Persona` |
| `veredicto` | `enum Veredicto?` — `INCIDENTE` · `OBSERVACION` · `FALSO_POSITIVO`. Nulo hasta evaluar |
| `justificacion` | `String?` — obligatoria cuando hay veredicto |
| `evaluadoPorId`, `fechaEvaluacion` | evaluación |
| `motivacionId` | `Int?` → catálogo `MotivacionIncidente` |
| `leccionAprendida` | `String?` — obligatoria para cerrar (A.5.27) |
| `costoRecuperacion`, `costoImpacto` | `Decimal?` — **cero también es un dato**: dice que se contuvo |
| `causaRaiz` | `String?` |
| `fechaCierre`, `cerradoPorId` | cierre |

**No hay columna de severidad, y no debe haberla.** La severidad es el mayor de los tres impactos declarados. **No hay columna de estado**: se calcula del veredicto y las marcas de cierre. **No hay columna de tiempo hasta evaluar**: es `fechaEvaluacion − creadoEn`.

### 3.2 Lo que cuelga del evento

| Entidad | Contenido |
|---|---|
| `CategoriaIncidente` | Catálogo cerrado de diez valores, parametrizable |
| `EventoCategoria` | N:M — un evento admite varias. **Sin texto libre en lo que se va a contar:** es lo que permite responder «cuántos incidentes de phishing hubo este año», que es el indicador de la cláusula 9.1 |
| `ImpactoEvento` | `(eventoId, dimension, nivel)` — tres filas, una por Confidencialidad, Integridad y Disponibilidad. `nivel` ∈ `NINGUNO` · `BAJO` · `MEDIO` · `ALTO` |
| **`ActivoAfectado`** | `(eventoId, activoId)` → **`Activo`** |
| `AccionIncidente` | La línea de tiempo: `fase`, `momento`, `texto`, `autorId`. `fase` ∈ `DETECCION` · `EVALUACION` · `CONTENCION` · `COMUNICACION` · `ERRADICACION` · `RECUPERACION` |
| `Evidencia` | La que ya existe, con `eventoId` añadido — se conserva tal cual porque es material de prueba (A.5.28) |

> **`ActivoAfectado` es una de las costuras que el control de integración pedía.** Es el primer punto del sistema en que un módulo distinto de Riesgo apunta al activo. Con ella, la pregunta «qué le ha pasado a este activo» tiene respuesta por primera vez.

### 3.3 Verificaciones — el motor del módulo A, no uno nuevo

**Decisión de modelo, y es la que más código ahorra.** Una verificación programada es exactamente lo que el módulo A ya hace: un contenido con ítems, una obligación con periodicidad, y una asignación por periodo.

| Concepto de esta pantalla | Entidad que lo implementa |
|---|---|
| La verificación y sus puntos | `ContenidoSig` + `ItemVerificacion` (módulo A) |
| Su periodicidad, responsable y **anclaje** | `Obligacion` (módulo A), con `anclaje` de la regla **R12** |
| Cada ejecución | `Asignacion` (módulo A) |
| El resultado de la ejecución | **`EjecucionVerificacion`**, nueva, colgada de la asignación |

`EjecucionVerificacion`: `asignacionId` (`@unique`), `resultado` ∈ `CONFORME` · `HALLAZGO` · `NO_CONFORME`, `nota`, `hallazgoId?` → `Hallazgo`.

Lo único nuevo es el resultado. El calendario, los vencimientos, los avisos y el cierre ya están construidos y probados.

Dos campos más en `Obligacion` para esta pantalla: `controlAnexoA String?` (A.5.22, A.5.18, A.5.34, A.5.30) y `esProveedor Boolean` — que es lo que conecta con la reevaluación anual de POL-TEC-02 y con la fusión de D4.

### 3.4 `Metrica` y `MedicionMetrica`

| Campo | Tipo |
|---|---|
| `codigo` | `String @unique` — `MET-01` |
| `controlAnexoA` | `String` — A.8.8, A.8.6, A.6.3 |
| `titulo`, `unidad` | `String` |
| `umbral` | `Decimal` |
| `sentido` | `enum` — `MENOR_ES_MEJOR` · `MAYOR_ES_MEJOR` |
| `periodicidad` | la misma enumeración del módulo A |
| `responsableId` | `Int` → `Persona` |

`MedicionMetrica`: `(metricaId, periodo)` `@unique`, `valor`, `registradoPorId`, `fecha`.

**El umbral es un dato de la métrica, nunca un número en el código.** Es el invariante de siempre, y acá se ve por qué: MET-02 tiene umbral 80 % y MET-04 tiene umbral 15 días.

**No existe tabla de alertas.** Una medición está en alerta cuando cruza el umbral en el sentido malo, y eso se calcula. Lo que sí se persiste es la reacción: cuando una medición cruza el umbral, se abre una **asignación** del módulo A a su responsable, y esa asignación es la que aparece como `ASG-0311` en la pantalla.

> **La tendencia es la alerta, no el dato suelto.** MET-02 lleva tres meses consecutivos por encima. Eso lo tiene que decir la pantalla; el modelo solo necesita la serie completa, que es lo que da tener una fila por periodo en vez de tres bloques de columnas repetidos.

### 3.5 `Solicitud` — cuatro tipos, un flujo

| Campo | Tipo |
|---|---|
| `codigo` | `String @unique` — `SOL-2026-0088` |
| `tipo` | `enum TipoSolicitud` — `CAMBIO_TI` (A.8.32) · `ACCESO` (A.8.2) · `DEVOLUCION` (A.5.11) · `UTILITARIO` (A.8.18) |
| `titulo`, `detalle`, `justificacion` | `String` |
| `solicitanteId` | `Int` → `Persona` |
| `vigenciaDesde`, `vigenciaHasta` | `DateTime?` — solo en permisos temporales |
| `esEmergencia` | `Boolean @default(false)` |
| `autorizadoPorId`, `fechaAutorizacion`, `notaAutorizacion` | paso 2 |
| `rechazada` | `Boolean @default(false)` |
| `ejecutadoPorId`, `fechaEjecucion`, `notaEjecucion` | paso 3 |

**El estado no se almacena:** «Por autorizar», «Autorizada», «Ejecutada» y «Rechazada» salen de qué marcas están puestas.

### 3.6 `PerfilAcceso` y `AccesoPersona`

`PerfilAcceso`: `nombre`, `sistema`, `descripcion`, `activo`.

`AccesoPersona`: `personaId`, `perfilId`, `desde` (`Date`), `hasta` (`Date?` — nulo significa vigente), `solicitudId?` → `Solicitud`.

**Una fila por relación, con fecha de inicio y de fin.** Dar de alta es insertar filas; dar de baja es cerrarlas. La estructura de la tabla nunca cambia y el pasado no se pierde. Es la diferencia entre poder responder «quién tenía acceso al CRM el 31 de diciembre» y no poder.

---

## 4. Reglas de negocio

**O1 · Reportar está abierto a cualquier persona autenticada, sin permiso previo.** Mismo patrón que `reportarHallazgo`: la acción verifica sesión, no permiso.

**O2 · El formulario de reporte no pide gravedad, categoría, activos afectados, impacto ni causa raíz.** Pedirle a quien reporta que clasifique la gravedad es la forma más eficaz de que no reporte. Todo eso lo decide la evaluación.

**O3 · La justificación del veredicto es obligatoria en los tres veredictos**, no solo cuando es incidente. Archivar como falso positivo sin decir por qué es peor que no evaluar.

**O4 · Solo `INCIDENTE` abre el ciclo completo.** Con `OBSERVACION` o `FALSO_POSITIVO` el evento se archiva en la misma pantalla de evaluación y las tres etapas siguientes no aplican.

**O5 · La severidad es derivada: el mayor de los tres impactos.** Una sola dimensión en alto basta para que el incidente sea alto. Nunca se captura ni se almacena.

**O6 · Sin lección aprendida no se cierra un incidente.** Control A.5.27, y es la única forma de que el mecanismo produzca aprendizaje en vez de archivo.

**O7 · Con impacto `ALTO` en cualquier dimensión, tampoco se cierra sin análisis de causa raíz**, y ese análisis se levanta como hallazgo en Mejora con método declarado.

**O8 · El hallazgo no vive en el incidente.** Vive en Mejora, con `origen = INCIDENTE` y la referencia tipada al evento.

**O9 · Anclaje de la verificación (regla R12 del módulo A).**
- `ANCLADA`: el periodo siguiente nace se haya cerrado el anterior o no. Una ejecución vencida no desplaza a la siguiente y la deuda se acumula a la vista. Es lo que un auditor espera de una revisión trimestral: **el trimestre existió aunque nadie lo mirara.**
- `FLOTANTE`: el siguiente nace al cerrar el previo, a los días de plazo. Se reserva para lo que depende de un intervalo —una evaluación de proveedor— y no para lo que depende del calendario.
- **Riesgo del anclaje flotante que hay que mostrar en pantalla:** una verificación que nadie cierra deja de generar periodos, y su primera ejecución vencida es el único aviso que habrá.

**O10 · El umbral no está en el código.** Es un campo de la métrica, con su sentido.

**O11 · Separación de funciones en las solicitudes: quien autoriza no puede ser quien pide.** La única excepción es el **cambio de emergencia**, que se marca como tal, se autoriza y ejecuta de inmediato para contener un incidente, y se documenta después. La excepción se registra, no se esconde: `esEmergencia` es visible en la ficha y contable en el tablero.

**O12 · Un acceso es una relación con vigencia, nunca una casilla que se sobrescribe.**

**O13 · Un acceso vigente sin solicitud que lo respalde es un hallazgo.** La revisión trimestral de accesos debe explicar por qué existe o retirarlo.

**O14 · Un permiso temporal se retira solo al vencer**, y el retiro deja registro de lo que se hizo mientras estuvo vigente.

**O15 · La descripción original del reporte no se edita.** Es la versión de quien lo vio, y su valor está en no haber sido corregida por quien evalúa.

---

## 5. Pantallas

Sección «Operación del SGSI» dentro de la pestaña **SGSI**, en tres agrupaciones.

| Pantalla | Contenido |
|---|---|
| **Reportar un evento** | Formulario corto, abierto a toda la organización, con la lista explícita de lo que **no** se pide. Botón en rojo, porque es el único de la aplicación que se usa con prisa |
| **Ficha del evento** | Cuatro etapas —Evaluación, Clasificación, Tratamiento, Cierre— donde las tres últimas se atenúan si el veredicto no es incidente. Con la línea de tiempo, los activos afectados y los hallazgos levantados |
| **Verificaciones programadas** | Lista con estado y anclaje, ficha con los puntos de comprobación y el histórico completo de ejecuciones, cada una con su resultado y su hallazgo si lo hubo |
| **Métricas del SGSI** | Lista con último valor contra umbral, y ficha con la serie, la línea de umbral y las alertas del histórico con la tarea que abrieron |
| **Solicitudes** | Lista filtrable por tipo y ficha con los tres pasos —pide, autoriza, ejecuta— y de las tres cosas queda fecha |
| **Accesos y perfiles** | La consulta **a una fecha**: quién tenía qué acceso ese día. Con el conteo de accesos sin sustento y el botón de levantar hallazgo |

---

## 6. Roles

Con el modelo de dos roles vigente desde el 01/09/2026:

| Acción | Quién |
|---|---|
| Reportar un evento | **Cualquier persona autenticada**, sin permiso (O1) |
| Ver el estado del evento que reportó | Quien lo reportó |
| Evaluar, clasificar, tratar y cerrar | `Líderes SIG` |
| Definir verificaciones, métricas y perfiles | `Líderes SIG` |
| Registrar una ejecución o una medición | El responsable asignado, vía su asignación del módulo A |
| Solicitar | Cualquier persona autenticada |
| Autorizar | Quien la parametrización defina por tipo, **nunca el solicitante** (O11) |

---

## 7. Criterios de aceptación

1. Una persona sin ningún permiso del SGSI puede reportar un evento y recibe aviso cuando se evalúa.
2. Un evento evaluado como falso positivo sin justificación **no se guarda**.
3. Declarar impacto `ALTO` en una dimensión bloquea el botón de cerrar hasta que exista causa raíz.
4. Cambiar el veredicto de incidente a observación atenúa las tres etapas siguientes sin borrar lo ya capturado.
5. La severidad mostrada cambia sola al cambiar cualquiera de los tres impactos, y no existe en la base de datos.
6. Una verificación `ANCLADA` cuyo periodo venció genera igual el periodo siguiente; una `FLOTANTE` no.
7. Registrar una medición por encima del umbral abre una asignación a su responsable.
8. Una solicitud no se puede autorizar por su propio solicitante salvo que esté marcada como emergencia.
9. Consultar accesos al 31/12/2025 muestra a Camilo Restrepo; consultarlos hoy, no.
10. Un acceso sin `solicitudId` aparece marcado y contable en el resumen.
11. Cerrar un incidente crea el registro; reabrirlo conserva el anterior.

---

## 8. Costuras con el resto del sistema

| Hacia | Cómo |
|---|---|
| **Activo** | `ActivoAfectado` — primera vez que un módulo distinto de Riesgo apunta al activo |
| **Mejora** | `Hallazgo.origen = INCIDENTE`, `= VERIFICACION`, `= PROVEEDOR` |
| **Riesgo** | `MaterializacionRiesgo`, que ya existe |
| **Módulo A** | Las verificaciones son obligaciones y asignaciones; las alertas de métrica abren asignaciones |
| **Proveedores** | `Obligacion.esProveedor` enlaza con la reevaluación anual de POL-TEC-02 y con la fusión de D4 |
| **REQ-SIG-08** | La `Solicitud` de tipo `CAMBIO_TI` es la solicitud de cambio `CAM-2026-041` que FOR-TEC-04 exige en la puerta P5. **No se crea otra entidad.** |

---

## 9. Lo que queda por decidir

1. **Quién autoriza por tipo de solicitud.** El diseño muestra «rol Gerente General» para un utilitario sobre producción y el jefe directo para un acceso. Hay que parametrizarlo por tipo, y decidir si el autorizador es un cargo o una persona.
2. **Si el aviso al reportante es correo o solo notificación en la aplicación.** El módulo A ya tiene el motor de correo.
3. **Cuánto dura un permiso temporal como máximo.** POL-TEC-01 fija 90 días para las excepciones de dispositivo; para los utilitarios sobre producción el diseño muestra 4 horas y no hay política que lo respalde.
4. **Si `AccesoPersona` se concilia contra el Directorio Activo** o se mantiene declarativo. Conciliar detecta accesos que nadie solicitó; no conciliar deja la matriz como una declaración de intenciones.
