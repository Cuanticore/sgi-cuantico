# Requerimiento · Página de Valoración de Activos

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-18 · valoración de activos |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-09 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo (ejecución asistida con Claude Code) |
| **Ruta nueva** | `/sgsi/valoracion` |
| **Toca además** | `app/components/sgsi/inventario/InventarioActivos.tsx` y `app/sgsi/inventario/page.tsx` (§6 · **sin esto la navegación pedida no existe**) |
| **Estado** | D-1 a D-4 cerradas · listo para ejecutar |

---

## 1 · Objetivo

Una pantalla que responda de un golpe **cuánto vale el inventario y quién responde por lo que más vale**, y que desde ahí lleve al activo concreto en dos clics.

Hoy esa pregunta no se puede contestar. El inventario lista y filtra, pero no agrega: para saber cuántos activos llegan al umbral hay que contarlos a ojo, y para saber de quién son hay que filtrar propietario por propietario. La ficha del activo muestra su valoración; nadie muestra la del conjunto.

Dos piezas, y una condición:

- **La pila** — cuántos activos hay en cada nivel de valor, y dónde corta el umbral.
- **La tabla** — propietario × nivel, con la cuenta en cada celda.
- **La condición** — que un clic en una celda abra el inventario ya filtrado por ese propietario y ese valor. Eso **no se puede hacer hoy** y es el §6.

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

## 3 · La cifra que la página resume

Antes del diseño, la aritmética, porque de ella dependen las dos piezas.

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
| Dimensiones | `Dimension` | D · I · C (el esquema admite A y T; hoy se usan tres) |
| Umbral | `Parametro.umbral_valoracion` | **4** — «un activo entra al análisis si su valor lo alcanza» (`prisma/seeds/escalas.ts:141`) |
| Propietario | `Activo.propietarioId` → `CargoResponsable` | Es un **cargo**, no una persona (§5.1) |

**El umbral se lee de la base, no se escribe en el código.** Es el invariante 4 del paquete y acá importa doble: si mañana pasa a 3, la pila y los totales tienen que moverse solos.

---

## 4 · La pila

### 4.1 La forma, y por qué esta

**Una sola barra apilada horizontal**, el inventario completo, seis segmentos ordenados de `5` a `0`, cada uno proporcional a su cuenta.

Es la forma correcta para la pregunta porque el valor es una **escala ordenada con un corte que significa algo**: lo que el lector necesita ver no es «cuál nivel tiene más» —eso lo daría un gráfico de barras— sino **qué proporción del inventario cae del lado que entra al análisis**. La pila muestra composición y el corte se dibuja encima.

Encima de la barra, tres cifras (fila de KPI, no gráfico):

```
296 activos    ·    128 alcanzan el umbral (43 %)    ·    9 en «5 — Muy Alto»
```

Las cifras son ilustrativas y cuadran con la tabla del §5.1 a propósito, para que se vea que las dos piezas leen el mismo dato. Las reales salen de la consulta.

La del medio es la que manda: va en tamaño de figura protagonista (≥ 32 px, la misma sans del resto, cifras proporcionales — **no** `tabular-nums`, que a ese tamaño deja los dígitos flojos).

### 4.2 La rampa · validada, no elegida a ojo

El nivel de valor es una escala **ordinal**, así que la rampa es de **un solo tono, claro → oscuro**. Un arcoíris de seis colores acá sería un error de tipo: gastaría el único canal libre en información que la longitud del segmento ya da, y además ninguna de las paletas categóricas sobrevive a seis clases adyacentes.

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

**Los tres pasos oscuros son los tokens de marca tal cual**; solo los tres claros se interpolaron. Y hay una razón para no haber usado `--hf-brand-100` (`#e9f0fb`) como el paso más claro, que era lo natural: **el validador lo rechazó a 1.12:1 contra el blanco**. El segmento del valor 0 habría sido invisible sobre la superficie. Si el desarrollador cambia un paso, tiene que volver a correr el validador; el criterio de aceptación 8 lo exige.

**Sin rampa oscura.** `app/globals.css` no declara `prefers-color-scheme` ni `[data-theme]`: la app es de un solo modo y esta página no introduce el segundo.

