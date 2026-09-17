# Estandarización de los niveles del inventario

**Fecha:** 2026-09-16
**Estado:** implementado y probado contra la suite; **sin ejecutar contra la base**, porque el
túnel a producción no está disponible. La decisión de §7 sigue abierta y no bloquea el código.

| Pieza | Archivo | Estado |
|---|---|---|
| La regla de identidad | `lib/sig/nombre-nivel.ts` | 8 tests |
| El plan de fusión | `lib/sig/fusion-niveles.ts` | 16 tests |
| Apagar una raíz | `lib/sig/apagar-raiz.ts` | 10 tests |
| Los tres escritores | `consolidado.ts`, `importar.ts`, `acciones/niveles.ts` | 4 tests nuevos |
| La auditoría | `scripts/auditar-niveles.ts` | sin correr: falta base |
| Aplicar el plan | `scripts/estandarizar-niveles.ts` | sin correr: falta base |
| La restricción | `prisma/migrations/20260916200000_identidad_de_nivel/` | sin aplicar |

---

## 1 · Qué se ve, y qué es en realidad

En el Mapa tecnológico conviven hoy cinco raíces donde debería haber tres:

```
CUANTICO      ← la carga del Consolidado
Productos     ← el importador de plantilla, en otra caja
EMPRESA       ← el seed de la migración, que nadie apagó
PRODUCTOS     ← el seed
PROYECTOS     ← el seed
```

Los tres síntomas que se reportaron —`EMPRESA` que no debería estar, un nivel 1 en caja
distinta, niveles 3 en minúscula— **no son tres defectos: son uno.**

`nivel_activo` no tiene restricción de unicidad. Los tres escritores buscan el nivel con
`findFirst({ grado, nombre, padreId })`, igualdad exacta y sensible a la caja:

| Escritor | Dónde |
|---|---|
| Carga del Consolidado V19 | `lib/sgsi/consolidado-carga.ts:408-411` |
| Importador de plantilla FOR-SIG-12 | `app/sgsi/acciones/importar.ts:282-285` |
| Alta manual desde la interfaz | `app/sig/acciones/niveles.ts:52-54` |

Sólo el tercero compara con `.toLowerCase()`, y sólo para rechazar duplicados en el alta
manual. Las dos cargas masivas no pasan por ahí.

**La identidad de un nivel es hoy su nombre literal.** `PRODUCTOS` y `Productos` son dos
ramas distintas del árbol, y lo seguirán siendo en la próxima carga. `EMPRESA` sigue viva
porque el seed la creó (`migration.sql:175-178`) y `CUANTICO` no la reemplazó: se le sumó.
Las dos tienen `clase: EMPRESA`.

## 2 · Por qué esto no es un UPDATE

La tentación es `UPDATE nivel_activo SET nombre = upper(nombre)`. No sirve, y conviene
entender exactamente por qué antes de escribir una línea.

Poner `codigo fuente` en mayúscula **puede chocar contra un `CODIGO FUENTE` que ya existe al
lado.** Cuando eso pasa no hay un renombre: hay dos nodos que a partir de ahora son el mismo,
y alguien tiene que mudar los hijos y los activos de uno al otro antes de apagarlo. Eso es
una **fusión**, y es donde está el trabajo real.

Peor: **fusionar un padre cambia quiénes son hermanos en el grado siguiente.** Si `Productos`
y `PRODUCTOS` se funden, los hijos de grado 2 de ambos pasan a ser hermanos, y ahí pueden
aparecer colisiones que no existían antes. El plan tiene que calcularse **de grado 1 hacia
grado 3**, propagando el resultado de cada nivel al siguiente.

Es exactamente la forma de las cicatrices que documenta `HARNESS.md`: el defecto no vive en
una pieza, vive en la composición. Por eso la lógica de fusión va en un módulo puro y probado,
no dentro de una transacción de Prisma.

## 3 · Decisiones tomadas

