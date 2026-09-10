# Requerimiento · Página de Valoración de Activos

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-18 · valoración de activos |
| **Versión** | 1.2 — cuatro pilas, y dos tablas de detalle: por cargo y por persona |
| **Fecha** | 2026-09-09 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo (ejecución asistida con Claude Code) |
| **Ruta nueva** | `/sgsi/valoracion` |
| **Toca además** | `app/components/sgsi/inventario/InventarioActivos.tsx` y `app/sgsi/inventario/page.tsx` (§7 · **sin esto la navegación pedida no existe**) |
| **Estado** | D-1 a D-9 cerradas · D-7 con una pregunta abierta · **D-10 a D-12 abiertas** (§14 · el match cargo → persona) · listo para ejecutar el §4 al §7 |

---

## 1 · Objetivo

Una pantalla que responda de un golpe **cuánto vale el inventario, qué dimensión lo hace valioso y quién responde por lo que más vale**, y que desde ahí lleve al activo concreto en dos clics.

Hoy nada de eso se puede contestar. El inventario lista y filtra, pero no agrega: para saber cuántos activos llegan al umbral hay que contarlos a ojo, y para saber de quién son hay que filtrar propietario por propietario. La ficha del activo muestra su valoración; nadie muestra la del conjunto. Y la pregunta de por qué un activo es valioso —¿porque no puede caerse, porque no puede alterarse, o porque no puede divulgarse?— hoy no se puede hacer a escala de inventario.

Tres piezas, y una condición:

- **Las cuatro pilas** — el valor del activo y cada una de sus tres dimensiones, alineadas y a la misma escala. Es la vista de 360°: se lee de una pasada qué dimensión empuja el inventario por encima del umbral.
- **La matriz** — las mismas cuatro filas por seis niveles, en números. Es la vista de tabla accesible y el respaldo de cada cifra.
- **Las dos tablas de detalle** — la A por propietario (cargo) × nivel, siguiendo la dimensión seleccionada; la B por persona × los cuatro criterios × seis niveles. La primera dice quién responde; la segunda, quién lo tiene en la mano.
- **La condición** — que un clic en cualquier celda abra el inventario ya filtrado. Eso **no se puede hacer hoy** y es el §7.

---

## 2 · Dónde vive

Grupo **«SGSI · Seguridad de la información»** de `SidebarSgsi.tsx`, **inmediatamente después de «Inventario de activos»**:

```
Inventario de activos      INV   /sgsi/inventario        (contador: activos)
Valoración de activos      VAL   /sgsi/valoracion        ← nueva
Matrices de riesgo         MTZ   /sgsi/matrices
Madurez de los controles   MAD   /sgsi/controles
```

Va ahí y no en el grupo SIG porque es el **resumen del registro**, no un indicador de gestión: se lee junto al inventario que resume, y el orden del menú ya agrupa «lo que la organización tiene» antes de «lo que la amenaza». La abreviatura del menú colapsado es `VAL`, libre hoy. Sin contador: el número de la pantalla no es «cuántos activos» —eso ya lo dice INV— sino cuántos alcanzan el umbral, y eso no cabe en el menú.

**Defecto encontrado de paso, para el desarrollador · no lo arregle este REQ.** El propio `SidebarSgsi.tsx` declara en su comentario de cabecera (`:21-22`) que «cada entrada muestra una abreviatura de tres letras **única**», y hoy hay una repetida: **`MET` está en dos entradas** — «Métricas del SGSI» (`:101`) y «Metodología» (`:116`). Colapsado el menú, las dos se ven igual. Queda anotado como hallazgo de interfaz; corregirlo es una decisión de quien especifica, no un arreglo al pasar.

---

## 3 · La aritmética que la página resume

Antes del diseño, las cuentas, porque de ellas dependen las tres piezas.

**El valor de un activo es el mayor de sus tres dimensiones.** Está en `lib/sgsi/formulas.ts:38`:

```ts
export function valorActivo(valores: ValoresDimension): Decimal {
  return new Decimal(Math.max(valores.D, valores.I, valores.C));
}
```

Una dimensión crítica basta para hacer crítico el activo. Y es **derivado, nunca almacenado**: `ActivoValor` guarda una fila por `(activo, dimensión)` y el máximo se calcula al leer. La página **no crea ninguna columna** ni ninguna tabla; agrega lo que ya existe.

| Cosa | Dónde | Valor |
|---|---|---|
| Niveles de la escala | `EscalaValor` · `prisma/data/escalas.json` | **6**: `5 — Muy Alto` · `4 — Alto` · `3 — Medio` · `2 — Bajo` · `1 — Muy Bajo` · `0 — Irrelevante` |
| Dimensiones | `Dimension` | **D · I · C**. El esquema admite `A` y `T` (`codigo` es `Char(1)`, «D, I, C, A, T») y hoy se siembran tres. La pantalla **itera sobre las dimensiones activas**, no sobre tres constantes: si mañana entra `A`, aparece una quinta pila sin tocar código |
| Umbral | `Parametro.umbral_valoracion` | **4** — «un activo entra al análisis si su valor lo alcanza» (`prisma/seeds/escalas.ts:141`) |
| Propietario | `Activo.propietarioId` → `CargoResponsable` | Es un **cargo**, no una persona (§6.1) |

**El umbral se lee de la base, no se escribe en el código.** Es el invariante 4 del paquete y acá importa doble: si mañana pasa a 3, las cuatro pilas y todos los totales tienen que moverse solos.

**Y una advertencia aritmética que la pantalla tiene que dejar clara:** la fila del máximo **no es la suma ni el promedio** de las otras tres. Es el máximo activo por activo. Nadie debe poder mirar la matriz y tratar de reconciliarla sumando. El §4.5 dice cómo se rotula para que eso no pase.

---

## 4 · La figura · cuatro pilas alineadas

### 4.1 La forma, y las tres que descarté

El dato es una matriz de **4 filas × 6 niveles**: el valor del activo más sus tres dimensiones. Ese es el «un poco complejo de visualizar» del pedido, y es real: 24 celdas con un corte de umbral encima. Cuatro formas posibles, y por qué gana la cuarta.

| Forma | Qué muestra bien | Por qué no |
|---|---|---|
| **Mapa de calor 4 × 6** | La matriz completa en poco espacio | El tinte codifica la cuenta, así que **la proporción se pierde**: no se ve que una fila tenga la mitad del inventario a la derecha del umbral. Y el corte del umbral no se puede dibujar: en una parrilla no hay una posición que lo represente |
| **Barras agrupadas · 6 grupos de 4** | Comparar una dimensión contra otra en un mismo nivel | Veinticuatro barras sueltas. Se pierde el todo: la pregunta «qué fracción de mi inventario pasa el umbral» exige part-to-whole y esto lo rompe en pedazos |
| **Barras apiladas 100 %** | La proporción, exactamente | Normalizar **esconde que una dimensión tiene menos activos valorados que otra**. Con valoración parcial, cuatro barras del mismo largo dirían que los cuatro denominadores son iguales, y no lo son |
| **Cuatro pilas alineadas a escala absoluta compartida** ← | La proporción **y** el total **y** la comparación entre filas, con un corte de umbral por fila | Es la que se especifica |

