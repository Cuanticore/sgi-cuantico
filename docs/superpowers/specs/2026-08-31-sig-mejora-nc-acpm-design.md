# Mejora: no conformidades y acciones correctivas — Especificación y diseño

**Fecha:** 2026-08-31
**Código:** REQ-SIG-03
**Versión:** 1.1 — reconciliada con el código el 01/09/2026
**Módulo:** B — Mejora (ISO 9001 §10.2 · ISO/IEC 27001 §10)
**Depende de:** módulo A (`2026-08-31-sig-personas-tareas-design.md`) — entidad `Persona` y motor de asignaciones
**Estado:** **Implementado.** Plan B ejecutado, 11 tareas
**Reconciliación:** el modelo de roles cambió al construir. Ver §7.

---

## 1. Contexto

Los cuatro dominios nuevos del SIG se descomponen en 0 (personas), A (tareas), B (mejora) y C (auditorías internas), según §1 de la especificación del módulo A. Este documento es **B**.

Del código actual se verificó lo siguiente antes de diseñar:

1. **No existe nada de NC/ACPM.** «OC» en el código de Indicadores significa Objetivo de Calidad (`app/lib/oc-utils.ts`), no oportunidad de mejora.
2. **`AccionPlan` sí existe** y es el plan de tratamiento del SGSI: responsable, aprobador distinto del responsable, fechas, evidencia, estado y `VerificacionEficacia`. Tiene semántica propia del tratamiento de riesgos —tipo `MITIGAR`/`TRANSFERIR`/`EVITAR`/`ACEPTAR`, madurez objetivo, control asociado— y **no se toca** en este módulo.
3. **`Evidencia`** ya resuelve anexos con versionado, baja lógica y bytes en base.
4. **`ContadorCodigo`** ya resuelve consecutivos seguros frente a concurrencia.

### 1.1 El riesgo de diseño que decidió el modelo

Si B inventara su propia acción correctiva, el SIG quedaría con **tres nociones distintas de «algo que alguien debe hacer con una fecha»**: `Asignacion` (A), `AccionPlan` (SGSI) y la acción del hallazgo. La decisión fue: **la acción de un hallazgo es una asignación del motor de A**. Un responsable mira una sola bandeja.

Consecuencia sobre A, ya incorporada a su especificación: `Asignacion.contenidoId` pasa a opcional y una asignación puntual lleva título y descripción propios. Sin eso, cada acción correctiva crearía un contenido basura en el catálogo.

---

## 2. Alcance

### 2.1 Dentro del alcance

- Entidad **Hallazgo** con tipo, consecutivo anual y origen tipado hacia el registro que lo produjo.
- **Corrección** inmediata, **análisis de causa raíz** con método declarado, y la evaluación de extensión que exige ISO 9001 §10.2.1 d: ¿el mismo problema existe en otra parte?
- **Acciones** como asignaciones del motor de A, con su papel: corrección, correctiva o de mejora.
- **Verificación de eficacia** con evidencia y **cierre con separación de funciones**.
- **Reincidencia**: enlazar un hallazgo con el que lo antecede; reabrir cuando la verificación resulta no eficaz.
- Grilla de hallazgos, ficha de cinco pestañas y tablero de mejora.
- Hallazgos abiertos visibles desde la pantalla de su origen (control del Anexo A, riesgo, indicador).
- Exportación del acta de hallazgo a Excel y PDF, con el patrón de la Declaración de Aplicabilidad.

### 2.2 Orígenes que el módulo reconoce

| Origen | Referencia |
|---|---|
| Auditoría interna | `auditoriaId` + proceso + numeral, promovido al emitir el informe final del módulo C. |
| Auditoría externa o de cliente | Referencia de texto: entidad auditora, informe y fecha. |
| Queja, PQRS o salida no conforme | Referencia de texto: número, fecha, cliente. |
| Indicador incumplido | Código del indicador y periodo, contra el tablero del SGC. |
| Revisión por la dirección | Acta y fecha. |
| SGSI | `riesgoId` o `controlId`, referencia real a la base. |
| Verificación programada | `asignacionId` — la ejecución concreta que levantó el hallazgo. Ampliado el 31/08/2026 por `RF-HAL-14`. |
| Incidente de seguridad | `incidenteId` — del módulo de Operación del SGSI. Ampliado el 31/08/2026. |
| Proveedor | `proveedorId` + la verificación que lo detectó. Ampliado el 31/08/2026. |
| Otro | Texto libre. |

