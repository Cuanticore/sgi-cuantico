# El grafo tecnológico, filtrado por niveles y legible por rama — Especificación y diseño

**Fecha:** 2026-09-16
**Código:** REQ-SIG-06 · pantalla «Mapa tecnológico · grafo»
**Versión:** 1.0
**Módulo:** E — Gestión Tecnológica
**Afecta:** `app/tecnologia/grafo/page.tsx`, `app/tecnologia/grafo/Grafo.client.tsx`, `lib/sig/dependencias.ts`, `lib/sig/niveles.ts`
**Estado:** Implementado y verificado de punta a punta el 2026-09-16 · sin commitear

---

## 1. Qué se pide y por qué

Dos cosas, y la segunda es la que manda:

1. **Poder filtrar el grafo por Nivel 1, Nivel 2 y Nivel 3.**
2. **Que al filtrar a `MINTRACE` el grafo efectivamente se lea.**

La segunda no se resuelve con la primera. El filtro reduce cuántas cajas se dibujan; no arregla
que estén mal acomodadas, ni que los rótulos no correspondan a sus columnas, ni que la pantalla
entre con un activo seleccionado que nadie eligió. Un MINTRACE de treinta cajas mal acomodadas
sigue sin poderse señalar con el dedo en una reunión, que es la razón por la que esta pantalla
existe y no se delegó en un motor de grafos.

---

## 2. Lo que el sistema tiene hoy

Verificado sobre el código antes de diseñar.

### 2.1 El grafo no conoce los niveles

`app/tecnologia/grafo/page.tsx:23` consulta `{ id, codigo, nombre, superiorId }`. **`nivelId` no
se trae.** No existe un filtro apagado ni a medias: la pantalla nunca supo a qué producto
pertenece cada caja. Es el punto de partida, no un defecto.

La jerarquía sí existe y está bien modelada: `NivelActivo` con tres grados (`prisma/schema.prisma`,
modelo `NivelActivo`), el activo apunta **al nivel 3** y los grados 1 y 2 se derivan subiendo por
`padreId` (`lib/sig/niveles.ts:10-12`). `cadenaDeNivel` ya devuelve `[grado 1, grado 2, grado 3]`
y ya tolera huérfanos y ciclos.

### 2.2 Seis defectos de legibilidad, independientes del filtro

| # | Qué pasa | Dónde |
|---|---|---|
| L1 | Los rótulos de columna **no están sobre sus columnas**. La barra es un flex que reparte el ancho visible en partes iguales; el SVG usa un paso fijo de 176 px y vive en **otro contenedor con scroll**. Con más de cuatro columnas «A 3 de distancia» no está encima de la columna 3, y al desplazar en horizontal los rótulos se quedan quietos. | `Grafo.client.tsx:224-239` |
| L2 | El **orden vertical dentro de cada columna es alfabético por código** — el orden en que vienen de la consulta. Ninguna caja se acerca a aquello con lo que se conecta, así que toda arista es una diagonal larga. A 56 px por fila, sesenta activos en una columna son 3.400 px de alto. | `Grafo.client.tsx:105-120` y `page.tsx:24` |
| L3 | La pantalla **entra con un activo ya seleccionado** —`nodos[0].id`, el de código más bajo, elegido por nadie— y el resto arranca al 55 % / 45 % de opacidad. No hay forma de soltarlo: las ramas `sel === null` son código muerto después del primer render. | `Grafo.client.tsx:76` |
| L4 | En modo «Jerarquía» **el resaltado miente**: `vecinos` se calcula sólo con `dependencias`. Resalta vecinos que no están dibujados, apaga los que sí, y el panel dice «Sin dependencias declaradas» junto a un nodo con líneas punteadas a la vista. | `Grafo.client.tsx:146` |
| L5 | **«Corre en» no tiene entrada en la convención.** El pie explica «depende de» y «está dentro de»; el trazo `1 3` de los despliegues no aparece. Se prende el interruptor y surge un tercer tipo de línea sin nombre. | `Grafo.client.tsx:320-341` |
| L6 | El **nombre se corta a 19 caracteres** y no hay forma de ver el completo: no hay zoom, no hay tooltip, el SVG se dibuja a tamaño natural con `maxWidth:'none'`. | `Grafo.client.tsx:241-246, 312` |