**La que gana son cuatro barras apiladas horizontales, una por fila, alineadas a la izquierda, sobre una misma escala absoluta de conteo.** Es el patrón de *small multiples*: la misma figura repetida para facetas comparables, una sola escala y una sola leyenda. Y tiene tres propiedades que ninguna de las otras da:

1. **La longitud significa cuántos activos.** Si una dimensión tiene menos activos valorados, su barra es más corta, y eso es información, no un defecto de dibujo.
2. **El corte del umbral cae en una x distinta por fila**, y esa desalineación **es el hallazgo**: se ve de un vistazo qué dimensión empuja más activos por encima de la línea. Es la respuesta visual a «¿somos valiosos por confidencialidad o por disponibilidad?».
3. **La fila del máximo siempre queda igual o más oscura que cualquier dimensión**, porque el máximo domina a cada componente. Esa monotonía se ve, y cuando no se ve, hay un error de cálculo. La figura se autocontrola.

### 4.2 El layout

```
                        0        50       100      150      200      250   activos
                        ├────────┼────────┼────────┼────────┼────────┼──►

  Valor del activo      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┃▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓        128 ≥ 4
  (máximo D·I·C)

  Confidencialidad      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┃▓▓▓▓▓▓▓▓▓▓▓         96 ≥ 4
  Integridad            ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┃▓▓▓▓▓          41 ≥ 4
  Disponibilidad        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓┃▓▓▓         33 ≥ 4

                        ┃ = umbral 4 · a la derecha de la marca, entra al análisis
                        ░ 0  ▒ 1  ▒ 2  ▓ 3  ▓ 4  █ 5
```

Cifras ilustrativas; cuadran con la matriz del §4.5 y con la tabla del §6.1 a propósito, para que se vea que las cuatro piezas leen el mismo dato.

- **La fila del máximo va primero, separada** de las otras tres por un espacio mayor y una hairline: es el resumen, las otras tres son su descomposición. Su etiqueta dice **«Valor del activo (máximo D·I·C)»**, con el «máximo» explícito, que es lo que impide que alguien intente sumar las tres de abajo.
- Los segmentos van ordenados **de 0 a 5, izquierda a derecha**. Así el umbral queda a la derecha y «pasar el umbral» es literalmente estar a la derecha de la marca, que es como se lee en español.
- **Una sola escala x, absoluta, compartida por las cuatro**, con su eje arriba y rótulo «activos». Hairlines sólidas, nunca punteadas.
- **Una sola leyenda de escala** para las cuatro, abajo: seis muestras de `0` a `5` con su etiqueta.
- Encima de todo, la fila de cifras protagonistas:

```
296 activos    ·    128 alcanzan el umbral (43 %)    ·    C es la dimensión que más manda
```

La del medio va en tamaño de figura protagonista (≥ 32 px, la misma sans del resto, cifras proporcionales — **no** `tabular-nums`, que a ese tamaño deja los dígitos flojos).

### 4.3 La dimensión que manda · con su advertencia

La tercera cifra responde «de los que pasan el umbral, ¿qué dimensión se lo determina?», y expandida es una línea de tres cuentas:

```
De los 128 que alcanzan el umbral, lo determina C en 96 · I en 41 · D en 33
```

**Esas tres cuentas no suman 128, y la pantalla tiene que decirlo.** Un activo valorado `C=4, I=4, D=2` tiene el máximo determinado por C **y** por I: los empates son la norma, no la excepción. Debajo de la línea, en tinta apagada:

> Un activo con empate en el máximo cuenta en cada dimensión empatada, así que las tres cifras suman más que el total.

Sin esa frase, la línea parece un error de cálculo. Con ella, es un dato. **Prohibido** resolver el empate eligiendo una dimensión por orden alfabético o por `orden` del catálogo: eso inventaría una jerarquía entre C, I y D que la metodología no establece.

### 4.4 La rampa · validada, no elegida a ojo

El nivel de valor es una escala **ordinal**, así que la rampa es de **un solo tono, claro → oscuro**, y es **la misma para las cuatro pilas** — cuatro paletas distintas harían creer que las filas son series independientes, cuando son la misma medida sobre cuatro cortes.

Un arcoíris de seis colores acá sería un error de tipo: gastaría el único canal libre en información que la longitud del segmento ya da, y ninguna paleta categórica sobrevive a seis clases adyacentes.

Los seis pasos, corridos contra el validador de paletas sobre la superficie real de la app (`--hf-bg-surface: #ffffff`):

| Valor | Hex | Token del proyecto |
|---:|---|---|
| 5 | `#0c2461` | `--hf-brand-900` |
| 4 | `#1b3a8a` | `--hf-brand-700` |
| 3 | `#2b52b8` | `--hf-brand-500` |
| 2 | `#4874c2` | nuevo · interpolado en la rampa |
| 1 | `#6c95d4` | nuevo · interpolado en la rampa |
| 0 | `#93b4e0` | nuevo · interpolado en la rampa |

```
node scripts/validate_palette.js "#93b4e0,#6c95d4,#4874c2,#2b52b8,#1b3a8a,#0c2461" \
     --mode light --surface "#ffffff" --ordinal

[PASS] Lightness monotone     steps read light→dark
[PASS] Adjacent ΔL            all gaps >= 0.06
[PASS] Light-end contrast     #93b4e0 at 2.13:1 vs surface
[PASS] Single hue             hue spread 9°
→ ALL CHECKS PASS
```

**Los tres pasos oscuros son los tokens de marca tal cual**; solo los tres claros se interpolaron. Y hay una razón para no haber usado `--hf-brand-100` (`#e9f0fb`) como paso más claro, que era lo natural: **el validador lo rechazó a 1.12:1 contra el blanco**. El segmento del valor 0 habría sido invisible sobre la superficie. Si el desarrollador cambia un paso, tiene que volver a correr el validador; el criterio 10 lo exige.

**Sin rampa oscura.** `app/globals.css` no declara `prefers-color-scheme` ni `[data-theme]`: la app es de un solo modo y esta página no introduce el segundo.

**Verde y rojo no se usan acá.** El verde está reservado para estado bueno —madurez L4-L5, riesgo bajo— y un activo de valor 5 no es «malo», es valioso. Pintarlo de rojo diría lo que la metodología no dice.

### 4.5 La marca, y la matriz que la respalda

