# Control de integración del SIG

**Fecha:** 02/09/2026 · **Estado:** revisión integral · **Fuente:** `prisma/schema.prisma` en la rama actual, más las políticas de `1. Gobierno de la Seguridad` (PDF v2, 31/08/2026) y `8. Continuidad del Negocio`.

Este documento no propone funcionalidad nueva. Responde dos preguntas: **si los módulos están realmente conectados** y **qué tareas exige el sistema documental que la aplicación todavía no puede generar**. Todo lo que se afirma acá está verificado contra el esquema, no contra las specs.

---

## 1. El grafo real, hoy

Estas son las llaves foráneas que efectivamente existen entre módulos. No es el diagrama que quisiéramos: es el que está compilando.

| Desde | Hacia | Cómo | Estado |
|---|---|---|---|
| `Activo` | `Riesgo` | `Riesgo.activoId` | ✅ |
| `Activo` | `Activo` | `superiorId` (jerarquía, un padre) | ✅ |
| `Activo` | `CargoResponsable` | `propietarioId`, `custodioId` | ✅ |
| `Activo` | `Proveedor`, `Ubicacion`, `Entorno`, `Area` | FK directa | ✅ |
| `Riesgo` | `Control` | vía `RiesgoControl` / `madurezId` | ✅ |
| `Control` | `Evidencia` | `Evidencia.controlId` | ✅ |
| `Hallazgo` | `Evidencia` | `Evidencia.hallazgoId` | ✅ |
| `Hallazgo` | `Riesgo` | `MaterializacionRiesgo` | ✅ |
| `Hallazgo` | `Asignacion` | `HallazgoAccion.asignacionId` | ✅ |
| `Hallazgo` | `Auditoria` | `HallazgoAuditoria.hallazgoId` | ✅ |
| `Hallazgo` | `RequisitoLegal` | `EvaluacionCumplimiento.hallazgoId` | ✅ |
| `Obligacion` | `Asignacion` → `RegistroRealizado` | FK directa | ✅ |
| `ParteInteresada` | `NecesidadExpectativa` → `SeguimientoParteAnual` | FK directa | ✅ |

### 1.1 El hallazgo estructural

Las once costuras que existen entre módulos **salen todas del hallazgo**. El hallazgo es hoy el nodo que integra el sistema: toca auditorías, riesgos, requisitos legales, evidencias y el motor de tareas.

**El activo no integra nada.** Sus únicas aristas salientes son hacia el riesgo y hacia sus propios catálogos (área, tipo, subtipo, ubicación, entorno, proveedor, cargo). Ningún módulo entra al activo. La afirmación «la base es activos y los gestionamos por diferentes ángulos» describe la intención del sistema documental, no el modelo de datos: en el modelo, el activo es una hoja que desagua en riesgos, y ni las obligaciones, ni los hallazgos, ni las auditorías, ni los requisitos legales, ni las partes interesadas pueden apuntarlo.

Esto no es un defecto de implementación —el desarrollador construyó lo que las specs pedían— sino un vacío de especificación que arrastramos desde el módulo A, y que la revisión de políticas de este documento vuelve urgente: **la mayoría de las obligaciones que las políticas imponen son por activo, no por persona.**

---

## 2. Las seis costuras que faltan

Ordenadas por lo que desbloquean.

### 2.1 `Obligacion` no tiene alcance por activo — **crítico**

`Obligacion.alcance` admite `alcancePersonaId`, `alcanceCargoId`, `alcanceAreaId`. No hay `alcanceActivoId` ni alcance por tipo o nivel de activo.

Consecuencia concreta: POL-TEC-01 exige que *«los derechos de acceso sean revisados al menos una vez al año por el propietario de cada activo»*. Hoy eso solo se puede cargar como una obligación anual sobre un cargo, con el activo nombrado en el título en texto libre. Se pierde la trazabilidad activo → tarea → registro, que es justo lo que un auditor pide, y se rompe el invariante *«origen tipado, nunca texto libre»*.

**Propuesta:** ampliar `AlcanceObligacion` con `ACTIVO` (un activo concreto), `TIPO_ACTIVO` y `NIVEL_ACTIVO`. Con alcance por tipo o nivel, la generación produce una asignación por activo vigente al abrir el periodo, dirigida a su propietario. Una sola obligación cubre los 234 activos y sigue vigente cuando entre el 235.

### 2.2 `Hallazgo` no puede apuntar a un activo

