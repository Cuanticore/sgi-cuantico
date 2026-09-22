# Proposal: Catálogo de Nivel 3 y estandarización del árbol del inventario

## Intent

En la ficha del activo, el selector de **Nivel 3** sólo ofrece los nodos que ya cuelgan del Nivel 2
elegido. Bajo `PROYECTOS / INC` eso son dos opciones —`DOCUMENTACIÓN PRIVADA` y
`DOCUMENTACIÓN CONFIDENCIAL`—, así que un activo de código fuente en INC **no se puede clasificar
sin salir de la ficha** a crear el nodo en `/tecnologia/niveles`. El vocabulario real de la
organización son 27 nombres de Nivel 3; el selector ofrece los que la rama ya tenga.

Detrás de eso hay una causa y una fábrica:

- **La causa.** `nivel_activo_identidad` indexa el nombre **literal**, así que `MONITOR` y `Monitor`
  le parecen distintos. 104 de los 114 nodos de grado 3 están fuera de mayúscula, y esa
  inconsistencia de caja es lo que abre la puerta a que entre un duplicado real.
- **La fábrica.** `plantilla_nivel` —la única lista de nombres de Nivel 3 que hay en el sistema, y
  lo que `aplicarPlantilla` usa para crear las ramas de un producto nuevo— tiene cuatro nombres por
  clase y **los cuatro divergen del árbol real**. Cualquier limpieza que no la toque se deshace con
  el próximo producto.

## Evidencia

Todo lo de esta sección está ✅ **COMPROBADO el 2026-09-22 contra `localhost:5432`** (la base local,
restaurada del dump de producción el 2026-09-21), por lectura: `scripts/estandarizar-niveles.ts`
**sin `--aplicar`**, consultas a `pg_indexes` y `_prisma_migrations`, y consultas de conteo. **No se
escribió en ninguna base.** No son invariantes del sistema: son el estado de un día, y el plan
contra producción hay que volver a simularlo allá.

### El árbol

| Grado | Filas | Fuera de mayúscula |
|---|---|---|
| 1 | 5 | 1 |
| 2 | 26 | 3 |
| 3 | 114 | **104** |

**114 filas de grado 3 para 27 nombres distintos NO es duplicación**, y este documento no lo usa
como tal: once `DOCUMENTACIÓN` bajo once padres distintos son once documentaciones, y eso es un
árbol haciendo su trabajo. El 27 aparece aquí con otro significado — **es el tamaño del
vocabulario**, que es lo que el catálogo tiene que contener.

### Los duplicados reales son 4 sobre 145, y 2 de ellos todavía no existen

```
directos (visibles hoy)                    2
  raíz  · grado 1 · PRODUCTOS  #2   / Productos #131
  #2    · grado 2 · MONITOR    #13  / Monitor   #127

emergentes (aparecen al aplicar los de arriba)   2
  grado 2 · MINTRACE #6 / Mintrace #132
            — hoy cuelgan de #2 y #131, que son raíces distintas
  grado 3 · DOCUMENTACIÓN PRIVADA #141 / #133
            — emerge un grado más abajo, después de fusionar MINTRACE
```

Una consulta de una sola pasada ve **2**, y no por estar mal escrita: los otros dos duplicados
todavía no existen. Es la tesis de la cabecera de `lib/sig/fusion-niveles.ts` — fusionar un padre
cambia quiénes son hermanos en el grado siguiente— y es la razón de que el plan se calcule grado por
grado con propagación. Cualquiera que aplique sólo la fusión de la raíz se va a encontrar con dos
duplicados nuevos sin entender de dónde salieron.

Plan completo: **105 renombres, 4 fusiones, 0 conflictos.**

### La restricción existe y no alcanza

```
pg_indexes:
  nivel_activo_identidad  UNIQUE btree (grado, nombre, padre_id) NULLS NOT DISTINCT
```

El índice **está puesto**, y aun así `MONITOR` #13 y `Monitor` #127 están los dos bajo el padre #2.
Eso no es una sospecha sobre el mecanismo: es la demostración. No falta la restricción — la
restricción no ve la caja.

`_prisma_migrations` tiene **dos filas** para `20260916200000_identidad_de_nivel`: una
`rolled_back` (el intento que tumbó el despliegue del 18/09/2026, la cicatriz que metió
`verificar:migraciones` al harness) y una `finished` con `applied_steps_count = 1`. **Se volvió a
correr y entró**, con el `UPDATE` ya corregido a `nombre_nivel_3`. Quien consulte sólo por
`rolled_back_at IS NOT NULL` va a ver la primera y concluir que nunca se aplicó.

