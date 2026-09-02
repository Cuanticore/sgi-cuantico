# Gestión estratégica: partes interesadas, requisitos legales y riesgos organizacionales — Especificación y diseño

**Fecha:** 2026-08-31
**Código:** REQ-SIG-04
**Versión:** 1.1 — reconciliada con el código el 01/09/2026
**Módulo:** D — Gestión estratégica (ISO 9001 §4.1, §4.2, §6.1 · ISO 31000:2018)
**Depende de:** módulo A (`2026-08-31-sig-personas-tareas-design.md`) · módulo B (`2026-08-31-sig-mejora-nc-acpm-design.md`)
**Fuentes documentales:** `MAN-CAL-01 Manual de Riesgos y Oportunidades v2.0` · `MAT-CAL-02 Matriz de Riesgos y Oportunidades v3.0` · `MAT-EST-02 Matriz de partes interesadas v2` · `MAT-EST-01 Matriz de Requisitos Legales v2` · `FOR-CAL-08 Reporte de Incidentes de Riesgo`
**Estado:** **Implementado.** Plan D ejecutado, 9 tareas
**Reconciliación:** el modelo de roles cambió al construir. Ver §7.

---

## 1. Contexto

Los módulos nuevos del SIG son 0+A (personas y tareas), B (mejora), C (auditorías internas) y D (gestión estratégica). Este documento es **D**.

A diferencia de A y B, D **no parte de cero**: existe una metodología documentada y vigente, y existen datos reales. El repositorio documental del SIG se recorrió íntegramente antes de diseñar.

### 1.1 Lo que se encontró en el repositorio del SIG

| Fuente | Estado |
|---|---|
| `MAN-CAL-01 v2.0` (feb. 2026) | Metodología completa y vigente: ISO 31000:2018 + ISO 9001 §6.1, comité anual de riesgos, factores, escalas 1–5 de probabilidad e impacto, tipos de control y eficacias. **Es la fuente normativa de este módulo.** |
| `MAT-CAL-02 v3.0` (feb. 2026, con cambios de abril) | **66 registros**: 42 riesgos y 24 oportunidades, en 11 procesos, con mapa de calor inherente y residual. Es a la vez prototipo funcional, juego de datos y criterio de aceptación. |
| `MAT-EST-02 v2` (10/08/2026) | **29 filas** de partes interesadas, con poder, interés y tres banderas: genera requisitos al SGSI, requisito de cambio climático y requiere cambio al alcance del SIG. |
| `MAT-EST-01 v2` (29/07/2026) | **Vacía.** Solo encabezados y listas desplegables, tanto en la versión vigente como en las dos obsoletas. No hay migración posible: es una brecha del sistema, no un módulo por construir sobre datos existentes. |
| `FOR-CAL-08 v1` | Reporte de incidentes de riesgo: núm. del riesgo, fecha, proceso, riesgo/oportunidad, descripción del evento, impacto generado, causa raíz y reportante. Es la materialización. |

### 1.2 Dos inconsistencias del documento fuente

1. `MAN-CAL-01` llama al nivel 13–25 **«Inaceptable»** en la tabla de valoración y **«Impactante»** en la tabla de tratamiento. **Esta especificación adopta «Inaceptable»**, que es el nombre de la tabla de valoración y el que usa la hoja «Políticas Riesgos». Corregir el manual queda como recomendación al líder del SIG.
2. `MAT-CAL-02` declara Versión 3 en el nombre del archivo y en la hoja «Control de Cambios», pero **Versión 4** en la hoja «Matriz», y el control de cambios registra una V4 del 01/04/2026. La migración debe partir del archivo real, no del número declarado.

### 1.3 Cómo se integra con el SGSI

La pregunta era si la metodología organizacional y la del SGSI debían fundirse. **No deben.** Son genuinamente distintas:

| | Riesgo organizacional (ISO 9001 §6.1) | Riesgo de seguridad (MAGERIT / 27001) |
|---|---|---|
| Objeto | Un proceso, un objetivo, una parte interesada | Un par activo × amenaza |
| Cómo nace | Se identifica a mano, uno por uno | Se genera solo: el activo por las amenazas de su tipo |
| Valoración | Probabilidad × impacto, cualitativa 1–5 | Impacto = valor × degradación; riesgo = impacto × frecuencia anual |
| Volumen | 66 | 2.256 |
| Efecto del control | Eficacia 10/40/80 % sobre probabilidad y/o impacto | Madurez CMM → eficacia → frecuencia residual |

**La decisión: metodologías separadas, plataforma común.** El riesgo organizacional tiene su propia tabla, sus escalas y su matriz, construidas con la misma maquinaria parametrizable del SGSI. Se integran por cinco costuras reales:

1. **Acciones** — el tratamiento son asignaciones del motor de A. Un responsable mira una sola bandeja.
2. **Materialización** — un riesgo que se materializa genera un hallazgo del módulo B, con origen tipado.
3. **Elevación** — un riesgo del SGSI con residual Crítico puede referenciarse como fuente de un riesgo organizacional. Referencia, no copia: cada uno conserva su valoración con su método.
4. **Evaluación de cumplimiento legal** — es una obligación recurrente del motor de A.
5. **Tablero consolidado** — muestra los dos universos **lado a lado, nunca promediados**. Sumar un riesgo cualitativo de 1–25 con uno de 3.500 ARO produce un número sin significado.

Una nota que refuerza la decisión: ambas metodologías, sin haberse coordinado, coinciden en que **el control preventivo baja la probabilidad y el impacto no se reduce solo**. Es la misma intuición expresada dos veces.

---

## 2. Alcance

### 2.1 Dentro del alcance

- **Análisis de contexto**: matrices **DOFA y PESTEL**, versionadas por año y con su acta de aprobación (§2.3).
- **Matriz de partes interesadas**: 29 filas migradas, con poder, interés y las tres banderas.
- **Matriz de requisitos legales**: construida desde cero y sembrada con el marco normativo que lista `MAN-CAL-01` (Ley 1581 de 2012, decreto 1377 de 2013, ley 1266 de 2008, decretos 2592 de 2010 y 1727 de 2009, decreto 886 de 2014, ley 1474 de 2011, resolución 76434 de 2012). Con evaluación periódica de cumplimiento.
- **Matriz de riesgos y oportunidades**: 66 registros migrados, con paridad de cálculo fila por fila.
- Mapa de calor inherente y residual, navegable.
- **Reporte de incidentes** (`FOR-CAL-08`) y su enlace al hallazgo del módulo B.
- Planes de acción como asignaciones del motor de A.
- Parametrización completa de escalas, factores, tipos de control, eficacias y niveles.
- Línea base anual y comparación entre años.
- Exportación a Excel con la estructura de `MAT-CAL-02` y `MAT-EST-02`.

### 2.2 Fuera del alcance

| Qué | Por qué |
|---|---|
| ~~Matrices DOFA y PESTEL~~ | **Entraron al alcance el 31/08/2026, por decisión.** Ver §2.3. |
| Fusionar con el SGSI | Ver §1.3. |
| Gestión del cambio (carpeta 07) y revisión por la dirección (carpeta 11) | No fueron pedidas. |
| Cuantificación económica del impacto | La escala guarda el valor de referencia en COP y el porcentaje del patrimonio, como hoy; no se calcula pérdida esperada. |
| Rol de Comité de riesgos | El comité aprueba fuera del sistema y el líder del SIG registra el acta y la fecha, que es como funciona hoy. |

### 2.3 DOFA y PESTEL · alcance ampliado el 31/08/2026

La versión 1.0 de esta especificación los dejó fuera, con el argumento de que se citan como fuente en el manual pero **no existen como registro** en el repositorio. Ese argumento era correcto en los hechos y equivocado en la conclusión.