**Ampliación del 31/08/2026.** El análisis de los registros del SGSI (`RF-HAL-14` y `RF-HAL-15`) confirma que el hallazgo debe modelarse **una sola vez** para los seis mecanismos, y agrega tres orígenes: verificación, incidente y proveedor. No cambia nada del modelo —el origen ya era tipado por la regla B11—, solo crece el enum y sus referencias. La razón que da el documento es la correcta: si cada mecanismo define su propia tabla de hallazgos, nadie puede responder «cuántos hallazgos abiertos tengo», que es la primera pregunta de un auditor.

Verificado contra el repositorio documental del SIG: existen los formatos `FOR-CAL-02 Formato de acciones correctivas y de mejora`, `FOR-CAL-03 Control de planes de acción`, `FOR-CAL-01 Identificación y control de salidas no conformes` y el procedimiento `PRO-CAL-03 Acciones correctivas y oportunidades de mejora`, que son la fuente funcional de este módulo. `FOR-CAL-08 Reporte de Incidentes de Riesgo` —núm. del riesgo, fecha, proceso, riesgo/oportunidad, descripción del evento, impacto generado, causa raíz y reportante— es la materialización que el módulo D convierte en hallazgo de este módulo.

### 2.3 Fuera del alcance

| Qué | Por qué |
|---|---|
| Auditorías internas | Es el módulo C. Hasta que exista, un hallazgo de auditoría se captura a mano con su referencia. |
| Ciclo de PQRS | No se administra la queja: se referencia y se trabaja el hallazgo que produjo. |
| Incidentes de seguridad | Fuera desde REQ-SIG-01 §2.2. Se referencia como texto. |
| Firma electrónica | Ídem. El cierre queda con usuario, fecha y hora. |
| Modificar `AccionPlan` | Conserva su semántica del tratamiento de riesgos. Unificarlo no aporta nada que la vista de Mi SIG no resuelva. |

---

## 3. Modelo de datos

| Entidad | Contenido | Notas |
|---|---|---|
| **`Hallazgo`** | `codigo` (`HAL-2026-0001`), `tipo`, `origen` + referencia tipada, `descripcion`, `requisitoIncumplido` (norma y numeral), `evidenciaObjetiva`, `areaId`, `detectadoPorId`, `fechaDeteccion`, `clasificadoPorId?`, `fechaClasificacion?`, `responsableId?`, `fechaCompromiso?`, `hallazgoAnteriorId?`, `fechaCierre?`, `cerradoPorId?`, `anuladoEn?`, `motivoAnulacion?` | **El código no lleva el tipo.** Si lo llevara, reclasificar una observación reincidente a NC rompería la trazabilidad. Misma regla que el código de activo del SGSI: el código es inmutable, el tipo es un atributo consultable. |
| **`AnalisisCausa`** | `hallazgoId`, `metodo` (`CINCO_PORQUES` · `ISHIKAWA` · `LIBRE`), el desarrollo estructurado del método, `causaRaiz` conclusiva, `realizadoPorId`, `fecha` | El método se declara y se guarda desarrollado, no como un párrafo suelto: es lo que un auditor pide ver. Cinco porqués guarda los cinco pasos; Ishikawa, las causas por categoría. |
| **`ExtensionProblema`** | `hallazgoId`, `evaluada`, `existeEnOtraParte`, `analisis`, hallazgos derivados | ISO 9001 §10.2.1 d. Sin este registro la NC se cierra sin haber preguntado lo que la norma obliga a preguntar. |
| **`HallazgoAccion`** | Puente `hallazgoId` ↔ `asignacionId` con `papel` (`CORRECCION` · `CORRECTIVA` · `MEJORA`) | El motor de A no necesita saber que existen los hallazgos: la dependencia va en un solo sentido. |
| **`VerificacionEficaciaHallazgo`** | `hallazgoId`, `fecha`, `verificadoPorId`, `resultado` (`EFICAZ` · `NO_EFICAZ`), `evidencia`, `nota` | Son varias, no una: si la primera resulta no eficaz, la siguiente se agrega y el historial completo queda. |
| **`PlazoPorTipoHallazgo`** | `tipo`, `diasAnalisis`, `diasEjecucion`, `diasVerificacion` | Tabla parametrizable desde la interfaz, con historial. Ningún plazo vive en el código, por la regla de REQ-SIG-01 §4. |

