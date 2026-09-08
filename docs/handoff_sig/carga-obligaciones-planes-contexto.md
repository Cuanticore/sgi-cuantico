# Requerimiento · Carga inicial de obligaciones, planes de acción y contexto

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-17 · carga inicial del SIG |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-08 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo (ejecución asistida con Claude Code) |
| **Fuentes funcionales** | `1. Cronograma SGC.xlsx` · `FOR-CAL-03 Formato Control de planes de Acción.xlsx` · `Consolidado estado planes de acción.xlsx` · `Aprobación PESTEL.docx` |
| **Estado** | D-1 y D-2 **cerradas por defecto** (§9) · D-3 a D-7 **abiertas** · listo para ejecutar el bloque A |

---

## 1 · Objetivo

`carga-de-datos.md` (2026-08-31) mapeó **de dónde sale** cada entidad. No dijo **qué cargar**: ninguna fila concreta, ningún mapeo columna→campo, ningún criterio de aceptación. Este requerimiento es la otra mitad para las tres familias que hoy bloquean el arranque:

- **Bloque A · obligaciones** — 22 contenidos y 27 obligaciones desde el Cronograma SGC.
- **Bloque B · acciones y planes** — 46 planes y 308 hallazgos entre dos registros que no concuerdan.
- **Bloque C · contexto** — la cabecera del DOFA y del PESTEL 2026.

Y es, además, el acta de un recorrido: **60 documentos vigentes** (386 KB de texto extraído) y **16 fuentes de datos**, de las que cuatro se cargan acá y doce quedan inventariadas en §10 con su bloqueo nombrado, para que nadie las redescubra.

---

## 2 · Lo que el recorrido corrige del mapa de agosto

Cuatro afirmaciones de `carga-de-datos.md` ya no se sostienen. Importan porque tres de ellas declaraban ausente una fuente que sí existe.

| § | Decía | Es |
|---|---|---|
| 1 | «`FOR-CAL-11 Cronograma SGC` es una plantilla sin diligenciar» | **Falso.** La copia de `03. Manuales/1. Cronograma SIG/1. Cronograma SGC.xlsx` está diligenciada: 30 actividades con numeral ISO, responsable, documento soporte y malla semanal Planeado/Ejecutado de AGO-2025 a JUL-2026. Es la fuente del bloque A. |
| 1 | «`Obligacion` · ~31 estimadas» | La estimación era buena: **30 actividades**. |
| 3.4 | «acta de aprobación del 10/08/2026» | La real es del **22/04/2026** (`Aprobación PESTEL.docx`: Teams, 2:00–3:00 p.m., Daniel Medina CEO · Laura Agudelo Líder de Gestión de Calidad · Katherine Quiroga Profesional de Calidad). |
| 2 | «`Hallazgo` · 20 · los del año 2026» | Son **308**: 102 filas en el Consolidado 2026 y 206 en el 2025, contra 46 planes en FOR-CAL-03 (23 por año). La relación es N:1, no 1:1 (§5.2). |

**Y una corrección al propio esquema.** El comentario de `AlcanceObligacion.ACTIVO` atribuye a POL-TEC-01 la exigencia de que «los derechos de acceso sean revisados **al menos una vez al año** por el propietario de cada activo». Esa frase no está en la política: POL-TEC-01 dice «revisarse **periódicamente**», tres veces, sin frecuencia. El alcance `ACTIVO` sigue siendo necesario; el «una vez al año» es una decisión que nadie tomó todavía (§4.6, G-2).

---

## 3 · Regla de oro: la frecuencia no está en las políticas

Es la conclusión con más consecuencias del recorrido, por eso va antes del mapeo.

La premisa de partida era que las obligaciones salen de leer todas las políticas y procedimientos. **Salen de ahí los deberes, pero no las obligaciones cargables.** Una fila de `Obligacion` necesita tres datos que la política no da:

```
periodicidad   enum, NOT NULL     ← la política dice «periódicamente»
plazoDias      Int,  NOT NULL     ← la política no habla de plazos
responsableSeguimientoId  Int, NOT NULL, FK Persona  ← la política nombra roles, no personas
```

Sobre los 60 documentos vigentes hay **56 líneas que mencionan periodicidad**, y prácticamente todas son la palabra sola:

| Documento | Menciones | Frecuencia concreta |
|---|---:|---|
| POL-TEC-02 · Proveedores y nube | 7 | ninguna — «revisarse periódicamente» ×5 |
| POL-SIG-02 · Gobierno de SI | 5 | ninguna — «revisiones independientes y periódicas» |
| POL-TEC-01 · Identidades y acceso | 3 | ninguna — «revisarse periódicamente» ×3 |
| PTR-TEC-01 · Backups | 4 | **sí**: Diaria (EBS, RDS) · Semanal (AMI) |
| PRO-LCO-01 · Proveedores | 10 | plazos contractuales, no periodicidad de tarea |

Las cuatro frecuencias de PTR-TEC-01 son de **trabajos automáticos de AWS**, no de una persona: no son `Obligacion`, son `Metrica` o trabajo programado. Queda entonces **una sola fuente en todo el repositorio que da periodicidad, responsable y evidencia a la vez: el Cronograma SGC.** Por eso el bloque A se carga de ahí y solo de ahí.

Lo que las políticas sí producen es un **inventario de deberes sin agendar** (§4.6, G-2): nueve obligaciones exigidas por norma interna que el cronograma no programa. No se cargan; se levantan.

---

## 4 · Bloque A · Obligaciones desde el Cronograma SGC

### 4.1 Qué trae el archivo

`03. Manuales/1. Cronograma SIG/1. Cronograma SGC.xlsx`, hoja única «Cronograma SGC », 54 filas × 107 columnas.

| Zona | Ubicación | Contenido |
|---|---|---|
| Cabecera | filas 1–3, col 12 | Código **FOR-CAL-10** · versión 1 · fecha 2026-01-16 |
| Última actualización | fila 7 | **2026-04-30** |
| Encabezado de malla | filas 8–11 | año · mes · semana · **P/E** |
| Encabezado de datos | filas 9–11, cols 2–7 | No. · ITEM · ACTIVIDAD · RESPONSABLE · DOCUMENTO SOPORTE |
| Datos | filas 12–48 | 7 filas de capítulo ISO + **30 actividades** |
| Derivados | filas 49–54 | % de cumplimiento por semana y por mes — **no se cargan** |

La malla son **48 columnas P** y 48 E, agrupadas en 12 meses: AGO–DIC de 2025 y ENE–JUL de 2026.

**Defecto de la fuente, primero porque afecta la trazabilidad.** El archivo declara código `FOR-CAL-10`, que en `09/1. Formatos` es el **Plan de comunicaciones**; el cronograma es `FOR-CAL-11`. La carga registra la obligación contra `FOR-CAL-11 Cronograma SGC` y el desajuste queda como hallazgo documental (G-1).

### 4.2 Las 30 actividades y su periodicidad derivada

`P` es el total de meses marcados como planeados en los 12 meses del libro; `P-26` los marcados en la ventana completa más reciente (ENE–JUL 2026, 7 meses).