- **2 px de superficie entre segmentos**, no un borde. Un borde alrededor de cada relleno engorda la barra y ensucia el corte.
- Altura de barra **26 px**, con **10 px entre las tres dimensiones** y **20 px más una hairline** entre el máximo y ellas.
- **Esquinas de 4 px solo en los dos segmentos de los extremos** de cada barra, del lado de afuera. Los interiores van rectos.
- **La marca del umbral** es un tick vertical de 2 px que sobresale 4 px arriba y abajo de su barra, en tinta de texto, **en la frontera del nivel 4 de esa fila** — no en una x fija. Si el umbral pasa a 3, las cuatro marcas se mueven solas. Si en una fila el umbral cae en un extremo, esa marca se omite.
- **A la derecha de cada barra, su cuenta `≥ umbral`**, alineada en columna, con `tabular-nums` (acá sí: son números que se comparan verticalmente).
- **Etiqueta dentro del segmento solo si cabe con aire.** Si no cabe, va al tooltip y a la matriz. Un número recortado a media cifra es peor que ninguno.
- **Tooltip por segmento**, hit area de 24 px mínimo incluyendo los 2 px de separación: fila, nivel, etiqueta, cuenta, porcentaje de su fila, y si entra al análisis.
- **El tooltip nunca es el único camino al dato.** Debajo de la figura, plegable y abierta por defecto en pantallas anchas, **la matriz en números** — que es la vista de tabla accesible y la que respalda cada cifra:

| | Sin valorar | 0 | 1 | 2 | 3 | 4 | 5 | Total | ≥ 4 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Valor del activo (máx D·I·C)** | 4 | 2 | 6 | 38 | 118 | 119 | 9 | **296** | **128** |
| Confidencialidad | 4 | 31 | 40 | 61 | 64 | 88 | 8 | **296** | **96** |
| Integridad | 4 | 44 | 58 | 79 | 70 | 38 | 3 | **296** | **41** |
| Disponibilidad | 6 | 52 | 61 | 82 | 62 | 31 | 2 | **296** | **33** |

Las cuatro filas suman su propio total, y **los totales pueden diferir entre filas**: un activo valorado solo en C aporta a la fila de C y a la de máximo, y cae en «Sin valorar» en I y en D. Que los cuatro totales coincidan es lo normal, pero la pantalla no lo asume.

### 4.6 El clic

Cada segmento navega al inventario filtrado por esa fila y ese nivel:

```
/sgsi/inventario?valor=4                 ← segmento de la fila del máximo
/sgsi/inventario?dimension=C&valor=4     ← segmento de la fila de Confidencialidad
```

Y la cuenta `≥ umbral` de cada fila:

```
/sgsi/inventario?dimension=C&valorMinimo=4
```

El cursor es de puntero y el segmento se aclara un paso al pasar por encima. El foco de teclado muestra lo mismo que el hover y `Enter` navega: los segmentos son tabulables, fila por fila.

**El rótulo de cada fila no navega: selecciona.** Hacer clic en «Confidencialidad» pone la tabla del §6 en esa dimensión (§6.2). El rótulo seleccionado va en color de marca con un marcador a la izquierda; los otros tres en tinta secundaria. Debajo de la figura, una línea lo explica: «Elegí una fila para ver la tabla por propietario en esa dimensión».

---

## 5 · Lo que la figura deja ver, y es el punto de la pantalla

No es decoración del requerimiento: es el criterio para saber si la pantalla sirve.

- **Si la marca del umbral de C está mucho a la izquierda de las otras dos**, el inventario es valioso por confidencialidad, y el plan de tratamiento debería estar cargado de controles de acceso y cifrado. Si está a la derecha, la organización se está protegiendo de lo que no la amenaza.
- **Si la fila del máximo está muy a la izquierda de las tres dimensiones**, casi ningún activo tiene dos dimensiones altas a la vez: los valores altos son puntuales. Si está pegada a la más alta de las tres, hay un grupo de activos críticos en varias dimensiones, y son los que primero hay que mirar.
- **Si «Sin valorar» no es cero en una dimensión**, hay activos que nadie terminó de valorar, y el número dice cuántos. Esa columna es la única de la matriz que mide trabajo pendiente en lugar de riesgo.

---

## 6 · Las dos tablas de detalle

Dos cortes del mismo inventario, y la diferencia entre ellos es de fondo: **el cargo dice quién responde por el activo, la persona dice quién lo tiene en la mano.** El esquema las separa a propósito (`Activo.propietarioId` → `CargoResponsable`, `Activo.personaId` → `Persona`, nota E9 del esquema) y la pantalla no las mezcla.

| | Tabla A | Tabla B |
|---|---|---|
| Fila | Propietario · un **cargo** | Custodio · una **persona** |
| Columnas | 6 niveles de la dimensión seleccionada | **4 criterios × 6 niveles** = 24 |
| Cubre | Todo el inventario vigente | **Solo los activos entregados a alguien** (§6.6) |
| Responde | Quién responde por lo valioso | Quién tiene en la mano lo valioso |

**Una sola pieza, parametrizada dos veces.** Las dos son la misma tabla: agrupador (cargo o persona) × criterios (uno o cuatro) × niveles. Construir dos componentes sería duplicar el tinte, el orden, los totales, la fila «sin asignar» y el contrato de clic — y ya son cinco cosas que tienen que comportarse igual. Se construye una y se la llama dos veces.

### 6.1 Tabla A · propietario (cargo) × nivel

| Propietario (cargo) | 0 | 1 | 2 | 3 | 4 | 5 | **Total** | **≥ 4** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gestión Tecnológica | 2 | 4 | 18 | 52 | 41 | 5 | **122** | **46** |
| CEO | 0 | 1 | 6 | 14 | 8 | 2 | **31** | **10** |
| … | | | | | | | | |
| *Sin propietario* | 0 | 0 | 1 | 5 | 3 | 0 | **9** | **3** |
| **Total** | 2 | 6 | 38 | 118 | 119 | 9 | **296** | **128** |

Las cifras del ejemplo son ilustrativas y su fila de totales es la misma que la fila del máximo en la matriz del §4.5.

**La fila es el propietario, y el propietario es un `CargoResponsable`, no una persona.** Es una decisión del esquema con una razón: el cargo dice quién responde por el activo en el organigrama y sobrevive a la rotación. Por eso el encabezado dice **«Propietario (cargo)»** y no «Responsable» — la pantalla no debe sugerir que ahí hay un nombre de persona.

Tres cosas de la fuente que la tabla tiene que aguantar:

1. **`propietarioId` es nulable.** El esquema lo permite a propósito: en la migración de los 234 activos la columna venía vacía. La carga V19 de REQ-SIG-12 la llena para los 296 (§4, columna 13: «0 vacíos»), pero la tabla **no puede asumirlo**. Los activos sin propietario van en una fila propia al final, rotulada **«Sin propietario»** en cursiva y tinta apagada, nunca omitida: un activo valioso sin dueño es justo lo que esta pantalla debe hacer visible.
2. **Nueve propietarios son roles genéricos** —«Cada usuario», «Cliente»— levantados como hallazgo H-19 en REQ-SIG-12 §6. Se muestran tal cual. No se agrupan ni se corrigen acá.
3. **`custodioId` tiene 18 vacíos** y **no es** lo que esta tabla resume. Ver D-2.

