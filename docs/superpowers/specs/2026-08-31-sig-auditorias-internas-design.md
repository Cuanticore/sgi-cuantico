# Auditorías internas — Especificación y diseño

**Fecha:** 2026-08-31
**Código:** REQ-SIG-05
**Versión:** 1.0
**Módulo:** C — Auditorías internas (ISO 9001 §9.2 · ISO/IEC 27001 §9.2)
**Depende de:** módulo A (`2026-08-31-sig-personas-tareas-design.md`) · módulo B (`2026-08-31-sig-mejora-nc-acpm-design.md`)
**Fuentes documentales:** `PRO-CAL-04 Planificación y ejecución de auditorías v3.0` · `FOR-CAL-04 Programa de Auditoría v2` · `FOR-CAL-06 Plan de Auditoría` · `FOR-CAL-07 Informe de Auditoría v1` · cinco auditorías archivadas de 2025 y 2026
**Estado:** Aprobado, sin implementar

---

## 1. Contexto

Los módulos nuevos del SIG son 0+A (personas y tareas), B (mejora), D (gestión estratégica) y C (auditorías internas). Este documento es **C**, el último de la serie, y depende de los dos primeros.

### 1.1 Lo que se encontró en el repositorio del SIG

| Fuente | Contenido |
|---|---|
| `PRO-CAL-04 v3.0` | Define los tres tipos de auditoría —primera parte (interna), segunda (proveedores), tercera (certificación)—, el perfil del auditor y el ciclo completo: programar → seleccionar auditores → plan → comunicar → apertura → ejecutar → cierre → informe → socializar → seguimiento hasta cerrar las NC **a través de `PRO-CAL-03`**, que es el módulo B. |
| `FOR-CAL-04 v2` | Programa: grilla proceso × mes, con tipo, responsable y tiempo máximo de entrega del informe. El de 2026 programa los 9 procesos en febrero. |
| `FOR-CAL-07 v1` | El informe es un libro de **tres hojas**: `PLAN` (matriz proceso × numeral de la norma, con la hora), `NOTAS AUDITOR` (proceso, requisito, nota/evidencia, tipo) e `INFORME` (generalidades, equipo auditor, conclusiones, fortalezas, oportunidades de mejora, recomendaciones, firma). |
| Cinco auditorías archivadas | Vocabulario real de hallazgo: **OK · NC · OM · RM · Fortaleza**. Histórico: 2025 → 2 y 4 NC; 2026 → 76 notas con 0 NC, 15 OM, 1 RM y 2 fortalezas. |
| Versiones Preliminar y Final | El informe de 2026 existe en ambas. El borrador del auditor y el informe emitido son dos cosas distintas, y el modelo lo respeta. |

### 1.2 Decisión de alcance

`PRO-CAL-04` cubre los tres tipos de auditoría, pero solo la interna se controla de punta a punta. **La auditoría interna se planea, ejecuta y cierra dentro de la herramienta; la externa y la de proveedores se registran** —fecha, entidad, alcance, informe adjunto y hallazgos— para que alimenten Mejora y la revisión por la dirección. El auditor externo trabaja con sus propias herramientas y no hay razón para pretender lo contrario.

---

## 2. Alcance

### 2.1 Dentro del alcance

- **Programa anual** (`FOR-CAL-04`), cuya elaboración en el primer bimestre es una obligación del motor de A.
- **Catálogo de numerales** de ISO 9001:2015 (4.1 a 10.3) e ISO/IEC 27001:2022. Los 93 controles del Anexo A ya están en la base desde el SGSI; los numerales de gestión no.
- **Auditores y su competencia** según el perfil del §5.2 de `PRO-CAL-04`: formación, certificación, vigencia, experiencia y aprobación del Consulting Director.
- **Plan de auditoría** (`FOR-CAL-06`): la matriz proceso × numeral con hora y auditor.
- **Ejecución**: una nota por celda, con evidencia y tipo.
- **Actas** de apertura y cierre.
- **Informe** (`FOR-CAL-07`) en versión preliminar y final.
- **Emisión del final** y promoción de NC y OM a hallazgos del módulo B.
- **Registro de auditorías externas y a proveedores.**
- Tablero con cobertura de la norma y cumplimiento del programa.
- Exportación del informe a Excel con sus tres hojas, y a PDF.

### 2.2 Fuera del alcance