| Fila | Num. | Actividad | Responsable (1.º) | Soporte | P | P-26 | Periodicidad |
|---:|---|---|---|---|---:|---|---|
| 13 | 4.2 | Monitoreo de las cuestiones internas y externas | Alta Dirección | PESTEL | 1 | 04 | ANUAL |
| 14 | 4.3 | Monitoreo de necesidades y expectativas de partes interesadas | Alta Dirección | MAT-EST-02 | 2 | 03,06 | TRIMESTRAL |
| 15 | 4.4 | Monitorear periódicamente el mapa de procesos | Alta Dirección | MAP-CAL-01 | 2 | 02 | SEMESTRAL |
| 17 | 5.1 | Actualizar la política HSEQ | Alta Dirección | POL-CAL-01 → **POL-EST-01** | 1 | 01 | ANUAL |
| 19 | 6.1 | Monitoreo de las acciones de riesgos y oportunidades | Alta Dirección | MAT-CAL-02 | 2 | 03,06 | TRIMESTRAL |
| 20 | 6.2 | Actualización y seguimiento de los objetivos de calidad | Alta Dirección | POL-CAL-01 → **POL-EST-01** | 1 | 01 | ANUAL |
| 22 | 7.1 | Establecer presupuesto del SGC | Alta Dirección | Presupuesto | 1 | 01 | ANUAL |
| 23 | 7.2 | Revisión de la presentación de inducción (cuando aplique) | Prof. de Calidad | Presentación Inducción | **0** | — | **sin derivar** |
| 24 | 7.2 | Ejecución del plan de comunicaciones | Prof. de Calidad | FOR-CAL-10 | **0** | — | **sin derivar** |
| 25 | 7.2 | Inducción y reinducción al personal | Gestión de TH | FOR-TAL-01 | 9 | 7/7 | MENSUAL |
| 26 | 7.2 | Capacitaciones en calidad y mejora continua | Líder de Calidad | Lista de asistencia | 5 | 04,05,06 | **irregular** |
| 27 | 7.3 | Control de documentos y registros | Prof. de Calidad | Listado maestro | 12 | 7/7 | MENSUAL |
| 29 | 8.1 | Monitoreo de los procedimientos de Cuantico | Prof. de Calidad | Listado maestro | 12 | 7/7 | MENSUAL |
| 30 | 8.1 | Revisión de requisitos legales en los proyectos | Gestión Legal y Compras | MAT-EST-01 | **0** | — | **sin derivar** |
| 31 | 8.1 | Comité de Calidad · seguimiento a indicadores y planes | Líder de Calidad | FOR-GAF-07 → **FOR-FIN-04** | 5 | 02,04,06 | **BIMESTRAL** ⚠ |
| 33–41 | 9.1–9.9 | Seguimiento de indicadores de gestión · **9 procesos** | Líder de cada proceso | Tablero de indicadores | 10 | 6/7 | MENSUAL |
| 42 | 9.10 | Seguimiento a satisfacción del cliente / quejas | Líder de Proyectos y SAC | Análisis de encuestas | 7 | 5/7 | MENSUAL |
| 43 | 9.11 | Evaluación de proveedores | Líder Legal y Compras | FOR-GAF-04 → **FOR-LCO-04** | 1 | 01 | ANUAL |
| 44 | 9.12 | Ejecución de auditoría interna | Líderes de Proceso | Informe aud. interna | 1 | 02 | ANUAL |
| 45 | 9.13 | Revisión por la Dirección | CEO | Informe RpD | 1 | 04 | ANUAL |
| 46 | 9.14 | *[texto errado]* auditoría externa | Líderes de Proceso | Informe aud. externa | 1 | 05 | ANUAL |
| 48 | 4.1. | Gestión de acciones correctivas y de mejora | Líder de Proceso | FOR-CAL-02 · FOR-CAL-03 | 12 | 7/7 | MENSUAL |

**Reparto:** 14 MENSUAL · 8 ANUAL · 2 TRIMESTRAL · 1 SEMESTRAL · 1 BIMESTRAL · 1 irregular · 3 sin derivar.

### 4.3 La regla de derivación

No se inventa: se lee la malla y se clasifica por la separación entre meses marcados.

```
P-26 = 7 de 7 meses                    → MENSUAL
P-26 = 6 de 7, un hueco suelto         → MENSUAL   (el hueco es abril: el libro
                                                     dejó de actualizarse el 30/04)
P-26 = 5 de 7, consecutivos al final   → MENSUAL   (arranque tardío, no periodo)
separación constante de 2 meses        → BIMESTRAL ⚠ no existe en el enum
separación constante de 3 meses        → TRIMESTRAL
separación de 5 a 6 meses              → SEMESTRAL
P = 1                                  → ANUAL
P = 0                                  → no se carga obligación
```

El hueco de abril de 2026 en las nueve filas de indicadores **no es una excepción de negocio**: la fila 7 del libro dice que la última actualización fue el 2026-04-30 y las marcas de ejecutado se detienen en marzo. Es el borde del diligenciamiento, y por eso se lee como mensual.

### 4.4 Mapeo → `ContenidoSig` + `Obligacion`

**Nueve filas colapsan en un contenido.** Las filas 33–41 son la misma actividad para nueve procesos distintos. Cargarlas como nueve contenidos duplicaría el texto nueve veces y obligaría a editarlo nueve veces. Se carga **un** `ContenidoSig` y **nueve** `Obligacion` con `alcance = AREA`, que es exactamente para lo que existe ese alcance.

| Total | Entidad |
|---:|---|
| **22** | `ContenidoSig` — 30 actividades menos las 8 que absorbe el contenido de indicadores |
| **27** | `Obligacion` — 30 menos las 3 sin periodicidad derivable (G-8) |
| **25** | de esas 27, las que entran en la primera corrida: las filas 26 y 31 esperan a **D-3** |

`ContenidoSig`:

| Campo | Origen |
|---|---|
| `codigo` | Del contador atómico por tipo (`TAR-001`, `CAP-001`). **No se fabrica a mano.** |
| `tipo` | `CAPACITACION` para las filas 25 y 26; `TAREA` para las otras 20 |
| `titulo` | La ACTIVIDAD hasta los dos puntos, o completa si no los tiene |
| `descripcion` | La ACTIVIDAD completa, textual |
| `procedimientoOrigen` | `FOR-CAL-11 Cronograma SGC · numeral ISO 9001 <No.>` |
| `documentoCodigo` · `documentoNombre` | Del DOCUMENTO SOPORTE, **remapeado** (§4.6, G-3) |
| `exigeFirma` · `exigeEvaluacion` | `false`. Nada en el cronograma los pide; ponerlos en `true` inventa un requisito |
| `version` | `1` · con su fila en `VersionContenido`, `publicadaPorId = null` |

`Obligacion`:

| Campo | Origen |
|---|---|
| `contenidoId` | El contenido de su actividad |
| `alcance` · destino | `AREA` para las nueve de indicadores; para el resto, `CARGO` por la tabla de §4.5 |
| `periodicidad` | La derivada en §4.2 |
| `fechaInicio` | **`2026-09-01`** para todas (D-2) |
| `plazoDias` · `diasAviso` | Por la tabla de §4.5. **No están en la fuente** |
| `responsableSeguimientoId` | La persona en el cargo «Profesional de Calidad y Procesos» (§4.5) |
| `anclaje` | `ANCLADA` en las 27. Ninguna depende de un intervalo desde el cierre anterior |
| `controlAnexoA` | `null`. Son numerales de ISO 9001, no controles del Anexo A |
| `esProveedor` | `true` solo en la fila 43 |
| `notificar` · `activa` | `true` |

### 4.5 Los tres datos que la fuente no da

**Uno · el responsable no es una persona.** La columna RESPONSABLE trae de uno a tres roles concatenados sin separador: «Alta Dirección Líder de Calidad Profesional de Calidad y Procesos». El patrón es constante y significa algo: **el primero ejecuta, el último hace seguimiento.** En **29 de las 30 filas** el último es «Profesional de Calidad y Procesos»; la única excepción es la fila 30, que solo dice «Gestión Legal y Compras» —y es una de las tres que tampoco tiene periodicidad.

Ninguna de esas etiquetas coincide con `CargoResponsable`, salvo `CEO`. La tabla que hay que decidir (D-4):

| Etiqueta del cronograma | `CargoResponsable` | Nota |
|---|---|---|
| Alta Dirección | `CEO` | |
| CEO | `CEO` | coincidencia exacta |
| Líder de Calidad · Lider de Gestión de Calidad | `Líder del SIG` | |
| **Profesional de Calidad y Procesos** | — | **no existe: hay que crearlo** |
| Gestión de Talento Humano | `Talento Humano` | coincidencia exacta |
| Gestión Legal y Compras | `Chief Legal Officer` | |
| Líderes de Proceso · Lider de Proceso | — | **no es un cargo, es un conjunto** (D-5) |

Las tres personas se conocen por el acta del 22/04/2026: **Daniel Medina** (CEO), **Laura Agudelo** (Líder de Gestión de Calidad), **Katherine Quiroga** (Profesional de Calidad). `responsableSeguimientoId` apunta a Katherine Quiroga en las 27 obligaciones.

**Dos · no hay plazos.** `plazoDias` y `diasAviso` son `NOT NULL` y el cronograma no los menciona. La regla propuesta (D-6) sale de la periodicidad, que es lo único que hay:

| Periodicidad | `plazoDias` | `diasAviso` |
|---|---:|---:|
| MENSUAL | 15 | 5 |
| BIMESTRAL · TRIMESTRAL | 30 | 10 |
| SEMESTRAL | 45 | 10 |
| ANUAL | 60 | 15 |

**Tres · `Persona` no está cargada.** `responsableSeguimientoId` es FK obligatoria a `Persona`, y `Persona` sale del Directorio por Graph. **La sincronización del Directorio es precondición dura del bloque A**, igual que en `carga-de-datos.md` §1.

### 4.6 Defectos de la fuente y huecos