### La fábrica de divergencia, armada y sin disparar

| `plantilla_nivel` crea | El árbol usa | Ramas |
|---|---|---|
| `CODIGO FUENTE` | `CÓDIGO FUENTE` | 9 |
| `DOCUMENTACION` | `DOCUMENTACIÓN` | 11 |
| `DEPENDENCIAS O RELACIONADOS` | `DEPENDENCIAS` | 10 |
| `AMBIENTES` | `AMBIENTE DE DESARROLLO` / `DE PRUEBAS` / `DE PRODUCCIÓN` | 9 |

Cuatro de cuatro. La causa es precisa y explica dos mediciones que parecen contradecirse: ese mismo
`20260916200000_identidad_de_nivel` corrió
`UPDATE plantilla_nivel SET nombre_nivel_3 = upper(btrim(nombre_nivel_3))`. La plantilla se había
sembrado como `'Codigo Fuente'`, **sin tildes**, y `upper()` pone mayúscula pero no inventa tildes.
Por eso está normalizada 16/16 en el eje de la caja y sigue sin tildes en el otro. Un eje se
arregló; el otro no se tocó nunca.

`normalizarNombreNivel` **conserva las tildes a propósito** (está documentado: unirlas obliga a
elegir qué ortografía sobrevive), así que `CODIGO FUENTE` y `CÓDIGO FUENTE` van a ser dos nodos
distintos siempre.

**Todavía no ha producido nada.** En los 114 nodos de grado 3 no existe ningún `CODIGO FUENTE` ni
`DOCUMENTACION` sin tilde: `aplicarPlantilla` no se ha usado desde que corrió aquel `upper()`. Es
una trampa armada y sin disparar, lo que la hace más barata de desactivar ahora que después del
primer producto nuevo.

## Scope

### In Scope

- **Estandarizar el árbol**: correr `scripts/estandarizar-niveles.ts` contra producción, previa
  simulación allá (105 renombres + 4 fusiones sobre la foto de 5432)
- **Cerrar la puerta**: migración que reemplaza `nivel_activo_identidad` por un índice **funcional**
  sobre `upper(nombre)`, para que la limpieza sea permanente y no un barrido
- **`catalogo_nivel_3`**: tabla nueva con el vocabulario de Nivel 3 por clase; `plantilla_nivel`
  pasa a referenciarla, de modo que la plantilla no pueda nombrar lo que el catálogo no bendijo
- **El selector**: `JerarquiaActivo` ofrece el catálogo de la clase de la raíz, marcando cuáles ya
  cuelgan del Nivel 2 elegido; elegir uno que no existe lo crea **al guardar**, en la misma
  transacción que guarda el activo
- **Permiso**: desde la ficha se **instancia** un nombre del catálogo con `activo:valorar`;
  **inventar** un nombre nuevo sigue exigiendo `tecnologia:administrar`

### Out of Scope

- **`CUANTICO` #4 como cuarta raíz**, contra D8, que declara el grado 1 cerrado en
  EMPRESA / PRODUCTOS / PROYECTOS. Es una decisión de negocio y tiene 9 hijos.
- **`ILC` #7/#129, `UNAD` #21/#122, `SIG` #12/#138**: mismo nombre bajo padres distintos. El
  algoritmo no los toca porque no son hermanos, y con razón: decidir si el mismo producto puede
  colgar de PROYECTOS y de PRODUCTOS a la vez es del negocio, no del plan.
- **Qué nombres van en qué clase.** Esta propuesta crea el mecanismo del catálogo y siembra los 27
  nombres que hoy existen; el reparto definitivo por clase y las altas o bajas de vocabulario son
  criterio del SIG.
- Reescribir el mapa tecnológico o el grafo. Se benefician de la limpieza sin cambiar.
- Los 3 activos vigentes sin nivel. Quedan visibles como hasta ahora.

## Capabilities

### New Capabilities

- `asset-hierarchy-catalog`: vocabulario de Nivel 3 por clase, `plantilla_nivel` subordinada, y el
  selector que instancia un nombre del catálogo bajo una rama
- `asset-hierarchy-standardization`: la identidad de un nivel deja de ser el nombre literal y pasa a
  ser el nombre normalizado; los nombres existentes se enderezan antes

Las dos son nuevas. La jerarquía del inventario está construida y documentada en el código
(`lib/sig/niveles.ts`, E1/E2), pero **no tenía capability en `openspec/specs/`**: las ocho que hay
son de riesgo, criticidad e inventario. Esto le da la suya.

### Modified Capabilities

Ninguna.

## Approach

Tres entregas, en este orden, porque cada una habilita a la siguiente y **cada una es reversible por
separado**:

1. **Enderezar** — script (datos) y después migración (restricción). El orden no es negociable: el
   índice funcional sobre `upper(nombre)` **falla hoy** contra la base, porque `MONITOR` y `Monitor`
   colapsan. Es el orden que la cabecera de `20260916200000_identidad_de_nivel` ya dejó escrito:
   primero el script, después la restricción.
2. **Catalogar** — tabla nueva sembrada con el vocabulario real, y `plantilla_nivel` referenciándola.
   Desactiva la fábrica antes de que dispare.
3. **Ofrecer** — el selector, con la lógica en un módulo puro y la creación diferida al guardado.

## Affected Areas

| Area | Impact | Change |
|---|---|---|
| `prisma/migrations/` | Added | 3 migraciones: índice funcional, `catalogo_nivel_3`, FK de `plantilla_nivel` |
| `prisma/schema.prisma` | Modified | modelo `CatalogoNivel3`; nota de identidad actualizada |
| `lib/sig/catalogo-nivel-3.ts` | Added | módulo PURO: qué ofrece el selector dado catálogo + hijos + Nivel 2 |
| `lib/sig/nombre-nivel.ts` | Unchanged | la regla ya es correcta; se le suma un consumidor |
| `app/sig/acciones/niveles.ts` | Modified | `crearNivel` valida contra el catálogo; `aplicarPlantilla` deja de poder inventar |
| `app/sgsi/acciones/activos.ts` | Modified | `guardarDatosGenerales` acepta «nivel nuevo bajo este Nivel 2» y resuelve-o-crea en la transacción |
| `app/components/sgsi/activos/FichaActivo.tsx` | Modified | `JerarquiaActivo` (~2287-2379): opciones del catálogo, marcadas |
| `scripts/estandarizar-niveles.ts` | Unchanged | se corre; no se modifica |
| `e2e/grafo.spec.ts` | At risk | ver Risks |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Las 4 fusiones mudan hijos y activos entre nodos | Alta (es el objetivo) | El script corre en **una transacción**; lo absorbido queda `activo = false` con su historia, no se borra. Simulación obligatoria antes, `auditar-niveles.ts` después. |
| El plan contra producción no es el de 5432 | Media | Volver a simular allá. Nada se aplica sobre un plan leído en otra base. |
| `e2e/grafo.spec.ts` se mueve cuando `MINTRACE`/`Mintrace` dejen de ser dos | Media | Es el único recorrido de punta a punta que existía. Correrlo antes y después; si cambia, cambió porque el árbol se arregló. |
| La migración del índice funcional falla | **Alta si se corre fuera de orden** | Falla por diseño mientras queden duplicados. `verificar:migraciones` la ejerce sobre base vacía, que es donde no hay datos que la hagan fallar — así que **no sustituye** a simular contra los datos reales. |
| Crear niveles desde la ficha amplía lo que puede hacer `activo:valorar` | Media | Sólo puede **instanciar** nombres que el catálogo ya contiene. Inventar vocabulario sigue exigiendo `tecnologia:administrar`. |
| Quedan nodos sueltos si alguien abre el selector y cancela | Baja | La creación se difiere al guardado. Nada se crea al elegir. |

## Rollback

- **Entrega 1, fusiones**: no hay `undo` automático. Los nodos absorbidos quedan `activo = false`
  con sus ids, así que deshacer es devolver `padreId`/`nivelId` a los ids anotados por el script y
  reactivarlos. **Hay que guardar la salida del script**: es el único registro de qué se movió a
  dónde. Respaldo de la base antes de aplicar, como manda el workflow de despliegue.
- **Entrega 1, índice**: reversible con un `DROP INDEX` + recrear el anterior. Sin pérdida de datos.
- **Entrega 2**: `catalogo_nivel_3` es aditiva. Revertir es soltar la FK y la tabla.
- **Entrega 3**: es código de aplicación. Revertir el commit devuelve el selector a filtrar por
  hijos, y los niveles que se hayan creado mientras tanto quedan — son nodos legítimos del árbol.

## Verificación (HARNESS.md)

- **Regla 1**: cada cambio de comportamiento con su prueba **vista en rojo primero**. Las tres
  entregas cambian comportamiento observable; ninguna cae en las excepciones.
- **Regla 2**: `npm run verificar:build` y `npm run verificar:migraciones` en limpio. Las tres
  migraciones hacen de esta última un requisito y no una formalidad.
- **Regla 3**: aplica — hay pantalla, hay estado y hay una decisión de la persona. El recorrido va
  escrito paso a paso en el PR; ver `tasks.md` §4.
