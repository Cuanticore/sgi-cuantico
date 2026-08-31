# Cargue de datos · todas las entidades

**Fecha:** 2026-08-31
**Para:** el desarrollador que implemente los módulos A, B, D y C
**Alcance:** cada entidad del sistema, de dónde salen sus datos, en qué orden se carga y qué la bloquea

---

## Cómo leer este documento

Cada entidad cae en **uno de cinco orígenes**, y el origen decide el trabajo:

| Origen | Qué significa | Trabajo |
|---|---|---|
| **Ya cargado** | Vive en la base desde el SGSI. No se toca. | Ninguno · verificar que está |
| **Migración** | Existe en un Excel real y hay que traerlo con paridad verificable. | Importador + prueba de paridad |
| **Semilla** | Sale de un documento normativo o de la norma misma. | Script de siembra |
| **Directorio** | Lo trae Microsoft Graph. | Sincronización |
| **Desde cero** | No existe en ninguna parte. Lo construye la organización usando la aplicación. | Solo el CRUD |
| **Se genera** | Nunca se carga: lo produce el sistema al operar. | Ninguno · **cargarlo es un error** |

La última fila importa más de lo que parece. Sembrar asignaciones, registros de realizado o riesgos calculados produce un sistema que arranca mintiendo, y la mentira no se ve hasta la primera auditoría.

---

## 0 · Lo que ya está cargado

No es trabajo de este paquete, pero hay que saber que está: los cuatro módulos nuevos se apoyan en ello y ninguno debe duplicarlo.

| Entidad | Contenido | Verificar |
|---|---|---|
| `Area` | 10 áreas con su prefijo de tres letras | Que las nueve de proceso estén activas |
| `CargoResponsable` | Catálogo de cargos | Que exista el valor protegido «No aplica» |
| `Proveedor` · `Ubicacion` · `Entorno` | Catálogos del inventario | — |
| `TipoMagerit` · `SubtipoMagerit` | 10 tipos · 137 subtipos del Libro II | — |
| `Amenaza` · `AmenazaTipo` · `AmenazaDegradacion` | 57 amenazas y su aplicabilidad por tipo | — |
| `DominioAnexoA` · `CapacidadOperativa` · `Control` · `ControlAmenaza` | 4 dominios · 15 capacidades · 93 controles del Anexo A | — |
| `Dimension` · `EscalaValor` · `EscalaDegradacion` · `EscalaFrecuencia` · `EscalaMadurez` | Escalas del método MAGERIT | — |
| `UmbralImpacto` · `UmbralRiesgo` · `RelevanciaControl` · `CriterioAceptacion` · `Parametro` | Umbrales y parámetros globales | — |
| `Activo` · `ActivoValor` · `ContadorCodigo` | 234 activos con su valoración D/I/C | — |
| `Riesgo` · `RiesgoDegradacion` · `RiesgoCalculo` · `TratamientoRiesgo` | 2.256 riesgos, **calculados, no cargados** | — |
| `AccionPlan` · `EstadoTratamiento` | 25 acciones del plan de tratamiento | — |
| `Evidencia` · `EvidenciaArchivo` · `Bitacora` · `LineaBase` | Evidencia, auditoría y líneas base | — |

**Nota para el plan A2:** `Evidencia.controlId` es hoy obligatorio. Volverlo opcional para reusar la tabla en los módulos nuevos es una de las decisiones abiertas.

---

## 1 · Módulo A · Personas y tareas

### Orden

```
Persona  →  ContenidoSig  →  ItemVerificacion  →  Obligacion  →  (generar)
```

