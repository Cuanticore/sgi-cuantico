# Design: Catálogo de Nivel 3 y estandarización del árbol

## D1 · El catálogo va en tabla nueva, no en `plantilla_nivel`

**Decisión.** Se crea `catalogo_nivel_3 (clase, nombre, orden, activo)` y `plantilla_nivel`
pasa a referenciarla. No se reutiliza `plantilla_nivel` como catálogo.

**Por qué.** `plantilla_nivel` responde otra pregunta. Es la **configuración mínima**: «un producto
nuevo arranca con estas ramas» y «bajo cada rama se esperan estos activos». `aplicarPlantilla` crea
un nodo por cada `nombreNivel3` distinto que encuentra. Si se le cargan los 27 nombres del
vocabulario, cada producto nuevo nacería con 27 ramas vacías, y la plantilla dejaría de señalar lo
que falta para pasar a rellenar — que es literalmente lo que el comentario de `aplicarPlantilla`
dice que no hace: «la plantilla señala, no rellena; crear activos vacíos para que la lista se vea
completa sería inventar inventario».

Son dos conceptos con dos cardinalidades:

| | Qué responde | Cuántos por clase |
|---|---|---|
| **Catálogo** *(nuevo)* | ¿qué nombres de Nivel 3 son legítimos en esta clase? | ~27 |
| **Plantilla mínima** *(ya existe)* | ¿con qué arranca un producto nuevo? | 4 |

**Y la relación entre los dos es lo que arregla la fábrica.** La plantilla pasa a ser un
**subconjunto** del catálogo: `plantilla_nivel.nombreNivel3` referencia
`catalogo_nivel_3(clase, nombre)`. Con eso, `aplicarPlantilla` **no puede** crear
`CODIGO FUENTE` sin tilde, porque ese nombre no está en el catálogo y la FK lo rechaza. La
divergencia se cierra en la raíz, no se corrige cada vez que aparece.

**Alternativa descartada.** Una columna `esPlantilla boolean` sobre una `plantilla_nivel` ampliada.
Sale más barata en migración y deja las dos preguntas en la misma tabla con la misma clave única
`(clase_nivel, nombre_nivel_3, activo_esperado)`, que existe para la pregunta de los activos
esperados y no para la del vocabulario: un nombre del catálogo que todavía no espera ningún activo
no tendría fila donde vivir.

## D2 · La identidad pasa a ser el nombre normalizado

**Decisión.** Migración que reemplaza `nivel_activo_identidad` por un índice funcional:

```sql
DROP INDEX "nivel_activo_identidad";
CREATE UNIQUE INDEX "nivel_activo_identidad"
  ON "nivel_activo" ("grado", upper(btrim("nombre")), "padre_id") NULLS NOT DISTINCT;
```

**Por qué.** El índice actual **existe** y aun así dejó entrar `MONITOR` #13 y `Monitor` #127 bajo
el mismo padre, y `PRODUCTOS` #2 junto a `Productos` #131 en la raíz. Indexa el nombre literal. Sin
este cambio, los 105 renombres son un barrido: `Monitor` vuelve a entrar mañana por cualquiera de
los tres escritores.

`NULLS NOT DISTINCT` se conserva y es lo que hace que sirva: en Postgres los NULL son distintos
entre sí dentro de un índice único, y las raíces tienen `padre_id NULL`. Sin la cláusula, dos raíces
con el mismo nombre pasan — que es exactamente el caso `PRODUCTOS`/`Productos`.

**`upper(btrim(...))` y no `normalizarNombreNivel` entera.** La regla de TypeScript además colapsa
los espacios internos, y `regexp_replace` dentro de un índice funcional agrega una función más que
tiene que ser `IMMUTABLE` y que nadie va a recordar al leer el `indexdef`. El índice cubre los dos
ejes que producen duplicados reales —caja y espacios de los bordes—; el colapso de espacios internos
lo sigue garantizando el escritor, que es donde ya vive. **Queda una asimetría conocida**:
`CÓDIGO  FUENTE` con dos espacios entraría. Ningún escritor lo produce, porque los tres pasan por
`normalizarNombreNivel`.