### 6.2 La tabla sigue a la dimensión seleccionada

Por defecto la tabla es sobre el **valor del activo (máximo)**. Al seleccionar una fila de la figura (§4.6), la tabla se recalcula sobre esa dimensión y su encabezado lo dice: **«Propietario × Confidencialidad»**. La columna «Sin valorar» aparece en la tabla solo cuando la dimensión seleccionada la tiene distinta de cero.

Es el patrón de una sola fila de filtro arriba que reescopa todo lo de abajo. **No** se pone un filtro propio dentro de la tarjeta de la tabla: la selección vive en un solo lugar y es la figura.

### 6.3 El tinte de las celdas

Cada celda lleva un **tinte suave del mismo azul, proporcional a su cuenta** dentro de la tabla — es un mapa de calor, y el tinte codifica magnitud, que es lo que un tinte puede codificar legítimamente.

Dos límites:

- **El tinte llega hasta el paso 2 de la rampa como máximo** (`#4874c2` al 18 % de opacidad para la celda más alta). Más oscuro que eso y el número deja de leerse sobre el fondo, y el número es el dato.
- **Celda en cero: sin tinte y sin `0`.** Se deja vacía. Una parrilla de seis columnas sembrada de ceros esconde las celdas que sí tienen algo.

Las columnas **Total** y **≥ 4** no llevan tinte: son otra magnitud y teñirlas las pondría a competir con la parrilla.

### 6.4 El clic · lo que pidió el requerimiento

Los destinos arrastran la dimensión seleccionada. Con «máximo» seleccionado no va parámetro `dimension`; con C, I o D seleccionada, sí. Y los tres tienen que dar **exactamente** el número que la celda muestra:

| Dónde se hace clic | Destino (con C seleccionada) |
|---|---|
| El nombre del propietario (fila) | `?propietario=Gestión+Tecnológica&dimension=C` |
| Una celda de la parrilla | `?propietario=Gestión+Tecnológica&dimension=C&valor=4` |
| El encabezado de una columna de nivel | `?dimension=C&valor=4` |
| La celda **≥ 4** de una fila | `?propietario=…&dimension=C&valorMinimo=4` |
| La fila *Sin propietario* | `?propietario=__sin__&dimension=C` |

Todos bajo `/sgsi/inventario`. Toda la fila es un objetivo de clic de 24 px de alto mínimo. El hover marca **la fila y la columna** —una guía cruzada tenue— porque en una parrilla de seis columnas el ojo pierde de qué nivel es la celda que está mirando.

**El número de la celda y el número de filas que aparecen en el inventario deben coincidir.** Es criterio de aceptación, y es lo que fuerza el §7.

### 6.5 Orden y totales

- Orden por defecto: **`≥ 4` descendente**, luego `Total` descendente. La pantalla es sobre valor, así que arriba va quien responde por más activos valiosos, no quien tiene más activos.
- Encabezados de columna cliqueables para reordenar. El orden **no** cambia colores: el tinte sigue a la cuenta, nunca al puesto en la lista.
- Fila de totales fija al pie (`sticky`), en negrita. Con «máximo» seleccionado, su total general es igual al de la fila del máximo en la matriz del §4.5 — mismo dato, dos formas.
- Sin paginación. Los propietarios son los cargos del catálogo: son unos pocos, no un listado.

### 6.6 Tabla B · lo primero, su alcance real

**La Tabla B no cubre el inventario. Cubre lo que está en manos de alguien, y hoy eso es una fracción pequeña.** Va primero porque una matriz de 24 columnas que arranca casi vacía, sin explicación, parece rota.

Tres hechos verificados:

1. **`Activo.personaId` no se carga desde ningún libro.** Existe en el esquema desde el 01/09/2026 con su relación `ActivoCustodioPersona`, y se escribe **de a un activo por vez** desde el popup de REQ-SIG-16. Ese mismo REQ lo dice en su cierre: el consolidado no trae a quién pertenece cada equipo, así que «cargar la pareja equipo↔persona desde un Excel es un requerimiento aparte».
2. **Solo se entregan ciertos subtipos.** El parámetro `equipos_subtipos_asignables` gobierna qué se puede poner en manos de una persona, y por REQ-SIG-16 §3 los códigos con abreviatura `EQU` suman **≈21** de los 296. Aun con todo asignado, la Tabla B no pasaría de ese orden de magnitud.
3. **La pantalla de Equipos ya cuenta los que están sin asignar** (`page.tsx:46`, `personaId: null`), lo que confirma que el estado normal hoy es nulo.

Por eso, **encima de la Tabla B va una línea de encuadre, no una nota al pie**:

```
21 de 296 activos están entregados a una persona.
Los otros 275 no tienen custodio persona asignado.        [ver en el inventario →]
```

Y **la Tabla B lista solo los activos con `personaId` no nulo**. No lleva fila «Sin asignar»: una fila con 275 activos aplastaría las otras y el tinte de las demás celdas se volvería invisible. El dato de los no asignados vive en la línea de encuadre, que es donde se puede leer.

Si el número de la izquierda es 0, la tabla no se dibuja: en su lugar queda la línea y el enlace. Una matriz de 24 columnas vacías no informa de nada.

### 6.7 Tabla B · la forma

Filas: la persona. Columnas: **cuatro grupos de seis**, más los totales.

| Persona | C · 0 1 2 3 4 5 | I · 0 1 2 3 4 5 | D · 0 1 2 3 4 5 | Valor final · 0 1 2 3 4 5 | Total | ≥ 4 |
|---|---|---|---|---|---:|---:|
| Juan Felipe Ruiz | · · 1 2 1 · | · · 2 2 · · | · 1 1 2 · · | · · 1 2 1 · | **4** | **1** |
| Albeiro Medina | · · · 2 1 · | · · 1 2 · · | · · 2 1 · · | · · · 2 1 · | **3** | **1** |
| … | | | | | | |
| **Total** | | | | | **21** | **6** |

Cifras ilustrativas. **«Valor final» es el nombre que se pidió para el máximo D·I·C**, y se usa tal cual en el encabezado: es el vocabulario del líder del SIG y no hay razón para traducirlo a «máximo» en la pantalla. En la matriz del §4.5, que es la del inventario completo, la misma fila se rotula «Valor del activo (máx D·I·C)»; el §13 le pide al desarrollador que las dos etiquetas convivan sin que nadie crea que son cosas distintas.

Lo que la forma exige:

- **Encabezado de dos pisos**: el grupo arriba (`C` · `I` · `D` · `Valor final`), el nivel abajo (`0`…`5`). Ambos pisos `sticky`.
- **Primera columna `sticky`** con el nombre. Es la única forma de leer 24 columnas sin perder de quién es la fila.
- **4 px de superficie entre grupos**, más que los 1 px entre columnas del mismo grupo. La separación entre grupos tiene que ser mayor que la de adentro, o los cuatro bloques se leen como veinticuatro columnas sueltas.
- **Ancho: 34 px por celda numérica.** 24 × 34 = 816 px, más 220 de nombre y 128 de los dos totales = **1 164 px**, que entra en un viewport de 1 280. Por debajo de eso, **scroll horizontal dentro de la tarjeta**, nunca en el cuerpo de la página.
- **Cifras con `tabular-nums`**: es una parrilla y las columnas se comparan verticalmente.
- **El tinte se escala dentro de cada grupo**, no sobre la tabla entera. Si se escalara global, el grupo con más activos se llevaría todo el rango y los otros tres quedarían planos. Los mismos dos límites del §6.3: tope en el paso 2 de la rampa, y celda en cero vacía sin `0`.
- **Guía cruzada en hover** sobre fila y columna, igual que la Tabla A. Con 24 columnas no es un lujo.

### 6.8 Tabla B · el clic

| Dónde se hace clic | Destino bajo `/sgsi/inventario` |
|---|---|
| El nombre de la persona | `?persona=jruiz@cuantico.co` |
| Una celda del grupo `C` | `?persona=jruiz@cuantico.co&dimension=C&valor=4` |
| Una celda del grupo `Valor final` | `?persona=jruiz@cuantico.co&valor=4` (sin `dimension`) |
| El encabezado de nivel de un grupo | `?dimension=C&valor=4&conPersona=1` |
| La celda `≥ 4` de una fila | `?persona=…&valorMinimo=4` |

El correo viaja codificado (`%40`). Es el identificador estable de la persona en todo el SIG —`Persona.correo` es único y `Persona.oid` no se expone en URLs— y REQ-SIG-14 ya lo usa como `learner_id` por la misma razón.

`conPersona=1` acota a los activos con `personaId` no nulo, que es lo que hace que el total de la columna cuadre con lo que muestra la tabla. Sin él, el encabezado de columna llevaría a todo el inventario y el número no coincidiría — el mismo defecto del §7.4, en otra puerta.

---

## 7 · Lo que hay que cambiar en el Inventario

**Esta es la parte del requerimiento que no es una página nueva, y sin ella lo que se pidió no funciona.** Cuatro defectos, verificados en el código de hoy.

### 7.1 El inventario no acepta filtros por URL

`InventarioActivos.tsx:215` arranca el estado en `FILTROS_VACIOS` y **no lee `useSearchParams` en ninguna parte**. Un enlace a `/sgsi/inventario?propietario=X` llega a la pantalla y la pantalla lo ignora: se ve el inventario completo.

**Cambio:** hidratar `Filtros` desde los parámetros de búsqueda en el primer render, y reflejar los cambios de filtro de vuelta en la URL (`router.replace`, sin apilar historial) para que la pantalla filtrada sea enlazable y sobreviva a un recargue. Un parámetro con un valor que no existe en el catálogo se ignora y se avisa; no se deja la pantalla vacía sin explicación.

### 7.2 No existe filtro por valor

`Filtros` es `{ tipo, subtipo, responsable, color }` (`:178`). El más cercano es `color` —`'Todos' | 'rojo' | 'verde' | 'blanco'`— que es la banda de riesgo, **no** el valor del activo. No hay forma de pedir «los de valor 4».

**Cambio:** agregar `valor` al tipo `Filtros`, con su control en la fila de filtros y su opción «Todos». Y `valorMinimo`, que es lo que la columna «≥ 4» necesita y no es lo mismo que `valor`.

### 7.3 No existe filtro por dimensión · nuevo en la v1.1

Con las cuatro pilas, un segmento ya no significa «valor del activo = 4» sino «valor **en confidencialidad** = 4». El inventario no sabe expresar eso.

**Cambio:** agregar `dimension` a `Filtros`, con valores `MAX` (por defecto) y el `codigo` de cada dimensión activa. Combinado con `valor` o `valorMinimo`, filtra sobre esa dimensión en lugar del máximo.

El dato **ya está en la pantalla**: `page.tsx:67` arma el mapa por dimensión de cada activo y el cliente lo usa. No hay consulta nueva; hay que leer del mapa la dimensión pedida en lugar del máximo. Y la grilla del inventario debería mostrar las tres columnas D/I/C cuando haya un filtro de dimensión activo, para que se vea contra qué se filtró.

### 7.4 «Responsable» mezcla propietario y custodio · el número no cuadraría

El defecto más silencioso de los cuatro. El filtro actual da por bueno un activo si **el propietario O el custodio** coinciden (`:298-300`):

```ts
filtros.responsable !== TODOS_RESPONSABLES &&
a.propietario !== filtros.responsable &&
a.custodio !== filtros.responsable
```

Y las opciones del desplegable se arman con los dos campos juntos (`:281-282`).

Si la celda de la tabla cuenta **por propietario** y el enlace usa `responsable`, el inventario mostraría **más filas de las que la celda dijo** —todos los activos donde ese cargo es custodio, aunque el propietario sea otro—. El usuario haría clic en un 41 y le aparecerían 63 activos. Nada fallaría; el número simplemente sería mentira.

**Cambio:** un parámetro **`propietario`** propio, que filtre solo por `Activo.propietarioId`. El filtro `responsable` de la interfaz **se queda como está** —es útil y alguien lo usa— y no se toca su semántica. Son dos preguntas distintas y ahora tienen dos nombres.

### 7.5 El inventario no conoce a la persona · nuevo en la v1.2

`ActivoVista` trae `propietario` y `custodio` —los dos cargos— y **no trae `persona`**. `app/sgsi/inventario/page.tsx` no la selecciona: `grep persona` sobre ese archivo no devuelve nada. Sin eso, la Tabla B puede pintar los números pero su clic no tiene a dónde llegar.

**Cambio:** agregar `persona: string | null` a `ActivoVista`, seleccionarla en el `include` del servidor —la relación `ActivoCustodioPersona` ya existe— y sumar dos filtros: **`persona`** (por nombre, o `__sin__` para los no asignados) y **`conPersona`** (`1` = solo los que tienen custodio persona). Y mostrar la columna en la grilla cuando el filtro esté activo, igual que con la dimensión.

Es el cambio más pequeño de los cinco y el que más fácil se olvida, porque la Tabla B se ve bien sin él: los números salen de la consulta de la página nueva. Lo que no funciona es el clic.

---

## 8 · Contrato de navegación

| Parámetro | Valores | Semántica |
|---|---|---|
| `dimension` | `MAX` (por defecto) · el `codigo` de una dimensión activa (`D`, `I`, `C`) | Contra qué se comparan `valor` y `valorMinimo`. Ausente = `MAX` |
| `valor` | `0`…`5` | Valor **exacto** en la dimensión pedida |
| `valorMinimo` | `0`…`5` | Valor **mayor o igual** en la dimensión pedida |
| `propietario` | nombre del `CargoResponsable`, o `__sin__` | Solo `propietarioId`. `__sin__` = nulo |
| `persona` | **correo** de la `Persona`, o `__sin__` | Solo `personaId` — el custodio **persona**, no el cargo. Viaja por correo y no por nombre porque `Persona.correo` es único y el nombre no lo es (§9) |
| `conPersona` | `1` | Acota a los activos con `personaId` no nulo. Es lo que hace cuadrar los encabezados de columna de la Tabla B |
| `responsable` | nombre del cargo | **Existente, sin cambios**: propietario O custodio |
| `tipo` · `subtipo` · `color` | existentes | Sin cambios |

