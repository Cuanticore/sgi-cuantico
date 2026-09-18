# Personas · ver pendientes y formación · diseño

**Fecha:** 2026-09-18 · **Estado:** propuesta, pendiente de revisión
**Pantalla:** `/sig/personas` (y `/sig/colaboradores`, que usa el mismo censo y el mismo popup)

---

## Por qué existe

La pantalla de Personas contesta hoy «quién existe, en qué área, con qué rol y cuántos
pendientes tiene». Las dos preguntas que se hacen **inmediatamente después** no las contesta:

1. **«¿Qué le falta?»** El número de la columna Pendientes ya es un botón
   (`app/sig/personas/Personas.client.tsx:435`), pero no lo parece: es un número monoespaciado
   sin borde ni rótulo. Y lo que abre es el popup en la pestaña **Datos base**, donde la lista
   aparece al final, dentro de un bloque titulado «Carga abierta de …» cuyo verbo es
   *reasignar*. Quien entra a mirar qué le falta a alguien aterriza en un formulario de
   edición y encuentra la respuesta abajo, enmarcada como un problema de traspaso.

2. **«¿Qué formación ha hecho?»** El popup tiene seis pestañas —Resumen, Datos base,
   Licencias, Contactos, Grupos de interés, Cuenta— y **ninguna de formación**. La única
   respuesta existente está en el expediente `/sig/colaboradores/[id]`, bajo el título
   «Intentos de curso en línea» (`app/sig/colaboradores/[id]/Ficha.client.tsx:414`): otra
   pantalla, otra navegación, y un rótulo que nombra el mecanismo (*intento SCORM*) en vez de
   la pregunta (*¿se formó?*). El Resumen del popup muestra «Tareas abiertas / Ya cumplidas»
   como dos cifras sin desglose: no distinguen una lectura de una capacitación.

El resultado práctico es que la persona que administra el censo —que está mirando la tabla
justo cuando le preguntan «¿este ya hizo el curso de seguridad?»— tiene que salir de la
pantalla para contestar.

---

## Qué se construye, en una frase

**Dos pestañas nuevas en el popup de persona —Pendientes y Formación— y un botón con rótulo
en la columna Pendientes que abre el popup directo en la primera de ellas.**

---

## Alcance

### Entra

- Botón rotulado en la celda de la columna Pendientes, que abre el popup en la pestaña
  Pendientes (hoy siempre abre en Datos base).
- Pestaña **Pendientes**: las asignaciones abiertas de la persona, con su tipo, su plazo y
  —cuando son curso virtual con paquete— el avance del último intento. Absorbe el bloque de
  reasignación que hoy es el pie de Datos base.
- Pestaña **Formación**: lo cursado y lo que está en curso, con progreso, calificación y
  estado. Incluye lo que **no** se va a cursar (no aplica / anulada) con su motivo.
- Un módulo puro con las reglas de redacción del progreso, y sus pruebas.
- Un spec de punta a punta de sólo lectura sobre el recorrido nuevo.

### No entra

- **No se toca el expediente** `/sig/colaboradores/[id]`. Sigue siendo el lugar de las filas
  completas, y la pestaña Formación enlaza a él igual que hoy lo hace el Resumen. La pestaña
  responde «¿se formó?»; el expediente responde «¿qué pasó exactamente en el intento 2?».
- **No se cierran ni se registran asignaciones desde acá.** Las dos pestañas leen. La única
  escritura es la reasignación, que ya existe y sólo cambia de lugar.
- **No se crea una noción nueva de «formación» en la base.** Se deriva del tipo de contenido
  que ya está declarado.
- No se toca la bandeja de Mi SIG ni el reproductor.

---

## Decisiones

### D-1 · Dos pestañas en el popup que ya existe, no un popup nuevo

REQ-SIG-15 fusionó a propósito el panel lateral de reasignación dentro del popup, y el
encabezado de `PopupPersona.tsx` lo dice con todas las letras: *«tener dos superficies —un
panel para mover pendientes y un popup para editar— obligaría a abrir una para enterarse de
lo que la otra dice»*. Un popup propio de pendientes vuelve a partir en dos la misma persona,
y obliga a decidir en cuál de los dos vive la reasignación.

