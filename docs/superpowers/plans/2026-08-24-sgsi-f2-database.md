# F2 · Base de datos — Plan de implementación

**Fase:** 2 de 8 · pasos 5–9 del plan maestro
**Plan maestro:** `2026-08-24-sgsi-handoff-v2.md`
**Diseño:** `../specs/2026-08-24-sgsi-handoff-v2-design.md`
**Estado:** En curso

**Goal:** Modelar el dominio MAGERIT v3.0 + ISO/IEC 27001:2022 en Prisma, de forma que las once pantallas se puedan servir sin agujeros y que sea **estructuralmente imposible** almacenar una cifra calculada.

---

## Orden de autoridad, resuelto

| Fuente | Qué decide |
|---|---|
| `requisitos/MET-SIG-01 Metodologia v3.docx` | **La metodología aprobada.** Manda sobre el método: fórmulas, escalas, agregación de madurez, efecto de los controles y desviaciones declaradas. Es la máxima autoridad |
| `requisitos/REQ-SIG-01-requerimiento.txt` | **La especificación de la herramienta**, escrita para ejecución asistida. Manda sobre prefijos de área, abreviaturas de tipo y reglas de código. Referencia MET-SIG-01 **v2.0**, así que ante conflicto gana la v3 |
| `requisitos/MATRIZ MAGERIT ... v2.xlsx` | 13 hojas. La hoja `2. Valoración ` (ojo el espacio final) es la tabla de riesgos: **37 columnas, 7 constantes y 30 fórmulas**. Ese reparto **es** el contrato de qué se almacena |
| `requisitos/SPEC-herramienta-riesgos-v2.md` | 634 líneas: nombres de campo, enumeraciones y el modelo del plan |
| `design/Gestión de Activos.dc.html` | El motor, en `class Component` (L2694–4698) |
| `design/iso-controles.js`, `plan-tratamiento.js` | Semilla y contrato de campos de Control y AccionPlan |
| `README.md` | Bosquejo del dominio. **Es el de menor autoridad de todos** |

### Desviaciones declaradas respecto de MAGERIT (MET-SIG-01 §5.2)

Dos, expresas, y el modelo debe respetarlas:

1. **Tres dimensiones en lugar de cinco.** Se trabaja D, I y C. Como consecuencia, cuatro amenazas que la norma dirige a Autenticidad o Trazabilidad **se reasignan a Integridad**: `E.3`, `A.3`, `A.5`, `A.13`. Va en la semilla de degradación, no es regla de runtime.
2. **Escala de valor 0–5 en lugar de 0–10.** Los umbrales de impacto, riesgo y zonas se reescalaron en la misma proporción, de modo que la clasificación se conserva.

La organización **se reserva volver a las cinco dimensiones y a la escala 0–10 sin desplegar** (`REQ-SIG-01:129`). Por eso las escalas son tablas y los registros referencian el nivel, nunca el número.

### El Excel sí se puede leer

`exceljs` falla con `anchors`, pero el libro se abre entero con:

```
unzip -p "docs/handoff_v2/requisitos/MATRIZ MAGERIT - Activos y Riesgos (base) v2.xlsx" xl/worksheets/sheet5.xml
```

Las hojas usan cadenas en línea, así que encabezados y fórmulas salen directo. Mapa: `sheet3` activos · `sheet5` riesgos · `sheet7` controles · `sheet8` madurez · `sheet9` plan · `sheet10` amenazas · `sheet11` tipos · `sheet12` escalas · `sheet13` listas.

**Esto resuelve por anticipado el paso 10 del plan maestro.**

---

## La decisión central: nada calculable es columna

La hoja de riesgos guarda **7 constantes** y deriva 30 valores. Impacto por dimensión, impacto acumulado, nivel de impacto, frecuencia, riesgo potencial, nivel de riesgo, zona MAGERIT, ARO residual, riesgo residual, nivel residual, eficacia — **todas son fórmulas**.

Y el hallazgo que más cambia el modelo: **el tratamiento sugerido también es una fórmula** (columna AH, derivada del nivel residual). Solo se almacena la sobrescritura deliberada.

`SPEC:631` lo cierra: *«El impacto residual no existe en este modelo. Si aparece en algún reporte, es un error de implementación.»*

### Corrección: sí hay columnas calculadas, con disciplina

La primera versión de este plan decía «nada calculable es columna». **Es demasiado absoluto y se revisa**, a la luz de la implementación de referencia.

