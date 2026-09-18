# Un paquete SCORM propio corriendo en el SIG — Especificación y diseño

**Fecha:** 2026-09-18
**Código:** REQ-SIG-24 · player SCORM · paquete `gestionar-leads`
**Versión:** 1.0
**Módulo:** F — Formación
**Afecta:** `lib/sig/scorm-modelo.ts`, `lib/sig/scorm-manifiesto.ts`,
`app/scorm/archivo/[paqueteId]/[...ruta]/route.ts`, y el paquete `gestionar-leads` (fuera del repo)
**Estado:** Diseñado; pendiente de implementar

---

## 1. Qué se pide y por qué

Que el SIG pueda ejecutar **cursos propios**, no sólo despachos de Coursebox: almacenar su
progreso y sus resultados, y distinguir con qué clase de paquete está tratando.

El caso concreto que lo motiva es `gestionar-leads` — «Dynamics 365 Contact Center · Módulo 1 ·
Gestionar clientes potenciales»: un video, siete capturas y un cuestionario de cinco preguntas
con 80 % de aprobación.

La diferencia de fondo contra lo que hay hoy:

> Un despacho de Coursebox **no reporta nada por SCORM**. Corre en un iframe del tercero y nunca
> llama a la API, así que el player jamás recibe el «terminó» y la asignación no cierra sola. Por
> eso existe `declararCursoTerminado` ([`app/mi-sig/acciones/curso.ts:423-432`][decl]): la persona
> aprieta «terminé» y **el SIG le cree**, dejándolo anotado como AUTODECLARACIÓN.
>
> Un paquete propio sí llama a la API. No hay nada que creerle: reporta avance, nota y
> completitud, y la asignación **cierra sola** con evidencia medida.

[decl]: ../../../app/mi-sig/acciones/curso.ts

---

## 2. Lo que el sistema tiene hoy

Verificado sobre el código antes de diseñar.

### 2.1 El player es 2004, y rechaza 1.2 a propósito

`lib/sig/scorm-manifiesto.ts:32` sólo acepta `2004 2nd/3rd/4th Edition`. El rechazo de 1.2 está
argumentado en el propio mensaje: *«SCORM 1.2 usa otro modelo de datos (cmi.core.\*) y otra API:
agregarlo "de paso" es la vía rápida a un player que cumple mal los dos»*
(`scorm-manifiesto.ts:167-176`).

La arquitectura, para ubicarse:

```
app (sesión, base)          origen de contenido (sin sesión)
──────────────────          ────────────────────────────────
Player.client.tsx  ──postMessage──▶  /scorm/runner  ──iframe──▶  el SCO
  abrirIntento                        expone API_1484_11          index.html
  guardarIntento                      valida en memoria
```

`scorm-modelo.ts` es puro y **corre en los dos lados**: el runner valida en el navegador para
poder responderle al curso de forma síncrona, y el servidor valida otra vez antes de persistir.

### 2.2 El paquete está en 1.2 y no entra

| | |
|---|---|
| `schemaversion` | `1.2` → **rechazado al subir** |
| API que busca | `window.API` + `LMSInitialize/LMSGetValue/LMSSetValue/LMSCommit/LMSFinish` |
| Lo que escribe | `cmi.core.score.raw/min/max`, `cmi.core.lesson_status`, `cmi.core.session_time`, `cmi.interactions.n.*` (variante 1.2) |
| Nota mínima | `adlcp:masteryscore` = 80, en el manifiesto |
| SCO | uno solo, `index.html` |
| Archivos | 15 · 3,1 MB · incluye `video/01-gestionar-leads.mp4` (2,2 MB) |

Y **no reporta avance**: `index.html` llama a `SCORM.marcarVisto()` al cargar y nada más hasta el
cuestionario. SCORM 1.2 tampoco tiene dónde ponerlo — `cmi.progress_measure` nació en 2004.

### 2.3 El modelo 2004 tiene un hueco: no se puede guardar la respuesta correcta

`cmi.interactions.n.correct_responses.n.pattern` **no está en la tabla de elementos**
(`scorm-modelo.ts:147-163`: está `correct_responses._count`, pero no el `pattern`). Tampoco
`cmi.interactions.n.objectives.n.id`. Ningún test los toca.

Consecuencia hoy, para **cualquier** paquete 2004:

1. `definicionDe()` devuelve `null` → el runner le responde **401 · Undefined Data Model Element**;
2. el servidor además descarta el valor en el filtro de `guardarIntento`
   (`app/mi-sig/acciones/curso.ts:277-283`, que conserva sólo lo que `validarEscritura` acepta).

Se guarda **qué respondió la persona** y **si acertó**, pero no **cuál era la correcta**. El
detalle por pregunta queda a medias justo en el dato que lo hace revisable por un tercero.

No es un defecto introducido por este trabajo: es un hueco preexistente que este paquete destapa,
porque su `registrarInteraccion` escribe ese campo hoy.

### 2.4 El servidor de archivos no responde peticiones `Range`

`app/scorm/archivo/[paqueteId]/[...ruta]/route.ts:40-60` responde siempre `200` con el buffer
entero y sin `Accept-Ranges`. Hasta hoy daba igual: ningún paquete traía video.

Con el `.mp4` de 2,2 MB significa que **no se puede adelantar ni retroceder**, y Safari —que exige
`Range` para `<video>`— no reproduce en absoluto.

Hay un segundo problema en la misma línea, y es el que más importa: la consulta hace
`select: { bytes: true }`, es decir **trae el blob completo de Postgres a memoria** en cada
petición. Con el techo de paquete en 200 MB (`SCORM_TAMANO_MAX_MB`), un curso con video largo
carga ese archivo entero por cada petición de rango. Es la misma forma del `rowCount` inflado que
`HARNESS.md` documenta como la primera cicatriz: *«el proceso moría por falta de memoria»*.

### 2.5 Un hipervínculo hace que el paquete se clasifique como DESPACHO

`index.html:45` enlaza a `https://org8fcf0faf.crm3.dynamics.com/main.aspx?...` — un
`<a target="_blank">` a la lista de leads, para que la persona practique en el sistema real.

`dominiosDe()` (`scorm-manifiesto.ts:76-79`) busca `https?://` en el HTML del SCO y sus scripts
locales sin distinguir **qué hace** cada URL. Encuentra el enlace, así que
`clase = dominios.length > 0 ? 'DESPACHO' : 'AUTOCONTENIDO'` (`scorm-manifiesto.ts:241`) devuelve
**DESPACHO**. Y entonces, en cada apertura, `abrirIntento` escribe en la bitácora
(`app/mi-sig/acciones/curso.ts:185-196`):

> `datos_a_tercero` · «correo y nombre → org8fcf0faf.crm3.dynamics.com»

**Eso no ocurre.** El SCO no transmite el correo ni el nombre a Dynamics; hay un enlace que la
persona puede clicar o no, y si lo clica va con su propia sesión de Microsoft. El registro P20
existe para responder *«¿a quién le compartimos los datos de nuestros colaboradores?»*, y una
entrada falsa ahí es peor que ninguna: contamina la única lista que alguien consultaría.

De paso, la CSP le abre ese dominio en `script-src`, `connect-src`, `frame-src` y cuatro
directivas más (`cspDelPaquete`, `scorm-origen.ts`), sin que nada lo necesite.

Es **el mismo defecto que el filtro de `NAMESPACES` ya previene** unas líneas más arriba, con las
mismas palabras (`scorm-manifiesto.ts:55-57`):

> *«Sin este filtro, un paquete con un SVG inline o un comentario que cite el esquema se
> clasificaría como "DESPACHO que comparte correo y nombre con w3.org". Eso es una afirmación
> falsa ante un auditor, y además le abre el dominio en la CSP.»*

Se pensó en los namespaces XML. No se pensó en los hipervínculos.

### 2.6 Lo que ya funciona y no hay que tocar

Verificado, porque determina cuánto NO hay que construir:

| Capacidad | Dónde | Estado |
|---|---|---|
| Porcentaje de avance | `formacion.ts:77-78` lee `progressMeasure` y lo pinta | **Listo.** Sólo falta que un paquete lo reporte |
| Reanudar donde quedó | `modeloInicial` + `cmi.location`/`suspend_data` | Listo |
| Cierre automático con nota | `veredictoDelIntento` → `RegistroRealizado` → `Asignacion.REALIZADA` | Listo |
| Historial de intentos | `IntentoScorm`, sin sobreescritura | Listo |
| Modo repaso sin escribir | `soloLectura` / `mode=review` (P12) | Listo |
| Autoguardado cada 60 s | `Player.client.tsx` | Listo |
| Versión del paquete congelada | `IntentoScorm.paqueteId` apunta al ejecutado, no al vigente | Listo |