Reglas: los parámetros se **acumulan** (`?propietario=X&dimension=C&valor=4` es la intersección); `valor` y `valorMinimo` juntos es una combinación inválida y gana `valor`, con aviso; `dimension` con un código que no existe o está inactivo se ignora y cae a `MAX`, con aviso; el nombre del cargo viaja codificado, no por id, porque `ActivoVista` ya trae el nombre y no el id, y meter ids en la URL obligaría a un viaje extra para resolverlos.

---

## 9 · Casos borde

| Caso | Qué hace la pantalla |
|---|---|
| Un activo **sin ninguna fila** en `ActivoValor` | Cuenta en «Sin valorar» en las cuatro filas. No se asume 0: no valorado y valorado en 0 son cosas distintas, y confundirlas infla el nivel más bajo con activos que nadie miró |
| Un activo valorado en **una o dos** dimensiones | Aporta a las filas que tiene y a «Sin valorar» en las que no. Su máximo se calcula **sobre las presentes** — es lo que hace `valorActivo` hoy si se le pasan menos de tres— y el tooltip de la fila del máximo dice cuántos de sus activos tienen valoración parcial |
| Empate en el máximo | Cuenta en cada dimensión empatada en la línea del §4.3, con la advertencia visible. Nunca se desempata por orden de catálogo |
| Activos **de baja** (`activo = false`) | Fuera de todo. La pantalla resume el inventario vigente |
| `cantidad > 1` en un activo | Cuenta como **un** activo. La pantalla cuenta registros del inventario, no unidades físicas; el rótulo dice «activos», no «equipos» |
| Inventario **vacío** | Ni figura ni tablas: una línea que dice que no hay activos vigentes y un enlace al inventario. No cuatro barras de ancho cero |
| Una **cuarta dimensión activa** (`A` o `T`) | Aparece una quinta pila y una quinta fila en la matriz. La pantalla itera sobre las dimensiones activas (§3) |
| Un propietario **sin ningún activo** | No aparece. La tabla lista los cargos que tienen activos, no el catálogo completo |
| **Ninguna persona** con activos asignados | La Tabla B no se dibuja: queda la línea de encuadre con el «0 de N» y el enlace (§6.6) |
| Una persona **inactiva** (`Persona.activa = false`) con activos en la mano | Aparece en la Tabla B, con su nombre en tinta apagada y la marca «inactiva». Es justo lo que hay que ver: equipo entregado a alguien que ya no está. Esconderla perdería el caso que REQ-SIG-16 llama, en su P17, «liberar el activo» |
| Dos personas **con el mismo nombre** | Las filas se distinguen por correo bajo el nombre, y el clic viaja por correo, no por nombre. `Persona.correo` es único; el nombre no |
| Todos los activos en un solo nivel | Cada pila es un segmento único. Sigue siendo correcta; las marcas de umbral que caigan en un extremo se omiten |

---

## 10 · Criterios de aceptación

Los conteos reales dependen de qué carga esté aplicada —234 activos migrados, o 296 con REQ-SIG-12—, así que los criterios son **invariantes**, no cifras. Cualquier número fijo en un test acá es un test que se rompe con la próxima carga.

1. En **cada** fila de la matriz, los seis niveles **más** «Sin valorar» suman exactamente el número de activos con `activo = true`. Cuatro filas, cuatro veces el mismo total.
2. La fila del máximo de la matriz **es igual** a los segmentos de la primera pila, y **es igual** a la fila de totales de la tabla por propietario cuando la selección es «máximo». Un mismo dato en tres lugares: si difieren, una de las tres consultas está mal.
3. **Monotonía del máximo:** para cada nivel `n`, el número de activos con máximo `≥ n` es **mayor o igual** que el de cualquier dimensión con valor `≥ n`. Es aritméticamente obligatorio y es la prueba más baratа de que el máximo está bien calculado.
4. La suma de cada fila de la tabla por propietario **es igual** a su columna `Total`; la suma de cada columna de nivel **es igual** a la fila de totales.
5. `≥ 4` de cada fila y de cada pila **es igual** a la suma de sus niveles `>= umbral_valoracion`, leído de `Parametro`. Cambiar el parámetro a `3` y recargar mueve las cifras y las cuatro marcas de umbral **sin tocar código**.
6. **Cuadre del clic**: para cada celda con cuenta `n > 0`, hacer clic y contar las filas del inventario da exactamente `n`. Probarlo en al menos una celda por propietario, y en al menos un segmento de cada una de las cuatro pilas.
7. `/sgsi/inventario?propietario=X&dimension=C&valor=4` abierto **directamente en el navegador** llega filtrado. Prueba la hidratación desde URL, no solo la navegación interna.
8. Seleccionar «Integridad» en la figura recalcula la tabla por propietario, cambia su encabezado, y sus totales pasan a coincidir con la fila de Integridad de la matriz.
9. Los activos sin propietario aparecen en la fila «Sin propietario» y su clic los muestra. Cero activos perdidos entre la tabla y el inventario.
10. `node scripts/validate_palette.js "<los seis pasos>" --mode light --surface "#ffffff" --ordinal` → **ALL CHECKS PASS**. Si se cambió un paso, se vuelve a correr.
11. Ninguna etiqueta de segmento recortada a media cifra en un viewport de 1280 px ni en uno de 1440 px, con las cuatro pilas visibles sin scroll horizontal.
12. **Tabla B · cuadre interno.** Cada uno de los cuatro grupos suma, por fila, el mismo `Total`: los cuatro criterios describen los mismos activos de esa persona. Si un grupo suma distinto, hay activos con valoración parcial y **falta la columna «Sin valorar» de ese grupo**.
13. **Tabla B · cuadre con el encuadre.** El total general de la Tabla B es igual al número de la izquierda de la línea de encuadre («21 de 296»), y ese número es igual a `count(activo where activo and persona_id is not null)`.
14. **Tabla B con cero personas asignadas** no dibuja una matriz vacía: muestra la línea de encuadre y el enlace (§6.6). Es el estado más probable el primer día, así que se prueba primero.
15. La pantalla **no escribe nada**. `select count(*)` sobre `activo`, `activo_valor` y `parametro` antes y después de visitarla da lo mismo, y no aparece ninguna fila en `Bitacora`.

---

## 11 · Decisiones

