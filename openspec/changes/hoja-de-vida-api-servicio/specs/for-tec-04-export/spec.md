# Delta for for-tec-04-export

## Purpose

El libro `FOR-TEC-04` se diligencia hoy a mano. El registro del último traslado del expediente SIS-001 lo documenta: 464 comentarios de celda, cinco reglas de mapeo aplicadas a mano, 214 casillas marcadas `[PENDIENTE]`, 156 valores reales que no calzaban en sus listas desplegables, y verificación abriendo el libro en LibreOffice para recalcular 4.000 fórmulas.

Esta capacidad invierte la relación: el libro pasa a ser **salida** del sistema en vez de ser el sistema. Se genera desde la base, no se edita.

## ADDED Requirements

### Requirement: El constructor del libro es puro

`lib/sig/for-tec-04-libro.ts` MUST recibir los datos ya consultados y devolver el libro. MUST NOT acceder a Prisma, a la sesión ni a ninguna fuente de entrada y salida. La ruta que lo sirve MUST limitarse a autorizar, consultar y responder el búfer.

Es el patrón que `lib/sgsi/inventario-libro.ts` ya estableció, y lo que permite probar las doce hojas sin levantar una base de datos.

#### Scenario: Las doce hojas se prueban sin base

- GIVEN datos de un sistema armados en memoria
- WHEN se invoca el constructor
- THEN devuelve un libro con las doce hojas y la prueba corre sin Postgres

### Requirement: La forma del formato se respeta tal como es, no como debería ser

Los encabezados MUST escribirse en la **fila 4**. El conteo de filas reales MUST hacerse filtrando por la columna de identificador no vacía, y MUST NOT derivarse de la última fila del libro.

El formato trae las columnas de fórmula pre-copiadas hasta la fila 504 aunque no haya dato. Contar por última fila devuelve quinientas filas vacías y rompe todos los indicadores del tablero.

#### Scenario: Quinientas filas de fórmula no son quinientos registros

- GIVEN una hoja con tres registros y fórmulas pre-copiadas hasta la fila 504
- WHEN se cuentan las filas reales
- THEN el resultado es tres

#### Scenario: La fila de ejemplo se reemplaza siempre

- GIVEN el formato original, cuya fila 5 trae un registro ilustrativo
- WHEN se genera el libro de cualquier sistema
- THEN la fila 5 contiene datos reales o queda vacía, y nunca el ejemplo del formato

#### Scenario: La fórmula rota del original no se propaga

- GIVEN que el formato original trae `_xlfn._LONGTEXT()`, que no es una función válida
- WHEN se genera el libro
- THEN esa cadena no aparece en ninguna celda, y la fórmula equivalente es válida

### Requirement: Un dato que no cabe en la lista no se esconde en un comentario

El generador MUST NOT escribir comentarios de celda para conservar valores que no calzan en una lista desplegable del formato. Cuando un valor real no corresponda a ninguna opción admitida, la casilla MUST quedar vacía y el caso MUST aparecer en el reporte de faltantes.

El mecanismo de los 464 comentarios nació porque 156 valores no calzaban y 214 casillas estaban pendientes. La respuesta correcta a un dato que no cabe no es ocultarlo donde sólo lo ve quien pase el cursor por encima: es decir que la lista está mal, y llevarlo al dueño del formato.

#### Scenario: Un valor sin opción queda visible como faltante

- GIVEN un resultado de puerta «No evaluada», que la lista del formato no contempla
- WHEN se genera el libro
- THEN la casilla queda vacía y el reporte de faltantes nombra el valor real y las opciones disponibles

#### Scenario: El libro generado no trae comentarios de celda

- GIVEN cualquier sistema, completo o incompleto
- WHEN se genera el libro
- THEN no contiene ningún comentario de celda

### Requirement: Cada casilla vacía tiene nombre y dueño

El generador MUST producir un reporte de faltantes que, por cada casilla sin dato, indique la hoja, la casilla, qué falta y quién es el responsable de cerrarlo.

Reemplaza a los 214 `[PENDIENTE: qué falta — dueño]` escritos a mano, y es la pieza que hace honesto al libro: un formato con casillas vacías y dueño asignado sirve; uno con casillas llenas de supuestos, no.

#### Scenario: El reporte acompaña a la descarga

- GIVEN un sistema con criticidad sin diligenciar
- WHEN se descarga el libro
- THEN el reporte nombra la hoja `Sistemas`, la casilla de criticidad, qué falta y el responsable técnico del sistema

#### Scenario: Un sistema completo reporta cero faltantes

- GIVEN un sistema con su hoja de vida completa y sus 73 ítems respondidos con evidencia
- WHEN se genera el libro
- THEN el reporte de faltantes queda vacío
