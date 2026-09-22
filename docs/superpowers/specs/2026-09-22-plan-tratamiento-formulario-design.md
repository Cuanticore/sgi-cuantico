# El formulario del plan de tratamiento, administrable de un vistazo — Especificación y diseño

**Fecha:** 2026-09-22
**Código:** PLA-SIG-02 · pantalla «Planes de tratamiento», popup de edición
**Versión:** 1.0
**Módulo:** SGSI — Tratamiento del riesgo
**Afecta:** `app/components/sgsi/planes/PopupAccion.tsx`, `app/components/sgsi/Popup.tsx`
**Estado:** Diseñado, sin implementar

---

## 1. Qué se pide y por qué

Editar un plan de tratamiento hoy es desplazarse. El popup mide 820 px de ancho y su cuerpo se
topa en 61vh, así que de los trece campos se ven siete y los seis restantes quedan por debajo del
borde. Quien administra el plan —que es quien pone el estado, mueve el avance y anota lo que pasó—
tiene que bajar para encontrar precisamente los campos que vino a tocar.

Y el campo donde se escribe lo que pasó, **Observaciones, es el más pequeño del formulario**: un
`<input>` de una sola línea, compartiendo renglón con «Recursos o presupuesto», al final de todo.
Un campo de una línea no es un lugar donde alguien escriba el seguimiento de una acción que dura
seis meses.

Dos cosas, entonces:

1. **Que el formulario entre de una**, sin desplazamiento, en una pantalla normal.
2. **Que Observaciones sea grande de verdad** —y que ese mismo campo se reuse tal cual en el
   popup de creación de planes que viene después, y no se vuelva a describir allá.

---

## 2. Lo que el sistema tiene hoy

Verificado sobre el código antes de diseñar.

### 2.1 La carcasa es compartida por ocho popups

`app/components/sgsi/Popup.tsx` es la carcasa única: overlay, tarjeta blanca, encabezado con ×,
cuerpo con desplazamiento y pie de botones. La usan **ocho** pantallas:

| Popup | Archivo |
|---|---|
| Controles de una amenaza | `activos/PopupControlesAmenaza.tsx` |
| Plan desde residual crítico | `activos/PopupPlanCritico.tsx` |
| Control y madurez | `controles/PopupControl.tsx` |
| Importación de inventario | `inventario/PopupImportacion.tsx` |
| Catálogo de parámetros | `parametros/PopupCatalogo.tsx` |
| **Acción del plan** | `planes/PopupAccion.tsx` |
| Planes de un activo | `valoracion-riesgos/PopupPlanesActivo.tsx` |
| Persona | `sig/personas/PopupPersona.tsx` |

El **ancho ya es un parámetro** (`ancho: number`, `Popup.tsx:22`), y cada pantalla pasa el suyo.
El **alto no lo es**: `maxHeight: '61vh'` está escrito fijo en `Popup.tsx:86`, y el margen vertical
del overlay también —`py-[78px]`, línea 55—.

Esa asimetría es el obstáculo real. Agrandar este formulario a lo ancho no toca a nadie más;
agrandarlo a lo alto obliga a tocar la carcasa que comparten los ocho.

### 2.2 Trece campos en siete renglones

`PopupAccion.tsx:217-449`, en orden:

| Renglón | Campos | Alto aprox. |
|---|---|---|
| 1 | Acción (`textarea`, 2 filas, ancho completo) | 71 px |
| 2 | Tipo de tratamiento · Control asociado | 50 px |
| 3 | Origen y justificación (`textarea`, 3 filas, ancho completo) | 109 px |
| 4 | Responsable · Propietario que aprueba | 76 px |
| 5 | Estado · Fecha objetivo · Avance | 50 px |
| 6 | Verificación de eficacia · Madurez alcanzada | 50 px |
| 7 | **Recursos o presupuesto · Observaciones** (los dos, `<input>` de una línea) | 50 px |

Más los bloques condicionales de *Transferir* (instrumento, riesgo remanente) y *Aceptar*
(justificación, fecha de revisión), que aparecen entre el renglón 6 y el 7 cuando el tipo lo pide.

Con los separadores, el cuerpo mide unos **550 px** — y el tope de 61vh en una pantalla de 1080
deja ver unos 460. De ahí el desplazamiento de la captura.

### 2.3 `observacion` ya soporta lo que le pidamos

`AccionPlan.observacion` es `String?` en el esquema (`prisma/schema.prisma:1024`), que Prisma
mapea a `TEXT` en Postgres. **No hace falta migración**: lo que impide escribir varias líneas hoy
no es la base, es que el control de la interfaz sea un `<input>`, que descarta los saltos de línea
antes de que lleguen a la acción de servidor.

---

## 3. Decisiones, y qué se descartó