| Id | Qué | Efecto en la carga |
|---|---|---|
| **G-1** | El libro declara `FOR-CAL-10`, que es el Plan de comunicaciones; el cronograma es `FOR-CAL-11` | Se registra `FOR-CAL-11`; queda hallazgo documental |
| **G-2** | Nueve deberes de POL-TEC-01 (3), POL-TEC-02 (4) y POL-SIG-02 (2) dicen «periódicamente» sin frecuencia y el cronograma no los agenda | **No se cargan.** Levantamiento pendiente del líder del SIG |
| **G-3** | Códigos de soporte obsoletos: `POL-CAL-01`→`POL-EST-01`, `FOR-GAF-07`→`FOR-FIN-04`, `FOR-GAF-04`→`FOR-LCO-04` | Tabla de remapeo explícita; **no** se copia el código viejo |
| **G-4** | La fila 46 dice «Evaluación de proveedores» pero su soporte es el informe de auditoría externa, y va en el numeral 9.14, después de la interna (9.12) y la RpD (9.13) | Es la **auditoría externa** con el texto copiado de la fila 43. Se carga como auditoría externa y se anota |
| **G-5** | La fila 48 lleva numeral `4.1.` bajo el capítulo «10 · Mejora Continua» | Se carga con `10` como capítulo; el numeral errado se conserva textual en `procedimientoOrigen` |
| **G-6** | `Periodicidad` no tiene `BIMESTRAL` y el Comité de Calidad lo es (AGO, OCT / FEB, ABR, JUN) | **Bloquea la fila 31** hasta D-3 |
| **G-7** | La fila 26 marca dos rachas de meses consecutivos (OCT–NOV 2025, ABR–JUN 2026): no hay periodo | **Bloquea la fila 26** hasta D-3 |
| **G-8** | Las filas 23, 24 y 30 no tienen ninguna marca de planeado | Se cargan como `ContenidoSig` sin `Obligacion`. Son contenido real; lo que falta es la frecuencia |

---

## 5 · Bloque B · Acciones y planes

### 5.1 Los dos registros

| Archivo | Hoja | Filas con dato | Qué es |
|---|---|---:|---|
| `FOR-CAL-03 Formato Control de planes de Acción.xlsx` | `2025` | 23 | Los **planes**: tipo, origen, descripción, proceso, cargo, % avance, estado, eficacia, evidencia |
| | `2026` | 30 → **23 con ID** | Ídem. Las filas 24–30 traen solo tipo, origen y descripción; 31–32 sin ID; 33–37 solo `ESTADO` |
| | `Input` | 12 | Listas de validación: 2 tipos de plan · 12 orígenes · 9 procesos · 3 estados |
| `Consolidado estado planes de acción.xlsx` | `2026` | **102** | Los **hallazgos**: tipo (OM/NC), hallazgo, tema, proceso, fuente, estado, `CONSECUTIVO`, estado del plan, justificación de no implementación |
| | `2025` | **206** | Ídem, con `SEGUIMIENTO` en lugar de justificación |
| | `Acciones Inmediatas` | 4 | Título, proceso, responsable, detalle, preguntas |
| | `Agrupación (3)` | 38 | Vista agrupada — **derivada, no se carga** |

### 5.2 La relación es N:1 y está en una columna

`Consolidado.CONSECUTIVO` apunta al `FOR-CAL-03.ID` del mismo año. Las filas 8 a 11 de la hoja 2026 —cuatro oportunidades distintas de Gestión de Proyectos— comparten `CONSECUTIVO = 7`: **un plan responde por cuatro hallazgos.** Cargar los dos registros como si fueran 1:1 duplicaría planes o perdería hallazgos.

El modelo ya lo soporta: `Hallazgo` es la fila del Consolidado, y el plan es una `Asignacion` enlazada por `HallazgoAccion`, que es N:M. Los 308 hallazgos y los 46 planes caben sin tocar el esquema.

### 5.3 Lo que bloquea este bloque: cuatro campos obligatorios sin fuente

`Hallazgo` exige seis campos que ninguno de los dos registros trae:

| Campo | Estado en la fuente |
|---|---|
| `fechaDeteccion` `NOT NULL` | **Vacío en las 46 filas.** La única fecha del libro es `12/012/2026` en la fila 23 de 2026 — **mes 012, fecha inválida** |
| `requisitoIncumplido` `NOT NULL` | No existe como columna |
| `evidenciaObjetiva` `NOT NULL` | Existe `EVIDENCIA`, pero es la evidencia de **cierre**, no la del hallazgo. Mapearla ahí sería registrar como prueba del problema la prueba de que se resolvió |
| `detectadoPorId` `NOT NULL` → `Persona` | `RESPONSABLE ACTUAL` está casi vacío; `CARGO` dice «Lider de procesos» en 20 de 23 filas de 2026 |
| `areaId` `NOT NULL` → `Area` | Derivable de `PROCESO`, con la limpieza de §5.4 |
| `codigo` | `HAL-<año>-<NNNN>` del contador. **El consecutivo debe seguir el orden real de detección** — que es justo lo que no hay |