- **D-1 · pilas, no barras sueltas ni mapa de calor.** El análisis completo está en §4.1. En una línea: el mapa de calor pierde la proporción y no admite el corte del umbral; las barras agrupadas rompen el todo; el 100 % apilado esconde que las dimensiones tienen distinto número de activos valorados.
- **D-2 · la tabla es por propietario, no por custodio.** El propietario es quien responde por el valor del activo; el custodio es quien lo tiene en la mano. La pantalla es sobre valor. Además `custodioId` trae 18 vacíos contra 0 del propietario, así que una tabla por custodio arrancaría con una fila «sin asignar» grande y sin significado. Una segunda pestaña por custodio es una extensión natural y **no entra** en este REQ.
- **D-3 · «Sin valorar» es una columna, no un cero.** Cuesta una columna y evita el error de leer «tenemos 40 activos irrelevantes» cuando lo que hay son 40 activos que nadie valoró.
- **D-4 · el filtro `responsable` no se toca.** Se agrega `propietario` en paralelo. Cambiarle la semántica al que existe arreglaría el cuadre y rompería en silencio a quien lo esté usando hoy.
- **D-5 · escala absoluta compartida, no normalizada.** Las cuatro pilas comparten un eje de conteo. Cuesta que las barras no terminen parejas y gana que el largo signifique algo.
- **D-6 · la figura es el selector.** El rótulo de fila selecciona la dimensión y reescopa la tabla; no hay un segundo control. Una fila de filtro, y está arriba de todo lo que reescopa.
- **D-8 · la Tabla B lista solo lo asignado, y lo dice arriba.** Sin fila «Sin asignar»: con ~275 activos sin custodio persona, esa fila aplastaría a las demás y dejaría el tinte de todas las otras celdas invisible. El dato de los no asignados va en la línea de encuadre, con enlace. Es lo contrario de lo que se decidió para «Sin propietario» en la Tabla A (D-3), y la razón es la proporción: allá son 9 de 296, acá serían 275 de 296.
- **D-9 · «Valor final» se llama así en la Tabla B.** Es el término que usó quien pidió la pantalla y designa lo mismo que «Valor del activo (máx D·I·C)» del §4.5. Se conservan las dos etiquetas en sus dos contextos en vez de imponer una: la del §4 explica la aritmética porque ahí es donde se descompone; la de la Tabla B es corta porque encabeza un grupo de seis columnas y no hay lugar. El §13 le pide al desarrollador que el tooltip de la Tabla B diga la fórmula, para que nadie las crea distintas.
- **D-7 · el empate no se desempata.** Un activo con máximo empatado cuenta en cada dimensión empatada, y la pantalla advierte que por eso las cifras no suman. Elegir una dimensión por orden de catálogo inventaría una jerarquía entre C, I y D que la metodología no tiene. **Queda abierta** una sola cosa: si el líder del SIG prefiere además una cuenta de «activos cuyo máximo lo determina una sola dimensión», que sí suma, se agrega como cuarta cifra.

---

## 12 · Lo que no entra

- **Ninguna tabla ni columna nueva en el esquema.** La página agrega lo que ya está; el valor sigue siendo derivado.
- **Ninguna escritura.** No se valora desde acá: eso es la ficha del activo.
- **La segunda pestaña por custodio** — D-2.
- **El cruce propietario × los cuatro criterios × nivel** en la Tabla A. La Tabla A sigue a la dimensión seleccionada y con eso alcanza: son ~10 cargos y cambiar de dimensión es un clic. La Tabla B sí lleva los cuatro criterios de una porque son ~21 activos y ahí la pregunta es el retrato completo de cada persona, no la comparación entre cargos. **Si más adelante se quiere la A también con los cuatro grupos, la pieza ya está parametrizada para eso** (§6) y es un cambio de argumento, no de componente.
- **Cargar la pareja equipo↔persona desde un Excel.** REQ-SIG-16 ya lo dejó anotado como requerimiento aparte, y sin él la Tabla B se llena de a un activo por vez. Esta pantalla no acelera esa carga: la hace visible.
- **La evolución en el tiempo.** «Cómo cambió la valoración desde la línea base» necesita `LineaBase`, es otra pregunta y es otro requerimiento.
- **Exportación.** El inventario ya exporta a Excel y esta pantalla lleva a él en un clic. Si después se pide, el camino es `app/api/sgsi/exportar-activos`, que ya existe.
- **Tocar el filtro `color`.** Es banda de riesgo y no tiene nada que ver con esto, por parecido que suene.

---

## 13 · Resumen para el desarrollador

- **Cuatro pilas, una matriz, dos tablas y cinco arreglos en el inventario.** Si solo construís la página, el clic no filtra y el requerimiento no está cumplido: leé el §7 antes de empezar.
- **Las dos tablas son un solo componente llamado dos veces.** Agrupador × criterios × niveles. Si te salen dos componentes, el tinte y el cuadre van a divergir.
- **Empezá la Tabla B por el caso vacío.** Hoy casi ningún activo tiene custodio persona: `personaId` se escribe de a uno desde el popup de REQ-SIG-16 y solo para los subtipos entregables (≈21 de 296). El primer día la matriz va a estar casi vacía y eso es correcto — la línea de encuadre del §6.6 es la que tiene que explicarlo.
- **«Valor final» y «Valor del activo (máx D·I·C)» son lo mismo.** Dos etiquetas por contexto, decisión D-9. Que el tooltip de ese grupo en la Tabla B diga la fórmula.
- **El repo ya tiene `echarts` y `echarts-for-react`.** No agregues otra librería de gráficos. Y mirá `RadarCapacidades.tsx`, que es el único SVG a mano del módulo, antes de decidir cuál de las dos vías usás.
- **El valor es `max(D,I,C)`** y ya está escrito en `lib/sgsi/formulas.ts:38`. No lo vuelvas a implementar y no lo guardes en una columna.
- **Iterá sobre las dimensiones activas, no sobre tres constantes.** `Dimension` admite cinco y hoy hay tres sembradas.
- **El umbral se lee de `Parametro.umbral_valoracion`.** Cambiarlo a 3 tiene que mover las cuatro marcas sin recompilar.
- **La rampa está validada y es una sola para las cuatro pilas.** `--hf-brand-100` no sirve como paso claro: falla el contraste contra el blanco a 1.12:1.
- **El número de la celda tiene que ser el número de filas del inventario.** Es el criterio 6 y es la razón de que exista `propietario` aparte de `responsable`.
- **Las tres cifras de «qué dimensión manda» no suman el total, y eso está bien.** Los empates son la norma. La advertencia va en pantalla, no en un comentario del código.
- **Nada de verde ni rojo.** Un activo de valor 5 es valioso, no malo.

---

## 14 · Anexo · el match cargo → persona

La Tabla B necesita saber **qué persona está detrás de cada cargo responsable**. Este anexo lo resuelve con datos, no de memoria, y deja aislado lo que falta decidir.

**Fuentes cruzadas:** los responsables reales salen de `FOR-SIG-12 Consolidado de Activos de Información V19.xlsx`, hoja «Matriz de Activos», columnas 12 (Custodio) y 13 (Propietario del activo), sobre los **299 activos con código válido**. Los nombres salen de `01. Organigrama/2. 2026/1. Organigrama Cuantico V2.0.pptx`, diapositiva 3, que es la única versión del organigrama que lleva nombres. La confirmación de ocho cargos la dio el líder del SIG el 2026-09-09.