| # | Decisión | Por qué |
|---|---|---|
| 1 | **Se normaliza el dato, no la vista** | Un `text-transform` haría que `Productos` y `PRODUCTOS` se vieran idénticos y siguieran siendo dos ramas: sería peor que no hacer nada, porque tapa el síntoma que permite diagnosticar |
| 2 | **`EMPRESA` se apaga (`activo = false`), no se borra** | `armarArbol` ya filtra por `activo` (`lib/sig/niveles.ts:335`): desaparece del mapa sin perder historia, y es reversible. Borrar es irreversible y hay claves foráneas |
| 3 | **Mayúscula en los tres grados** | Es lo que significa «estandarizar». Los grados 2 ya están casi todos en mayúscula, así que el cambio real es chico |
| 4 | **Se agrega la unicidad que hoy falta** | Es lo único que impide que esto vuelva a pasar en la próxima carga |

## 4 · Las piezas

### 4.1 · `lib/sig/nombre-nivel.ts` — la regla, en un solo lugar

```ts
export function normalizarNombreNivel(nombre: string): string
```

Recorta, colapsa espacios internos y pasa a mayúscula. **Es el único sitio donde vive la
regla**, y los tres escritores la importan. Si mañana cambia, cambia una vez.

Puro, sin dependencias. Su test cubre: espacios al borde, espacios dobles internos, ya en
mayúscula (idempotencia), cadena vacía, y el comportamiento frente a tildes que fije §7.

### 4.2 · `lib/sig/fusion-niveles.ts` — el plan, calculable sin base

```ts
export function planDeEstandarizacion(niveles: NivelCrudo[]): Plan
```

Recibe la lista plana de niveles y devuelve **qué hacer, sin hacerlo**:

```ts
type Plan = {
  renombres: { id: number; de: string; a: string }[];
  fusiones: { grado: number; sobrevive: number; absorbe: number[]; nombre: string }[];
  conflictos: Conflicto[];
};
```

Recorre por grado ascendente y propaga: al fusionar en el grado *n*, los hijos de los
absorbidos pasan a colgar del superviviente **antes** de evaluar el grado *n+1*. Ése es el
punto que un test unitario por pieza no vería.

**Quién sobrevive**, en este orden: el que tiene `clase` no nula; si empatan, el que tiene más
activos en su rama; si empatan, el de menor `id`. La regla es determinista a propósito: un
plan que dependa del orden de lectura no se puede revisar antes de aplicarlo.

**Conflictos que el plan NO resuelve solo**, y que detiene para que decida una persona:

- Los dos nodos a fusionar encabezan un `Producto` (`producto.nivel_id` es `@unique`: uno de
  los dos `Producto` quedaría sin nivel, y eso es una decisión de negocio, no de datos).
- Los dos tienen `clase` distinta y no nula.

### 4.3 · `scripts/estandarizar-niveles.ts` — aplicar el plan

Lee, calcula el plan con la pieza pura, lo **imprime**, y sólo escribe si se le pasa
`--aplicar`. Sin esa bandera es una simulación. Todo en una transacción.

Orden de escritura dentro de cada fusión, que importa:

1. `nivel_activo.padre_id` de los hijos del absorbido → al superviviente
2. `activo.nivel_id` → al superviviente
3. `producto.nivel_id` → al superviviente (sólo si el superviviente no tenía uno)
4. el absorbido queda `activo = false`

Se apaga en vez de borrarse por la misma razón que `EMPRESA`: si la fusión estuvo mal, el
nodo sigue ahí con su historia.

### 4.4 · La migración — que no vuelva a pasar

Dos cosas, en este orden:

1. Normalizar los nombres ya existentes (el plan de §4.2, ya aplicado y verificado).
2. Crear la unicidad.

**Aquí hay una trampa que hay que nombrar.** Un `@@unique([grado, nombre, padreId])` de
Prisma **no atrapa el caso que originó todo esto**: en Postgres los `NULL` son distintos entre
sí dentro de un índice único, y las raíces tienen `padre_id NULL`. Dos raíces con el mismo
nombre pasarían la restricción sin problema.

El servidor corre PostgreSQL 17, así que la solución directa existe:

```sql
CREATE UNIQUE INDEX nivel_activo_identidad
  ON nivel_activo (grado, nombre, padre_id) NULLS NOT DISTINCT;
```