### 3.1 Tres decisiones explícitas

1. **El estado del hallazgo se calcula, no se guarda.** Abierto, en análisis, en ejecución y en verificación se deducen de lo que el hallazgo tiene: si hay análisis, si quedan acciones abiertas, si hay verificación eficaz. Lo único almacenado son las marcas de **cerrado** y **anulado**, que son actos de una persona y no resultados de un cálculo.
2. **La verificación de eficacia se agenda como asignación.** Al cerrarse la última acción, el motor de A crea una asignación puntual para el líder del SIG con la fecha de verificación derivada de `PlazoPorTipoHallazgo`. Una NC no se queda esperando a que alguien se acuerde: aparece en la bandeja de quien debe verificar.
3. **La evidencia vuelve a ser la misma tabla.** `Evidencia` gana `hallazgoId` opcional, junto al `controlId` y al `registroId` del módulo A. Tres consumidores, un solo manejo de archivos, versionado y baja lógica.

---

## 4. Flujo escalonado por tipo

| Paso | NC mayor | NC menor | Observación | Oportunidad de mejora |
|---|---|---|---|---|
| Corrección inmediata | Obligatoria | Obligatoria si el efecto ya ocurrió | — | — |
| Análisis de causa | Obligatorio, **método declarado** | Obligatorio, método libre | Opcional | — |
| ¿Existe en otra parte? | Obligatorio | Obligatorio | — | — |
| Acción | Correctiva, al menos una | Correctiva, al menos una | Opcional | Al menos una de mejora |
| Verificación de eficacia | Obligatoria con evidencia | Obligatoria | Solo si hubo acción | Solo si hubo acción |
| Cierre | Líder del SIG | Líder del SIG | Líder del SIG | Líder del SIG |

---

## 5. Pantallas

El header tiene cinco pestañas (Mi SIG · Indicadores · Estratégico · SGSI · Operación). Mejora entra como dos entradas más de la barra lateral de Operación: `HAL` y `MEJ`.

| Pantalla | Contenido |
|---|---|
| **Hallazgos** | Grilla con código, tipo, origen, área, responsable, fecha de detección, plazo con semáforo y estado calculado. Filtros por tipo, origen, área, estado, vencidos y reincidentes. |
| **Ficha del hallazgo** | Cinco pestañas: Identificación · Corrección · Causa raíz · Acciones · Eficacia y cierre, con la franja inferior fija de estado y botones, igual que la ficha del activo del SGSI. **Las pestañas que el tipo no exige se muestran atenuadas, no ocultas**: quien registra ve lo que la norma no le pide, y entiende por qué. |
| **Tablero de mejora** | Hallazgos por tipo, origen y área; edad promedio de cierre; vencidos con su antigüedad; tasa de eficacia; reincidencias. Cada tarjeta navega a la grilla con el filtro puesto. |
| **Pantallas de origen** | Un control del Anexo A, un riesgo o un indicador muestran los hallazgos abiertos que los referencian. Es lo que evita que el módulo sea una isla. |

---

## 6. Reglas de negocio

| # | Regla |
|---|---|
| **B1** | Consecutivo anual `HAL-AAAA-NNNN`, generado por el sistema, inmutable y seguro frente a concurrencia, con el patrón de `ContadorCodigo`. |
| **B2** | **Reclasificar cambia lo que el flujo exige, nunca el código.** Queda en bitácora con motivo. Si sube el rigor, los pasos que faltan quedan pendientes; nada se da por cumplido. |
| **B3** | **Cualquiera reporta; solo el líder del SIG clasifica.** Un reporte sin clasificar existe y es visible, pero no consume plazos hasta que se clasifica. |
| **B4** | **Nadie cierra su propio hallazgo:** `cerradoPorId ≠ responsableId`, y cerrar exige `mejora:cerrar`. Si el responsable es miembro de Responsables SIG, cierra otro. |
| **B5** | No se cierra sin verificación eficaz cuando el tipo la exige. Validado en el servidor, no solo en la interfaz. |
| **B6** | **Una verificación no eficaz no cierra ni anula:** el hallazgo vuelve a exigir acción, la verificación queda en el historial, y el sistema advierte que la causa raíz probablemente no era la causa. |
| **B7** | Plazos por tipo parametrizables desde la interfaz, con historial. |
| **B8** | Vencido se calcula contra el plazo; no es una marca que alguien deba poner. |
| **B9** | Anular exige motivo y rol administrador. Nunca hay borrado físico. |
| **B10** | **Reincidencia:** al crear un hallazgo se puede enlazar el anterior, y el sistema sugiere candidatos por área y requisito incumplido. Tener antecesor pesa en el tablero. |
| **B11** | **Origen tipado:** cuando el origen es un riesgo, un control o un indicador, se guarda la referencia, no un texto libre. |
| **B12** | Las acciones se crean, ejecutan y cierran en el motor de A, con sus reglas: solo el responsable cierra, y el cierre administrativo queda marcado y contado aparte. |