**Las tildes siguen distinguiendo.** `CODIGO` y `CÓDIGO` seguirán siendo dos nodos distintos, y es
deliberado: unirlos obliga a elegir qué ortografía sobrevive, que es una decisión con dueño.
`scripts/auditar-niveles.ts` ya mide ese costo aparte (sección 4 de su salida) para poder decidirlo
algún día. Lo que esta propuesta hace es **quitarle a la plantilla la capacidad de crear la variante
sin tilde**, que es de donde venía el riesgo.

**El orden importa y es el que ya estaba escrito.** Esta migración **falla hoy** contra la base:
`MONITOR` y `Monitor` colapsan al mismo valor indexado. Falla por diseño. La cabecera de
`20260916200000_identidad_de_nivel` lo dice: «si esta migración falla con una violación de unicidad,
es que ese paso no se corrió: la falla es correcta y el orden es primero el script, después la
migración».

> **Trampa.** `verificar:migraciones` aplica las migraciones sobre una **base vacía**, donde no hay
> `MONITOR`/`Monitor` que hagan fallar nada. Va a dar verde con el árbol sucio. No sustituye a
> simular el script contra los datos reales — es justo el hueco que HARNESS.md describe: una base
> vacía no tiene los datos de producción.

## D3 · El nodo se crea al guardar, no al elegir

**Decisión.** `guardarDatosGenerales` acepta la forma discriminada

```ts
nivel?: { tipo: 'id';    id: number | null }
      | { tipo: 'nuevo'; nivel2Id: number; nombre: string }
```

y resuelve-o-crea **dentro de la misma transacción** que guarda el activo.

**Por qué.** La ficha tiene búfer de edición: `nivelId` vive en `Edicion` y sólo se persiste al
guardar. Crear el nodo al elegir significa que abrir el selector, mirar y arrepentirse deja un nodo
huérfano en el árbol — y el árbol se dibuja en el mapa tecnológico y en el grafo. La transacción
única da la propiedad que importa: **o el activo queda ubicado, o no pasó nada.** Un nodo creado
cuyo activo no se guardó es basura que nadie va a limpiar.

**Idempotencia.** Entre que la pantalla se pintó y la persona guardó, otro pudo crear ese mismo
nombre bajo ese mismo Nivel 2. La acción hace `findFirst` por nombre normalizado y, si no está,
`create`; si el `create` choca contra `nivel_activo_identidad` (P2002), **vuelve a resolver** y usa
el que ganó. No se propaga el error: dos personas clasificando el mismo activo el mismo minuto es
uso normal, no una condición de carrera que haya que denunciar.

```
Persona            FichaActivo         guardarDatosGenerales        BD
  │                    │                        │                   │
  │ elige Nivel 2 INC  │                        │                   │
  ├───────────────────>│                        │                   │
  │                    │ catálogo(clase) ∪ hijos(INC)                │
  │                    │   (módulo PURO, sin ir a la BD)             │
  │ elige CÓDIGO FUENTE│                        │                   │
  ├───────────────────>│ Edicion.nivel =        │                   │
  │                    │  {nuevo, INC, «CÓDIGO FUENTE»}              │
  │                    │   ── nada se crea todavía ──                │
  │ Guardar            │                        │                   │
  ├───────────────────>├───────────────────────>│                   │
  │                    │                        │ BEGIN             │
  │                    │                        ├──────────────────>│
  │                    │                        │ ¿está en catálogo?│
  │                    │                        │   no -> RECHAZA   │
  │                    │                        │ findFirst(norm)   │
  │                    │                        ├──────────────────>│
  │                    │                        │ create si falta   │
  │                    │                        │  (P2002 -> re-resolver)
  │                    │                        │ activo.nivelId = id
  │                    │                        │ bitácora x2       │
  │                    │                        │ COMMIT            │
  │<───────────────────┴────────────────────────┤                   │
  │  «Activo clasificado en INC · CÓDIGO FUENTE»│                   │
```