**Verde y rojo no se usan acá.** El verde está reservado para estado bueno —madurez L4-L5, riesgo bajo— y un activo de valor 5 no es «malo», es valioso. Pintarlo de rojo diría lo que la metodología no dice.

### 4.3 La marca

- **2 px de superficie entre segmentos**, no un borde. Un borde alrededor de cada relleno engorda la barra y ensucia el corte.
- Altura de la barra **28 px**. Delgada: los bloques gruesos y saturados leen fuerte y esta barra es el resumen, no el protagonista.
- **Esquinas de 4 px solo en los dos segmentos de los extremos**, del lado de afuera. Los interiores van rectos.
- **Etiqueta dentro del segmento solo si cabe con aire.** Si no cabe, va fuera del extremo, y si tampoco, queda en el tooltip y en la vista de tabla. Un número recortado a media cifra es peor que ninguno.
- **Leyenda de escala** obligatoria: seis muestras con su etiqueta, en orden `5` → `0`. Es una escala, no una serie: el texto va en tinta de texto, nunca en el color del segmento.
- **Tooltip por segmento**, con hit area de 24 px mínimo incluyendo los 2 px de separación: nivel, etiqueta, cuenta, porcentaje, y si entra al análisis.
- El tooltip **nunca es el único camino al dato**: la tabla del §5 y su fila de totales son la vista de tabla equivalente.

### 4.4 El corte del umbral

Una **regla vertical sólida** (hairline, no punteada) en la frontera entre el segmento del valor 4 y el del 3, con etiqueta al pie:

```
umbral 4 · a la izquierda entra al análisis
```

Se dibuja **en la frontera de segmentos, no en un porcentaje fijo**: la posición se calcula de la suma de los segmentos ≥ 4. Si el umbral pasa a 3, la regla se mueve sola.

Si el umbral cae en un extremo —ningún activo lo alcanza, o todos— la regla no se dibuja y en su lugar va la frase, para no pintar una línea pegada al borde que parezca parte del marco.

### 4.5 El clic

Cada segmento navega al inventario filtrado por ese valor:

```
/sgsi/inventario?valor=4
```

El cursor es de puntero y el segmento se aclara un paso al pasar por encima. El foco de teclado muestra lo mismo que el hover y `Enter` navega: los seis segmentos son tabulables.

---

## 5 · La tabla propietario × nivel

### 5.1 Filas y columnas

| | 5 | 4 | 3 | 2 | 1 | 0 | **Total** | **≥ umbral** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| CEO | 2 | 8 | 14 | 6 | 1 | 0 | **31** | **10** |
| Gestión Tecnológica | 5 | 41 | 52 | 18 | 4 | 2 | **122** | **46** |
| … | | | | | | | | |
| **Sin propietario** | 0 | 3 | 5 | 1 | 0 | 0 | **9** | **3** |
| **Total** | 9 | 119 | 122 | 38 | 6 | 2 | **296** | **128** |

Las cifras del ejemplo son ilustrativas; las reales salen de la consulta.

**La fila es el propietario, y el propietario es un `CargoResponsable`, no una persona.** Es una decisión del esquema con una razón: el cargo dice quién responde por el activo en el organigrama y sobrevive a la rotación. Por eso el encabezado de la columna dice **«Propietario (cargo)»** y no «Responsable» — la pantalla no debe sugerir que ahí hay un nombre de persona.

Tres cosas de la fuente que la tabla tiene que aguantar:

1. **`propietarioId` es nulable.** El esquema lo permite a propósito: en la migración de los 234 activos la columna venía vacía. La carga V19 de REQ-SIG-12 la llena para los 296 (§4, columna 13: «0 vacíos»), pero la tabla **no puede asumirlo**. Los activos sin propietario van en una fila propia al final, rotulada **«Sin propietario»** en cursiva y tinta apagada, nunca omitida: un activo valioso sin dueño es justo lo que esta pantalla debe hacer visible.
2. **Nueve propietarios son roles genéricos** —«Cada usuario», «Cliente»— levantados como hallazgo H-19 en REQ-SIG-12 §6. Se muestran tal cual. No se agrupan ni se corrigen acá.
3. **`custodioId` tiene 18 vacíos** y **no es** lo que esta tabla resume. Ver D-2.