`NULLS NOT DISTINCT` es de PostgreSQL 15 en adelante. Va en SQL crudo dentro de la migración;
si Prisma no lo refleja en el esquema, se documenta con un comentario `///` en el modelo para
que nadie lo «arregle» después.

La alternativa, si esa cláusula diera problemas con el motor de Prisma, es un índice funcional
sobre `(grado, nombre, COALESCE(padre_id, -1))`. Mismo efecto, menos legible.

### 4.5 · Los tres escritores

Los tres pasan a normalizar antes de buscar y antes de crear. Con la unicidad de §4.4 en pie,
`consolidado-carga.ts` puede además reemplazar su `findFirst` + `create` por un `upsert`, que
es justo lo que el comentario de `consolidado-carga.ts:406-407` dice que no se podía hacer.

Y `CLASE_DE_RAIZ` (`lib/sgsi/consolidado.ts:232-236`) pasa a consultarse con el nombre ya
normalizado, que es lo que hoy hace que una raíz escrita `Productos` quede sin `clase`.

## 5 · `EMPRESA`, en concreto

No se puede apagar a ciegas: si tiene activos colgando de su rama, apagarla los saca del árbol
y engrosa el aviso ámbar de «Fuera del árbol» en vez de arreglar nada.

El orden es: **primero mudar, después apagar.** Si la auditoría muestra que su rama está
vacía, se apaga y ya. Si no, sus hijos de grado 2 se mudan a `CUANTICO` —que es la raíz que
quedó con `clase: EMPRESA`— y recién entonces se apaga.

La guarda `impedimentosParaDesactivar` (`lib/sig/niveles.ts:103-120`) ya existe y ya se aplica
en `app/sig/acciones/niveles.ts:94-97`. El script la respeta en vez de esquivarla.

## 6 · Lo que hay que mirar de reojo

- **`e2e/grafo.spec.ts` depende de los nombres literales** `PRODUCTOS` (paso 2) y `MINTRACE`
  (paso 3). Al pasar todo a mayúscula siguen valiendo. El paso 10 elige «otra raíz distinta de
  PRODUCTOS»: al desaparecer `EMPRESA` y `Productos` quedan menos candidatas, y si queda sólo
  una el paso sigue siendo válido. **Hay que correr el recorrido y mirarlo, no suponerlo.**
- **`plantilla_nivel` está sembrada en caja de título** (`'Codigo Fuente'`, `'Ambientes'`).
  `faltantesDePlantilla` compara con `norm()` sin caja (`lib/sig/niveles.ts:148`), así que
  seguirá funcionando. Pero la pantalla de niveles mostraría `Codigo Fuente` al lado de
  `CODIGO FUENTE`. **Propuesta:** normalizar también esa tabla, en la misma migración.
- **`ETIQUETA_CLASE`** (`lib/sig/niveles.ts:221-225`) devuelve `'Productos'` en caja de
  título. Eso es la etiqueta de la *clase*, no el nombre de un nodo: **no se toca.**

## 7 · La decisión que falta, y por qué está en blanco

`CÓDIGO FUENTE` y `CODIGO FUENTE` seguirían siendo dos nodos aunque los dos estén en
mayúscula. Ignorar las tildes al comparar los fundiría.

**No se decide por gusto: se decide con el número.** `scripts/auditar-niveles.ts` —ya escrito—
calcula las colisiones bajo las dos reglas y reporta la diferencia. Si ignorar tildes no suma
ninguna fusión, la regla se agrega gratis. Si suma varias, cada una es una decisión sobre qué
ortografía sobrevive, y eso ya no es gratis.

**El código no espera esa decisión.** `normalizarNombreNivel` conserva las tildes hoy, que es
el comportamiento conservador: no funde nada que no se haya decidido fundir. Si la medición
dice que unirlas sale gratis, es una línea en un solo archivo y su test.

Lo que sí espera la decisión es **correr el script contra la base**, porque una fusión de más
no se deshace sola.

## 7 bis · Lo que el propio trabajo descubrió

Dos cosas que el diseño no había previsto y que los tests sacaron a la luz:

**Un grupo en conflicto no se puede ni renombrar.** La primera implementación enderezaba los
nombres de los nodos en conflicto aunque no los fundiera. Eso crea dos filas con la misma
identidad —justo lo que el índice único va a prohibir—, así que la migración habría fallado
después de que el script dijera «listo». Un grupo en conflicto queda **intacto**.

**Los niveles apagados también colisionan.** El índice único no distingue por `activo`: un
nodo apagado con el mismo nombre normalizado que un hermano vivo impide crear el índice. El
plan los incluye, y prefiere al vivo como superviviente.

## 8 · Cómo se verifica

Contra las tres reglas de `HARNESS.md`:

**Regla 1** — Los dos módulos puros (`nombre-nivel`, `fusion-niveles`) se escriben con el test
en rojo primero. El caso que más importa, y el que hay que ver fallar: **fusionar dos raíces
hace colisionar a sus hijos de grado 2.** Si ese test no se ve en rojo, no está probando lo
que dice.

**Regla 2** — `npm run verificar:build`.

> **Ojo con el estado actual del árbol de trabajo.** Al momento de escribir esto, `tsc` ya está
> en rojo por el trabajo en vuelo de `acta-riesgo-residual`: falta `candidatos` en
> `RenglonFirmaVista` (`PantallaRiesgoResidual.test.tsx:62,115,116`) y no existe
> `PopupFirmaResidual` (`PopupFirmaResidual.test.tsx:10`). Nada de eso toca niveles, pero
> bloquea el PR. Este trabajo debería ir en su propia rama desde `main`.

**Regla 3** — Aplica: el Mapa tecnológico es una pantalla que una persona opera. Recorrido a
ejecutar y a escribir en el PR:

```
Recorrido ejecutado (Mapa tecnológico, base real):
  1. Abrir /tecnologia/mapa        -> tres raíces, no cinco; ninguna en minúscula
  2. Desplegar cada raíz           -> los grados 2 y 3 en mayúscula, sin duplicados
  3. Comparar el aviso «Fuera del árbol» antes y después -> no creció
  4. /tecnologia/niveles           -> ningún nivel suelto nuevo
  5. npm run e2e                   -> los trece pasos del grafo, en verde
  6. Re-correr auditar-niveles.ts  -> 0 colisiones, 0 nombres por cambiar
```

El paso 6 es el que convierte la auditoría en verificación: el mismo script que midió el
problema confirma que dejó de existir.

## 8 bis · El orden de salida, que no es negociable

**Esta migración rompe el despliegue si se mergea antes de limpiar los datos.**

`Build and Deploy` corre las migraciones contra producción. Si `nivel_activo` todavía tiene dos
raíces que colapsan al mismo nombre normalizado, `CREATE UNIQUE INDEX` falla, la migración
falla y —por cómo está armado el harness— producción se queda con la imagen anterior. Es el
modo de falla del 16/09/2026 otra vez, con otro disfraz.

El orden correcto, y el único:

1. `npx tsx scripts/auditar-niveles.ts` — mirar los números, decidir §7.
2. `npx tsx scripts/estandarizar-niveles.ts` — leer el plan. **No escribe.**
3. Resolver a mano los conflictos que el plan se niegue a tocar, si los hay.
4. `npx tsx scripts/estandarizar-niveles.ts --aplicar [--apagar-empresa]`
5. `npx tsx scripts/auditar-niveles.ts` otra vez — 0 colisiones, 0 nombres por cambiar.
6. Recién entonces, mergear.

Los pasos 1 a 5 corren contra producción por el túnel, con la aplicación arriba. El paso 4 es
el único que escribe, y no borra nada: los nodos absorbidos quedan `activo = false`.

Si alguien merge antes del paso 5, el despliegue falla de forma ruidosa —que es lo correcto—,
pero producción se queda sin actualizar hasta que se corra el script.

## 9 · Fuera de alcance

- Reorganizar qué activo cuelga de qué nivel. Esto estandariza **nombres**, no la taxonomía.
- Los activos sin nivel que ya reporta el aviso ámbar. Son un problema real y distinto.
- La pantalla de administración de niveles. No cambia.
