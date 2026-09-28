# La grilla de análisis, en árbol por activo

**Decidido el 28/09/2026.** La grilla de «Análisis de riesgos» muestra una fila por activo y
esconde los 23 riesgos que cada uno lleva detrás. Las preguntas que la gente trae —«¿por qué
Siigo dice *No requiere* si su residual es Alto?»— sólo se contestan mirando riesgo por riesgo,
y hoy eso no se puede hacer desde ninguna pantalla.

## Lo que NO se puede usar, y está comprobado

`package.json` trae sólo `ag-grid-community` 36.2.0. De sus **67 módulos, ninguno es de
agrupación ni de árbol**: el único con «Group» en el nombre es `_ColumnGroupModule`, que agrupa
columnas. **Row Grouping, Tree Data y Master/Detail son de AG Grid Enterprise, 999 USD por
desarrollador.**

Lo que sí está en Community, verificado en `node_modules/ag-grid-community/dist/types/src/entities/gridOptions.d.ts`:

    isFullWidthRow?: IsFullWidthRow<TData>;
    fullWidthCellRenderer?: any;

El árbol se construye con eso, a mano. Es el mismo criterio con que se resolvió el export a
Excel con estilos en vez de pagar la licencia.

## El modelo de filas

`rowData` deja de ser 30 filas de activo y pasa a una lista mixta:

    { tipo: 'activo', ...FilaAnalisis }        <- la fila de hoy, con sus 13 columnas
    { tipo: 'riesgo', padre: 'FIN-APP-0001', ... }  <- sólo si el padre está expandido

`isFullWidthRow` devuelve `true` para las de tipo `riesgo`, y `fullWidthCellRenderer` las pinta
como una franja del ancho completo. Así el hijo no pelea con las columnas del padre: un riesgo
no tiene «Proceso» ni «Propietario» propios, y alinearlo bajo esas columnas diría que sí.

**Hace falta propagar el detalle.** `FilaAnalisis` trae hoy sólo agregados —`cantidadAmenazas`,
`peorResidual`, `estadoPlan`—. La lista por riesgo existe en `ActivoAnalizable.riesgos` y hay
que llevarla hasta la fila.

## El orden y el filtro despegan a los hijos del padre

**Es el riesgo principal de este diseño y hay que decirlo antes de construirlo.** AG Grid ordena
y filtra sobre la lista plana: en el momento en que alguien ordena por «Peor residual», los
hijos se reubican por su cuenta y quedan intercalados bajo activos que no son el suyo.

Es exactamente la forma de las cicatrices de `HARNESS.md`: cada pieza hace bien su trabajo —la
grilla ordena, el renderizador pinta— y el defecto vive entre las dos.

**Decisión: al ordenar o filtrar, el árbol se colapsa entero.** La grilla vuelve a ser plana y
quien quiera el detalle vuelve a expandir. Es visible, es predecible, y no hay estado intermedio
en el que la pantalla mienta.

Se descartó hacer que cada hijo cargue las claves de orden de su padre para viajar pegado:
suena elegante y es frágil — cualquier columna nueva rompe la correspondencia **en silencio**,
que es la peor propiedad posible.

## Qué dice cada riesgo hijo

    E.1 · Errores de los usuarios          residual 5,50 Alto
          principal A.6.3 · nivel 70  ·  exige 70  ·  sin brecha

- **Amenaza**: código y nombre.
- **Residual**: cifra y banda, con el color de su casilla en la matriz.
- **Control principal**: código y nivel actual.
- **Exigido** y **brecha**: de `brechaDelRiesgo`, que ya existe y es puro.

**La brecha no se ve hoy en ninguna pantalla** —la franja de REQ-SIG-23 §4.1 no está
construida—, y éste es el primer sitio donde cabe sin inventar una pantalla nueva.

Contesta además la pregunta que originó todo esto: por qué `FIN-APP-0001` dice «No requiere»
con residual Alto. Se expande y se lee: exige 70, el control está en 70, sin brecha. La columna
«Plan» mide la brecha del control, no el riesgo que queda.

## Alcance

**Entra:** el árbol, el expansor por activo, la franja del hijo, el colapso al ordenar o
filtrar, y la propagación del detalle por riesgo hasta la fila.

**No entra:** cambiar el nombre de la columna «Plan» a «Brecha de control» —está propuesto y sin
decidir—, y la franja de REQ-SIG-23 §4.1, que es una pantalla aparte.