`Hallazgo` tiene `areaId` y `origenReferencia String`, con un comentario que dice que ahí van `auditoriaId`, `riesgoId` o `controlId`. Es decir: el origen tipado que especificamos quedó implementado como texto. Un incidente sobre un servidor se registra hoy sin poder decir sobre cuál.

**Propuesta:** `Hallazgo.activoId Int?`, opcional, poblado cuando el origen lo permite. Habilita la pregunta que hoy no tiene respuesta: *qué le ha pasado a este activo*.

### 2.3 No existe `Proceso`

En el esquema solo hay `Area`. Pero el SIG entero se organiza por proceso: los dueños de tarea son por proceso, el programa de auditoría es por proceso, los indicadores son por proceso, y `RequisitoLegal.procesoEncargado` es un **String**. Hoy «área» hace de dos cosas a la vez y el proceso es texto en al menos una tabla.

**Propuesta:** decidir explícitamente si área y proceso son la misma entidad. Si lo son, tipar `procesoEncargado` como FK a `Area` y dejarlo dicho. Si no lo son —y la matriz FOR-CAL-04 sugiere que no del todo— hace falta `Proceso` antes de seguir colgándole cosas a `Area`.

### 2.4 `Proveedor` y `ParteInteresada` son la misma empresa en dos tablas

El proveedor de nube es un `Proveedor` para el inventario de activos y una `ParteInteresada` para la gestión estratégica, sin ninguna relación entre los dos registros. POL-TEC-02 exige **reevaluación anual del proveedor**: esa tarea no tiene dónde colgarse, porque ninguna de las dos tablas es el sujeto de una obligación.

**Propuesta:** `ParteInteresada.proveedorId Int?`. No fusionarlas —una parte interesada puede ser un cliente o un ente de control— sino permitir que apunten a la misma organización cuando lo sean.

### 2.5 `RequisitoLegal` no llega al activo

Un requisito de habeas data aplica a los sistemas que tratan datos personales. El activo ya tiene `datosPersonales`, `datosCliente` y `expuestoInternet`: el dato para cruzarlos existe y nadie lo cruza.

**Propuesta:** dejar la evaluación de cumplimiento como está y agregar una vista derivada —no una tabla— que liste, para cada requisito, los activos que cumplen su criterio. Es reporte, no modelo.

### 2.6 REQ-SIG-06 completo sigue sin construirse

`NivelActivo`, `PlantillaNivel`, `DependenciaActivo`, `Despliegue`, `Producto`, `VersionProducto` y `EtapaCicloVida` no existen en el esquema, y `Activo.personaId` tampoco. La jerarquía actual es `superiorId`, de un solo padre, que no distingue «está dentro de» de «depende de».

---

## 3. Lo que las políticas exigen y el inventario de tareas no tiene

Revisión de las siete políticas de Gobierno de la Seguridad (versión PDF, v2 del 31/08/2026) y los ocho documentos de Continuidad del Negocio.

### 3.1 Obligaciones con periodicidad explícita — se pueden cargar ya

| Obligación | Periodicidad | Fuente | Alcance |
|---|---|---|---|
| Capacitación formal en seguridad con evaluación aprobada | Anual | POL-TAL-01 | Toda persona |
| Programa de concienciación aprobado y con responsable | Anual | POL-TAL-01 | Responsable SIG |
| Revisión de cada política y verificación de vigencia | Anual | POL-SIG-02 | Dueño de la política |
| Revisión de derechos de acceso | Anual | POL-TEC-01 | **Propietario de cada activo** |
| Revisión de accesos privilegiados | Semestral | POL-TEC-01 | Tecnología |
| Revisión de excepciones a MFA | Anual | POL-TEC-01 | Tecnología |
| Reevaluación del proveedor | Anual | POL-TEC-02 | **Por proveedor** |
| Verificación de certificación de proveedores de nube | Anual | Continuidad | **Por proveedor** |
| Revisión de alertas de Wazuh | Semanal | Continuidad | Tecnología |
| Revisión de alertas de acceso anómalo | Mensual | Continuidad | Tecnología |
| Consolidación de estadística de incidentes | Trimestral | Continuidad | Responsable SIG |
| Revisión de criterios evento → incidente | Anual | Continuidad | Responsable SIG |
| Ejercicio de mesa | Anual | Continuidad | Comité |
| Análisis de impacto al negocio (BIA) | Anual | Continuidad | Comité |
| Verificación de redundancia | Semestral | Continuidad | Tecnología |
| Prueba del plan de continuidad | Anual | Continuidad | Comité |
| Respaldos con regla 3-2-1 | Diaria | Continuidad | Tecnología |
| Mantenimiento preventivo de equipos | Anual | Continuidad | **Por equipo** |
| Autoevaluación del puesto de trabajo remoto | Anual | Continuidad | Toda persona |