### 5.2 El tinte de las celdas

Cada celda lleva un **tinte suave del mismo azul, proporcional a su cuenta** dentro de la tabla — es un mapa de calor, y el tinte codifica magnitud, que es lo que un tinte puede codificar legítimamente.

Dos límites:

- **El tinte llega hasta el paso 2 de la rampa como máximo** (`#4874c2` al 18 % de opacidad para la celda más alta). Más oscuro que eso y el número deja de leerse sobre el fondo, y el número es el dato.
- **Celda en cero: sin tinte y sin `0`.** Se deja vacía. Una parrilla de seis columnas sembrada de ceros esconde las celdas que sí tienen algo.

Las columnas **Total** y **≥ umbral** no llevan tinte: son otra magnitud y teñirlas las pondría a competir con la parrilla.

### 5.3 El clic · lo que pidió el requerimiento

Tres destinos distintos, y los tres tienen que dar **exactamente** el número que la celda muestra:

| Dónde se hace clic | Destino |
|---|---|
| El nombre del propietario (fila) | `/sgsi/inventario?propietario=Gestión+Tecnológica` |
| Una celda de la parrilla | `/sgsi/inventario?propietario=Gestión+Tecnológica&valor=4` |
| El encabezado de una columna de nivel | `/sgsi/inventario?valor=4` |
| La celda de **≥ umbral** de una fila | `/sgsi/inventario?propietario=…&valorMinimo=4` |
| La fila **Sin propietario** | `/sgsi/inventario?propietario=__sin__` |

Toda la fila es un objetivo de clic de 24 px de alto mínimo. El estado de hover marca **la fila y la columna** —una guía cruzada tenue— porque en una parrilla de seis columnas el ojo pierde de qué nivel es la celda que está mirando.

**El número de la celda y el número de filas que aparecen en el inventario deben coincidir.** Es criterio de aceptación, y es lo que fuerza el §6.

### 5.4 Orden y totales

- Orden por defecto: **`≥ umbral` descendente**, luego `Total` descendente. La pantalla es sobre valor, así que arriba va quien responde por más activos valiosos, no quien tiene más activos.
- Encabezados de columna cliqueables para reordenar. El orden **no** cambia colores: el tinte sigue a la cuenta, nunca al puesto en la lista.
- Fila de totales fija al pie (`sticky`), en negrita. Su total general tiene que ser igual al total de la pila del §4 — mismo dato, dos formas.
- Sin paginación. Los propietarios son los cargos del catálogo: son unos pocos, no un listado.

---

## 6 · Lo que hay que cambiar en el Inventario

**Esta es la parte del requerimiento que no es una página nueva, y sin ella lo que se pidió no funciona.** Tres defectos, verificados en el código de hoy.

### 6.1 El inventario no acepta filtros por URL

`InventarioActivos.tsx:215` arranca el estado en `FILTROS_VACIOS` y **no lee `useSearchParams` en ninguna parte**. Un enlace a `/sgsi/inventario?propietario=X` llega a la pantalla y la pantalla lo ignora: se ve el inventario completo.

**Cambio:** hidratar `Filtros` desde los parámetros de búsqueda en el primer render, y reflejar los cambios de filtro de vuelta en la URL (`router.replace`, sin apilar historial) para que la pantalla filtrada sea enlazable y sobreviva a un recargue. Un parámetro con un valor que no existe en el catálogo se ignora y se avisa; no se deja la pantalla vacía sin explicación.

### 6.2 No existe filtro por valor

`Filtros` es `{ tipo, subtipo, responsable, color }` (`:178`). El más cercano es `color` —`'Todos' | 'rojo' | 'verde' | 'blanco'`— que es la banda de riesgo, **no** el valor del activo. No hay forma de pedir «los de valor 4».

**Cambio:** agregar `valor` al tipo `Filtros`, con su control en la fila de filtros y su opción «Todos». El cálculo del máximo ya está hecho en la pantalla: `page.tsx:67` arma el mapa por dimensión y el cliente lo usa. Y agregar `valorMinimo`, que es lo que la columna «≥ umbral» necesita y no es lo mismo que `valor`.

### 6.3 «Responsable» mezcla propietario y custodio · el número no cuadraría