| Entidad | Origen | Volumen | Fuente y notas |
|---|---|---|---|
| **`Persona`** | Directorio | ~34 | Microsoft Graph con el app credential que ya existe (`SHAREPOINT_*`). El `oid` es la identidad, no el correo. **Bloquea todo lo demás: sin personas no hay a quién asignar.** |
| `Persona.areaId` · `cargoId` | Desde cero | 7 nombradas | La tabla del §2 de `configuracion-base-tareas.md`. El resto de la organización queda sin área hasta que alguien la ponga; no bloquea. |
| **`ContenidoSig`** | Semilla + desde cero | 10 + N | Los diez de `contenidos-capacitacion.md` son semilla. Las lecturas, verificaciones y tareas salen del levantamiento por procedimiento, que **no está hecho**: es trabajo del líder del SIG con cada líder de proceso. |
| `ItemVerificacion` | Desde cero | — | Uno a N por cada contenido de tipo verificación. |
| **`Obligacion`** | Desde cero | ~31 estimadas | El registro del numeral 8. No existe consolidado en ninguna parte: `FOR-CAL-11 Cronograma SGC` es una plantilla sin diligenciar. |
| `Asignacion` | **Se genera** | ~128/periodo | Nunca se carga. La produce la generación idempotente. |
| `RegistroRealizado` · `RespuestaItem` | **Se genera** | — | Se crean al cerrar una asignación. |
| `EnvioNotificacion` | **Se genera** | — | Se crea al enviar cada resumen. |

### Reglas de esta carga

1. **Sincronizar el Directorio antes que nada.** Es el paso 1 real.
2. **Ninguna obligación con `fechaInicio` retroactiva.** Cargar con fecha pasada genera de golpe todos los periodos vencidos y estrena el sistema con deuda que nadie contrajo.
3. **Las cuatro capacitaciones de alcance «todas las personas» no van en el mismo mes.** Con 34 personas son ~150 asignaciones al año solo de capacitación.
4. **Preferir alcance por cargo o área sobre alcance por persona.** El primero sobrevive a la rotación; el segundo deja obligaciones huérfanas.

---

## 2 · Módulo B · Mejora

### Orden

```
PlazoPorTipoHallazgo  →  Hallazgo  →  (análisis, acciones, verificaciones)
```

| Entidad | Origen | Volumen | Fuente y notas |
|---|---|---|---|
| **`PlazoPorTipoHallazgo`** | Desde cero | 4 | Días para analizar, ejecutar y verificar, por tipo. **No están definidos en ningún documento**: hay que decidirlos con el líder del SIG antes de cargar el primer hallazgo, porque de ellos sale el vencimiento. |
| **`Hallazgo`** | Migración opcional | 20 | Los del año 2026: 15 oportunidades del informe de auditoría interna, más los de auditoría externa y los de origen propio. Cargar el histórico es opcional; sin él el tablero de mejora arranca vacío y la tasa de reincidencia no significa nada el primer año. |
| `AnalisisCausa` · `ExtensionProblema` | Migración parcial | — | Solo los que tengan análisis documentado en `FOR-CAL-02`. El resto queda pendiente en el flujo. |
| `HallazgoAccion` | Migración | — | Puente al motor de A. **Requiere que A esté cargado**: cada acción es una asignación. |
| `VerificacionEficaciaHallazgo` | Migración parcial | — | Las que consten en el formato. |

### Regla de esta carga

El consecutivo `HAL-2026-NNNN` debe respetar el orden cronológico real de detección, no el orden en que se carguen las filas. Si se cargan desordenados, el código deja de decir algo sobre cuándo se detectó cada uno.

---

## 3 · Módulo D · Gestión estratégica

Es la carga más grande y la única con **paridad de cálculo exigida**.

### Orden

```
catálogos del método  →  ParteInteresada  →  AnalisisContexto  →  RiesgoOrganizacional  →  ControlRiesgoOrg
```

### 3.1 Catálogos del método · semilla desde `MAN-CAL-01 v2.0`

| Entidad | Volumen | Contenido |
|---|---|---|
| `EscalaProbabilidad` | 5 | Muy baja · Baja · Media · Alta · Muy alta, con su valor 1 a 5 |
| `EscalaImpactoRiesgo` | 5 | Muy bajo a Muy alto, con % del patrimonio y valor de referencia en COP |
| `EscalaImpactoOportunidad` | 5 | Escala cualitativa propia, sin referencia económica |
| `FactorRiesgo` | 6 | Legal · Operacional · Personal · Tecnológico · Reputacional · Externo |
| `TipoControlRiesgo` | 6 | Preventivo · Correctivo · Preventivo y correctivo · Reforzador · Reactivo · Proactivo, **cada uno con su campo `reduce`** |
| `EficaciaControl` | 3 | Débil 10 % · Moderado 40 % · Fuerte 80 % |
| `NivelRiesgo` | 3 | 0–4 Aceptable · 5–12 Moderado · 13–25 Inaceptable, con su acción para riesgo y para oportunidad |