Diecinueve obligaciones. **Cuatro de ellas tienen alcance por activo, equipo o proveedor y por lo tanto no se pueden cargar hasta que exista §2.1 y §2.4.** Las quince restantes sí.

### 3.2 Obligaciones sin periodicidad definida — no se pueden generar

Trece obligaciones están escritas como *«con la periodicidad definida por la organización»* o *«periódicamente»*, y esa definición no aparece en ninguno de los quince documentos revisados.

| Obligación | Fuente |
|---|---|
| Revisión por la dirección | POL-SIG-02 |
| Verificación del directorio de autoridades y grupos de interés | POL-SIG-02 |
| Monitoreo del cumplimiento de políticas y estándares | POL-SIG-02 |
| Revisión de procedimientos | POL-SIG-02 |
| Revisión integral del inventario de activos | POL-SIG-03 |
| Revisión de los modelos de acuerdo de confidencialidad | POL-TAL-01 |
| Revisión de riesgos de la cadena de suministro TIC | POL-TEC-02 |
| Revisión de accesos, permisos e integraciones de proveedores | POL-TEC-02 |
| Revisión de servicios en la nube contra los requisitos | POL-TEC-02 |
| Verificación de configuración vigente contra la línea base | POL-TEC-03 |
| Revisión de la relación de software autorizado y prohibido | POL-TEC-03 |
| Verificación de eficacia de las listas de bloqueo | POL-TEC-03 |
| Revisión de excepciones al filtrado web | POL-TEC-03 |
| Revisión de informes de protección física de proveedores | POL-TEC-07 |

Esto no es un problema de la aplicación: es un vacío del sistema documental. Una política que delega la periodicidad y luego nadie la define produce un control que en auditoría no tiene cómo demostrarse.

> **Resuelto el 02/09/2026 (D7).** Se adoptó el default: anual para gobierno y documentos, semestral para proveedores y accesos, trimestral para línea base y software. Las catorce quedan cargables. **La brecha documental sigue abierta:** la periodicidad ahora vive en la aplicación y no en un documento aprobado, y hay que llevarla al comité.

### 3.2.1 Tres huecos en formación y autoevaluación

Detectados el 02/09/2026 al revisar si Mi SIG cubre capacitación, evaluación de conocimientos y autoevaluación del puesto.

**a) «Quien no la apruebe repetirá la formación» no está implementado.** POL-TAL-01 lo dice literalmente. Hoy `RegistroRealizado.aprobado` se guarda en `false` y **la asignación se cierra igual**: nada regenera la capacitación. Falta la regla —y la decisión de si el reintento es una asignación nueva del mismo periodo o una prórroga de la existente.

**b) La aplicación registra la calificación, no la produce.** No hay banco de preguntas ni presentación del examen: alguien evalúa por fuera y digita la nota. Es defendible, pero hay que dejarlo dicho para que nadie espere otra cosa de la frase «evaluación de conocimientos».

**c) La autoevaluación del puesto de trabajo remoto (FOR-SIG-13) no está cargada.** Encaja como contenido de tipo `VERIFICACION` con obligación anual a toda persona (D7), así que el motor sirve sin cambios. Faltan dos definiciones: si el registro de usuario, fecha y hora cuenta como la **firma** que la política exige, o hace falta una declaración explícita como la de la lectura; y el **disparador de vinculación**, porque la política la pide *al vincularse* además de periódicamente, y el motor genera por periodo.

Lo que sí queda cubierto: los contenidos diferenciados por rol que pide la política —codificación segura para desarrollo, accesos privilegiados para quien administra plataformas— se resuelven con el alcance por cargo, que ya existe.

### 3.3 Deberes por evento, no periódicos

No son tareas del motor de obligaciones, y conviene dejarlo dicho para que no se intenten modelar ahí: revocación de accesos el mismo día de la desvinculación; inducción de seguridad antes de otorgar accesos; notificación de incidentes del proveedor dentro de las 24 horas; actualización del inventario al crear, modificar, trasladar o dar de baja un activo; vencimiento a 90 días de una excepción de dispositivo. Los tres primeros son disparadores del módulo de personas; el cuarto es el inventario mismo; el quinto es un plazo, no una periodicidad.

### 3.4 Dos discrepancias entre documentos

Ambas son del sistema documental, no de la aplicación, y hay que resolverlas antes de cargar:

1. **Autoevaluación del puesto de trabajo remoto:** POL-TAL-01 la referencia como **FOR-SIG-13** y los documentos de continuidad como **FOR-SIG-16**. Son códigos distintos para el mismo formato. → **Resuelto (D9): vale FOR-SIG-13**, y hay que corregir los documentos de continuidad.
2. **Pruebas de restauración de respaldos:** un documento de continuidad las pide **trimestrales** y otro dice **al menos semestrales**. → **Resuelto (D8): se carga semestral.** Eso obliga a modificar el documento que pide trimestral *antes* de cargar la obligación; si no se modifica, quedan dos documentos propios en contradicción y el auditor la encuentra.

---

## 4. Renombre: «Operación» → «Actividades»

Aplicado el 02/09/2026 en las cinco specs. La quinta pestaña del header pasa a llamarse **Actividades**: Mi SIG · Indicadores · Estratégico · SGSI · Actividades.

El motivo es que «operación» estaba tomada tres veces —el numeral 8 de las normas, la pestaña, y el módulo del SGSI que agrupa eventos, verificaciones y solicitudes— y tres cosas con el mismo nombre en la misma barra de navegación no se distinguen al hablar. Con la pestaña renombrada, **«Operación del SGSI» (M3/M4/M6) conserva su nombre**, porque ya no colisiona: es una sección dentro de SGSI, no una pestaña.

**El cambio es de nombre visible, no de vocabulario interno.** Las claves de permiso siguen siendo `operacion:*` y las rutas siguen siendo `/sig/...`. Renombrarlas obligaría a tocar todos los archivos de acciones sin ganar nada funcional, y una clave a medio renombrar es un permiso que no concede nada.

Alcance del cambio en código: `app/components/sgsi/EncabezadoSig.tsx` y los títulos de la barra lateral.

---

## 5. Tablero de control

| Módulo | Especificado | Construido |
|---|---|---|
| A · Personas y tareas (REQ-SIG-02) | v1.1 | Sí, salvo R12 |
| B · Mejora NC/ACPM (REQ-SIG-03) | v1.1 | Sí |
| C · Auditorías internas (REQ-SIG-04) | v1.1 | Sí, salvo permiso de auditor por asignación |
| D · Gestión estratégica (REQ-SIG-05) | v1.1 | Sí |
| E · Gestión tecnológica (REQ-SIG-06) | v1.0 · §3.5 provisional por D14 | **No** |
| F · Operación del SGSI (REQ-SIG-07) | v1.0 | **No** |
| G · Ciclo de vida de desarrollo seguro (REQ-SIG-08) | Solo análisis | **No** |

Brechas abiertas, en orden de impacto. Las decisiones del 02/09/2026 están en [decisiones-2026-09-02.md](decisiones-2026-09-02.md); acá queda lo que falta **construir**.

| # | Brecha | Decisión |
|---|---|---|
| 1 | Alcance de obligación por activo, tipo y nivel (§2.1) | **D3** — ampliar `AlcanceObligacion` |
| 2 | REQ-SIG-06 completo (§2.6) | Sin construir |
| 3 | Entidad `Proceso` y migración de auditorías, indicadores, requisitos legales y dueños de tarea (§2.3) | **D1, D2** |
| 4 | Fusión de `Proveedor` y `ParteInteresada` (§2.4) | **D4** |
| 5 | `Hallazgo.activoId` y origen tipado, hoy `origenReferencia String` (§2.2) | Pendiente — pero **`ActivoAfectado` de REQ-SIG-07 §3.2 ya abre la primera costura al activo** |
| 6 | `Anclaje` (R12) — especificado en REQ-SIG-02, sin `ANCLADA`/`FLOTANTE` en el esquema | Pendiente |
| 7 | Versionado de `ContenidoSig` sin invalidar registros | **D6** |
| 8 | `Evidencia` con dueño obligatorio | **D5** |
| 9 | Operación del SGSI | **D13** — spec escrita 02/09/2026, sin construir |
| 10 | Permiso de auditor por asignación — `PerfilAuditor.aprobadoEn` sí se exige, la habilitación por asignación no se construyó | Pendiente |
| 11 | Tres comentarios obsoletos en `lib/sgsi/permisos.ts` y uno en `app/sgsi/acciones/controles.ts:502` que describen un modelo de roles retirado | Limpieza |

Las catorce periodicidades (§3.2) dejan de ser brecha de software con D7 y pasan a ser brecha documental: hay que llevarlas al comité.
