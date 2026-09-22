# Proposal: AG Grid en «Análisis de riesgos»

## Intent

`PantallaAnalisisRiesgos.tsx` muestra **trece columnas** en una `<table>` escrita a mano: código,
nombre, valor, D, I, C, criticidad, proceso, propietario, amenazas, peor inherente, peor residual y
plan. Trece columnas no caben en una pantalla, y hoy no hay forma de que quien las lee decida
cuáles quiere ver, en qué ancho ni en qué orden: la maqueta es la que es, y lo que sobra se resuelve
con `tabla-ancha` y desplazamiento horizontal.

Lo que falta no es una columna más. Es que **el lector controle la vista**: mover, redimensionar,
fijar `Código` a la izquierda, ocultar lo que no le sirve hoy, ordenar por dos columnas a la vez, y
que esa disposición siga ahí mañana. Eso es exactamente lo que una grilla de verdad hace, y lo que
una `<table>` a mano sólo consigue escribiendo de nuevo media librería.

Se propone adoptar **AG Grid Community (MIT)** en esta pantalla como **piloto**, no en todo el
sistema: es la grilla más densa del SGSI y la que más gana, y si el piloto no convence, revertir es
un commit y no una migración.

## Scope

### In Scope

- `ag-grid-community` + `ag-grid-react` (licencia MIT) como dependencia, cargadas con `next/dynamic`
  (`ssr: false`)
- Un módulo **puro y probado** con las definiciones de columna: `lib/sgsi/columnas-analisis.ts`
  —`ColDef[]`, `valueGetter`, `comparator`, clases de fila—. Es el único artefacto nuevo con lógica,
  y se prueba sin renderizar nada (§ design D5)
- Sustitución de la `<table>` de `PantallaAnalisisRiesgos.tsx` por `<AgGridReact>`, conservando
  íntegras las tarjetas, los seis filtros de la URL, la franja «sin plan», el enlace al overlay y el
  botón «+ plan»
- Mover, redimensionar, ocultar y fijar columnas; orden multi-columna; encabezado pegajoso;
  encabezado agrupado para D · I · C; exportar CSV
- Persistencia de la disposición de columnas por usuario en `localStorage`, con un botón
  «Restablecer columnas»
- Tema propio derivado de los tokens `--hf-*` con la Theming API (sin los CSS heredados de AG Grid)
- `e2e/analisis-riesgos.spec.ts`: el recorrido de la grilla en navegador real
- Reescritura de las pruebas de `PantallaAnalisisRiesgos.test.tsx` que hoy dependen del `<tr>`

### Out of Scope

- **AG Grid Enterprise.** Ver «Decisiones abiertas»
- Las otras grillas del sistema: el inventario completo (378 vigentes), controles, planes y
  obligaciones. El
  piloto decide si se extiende; extenderlo ahora multiplicaría por cinco el riesgo de una apuesta
  todavía no verificada
- Filtrado dentro de la grilla. Los seis filtros siguen viviendo en la URL y siguen siendo los
  únicos que reescopan (§ design D2 — es lo que protege el invariante de la pantalla)
- Edición de celdas. Esta pantalla lee; lo único que escribe es el popup de planes, y sigue igual
- Cambiar qué filas entran al análisis, cómo se calcula el residual, la brecha o el estado del plan.
  `lib/sgsi/analisis-riesgos.ts` **no se toca**

## Capabilities

### New Capabilities

- `risk-analysis-grid`: la disposición de columnas la controla quien lee, la grilla no filtra, y la
  definición de columnas es un dato puro y probado

### Modified Capabilities

- `risk-analysis-page`: la lista pasa de `<table>` a grilla. Las tarjetas, los filtros, el conteo, el
  orden por defecto y los dos accesos (overlay y «+ plan») no cambian de comportamiento

## Approach

Cuatro fases, de adentro hacia afuera, para que cada una se verifique sola:

1. **El comparador puro.** Extraer de `ordenarPorCriticidad` un comparador de dos filas, sin cambiar
   su comportamiento (la prueba §14.12 existente es la red).
2. **Las columnas como dato.** `columnas-analisis.ts`: trece `ColDef` y las clases de fila, en
   Jest, sin grilla. Acá vive todo lo que puede estar mal y todavía es barato equivocarse.
3. **La grilla.** Sustituir la `<table>`. Sin lógica nueva: consume (2).
4. **La verificación.** `e2e/analisis-riesgos.spec.ts` y el recorrido a mano del PR.