L1, L2 y L3 son los que hacen que MINTRACE no se lea. L4, L5 y L6 son deuda que arrastra la
pantalla y que conviene pagar en el mismo paso porque se toca el mismo archivo.

### 2.3 La pregunta que el filtro obliga a contestar

MINTRACE **no se sostiene solo**. Su infraestructura vive en `EMPRESA` y sus externos —Apollo,
RNEC, ANI, RUES, RUCOM, TusDatos, TransUnion, ANM— no cuelgan de ningún producto. Un filtro que
esconda todo lo que está fuera de la rama dibuja un MINTRACE apoyado en nada, que es lo contrario
de lo que esta pantalla promete: «qué se cae si cae esto».

---

## 3. Decisiones

### D1 · El filtro es una cadena de tres selectores, no tres filtros sueltos

Nivel 1 → Nivel 2 → Nivel 3, cada uno poblado con los hijos del anterior. Elegir sólo Nivel 1
filtra la rama entera; elegir hasta Nivel 2 filtra `PRODUCTOS · MINTRACE` completo; elegir Nivel 3
filtra un ambiente.

**Por qué encadenados y no tres listas independientes:** `NivelActivo` es una jerarquía de verdad
(E1), no tres columnas de Excel. Ofrecer «Nivel 2 = MINTRACE» sin su padre permitiría pedir
combinaciones que la jerarquía no admite, y obligaría a desambiguar por nombre dos niveles 2
homónimos bajo raíces distintas.

Los tres selectores se limpian con un botón «Todo», que es el estado inicial.

### D2 · Filtrar define quién es el **sujeto**; lo que lo sostiene se dibuja como **frontera**

> **Supuesto explícito.** Esta decisión se tomó sin poder consultarla. Si se prefiere que el grafo
> filtrado muestre únicamente activos de la rama, se cambia acá y el resto de la spec se sostiene:
> desaparece la frontera y con ella el contador de §D10.

Con un filtro activo, un activo es **sujeto** si `cadenaDeNivel(a.nivelId, niveles)` contiene el
nivel elegido. Un activo que no es sujeto pero tiene **una arista directa** con uno que sí, se
dibuja como **frontera**:

- relleno gris, borde punteado, sin punto de criticidad;
- debajo del nombre, la ruta de su nivel: `EMPRESA · Infraestructura`;
- **no seleccionable** — hacer clic no cambia el panel. La frontera es contexto, no sujeto.

Las aristas **entre dos nodos de frontera no se dibujan**. No son la pregunta que el usuario hizo,
y dibujarlas volvería a traer el grafo completo por la puerta de atrás. Se dibuja una arista si y
sólo si al menos uno de sus dos extremos es sujeto.

La frontera es de **un salto**. Dos saltos ya es el grafo entero disfrazado.

### D3 · Los activos sin nivel no se esconden: son una opción propia del filtro

`nivelId = null` es trabajo pendiente conocido y contado —la pantalla de Niveles ya lo muestra
como «N activo(s) sin nivel»—. El selector de Nivel 1 lleva una opción extra, **«Sin nivel (N)»**,
que filtra exactamente esos.

Y cuando un activo sin nivel aparece como frontera de MINTRACE, su ruta no se escribe en gris: se
escribe **`sin nivel`** en ámbar. Es el dato que falta apareciendo justo donde importa —algo que
MINTRACE necesita y que nadie clasificó—, no una casilla vacía más.

### D4 · Las columnas se recalculan sobre el subgrafo visible

Si se conservaran las columnas globales, MINTRACE filtrado arrancaría en la columna 4 y las tres
primeras quedarían vacías. `columnasDelGrafo` ya recibe la lista de ids: se la llama con los
visibles (sujeto + frontera) y con las aristas efectivamente dibujadas.

La regla «la flecha siempre va hacia la derecha» se conserva: un subgrafo de un grafo sin ciclos
tampoco tiene ciclos, así que la relajación sigue terminando.

### D5 · El orden vertical deja de ser alfabético: **baricentro**

Función nueva y **pura** en `lib/sig/dependencias.ts`:

```ts
export function ordenDentroDeColumnas(
  columnas: ReadonlyMap<number, number>,
  aristas: readonly Arista[],
  desempate: ReadonlyMap<number, string>,   // el código, para romper empates
  pasadas = 3,
): Map<number, number>                       // id → índice dentro de su columna
```

Cada pasada recorre las columnas de izquierda a derecha y ordena cada una por el **promedio de los
índices de sus vecinos en la columna anterior**; la pasada siguiente hace lo mismo de derecha a
izquierda. Tres pasadas alcanzan: es el algoritmo clásico de reducción de cruces, no un motor de
acomodo.

**Tiene que ser determinista.** Los empates —un nodo sin vecinos a la izquierda, dos nodos con el
mismo promedio— se rompen **por código, siempre**. El comentario de cabecera del cliente protege
exactamente esto: «un mapa que se mueve solo no se puede señalar con el dedo en una reunión».
Mismo dato, mismo dibujo, en cada render y entre sesiones.

Va en `lib/sig/dependencias.ts` y no en el componente porque es aritmética sin React: así se prueba
sola, que es lo que la Regla 1 del harness pide y lo que el componente no permite.

### D6 · Los rótulos de columna se dibujan **dentro** del SVG

Se elimina la barra flex de `Grafo.client.tsx:224-237`. El rótulo pasa a ser un `<text>` del mismo
lienzo, en la `x` de su columna, con una banda de fondo. Dos contenedores que deben permanecer
alineados terminan desalineándose; uno solo no puede.

### D7 · Sin selección al entrar, y se puede soltar

`sel` arranca en `null`. Un clic en el fondo del SVG lo devuelve a `null`. Las ramas `sel === null`
—que hoy son código muerto— vuelven a ejecutarse y el grafo entra al 100 % de opacidad.

### D8 · `vecinos` se calcula con las aristas que se están dibujando

En modo «Dependencias», sólo dependencias. En «Jerarquía», sólo contención. En «Ambas», las dos —y
los despliegues si el interruptor está encendido—. El panel lateral etiqueta cada vecino con la
relación por la que llegó: `depende de`, `está dentro de`, `corre en`.

### D9 · La convención nombra los tres trazos

Se agrega «corre en» al pie, con su trazo `1 3`, visible sólo cuando el interruptor está encendido.

### D10 · El encabezado dice qué se ve y qué quedó afuera

Con filtro activo, sobre el lienzo:

> **PRODUCTOS · MINTRACE** — 34 activos de la rama · 12 de frontera · 253 fuera

Sin esa línea, un grafo filtrado es indistinguible de un grafo incompleto, y ésa es la confusión
más cara que puede producir esta pantalla.

### D11 · Con filtro activo, los activos de la rama **sin ninguna relación también se dibujan**

Hoy se excluyen y la razón está escrita: llenar la columna 0 con doscientas cajas sueltas taparía
las pocas cadenas que hay. **Esa razón desaparece cuando la rama tiene treinta activos.** Al
filtrar, los activos de la rama sin dependencias ni contención se dibujan en la columna 0 con
borde punteado y la marca `sin relaciones declaradas`.

No es un efecto secundario: es el hallazgo. «Qué activos de MINTRACE nadie conectó con nada» es
una pregunta que hoy no tiene pantalla, y este es el lugar donde se responde sola.

Sin filtro, el comportamiento actual se conserva intacto.

### D12 · El filtro es del cliente, no del servidor

Los niveles son pocas decenas de filas y los activos ya viajan completos al cliente. El servidor
suma dos cosas a lo que ya manda —`nivelId` por activo y la lista de `NivelActivo`— y el filtrado
ocurre en `useMemo`. Filtrar en el servidor obligaría a una ida y vuelta por cada cambio de
selector, y a `force-dynamic` eso le cuesta una consulta completa.

### D13 · El nombre completo, en un `<title>` del nodo

El recorte a 19 caracteres se conserva —la caja mide 124 px—, pero cada `<g>` de nodo lleva un
`<title>` con `código · nombre completo · ruta del nivel`. Es el tooltip nativo del SVG: cero
librerías, cero estado, y además es lo que leen los lectores de pantalla.