El Excel deriva 30 columnas porque es una hoja de cálculo: recalcular es gratis y automático. En Postgres, con 2 256 riesgos y matrices que se agregan del lado del servidor, recalcular en cada lectura cuesta, y además se pierde la posibilidad de indexar, ordenar y paginar por riesgo.

El punto medio disciplinado, tomado de `soar_cuantico`:

| Se persiste | Se deriva en lectura |
|---|---|
| `impacto`, `riesgo_potencial`, `frecuencia_residual`, `riesgo_residual` como `Decimal`, más `calculado_en` | Niveles de impacto y riesgo, **zona MAGERIT**, conteos y matrices |

Con tres condiciones que son las que lo hacen seguro:

1. **Un único escritor.** Solo el servicio de cálculo escribe esas columnas; la aplicación nunca las toca directamente.
2. **Tabla de snapshot** que congela las entradas exactas de cada cálculo en JSON, para poder auditar por qué dio lo que dio.
3. **Ninguna banda, zona, nivel ni conteo se almacena.** Se clasifican en lectura a partir de los decimales.

Lo que sigue prohibido sin excepción: **impacto residual**, matrices materializadas, vistas con cifras precocinadas y conteos cacheados.

`Riesgo` guarda entonces identidad `(activo_id, amenaza_id)` única, su `codigo`, las decisiones humanas —frecuencia de excepción, tratamiento, estado, responsable, observación, justificación, `obsoleto`— y los cuatro decimales derivados bajo esa disciplina.

`ControlImplementado` **no es una entidad**. El README dibuja `Riesgo 1─n ControlImplementado`, pero ninguna de las tres fuentes de datos lo respalda: la madurez del control vive una vez por control, y el vínculo amenaza↔control una vez por par. Modelarlo por riesgo multiplicaría 2 256 riesgos × 4,8 controles sin almacenar un solo dato nuevo.

### Regla transversal de escalas

Los registros operativos referencian **el nivel, nunca el número** (`SPEC:120`, `SPEC:626`). Toda valoración, degradación, frecuencia y madurez es una FK a su escala. Eso es lo que permite cambiar la escala de 0–5 a 0–10 desde la interfaz sin desplegar (`SPEC:457`).

---

## Paso 5 — El dominio

- [ ] **5.1 `Proceso`** (`area` en el SPEC) — `prefijo` char(3) único, `nombre` único, cargo líder, `activo`, `orden`. **Son 10, no 8**: el SPEC agrega `LEG` Gestión Legal y Compras y `TRA` Transversal. Tabla **compartida con el dominio SGC**, cuyo tablero agrupa por los mismos procesos
- [ ] **5.2 `TipoMagerit`** (10) — `codigo` `[D]`/`[SW]`…, `abreviatura` char(3) única. `Subtipo` (137) único por (tipo, código). Los subtipos se siembran del Excel, que es mucho más rico que el prototipo
- [ ] **5.3 `Activo`** — autorreferencia a superior, proceso, tipo, subtipo, propietario y custodio como cargos **distintos**, ubicación, entorno, tres banderas `Sí|No|Por definir` (datos de cliente, datos personales Ley 1581, expuesto a Internet), proveedor, `codigo_heredado`, `activo` bool. **Sin columnas `valor` ni `nivel`**: son derivadas
- [ ] **5.4 `ValoracionDimension`** — PK (activo, dimensión), FK a `escala_valor`. Dimensiones `D`,`I`,`C` activas; `A`,`T` modeladas e inactivas
- [ ] **5.5 `Amenaza`** (**57**, no 36) — `codigo` único con `*` literal (`N.*`, `I.*` son entradas reales), `grupo` de 4 miembros, nota de aplicación. Más **`AmenazaDegradacion`** con PK (amenaza, dimensión): la degradación es atributo **de la amenaza, no del riesgo**
- [ ] **5.6 `AmenazaPorTipo`** — junción pura PK (amenaza, tipo). **Es la tabla que genera los riesgos**: producto cartesiano del activo por las amenazas preclasificadas de su tipo
- [ ] **5.7 `Control`** (93) — `codigo` único, dominio (4), capacidad (15) con `orden` y `nombre_corto` propios, `aplica` bool, línea base / actual / objetivo como FK a `escala_madurez`, evidencia, responsable, fecha objetivo, y `funcion_control` presente sin usar (`SPEC:560`)
- [ ] **5.8 `ControlPorAmenaza`** — PK (amenaza, control) + **`relevancia_id` NOT NULL**. Se siembra invirtiendo el campo `am` de `iso-controles.js`: **272 pares, 57 amenazas, 4,77 controles por amenaza, máximo 8** — coincide exacto con `SPEC:543`
- [ ] **5.9 `RelevanciaControl`** — `Principal` peso 3 · `Complementario` 2 · `De apoyo` 1. Restricción a nivel de base: **exactamente un Principal por amenaza**
- [ ] **5.10 `Evidencia`** — por **Control**, no por riesgo. Tipo `Enlace|Archivo|Nota`. La evidencia base derivada de `Control.ev` no se puede borrar
- [ ] **5.11 `Riesgo`** — único por (activo, amenaza), `codigo R-NNNN`, y solo sobrescrituras: `madurez_id` **nulable** (no NOT NULL como escribe `SPEC:338`), `frecuencia_id` nulable, `tratamiento_id` nulable, `estado_id`, `responsable_cargo_id`, `observacion`, `justificacion_excepcion`, `obsoleto`
- [ ] **5.12 `AccionPlan`** — la unidad del plan es **la acción sobre un control, nunca sobre un riesgo**. `SPEC:356-364` propone `plan_tratamiento(riesgo_id)` y queda **superado** por §10, que el propio SPEC marca como trampa conocida. No crear ambas
- [ ] **5.13 `ContadorCodigo`** — PK (proceso, tipo) con `UPDATE … RETURNING`. **Nunca `MAX()+1`**: el código es inmutable y no reutilizable, y las bajas son lógicas

