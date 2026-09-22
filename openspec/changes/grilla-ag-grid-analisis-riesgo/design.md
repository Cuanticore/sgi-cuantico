# Design: AG Grid en «Análisis de riesgos»

Siete decisiones. Las tres primeras son de producto —qué hace la grilla y qué sigue sin hacer—; las
cuatro últimas son de construcción, y la D5 es la que decide si este cambio puede cumplir el
harness o no.

---

## D1 · Community, no Enterprise

**Decisión:** `ag-grid-community` + `ag-grid-react`, licencia MIT, sin clave y sin costo.

**Por qué.** Lo que Enterprise agrega sobre esta pantalla es agrupar filas, filtro de casillas, panel
lateral, barra de estado, maestro-detalle y export `.xlsx`. Sobre **30 filas** las tres primeras son
comodidad, no capacidad; el export ya está resuelto con `exceljs` y por `/sgsi/informe-valoracion`,
que además reporta sobre el inventario completo y no sobre el recorte visible —que es lo correcto—.
Maestro-detalle sería genuinamente útil (las amenazas de un activo dentro de su propia fila), y es
justamente lo que ya resuelve el overlay de la tarea 3.2 sin pagar nada.

**Cuándo se revisa.** El día que el piloto se extienda al inventario completo (378 vigentes): ahí agrupar por
proceso sí cambia qué se puede leer, y el cálculo cambia de signo.

**Consecuencia para quien implementa:** `AllCommunityModule` vía `AgGridProvider` (la forma
recomendada desde la v35.1; `ModuleRegistry.registerModules` sigue funcionando y es equivalente).

```tsx
import { AllCommunityModule } from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
```

---

## D2 · La grilla SÍ filtra, y las tarjetas cuentan lo visible

> **REVERTIDA EL MISMO DÍA, 21/09/2026, por pedido de quien usa la pantalla.** Se deja abajo el
> razonamiento original completo porque el riesgo que describía es real y sigue ahí; lo que
> cambió es dónde se ataja. Borrarlo dejaría a quien venga sin saber por qué el filtro estuvo
> apagado unas horas, y ese es justo el conocimiento que hace falta antes de tocarlo otra vez.

**Decisión vigente:** `defaultColDef.filter = true` y `floatingFilter = true`, con filtro de texto
o de número según la columna. Los seis desplegables propios de la pantalla se retiraron.

**Lo que hace seguro encender el filtro** no es nada de la grilla: es que las tarjetas dejaron de
contarse desde `FiltrosAnalisis` y pasaron a contarse desde las filas visibles, con
`tarjetasDeFilas(filas, total)` en `lib/sgsi/analisis-riesgos.ts`. Reciben el mismo arreglo que la
grilla tiene pintado, así que **no pueden desacordar por construcción**. La garantía se movió de
sitio; no se perdió.

Y hay una prueba en la costura, no sólo en las piezas: `PantallaAnalisisRiesgos.test.tsx` simula la
grilla con un doble que publica cuántas filas recibió, y compara ese número contra el de la tarjeta
—dos observaciones del DOM, sin literales de por medio—. Un módulo perfecto alimentado con el
arreglo equivocado da un número perfecto y falso, y las seis pruebas puras de `tarjetasDeFilas`
seguirían verdes.

**`FiltrosAnalisis` no desapareció:** se sigue hidratando de la URL en el primer render, porque
`FranjaSinPlan` enlaza acá ya filtrado por «sin plan» y ese contrato no era de esta pantalla
romperlo. Lo que se fue es la fila de campos, no la capacidad de llegar con un recorte puesto.

---

### El razonamiento original, que estuvo vigente unas horas

**Decisión:** `defaultColDef.filter = false`, `floatingFilter = false`, ninguna columna con filtro
propio. `filasAnalisis` sigue siendo el único sitio que decide qué filas hay.

**Por qué.** La primera línea del comentario de cabecera de `PantallaAnalisisRiesgos.tsx` está en
mayúsculas y dice: *«LAS TARJETAS Y LA LISTA NUNCA SE CONTRADICEN»*. Las cinco tarjetas y la lista
salen de la misma llamada, con los mismos filtros, y la pantalla no vuelve a filtrar por su cuenta.

Un filtro de AG Grid rompe eso en el primer clic: la tarjeta `EN ANÁLISIS` diría 30 y la grilla
mostraría 12, y la pantalla pasaría a tener **dos verdades sobre cuántos activos hay**. Es la misma
clase de defecto que las cicatrices de `HARNESS.md`: nada falla, ninguna pieza está mal, y la
composición miente.