Lo que cambia en el botón de la columna no es qué abre, sino **dónde aterriza**: el popup
recibe una sección inicial y la columna le pasa `'pendientes'`.

### D-2 · La lista de pendientes vive en un solo lugar, y ese lugar es la pestaña

El bloque de reasignación **se muda completo** de pie de Datos base a la pestaña Pendientes.
No se duplica la lista.

Es la cicatriz del `rowCount` inflado escrita en `HARNESS.md`: dos piezas contando lo mismo
desde orígenes distintos. Dejar la lista en Datos base «porque ya estaba» y agregar otra en
Pendientes garantiza el día en que digan cosas distintas.

Consecuencia directa: el prop `pieDeDatosBase` de `PopupPersona` **desaparece**.
`Personas.client.tsx` deja de armar un `ReactNode` de ~90 líneas para pasárselo al popup, y
Datos base vuelve a ser sólo el formulario.

### D-3 · El origen de la lista pasa a ser una acción de servidor, no el censo

Hoy `censo.query.ts:209` mete en cada una de las 91 filas el arreglo `abiertas` completo, y
ese arreglo viaja al navegador de cualquiera que abra la pantalla para alimentar un panel que
se mira de a una persona. Es exactamente el patrón que `PopupPersona` ya rechaza tres veces
—contactos (P9.3), grupos (P10) y resumen— con el mismo argumento.

Además, la pestaña necesita **más** de lo que el censo trae hoy (tipo de contenido y avance
del intento). Sumarlo a las 91 filas empeora el problema en vez de arreglarlo.

Entonces:

- `PersonaFila` **conserva** `pendientes` y `vencidas` (son la columna, se miran siempre).
- `PersonaFila` **pierde** `abiertas`.
- Una acción nueva devuelve la lista enriquecida cuando se abre la pestaña.

**Tres consumidores tocan `abiertas` y hay que moverlos a la vez**: `Personas.client.tsx:522`
(la lista a reasignar), `BloqueoCuenta.tsx:152` (las que se advierten al bloquear una cuenta)
y `censo.query.ts` (quien las arma). El bloqueo vive en otra pestaña del mismo popup, así que
la carga se hace **a nivel del popup, no de la pestaña**: se dispara cuando la sección activa
es `pendientes` **o** `cuenta`, y las dos leen el mismo estado. Si se cargara sólo al abrir
Pendientes, entrar directo a Cuenta mostraría «no tiene pendientes» sobre alguien que sí
tiene, que es la peor forma posible de fallar en esa pantalla.

### D-4 · «Formación» se decide por el tipo declarado, nunca por tener paquete

Son formación los contenidos de tipo `CAPACITACION` y `CURSO_VIRTUAL`. Nada más.

No se deriva de si hay un `PaqueteScorm` cargado. El propio esquema explica por qué el tipo
se declara (`prisma/schema.prisma:1274`): antes el comportamiento dependía de si alguien había
subido el zip, y *«quien creaba el contenido no podía saber, al elegir el tipo, si la persona
iba a declarar su asistencia o a recorrer un curso»*. Repetir esa inferencia acá reintroduce
el mismo defecto en otra pantalla.

Una `LECTURA` de una política **no es formación**, aunque enseñe algo. Una `VERIFICACION`
tampoco. Se cuentan en Pendientes, no en Formación.

### D-5 · El progreso se dice sólo cuando existe; un 0% inventado es peor que no decir nada