Lo que hay hoy es solo la evidencia de aprobación: `4.1. Aprobación_PESTEL_DOFA_2026.pdf` en las evidencias de la auditoría externa 27001, y su editable. **Hay un acta que aprueba dos matrices que no están en ninguna parte** — que es exactamente la misma situación de la matriz de requisitos legales, y por la misma razón vale la pena resolverla dentro de la herramienta en vez de dejarla como una etiqueta.

Con esto, la `fuente` de un riesgo deja de ser texto en los cuatro casos:

| Fuente | Referencia |
|---|---|
| `PROCESO` | El proceso, que ya es un dato del riesgo. |
| `PARTE_INTERESADA` | `necesidadExpectativaId` — la fila real de MAT-EST-02. |
| `DOFA` | `entradaDofaId` — el cuadrante y la entrada concreta. |
| `PESTEL` | `entradaPestelId` — la dimensión y la entrada concreta. |

Es el mismo principio de la regla D2, aplicado a las dos fuentes que faltaban: **se guarda la referencia, no un texto**. Y da algo que el Excel no puede dar: entrar por una debilidad del DOFA y ver qué riesgos salieron de ella, o descubrir que una dimensión del PESTEL no originó ninguno — que suele significar que se llenó por cumplir.

---

## 3. Modelo de datos

### 3.1 Partes interesadas

| Entidad | Contenido |
|---|---|
| **`ParteInteresada`** | `tipo` (INTERNA · EXTERNA), `descripcion`, `activa` |
| **`NecesidadExpectativa`** | `parteId`, `texto`, `clase` (NECESIDAD · EXPECTATIVA), `riesgoOportunidadTexto`, `esRiesgo`, `esOportunidad`, `poder` (ALTO · MEDIO · BAJO), `interes`, `generaRequisitosSgsi`, `requisitoCambioClimatico`, `requiereCambioAlcanceSig`, `responsableId` |
| **`SeguimientoParteAnual`** | `necesidadId`, `anio`, `planAccion`, `seguimiento`, `evidencia` |

`requisitoCambioClimatico` corresponde a la enmienda ISO de 2024 sobre cambio climático en el numeral 4.2, que la matriz vigente ya contempla.

### 3.2 Requisitos legales

| Entidad | Contenido |
|---|---|
| **`RequisitoLegal`** | consecutivo, `normatividad`, `articulo`, `expedidaPor`, `tipo` (catálogo de 12 de la hoja «Lista»), `objeto`, `aplicacion`, `sistemaGestion` (SGC · SGSI · ambos), `procesoEncargado`, `responsableId`, `enlace`, `periodicidadRevision`, `vigente`, `derogadoEn`, `normaQueDeroga` |
| **`EvaluacionCumplimiento`** | `requisitoId`, `fecha`, `resultado` (CUMPLE · PARCIAL · NO_CUMPLE), `evidencia`, `evaluadoPorId`, `hallazgoId?` |

### 3.3 Riesgos y oportunidades

| Entidad | Contenido |
|---|---|
| **`RiesgoOrganizacional`** | `codigo` (`R1`…, inmutable), `procesoId`, `clase` (RIESGO · OPORTUNIDAD), `fuente` (PROCESO · DOFA · PESTEL · PARTE_INTERESADA) + la referencia tipada que corresponda (`necesidadExpectativaId?` · `entradaContextoId?`), `descripcion`, `causa`, `efecto`, `factorId`, `probabilidadId`, `impactoId`, `responsableId`, `activo` |
| **`ControlRiesgoOrg`** | `riesgoId`, `descripcion`, `tipoId`, `eficaciaId` |
| **`MaterializacionRiesgo`** | `riesgoId`, `fecha`, `descripcionEvento`, `impactoGenerado`, `causaRaiz`, `reportanteId`, `hallazgoId?` — es `FOR-CAL-08` |

### 3.4 Análisis de contexto · DOFA y PESTEL