| Qué | Por qué |
|---|---|
| Ejecutar auditorías externas en la herramienta | Ver §1.2. |
| Firma electrónica del informe | Fuera desde REQ-SIG-01 §2.2. Se adjunta el PDF firmado, como hoy. |
| Gestión de competencias como módulo | Solo se guardan los datos que `PRO-CAL-04` exige para habilitar a un auditor. El plan de formación es de Talento Humano. |
| Revisión por la dirección | No fue pedida. El informe queda disponible para cuando ese módulo exista. |

---

## 3. Modelo de datos

| Entidad | Contenido |
|---|---|
| **`NormaAuditable`** | `codigo` (ISO 9001:2015), `nombre`, `version`, `activa` |
| **`RequisitoNorma`** | `normaId`, `numeral` (`4.1`), `titulo`, `orden`, `auditable` — los encabezados de capítulo no lo son |
| **`ProgramaAuditoria`** | `anio`, `alcance`, `objetivo`, `criterios`, `metodos`, `aprobadoPorId`, `fechaAprobacion` |
| **`AuditoriaProgramada`** | `programaId`, `procesoRef`, `normas`, `meses`, `tipo` (INTERNA · EXTERNA · PROVEEDOR), `responsableId`, `plazoInformeDias` |
| **`Auditoria`** | `programadaId?`, `tipo`, `fechaInicio`, `fechaFin`, `sitio`, `objeto`, `alcance`, `criterios`, `auditorLiderId`, `entidadAuditora?`, `cerradaEn?` |
| **`EquipoAuditor`** | `auditoriaId`, `personaId?` o `nombreExterno`, `papel` (LÍDER · AUDITOR · EN_FORMACIÓN · EXPERTO) |
| **`CeldaPlan`** | `auditoriaId`, `procesoRef`, `requisitoNormaId`, `hora`, `auditorId`, `planificada` — es la hoja PLAN |
| **`NotaAuditor`** | `celdaId`, `notaEvidencia`, `tipo` (OK · NC · OM · RM · FORTALEZA), `fecha`, `auditorId`, `hallazgoId?` |
| **`ActaAuditoria`** | `auditoriaId`, `tipo` (APERTURA · CIERRE), `fecha`, `asistentes`, `contenido`, archivo |
| **`InformeAuditoria`** | `auditoriaId`, `version` (PRELIMINAR · FINAL), `fechaInforme`, `conclusiones`, `recomendaciones`, `emitidoPorId`, `emitidoEn` |
| **`PerfilAuditor`** | `personaId?` o nombre externo, `formacion`, `certificacion`, `entidadCertificadora`, `vigencia`, `experienciaAnios`, `aprobadoPorId`, `aprobadoEn` |

Las fortalezas y las oportunidades del informe no se capturan dos veces: se derivan de las notas por su tipo. El informe guarda lo que no está en ninguna nota — conclusiones y recomendaciones.

### 3.1 Cuatro decisiones explícitas

1. **Los numerales son un catálogo, no una constante.** Pasar a una versión nueva de la norma es cargar una norma, no desplegar código — la misma regla que rige escalas y umbrales en todo el sistema.
2. **La nota cuelga de una celda del plan.** Así la cobertura de la norma es medible y el informe no tiene notas huérfanas. Auditar algo no planeado se permite: se agrega la celda y queda marcada `planificada = false`, que es un dato interesante en sí mismo.
3. **Preliminar y final son versiones del informe, no estados de la auditoría.** Emitir el final es el acto que congela las notas y promueve los hallazgos. Es la distinción que los archivos de 2026 ya hacen.
4. **El estado de la auditoría se calcula.** Planificada, en ejecución, con informe preliminar o emitida se deducen de lo que la auditoría tiene. Lo único almacenado es `emitidoEn` y `cerradaEn`, que son actos de una persona.

---

## 4. Pantallas

La barra lateral de Operación queda en nueve entradas y se agrupa con separadores, como la del SGSI ya hace con `CONFIGURACIÓN`:

> **TAREAS** OBL · CAL · TAR · CON — **MEJORA** HAL · MEJ — **AUDITORÍA** PRG · AUD — **CONFIGURACIÓN** PER · NRM