**Fuera de alcance:** zoom y desplazamiento con el ratón. Con el filtro puesto, el lienzo de una
rama cabe en pantalla; el zoom es la solución al problema que el filtro elimina.

---

## 4. Contrato de datos

### 4.1 Lo que el servidor agrega

`app/tecnologia/grafo/page.tsx`:

```ts
// al select de activos
select: { id: true, codigo: true, nombre: true, superiorId: true, nivelId: true }

// consulta nueva
prisma.nivelActivo.findMany({
  select: { id: true, grado: true, nombre: true, padreId: true, clase: true, activo: true },
  orderBy: [{ grado: 'asc' }, { orden: 'asc' }, { id: 'asc' }],
})
```

`NodoGrafo` gana `nivelId: number | null`. `GrafoClient` gana `niveles: Nivel[]`.

Y tres cambios más en lo que la página manda, los tres por la misma razón —**que el cliente
pueda responder solo, sin que el servidor haya decidido antes por él**:

1. **`NodoGrafo` PIERDE `columna`.** Al filtrar, las columnas se recalculan sobre el subgrafo
   (D4), así que un número calculado en el servidor sería un segundo origen del mismo dato —la
   forma exacta de los tres bugs que originaron el harness—. El cliente la calcula siempre con
   `columnasDelGrafo`, y sin filtro da exactamente lo que daba antes.
2. **Van todos los activos vigentes**, no sólo los que participan de una relación. Sin filtro el
   cliente sigue dibujando únicamente los conectados; con filtro necesita los sueltos para D11,
   y no se puede responder «cuáles nadie conectó» con los que la consulta descartó.
3. **La contención viaja completa**, todos los pares cuyo padre siga vigente. Antes se recortaba
   a los hijos que además tuvieran una dependencia, lo que dejaba al cliente sin poder decidir
   quién está realmente suelto.

**`totalActivos` se conserva** y sigue significando lo mismo: todos los activos vigentes. Las
cifras del filtro son otras y se calculan aparte.

### 4.3 Las dos cifras del panel dependen del modo

Contar «Depende de» y «Dependen de él» en modo «Jerarquía» sería la misma mentira que corrige
D8. El panel muestra:

| Modo | Cifras |
|---|---|
| Dependencias | Depende de · Dependen de él · Columna |
| Jerarquía | Está dentro de · Contiene a · Columna |
| Ambas | Vecinos · Columna |

En «Ambas» conviven tres relaciones y ninguna pareja de cifras las resume sin mentir: el total
más la lista de abajo, que etiqueta cada vecino con la relación por la que llegó, dice más.

### 4.2 Funciones puras nuevas, en `lib/sig/`

En `lib/sig/niveles.ts`:

```ts
/// Los ids de activo cuya cadena de niveles pasa por `nivelId`.
/// `nivelId === null` devuelve los activos sin nivel — que es una respuesta, no un error.
export function activosDeRama(
  nivelId: number | null,
  niveles: readonly Nivel[],
  activos: readonly { id: number; nivelId: number | null }[],
): Set<number>
```

En `lib/sig/dependencias.ts`:

```ts
export interface SubgrafoFiltrado {
  sujeto: Set<number>;
  frontera: Set<number>;
  aristas: Arista[];       // sólo las que tocan al menos un sujeto
}

/// D2 · el sujeto es la rama; la frontera es lo que la sostiene, a un salto.
export function subgrafoDeRama(
  sujeto: ReadonlySet<number>,
  aristas: readonly Arista[],
): SubgrafoFiltrado

export function ordenDentroDeColumnas(/* §D5 */): Map<number, number>
```

Ninguna de las dos toca React, Prisma ni el DOM. Es lo que permite probarlas en rojo primero.

---

## 5. Pruebas exigidas — Regla 1 del harness

**Cada una se escribe antes del código y se verifica en rojo.** El origen de este módulo es
precisamente una cicatriz de composición: los defectos no estaban en las piezas sino entre ellas.

### 5.1 `lib/sig/__tests__/niveles-rama.test.ts`

