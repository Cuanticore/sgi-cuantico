# Delta for asset-hierarchy-standardization

## Purpose

Que la identidad de un nivel del inventario sea su nombre **normalizado** y no su nombre literal,
para que `MONITOR` y `Monitor` no puedan coexistir bajo el mismo padre. Y que los nombres ya
guardados se enderecen antes de que la restricción los exija.

## ADDED Requirements

### Requirement: La identidad de un nivel ignora la caja y los espacios de los bordes

El índice `nivel_activo_identidad` MUST ser único sobre `(grado, upper(btrim(nombre)), padre_id)`
con `NULLS NOT DISTINCT`. Dos niveles del mismo grado bajo el mismo padre cuyos nombres colapsen al
mismo valor normalizado MUST ser rechazados por la base.

La cláusula `NULLS NOT DISTINCT` MUST conservarse: las raíces tienen `padre_id NULL`, y sin ella dos
raíces con el mismo nombre pasan.

Las tildes MUST seguir distinguiendo. `CODIGO FUENTE` y `CÓDIGO FUENTE` son dos identidades
distintas, y unirlas es una decisión aparte porque obliga a elegir qué ortografía sobrevive.

#### Scenario: Dos hermanos que sólo difieren en la caja

- GIVEN un nivel de grado 2 llamado `MONITOR` bajo el nivel 1 `PRODUCTOS`
- WHEN se intenta crear otro de grado 2 llamado `Monitor` bajo el mismo `PRODUCTOS`
- THEN la base lo rechaza por violación de unicidad
- AND es el caso que hoy existe en la base con los ids #13 y #127

#### Scenario: Dos raíces con el mismo nombre

- GIVEN el nivel 1 `PRODUCTOS`, con `padre_id NULL`
- WHEN se intenta crear otro nivel 1 llamado `Productos`, también con `padre_id NULL`
- THEN la base lo rechaza
- AND sin `NULLS NOT DISTINCT` habría pasado, porque los NULL son distintos entre sí

#### Scenario: El mismo nombre bajo padres distintos sigue siendo legítimo

- GIVEN un nivel 3 `DOCUMENTACIÓN` bajo `MINTRACE`
- WHEN se crea un nivel 3 `DOCUMENTACIÓN` bajo `SIG`
- THEN se crea sin problema
- AND son dos nodos distintos, porque son la documentación de dos cosas distintas

#### Scenario: Las tildes no se unifican

- GIVEN un nivel 3 `CÓDIGO FUENTE` bajo `ILC`
- WHEN se crea un nivel 3 `CODIGO FUENTE` bajo `ILC`
- THEN se crea, y quedan dos nodos
- AND eso es deliberado: unificarlos exige decidir qué ortografía sobrevive

### Requirement: La restricción se aplica después de enderezar los nombres

La migración que instala el índice funcional MUST correrse **después** de
`scripts/estandarizar-niveles.ts --aplicar`. Mientras queden nombres que colapsen al mismo valor
normalizado bajo el mismo padre, la migración MUST fallar.

Esa falla es correcta y MUST NOT resolverse relajando el índice.

#### Scenario: Se intenta migrar sin haber estandarizado

- GIVEN una base donde conviven `MONITOR` #13 y `Monitor` #127 bajo el mismo padre
- WHEN se aplica la migración del índice funcional
- THEN falla con violación de unicidad
- AND el mensaje nombra qué dos filas colapsan

#### Scenario: Una base vacía no detecta nada

- GIVEN `npm run verificar:migraciones`, que aplica todas las migraciones sobre una base vacía
- WHEN corre esta migración
- THEN pasa en verde
- AND eso NO es evidencia de que la base real esté lista: una base vacía no tiene los datos que la
  harían fallar

### Requirement: El plan de estandarización se revisa antes de aplicarse

`scripts/estandarizar-niveles.ts` sin `--aplicar` MUST imprimir el plan y no escribir nada. El plan
MUST calcularse contra la **misma base** donde se va a aplicar.

Con conflictos distintos de cero, `--aplicar` MUST negarse a escribir.

#### Scenario: Un plan leído en otra base no autoriza nada

- GIVEN un plan simulado contra `localhost:5432`
- WHEN se va a aplicar contra producción
- THEN se vuelve a simular allá primero
- AND el plan de 5432 sirve para dimensionar el trabajo, no para autorizarlo

#### Scenario: Los duplicados emergentes aparecen al propagar

- GIVEN `MINTRACE` #6 bajo `PRODUCTOS` #2 y `Mintrace` #132 bajo `Productos` #131
- WHEN se calcula el plan
- THEN la fusión de la raíz los vuelve hermanos y el plan incluye fundirlos
- AND una consulta de una sola pasada sobre el árbol actual no los ve, porque todavía no son
  hermanos

#### Scenario: Nada se borra

- GIVEN una fusión aplicada donde #127 fue absorbido por #13
- WHEN se consulta #127
- THEN sigue existiendo, con `activo = false` y su historia
- AND sus hijos y sus activos apuntan ahora a #13