**La salida que NO se toma, y por qué.** Se podría recalcular las tarjetas desde las filas que la
grilla deja visibles (`onFilterChanged` → nodos mostrados). Mantendría el invariante, pero movería la
fuente de verdad desde `tarjetasAnalisis` —puro, probado, compartido con el servidor— hacia el estado
interno de una librería. El invariante sobreviviría en la pantalla y moriría en el modelo.

**Lo que sí gana el lector**, sin filtrar: orden multi-columna, mover, redimensionar, ocultar, fijar,
encabezado pegajoso, encabezados agrupados y CSV.

---

## D3 · El orden: el `<select>` fija el de partida, las columnas mandan después

**Decisión:** se conserva el `<select>` «Orden» con sus dos opciones (`Peor residual`, `Criticidad
(RTO)`), que define el **orden inicial** y sigue siendo el contrato probado de §14.12. Además, cada
columna ordena por clic, y con `shift` se ordena por varias.

**El rótulo dice la verdad.** Hoy el texto es `«30 activos · orden por peor residual»`. Cuando el
lector ordene por una columna, el rótulo MUST pasar a `«30 activos · orden personalizado»`: un
rótulo que sigue afirmando «por peor residual» sobre una grilla ordenada por proceso es exactamente
el tipo de mentira barata que esta pantalla evita en todas partes.

**Por qué no se elimina el `<select>`.** «Peor residual» y «criticidad (RTO)» no son columnas: la
primera ordena por un objeto `NivelRiesgo`, la segunda por el RTO de una criticidad que la fila no
lleva, con los nulos al final y desempate estable por código. Son dos criterios de negocio con
nombre propio, y merecen un control con nombre propio.

---

## D4 · El contrato de la fila pasa de atributo a clase

**Hecho comprobado:** AG Grid no expone ninguna API para poner atributos `data-*` en el elemento de
fila. Sólo clases (`getRowClass`, `rowClassRules`) y estilos (`getRowStyle`).

**Decisión:** `getRowClass` devuelve dos clases por fila:

| Hoy | Mañana |
|---|---|
| `data-banda-residual="Crítico"` | `fila-banda--Critico` (y `fila-banda--sin-calcular`) |
| `data-estado-plan="pendiente"` | `fila-plan--pendiente` |
| `className` con `bg-danger-bg` | `fila-alarmante` |

El comentario que defiende el contrato actual dice que la banda viaja como atributo *«y no sólo como
color: el color lo lee quien ve, esto lo lee quien filtra la tabla con el inspector, y las pruebas»*.
Una clase sirve para las tres cosas igual de bien. Lo que **no cambia** es lo de fondo: la columna
«Peor residual» sigue diciendo la banda **en palabras**, y `null` —«sin calcular»— sigue sin
pintarse, porque pintarlo diría que el riesgo es alto cuando lo que pasa es que no se sabe.

El acento se decide por `esResidualAlarmante`, que ya existe, se mueve tal cual al módulo puro y
sigue nombrando las bandas por nombre y no por orden de umbral.

---

## D5 · Las columnas son un dato puro, y por eso esto sigue siendo verificable

Esta es la decisión que sostiene el cambio entero.

**El problema.** La documentación de AG Grid **desaconseja jsdom**: sin soporte de layout, la
virtualización no calcula qué filas caben y el grid puede no rendir ninguna. Recomienda verificar en
navegador real. Toda la verificación de esta pantalla vive hoy en jsdom, y `HARNESS.md` Regla 1 exige
una prueba **en rojo antes** del arreglo: si la única forma de probar pasa a ser Playwright contra una
base con datos reales, cada iteración cuesta un minuto en vez de un segundo, y una regla que cuesta
eso se deja de cumplir.

**La salida.** Sacar de la grilla todo lo que puede estar mal, y dejarla como cascarón.

`lib/sgsi/columnas-analisis.ts` — **puro, sin React, sin AG Grid renderizado** (sólo sus tipos):

```
columnasAnalisis(opciones) -> ColDef[]     // las 13, con headerName, width, pinned, sortable
comparadorResidual(a, b)   -> number       // por NivelRiesgo.nivel, null al final
comparadorCriticidad(...)  -> number       // delega en el comparador extraído de analisis-riesgos
claseDeFila(fila)          -> string[]     // fila-banda--*, fila-plan--*, fila-alarmante
```

Y se prueba **como dato**, sin renderizar nada:

- las trece columnas están, en su orden, con sus encabezados;
- **ninguna trae filtro** (la afirmación de D2, convertida en prueba);
- `Código` va fijada a la izquierda y D · I · C viven bajo el encabezado agrupado;
- el comparador de residual pone Crítico antes que Alto, y `null` al final;
- el comparador de criticidad da el mismo orden que `ordenarPorCriticidad` sobre el fixture de
  §14.12 —la prueba que ya existe, reusada como oráculo—;