| Caso | Qué afirma |
|---|---|
| Nivel 3 | devuelve sólo los activos que apuntan a ese nivel 3 |
| Nivel 2 `MINTRACE` | devuelve los activos de **todos** sus niveles 3, y ninguno de otro nivel 2 |
| Nivel 1 `PRODUCTOS` | devuelve la rama entera, dos niveles abajo |
| `null` | devuelve exactamente los activos con `nivelId === null` |
| Nivel 3 huérfano | sus activos **no** entran a la rama de ningún nivel 1 — `cadenaDeNivel` devuelve lo que hay, y lo que hay no llega a la raíz |
| Nivel inactivo | se puede filtrar por él; los activos siguen ahí y esconderlos sería perder inventario en silencio |

### 5.2 `lib/sig/__tests__/dependencias-filtro.test.ts`

| Caso | Qué afirma |
|---|---|
| sujeto → afuera | el de afuera entra como **frontera**, y la arista se dibuja |
| afuera → sujeto | igual, en la otra dirección |
| afuera → afuera | **ninguno de los dos entra** y la arista se descarta |
| frontera → frontera | la arista **no** se dibuja, aunque ambos nodos estén en el lienzo por otra razón |
| dos saltos | el vecino del vecino **no** entra |
| sujeto aislado | está en `sujeto`, no genera frontera, y no produce ninguna arista |

### 5.3 `lib/sig/__tests__/dependencias-orden.test.ts`

| Caso | Qué afirma |
|---|---|
| determinismo | dos llamadas con la misma entrada devuelven **exactamente** el mismo orden |
| empate | dos nodos con el mismo baricentro se ordenan por código, no por orden de llegada |
| atracción | un nodo con un único vecino queda en el mismo índice que su vecino cuando la columna lo permite |
| cruces | un caso armado a mano con dos aristas que se cruzan sale con menos cruces después que antes |
| columna suelta | una columna sin aristas hacia la anterior conserva el orden por código |

### 5.4 `lib/sig/__tests__/dependencias-columnas.test.ts` (ampliación)

| Caso | Qué afirma |
|---|---|
| subgrafo | las columnas del subgrafo arrancan en 0 aunque en el grafo completo arrancaran en 4 |
| frontera a la derecha | una frontera de la que depende un sujeto queda estrictamente a la derecha |

### 5.5 Componente — `app/tecnologia/grafo/__tests__/Grafo.client.test.tsx`

| Caso | Qué afirma |
|---|---|
| L3 | al montar, **ningún** nodo está seleccionado y el panel lateral no se dibuja |
| L3 | clic en el fondo después de seleccionar devuelve a «sin selección» |
| L4 | en modo «Jerarquía», los vecinos listados son los de contención, no los de dependencia |
| L5 | con el interruptor encendido, la convención muestra las tres relaciones |
| D1 | elegir Nivel 1 puebla el selector de Nivel 2 **sólo** con sus hijos |
| D1 | cambiar Nivel 1 limpia las selecciones de Nivel 2 y Nivel 3 |
| D2 | un nodo de frontera no es seleccionable: el clic no cambia el panel |
| D10 | el encabezado reporta las tres cifras y suman el total de activos |
| D11 | con filtro, un activo de la rama sin relaciones aparece marcado `sin relaciones declaradas` |
| D11 | sin filtro, ese mismo activo **no** se dibuja |

---

## 6. Recorrido de punta a punta — Regla 3 del harness

**Aplica.** Es una pantalla con estado, con selectores encadenados donde la salida de uno alimenta
al siguiente, y con una decisión del usuario a la que el sistema reacciona. Los tres defectos que
originaron el harness tenían esa forma exacta.

**Automatizado en `e2e/grafo.spec.ts`** y ejecutado el 16/09/2026 en Chromium contra el
inventario real (378 activos vigentes), por el túnel SSM, en modo lectura. `npm run e2e`.