Las tres se tomaron viendo maquetas, no describiéndolas.

### 3.1 Observaciones va alto en el propio formulario · **no** hay editor aparte

Se descartó un editor a pantalla completa invocado con un botón ⤢, y se descartó también la
combinación de las dos cosas. El campo crece donde está.

**Qué significa entonces «invocable desde otro popup»:** que el campo, con su tamaño y su
ubicación, es el mismo en el popup de creación de planes (punto 3 del pedido) — no que exista un
componente-editor que se abra por encima. La reutilización es del bloque de campo, no de un modal.

### 3.2 1040 px de ancho × 80vh de alto · **no** dos paneles

Se descartó «más ancho, mismo alto» —seguía habiendo desplazamiento— y se descartó una hoja de
1320 px a dos paneles, con Observaciones ocupando una columna entera de alto completo. La razón de
descartar la segunda no fue técnica: **rompía con la forma de los otros siete popups**, y la
consistencia de la carcasa vale más que el alto extra.

### 3.3 Los campos cortos se agrupan de a cinco

Con 1040 px de ancho caben cinco campos cortos en un renglón. Es lo que libera los dos renglones
que Observaciones necesita.

---

## 4. El diseño

### 4.1 `Popup.tsx` gana un alto opcional

```ts
/// Tope del cuerpo antes de que aparezca el desplazamiento. Por defecto 61vh, que es lo que
/// tenían los ocho popups antes de que esto fuera un parámetro.
alto?: string;
```

Tres reglas:

1. **Sin `alto`, nada cambia.** El valor por defecto es `'61vh'` y los siete popups restantes
   siguen viéndose exactamente igual. Esto es una invariante que se prueba, no una intención.
2. **Con `alto`, el margen del overlay cede.** `py-[78px]` arriba y abajo son 156 px que, sumados
   a un cuerpo de 80vh, no caben en la ventana de una pantalla de 1080. Cuando llega `alto`, el
   margen baja a 48 px.
3. **El tope real es el menor de los dos:** `min(<alto>, calc(100vh - 216px))`, donde 216 px son
   los 96 del margen más los ~120 del encabezado y el pie. Así la tarjeta **no puede** desbordar
   la pantalla por muy alto que se le pida, que es el modo en que un popup se vuelve inusable: el
   botón de guardar por debajo del borde y sin forma de llegar a él.

### 4.2 `PopupAccion` pasa a 1040 × 80vh y se reagrupa

Seis bloques en vez de siete:

| Bloque | Campos |
|---|---|
| 1 | Acción — ancho completo |
| 2 | Tipo de tratamiento · Control asociado · **Estado** |
| 3 | Origen y justificación — ancho completo |
| 4 | Responsable de la ejecución · Propietario del riesgo que aprueba |
| 5 | Fecha objetivo · Avance · Verificación de eficacia · Madurez alcanzada · Recursos |
| 6 | **Observaciones** — ancho completo, 10 filas |

**Estado sube al bloque 2** porque es, junto con el avance, lo que más se toca al administrar un
plan; tenerlo en el quinto renglón obligaba a bajar para la operación más frecuente.

**El bloque 5 es responsivo.** Cinco columnas sólo a partir de `xl` (1280 px de ventana); entre
1024 y 1280 son tres, y por debajo, dos. El popup nunca mide más que la ventana, así que atarlo al
ancho de la ventana es correcto aunque el tope sea el de la tarjeta.

Los bloques condicionales de *Transferir* y *Aceptar* **no se mueven ni se reagrupan**: siguen
entrando entre el 5 y el 6, y cuando aparecen vuelve el desplazamiento. Es lo correcto — son
campos que ISO/IEC 27001 6.1.3 exige y que el guardado rechaza si faltan; esconderlos para ganar
alto sería esconder justamente lo obligatorio.

### 4.3 Observaciones deja de ser una línea

`<input>` → `<textarea rows={10}>`, a ancho completo, último bloque del formulario.

El cambio no es cosmético: **un `<input>` descarta los saltos de línea**. Hoy, pegar en ese campo
el seguimiento de tres reuniones lo deja todo en un párrafo corrido. Con `textarea` los saltos
llegan a `guardarAccion` y de ahí a una columna `TEXT` que ya los admite.

`Recursos o presupuesto` se queda como `<input>` de una línea y se muda al bloque 5: es un monto o
una referencia, no una narrativa.

### 4.4 Lo que esto deja listo para el punto 3

El popup de creación de planes sin activo —el siguiente spec— reusa los bloques 1 a 6 tal cual, sin
el pie de «dar de baja» y sin los campos de seguimiento que no aplican a un plan recién nacido
(avance, verificación, madurez alcanzada). **Este spec no lo construye ni lo diseña**; sólo deja
dicho que el orden de los campos y el tamaño de Observaciones son los de acá, para que no se
vuelvan a decidir allá y terminen distintos.

