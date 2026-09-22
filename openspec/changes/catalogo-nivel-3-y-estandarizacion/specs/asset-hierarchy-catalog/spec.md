# Delta for asset-hierarchy-catalog

## Purpose

Que el vocabulario de Nivel 3 sea una **decisión explícita** y no el residuo de lo que cada rama
tenga; que la plantilla mínima no pueda nombrar nada fuera de ese vocabulario; y que clasificar un
activo no obligue a salir de su ficha.

## ADDED Requirements

### Requirement: El catálogo de Nivel 3 es por clase y es la única fuente del vocabulario

MUST existir `catalogo_nivel_3` con `(clase, nombre, orden, activo)` y unicidad sobre
`(clase, nombre)`. `nombre` MUST guardarse normalizado con `normalizarNombreNivel`.

Las tres clases —`EMPRESA`, `PRODUCTOS`, `PROYECTOS`— MUST poder tener vocabulario propio. Hoy
`plantilla_nivel` no tiene ni una fila para `EMPRESA`, y esta propuesta no hereda ese vacío.

#### Scenario: El vocabulario se siembra con lo que ya se usa

- GIVEN los 27 nombres distintos de grado 3 que existen hoy en el árbol
- WHEN se siembra el catálogo
- THEN cada uno queda en la clase o las clases donde hoy se usa
- AND el reparto definitivo es criterio del SIG, no del algoritmo

#### Scenario: Un nombre puede vivir en más de una clase

- GIVEN `DOCUMENTACIÓN`, que hoy se usa bajo productos y bajo áreas de la empresa
- WHEN se siembra
- THEN existe una fila por cada clase donde aplica
- AND la unicidad es `(clase, nombre)`, no `nombre`

### Requirement: La plantilla mínima es un subconjunto del catálogo

`plantilla_nivel.nombreNivel3` MUST referenciar `catalogo_nivel_3(clase, nombre)`.
`aplicarPlantilla` MUST NOT poder crear un nivel cuyo nombre no esté en el catálogo de esa clase.

La plantilla MUST seguir respondiendo su propia pregunta —con qué arranca un producto nuevo— y
MUST NOT crecer hasta contener el vocabulario entero: un producto nuevo no arranca con 27 ramas.

#### Scenario: La divergencia de hoy deja de ser posible

- GIVEN el catálogo con `CÓDIGO FUENTE`, con tilde
- WHEN se intenta registrar en la plantilla el nombre `CODIGO FUENTE`, sin tilde
- THEN la llave foránea lo rechaza
- AND ésa es la fila que hoy existe y que haría nacer cada producto nuevo con una rama que no se
  parece a ninguna de las 26

#### Scenario: Aplicar la plantilla produce ramas del vocabulario

- GIVEN un nivel 1 de clase `PRODUCTOS` y su plantilla corregida
- WHEN se aplica a un producto nuevo
- THEN los nodos creados llevan los nombres del catálogo, idénticos a los de los otros productos
- AND siguen siendo sólo los de la configuración mínima, no los 27

### Requirement: El selector de Nivel 3 ofrece el catálogo, marcando lo que ya existe

Dado un Nivel 2 elegido, el selector MUST ofrecer los nodos de Nivel 3 que ya cuelgan de él **y**
los nombres del catálogo de la clase de su raíz que todavía no. Los dos grupos MUST distinguirse
visualmente.

La clase MUST derivarse subiendo por `padreId` con `claseDeNivel`, no leerse del Nivel 2.

#### Scenario: El caso que hoy no se puede hacer

- GIVEN `PROYECTOS / INC`, que hoy tiene dos hijos: `DOCUMENTACIÓN PRIVADA` y
  `DOCUMENTACIÓN CONFIDENCIAL`
- WHEN se abre el selector de Nivel 3
- THEN ofrece esos dos como existentes
- AND ofrece además `CÓDIGO FUENTE`, `DEPENDENCIAS` y el resto del catálogo de `PROYECTOS`, marcados
  como del catálogo

#### Scenario: Un nombre que existe en otra rama se ofrece como nuevo aquí

- GIVEN `CÓDIGO FUENTE` existe bajo `ILC` pero no bajo `INC`
- WHEN se abre el selector con `INC` elegido
- THEN `CÓDIGO FUENTE` aparece en el grupo del catálogo, no en el de existentes
- AND elegirlo va a crear un nodo **propio de INC**, no a reutilizar el de ILC

#### Scenario: Sin Nivel 2 elegido no hay catálogo que ofrecer

- GIVEN la rama a medio elegir, con Nivel 1 puesto y Nivel 2 en blanco
- WHEN se mira el selector de Nivel 3
- THEN dice «elegí el nivel 2» y no ofrece nada
- AND es el comportamiento actual, que no cambia