## Paso 6 — Escalas y umbrales

Verificadas contra la hoja `Escalas MAGERIT`.

- [ ] **6.1** `escala_valor` (6): etiqueta `"5 — Muy Alto"` … `"0 — Irrelevante"`
- [ ] **6.2** `escala_degradacion` (6): 1,00 · 0,80 · 0,50 · 0,20 · 0,05 · 0,00
- [ ] **6.3** `escala_frecuencia` (5): 100 · 10 · 1 · 0,1 · 0,01
- [ ] **6.4** `escala_madurez` (6): L0 0 · L1 0,10 · L2 0,50 · L3 0,90 · L4 0,95 · L5 1,00
- [ ] **6.5** `umbral_impacto` (5) y `umbral_riesgo` (4): Crítico ≥25 · Alto ≥5 · Medio ≥0,5 · Bajo <0,5
- [ ] **6.6** `zona_riesgo` (4) — función de cuatro ramas con umbrales en `parametro`. La `regla` del SPEC es una cadena; convertirla en motor de reglas sería sobreingeniería
- [ ] **6.7** `parametro` — `umbral_valoracion=4`, `delta_techo_eficacia=0,05`, `metrica_indice='media_eficacia'`, `borrado_fisico=false`, periodicidades, zona horaria

## Paso 7 — Catálogos

- [ ] **7.1** `Proveedor`, `Propietario`, `Custodio`, `Ubicacion`, `Entorno` — administrables, con renombrado propagado
- [ ] **7.2** Valor protegido «No aplica» no borrable, marcado en la fila
- [ ] **7.3** `Rol` (6) y grupos de AD

## Paso 8 — Bitácora y bajas lógicas

- [ ] **8.1** Baja lógica en `Activo`, `Riesgo` (`obsoleto`), catálogos, `AmenazaPorTipo` y **`AccionPlan`** — que en el SPEC **no tiene bandera y la necesita**
- [ ] **8.2** `Bitacora` append-only con `registro_id text` para abarcar tablas. **Agregar `motivo`**, que `SPEC:371-375` omite pese a que el README y el prototipo lo prometen
- [ ] **8.3** Restricciones condicionales de `AccionPlan` a nivel de base: `Mitigar`⇒control, `Aceptar`⇒justificación y fecha de revisión, `Transferir`⇒instrumento y riesgo remanente, `Cerrada`⇒verificación distinta de Pendiente
- [ ] **8.4** `LineaBase` con snapshot

## Paso 9 — Gate

- [ ] **9.1** `prisma migrate dev` aplica la primera migración
- [ ] **9.2** Recorrer las once pantallas y confirmar que cada dato tiene origen: columna o derivación
- [ ] **9.3** **Verificar que no exista ninguna columna** de nivel, banda, zona, conteo cacheado ni **impacto residual**, y que los cuatro decimales derivados tengan un solo escritor