## D4 · Instanciar no es inventar

**Decisión.** Desde la ficha, con `activo:valorar`, se puede crear un nodo de Nivel 3 **cuyo nombre
ya esté en el catálogo de esa clase**. Crear un nombre que no está en el catálogo sigue exigiendo
`tecnologia:administrar` y sigue pasando por `/tecnologia/niveles`.

**Por qué.** Hay una tensión real: la ficha guarda con `activo:valorar`
(`guardarDatosGenerales`), y `crearNivel` exige `tecnologia:administrar`. Bajar el permiso de crear
niveles a `activo:valorar` a secas le daría a cualquiera que valore un activo la capacidad de
inventar vocabulario del árbol, que es lo que `crearNivel` protege con razón.

La distinción que resuelve la tensión: **poner `CÓDIGO FUENTE` en `INC` no inventa nada.** La
organización ya decidió que `CÓDIGO FUENTE` existe; lo que se está diciendo es que INC también tiene
uno. Es una afirmación sobre el inventario —el mismo tipo de afirmación que «este activo es de
criticidad C2»—, no sobre la taxonomía. La taxonomía sigue teniendo un solo dueño.

El catálogo es lo que hace posible trazar esa línea. Sin él no hay forma de distinguir las dos
operaciones, y por eso la Entrega 3 depende de la 2.

## D5 · La lógica del selector va a un módulo puro

**Decisión.** `lib/sig/catalogo-nivel-3.ts`, sin Prisma, con la firma

```ts
export type OpcionNivel3 =
  | { tipo: 'existente'; id: number; nombre: string }
  | { tipo: 'del-catalogo'; nombre: string };

export function opcionesDeNivel3(
  catalogo: readonly { clase: ClaseNivel; nombre: string; orden: number }[],
  niveles: readonly Nivel[],
  nivel2Id: number | null,
): OpcionNivel3[];
```

**Por qué.** Es donde vive la corrección y es donde las pruebas son baratas. El caso que hoy falla
—un nombre que existe en otra rama tiene que ofrecerse como «nuevo aquí»— se prueba con tres objetos
literales y sin renderizar nada. La ficha ya es un archivo de más de 4.800 líneas; meterle la regla
adentro la haría sólo comprobable montando el componente.

La clase sale de la raíz con `claseDeNivel(nivel2Id, niveles)`, que ya existe y ya hereda la clase
subiendo por `padreId` — no se guarda en los grados 2 y 3 justamente para que un hijo no pueda
contradecir a su padre.

**Qué devuelve ante un árbol roto.** Si el Nivel 2 no tiene raíz alcanzable, `claseDeNivel` devuelve
`null` y la función devuelve **sólo los existentes**, sin catálogo. No inventa una clase por
defecto: ofrecer el vocabulario de PRODUCTOS bajo una rama huérfana sería adivinar, y la rama rota
tiene que seguir viéndose rota. Es la misma postura que ya toma `conElegido` en la ficha, que
agrega el nivel guardado aunque no esté entre las opciones para que el dato roto quede a la vista.

## D6 · Qué NO cambia

- **`normalizarNombreNivel`** se queda como está. La regla es correcta; lo que faltaba eran
  consumidores y una restricción que la respaldara.
- **`cadenaDeNivel`, `activosDeRama`, `armarArbol`** no se tocan. Siguen operando sobre un árbol de
  tres grados donde el activo apunta al grado 3. **E1 y E2 quedan intactos**: esta propuesta no
  convierte el Nivel 3 en una etiqueta compartida entre ramas — cada rama sigue teniendo su propio
  nodo, con su propio id.
- **El mapa y el grafo** se benefician de la limpieza sin cambiar una línea: dejan de dibujar
  `MINTRACE` y `Mintrace` como dos productos.