```
Recorrido ejecutado (/tecnologia/grafo, inventario real · 378 activos):
  1. Abrir sin filtro        -> 67 cajas, ningún nodo seleccionado
  2. Nivel 1 = PRODUCTOS     -> Nivel 2 ofrece 8: UNAD, Monitor, ILC, MINTRACE,
                                CONDUCEPRO, TERRITORIOS IA, MONITOR, VERIFY
  3. Nivel 2 = MINTRACE      -> 40 en la rama · 1 de frontera · 337 fuera
  4. Leer el lienzo          -> 41 cajas, rótulos dentro del SVG
  5. Clic en la frontera     -> «TEC-RED-0004 · 54.86.37.61» no abre panel
  6. Clic en un activo       -> «TEC-EQU-0007 · srv-mintrace-prod» · 4 vecinos
  7. Modo Jerarquía          -> el panel ya no habla de dependencias
  8. Ambas + despliegues     -> «corre en» aparece en la convención
  9. Nivel 3 = DOMINIOS      -> 1 caja, primera columna en x=16
 10. Nivel 1 = CUANTICO      -> Nivel 2 y Nivel 3 quedaron limpios
 11. Nivel 1 = «Sin nivel»   -> 3 en la rama · 0 de frontera · 375 fuera
 12. «Todo»                  -> volvió a las mismas 67 cajas del paso 1
 13. Recargar con MINTRACE   -> 41 cajas en las MISMAS coordenadas
```

El paso 13 es el que prueba D5. Un baricentro no determinista pasa los otros doce.

### 6.1 Lo que el recorrido destapó, y no es del código

**El grafo de MINTRACE no se ve mal acomodado: se ve vacío.** De sus 40 activos, **7** tienen
alguna relación declarada. En todo el inventario hay **40 dependencias para 378 activos** y **9**
activos con `superior_id`.

D11 pasó de ser una mejora a ser el hallazgo: 33 cajas de MINTRACE salen marcadas «sin
relaciones declaradas». Y su única frontera es `TEC-RED-0004 · 54.86.37.61` — en el grafo, todo
MINTRACE cuelga de una dirección IP.

Tres defectos de datos de producción, reportados sin tocar:

1. **`MINTRACE` está duplicado:** `PRODUCTOS/MINTRACE` (40 activos) y `Productos/Mintrace` (1).
   Son ramas distintas, así que el filtro muestra 40 y el 41.º queda invisible. Igual con
   `PRODUCTOS/MONITOR` y `PRODUCTOS/Monitor`.
2. **`Productos` (id 131) es un nivel 1 con `clase` en NULL.** `claseDeNivel` devuelve null para
   toda esa rama.
3. **`CUANTICO` (id 4) es un nivel 1 con `clase = EMPRESA`** y `EMPRESA` (id 1) no tiene un solo
   nivel 3. El comentario de `ClaseNivel` en el esquema afirma que «se descartó `CUANTICO` de la
   hoja de diseño»; los datos dicen lo contrario. Hay que mover el comentario o los datos.

---

## 7. Lo que queda fuera

- **Zoom y desplazamiento con el ratón.** El filtro elimina el problema que el zoom resolvería.
- **Persistir el filtro en la URL.** Útil para compartir una vista en un correo; no es lo que se
  pidió y agrega una superficie —estado en dos lugares— que conviene decidir aparte.
- **Filtrar por criticidad, por tipo o por proceso.** Mismo mecanismo, otra decisión.
- **Llevar el filtro de niveles al árbol (`/tecnologia/mapa`) o a Impacto.** El árbol ya dibuja la
  jerarquía y el filtro allí significa otra cosa.
- **Un motor de acomodo de grafos.** La decisión original sigue en pie y D5 la respeta: aritmética
  determinista, no un `d3-force` que reordena en cada render.

---

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Con muchos activos sin nivel, filtrar por MINTRACE deja fuera dependencias reales que sí son de MINTRACE pero nadie clasificó | D3 las trae a la vista como frontera en ámbar; el encabezado reporta cuántas |
| El baricentro se vuelve no determinista y el mapa «se mueve solo» | Prueba 5.3 de determinismo, y el paso 13 del recorrido |
| Dibujar la frontera reintroduce el grafo completo en ramas muy conectadas | La frontera es de un salto y las aristas frontera↔frontera se descartan (D2). El encabezado deja ver el número: si la frontera supera al sujeto, el dato que hay que arreglar es la clasificación por niveles, no la pantalla |
| `subgrafoDeRama` y `columnasDelGrafo` cuentan desde orígenes distintos | Se llaman en el mismo `useMemo`, encadenadas, y 5.4 lo prueba: `columnasDelGrafo` recibe **exactamente** lo que `subgrafoDeRama` devolvió |