| Entidad | Contenido |
|---|---|
| **`AnalisisContexto`** | `tipo` (`DOFA` · `PESTEL`), `anio`, `aprobadoPorId`, `fechaAprobacion`, `actaReferencia`, `vigente` |
| **`EntradaContexto`** | `analisisId`, `casilla` (DOFA: `DEBILIDAD` · `OPORTUNIDAD` · `FORTALEZA` · `AMENAZA` — PESTEL: `POLITICO` · `ECONOMICO` · `SOCIAL` · `TECNOLOGICO` · `AMBIENTAL` · `LEGAL`), `texto`, `efecto` (`FAVORABLE` · `ADVERSO`), `orden` |

Una sola pareja de tablas para las dos matrices: cambia el catálogo de casillas, no la estructura. Agregar un análisis nuevo —un modelo de cinco fuerzas, por ejemplo— sería una fila del enum, no una tabla más.

`AnalisisContexto` se versiona por año y se aprueba: es lo que el auditor pidió ver cuando exigió el acta. El del año anterior no se borra, queda `vigente = false`.

### 3.5 Catálogos parametrizables

Con el patrón de escalas que el SGSI ya tiene: `EscalaProbabilidad`, `EscalaImpactoRiesgo` (con valor de referencia en COP y porcentaje del patrimonio), `EscalaImpactoOportunidad`, `FactorRiesgo` (Legal, Operacional, Personal, Tecnológico, Reputacional, Externo), `TipoControlRiesgo`, `EficaciaControl` y `NivelRiesgo` (rango, etiqueta, color, acción para riesgo, acción para oportunidad).

### 3.5 Tres decisiones explícitas

1. **El tipo de control declara qué reduce.** `TipoControlRiesgo` guarda un campo `reduce`: PROBABILIDAD, IMPACTO o AMBOS. Preventivo y Reforzador reducen probabilidad; Correctivo reduce impacto; Preventivo-y-correctivo y Proactivo reducen ambos. Dar de alta «Reactivo» —que el manual define pero la matriz nunca usa— es una fila, no un despliegue. La alternativa, una condición escrita en el código, obliga a desplegar para cada tipo nuevo.
2. **El seguimiento anual son filas, no columnas.** El Excel agrega tres columnas cada año (plan, seguimiento, evidencia); aquí es un registro por año y la pantalla no se rediseña nunca.
3. **Nada calculado se almacena.** Inherente, probabilidad residual, impacto residual, residual y nivel se derivan, como en todo el resto del sistema.

---

## 4. Fórmulas

Verificadas contra `MAT-CAL-02`, fila por fila. Eficacia `e`: Débil 0,10 · Moderado 0,40 · Fuerte 0,80.

```
inherente = P × I                              (P, I enteros de 1 a 5)
P_res     = reduce ∈ {PROBABILIDAD, AMBOS} ? P × (1 − e) : P
I_res     = reduce ∈ {IMPACTO, AMBOS}      ? I × (1 − e) : I
residual  = P_res × I_res
nivel(v)  = 0–4 Aceptable · 5–12 Moderado · 13–25 Inaceptable   (rangos parametrizables)
posición en el mapa de calor = máx(valor − 0,5 ; 0,5)
```

Casos frontera tomados de la matriz real, que sirven de oráculo de la implementación:

| Caso | P · I | Inherente | P_res | I_res | Residual |
|---|---|---|---|---|---|
| Preventivo · Fuerte (`R1`) | 3 · 4 | 12 | 0,6 | 4 | **2,4** |
| Correctivo · Moderado | 3 · 3 | 9 | 3 | 1,8 | **5,4** |
| Preventivo y correctivo · Moderado | 3 · 3 | 9 | 1,8 | 1,8 | **3,24** |
| Proactivo · Débil (`R36`) | 3 · 4 | 12 | 2,7 | 3,6 | **9,72** |
| Reforzador · Débil (`R32`) | 3 · 4 | 12 | 2,7 | 4 | **10,8** |