Sin `fechaDeteccion` no hay vencimiento, no hay `PlazoPorTipoHallazgo` que aplicar, no hay antigüedad y el consecutivo `HAL-2026-NNNN` deja de decir cuándo se detectó cada uno. **Este bloque no se puede cargar hoy.** Lo que se puede hacer está en D-7.

### 5.4 Suciedad del dato, medida

| Qué | Ejemplos |
|---|---|
| Proceso mal escrito | **«Lestión Legal y Compras»** ×2 · «Gestión Estrategica» sin tilde · «Gestión de proyectos» en minúscula |
| Proceso que ya no existe | «Gestión Administrativa y Financiera» — se dividió en Financiera y Talento Humano |
| Dos procesos en una celda | «Gestión Financiera y Talento Humano» |
| Dos orígenes en una celda | «Revisión por la dirección Auditoria externa» ×3 |
| Origen con variantes de caja | «Auditoría Interna» / «Auditoría interna» |
| Typo en el catálogo mismo | La hoja `Input` ofrece **«Salida no coforme»**; las filas usan «Salida No Conforme» |
| Cargos fuera del catálogo | «Gerente de operacioness» (sic) · «Service Manager» · «Consulting Director» · «Líder administrativa» |
| Filas fantasma | 33–37 de la hoja 2026: solo `ESTADO = Por Iniciar`, residuo de la validación de datos |

Los 12 orígenes de `Input` se mapean a los 9 valores de `OrigenHallazgo`; tres no tienen destino directo (`Gestión del Cambio`, `Satisfacción del Cliente`, `Evaluación de proveedores`) y van a `OTRO` con `origenReferencia` guardando la etiqueta original. **No se agregan valores al enum** por un origen que aparece dos veces.

### 5.5 Lo que no se carga nunca

`Compromisos SGC.xlsx` (1,3 MB, 479 filas en la hoja `SGC`) es una **bitácora personal de mesas de trabajo**: responsables por nombre de pila («Katherine», «Laura»), sin fechas, sin códigos, con hojas de notas sueltas. Es memoria de trabajo valiosa y **no es un registro del SIG**. No entra por ninguna puerta.

---

## 6 · Bloque C · DOFA y PESTEL

Aquí la respuesta honesta es que **se carga la mitad, y la mitad que falta no está en ninguna parte.**

Un barrido por nombre de archivo y por contenido sobre los 60 documentos vigentes devuelve **dos archivos** con DOFA o PESTEL en el nombre, los dos en `09. Auditorias/5. Evidencias de aprobación/`: el PDF de aprobación y su editable. Las menciones en MAN-SIG-02, MAN-CAL-01 y el Manual SGSI son metodológicas —«la organización utiliza herramientas como el análisis PESTEL y el análisis DOFA»— y no traen ni una casilla.

`Aprobación PESTEL.docx` es un acta de reunión de 1.020 caracteres. Prueba que el DOFA y el PESTEL 2026 **existen y fueron aprobados**, y no contiene sus entradas.

| Entidad | Filas | Carga |
|---|---:|---|
| `AnalisisContexto` | **2** | `DOFA`/`PESTEL`, `anio = 2026`, `fechaAprobacion = 2026-04-22`, `actaReferencia = 'Aprobación PESTEL_DOFA 2026'`, `aprobadoPor` = Daniel Medina, `vigente = true` |
| `EntradaContexto` | **0** | **Sin fuente.** Se construyen en la aplicación |

Es el resultado correcto, no un fracaso: la cabecera con su acta es lo que un auditor pide para creer que el análisis se hizo, y las casillas se escriben en las pantallas que ya existen (`app/estrategico/dofa`, `app/estrategico/pestel`). Sembrar entradas inventadas sería falsificar el análisis de contexto de la organización.

---

## 7 · Orden de carga

```
 0  Sincronizar Directorio (Graph)        precondición dura · sin Persona no hay nada
 1  CargoResponsable · alta               «Profesional de Calidad y Procesos» (D-4)
 2  ContenidoSig  (22)  + VersionContenido (22)
 3  Obligacion    (27)                    ← 25 limpias, 2 esperan D-3
 4  AnalisisContexto (2)                  independiente de 1–3, puede ir en paralelo
 5  Generar asignaciones                  idempotente · al final · siempre
```