**Estos siete van primero.** Sin ellos no se puede calcular nada, y cargarlos mal invalida la paridad.

Dos advertencias tomadas del propio manual:

- El nivel 13–25 se llama **Inaceptable**. El manual lo llama «Impactante» en la tabla de tratamiento: es un error del documento fuente, no una segunda categoría.
- «Reactivo» está definido en el manual y **la matriz nunca lo usó**. Se carga igual: es una fila de catálogo, no código.

### 3.2 Partes interesadas · migración desde `MAT-EST-02 v2`

| Entidad | Volumen | Notas |
|---|---|---|
| `ParteInteresada` | ~10 | Internas y externas |
| `NecesidadExpectativa` | 29 | Con poder, interés y las tres banderas: requisitos al SGSI, cambio climático, cambio de alcance |
| `SeguimientoParteAnual` | 58 | **29 × 2 años.** En el Excel el plan, el seguimiento y la evidencia son tres columnas por año; aquí son un registro por año. El importador tiene que hacer esa transposición. |

### 3.3 Requisitos legales · desde cero

| Entidad | Volumen | Notas |
|---|---|---|
| `RequisitoLegal` | 11 de semilla | **`MAT-EST-01 v2` está vacía**: solo encabezados, en la versión vigente y en las dos obsoletas. No hay migración. La semilla son las once normas que ya lista el marco teórico del `MAN-CAL-01`. |
| `EvaluacionCumplimiento` | 0 | Se crean al evaluar. |

El levantamiento legal completo por proceso es el hallazgo `HAL-2026-0014`, abierto y vencido. La aplicación no puede inventarlo.

### 3.4 Contexto · desde cero

| Entidad | Volumen | Notas |
|---|---|---|
| `AnalisisContexto` | 2 | DOFA 2026 y PESTEL 2026, con su acta de aprobación del 10/08/2026 |
| `EntradaContexto` | ~28 | **Tampoco existen las matrices**: solo está la evidencia de aprobación en la carpeta de auditorías. Se construyen en la aplicación. |

### 3.5 Riesgos · migración desde `MAT-CAL-02 v3.0`

| Entidad | Volumen | Notas |
|---|---|---|
| `RiesgoOrganizacional` | **66** | 42 riesgos y 24 oportunidades, 11 procesos. Conservan su código `R1`…`R66`. |
| `ControlRiesgoOrg` | 66 | Uno por registro: descripción, tipo y medición. |
| `MaterializacionRiesgo` | Los reportados | Desde los `FOR-CAL-08` de la carpeta 06. |

**Fuente de un riesgo.** El Excel la guarda como texto —Proceso, DOFA, PESTEL, Partes Interesadas—. El importador debe resolverla a referencia: `necesidadExpectativaId` o `entradaContextoId` según el caso. Por eso partes interesadas y contexto se cargan **antes** que los riesgos.

### 3.6 La prueba de paridad

No es opcional y es lo que decide si la migración sirve. Para los 66 registros, estas cuatro cifras deben coincidir con el Excel hasta dos decimales:

```
inherente = P × I
P_res     = reduce ∈ {PROBABILIDAD, AMBOS} ? P × (1 − e) : P
I_res     = reduce ∈ {IMPACTO, AMBOS}      ? I × (1 − e) : I
residual  = P_res × I_res
```

Cinco casos frontera verificados contra la matriz real, útiles como prueba automatizada:

| Caso | P · I | Inherente | P_res | I_res | Residual |
|---|---|---|---|---|---|
| Preventivo · Fuerte (`R1`) | 3 · 4 | 12 | 0,6 | 4 | **2,4** |
| Correctivo · Moderado | 3 · 3 | 9 | 3 | 1,8 | **5,4** |
| Preventivo y correctivo · Moderado | 3 · 3 | 9 | 1,8 | 1,8 | **3,24** |
| Proactivo · Débil (`R36`) | 3 · 4 | 12 | 2,7 | 3,6 | **9,72** |
| Reforzador · Débil (`R32`) | 3 · 4 | 12 | 2,7 | 4 | **10,8** |

---

## 4 · Módulo C · Auditorías internas

### Orden

```
NormaAuditable  →  RequisitoNorma  →  PerfilAuditor  →  ProgramaAuditoria  →  Auditoria  →  (plan, notas, actas, informe)
```