---

## 7. Roles y permisos

Permisos nuevos: `mejora:reportar`, `mejora:ver`, `mejora:escribir`, `mejora:cerrar`.

> **Reconciliado el 01/09/2026.** Los cuatro roles de la versión 1.0 son hoy **dos**: `SIG-Propietarios` y `SIG-Auditoría` se retiraron porque nunca existieron en el Directorio. La razón completa está en §6.0 de la especificación del módulo A.

| Rol · grupo de AD | Qué hace |
|---|---|
| **Colaborador** | Reporta hallazgos y ejecuta las acciones que le asignen. |
| **`Líderes SIG`** | Clasifica, fija plazos, registra causa raíz y acciones, verifica eficacia, cierra y anula. |

### 7.1 Dos notas sobre cómo quedó el permiso de reportar

**`reportarHallazgo` no exige permiso, exige sesión.** La acción usa `autorActual`, no `autorConPermiso` (`app/sig/acciones/hallazgos.ts:32`). Es lo correcto y cumple la regla B3 —cualquiera reporta—, pero conviene saber que la compuerta real es «estar autenticado», no el permiso.

**`mejora:reportar` quedó como vocabulario sin uso.** Se declara en el tipo `Permiso`, se otorga **solo a Colaborador** —no a `Líderes SIG`— y no se comprueba en ninguna parte: su única aparición fuera de `permisos.ts` es una etiqueta en la pantalla de diagnóstico. Hoy no hace daño. Si mañana alguien lo usa como compuerta del formulario de reporte, **dejaría fuera al líder del SIG**, que es justo quien más hallazgos levanta. O se le agrega a `POR_GRUPO`, o se retira del tipo.

---

## 8. Indicadores

Todos calculados, ninguno almacenado:

- Hallazgos abiertos por tipo, por origen y por área.
- Vencidos y antigüedad del más viejo.
- Tiempo promedio de cierre por tipo.
- **Tasa de eficacia**: verificadas eficaces sobre verificadas.
- **Tasa de reincidencia**: hallazgos con antecesor sobre el total.
- Cumplimiento del plan de acciones, que viene del motor de A.

---

## 9. Criterios de aceptación

| Criterio | Verificación |
|---|---|
| Consecutivo | Dos altas simultáneas no obtienen el mismo código. |
| Reclasificación | Pasar de observación a NC mayor conserva el código y deja pendientes los pasos que faltan. |
| Flujo | Una NC mayor no se deja cerrar sin causa raíz con método, sin evaluación de extensión y sin verificación eficaz — comprobado por llamada directa a la API. |
| Separación de funciones | El responsable no puede cerrar su propio hallazgo aunque tenga rol administrador. |
| No eficaz | Una verificación no eficaz deja el hallazgo abierto y conserva el historial completo. |
| Integración con A | Las acciones del hallazgo aparecen en Mi SIG del responsable, junto a lo recurrente. |
| Origen | Un hallazgo originado en un control del Anexo A se ve desde la pantalla de ese control. |
| Trazabilidad | Todo cambio en bitácora con autor, fecha, valor anterior y motivo. |

---

## 10. Qué sigue

1. Módulo **D — Gestión estratégica** (`2026-08-31-sig-gestion-estrategica-design.md`): partes interesadas, requisitos legales, y riesgos y oportunidades organizacionales.
2. Módulo **C — Auditorías internas** (`2026-08-31-sig-auditorias-internas-design.md`), que alimenta el origen «auditoría interna» de este módulo: al emitir el informe final, cada NC y cada OM se promueve a hallazgo con `auditoriaId`, proceso y numeral.