Los pasos 2 y 3 van en **una transacción**: 22 contenidos sin sus obligaciones es un catálogo que nadie ejecuta, y 27 obligaciones apuntando a contenidos a medias no arrancan.

El bloque B **no tiene paso**: entra cuando D-7 se cierre.

---

## 8 · Criterios de aceptación

1. `select count(*) from contenido_sig` → **22**. Ninguno con `titulo` vacío; los 22 con `procedimientoOrigen` no nulo citando `FOR-CAL-11` y su numeral.
2. `select count(*) from obligacion where activa` → **25** (27 menos las dos de D-3).
3. **Reparto por periodicidad:** 14 MENSUAL · 8 ANUAL · 2 TRIMESTRAL · 1 SEMESTRAL. Cualquier otra cifra es un error de derivación, no una interpretación.
4. **Las nueve de indicadores comparten `contenidoId`** y tienen nueve `alcanceAreaId` distintos: EST, COM, PRY, SAC, TAL, LEG, TEC, **SIG** y FIN. Ojo con dos: el cronograma dice «Proceso de Gestión de Calidad» y el área es `SIG` (Sistema Integrado de Gestión); dice «Proceso de Gestión de Proyectos» y el prefijo del área es `PRY`, no `PRO`.
5. `select count(*) from obligacion where fecha_inicio < '2026-09-01'` → **0**. Es el criterio que impide estrenar el sistema con deuda.
6. Cada `Obligacion` respeta las guardas de `crearObligacion`: contenido existente, `responsableSeguimientoId` resuelto, `plazoDias > 0`, `diasAviso >= 0`, y **exactamente un destino** de alcance.
7. `select count(*) from analisis_contexto` → **2**, ambos de 2026, con `fecha_aprobacion = 2026-04-22`. `select count(*) from entrada_contexto` → **0**.
8. Ningún `documentoCodigo` con los códigos obsoletos de G-3: cero ocurrencias de `POL-CAL-01`, `FOR-GAF-07`, `FOR-GAF-04`.
9. `select count(*) from asignacion` **antes** de correr la generación → **0**. Después, correrla dos veces no cambia el conteo.
10. `select count(*) from hallazgo` → **0**. El bloque B no entra en este REQ.

---

## 9 · Decisiones

**Cerradas por defecto** — se ejecutan así salvo indicación contraria; las tomé para no dejar el REQ bloqueado, y las dos son reversibles antes de correr la carga.

- **D-1 · alcance.** REQ-SIG-17 cubre los tres bloques nombrados y **no** las otras nueve fuentes, que quedan en §10. Un requerimiento que cubriera las doce quedaría bloqueado por decisiones ajenas a él (§10).
- **D-2 · retroactividad.** Las 27 obligaciones nacen con `fechaInicio = 2026-09-01`. El cronograma va de AGO-2025 a JUL-2026 y hoy es 2026-09-08: **la fuente está vencida y sus periodos ya pasaron.** Cargar la fecha real generaría trece meses de asignaciones vencidas que nadie incumplió, y sembrar el histórico con su ejecución exigiría insertar `Asignacion` y `RegistroRealizado` a mano, que es justo lo que el diseño reserva al sistema. El histórico queda como contexto de este documento; los datos arrancan limpios.

**Abiertas** — cada una bloquea algo concreto.

- **D-3 · `BIMESTRAL`.** ¿Se agrega al enum `Periodicidad`? Bloquea la fila 31 (Comité de Calidad). Alternativa sin migración: cargarla `TRIMESTRAL` y aceptar que el sistema pida cuatro comités al año donde la organización planeó seis. La fila 26 depende de la misma decisión por otra razón (G-7): no tiene periodo, y hay que elegir entre TRIMESTRAL, dejarla sin obligación, o partirla.
- **D-4 · tabla de cargos.** Confirmar el mapeo de §4.5 y autorizar el alta de «Profesional de Calidad y Procesos» en `CargoResponsable`.
- **D-5 · «Líderes de Proceso».** Aparece en las filas 44, 46 y 48 y no es un cargo, es un conjunto. ¿`alcance = AREA` replicado por las nueve áreas —27 asignaciones más por periodo—, o `CARGO` sobre un cargo nuevo «Líder de proceso»?
- **D-6 · plazos.** Confirmar la tabla de `plazoDias`/`diasAviso` de §4.5. Es una invención razonada, no un dato: la fuente no habla de plazos.
- **D-7 · bloque B.** Con `fechaDeteccion` ausente en las 46 filas, hay tres caminos: **(a)** el líder del SIG completa fecha, requisito y evidencia objetiva en el Excel y se carga después; **(b)** se cargan solo los 102 hallazgos abiertos de 2026 usando la fecha del informe de auditoría de origen como `fechaDeteccion` aproximada, con el aviso de que es aproximada; **(c)** no se carga histórico y el tablero de mejora arranca vacío. La opción (c) es la única que no mete un dato inventado en un registro que un auditor va a leer.