---

## Aprendido de la implementación de referencia

`soar_cuantico` construyó este mismo dominio contra la v2.0. Lo que sigue está tomado de su código, no inventado.

### Lo que se adopta

- **`Decimal` en todo el motor**, redondeando a 4 decimales al persistir. Los flotantes nativos producen artefactos tipo `4.0000000000000001E-3`, ya visibles en el propio Excel
- **`contador_codigo` con upsert atómico** `INSERT … ON CONFLICT DO UPDATE … RETURNING`, más un **trigger de base que hace inmutable el código**, y un `CHECK` de agotamiento del espacio de numeración
- **Aplicabilidad como bandera + niveles nulables con `CHECK`**, y filtrar por ella en **todas** las métricas
- **Nunca borrar**: `obsoleto` / `obsoleto_en` para los cambios de alcance, y la reactivación conserva la valoración previa
- **`reasignada_desde`** en la degradación, para registrar la reasignación A/T → Integridad de `E.3`, `A.3`, `A.5`, `A.13`
- **La aritmética de madurez, en un módulo puro sin Prisma**, para que la pantalla de Controles recalcule el tablero completo del lado del cliente mientras se arrastran los selectores
- **Las cifras de referencia asertadas en dos lugares**: un test unitario sobre el fixture real y una verificación posterior a la siembra que relee la base
- **Listas cerradas** para cargo, proveedor, ubicación y entorno. Tienen evidencia de producción de por qué: «Líder del SIG» contra «Lider del SIG», y nombres de persona en una columna de cargo

### Los defectos que ya pagaron, y que no repetimos

- **`madurez_id` sin poblar → todas las matrices residuales salieron idénticas a las inherentes.** Cada riesgo corría con eficacia 0. Matemáticamente correcto dadas las entradas, y completamente equivocado como informe. Es el defecto más caro del dominio
- **La v1 promedió el nivel ordinal** para el índice titular. La metodología lo prohíbe expresamente
- **Doble conteo de controles** cuando la categoría de activo entra en la clave única del cruce amenaza↔control: el mismo par existe bajo varias categorías y el control se cuenta dos veces en su propio promedio. **Se resuelve dejando la categoría fuera de la clave**
- **Controles no aplicables contaminando promedios**: un solo 0 dentro de una media es justo el error que la restricción existe para impedir
- **Dos siembras rivales del cruce amenaza↔control** (236 y 263 pares) unidas y nunca reconciliadas. Se siembra **un solo conjunto autoritativo** de 272 pares

### Donde nuestras fuentes ganan sobre esa implementación

- **La relevancia y el Principal**: allá no se construyeron. La única columna con aire de peso es una prioridad fija en `'Media'` para 263 pares
- **La madurez de grupo**: allá es media de niveles redondeada, declarada placeholder en su propio comentario. **MET-SIG-01 v3 §7.4 ya la resolvió**: media ponderada por relevancia, acotada por el principal
- **`motivo` en la bitácora**: allá no existe la columna, y la interfaz promete un flujo que no está implementado
- **«+ Agregar amenaza» por activo**: allá existe la columna de origen y la lectura, pero **ningún camino de escritura**
- **Borrador contra publicado** en la parametrización: allá es estado de React; una recarga lo pierde
- **No heredar la dualidad de modelos de riesgo.** Esa implementación está a mitad de camino entre dos modelos, con claves nulables por linaje y un `drop` diferido. Construir de cero evita ese impuesto entero

---

## Resuelto por la metodología aprobada

MET-SIG-01 v3 cierra varias cuestiones que estaban abiertas. Son decisiones tomadas y justificadas, no criterio del equipo de desarrollo.

**Agregación de madurez (§8.2).** Tres cifras, cada una con función distinta:

| Métrica | Cálculo | Por qué |
|---|---|---|
| Índice de madurez | **Media de la eficacia** de los controles aplicables | La eficacia es escala de razón y se puede promediar; el nivel L0–L5 es ordinal y promediarlo es incorrecto. Además la eficacia es la que alimenta el riesgo residual, así madurez y riesgo hablan el mismo idioma |
| Nivel típico | **Mediana del nivel** de los aplicables | Estadístico correcto para una escala ordinal, resiste extremos |
| Titular del informe | **% de controles en L3 o superior** | La cifra que un Comité entiende sin explicación |