---

## 3. La decisión: migrar el paquete, no el player

### 3.1 Alternativas consideradas

**(a) Soportar SCORM 1.2 en el player.** Un `scorm-modelo-12.ts` hermano del de 2004, con su
propia tabla de elementos, sus once códigos de error, su formato de duración `HHHH:MM:SS.SS`, y
una proyección pura que lleve `lesson_status` a los dos campos de 2004.

Descartada. **Aunque se implementara sin un solo defecto, el porcentaje de avance seguiría sin
existir**: SCORM 1.2 no tiene `progress_measure`. Se habría pagado un módulo entero, una función
de traducción y sus pruebas, para terminar con una barra que dice «el curso no reporta avance».

**(b) Soportar 1.2 con una convención privada para el avance** — el curso escribe `n/N` en
`cmi.core.lesson_location` y el SIG lo lee sólo si casa con esa forma exacta. Funciona, y es
honesta (si no casa, no se afirma nada). Pero obliga a editar el paquete **igual que la migración**,
y deja una convención que ningún otro LMS entiende.

**(c) Migrar el paquete a SCORM 2004 4th Edition.** ← **elegida**

Si hay que editar el paquete de todos modos, migrarlo cuesta lo mismo que inventarle una
convención, y a cambio:

- el avance sale **gratis**, por el campo que el estándar creó para eso;
- **completó** y **aprobó** dejan de compartir casillero — en 1.2, `lesson_status` mete
  «vio el curso entero y reprobó» y «lo dejó a mitad» en el mismo campo. Para un registro de
  formación del SGSI, poder afirmar esas dos cosas por separado no es un lujo;
- la nota viene normalizada (`cmi.score.scaled`), sin que el LMS tenga que adivinar la escala;
- `suspend_data` pasa de 4 096 a 64 000 caracteres.

**El soporte de 1.2 queda fuera del alcance, y el rechazo de `scorm-manifiesto.ts:167-176` se
queda tal cual.** Deja de ser una limitación pendiente y pasa a ser una posición sostenida.

### 3.2 Qué queda por construir

Tres cosas, y dos de ellas son defectos preexistentes que este paquete destapa:

| | Qué | Por qué entra acá |
|---|---|---|
| **A** | Migrar `gestionar-leads` a 2004 4th Edition | Es el pedido |
| **B** | `correct_responses.n.pattern` y `objectives.n.id` en el modelo 2004 | Sin esto la migración **pierde** datos que el paquete sí manda (§2.3) |
| **C** | `Range` en el servidor de archivos | Sin esto el video no se puede adelantar y Safari no lo reproduce (§2.4) |
| **D** | `dominiosDe` distingue hipervínculo de carga de recurso | Sin esto el paquete se clasifica DESPACHO y la bitácora afirma algo falso (§2.5) |

---

## 4. Diseño

### 4.A · Migración del paquete a SCORM 2004 4th Edition

Trabajo sobre el paquete, **fuera del repositorio** (ver §7). Cuatro archivos; los siete PNG, el
`.mp4` y `estilos.css` no se tocan.

#### `imsmanifest.xml`

```xml
<manifest identifier="MANIFIESTO-D365-CC-M1" version="1.0"
          xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
          xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"
          xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"
          xmlns:imsss="http://www.imsglobal.org/xsd/imsss">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
  </metadata>
  ...
  <resource identifier="RES-M1" type="webcontent" adlcp:scormType="sco" href="index.html">
```

Tres detalles que, si se erran, el paquete se rechaza o se clasifica mal:

1. **`<schemaversion>` tiene que decir `2004 4th Edition` exacto.** `EDICIONES_SOPORTADAS`
   (`scorm-manifiesto.ts:32`) compara la cadena completa, sin normalizar.
2. `adlcp:scormType` con **T mayúscula** (en 1.2 era `scormtype`). El analizador no lo lee hoy,
   pero un paquete mal formado ahí falla en cualquier otro LMS.
3. **`adlcp:masteryscore` desaparece y no se reemplaza.** En 2004 vive en la secuenciación
   (`imsss:minNormalizedMeasure`), y no se incluye: la nota de aprobación del SIG la fija
   `notaMinima` del contenido (P15), no el autor del curso. El curso conserva su propio `MINIMO`
   de 80 para decidir qué le muestra a la persona.

