# Delta for maturity-percentage-scale

## Purpose

La madurez de un control se mide en porcentaje, de 0 a 100 de diez en diez, con un descriptor escrito por escalón. La eficacia *es* el número: no hay curva que interpretar. La escala vieja (L0-L5, curva PILAR) tenía un solo valor entre el 30 % y el 90 %, que es el tramo donde se decide la banda del riesgo, y tres escalones apiñados en el techo, donde ya no cambia nada.

## ADDED Requirements

### Requirement: Once escalones con rúbrica, y el catálogo es la fuente

`EscalaMadurez` MUST contener once filas con `nivel` ∈ {0, 10, 20, …, 100}, cada una con su descriptor. El cálculo del riesgo MUST leer la eficacia de esa tabla y MUST NOT reconstruirla desde una constante del código.

#### Scenario: La tabla manda

- GIVEN el escalón de 70 % editado en el catálogo a una eficacia distinta de 0.70
- WHEN se regeneran los riesgos
- THEN el residual usa la eficacia del catálogo, sin recompilar

#### Scenario: Un escalón que el catálogo no trae es un dato roto

- GIVEN un control apuntando a un nivel que no existe en la tabla de eficacia
- WHEN se calcula su eficacia
- THEN la lectura falla nombrando el nivel, y NO devuelve cero

#### Scenario: «Sin evaluar» no es 0 %

- GIVEN un control aplicable cuyo nivel es `null`
- WHEN se calcula el índice de madurez
- THEN el control queda FUERA de la media, y no entra como cero

### Requirement: El 100 % no es seleccionable

La interfaz MUST NOT ofrecer el escalón de 100 %. Eficacia 1.0 daría `residual = 0` — el riesgo desaparecería del registro, y ningún control elimina un riesgo.

#### Scenario: El selector llega hasta 90

- GIVEN la pantalla de un control
- WHEN se despliegan los escalones
- THEN se ofrecen diez opciones, de 0 % a 90 %, y el 100 % no aparece

### Requirement: El motor acota la eficacia en 0.95

Todo camino de cálculo MUST aplicar `e_efectiva = MIN(e, 0.95)` dentro de `calcularRiesgo`, de modo que `residual ≥ 0.05 × inherente` siempre. La restricción MUST NOT vivir sólo en la interfaz.

#### Scenario: Un 100 % escrito por script no borra el riesgo

- GIVEN un control llevado a eficacia 1.0 fuera de la interfaz
- WHEN se calcula el riesgo de una amenaza con inherente 50
- THEN el residual es 2.50 y no 0.00, y la salida marca que el techo actuó

#### Scenario: Por debajo del techo no interviene

- GIVEN una eficacia agregada de 0.90
- WHEN se calcula el residual
- THEN el resultado es `inherente × 0.10` y el techo NO se marca como actuante

### Requirement: La traducción preserva la eficacia y se marca

La migración MUST traducir por eficacia —L0→0, L1→10, L2→50, **L3→90, L4→90**, L5→100— y MUST dejar `Control.recalificadoEn = null` en todos los controles. La pantalla de Madurez MUST reportar dos índices: traducido y recalificado.

#### Scenario: La traducción no mueve el tablero

- GIVEN la población actual (11 en L2, 44 en L3, 31 en L4, 7 sin evaluar)
- WHEN corre la migración
- THEN el índice declarado queda entre 84 % y 87 %, y ningún control cambió de nivel por regla

#### Scenario: La marca distingue traducido de recalificado

- GIVEN un control traducido a 90 % que nadie miró con la rúbrica nueva
- WHEN se abre la pantalla de Madurez
- THEN el control aparece marcado «traducido, sin recalificar» y queda fuera del índice recalificado

#### Scenario: La traducción no escribe bitácora

- GIVEN la migración aplicada
- WHEN se cuentan las filas de `Bitacora`
- THEN no hay ninguna nueva: un remapeo que preserva el significado no es un cambio de madurez