La **moda queda descartada** (insensible al avance). El **nivel medio se conserva solo como referencia comparativa entre periodos**, nunca como «la madurez de la organización». Y **las brechas nunca se agregan**: un control en L1 es una acción con dueño y fecha, no un decimal.

**Efecto de los controles (§7.4).** Solo se modela el efecto **preventivo**: la eficacia reduce la frecuencia. Los controles que limitan el daño se reflejan **bajando la degradación de la amenaza**, no el impacto del riesgo. La razón textual: *«Así hay un único juicio por fila y no dos.»*

Eficacia agregada, media ponderada acotada por el principal:

```
e(t) = MIN( Σ(wᵢ × eficaciaᵢ) / Σ(wᵢ) , eficacia_principal + δ )      δ = 5 %
```

| Relevancia | Peso | Criterio de asignación |
|---|---|---|
| Principal | 3 | Sin este control la amenaza no se contiene. **Cada amenaza tiene exactamente uno** |
| Complementario | 2 | Reduce la amenaza de forma sustantiva, pero no sustituye al principal |
| De apoyo | 1 | Ayuda por vía administrativa o cultural |

El techo es lo esencial: si el control principal está en L2, la eficacia de esa amenaza **no puede superar el 55 %**, por muy maduros que estén los demás. Solo actúa cuando el principal está débil.

La **composición probabilística queda expresamente descartada**: con cuatro controles en L3 daría 99,995 %. La eficacia de MAGERIT no es una probabilidad de bloqueo independiente sino un grado de calidad de implantación, y controles operados por la misma organización comparten modos de fallo.

**Periodicidad (§8.4).** La madurez se reevalúa cada seis meses y antes de la revisión por la dirección. **Cada corte conserva la calificación anterior como línea base.** Sin evidencia, el nivel no se sostiene ante un auditor.

## Bloqueador para F4

La metodología define el **criterio** de relevancia, pero ninguna fuente carga la **asignación**.

**Los 272 pares amenaza↔control no tienen relevancia, y las 57 amenazas no tienen Principal designado.** No están en el campo `am`, ni en la columna S del Excel, ni en las celdas de `MgAmenEfic` — que hoy es un `AVERAGE(...)` plano, justo la media simple que la metodología manda reemplazar.

El motor no puede correr sin ese dato. Pero ya no es una pregunta abierta: es una **tarea acotada con criterio escrito** — designar un Principal por amenaza y clasificar los 272 pares en tres pesos, con el juicio de seguridad de quien conoce los controles.

## Cuestiones abiertas

Cerradas por MET-SIG-01 y REQ-SIG-01: la agregación de madurez, el efecto «Limita el daño», la abreviatura de `[HW]` y el prefijo de Gestión Legal y Compras.

| # | Cuestión | Efecto |
|---|---|---|
| 7 | **Asignación de relevancia** de los 272 pares y Principal de las 57 amenazas. Criterio definido, dato inexistente | Bloquea F4 |
| 8 | **Nivel 1–5 de riesgo inherente y residual por activo** para las columnas del inventario: máximo, promedio o percentil. Hoy es un mapa fijo en el prototipo | Paso 5.3, pantalla 30 |
| 9 | **Amenazas agregadas o quitadas por activo no tienen dónde guardarse.** `obsoleto` no distingue «quitada como excepción con justificación» de «obsoleta porque cambió el tipo» | Paso 5.11 |
| 10 | **¿Una acción de plan por control, o varias?** El prototipo asume 0..1 y su botón `+` navega en vez de crear; el SPEC permite 1:n | Paso 5.12 |
| 11 | **«Publicar parametrización» implica versionado** (borrador contra publicado). No está en el esquema | Paso 5.6 |
| 12 | La restricción `Cerrada` ⇒ `madurez_alcanzada` **rechaza las 7 filas `Aceptar` de la propia semilla** | Paso 8.3 |
| 13 | Plazos de la tabla de criterios de aceptación, **pendientes de ratificación del Comité del SIG** | Pantalla 36 |

### Resueltas

- **`riesgo_degradacion` no debe existir.** MET-SIG-01 §7.4 es explícita: el efecto limitador va sobre la degradación de la **amenaza**, un solo juicio por fila. Se elimina del paso 5.11
- **`[HW]` → `EQU`** (`REQ-SIG-01:99-101`)
- **Gestión Legal y Compras → `LEG`**; son 10 áreas (`REQ-SIG-01:63-107`)
- **Agregación de madurez**: media de la eficacia, mediana del nivel, titular % en L3+
