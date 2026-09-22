# Delta for risk-analysis-grid

## Purpose

Que quien lee «Análisis de riesgos» controle la vista de sus trece columnas —cuáles, en qué ancho,
en qué orden, cuál fijada— sin que ese control pueda cambiar **cuántos** activos hay. La disposición
es del lector; el alcance es del modelo.

## ADDED Requirements

### Requirement: La grilla filtra, y las tarjetas cuentan lo que muestra

La grilla MUST ofrecer filtro por columna, visible sin abrir un menú, de texto o de número según lo
que la columna contenga. Las seis tarjetas MUST contarse sobre **las filas que la grilla deja
visibles**, y NO MUST derivarse de un objeto de filtros aparte.

> Esta exigencia decía lo contrario hasta el 21/09/2026 —«la grilla no decide qué filas hay»— y se
> invirtió por pedido de quien usa la pantalla, junto con el retiro de los seis desplegables. La
> garantía de fondo no cambió: la pantalla no puede tener dos verdades sobre cuántos activos hay.
> Lo que cambió es cómo se sostiene.

#### Scenario: Toda columna trae filtro, y a la vista

- GIVEN las definiciones de columna que produce `columnasAnalisis`
- WHEN se inspeccionan
- THEN `defaultColDef.filter` y `defaultColDef.floatingFilter` son `true`, y las columnas numéricas
  declaran `agNumberColumnFilter` mientras las de texto declaran `agTextColumnFilter`

#### Scenario: Filtrar en la grilla mueve las tarjetas con ella

- GIVEN 30 activos visibles y la tarjeta `EN ANÁLISIS` diciendo 30
- WHEN un filtro de columna deja 12 filas visibles
- THEN la tarjeta `EN ANÁLISIS` dice 12, y las otras cinco cuentan sobre esas mismas 12

#### Scenario: La tarjeta y la lista no pueden desacordar

- GIVEN cualquier combinación de filtros de columna
- WHEN se comparan la cifra de la tarjeta `EN ANÁLISIS` y las filas que la grilla recibió
- THEN son el mismo número, porque salen del mismo arreglo — no de dos derivaciones paralelas

#### Scenario: Ordenar no cambia el conteo

- GIVEN cualquier orden aplicado, por el `<select>` o por clic en una columna
- WHEN se cuentan las filas y se lee la tarjeta `EN ANÁLISIS`
- THEN el número es el mismo que antes de ordenar

---

### Requirement: El lector dispone las columnas, y la disposición persiste

La grilla MUST permitir mover, redimensionar, ocultar y fijar columnas. La columna `Código` MUST
venir fijada a la izquierda por defecto. Las tres dimensiones `D`, `I`, `C` MUST vivir bajo un
encabezado agrupado que las nombre. El encabezado MUST quedar visible al desplazar la lista.

La disposición resultante MUST persistir por navegador y MUST poder restablecerse a la de fábrica
con un control visible.

#### Scenario: La disposición sobrevive a recargar

- GIVEN que se movió `Proceso` antes de `Valor` y se ocultó `Propietario`
- WHEN se recarga la página
- THEN `Proceso` sigue antes de `Valor` y `Propietario` sigue oculta

#### Scenario: Restablecer devuelve las trece columnas

- GIVEN una disposición con tres columnas ocultas
- WHEN se activa «Restablecer columnas»
- THEN vuelven las trece en el orden de fábrica, con `Código` fijada a la izquierda

#### Scenario: Una disposición guardada que ya no cuadra no rompe la pantalla

- GIVEN una disposición en `localStorage` que nombra una columna que ya no existe
- WHEN la pantalla se pinta
- THEN se ignora la disposición guardada y se usa la de fábrica, sin error visible al usuario

---

### Requirement: El orden efectivo se nombra como es

El `<select>` «Orden» MUST seguir fijando el orden de partida con sus dos criterios de negocio —peor
residual y criticidad (RTO)—. Ordenar por una columna MUST estar permitido, y entonces el rótulo
MUST decir «orden personalizado» en lugar de afirmar un criterio que ya no rige.

#### Scenario: El orden por defecto no cambió

- GIVEN la pantalla recién abierta
- WHEN se leen las filas de arriba abajo
- THEN están por peor residual descendente, y el rótulo dice «orden por peor residual»

#### Scenario: Criticidad (RTO) da el mismo resultado que antes

- GIVEN los cuatro activos del fixture de §14.12 (`C3`, `C1`, sin criticidad, `C5`)
- WHEN se elige «Criticidad (RTO)»
- THEN el orden es RTO ascendente, con sin-criticidad y sin-SLA al final y desempate estable por
  código — el mismo resultado que `ordenarPorCriticidad`