| Pantalla | Contenido |
|---|---|
| **Programa** | La grilla anual proceso × mes con tipo, responsable y plazo, tal cual `FOR-CAL-04`, más el estado de cada casilla: ejecutada, pendiente o vencida. |
| **Auditoría (ficha)** | Cuatro pestañas. **Plan**: la matriz proceso × numeral, marcable, con hora y auditor. **Ejecución**: las notas filtrables por proceso, numeral y tipo, con el contador de OK / NC / OM a la vista. **Actas**: apertura y cierre. **Informe**: preliminar y final, con conclusiones, fortalezas, oportunidades y recomendaciones, y el botón de emitir. |
| **Auditorías externas** | Registro con entidad, alcance, fechas, informe adjunto y sus hallazgos. |
| **Normas y requisitos** | El catálogo de numerales, administrable. |
| **Tablero de auditoría** | Cobertura de la norma en el año, hallazgos por proceso y por numeral, cumplimiento del programa y días de entrega del informe contra el plazo. |

---

## 5. Reglas de negocio

| # | Regla |
|---|---|
| **C1** | El programa se elabora en el **primer bimestre** de cada año (`PRO-CAL-04`), y esa elaboración es una obligación del motor de A con su fecha y su responsable. |
| **C2** | **Independencia:** el auditor de una celda no puede ser el responsable del proceso auditado. Bloqueo en el servidor, no advertencia en la interfaz. |
| **C3** | Solo una persona con **perfil de auditor aprobado** por el Consulting Director puede ser auditor líder. |
| **C4** | Toda nota cuelga de una celda del plan. Se puede agregar una celda no planificada durante la ejecución; queda marcada como tal. |
| **C5** | **Emitir el informe final congela las notas** y promueve cada NC y cada OM a hallazgo del módulo B, con origen tipado a la auditoría, el proceso y el numeral. Reabrir exige motivo y queda en bitácora. |
| **C6** | No se emite el final **sin acta de cierre**. |
| **C7** | El plazo de entrega del informe viene del programa; el vencimiento se calcula, no se marca. |
| **C8** | Una auditoría externa registrada exige entidad, fechas, alcance e informe adjunto; sus hallazgos se capturan y se promueven igual. |
| **C9** | **Fortalezas y recomendaciones no generan hallazgo.** Se conservan en el informe y alimentan la revisión por la dirección. Convertir una recomendación en compromiso es una decisión, no un automatismo. |
| **C10** | Bajas lógicas y bitácora en todo, como en el resto del sistema. |

---

## 6. Roles y permisos

Permisos nuevos: `auditoria:ver`, `auditoria:ejecutar`, `auditoria:administrar`.

| Rol | Qué hace |
|---|---|
| **Colaborador (auditado)** | Ve las notas de su proceso **una vez emitido el informe**, y ejecuta las acciones que le lleguen por Mejora. |
| **Auditor** | Escribe notas y arma el informe, solo en las auditorías donde está asignado. Es un permiso **por asignación**, no un grupo de AD: quien audita cambia en cada ciclo, y un grupo de Directorio no puede seguir ese ritmo. |
| **Responsables SIG** | Programa, aprueba auditores, emite informes y registra las externas. |
| **SIG-Auditoría** | Lectura total, incluidos los borradores y la bitácora. |

---

## 7. Indicadores

Todos calculados: cumplimiento del programa anual; **cobertura de la norma**, es decir qué numerales no se auditaron en el año; hallazgos por tipo, proceso y numeral; días de entrega del informe contra el plazo del programa; y no conformidades de auditorías anteriores todavía abiertas.

---

## 8. Criterios de aceptación

| Criterio | Verificación |
|---|---|
| Programa | El programa 2026 se carga con sus 9 procesos en febrero y sus responsables. |
| Plan | La matriz proceso × numeral del informe 2026 se reproduce y arroja las **76 notas** del archivo. |
| Vocabulario | OK, NC, OM, RM y Fortaleza se registran y se cuentan por separado. |
| Emisión | Emitir el final de 2026 crea **15 oportunidades de mejora y ninguna no conformidad** como hallazgos en Mejora, con origen a la auditoría, el proceso y el numeral. |
| Preliminar | Mientras el informe esté en preliminar, ninguna nota aparece en Mejora — comprobado por llamada directa a la API. |
| Independencia | El sistema no deja asignar a un auditor su propio proceso, comprobado también por API. |
| Cobertura | El tablero indica qué numerales de ISO 9001 no se auditaron en el año. |
| Externas | La auditoría de ICONTEC 2026 se registra con su informe y sus hallazgos. |
| Trazabilidad | Todo cambio en bitácora con autor, fecha, valor anterior y motivo. |

---

## 9. Qué sigue

Con C queda cerrada la serie de especificaciones. Lo siguiente es el **plan de implementación**, en el orden de dependencias: **A → B → D → C**. A es el sustrato; B consume su motor de tareas; D consume A y B; C consume A y B y cierra el ciclo de mejora.