> **Ojo operativo:** si `notaMinima` del contenido en el SIG y el `MINIMO` del cuestionario no
> coinciden, el curso puede felicitar a alguien que el SIG reprueba. **Hay que publicarlos
> iguales.** El SIG manda.

#### `scorm-api.js`

| 1.2 | 2004 |
|---|---|
| `window.API` | `window.API_1484_11` |
| `LMSInitialize` / `LMSFinish` | `Initialize` / `Terminate` |
| `LMSGetValue` / `LMSSetValue` / `LMSCommit` | `GetValue` / `SetValue` / `Commit` |
| `LMSGetLastError` / `LMSGetErrorString` / `LMSGetDiagnostic` | sin el prefijo `LMS` |
| `cmi.core.lesson_status` (uno) | `cmi.completion_status` + `cmi.success_status` (dos) |
| `cmi.core.score.raw/min/max` | ídem, **más** `cmi.score.scaled` (−1 a 1) |
| `cmi.core.session_time` = `HHHH:MM:SS.SS` | `cmi.session_time` = **ISO 8601** (`PT4M12S`) |
| `cmi.core.lesson_location` | `cmi.location` |
| `interactions.n.student_response` | `interactions.n.learner_response` |
| `interactions.n.time` = `HH:MM:SS.SS` | `interactions.n.timestamp` = ISO 8601 **completo** (`2026-09-18T14:23:05`) |
| `interactions.n.latency` = `HHHH:MM:SS.SS` | ídem, **ISO 8601** (`PT12S`) |

La búsqueda de la API por la jerarquía de `window.parent` se conserva tal cual: es correcta y es
lo que permite que el SCO alcance el runner dos niveles arriba.

`marcarVisto()` deja de existir en su forma actual. En 1.2 tenía que leer `lesson_status` para no
degradar un `passed` previo a `incomplete`; en 2004 los campos están separados y escribir
`cmi.completion_status = 'incomplete'` no toca el `success_status`. El problema se disuelve.

#### El bloqueante: las dos páginas son UN SOLO SCO

El curso son dos páginas —`index.html` y `cuestionario.html`— que se cargan en **el mismo
iframe**. El runner vive en el iframe **padre** y no se recarga al navegar entre ellas, así que
`sesion.current` sobrevive a la navegación (`Runner.client.tsx:44`).

`scorm-api.js` llama hoy a `SCORM.terminar()` en `beforeunload`. La secuencia que produce:

| | Qué pasa |
|---|---|
| 1 | `index.html` → `Initialize` → `iniciado = true` |
| 2 | La persona pulsa «Continuar a la evaluación» → `beforeunload` → **`Terminate`** → `terminado = true` (`Runner.client.tsx:80-87`), y un commit **final** |
| 3 | `cuestionario.html` → `Initialize` → **104 · Content Instance Terminated** (`validarInitialize`, `scorm-modelo.ts:200-204`) |
| 4 | Cada `SetValue` del cuestionario → **133 · Store Data After Termination** |

**La evaluación no reporta nada**: ni nota, ni completitud, ni las cinco interacciones. Y peor: el
commit final del paso 2 corre `veredictoDelIntento` con `completion_status = incomplete`, que
devuelve `registrar: false` — el intento queda terminado, sin registro y sin nota.

Esto ocurre **hoy**, con el paquete en 1.2, y seguiría ocurriendo en 2004 si sólo se tradujera la
API. No es un defecto del player: un SCO que llama `Terminate` al navegar internamente está
diciéndole al LMS que acabó. El player le cree, que es lo correcto.

La regla, y es la que ordena los tres archivos:

> **`Terminate` lo llama el SCO UNA vez, cuando de verdad acabó.** `beforeunload` sólo hace
> `Commit`. La única llamada a `Terminate` vive en `cuestionario.html`, después de reportar el
> resultado.

Y como cada página llama a `Initialize` al cargar, la segunda recibe **103 · Already Initialized**.
No es un error que haya que sortear: es el estándar diciendo «esta sesión ya está abierta», que es
exactamente lo que queremos. El shim lo trata como éxito.