---

## 5. Lo que NO entra

- **No hay migración.** `observacion` ya es `TEXT`.
- **No cambia la acción de servidor.** `guardarAccion` y `DatosAccion` quedan como están: reciben
  `observacion: string | null` y eso no se altera.
- **No se toca el resto de la pantalla** `/sgsi/planes`: ni la grilla, ni los KPI, ni el tablero.
- **No se tocan los otros siete popups.** Si alguno cambia de aspecto, es un defecto de esta
  entrega, y hay una prueba que lo detecta.
- **No se agregan campos** al formulario.

---

## 6. Pruebas · Regla 1 del harness

Cada una se escribe y **se ve en rojo** antes del código que la pone en verde.

| # | Qué prueba | Por qué falla hoy |
|---|---|---|
| P1 | `Popup` sin `alto` deja el cuerpo en `61vh` | Es la invariante de los siete popups que no deben cambiar. Falla hoy porque la prop no existe. |
| P2 | `Popup` con `alto` lo aplica al cuerpo | La prop no existe. |
| P3 | `Popup` con `alto` no deja que la tarjeta desborde: el tope es `min(alto, calc(100vh - 216px))` | El tope no existe; hoy es `61vh` fijo. |
| P4 | `Popup` con `alto` reduce el margen del overlay a 48 px | Hoy es `py-[78px]` siempre. |
| P5 | Observaciones en `PopupAccion` es un campo de varias líneas (`textarea`) | Hoy es `<input>`: el elemento es otro. |
| P6 | Un texto con saltos de línea escrito en Observaciones llega **con los saltos** a `guardarAccion` | Hoy el `<input>` los descarta. Es el defecto real, y P5 sin P6 sólo probaría el nombre de la etiqueta. |
| P7 | `Estado` se renderiza antes que `Origen y justificación` en el orden del documento | Hoy Estado está después. Prueba el reagrupamiento sin atarse a píxeles. |

P6 es la que importa. P5 puede pasar con un `textarea` de una fila que igual sirva de poco; P6
falla si el dato no sobrevive el viaje.

**Lo que estas pruebas no ven:** que el formulario efectivamente entre sin desplazamiento. Eso
depende del alto real de las fuentes y de la ventana, y jsdom no mide nada. Es exactamente por eso
que existe la sección 7 — y los números de la sección 4.1 son estimaciones que hay que confirmar
contra la pantalla real, no medidas.

---

## 7. Recorrido de punta a punta · Regla 3 del harness

Aplica: es una pantalla que una persona opera. Se ejecuta a mano contra la base real y se escribe
en el PR paso por paso.

```
Recorrido a ejecutar (PT-013, pantalla de 1920×1080):
  1. Abrir /sgsi/planes                    -> la grilla, 19 acciones
  2. Clic en el lápiz de PT-013            -> el popup abre a 1040 px
  3. Sin tocar la rueda del ratón          -> se ven los 13 campos y los dos botones del pie
  4. Escribir tres líneas en Observaciones -> el campo las muestra como tres líneas
  5. Guardar la acción                     -> «Guardada», el popup cierra
  6. Reabrir PT-013                        -> las tres líneas están, con sus saltos
  7. Cambiar el tipo a «Transferir»        -> salen instrumento y remanente; vuelve el scroll
  8. Abrir el popup de un control          -> sigue viéndose igual que antes del cambio
```

El paso 8 no es de cortesía: es la comprobación de que tocar la carcasa compartida no arrastró a
los otros siete popups, y es lo que P1 prueba en unidad y acá se confirma con los ojos.

---

## 8. Riesgos

**Los números de alto son estimaciones.** 550 px de cuerpo actual, 216 px de descuento, 10 filas
de Observaciones: todo eso sale de contar `line-height` y relleno sobre el código, no de medir la
pantalla. Si al ejecutar el paso 3 del recorrido queda desplazamiento, lo que se ajusta son las
filas de Observaciones —de 10 a 8—, nunca el tope de la carcasa, que está puesto para que la
tarjeta no desborde.

**El bloque de cinco columnas en pantallas de 1366×768.** Ahí la ventana está por debajo de `xl`,
así que salen tres columnas y el formulario crece de alto justo donde hay menos alto disponible.
El cuerpo vuelve a desplazarse. Es aceptable —ese tamaño no es donde se administra el SGSI— pero
hay que verlo antes de mergear y decirlo en el PR.

**Un popup más alto tapa más pantalla.** Con 80vh y el margen de 48 px, del contenido de atrás
queda muy poco a la vista. No hay forma de tener las dos cosas; se eligió el formulario.