#### Scenario: Una rama huérfana no recibe vocabulario adivinado

- GIVEN un Nivel 2 cuya cadena hacia la raíz está rota, de modo que `claseDeNivel` devuelve `null`
- WHEN se arma el selector
- THEN ofrece únicamente los nodos existentes, sin catálogo
- AND la rama rota sigue viéndose rota, que es lo que hay que ver

#### Scenario: Lo guardado se muestra aunque no encaje

- GIVEN un activo cuyo `nivelId` apunta a un nodo inactivo o de otra rama
- WHEN se abre la ficha
- THEN ese nodo aparece igual entre las opciones
- AND es el comportamiento actual de `conElegido`, que existe para que el dato roto no se esconda

### Requirement: Elegir un nombre del catálogo crea el nodo al guardar, no al elegir

`guardarDatosGenerales` MUST aceptar, además de un `nivelId`, la forma
`{ nivel2Id, nombre }`. La resolución o creación del nodo MUST ocurrir **dentro de la misma
transacción** que guarda el activo, y MUST registrarse en bitácora tanto el alta del nivel como el
cambio de `nivelId` del activo.

Elegir en el selector MUST NOT escribir nada.

#### Scenario: Abrir el selector y arrepentirse no deja rastro

- GIVEN la ficha de un activo en `INC`
- WHEN se elige `CÓDIGO FUENTE` en el selector y luego se sale sin guardar
- THEN no existe ningún nodo nuevo bajo `INC`
- AND el árbol, el mapa y el grafo siguen igual

#### Scenario: Guardar crea el nodo y ubica el activo, o no hace ninguna de las dos

- GIVEN la misma ficha con `CÓDIGO FUENTE` elegido
- WHEN se guarda y la escritura del activo falla
- THEN tampoco queda el nodo creado
- AND un nodo cuyo activo no se guardó es basura que nadie va a limpiar

#### Scenario: Otro lo creó antes de que yo guardara

- GIVEN que `INC / CÓDIGO FUENTE` ya existe cuando se guarda el segundo activo
- WHEN la acción resuelve
- THEN **usa el nodo que está** y no crea un segundo
- AND es el caso corriente: dos activos de la misma rama se clasifican uno detrás del otro

#### Scenario: Otro lo creó en el mismo instante

- GIVEN dos guardados que resuelven `crear` sobre el mismo nombre y la misma rama a la vez
- WHEN el segundo `create` choca contra `nivel_activo_identidad`
- THEN la transacción entera se revierte: **ni el nivel ni el activo quedan guardados**
- AND la persona ve el mensaje y volver a guardar resuelve, porque la segunda vez el nodo ya
  existe y se usa
- AND **la acción NO reintenta sola**: el guardado puede haber reemitido el código del activo, y
  repetir la transacción quemaría un consecutivo y duplicaría renglones de bitácora. La
  atomicidad se conserva; el reintento es de la persona, con un mensaje que lo dice.

#### Scenario: El nombre se normaliza antes de resolver

- GIVEN el catálogo con `CÓDIGO FUENTE`
- WHEN llega `  código fuente  ` al servidor
- THEN se normaliza y resuelve contra el mismo nodo
- AND la regla es `normalizarNombreNivel`, la misma de los escritores masivos, no una copia

### Requirement: Instanciar un nombre del catálogo no es inventar vocabulario

Crear un nodo de Nivel 3 desde la ficha MUST exigir `activo:valorar` y MUST estar limitado a nombres
que ya estén en el catálogo de esa clase.

Crear un nombre que no está en el catálogo MUST seguir exigiendo `tecnologia:administrar` y MUST
seguir pasando por `/tecnologia/niveles`.

El Nivel 2 recibido MUST validarse: tiene que existir, ser de grado 2 y estar activo.

#### Scenario: Quien valora activos puede ubicarlos

- GIVEN una persona con `activo:valorar` y sin `tecnologia:administrar`
- WHEN guarda un activo eligiendo `CÓDIGO FUENTE` bajo `INC`
- THEN el nodo se crea y el activo queda ubicado
- AND la organización ya había decidido que `CÓDIGO FUENTE` existe; lo nuevo es que INC tiene uno

#### Scenario: La misma persona no puede inventar un nombre

- GIVEN la misma persona
- WHEN llega al servidor un nombre que no está en el catálogo de esa clase
- THEN se rechaza con un mensaje que dice que el vocabulario se administra en `/tecnologia/niveles`
- AND la taxonomía sigue teniendo un solo dueño

#### Scenario: Un Nivel 2 que no es de grado 2

- GIVEN un `nivel2Id` que apunta a un nodo de grado 1 o de grado 3
- WHEN se guarda
- THEN se rechaza
- AND es la regla E1, que la impone el servidor y no la llave foránea