Si la persona abandona a mitad de la lección y cierra la pestaña, nunca hay `Terminate`: el
`pagehide` del runner hace un commit no final (`Runner.client.tsx:182-186`), el intento queda
`EN_CURSO` con su avance, y `trabajos-scorm.ts` lo recoge como abandonado si se queda colgado. Es
el comportamiento diseñado, y con esto se preserva.

#### `index.html` — acá está el avance

**Corrección sobre una lectura apresurada:** `<nav class="pasos">` **no** es un navegador de pasos;
es el pie con el enlace a la evaluación. Los pasos son **siete `<h2>`** en una sola página que se
recorre con scroll (`index.html:36,51,55,65,78,81,86`). El avance no sale de un índice: sale de
**hasta dónde llegó la persona**.

Un `IntersectionObserver` sobre los siete `<h2>`, con marca de agua que nunca baja —volver a subir
no deshace lo leído—, sobre ocho unidades (siete pasos + el cuestionario):

```js
var TOTAL = 8;
var alcanzado = 0;

function reportarAvance(unidad) {
  if (unidad <= alcanzado) return;          // marca de agua: nunca retrocede
  alcanzado = unidad;
  SCORM.guardar('cmi.progress_measure', alcanzado / TOTAL);   // 0–1
  SCORM.guardar('cmi.location', String(alcanzado));           // para reanudar
  SCORM.persistir();
}
```

Y al abrir, si `cmi.entry === 'resume'`, se lee `cmi.location` y se hace `scrollIntoView` sobre ese
`<h2>`.

Con eso `guardarIntento` escribe la columna `progressMeasure`, y `progresoDeCurso`
(`formacion.ts:77-78`) pinta «Va por el 43 %». **Cero líneas nuevas en el SIG.**

#### `cuestionario.html`

Al calificar, en vez de un único `lesson_status`:

```js
SCORM.guardar('cmi.completion_status', 'completed');            // vio el curso entero
SCORM.guardar('cmi.success_status', aprobo ? 'passed' : 'failed');
SCORM.guardar('cmi.score.scaled', puntaje / 100);               // 0–1
SCORM.guardar('cmi.score.raw',  puntaje);
SCORM.guardar('cmi.score.min', 0);
SCORM.guardar('cmi.score.max', 100);
SCORM.guardar('cmi.progress_measure', 1);
SCORM.guardar('cmi.exit', 'normal');
```

Y **acá, y sólo acá, se llama `Terminate`** — después de registrar las cinco interacciones y el
resultado. Es la única salida del SCO que afirma que el curso acabó, y la que dispara el cierre
con `final = true`.

Que `completion_status` sea `completed` **también cuando reprueba** es deliberado y es lo que
`veredictoDelIntento` necesita: un intento reprobado **se registra** con su nota y **no cierra** la
asignación, que sigue exigible para repetir la evaluación (`scorm-cierre.ts:99-137`). Si se
reportara `incomplete` al reprobar, el intento no dejaría registro y se perdería la evidencia de
que la persona lo intentó.

### 4.B · El hueco del modelo 2004

Dos entradas en `ELEMENTOS` (`scorm-modelo.ts`):

```ts
'cmi.interactions.n.correct_responses.n.pattern': { acceso: 'RW', tipo: cadena(4000) },
'cmi.interactions.n.objectives.n.id':             { acceso: 'RW', tipo: cadena(4000) },
```

`normalizar()` ya colapsa **todos** los índices (`/\.\d+\./g`), así que
`cmi.interactions.0.correct_responses.0.pattern` cae en la clave de arriba sin tocar esa función.

`indiceDe()` devuelve el **primer** índice (`/\.(\d+)\./`), que es el de `interactions` — el
correcto para acotar contra `conteos.interacciones` en `validarEscritura`. El índice interno del
`correct_responses` **no** queda acotado; se acepta a propósito: el estándar no obliga a llevar su
cuenta y `correct_responses._count` es de sólo lectura, así que no hay tope contra el cual
comparar sin inventarlo.

`cadena(4000)` y no un tipo por `interaction type`: el patrón de una respuesta correcta tiene
gramática propia por tipo (`choice` usa `a[,]b`, `numeric` un rango, `matching` pares). Validarla
de verdad es un módulo aparte; validarla a medias rechazaría respuestas legítimas. Se guarda el
texto y se acota el largo, que es lo que el estándar exige como mínimo.

### 4.C · `Range` en el servidor de archivos

Dos piezas.

**Una función pura** `lib/sig/rango-http.ts`:

```ts
export type Rango =
  | { clase: 'completo' }                          // sin cabecera, o algo que no entendemos
  | { clase: 'parcial'; desde: number; hasta: number }
  | { clase: 'inatendible' };                      // → 416

export function analizarRango(cabecera: string | null, tamano: number): Rango
```

Bordes que se prueban, uno por uno: sin cabecera; `bytes=0-499`; abierto (`bytes=500-`); sufijo
(`bytes=-500`); sufijo más largo que el archivo; `desde >= tamano` → `inatendible`;
`hasta >= tamano` se recorta al último byte; `desde > hasta` → `inatendible`; múltiple
(`bytes=0-99,200-299`) → `completo`, porque `multipart/byteranges` no vale la complejidad para un
curso; archivo de tamaño 0; unidad que no es `bytes`.

**La ruta**, con un cambio que no es cosmético: **deja de traer el blob entero**. Hoy
`select: { bytes: true }` carga los 2,2 MB —o los 150 MB del día que alguien suba un curso con
video largo— en memoria por cada petición. En su lugar, dos consultas:

1. metadatos y tamaño sin los bytes (`mime`, `sha256`, `tamano`, `dominiosExternos`);
2. sólo el tramo pedido, con `substring` de Postgres:

```sql
SELECT substring("bytes" FROM $2 FOR $3) AS trozo FROM "archivo_scorm" WHERE "id" = $1
```

(`substring` en Postgres es 1-indexado: `desde + 1`.)

Es el mismo trabajo que cortar en memoria, y no repite la primera cicatriz de `HARNESS.md`.

La respuesta parcial: `206`, `Content-Range: bytes d-h/total`, `Content-Length` del tramo. La
completa suma `Accept-Ranges: bytes` — **sin esa cabecera el navegador ni siquiera intenta pedir
un rango**. El `416` lleva `Content-Range: bytes */total`. Las demás cabeceras (CSP, `ETag`,
`Cache-Control`, `nosniff`) van igual en los tres caminos: una respuesta parcial sin CSP sería un
hueco por el que se sirve contenido sin política.

### 4.D · `dominiosDe` distingue enlace de carga

Hoy toda URL en el HTML del SCO cuenta como origen de contenido. Se agrega un segundo filtro, del
mismo tipo que el de `NAMESPACES` y por la misma razón:

> Un `<a href="https://…">` **no carga nada y no transmite nada**. Es una navegación que la persona
> puede tomar, con su propia sesión, en otra pestaña. Ninguna directiva de CSP la gobierna.

La regla, deliberadamente conservadora: **un dominio se descarta sólo si _todas_ sus apariciones
son destinos de `<a href>`.** Si el mismo dominio aparece además en un `<script src>`, un `<img>`,
un `fetch()`, un `window.location` o en cualquier texto de un `.js`, cuenta como antes.

Esa asimetría es lo que impide que sea una puerta: un despacho real **carga** al tercero —en un
iframe o redirigiendo— y ambas cosas se siguen viendo. El escaneo de los `.js` locales, que es
donde un driver de despacho arma su URL, no se toca.

Alternativa descartada: quitarle el enlace al paquete. Resuelve este caso y deja el defecto en pie
para el siguiente curso que enlace a una norma, a un manual o a la intranet — que es lo normal en
un curso del SGSI.

---

## 5. Lo que no cambia

`abrirIntento` y `guardarIntento` conservan sus guardas (sesión, titular del intento, token
firmado, `mode=review`). `IntentoScorm`, `veredictoDelIntento`, `RegistroRealizado` y las pantallas
de formación quedan intactos. **No hay migración de base de datos en este spec.**

La CSP tampoco cambia: ya trae `media-src 'self' data: blob:`, así que el `.mp4` y los siete PNG
pasan sin tocar nada.

---

## 6. Verificación

### Regla 1 · rojo primero

En este orden, y cada uno verificado en rojo antes del arreglo:

1. `scorm-modelo.test.ts` — escribir `cmi.interactions.0.correct_responses.0.pattern` devuelve
   `OK` y no `401`; ídem `cmi.interactions.0.objectives.0.id`; y el índice de `interactions` se
   sigue acotando contra `conteos.interacciones`.