El defecto más silencioso de los tres. El filtro actual da por bueno un activo si **el propietario O el custodio** coinciden (`:298-300`):

```ts
filtros.responsable !== TODOS_RESPONSABLES &&
a.propietario !== filtros.responsable &&
a.custodio !== filtros.responsable
```

Y las opciones del desplegable se arman con los dos campos juntos (`:281-282`).

Si la celda de la tabla cuenta **por propietario** y el enlace usa `responsable`, el inventario mostraría **más filas de las que la celda dijo** —todos los activos donde ese cargo es custodio, aunque el propietario sea otro—. El usuario haría clic en un 41 y le aparecerían 63 activos. Nada fallaría; el número simplemente sería mentira.

**Cambio:** un parámetro **`propietario`** propio, que filtre solo por `Activo.propietarioId`. El filtro `responsable` de la interfaz **se queda como está** —es útil y alguien lo usa— y no se toca su semántica. Son dos preguntas distintas y ahora tienen dos nombres.

---

## 7 · Contrato de navegación

| Parámetro | Valores | Semántica |
|---|---|---|
| `valor` | `0`…`5` | Valor derivado **exacto** = `max(D,I,C)` |
| `valorMinimo` | `0`…`5` | Valor derivado **mayor o igual** |
| `propietario` | nombre del `CargoResponsable`, o `__sin__` | Solo `propietarioId`. `__sin__` = nulo |
| `responsable` | nombre del cargo | **Existente, sin cambios**: propietario O custodio |
| `tipo` · `subtipo` · `color` | existentes | Sin cambios |

Reglas: los parámetros se **acumulan** (`?propietario=X&valor=4` es la intersección); `valor` y `valorMinimo` juntos es una combinación inválida y gana `valor`, con aviso; el nombre del cargo viaja codificado, no por id, porque `ActivoVista` ya trae el nombre y no el id, y meter ids en la URL obligaría a un viaje extra para resolverlos.

---

## 8 · Casos borde

| Caso | Qué hace la pantalla |
|---|---|
| Un activo **sin ninguna fila** en `ActivoValor` | Cuenta en una columna aparte, **«Sin valorar»**, a la izquierda del `5`. No se asume 0: no valorado y valorado en 0 son cosas distintas, y confundirlas infla el nivel más bajo con activos que nadie miró |
| Un activo valorado en **una o dos** dimensiones | El máximo se calcula sobre las presentes. Se marca en el tooltip de la celda: «3 de estos 8 tienen valoración parcial» |
| Activos **de baja** (`activo = false`) | Fuera de la pila y de la tabla. La pantalla resume el inventario vigente |
| `cantidad > 1` en un activo | Cuenta como **un** activo. La pantalla cuenta registros del inventario, no unidades físicas; el rótulo dice «activos», no «equipos» |
| Inventario **vacío** | Ni pila ni tabla: una línea que dice que no hay activos vigentes y un enlace al inventario. No una barra de ancho cero |
| Un propietario **sin ningún activo** | No aparece. La tabla lista los cargos que tienen activos, no el catálogo completo |
| Todos los activos en un solo nivel | La pila es un segmento único. Sigue siendo correcta; la regla del umbral se omite (§4.4) |

---

## 9 · Criterios de aceptación

Los conteos reales dependen de qué carga esté aplicada —234 activos migrados, o 296 con REQ-SIG-12—, así que los criterios son **invariantes**, no cifras. Cualquier número fijo en un test acá es un test que se rompe con la próxima carga.