---

## 10 · Lo que no entra, y qué lo bloquea

| Fuente | Destino | Filas | Bloqueo |
|---|---|---:|---|
| `MAT-EST-02 Matriz de partes interesadas` | `ParteInteresada` · `NecesidadExpectativa` · `SeguimientoParteAnual` | ~10 · 29 · 58 | Ninguno técnico. Requiere la transposición año→fila. **Candidato a REQ-SIG-18** |
| `MAT-CAL-02 Matriz de Riesgos y Oportunidades` | `RiesgoOrganizacional` · `ControlRiesgoOrg` | 66 | **Conflicto de versión:** V3.0 en `06/01/1.2025` y `06/01/2.2026`, y **V4.0** en `15. Entregables SIG/4. Matriz de Riesgos`. Hay que declarar la vigente antes de tocar la prueba de paridad |
| `MAN-CAL-01 Manual de Riesgos` | Los 7 catálogos del método | 5+5+5+6+6+3+3 | **Conflicto de versión:** V1.0 en `05/09/3. Manual`, V2.0 en `06/01`, y `V2.0-ISO27001` en `15. Entregables SIG` |
| `MAT-CAL-03 Matriz de Indicadores` + `08. Indicadores` | `Metrica` · `MedicionMetrica` | por medir | Sin bloqueo conocido. Es la fuente del tablero que la app ya muestra |
| `MAP-CAL-01 Mapa de procesos` | `Proceso` | 9 | La tabla **nace vacía a propósito**: falta decidir área y cargo de cada proceso (ver `proceso-entidad.md`) |
| `MAT-EST-01 Matriz de Requisitos Legales` | `RequisitoLegal` | 0 → 11 | La matriz está **vacía** en la vigente y en las dos obsoletas. La semilla son las 11 normas del marco teórico de MAN-CAL-01 |
| `ISO 9001_2015.pdf` · `ISO-IEC-27001-2022.pdf` | `NormaAuditable` · `RequisitoNorma` | 2 · ~41 | Ninguno. Semilla |
| `09. Auditorias` + `FOR-CAL-04` | `ProgramaAuditoria` · `Auditoria` · `CeldaPlan` · `NotaAuditor` · actas e informes | 1 · 5 · ~40 · 76 · 4 | Coherencia con el bloque B: cargar la auditoría 2026 ya emitida obliga a que sus oportunidades existan como hallazgos |
| `FOR-CAL-08` ×4 en `06/02` | `MaterializacionRiesgo` | 4 | Depende de `RiesgoOrganizacional` |
| — | `PlazoPorTipoHallazgo` | 4 | **Sin fuente documental.** Hay que decidirlos con el líder del SIG |
| Microsoft Graph | `Persona` | ~34 | **Precondición de este REQ** (§7, paso 0) |
| `Compromisos  SGC.xlsx` | — | 479 | **No se carga** (§5.5) |

---

## 11 · Resumen para el desarrollador

- **Una fuente manda para las obligaciones:** `03. Manuales/1. Cronograma SIG/1. Cronograma SGC.xlsx`. Las políticas dicen «periódicamente» y eso no llena un enum (§3).
- **Sincronizá el Directorio primero.** `responsableSeguimientoId` es FK obligatoria a `Persona` y `Persona` no está cargada.
- **22 contenidos, 27 obligaciones, 2 análisis de contexto, 0 entradas, 0 hallazgos.** Esos son los números; si te salen otros, revisá §4.3 antes de ajustar el importador.
- **Las nueve filas de indicadores son un contenido y nueve obligaciones por área.** No nueve contenidos.
- **`fechaInicio = 2026-09-01` en las 27.** Cero asignaciones vencidas al arrancar es criterio de aceptación, no preferencia.
- **Remapeá los tres códigos obsoletos** (G-3) y **no** cargues `EntradaContexto`, `Asignacion` ni `RegistroRealizado`: los dos últimos los produce el sistema al operar.
- **Corré la generación al final**, y corréla dos veces para probar que es idempotente.