### 4.1 La anomalía de las oportunidades

Para una oportunidad, la aritmética **reduce** probabilidad e impacto igual que para un riesgo. El efecto es que cuanto mejor gestionada esté una oportunidad, más bajo sale su residual, y termina clasificada «Aceptable · Esperar» — la misma casilla que un riesgo menor sin gestionar. Un control fuerte sobre una oportunidad debería hacerla *más* probable y *más* valiosa. Hay 24 registros así.

**Decisión: la herramienta reproduce el Excel** y muestra una advertencia visible en la pantalla de oportunidades explicando el efecto. Razón: la paridad de la migración es verificable y la metodología es un documento aprobado — cambiarla es una decisión del comité de riesgos, no del desarrollo. Con la herramienta funcionando, el comité la toma con los números a la vista.

---

## 5. Pantallas

El header pasa de cuatro a **cinco pestañas**: Mi SIG · Indicadores · Estratégico · SGSI · Actividades. Meter tres matrices más en la barra lateral de Actividades la dejaría en once entradas, y el público es otro: esto lo mira la alta dirección, no quien ejecuta tareas. Un Colaborador sigue viendo una sola pestaña.

| Pantalla | Contenido |
|---|---|
| **Partes interesadas** | Grilla agrupada por tipo, con la matriz poder–interés de 2×2 como mapa. Ficha con las necesidades, las tres banderas y el seguimiento año por año. |
| **Requisitos legales** | Grilla filtrable por tipo, sistema de gestión, proceso, vigencia y estado de cumplimiento, con semáforo de revisión vencida. Ficha con el historial de evaluaciones. |
| **Riesgos y oportunidades** | Los 66 registros con inherente y residual calculados en vivo: cambiar probabilidad, impacto o control recalcula sin recargar, igual que la grilla de madurez del SGSI. |
| **DOFA** | Los cuatro cuadrantes, con el año y el acta que los aprueba. Cada entrada muestra cuántos riesgos originó, y abrirla lleva a ellos. |
| **PESTEL** | Las seis dimensiones, con el efecto de cada entrada —favorable o adverso— y sus riesgos originados. Una dimensión sin riesgos queda señalada: suele significar que se llenó por cumplir. |
| **Mapa de calor** | Inherente y residual, 5×5, casillas navegables con su conteo, el color del umbral y **el nivel escrito**, nunca solo el color. |
| **Materializaciones** | El registro de `FOR-CAL-08` con su enlace al hallazgo que originó. |
| **Parámetros del modelo** | Escalas, factores, tipos de control, eficacias y niveles. |

---

## 6. Reglas de negocio

| # | Regla |
|---|---|
| **D1** | La migración **conserva el código del Excel** (`R1`…`R66`); los nuevos siguen ese consecutivo. El código es inmutable y no se reutiliza. |
| **D2** | Un riesgo cuya fuente es una parte interesada guarda **la referencia a la fila**, no un texto. |
| **D3** | Riesgo y oportunidad comparten tabla y consecutivo, como en el Excel. La clase decide qué escala de impacto aplica, qué tipos de control se ofrecen y qué acción sugiere el nivel. |
| **D4** | Cambiar una escala o un umbral no reescribe datos: los registros guardan la referencia al nivel, no el número. |
| **D5** | **Revisión anual obligatoria** por el comité de riesgos: es una obligación del motor de A, con su fecha y su responsable. |
| **D6** | Materializar un riesgo exige el `FOR-CAL-08` completo y **genera un hallazgo** en Mejora con origen tipado al riesgo. |
| **D7** | Un `NO_CUMPLE` en una evaluación legal puede originar un hallazgo con un clic. |
| **D8** | Derogar una norma no la borra: queda `vigente = false` con su fecha y la norma que la deroga; las evaluaciones históricas se conservan. |
| **D9** | Advertencia visible en la pantalla de oportunidades por la anomalía del §4.1. |
| **D10** | **Línea base anual**: al cerrar el comité se congela la matriz para comparar entre años, reusando el patrón de `LineaBase` del SGSI. |