1. Los seis segmentos de la pila, **más** la columna «Sin valorar» cuando exista, suman exactamente el número de activos con `activo = true`. Ni uno de más ni de menos.
2. El total general de la tabla **es igual** al total de la pila. Mismo dato, dos formas: si difieren, una de las dos consultas está mal.
3. La suma de cada fila **es igual** a su columna `Total`; la suma de cada columna de nivel **es igual** a la fila de totales.
4. `≥ umbral` de cada fila **es igual** a la suma de sus columnas de nivel `>= umbral_valoracion`, leído de `Parametro`. Cambiar el parámetro a `3` y recargar mueve la cifra y la regla vertical **sin tocar código**.
5. **Cuadre del clic**: para cada celda con cuenta `n > 0`, hacer clic y contar las filas del inventario da exactamente `n`. Es el criterio que prueba el §6 completo; probarlo en al menos una celda por propietario.
6. `/sgsi/inventario?propietario=X&valor=4` abierto **directamente en el navegador** (sin pasar por la página nueva) llega filtrado. Prueba la hidratación desde URL, no solo la navegación interna.
7. Los activos sin propietario aparecen en la fila «Sin propietario» y su clic los muestra. Cero activos perdidos entre la tabla y el inventario.
8. `node scripts/validate_palette.js "<los seis pasos>" --mode light --surface "#ffffff" --ordinal` → **ALL CHECKS PASS**. Si se cambió un paso, se vuelve a correr.
9. Ninguna etiqueta de segmento recortada a media cifra en un viewport de 1280 px ni en uno de 1440 px.
10. La pantalla **no escribe nada**. `select count(*)` sobre `activo`, `activo_valor` y `parametro` antes y después de visitarla da lo mismo, y no aparece ninguna fila en `Bitacora`.

---

## 10 · Decisiones

- **D-1 · pila, no barras.** Se especifica una barra apilada y no seis barras sueltas. La pregunta de la pantalla es qué proporción del inventario cruza el umbral, y eso es composición. **Considerada y descartada:** la barra apilada divergente centrada en el umbral, que es la forma canónica para una escala ordenada con un corte. Es mejor gráfico y peor decisión acá: exige dos tonos opuestos y un neutro al medio, y esta app tiene el verde reservado para estado bueno. Se revisará si la lectura del corte resulta pobre en uso.
- **D-2 · la tabla es por propietario, no por custodio.** El propietario es quien responde por el valor del activo; el custodio es quien lo tiene en la mano. La pantalla es sobre valor. Además `custodioId` trae 18 vacíos contra 0 del propietario, así que una tabla por custodio arrancaría con una fila «sin asignar» grande y sin significado. Una segunda pestaña por custodio es una extensión natural y **no entra** en este REQ.
- **D-3 · «Sin valorar» es una columna, no un cero.** Cuesta una columna y evita el error de leer «tenemos 40 activos irrelevantes» cuando lo que hay son 40 activos que nadie valoró.
- **D-4 · el filtro `responsable` no se toca.** Se agrega `propietario` en paralelo. Cambiarle la semántica al que existe arreglaría el cuadre y rompería en silencio a quien lo esté usando hoy.

---

## 11 · Lo que no entra

- **Ninguna tabla ni columna nueva en el esquema.** La página agrega lo que ya está; el valor sigue siendo derivado.
- **Ninguna escritura.** No se valora desde acá: eso es la ficha del activo.
- **La segunda pestaña por custodio** — D-2.
- **La evolución en el tiempo.** «Cómo cambió la valoración desde la línea base» necesita `LineaBase`, es otra pregunta y es otro requerimiento.
- **Exportación.** El inventario ya exporta a Excel y esta pantalla lleva a él en un clic. Si después se pide, el camino es `app/api/sgsi/exportar-activos`, que ya existe.
- **Tocar el filtro `color`.** Es banda de riesgo y no tiene nada que ver con esto, por parecido que suene.

---

## 12 · Resumen para el desarrollador

- **Dos piezas nuevas y tres arreglos en el inventario.** Si solo construís la página, el clic no filtra y el requerimiento no está cumplido: leé el §6 antes de empezar.
- **El valor es `max(D,I,C)`** y ya está escrito en `lib/sgsi/formulas.ts:38`. No lo vuelvas a implementar y no lo guardes en una columna.
- **El umbral se lee de `Parametro.umbral_valoracion`.** Cambiarlo a 3 tiene que mover la pantalla sin recompilar.
- **La rampa está validada; los tres pasos oscuros son los tokens de marca.** `--hf-brand-100` no sirve como paso claro: falla el contraste contra el blanco a 1.12:1.
- **El número de la celda tiene que ser el número de filas del inventario.** Es el criterio 5 y es la razón de que exista el parámetro `propietario` aparte de `responsable`.
- **Nada de verde ni rojo.** Un activo de valor 5 es valioso, no malo.