### 14.1 Los responsables reales, con su volumen

| Cargo en V19 | Propietario de | Custodio de | Persona | Fuente |
|---|---:|---:|---|---|
| **Chief Operating Officer** | **143** | — | Laura Agudelo | confirmado · organigrama |
| **Operations & Services Manager** | 15 | **203** | **⚠ en duda** | ver D-10 |
| Líder del SIG | 33 | 7 | Katherine Quiroga | confirmado |
| Finance and Administrative Manager | 32 | 19 | Albeiro Medina | confirmado |
| CEO | 26 | 4 | Daniel Medina | confirmado · organigrama |
| Chief Commercial Officer | 25 | 6 | Lina Medina | confirmado · organigrama |
| Chief Legal Officer | 14 | 17 | Marcela Molina | confirmado · organigrama |
| **Architecture and Technology Manager** | — | **17** | **⚠ en duda** | ver D-10 |
| Project Manager | — | 5 | Mario Hernández | **solo organigrama** |
| Data Analytics Manager | — | 2 | Marcela Morales | **solo organigrama** |
| Quality Analyst | 1 | 1 | Katherine Quiroga | confirmado |
| *Cada usuario* | 8 | — | **no es un cargo** | H-19 · ver D-11 |
| *External Legal Counsel* | 1 | — | **externo, sin nombre** | ver D-11 |
| *Cliente* | 1 | — | **no es de la organización** | H-19 · ver D-11 |
| *(vacío)* | 0 | 18 | — | permitido por el esquema |

**Cobertura: 273 de 299 activos** quedan con persona resuelta por propietario. Los 26 restantes son las cuatro filas marcadas.

### 14.2 D-10 · la duda que más pesa · **abierta**

**Entre «Operations & Services Manager» y «Architecture and Technology Manager» se juega el custodio de 220 de los 299 activos — el 74 % del inventario.** Es la única duda que, mal resuelta, misatribuye la mayoría de la Tabla B.

Las dos fuentes no dicen lo mismo:

| Fuente | Operations & Services Manager | Architecture and Technology Manager |
|---|---|---|
| Organigrama V2.0, diapositiva 3 | **Yuliet Rojas** | **Jhon Tamayo** |
| Confirmación del 2026-09-09 | — | «Technology manager: **Yulieth Rojas**» |

Tres lecturas posibles y hay que elegir una:

1. **Yuliet Rojas sigue en Operations & Services Manager** y «Technology manager» fue una forma corta de nombrar ese cargo. Entonces Jhon Tamayo sigue en Architecture and Technology y no hay conflicto.
2. **Yulieth Rojas pasó a Architecture and Technology Manager** y el organigrama V2.0 está desactualizado. Entonces hay que decir quién quedó en Operations & Services, que es el custodio de 203 activos.
3. Son **dos personas distintas** y la coincidencia de apellido confundió el mensaje. El organigrama tiene además a **Huberney Rojas** como Information Security Officer: hay tres apellidos Rojas en juego.

**Ojo con la grafía.** El organigrama escribe «Yuliet» y la confirmación «Yulieth». El match de la Tabla B viaja por `Persona.correo` (§8), así que la grafía del nombre no rompe el enlace — pero sí decide **a qué fila del Directorio** apunta, y ahí una letra importa.

### 14.3 D-11 · los tres responsables que no son personas · **abierta**

Diez activos tienen como propietario algo que no es una persona de la organización:

| Valor | Activos | Qué es | Propuesta |
|---|---:|---|---|
| «Cada usuario» | 8 | Los 34 colaboradores a la vez | **No se resuelve a una persona.** Estos 8 son justamente los que hay que entregar de a uno con el popup de REQ-SIG-16, y entonces su `personaId` los pone en la Tabla B solos |
| «External Legal Counsel» | 1 | Abogado externo. El organigrama lo lista **sin nombre** | Sin `Persona`: no tiene cuenta del Directorio y `Persona.oid` es obligatorio. Va como `Proveedor` u `Organizacion`, no como persona |
| «Cliente» | 1 | Un tercero | Igual que el anterior |

Los tres estaban ya levantados como hallazgo **H-19 de REQ-SIG-12 §6** («propietario como rol genérico»), que pedía mapearlos al `CargoResponsable` correspondiente. Este anexo dice que **dos de los tres no tienen cargo al que mapear**, y ese es el dato nuevo.

### 14.4 D-12 · dos cargos que el organigrama nombra y nadie confirmó · **abierta**

**Project Manager** (custodio de 5) → Mario Hernández, y **Data Analytics Manager** (custodio de 2) → Marcela Morales. Los dos salen del organigrama y **no** de la confirmación del líder del SIG. Son siete activos: poco volumen, pero un sí o un no cuesta lo mismo que dejarlos en duda.

### 14.5 Defectos del catálogo de cargos, para el desarrollador

El catálogo de la aplicación (`prisma/data/listas.json`, `cargosResponsables`, 11 valores) **no coincide con lo que V19 usa**, y el importador resuelve el cargo por nombre:

| Problema | Detalle |
|---|---|
| **Nombre distinto para el mismo cargo** | El catálogo dice **«Architecture Manager»**; V19 y el organigrama dicen **«Architecture and Technology Manager»**. Sin unificar, esos 17 custodios no resuelven |
| **Cuatro cargos de V19 no están en el catálogo** | `Project Manager` · `Data Analytics Manager` · `Quality Analyst` · `External Legal Counsel` |
| **Dos entradas del catálogo son áreas, no cargos** | «Gestión Tecnológica» y «Talento Humano» están en `cargosResponsables` y no nombran a ninguna persona. V19 no las usa |
| **«Por asignar»** | Existe en el catálogo y V19 no lo usa: los sin custodio vienen vacíos (18), no rotulados |

Es el mismo aviso que ya trae el prompt de arranque del paquete —«antes de poblar, unifica el catálogo de cargos: hay cargos escritos de dos y tres formas distintas»— con los nombres concretos.

### 14.6 Lo que este anexo NO decide

- **No asigna `personaId` a ningún activo.** El match cargo → persona sirve para leer la Tabla A con nombres al lado del cargo; `Activo.personaId` sigue escribiéndose de a uno desde REQ-SIG-16 (§6.6). Son dos cosas: quién ocupa el cargo, y a quién se le entregó el equipo.
- **No crea un campo nuevo.** `CargoResponsable` no gana una columna «persona actual»: quién ocupa un cargo ya vive en `Persona.cargoId`, y derivarlo de ahí es lo correcto —cuando alguien cambia de puesto, el match se mueve solo—. La pantalla lo resuelve al leer.
- **No toca el organigrama.** Si D-10 se resuelve por la lectura 2, el que está desactualizado es el `.pptx` de OneDrive y eso se corrige del lado de quien especifica.