---

## 7. Roles y permisos

Permisos nuevos: `estrategico:ver`, `estrategico:escribir`, `estrategico:parametrizar`.

| Rol · grupo de AD | Qué hace |
|---|---|
> **Reconciliado el 01/09/2026.** De cuatro roles a dos: `SIG-Propietarios` y `SIG-Auditoría` se retiraron porque nunca existieron en el Directorio. La razón completa está en §6.0 de la especificación del módulo A.

| **Colaborador** | Sin acceso al módulo, salvo las tareas que le lleguen por el motor de A. |
| **`Líderes SIG`** | Todo: identifica y valora riesgos, mantiene las tres matrices, parametriza el modelo y congela la línea base. |

**Lo que se perdió al simplificar, y conviene tener presente.** La versión 1.0 daba al líder de proceso escritura sobre **los riesgos de su proceso** y lectura del resto. Hoy, o se está en `Líderes SIG` y se escribe todo, o no se entra. Para una organización de nueve procesos y una persona coordinando el SIG es una simplificación razonable; deja de serlo el día que los líderes de proceso mantengan sus propios riesgos, que es justo lo que pide el `MAN-CAL-01` cuando dice que el levantamiento lo hacen ellos con el líder del SGC. Reabrirlo es agregar una entrada en `POR_GRUPO`, no rehacer pantallas.

---

## 8. Indicadores

Todos calculados: riesgos por nivel inherente y residual, por proceso y por factor; porcentaje de riesgos con control Fuerte; oportunidades por acción sugerida; materializaciones del periodo y cuántas derivaron en hallazgo; requisitos legales vigentes, con revisión vencida y porcentaje de cumplimiento evaluado; partes interesadas con y sin plan del año.

---

## 9. Criterios de aceptación

| Criterio | Verificación |
|---|---|
| Paridad de datos | 66 registros migrados —42 riesgos y 24 oportunidades, 11 procesos— con su código original. |
| Paridad de cálculo | Para los 66, inherente, probabilidad residual, impacto residual y residual coinciden con el Excel hasta dos decimales. |
| Casos frontera | Los cinco de la tabla del §4, como prueba automatizada. |
| Parametrización | Cambiar la eficacia de Fuerte de 80 % a 90 % recalcula los 66 sin desplegar código. |
| Encadenamiento | Un riesgo con fuente «Parte Interesada» abre la fila de `MAT-EST-02` que lo originó; uno con fuente DOFA o PESTEL abre la entrada concreta de esa matriz. Ninguna de las cuatro fuentes es texto libre. |
| Contexto versionado | El DOFA de 2026 conserva su acta de aprobación, y crear el de 2027 no borra el anterior. |
| Materialización | Registrar un incidente crea el hallazgo en Mejora, con el riesgo como origen. |
| Legal | Un requisito con periodicidad semestral genera la asignación de revisión en Mi SIG de su responsable. |
| Partes interesadas | Registrar el plan de 2027 no requiere tocar la pantalla. |
| Exportación | El Excel exportado abre sin errores y conserva la estructura de hojas de las matrices originales. |

---

## 10. Qué sigue

1. Módulo **C — Auditorías internas** (`2026-08-31-sig-auditorias-internas-design.md`), especificado sobre `PRO-CAL-04 v3.0` y los formatos `FOR-CAL-04`, `FOR-CAL-06` y `FOR-CAL-07`.
2. Planes de implementación de A, B y D (skill `writing-plans`).
3. Recomendaciones al líder del SIG, fuera del alcance del software: corregir «Impactante» → «Inaceptable» en `MAN-CAL-01`, alinear el número de versión de `MAT-CAL-02`, y decidir en comité si el residual de las oportunidades debe invertirse.