`IntentoScorm.progressMeasure` es opcional en SCORM y **muchos paquetes no lo reportan
nunca**. Si el campo es `null`, la pestaña **no muestra 0%** ni una barra vacía: dice que el
curso no reporta avance. Es la misma regla que la ficha ya aplica con la calificación
(`Ficha.client.tsx` / `page.tsx:356`: *«`null` es "el curso no reportó nota", que no es un
cero"»*), y la misma que este repo aplica en todas partes a la diferencia entre «no sé» y
«cero».

El progreso que se muestra es el del **último intento** (`numero` más alto), no el del mejor:
la pregunta de esta pestaña es dónde está la persona ahora. El mejor resultado se ve en la
calificación, y el historial completo en el expediente.

Tres situaciones no tienen progreso y **cada una lo dice distinto**, porque significan cosas
distintas:

| Situación | Qué se muestra |
|---|---|
| `CAPACITACION` (presencial o declarada) | «No es un curso en línea: se registra asistencia» |
| `CURSO_VIRTUAL` clase `ENLACE` | «Curso externo: el avance no vuelve al sistema» |
| `CURSO_VIRTUAL` clase `PAQUETE`, sin intentos | «Sin abrir» |

### D-6 · Las pendientes se ordenan por urgencia; la formación se destaca con marca, no con orden

El pedido es que la formación se vea «en especial». La forma equivocada de hacerlo es
subirla al tope de la lista: eso empuja hacia abajo una lectura **vencida** y le enseña a
quien mira que lo de arriba es lo que urge, cuando no lo es.

Entonces: **orden por urgencia** (vencidas primero, luego por fecha límite ascendente, que es
lo que ya hace `censo.query.ts:81`), la formación se distingue por su marca de tipo y su línea
de progreso, y el encabezado de la pestaña cuenta las dos cosas por separado:

> **4 abiertas · 1 vencida · 2 de formación**

Y un filtro de un clic —«Sólo formación»— para quien vino exactamente a eso.

### D-7 · Leerlas exige `personas:administrar`; contarlas no

Las dos pestañas nuevas leen por acción de servidor con `autorConPermiso('personas:administrar')`,
igual que `resumenDePersona` y `leerContactosEmergencia`. Sin el permiso, las pestañas existen
y explican qué permiso hace falta, como ya hace el resto del popup (P2). El censo —y por tanto
**la columna con el número**— sigue siendo visible para quien entra a la pantalla, sin cambios.

La reasignación conserva su permiso actual, que es **otro**: `operacion:escribir`
(`app/sig/acciones/tareas.ts:568`). Mover el bloque de pestaña no cambia quién puede usarlo.

> ⚠️ **Supuesto A-1.** Hoy la lista de pendientes viaja en el censo y la ve cualquiera que
> abra la pantalla; con D-3 + D-7 pasa a exigir `personas:administrar`. Es un endurecimiento,
> y es deliberado, pero **es un cambio de comportamiento observable**. Si la intención es que
> los pendientes de otra persona sigan siendo públicos dentro del SIG, hay que decirlo y la
> acción se queda sin `autorConPermiso`.

---

## La pantalla

### La celda de la columna Pendientes

```
  PENDIENTES
  ┌──────────────────────┐
  │ 3 · Ver pendientes   │   ← borde; rojo cuando hay vencidas
  └──────────────────────┘

  ┌──────────────────────┐
  │ 3 (1 venc.) · Ver    │
  └──────────────────────┘

  0                          ← sin botón: no hay nada que ver
```

- Con `pendientes === 0` se sigue mostrando el `0` plano, sin botón. Un botón que abre una
  lista vacía es una promesa incumplida; y la fila entera ya abre a la persona desde su
  nombre, que es el camino para la desvinculada con cero pendientes.
- El `title` actual (`«3 abierta(s), 1 vencida(s) — reasignar»`) cambia de verbo: ya no
  aterriza en reasignar, aterriza en ver.
- Copy en español de Colombia, impersonal, imperativo sin tilde: **«Ver pendientes»**.

### Pestaña Pendientes

```
[ Resumen | Datos base | Pendientes ③ | Formación | Licencias | Contactos | Grupos | Cuenta ]

  4 abiertas · 1 vencida · 2 de formación            [ Sólo formación ]

  ─────────────────────────────────────────────────────────────────────
  POL-LEC-02   Política de contraseñas               LECTURA
               Vencida hace 6 días
  ─────────────────────────────────────────────────────────────────────
  FOR-CAP-04   Seguridad de la información           CURSO VIRTUAL
               Vence en 12 días · Va por el 45% (intento 2 de 2)
  ─────────────────────────────────────────────────────────────────────
  FOR-CAP-09   Inducción SGSI                        CAPACITACIÓN
               Vence en 20 días · No es un curso en línea:
               se registra asistencia
  ─────────────────────────────────────────────────────────────────────
  ACT-INV-01   Verificar el inventario del área      TAREA
               Vence en 23 días
  ─────────────────────────────────────────────────────────────────────

  Estas asignaciones pasan completas a otra persona, con motivo en bitácora.
  Reasignar todas a: [ ▾ ]     Motivo: [        ]     [ Reasignar las 4 ]
```

- La pestaña lleva `cuantos` (el número abierto) y `atencion` cuando hay vencidas —los dos
  ya existen en `Pestanas.tsx:32` y `:35`—.
- El plazo se redacta con `textoPlazo` de `lib/sig/bandeja.ts:47`, que ya resuelve «Vence
  mañana / Vencida hace N días» con un solo verbo en los dos sentidos. **No se escribe una
  segunda redacción del plazo**: la que existe se reusa.
- El bloque de reasignación baja tal cual está hoy, con sus textos, incluida la distinción
  entre persona activa e inactiva y el aviso de las vencidas.
- Con cero abiertas, la pestaña dice que no hay nada que reasignar —el texto que ya existe— y
  el bloque de reasignación no se dibuja.

### Pestaña Formación

```
[ … | Formación ⑤ | … ]

  EN CURSO Y PENDIENTE (2)
  ─────────────────────────────────────────────────────────────────────
  FOR-CAP-04   Seguridad de la información        CURSO VIRTUAL · paquete
               Va por el 45% · intento 2 de 2 · última actividad 16/09
               Vence en 12 días
  ─────────────────────────────────────────────────────────────────────
  FOR-CAP-09   Inducción SGSI                     CAPACITACIÓN
               No es un curso en línea: se registra asistencia
               Vence en 20 días
  ─────────────────────────────────────────────────────────────────────

  REALIZADA (2)
  ─────────────────────────────────────────────────────────────────────
  FOR-CAP-01   Protección de datos personales     CURSO VIRTUAL · paquete
               Terminado · aprobó · 92 de 100 (mínimo 70) · 1 h 14 min
               Cerrada el 12/08/2026
  ─────────────────────────────────────────────────────────────────────
  FOR-CAP-07   Manejo de incidentes               CAPACITACIÓN
               Aprobado · 85 (mínimo 70)
               Cerrada el 03/07/2026
  ─────────────────────────────────────────────────────────────────────

  NO SE VA A CURSAR (1)                                       [ desplegar ]
  ─────────────────────────────────────────────────────────────────────
  FOR-CAP-03   Seguridad física                   NO APLICA
               Motivo: no opera en sede
  ─────────────────────────────────────────────────────────────────────

  Acá está si se formó. El expediente tiene cada intento con su hora,
  su tiempo y lo que el curso reportó.
  Ver el expediente completo →
```

- **Tres grupos, y el tercero es el que suele faltar.** `NO_APLICA` y `ANULADA` no son
  «realizada» y no son «pendiente»: son decisiones que alguien tomó con motivo. Meterlas en
  cualquiera de los otros dos grupos convierte una exención documentada en una laguna o en un
  logro. Va colapsado porque casi siempre está vacío.
- El grupo **Realizada** no muestra progreso: una formación cerrada no tiene «avance», tiene
  resultado. Mostrar «100%» al lado de «aprobó» sugiere dos hechos donde hay uno.
- La calificación sale de `RegistroRealizado.calificacion` / `.aprobado` cuando la hay, y del
  `scoreScaled` del intento cuando el cierre lo hizo el reproductor. `null` es «no reportó
  nota» y se dice así, nunca como cero.
- El enlace al expediente cierra la pestaña igual que cierra el Resumen hoy, con la misma
  frase de reparto de responsabilidades entre cifras y filas.

> ⚠️ **Supuesto A-2.** La pestaña Formación lista la formación **asignada**: sale de
> `Asignacion`. Una capacitación externa que alguien hizo y que nunca se asignó en el SIG no
> aparece, porque el sistema no la conoce. Si se espera ver formación cargada a mano —un
> diplomado, un curso de proveedor— eso es un modelo nuevo y un alcance distinto, y hay que
> decirlo antes de planear.

---

## Módulos y contratos

### `lib/sig/formacion.ts` — nuevo, puro, sin Prisma

Las reglas que deciden y redactan. Viven acá por la misma razón que `lib/sig/bandeja.ts`
explica en su encabezado: *«son reglas —no adornos— y una regla que sólo se puede comprobar
montando la pantalla entera termina sin comprobarse»*.

```ts
/// Los dos tipos que son formación. Se DECLARAN acá y no se infieren de tener paquete (D-4).
export const TIPOS_DE_FORMACION = ['CAPACITACION', 'CURSO_VIRTUAL'] as const;

export function esFormacion(tipo: string): boolean;

export interface ProgresoDeCurso {
  intentos: number;
  /// El del ÚLTIMO intento, no el del mejor (D-5).
  numero: number;
  estado: 'EN_CURSO' | 'SUSPENDIDO' | 'COMPLETADO' | 'ABANDONADO';
  /// 0–100, o `null` cuando el paquete no reportó `progressMeasure`. `null` NO es 0.
  porcentaje: number | null;
  /// La frase ya redactada. Una sola, para que las dos pestañas no la escriban distinto.
  etiqueta: string;
  ultimaActividadEn: string | null;
}

/// `null` cuando no hay progreso que mostrar; la frase de por qué la da `fraseSinProgreso`.
export function progresoDeCurso(
  intentos: { numero: number; estado: string; progressMeasure: number | null; ultimaActividadEn: Date }[],
): ProgresoDeCurso | null;

/// Qué decir cuando no hay progreso, y es distinto según por qué no lo hay (D-5).
export function fraseSinProgreso(
  tipo: string,
  claseCurso: 'PAQUETE' | 'ENLACE' | null,
  tieneIntentos: boolean,
): string;
```

Tabla de redacción, que es el contrato que las pruebas fijan:

| Estado del último intento | `progressMeasure` | Etiqueta |
|---|---|---|
| — (sin intentos) | — | `Sin abrir` |
| `EN_CURSO` | `0.45` | `Va por el 45%` |
| `EN_CURSO` | `null` | `Empezado; el curso no reporta avance` |
| `SUSPENDIDO` | `0.6` | `Guardado en el 60% para seguir` |
| `SUSPENDIDO` | `null` | `Guardado para seguir` |
| `ABANDONADO` | cualquiera | `Intento abandonado` |
| `COMPLETADO` | cualquiera | `Terminado` |

### `app/sig/acciones/persona-actividad.ts` — nuevo, `'use server'`

⚠️ Archivo `'use server'`: **sólo exporta funciones `async`**. Un `export const` acá tumba el
despliegue —es la cicatriz del 16/09/2026— y `lib/__tests__/use-server.test.ts` lo atrapa.
Por eso `TIPOS_DE_FORMACION` vive en `lib/sig/formacion.ts` y no en este archivo.

```ts
export async function pendientesDePersona(personaId: number): Promise<ResultadoPendientes>;
export async function formacionDePersona(personaId: number): Promise<ResultadoFormacion>;
```

```ts
export interface PendienteDePersona {
  id: number;            // Asignacion.id
  codigo: string;        // contenido.codigo, o '—' como ya hace el censo
  titulo: string;
  tipo: 'CAPACITACION' | 'LECTURA' | 'VERIFICACION' | 'TAREA' | 'CURSO_VIRTUAL';
  esFormacion: boolean;  // resuelto en el servidor, para que las dos pestañas coincidan
  periodo: string;
  fechaLimite: string;   // ISO
  vencida: boolean;
  dias: number;          // el de `diasHasta`, para que `textoPlazo` lo redacte
  progreso: ProgresoDeCurso | null;
  sinProgresoPorque: string | null;
}

export interface FilaFormacion {
  asignacionId: number;
  codigo: string;
  titulo: string;
  tipo: 'CAPACITACION' | 'CURSO_VIRTUAL';
  claseCurso: 'PAQUETE' | 'ENLACE' | null;
  periodo: string;
  fechaLimite: string;
  estado: 'PENDIENTE' | 'REALIZADA' | 'NO_APLICA' | 'ANULADA';
  fechaCierre: string | null;
  vencida: boolean;
  dias: number;
  calificacion: number | null;   // null = no reportó nota, NO cero
  aprobado: boolean | null;
  notaMinima: number | null;
  tiempoTotal: string | null;    // «1 h 14 min», sólo con intentos
  progreso: ProgresoDeCurso | null;
  sinProgresoPorque: string | null;
  motivo: string | null;         // NO_APLICA / ANULADA
}

export interface ResultadoFormacion extends Resultado {
  enCurso: FilaFormacion[];
  realizadas: FilaFormacion[];
  noCursadas: FilaFormacion[];
}
```

Ambas siguen el patrón de `persona-resumen.ts`: `ejecutar(...)`, `autorConPermiso`,
`exigirId`, y las listas viajan aparte del `Resultado` para que un fallo de permiso no se
confunda con «esta persona no tiene nada».

### Cambios en lo que ya existe

| Archivo | Qué cambia |
|---|---|
| `app/sig/personas/censo.query.ts` | Deja de armar y enviar `abiertas`. Conserva `pendientes` y `vencidas`. |
| `app/sig/personas/Personas.client.tsx` | `PersonaFila` pierde `abiertas`. La celda pasa a botón rotulado. Abre el popup con `seccionInicial='pendientes'`. Deja de construir `pieDeDatosBase`. |
| `app/sig/personas/PopupPersona.tsx` | Dos secciones nuevas; el prop `pieDeDatosBase` desaparece; entra `seccionInicial`. Carga de pendientes a nivel de popup (D-3), siguiendo el patrón de `contactos`/`grupos`/`resumen`: un `useState` + un `useRef` de pedido en vuelo. |
| `app/sig/personas/PendientesPersona.tsx` | **Nuevo.** La pestaña Pendientes, con el bloque de reasignación adentro. Aparte porque `PopupPersona.tsx` ya tiene 980 líneas y cuatro estados asíncronos. |
| `app/sig/personas/FormacionPersona.tsx` | **Nuevo.** La pestaña Formación, con el mismo criterio de `LicenciasPersona.tsx`: la pestaña que se carga sola vive en su archivo. |
| `app/sig/personas/BloqueoCuenta.tsx` | Recibe los pendientes por prop desde el popup en vez de leerlos de `persona.abiertas`. |
| `app/sig/colaboradores/Colaboradores.client.tsx` | Usa el mismo censo y el mismo popup: hay que verificar que no dependa de `abiertas` ni del prop que se va. |

---

## Pruebas

### Regla 1 · el test primero, y visto en rojo

`lib/sig/__tests__/formacion.test.ts` — nuevo. Cada fila de la tabla de redacción de D-5 es un
caso. Los que no pueden faltar:

1. `progressMeasure === null` **no produce** `0%` en ninguna etiqueta.
2. `progressMeasure === 0` produce `0%` — que es distinto de no saber, y es el caso que
   demuestra que el test 1 mira lo que dice mirar.
3. Con dos intentos, el progreso es el del `numero` más alto, **aunque el otro tenga
   `progressMeasure` mayor**. Sin este caso, «último» y «mejor» coinciden por casualidad en
   los datos fáciles.
4. `esFormacion('LECTURA') === false` y `esFormacion('CURSO_VIRTUAL') === true`: la frontera
   se decide por tipo (D-4).
5. Un `CURSO_VIRTUAL` clase `ENLACE` **con** intentos —que no debería tenerlos, pero la base
   no lo impide— no inventa un progreso que el sistema no puede conocer.
6. `fraseSinProgreso` da tres frases distintas para los tres motivos distintos.

`lib/sig/__tests__/pendientes-coherentes.test.ts` — nuevo, y es el que existe por la cicatriz
del `rowCount`. El número de la columna y el largo de la lista de la pestaña salen de dos
consultas distintas: el censo cuenta las 91 personas de un saque, la acción lee una. El test
comprueba que **las dos usan el mismo predicado** —`{ estado: 'PENDIENTE' }`, sin filtros
adicionales de fecha ni de tipo— leyendo los dos archivos, al estilo de
`lib/__tests__/use-server.test.ts`, que ya escanea 36 archivos en milisegundos.

`lib/__tests__/use-server.test.ts` cubre solo el archivo nuevo de acciones sin tocarlo: ya
escanea el directorio.

### Regla 3 · punta a punta

**Aplica.** Es una pantalla con estado, un flujo de más de un paso —abrir la tabla, elegir a
alguien, cambiar de pestaña— y una decisión de la persona a la que el sistema reacciona.

`e2e/personas.spec.ts` — nuevo, y **de sólo lectura**, que es lo que lo hace tolerable contra
la base de producción por el túnel (la regla que `HARNESS.md` fija para `e2e/`):

1. Abrir `/sig/personas` y esperar la tabla.
2. Tomar la primera fila con pendientes > 0 y leer el número de la celda.
3. Clic en «Ver pendientes» → el popup abre con la pestaña **Pendientes** activa
   (`aria-selected="true"`).
4. Contar las filas de la lista → **coincide con el número de la celda**. Es el paso que
   convierte la cicatriz del `rowCount` en algo que se verifica solo.
5. Si hay vencidas, la pestaña lleva la marca de atención y la primera fila es una vencida.
6. Cambiar a **Formación** → los tres grupos existen, y el conteo del encabezado coincide con
   las filas dibujadas.
7. Activar «Sólo formación» en Pendientes → todas las filas visibles son de formación, y el
   número no supera el total.
8. Cerrar el popup → la tabla sigue en pie y no hubo escritura.

El recorrido **con escritura** —reasignar— no entra al spec por la regla de sólo lectura; se
prueba a mano y el PR escribe el recorrido, con el formato que `HARNESS.md` exige.

### Los tres checks

`npm run verificar:build` antes del PR. Lo de siempre, y acá importa el `build`: se agregan
dos componentes cliente y un archivo `'use server'`, que es la clase de cambio que tumbó el
despliegue del 16/09/2026.

---

## Supuestos que hay que confirmar antes de planear

| # | Supuesto | Qué cambia si es falso |
|---|---|---|
| **A-1** | Leer los pendientes de otra persona pasa a exigir `personas:administrar` (D-7). | Si deben seguir siendo visibles para todo el SIG, la acción se queda sin `autorConPermiso` y el endurecimiento se anota como deuda aparte. |
| **A-2** | La pestaña Formación lista sólo formación **asignada** en el SIG (sale de `Asignacion`). | Si se espera cargar formación externa a mano, es un modelo nuevo y un alcance distinto: spec propia. |
| **A-3** | El bloque de reasignación **se muda** a la pestaña Pendientes y desaparece de Datos base (D-2). | Si se prefiere no tocar Datos base, hay que decidir cuál de las dos listas es la buena — y esa es exactamente la decisión que D-2 evita. |
| **A-4** | La pestaña Pendientes lista **todas** las abiertas, no sólo las de formación. | El pedido dice «en especial las de formación»; se resolvió con marca y filtro (D-6), no restringiendo la lista. |
| **A-5** | Con cero pendientes no hay botón, se sigue viendo el `0` plano. | Si se quiere botón siempre, abre una lista vacía y hay que redactar ese estado. |

---

## Lo que queda anotado y fuera de alcance

- El **Resumen** del popup sigue mostrando «Tareas abiertas / Ya cumplidas» sin desglosar
  formación. Con la pestaña Formación al lado, esas dos cifras podrían enlazar a ella; no se
  hace acá para no mezclar dos cambios en la misma pestaña.
- El expediente `/sig/colaboradores/[id]` sigue titulando su bloque «Intentos de curso en
  línea». Es el rótulo del mecanismo, no de la pregunta, y convendría que dijera «Formación»
  con los intentos adentro. Cambio de copy, spec aparte.
- No hay ningún lugar que conteste **«¿a cuántas personas les falta el curso X?»** — la
  pregunta inversa, que es la que se hace al cerrar un periodo de concienciación. Se contesta
  hoy mirando persona por persona. Es una pantalla, no una pestaña.