El orden importa: la fase 2 es la que hace que la Regla 1 del harness siga siendo posible. Si la
grilla se montara primero, la única forma de probar cualquier cosa sería el navegador, y la Regla 1
—prueba en rojo antes del arreglo— pasaría a costar un minuto por iteración en vez de un segundo.

## Affected Areas

| Area | Impact | Change |
|---|---|---|
| `package.json` | Modified | `ag-grid-community`, `ag-grid-react` (MIT) |
| `lib/sgsi/columnas-analisis.ts` | **New** | `ColDef[]`, comparadores, `getRowClass` — puro |
| `lib/sgsi/analisis-riesgos.ts` | Modified | sólo extraer `compararPorCriticidad`; `ordenarPorCriticidad` lo usa y no cambia de resultado |
| `app/components/sgsi/valoracion-riesgos/PantallaAnalisisRiesgos.tsx` | Modified | `<table>` → `<AgGridReact>`; tarjetas y filtros intactos |
| `app/components/sgsi/valoracion-riesgos/__tests__/PantallaAnalisisRiesgos.test.tsx` | Modified | las que leen `<tr>` se reubican (§ design D5, tabla) |
| `e2e/analisis-riesgos.spec.ts` | **New** | el recorrido en navegador real |
| `app/globals.css` o el tema de la grilla | Modified | tema derivado de `--hf-*` |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **AG Grid desaconseja jsdom en su propia documentación** —sin layout, la virtualización no rinde filas— y toda la verificación de esta pantalla vive hoy en jsdom | **Alta** | La lógica se saca de la grilla a `columnas-analisis.ts` y se prueba como dato; lo que sólo se ve renderizado se prueba en Playwright. `domLayout="autoHeight"` en jsdom para las pruebas que sigan siendo de render (§ design D5) |
| No existe API para poner `data-*` en la fila: `data-banda-residual` y `data-estado-plan` —contrato que tres pruebas leen— no sobreviven tal cual | **Alta** | Pasan a clases por `getRowClass` (`fila-banda--Critico`, `fila-plan--pendiente`), que se inspeccionan igual de bien y se prueban puras. La banda **sigue diciéndose en palabras** en su columna: el color nunca es el único portador |
| La grilla filtra por su cuenta y las tarjetas dejan de coincidir con la lista — el invariante que la pantalla defiende en negrita desde la primera línea | Media | `defaultColDef.filter = false` en la fase 1, y una prueba que lo afirma sobre `columnas-analisis.ts`: ninguna columna trae filtro |
| El peso del bundle en una pantalla que hoy no carga ninguna librería de UI | Media | `next/dynamic` con `ssr: false`; **medir** el delta real del build y anotarlo en el PR (tarea 3.6). Si pasa de lo tolerable, se cae a módulos sueltos en vez de `AllCommunityModule` |
| El `<table>` semántico se cambia por `div`s con `role="grid"`: lectores de pantalla y los `aria-label` de D · I · C | Media | Los `headerName`/`headerTooltip` conservan el nombre completo; el recorrido e2e incluye una pasada por teclado |
| El `<Link>` de la primera columna deja de navegar porque la grilla intercepta el clic | Media | Cell renderer con el `<Link>` real y `suppressCellFocus` donde estorbe; el e2e comprueba que el clic abre el overlay con `activo=` y `tab=amenazas` |
| Se adopta una dependencia grande para 30 filas | Media | Es un piloto declarado, con criterio de reversión escrito abajo. Las 30 filas son de hoy: el umbral es parametrizable y el inventario vigente tiene 378 |

## Rollback Plan

No hay migración, no hay dato nuevo, no hay contrato de servidor tocado: **revertir es revertir el
commit**. La única huella fuera del código es la disposición de columnas en `localStorage` de cada
navegador, que al desaparecer la grilla queda huérfana y no rompe nada.

Criterio de reversión, escrito antes de construir para que no se negocie después: si al cabo de dos
semanas de uso la disposición de columnas no la cambió nadie —el `localStorage` lo dice—, el piloto
falló en su premisa y se vuelve a la `<table>`.

## Trabajo en curso que esta spec respeta

Esta propuesta se escribió **contra el árbol de trabajo del 21/09/2026** en
`scorm-2004-paquete-propio`, no contra `main`. Eso importa porque esa pantalla la tocaron tres
commits recientes, y todo lo que traen queda **dentro** del alcance a preservar:

| Commit | Qué dejó en la pantalla | Estado en esta spec |
|---|---|---|
| `94a5372` | `PopupPlanesActivo` (496 líneas) y su montaje | Preservado; el popup no se toca |
| `103971e` | «+ plan» en **todas** las filas y el renglón en rojo por residual alto | Preservado, con escenario propio y con la inversión de criterio del 18/09 documentada |
| `c2e2cd3` | Las columnas D, I y C además del valor | Preservadas, y bajo encabezado agrupado |

Lo que sigue pendiente sobre planes de tratamiento —nombres de FOR-SIG-13, los cuatro campos que
hoy sólo entran por importación, madurez objetivo— **vive en `PopupPlanesActivo`, no en la grilla**,
y por eso las dos líneas de trabajo no chocan: esta spec cambia cómo se pinta la lista y no toca
qué registra el popup. La única coordinación necesaria es de calendario, no de diseño: quien
implemente esta spec reescribe `PantallaAnalisisRiesgos.tsx` y su prueba, así que conviene que no
haya un cambio abierto sobre esos dos archivos el mismo día.

**El tablero de planes con arrastre** (`docs/handoff_sig/tablero-planes-propuesta.html`) sí es una
decisión adyacente de verdad: es una segunda grilla. Queda fuera de alcance acá, y se decide en la
fase 6 —con el piloto ya evaluado— si se construye sobre AG Grid o sigue siendo propia.

### Nota sobre los conteos

Este documento estuvo escrito un rato con los «37 de 299» del comentario de cabecera de la
pantalla, que ya no eran exactos: la base local se reconstruyó el 21/09/2026 desde el dump de
producción. Las cifras que usa ahora están **medidas**, y son **«30 de 378, umbral 4»**:

| Número | Qué cuenta | Verificación |
|---|---|---|
| **30** | activos que **superan el umbral** y entran al análisis — el tamaño real de la grilla | leído del encabezado de `/sgsi/valoracion-riesgos`, que lo calcula `tarjetasAnalisis`; 30 filas en el `tbody` que cuadran |
| **378** | activos **vigentes** — lo que la pantalla muestra como total | la consulta filtra `where: { activo: true }` (`analisis-riesgos.query.ts:68`) y la pantalla pasa `totalVigentes={activos.length}` |
| 398 | filas totales en `activo`; los 20 de diferencia están dados de baja | `psql` |
| 4 | el umbral vigente (`parametro.umbral_valoracion`) | igual |

El comentario de cabecera de la pantalla (`PantallaAnalisisRiesgos.tsx:6`) dice «los 37, no los 299»
y está desactualizado **en los dos números**. Vale la pena corregirlo cuando se toque el archivo.

Dos confusiones que costaron un par de vueltas y conviene dejar fijadas:

- **El 37 no eran personas.** `/sig/personas` tiene su propio 37, de otro módulo; la coincidencia es
  casualidad.
- **El 378 no son «los valorados en D, I y C».** Son los vigentes. La valoración está completa en
  los 398 (`activo_valor` tiene 1.194 filas = 398 × 3).

**Qué le hace el 30 al diseño:** nada, y eso es la noticia. 30 son decenas, no cientos: el criterio
de D1 se sostiene —agrupar es comodidad, Enterprise no vuelve a la mesa por tamaño— y ahora con un
número medido en vez de uno heredado de un comentario viejo. Ningún otro argumento del documento
depende de un conteo exacto.

## Decisiones abiertas

**Community o Enterprise.** Esta propuesta está escrita sobre **Community (MIT, sin costo)**, que es
el supuesto conservador: no compromete presupuesto y no obliga a nada. Enterprise cuesta **999 USD
por desarrollador** con un año de actualizaciones, y lo que agrega sobre esta pantalla es: agrupar
filas por proceso o propietario, filtro de casillas estilo Excel, panel lateral de columnas, barra de
estado con agregados, maestro-detalle y exportación a `.xlsx`.

De esa lista, **la exportación no es un argumento**: `exceljs` ya es dependencia del proyecto y el
informe formal sale por `/sgsi/informe-valoracion`, sobre el inventario completo y no sobre el
recorte que la pantalla muestra. Y sobre 30 filas, agrupar y el filtro de casillas son comodidad, no
capacidad. Recomendación: **Community**, y volver a mirar Enterprise el día que el piloto se
extienda al inventario completo, donde agrupar por proceso sí cambia qué se puede leer.

Si la decisión es Enterprise, cambia poco de este diseño: la clave de licencia entra al build como
variable de entorno y `AllCommunityModule` pasa a `AllEnterpriseModule`. Las fases y las pruebas son
las mismas.