#### Scenario: Ordenar por columna renombra el rótulo

- GIVEN la pantalla con el orden por defecto
- WHEN se hace clic en el encabezado de `Proceso`
- THEN las filas se reordenan por proceso y el rótulo dice «orden personalizado»

---

### Requirement: La banda y el estado del plan siguen siendo legibles sin ver el color

Cada fila MUST llevar una clase que nombre su banda residual y otra que nombre su estado de plan. La
banda MUST además seguir escrita **en palabras** en su columna. Un residual `null` MUST seguir
diciendo «sin calcular» y NO MUST pintarse.

#### Scenario: Crítico y Alto se acentúan

- GIVEN un activo con residual en banda `Crítico` y otro en `Alto`
- WHEN se pintan sus filas
- THEN ambas llevan `fila-alarmante`, y las clases `fila-banda--Critico` y `fila-banda--Alto`

#### Scenario: Medio no se acentúa

- GIVEN un activo con residual en banda `Medio`
- WHEN se pinta su fila
- THEN no lleva `fila-alarmante`

#### Scenario: Sin calcular no es ni alto ni bajo

- GIVEN un activo cuyo peor residual es `null`
- WHEN se pinta su fila
- THEN no lleva `fila-alarmante`, lleva `fila-banda--sin-calcular`, y la celda dice «sin calcular»

#### Scenario: Alto sin requerir plan se acentúa igual

- GIVEN un activo en banda `Alto` cuyo estado de plan es `no-requiere`
- WHEN se pinta su fila
- THEN lleva `fila-alarmante` y `fila-plan--no-requiere`: son dos preguntas distintas

---

### Requirement: Los dos accesos de la fila sobreviven a la grilla

La celda de `Código` MUST seguir siendo un enlace al overlay de Amenazas conservando los filtros
vigentes en la URL. La celda de `Plan` MUST seguir ofreciendo «+ plan» en **todas** las filas, con
nombre accesible propio por activo, y abrir el popup del activo de su propia fila.

#### Scenario: El código enlaza al overlay con los filtros puestos

- GIVEN la lista filtrada por «Proceso = Gestión Tecnológica»
- WHEN se hace clic en el código de una fila
- THEN se navega a `/sgsi/valoracion-riesgos?...&activo=<código>&tab=amenazas` conservando el filtro
  de proceso

#### Scenario: «+ plan» también donde no se requiere

- GIVEN un activo cuyo control principal ya alcanza lo exigido
- WHEN se mira su fila
- THEN ofrece «+ plan», con el nombre accesible «Registrar planes de tratamiento para \<código\>»

#### Scenario: El botón abre el popup de su propia fila

- GIVEN la grilla con varias filas
- WHEN se activa «+ plan» en la fila de `FIN-DAT-0007`
- THEN se abre el popup de `FIN-DAT-0007`, y no el de otro activo

---

### Requirement: Exportar CSV exporta lo que se está viendo

La grilla MUST ofrecer exportar a CSV las filas visibles, en el orden y con las columnas visibles al
momento de exportar. El archivo NO MUST presentarse como el informe formal de valoración.

#### Scenario: El CSV respeta el recorte

- GIVEN la lista filtrada a 12 activos con `Propietario` oculta
- WHEN se exporta a CSV
- THEN el archivo trae 12 filas y no trae la columna `Propietario`

---

## MODIFIED Requirements

### Requirement: La lista de «Análisis de riesgos» se pinta con AG Grid

La lista de activos en análisis MUST renderizarse con `AgGridReact` (AG Grid Community, MIT) cargado
con `next/dynamic` y `ssr: false`, en lugar de la `<table>` escrita a mano. Las cinco tarjetas, los
seis filtros de la URL, la franja «sin plan» y el encabezado de la pantalla NO MUST cambiar de
comportamiento.

#### Scenario: La pantalla sin activos sigue diciendo lo mismo

- GIVEN ningún activo alcanza el umbral y no hay filtros puestos
- WHEN se abre la pantalla
- THEN se muestra el mensaje de umbral con el enlace a «Valoración de activos», y no se carga la
  grilla

#### Scenario: Un filtro que no deja nada no es un error

- GIVEN una combinación de filtros sin resultados
- WHEN se pinta la pantalla
- THEN dice «Ningún activo cumple esta combinación de filtros» y las tarjetas muestran ceros
  coherentes con ese recorte
