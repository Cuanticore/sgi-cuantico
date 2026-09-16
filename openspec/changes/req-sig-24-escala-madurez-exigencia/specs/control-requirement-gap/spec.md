# Delta for control-requirement-gap

## Purpose

Qué nivel de control pide cada activo, cuánto le falta, y que esa falta —no la banda del residual— sea lo que abre un plan de tratamiento. La exigencia se expresa en puntos sobre la misma escala que la madurez, así la brecha es una resta de verdad y no una diferencia de ordinales.

## ADDED Requirements

### Requirement: Dos escaleras en puntos, y sobre D manda el mayor

La exigencia sobre el control principal MUST salir de dos escaleras: por criticidad —C1 y C2 90 %, C3 80 %, C4 70 %, C5 nada— aplicable SÓLO a amenazas que degradan disponibilidad, y por valor de la dimensión —5 → 90 %, 4 → 70 %, ≤3 nada—. Sobre D el nivel exigido MUST ser el mayor de los dos.

#### Scenario: El valor manda donde la criticidad no llega

- GIVEN un activo con `D=5` y criticidad `C4`, y una amenaza que degrada D
- WHEN se calcula la exigencia
- THEN exige 90 % **por el valor**, no 70 %

#### Scenario: La criticidad manda donde el valor no llega

- GIVEN un activo con `D=3` y criticidad `C1`, y una amenaza que degrada D
- WHEN se calcula la exigencia
- THEN exige 90 % **por la criticidad** — el caso que el valor D no detecta solo

#### Scenario: La criticidad no gobierna confidencialidad

- GIVEN un activo `C1` y `A.19 Divulgación de información`, que degrada sólo C
- WHEN se calcula la exigencia
- THEN la criticidad no aporta nada y manda el valor C

#### Scenario: Quitar la criticidad no borra la brecha

- GIVEN el activo anterior con `D=5` pasado de `C1` a `C5`
- WHEN se recalcula
- THEN sigue exigiendo 90 % por el valor

### Requirement: C1 exige el mismo número, verificado

Un activo de criticidad `C1` MUST exigir además una `EjecucionVerificacion` con resultado `CONFORME` en los últimos 12 meses sobre el control principal. Sin ella el estado MUST ser `brecha-de-verificacion`, nunca `cubierto`.

#### Scenario: Nivel alcanzado, verificación ausente

- GIVEN un activo `C1` cuyo principal está en 90 % sin verificación vigente
- WHEN se evalúa la brecha
- THEN el estado es `brecha-de-verificacion` y la pantalla nombra qué falta

#### Scenario: El mismo caso en C2 cumple

- GIVEN el mismo control y el mismo nivel sobre un activo `C2`
- WHEN se evalúa la brecha
- THEN el estado es `cubierto`

#### Scenario: Un vínculo que no resuelve no afirma nada

- GIVEN un control cuyo código no resuelve contra ninguna obligación
- WHEN se consulta si tiene verificación vigente
- THEN el resultado es «no se pudo determinar», y NO «no tiene»

### Requirement: La brecha se mide en puntos y nunca vale cero por ausencia

`brecha = exigido − actual` MUST expresarse en puntos porcentuales. Los estados `sin-principal` y `principal-sin-evaluar` MUST existir como estados propios y MUST NOT presentarse como cumplimiento ni como brecha de cero.

#### Scenario: Brecha con su factor sobre el riesgo

- GIVEN un principal en 70 % contra una exigencia de 90 %
- WHEN se evalúa la brecha
- THEN son 20 puntos, y la lectura dice que el residual es tres veces el del cumplidor

#### Scenario: Sin principal designado no hay nada que afirmar

- GIVEN una amenaza sin `relevanciaId` asignado en ninguno de sus pares
- WHEN se evalúa la brecha
- THEN el estado es `sin-principal`, la pantalla dice «pendiente de clasificar» y remite a REQ-SIG-21

## MODIFIED Requirements

### Requirement: La compuerta del plan de tratamiento es la brecha

Un activo MUST requerir plan cuando alguna de sus amenazas tenga brecha, y NO cuando su peor residual caiga en banda Crítico. El residual MUST seguir siendo lo que ordena la lista.

#### Scenario: La cola deja de estar vacía

- GIVEN el inventario actual, donde ningún residual alcanza la banda Crítico
- WHEN se abre `/sgsi/valoracion-riesgos`
- THEN la tarjeta cuenta activos con brecha, y no es cero

#### Scenario: Cumplir no implica residual aceptable

- GIVEN un activo `C4` cuyo principal está exactamente en 70 %
- WHEN se lee su ficha
- THEN el sistema dice «cumple» y muestra residual Alto en varias amenazas, sin contradicción

#### Scenario: El orden no cambió de criterio

- GIVEN la lista de activos en análisis
- WHEN se ordena por defecto
- THEN sigue ordenada por peor residual descendente