- `claseDeFila` sobre las tres bandas del fixture da las tres clases esperadas.

Rojo primero, en milisegundos. Es el mismo criterio con el que `lib/__tests__/use-server.test.ts`
convirtió una clase de fallo de despliegue en una prueba de milisegundos: **si un error se puede
convertir en prueba barata, se convierte.**

**Dónde queda cada prueba de las que hoy existen:**

| Prueba actual | Destino |
|---|---|
| El renglón se pinta por la magnitud del residual (×4) | `columnas-analisis.test.ts` (`claseDeFila`) |
| Una columna por dimensión, con su nombre accesible (×3) | `columnas-analisis.test.ts` (los `ColDef`) + e2e |
| «+ plan» en toda fila, y abre el popup de su propia fila (×3 + ×4) | **Se quedan en jsdom** con `domLayout="autoHeight"`; si el render no rinde filas, se van al e2e |
| Las dos filas y la tarjeta `EN ANÁLISIS` coinciden | Se queda: la tarjeta no es de la grilla |
| Las tarjetas `SIN PLAN` (×2) y la franja | Se quedan sin cambio: no tocan la grilla |
| La fila enlaza al overlay con `activo=` y `tab=amenazas` | e2e (es un clic real sobre una celda real) |
| §14.12 · el `<select>` reordena por RTO | `columnas-analisis.test.ts` (el comparador) + e2e (el `<select>`) |
| La pantalla no importa acciones de servidor | Sin cambio: lee el archivo fuente |

**Y una en navegador.** `e2e/analisis-riesgos.spec.ts`, en la misma forma que `e2e/grafo.spec.ts`:
sólo lectura —navegar, ordenar, mover una columna, fijar, abrir el overlay—, sin reintentos. El
botón «+ plan» escribe, así que **no** entra al e2e contra producción: se prueba a mano contra la
base local (5432) y el recorrido se escribe en el PR, como manda la Regla 3.

---

## D6 · Carga diferida, y el peso se mide

**Decisión:** `next/dynamic` con `ssr: false` sobre el componente de la grilla. La pantalla ya es
`'use client'`, pero AG Grid no aporta nada al HTML inicial y sí lo engorda.

**El peso se mide, no se estima.** La tarea 3.6 pide anotar en el PR el delta real de
`npm run build`. Si resulta intolerable, la salida es registrar módulos sueltos
(`ClientSideRowModelModule`, `CsvExportModule`, `ColumnApiModule`…) en vez de `AllCommunityModule`,
que es exactamente para lo que existe la modularización.

---

## D7 · Tema derivado de los tokens, sin los CSS heredados

**Decisión:** Theming API (`themeQuartz.withParams({...})`), **sin** importar `ag-grid.css` ni
`ag-theme-*.css`.

**Por qué.** El proyecto ya tiene su paleta en `--hf-*` y Tailwind 4. Importar el tema heredado mete
un segundo sistema de color que pelea con el primero, y la grilla queda pareciéndose a AG Grid en vez
de parecerse al SGSI. Los parámetros mínimos a mapear: `backgroundColor`, `foregroundColor`,
`borderColor`, `headerBackgroundColor`, `rowHoverColor`, `fontFamily`, `fontSize`, `rowHeight`.

Los colores de banda (`colorDeNivel`, `colorDeNivelValor`) **no** se tocan: siguen viniendo del
catálogo de umbrales, pintados por los mismos cell renderers que hoy, para que el renglón y la
casilla de la matriz sigan coincidiendo.

---

## Flujo de datos, después del cambio

```
servidor: analisis-riesgos.query.ts
      │  activos, bandas, umbral, catálogos, acciones, sinPlan, criticidadesRto
      ▼
PantallaAnalisisRiesgos  ('use client')
      │
      ├── filtrosAnalisisDesdeUrl ──► FiltrosAnalisis ──► router.replace (URL)
      │
      ├── filasAnalisis(datos, filtros, resolverDeuda) ──┐   ← ÚNICA fuente de qué filas hay
      ├── tarjetasAnalisis(datos, filtros, ...) ──► 5 tarjetas
      │                                                  │
      │   columnas-analisis.ts (puro) ──► ColDef[] ──────┤
      │                                                  ▼
      └──────────────────────────────────────────► <AgGridReact>
                                                    (ordena, mueve, fija, oculta, exporta CSV
                                                     — NO filtra)
```

La flecha que no existe es la importante: **de `<AgGridReact>` no sale ninguna flecha hacia las
tarjetas**. La grilla no puede cambiar cuántas filas hay, y por eso no puede contradecirlas.