2. `rango-http.test.ts` — los once bordes de §4.C.
3. `scorm-manifiesto.test.ts` — un SCO cuyo único dominio externo está en un `<a href>` clasifica
   **AUTOCONTENIDO** con `dominiosExternos: []`; **y** uno que carga ese mismo dominio por
   `<script src>` o desde un `.js` local sigue clasificando **DESPACHO**. Las dos mitades: la
   segunda es la que prueba que el filtro no es una puerta.
4. La ruta de archivos: `206` con `Content-Range` correcto, `416` fuera de rango, `200` con
   `Accept-Ranges` sin cabecera, y la CSP presente en los tres.

Recién después, la migración del paquete.

### Regla 2 · los tres checks

```bash
npm run verificar:build
```

`verificar:migraciones` no aplica: no hay migraciones en este spec.

> Correr los tests **con Bash, no con PowerShell** — `use-server.test.ts` da un rojo falso ahí, y
> no encadenar `| tail`.

### Regla 3 · de punta a punta

**Aplica**: hay pantalla, hay estado, hay decisión de la persona y hay un flujo de varios pasos
donde la salida de uno alimenta al siguiente. Recorrido a ejecutar y a escribir en el PR:

```
Recorrido (gestionar-leads 2004, 15 archivos, 3,1 MB):
  1. Subir el .zip migrado        -> aceptado, clase AUTOCONTENIDO, dominios externos: ninguno
  2. Revisar la bitácora          -> SIN entrada «datos_a_tercero» (§2.5)
  3. Asignarlo y abrirlo          -> el curso carga; el video reproduce
  4. Adelantar el video a 1:30    -> salta de inmediato (206, no descarga completa)
  5. Avanzar dos pasos            -> /mi-sig muestra «Va por el N %»
  6. Cerrar la pestaña a mitad    -> «Guardado en el N % para seguir»
  7. Reabrir                      -> reanuda en el paso donde iba
  8. Responder el cuestionario    -> nota reportada, asignación REALIZADA
  9. Revisar el intento en BD     -> las 5 interacciones CON su correct_responses.0.pattern
 10. Reabrir ya cerrada           -> modo repaso: no crea intento ni escribe
```

El paso **9** es el que justifica §4.B, y el **2** el que justifica §4.D. Ninguno de los dos se ve
mirando la pantalla; hay que ir a buscarlos.

---

## 7. El paquete fuente no entra al repositorio

**Asunción tomada, revisable.** `HARNESS.md` ya excluye los libros del SGSI *«porque llevan nombres
de personas y descripciones de sistemas reales»*, y este paquete cumple las dos condiciones: las
siete capturas son de la lista de leads de un entorno Dynamics, y `index.html` lleva el
identificador del tenant real (`org8fcf0faf.crm3.dynamics.com`).

El `.zip` migrado se entrega y se archiva en el repositorio documental del SIG, junto a los demás
formatos fuente. **La receta de migración vive en este spec (§4.A)**, que sí está versionado — es
lo que permite repetirla con el Módulo 2 sin volver a deducirla.

---

## 8. Deuda que queda nombrada, no resuelta

**Multi-SCO.** `scorm-manifiesto.ts:192-200` rechaza todo paquete con más de un SCO, y el
argumento sigue siendo bueno: *«cerrar la asignación con medio curso visto es peor que no aceptar
el paquete»*. El modelo lo asume completo — `IntentoScorm` tiene **un** `completionStatus`, **una**
`scoreScaled`, **un** `cmi`.

Con esta migración el límite pesa más, no menos: en cuanto los módulos 2, 3 y 4 existan, la
tentación natural es empaquetarlos juntos. Resolverlo pide una tabla de SCOs por intento, roll-up
de completitud y nota, y un índice de lecciones en el player. **Es otro spec.** Mientras tanto: un
módulo, un paquete, una asignación.

**El detalle por pregunta se guarda pero no se muestra.** Tras §4.B queda completo en el `cmi` del
intento —pregunta, respuesta de la persona, respuesta correcta, acierto, latencia—, y ninguna
pantalla lo lee. Fue una decisión de alcance explícita. El día que se quiera la pantalla, el dato
ya está: no hay que volver a correr a nadie por el curso.

**SCORM 1.2.** Fuera de alcance por §3.1, y el rechazo se queda. Si algún día llega un paquete 1.2
que no se pueda migrar —uno comprado, sin fuentes—, el trabajo está diseñado en la alternativa (a)
y el porcentaje de avance seguirá sin existir.