| Entidad | Origen | Volumen | Fuente y notas |
|---|---|---|---|
| **`NormaAuditable`** | Semilla | 2 | ISO 9001:2015 e ISO/IEC 27001:2022 |
| **`RequisitoNorma`** | Semilla | ~28 + ~13 | Los numerales de cada norma, con `auditable` marcando cuáles cuentan para la cobertura. Los encabezados de capítulo vienen no auditables. |
| `PerfilAuditor` | Desde cero | — | **La especificación no dice dónde se administra.** Es una de las dos que quedaron incompletas. |
| `ProgramaAuditoria` | Migración | 1 | El de 2026, desde `FOR-CAL-04` |
| `AuditoriaProgramada` | Migración | 9 | Los nueve procesos, **todos en febrero** |
| `Auditoria` | Migración | 1 + 4 | Una interna ejecutada y cuatro externas o de segunda parte, desde la carpeta 09 |
| `EquipoAuditor` | Migración | — | Del informe: auditor líder externo |
| `CeldaPlan` | Migración | ~40 | La hoja PLAN del informe: proceso × numeral con hora |
| `NotaAuditor` | Migración | **76** | La hoja NOTAS AUDITOR: 58 OK, 15 OM, 1 RM, 2 fortalezas, 0 NC |
| `ActaAuditoria` | Migración | 2 | Apertura y cierre |
| `InformeAuditoria` | Migración | 2 | Preliminar y final |

### Regla de esta carga

Cargar la auditoría de 2026 **ya emitida** implica que sus 15 oportunidades deben existir como hallazgos en el módulo B, con `auditoriaId`, proceso y numeral. O se cargan las dos cosas coherentes, o se carga la auditoría como preliminar y se emite desde la aplicación — que es la opción más limpia, porque ejercita el camino real.

---

## 5 · Resumen del orden completo

```
 1  Persona                        Directorio · Graph
 2  Persona.area y cargo           7 nombradas
 3  Catálogos del método (D)       7 tablas desde MAN-CAL-01
 4  ContenidoSig + ItemVerificacion 10 de capacitación + levantamiento
 5  Obligacion                     levantamiento por procedimiento
 6  ParteInteresada + necesidades  29 desde MAT-EST-02
 7  AnalisisContexto + entradas    DOFA y PESTEL, desde cero
 8  RequisitoLegal                 11 de semilla
 9  RiesgoOrganizacional + control 66 desde MAT-CAL-02  ← prueba de paridad
10  NormaAuditable + RequisitoNorma 2 normas y sus numerales
11  PlazoPorTipoHallazgo           4, por decidir
12  ProgramaAuditoria + auditorías desde FOR-CAL-04 y la carpeta 09
13  Hallazgo + análisis + acciones histórico 2026, opcional
14  Generar asignaciones           idempotente, se puede repetir
```

Los pasos 1 a 5 son del módulo A y bloquean a los demás. Del 6 al 9 son de D y se pueden hacer en paralelo con 10 a 12, que son de C. El 13 necesita A cargado, porque sus acciones son asignaciones. El 14 va al final, siempre.

---

## 6 · Lo que nunca se carga

Repetido a propósito, porque es el error más caro de esta migración:

- **`Asignacion`** — la produce la generación.
- **`RegistroRealizado`** y sus respuestas — se crean al cerrar.
- **`Riesgo`** del SGSI y sus cálculos — se derivan del activo por sus amenazas.
- **Cualquier cifra derivada**: inherente, residual, nivel, cumplimiento, cobertura, tasa de eficacia. Todas se calculan al leer.
- **`EnvioNotificacion`** — se crea al enviar.
- **Roles** — los dan los grupos del Directorio; la aplicación no guarda ninguno.

## 7 · Antes de cargar en producción

1. Verificar la membresía de los tres grupos del Directorio · ver la advertencia del paquete.
2. Definir los plazos por tipo de hallazgo.
3. Resolver las tres dudas de la configuración base: la lectura de «SIC» y el área de pertenencia de dos personas.
4. Correr la prueba de paridad de los 66 registros **antes** de dar por buena la migración de D.
5. Tener respaldo y prueba de restauración documentada, como exige `REQ-SIG-01 §7`.
