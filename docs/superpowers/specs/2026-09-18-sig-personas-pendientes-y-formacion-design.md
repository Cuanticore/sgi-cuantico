# Personas · pendientes, asignar, exportar y formación · diseño

**Fecha:** 2026-09-18 · **Estado:** **implementado y verificado**: base, punta a punta y el
recorrido a mano de escritura de la Regla 3
**Revisión 2 (18/09/2026):** entran «Asignar» y «Exportar»; A-1 queda resuelto por decisión
de Daniel Medina —la puerta por rol a `Líderes SIG` alcanza—.
**Revisión 3 (18/09/2026):** construido. Ver
[Estado de la implementación](#estado-de-la-implementación) para qué quedó verificado y qué
no, y para las tres desviaciones entre esta spec y el código.
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

**Dos pestañas nuevas en el popup de persona —Pendientes y Formación—, un botón con rótulo en
la columna que abre el popup directo en la primera, y tres verbos sobre esa lista: ver,
asignar y exportar.**

---

## Alcance

### Entra

- Botón rotulado en la celda de la columna Pendientes, que abre el popup en la pestaña
  Pendientes (hoy siempre abre en Datos base).
- Pestaña **Pendientes**: las asignaciones abiertas de la persona, con su tipo, su plazo y
  —cuando son curso virtual con paquete— el avance del último intento. Absorbe el bloque de
  reasignación que hoy es el pie de Datos base.
- **Asignar**: darle a esta persona una actividad que no le tocaba —un contenido del catálogo
  o una tarea puntual—, con plazo y motivo. **Hoy no existe ningún camino para esto**, y
  antes de construirlo hay que levantar un bloqueo del esquema (ver
  [El bloqueo](#el-bloqueo--hoy-no-caben-dos-asignaciones-manuales-por-persona-y-periodo)).
- **Exportar**: descargar la lista de pendientes como `.xlsx`, de una persona o de todo el
  censo, por la misma ruta.
- Pestaña **Formación**: lo cursado y lo que está en curso, con progreso, calificación y
  estado. Incluye lo que **no** se va a cursar (no aplica / anulada) con su motivo.
- Un módulo puro con las reglas de redacción del progreso, y sus pruebas.
- Un spec de punta a punta de sólo lectura sobre el recorrido nuevo.

### No entra

- **No se toca el expediente** `/sig/colaboradores/[id]`. Sigue siendo el lugar de las filas
  completas, y la pestaña Formación enlaza a él igual que hoy lo hace el Resumen. La pestaña
  responde «¿se formó?»; el expediente responde «¿qué pasó exactamente en el intento 2?».
- **No se cierran ni se registran asignaciones desde acá.** Cerrar es un acto de la persona
  que la tiene, y vive en su bandeja de Mi SIG con su panel, su firma y su registro. Desde
  Personas se **abre** trabajo y se **mueve**; no se declara cumplido el trabajo ajeno.
- **No se asigna en lote.** Una asignación por vez, a la persona cuyo popup está abierto.
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

### D-7 · El control de acceso es el rol de líder que ya existe; no se agrega ninguno

**Decidido el 18/09/2026: la puerta por rol a `Líderes SIG` alcanza, y no se construye nada
encima.** Lo que sigue es por qué eso ya está resuelto en el código, y qué hay que escribir
igual para que siga siendo cierto.

Verificado en `lib/sgsi/permisos.ts:97`: el mapa `POR_GRUPO` tiene **una sola entrada**,
`Líderes SIG`, y esa entrada trae todos los permisos, incluidos `operacion:ver`,
`operacion:escribir` y `personas:administrar`. El layout de `/sig` exige `operacion:ver`
(`app/sig/layout.tsx:20`). De ahí se sigue que **quien logra ver la pantalla de Personas ya
tiene `personas:administrar`**: no hay ningún rol intermedio que vea el censo y no pueda
abrirlo. El banner de «Solo lectura» del popup (P2) es hoy código inalcanzable, y se deja
como está: es una defensa correcta para el día que exista un segundo grupo.

Consecuencia para las pestañas nuevas: no hay distinción que diseñar. La columna, la lista y
la formación los ve la misma gente.

**Las acciones nuevas llevan `autorConPermiso('personas:administrar')` igual**, y no es un
control adicional: es el mismo, escrito donde se puede exigir. Una server action de Next es un
endpoint público —tiene su propia URL y **no hereda la puerta del layout**—, así que una
acción sin verificación es alcanzable por cualquiera con sesión, sea del grupo o no. Es lo que
ya hacen `resumenDePersona` y `leerContactosEmergencia`. Hoy la llamada no rechaza a nadie que
hubiera pasado por la pantalla; existe para que la afirmación de arriba siga siendo verdad
cuando alguien cree el segundo grupo.

La reasignación conserva su permiso actual, que es **otro nombre para la misma gente**:
`operacion:escribir` (`app/sig/acciones/tareas.ts:568`). Mover el bloque de pestaña no cambia
quién puede usarlo. **Asignar** usa el mismo, por la misma razón: crear una asignación y
moverla son la misma clase de acto sobre la carga de alguien.

---

## El bloqueo · hoy no caben dos asignaciones manuales por persona y periodo

**Esto hay que resolverlo antes de poder construir «Asignar», y no es una preferencia de
diseño: es una restricción del esquema que hoy rechaza la segunda fila.**

El índice único de `asignacion`, recreado a mano en
`prisma/migrations/20260903143000_alcance_por_activo/migration.sql:57`:

```sql
CREATE UNIQUE INDEX "asignacion_obligacion_id_persona_id_periodo_activo_id_key"
  ON "asignacion" ("obligacion_id", "persona_id", "periodo", "activo_id")
  NULLS NOT DISTINCT;
```

`NULLS NOT DISTINCT` es exactamente lo que hace falta para que el cron sea reintentable: sin
eso, dos filas con `activo_id` nulo no chocarían y la idempotencia se perdería para todas las
obligaciones que no son por activo. La migración lo explica bien y la decisión es correcta.

Pero una asignación **manual** no tiene obligación ni activo. Su llave se reduce a
`(NULL, persona_id, periodo, NULL)`, y con `NULLS NOT DISTINCT` esos nulos **sí** chocan.
Resultado: **una persona sólo puede tener una asignación manual por periodo**. La segunda
levanta violación de unicidad y, como todo esto corre dentro de `$transaction`, tumba la
operación entera.

### Tres salidas, y una recomendada

| | Qué se hace | Por qué sí / por qué no |
|---|---|---|
| **Op-1** | Meter un discriminador en `periodo` (`2026-09#FOR-CAP-04`). | **No.** `periodo` es la etiqueta legible del periodo —`2026-T3`, `2026-09`— y la bandeja, los reportes y el planificador agrupan por ella. Ensuciarla con una llave sintética rompe su significado en todo lo que ya la lee. Es, además, el parche que hoy ya está en el código y que produjo los dos defectos de abajo. |
| **Op-2** | Hacer el índice **parcial**: único sólo `WHERE obligacion_id IS NOT NULL`. | **Sí, recomendada.** El cron siempre escribe `obligacionId`, así que su idempotencia queda intacta, verbatim. Y libera la asignación manual, que nunca fue idempotente porque nada la reintenta. Una migración, sin cambio de datos. |
| **Op-3** | Crear una `Obligacion` «puntual» por cada asignación manual. | **No.** Una obligación es una regla recurrente con alcance y periodicidad. Inventar una por cada tarea suelta llena el catálogo de reglas que no son reglas, y el planificador tendría que aprender a ignorarlas. |

### Dos defectos que este bloqueo ya está causando, hoy, en producción

No los introduce este cambio: están en `main` desde antes. Los encontré al verificar si
«Asignar» era construible, y los dejo anotados para el desarrollador — **no los toco**.

1. **`app/sig/acciones/metricas.ts:86`** crea la tarea de alerta con `obligacionId` nulo,
   `activoId` nulo y `periodo: datos.periodo` (`2026-09`). **Dos métricas distintas con el
   mismo responsable que crucen umbral en el mismo periodo colisionan**: la segunda medición
   no se puede registrar. Falla el `$transaction` completo, así que no es que se pierda la
   alerta — es que **no se puede guardar la medición**. El único guarda que hay es contra
   repetir el periodo de *la misma* métrica (`metricas.ts:50`), que no cubre este caso.

2. **`app/sig/acciones/hallazgos.ts:309`** crea la acción con `periodo: hallazgo.codigo`,
   que es Op-1 aplicado a mano para esquivar la colisión. Funciona para un hallazgo con una
   acción, y **falla en cuanto un hallazgo tiene dos acciones para el mismo responsable**:
   misma llave, violación de unicidad, la acción no se crea.

Los dos se arreglan solos con Op-2. Si Op-2 se rechaza, los dos siguen abiertos y hay que
tratarlos aparte.

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

  [ + Asignar ]   [ Reasignar todas ]   [ Exportar ]

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
  entre persona activa e inactiva y el aviso de las vencidas. Pasa a abrirse desde
  **Reasignar todas** en vez de estar siempre desplegado: con el botón de asignar al lado, un
  selector de destino permanentemente a la vista invita a mover cuando se quería agregar.
- Con cero abiertas, la pestaña dice que no hay nada que reasignar —el texto que ya existe—,
  **Reasignar** y **Exportar** no se dibujan, y **Asignar** sí: es justamente la persona a la
  que hay que ponerle algo.

### Asignar

Un panel dentro de la misma pestaña —no un popup sobre el popup, que deja dos capas de
«Cerrar» encima de la misma persona—. Dos orígenes, una sola decisión:

```
  ASIGNARLE ALGO A DANIEL MEDINA

  ( • ) Un contenido del catálogo      (   ) Una tarea puntual

        Contenido:  [ FOR-CAP-04 · Seguridad de la información  ▾ ]
                    Curso virtual · paquete · exige evaluación, mínimo 70

        Vence:      [ 2026-10-31 ]
        Motivo:     [ ingreso fuera del periodo de inducción        ]

        ⚠ Ya tiene FOR-CAP-04 abierta, con vencimiento el 30/09.
          Asignarla de nuevo le deja dos.

                                        [ Cancelar ]  [ Asignar ]
```

- **El selector de contenido excluye lo que ya tiene abierto**… no. Lo **marca**, y avisa,
  pero no lo esconde. Esconderlo haría imposible el caso legítimo —reasignar un curso que la
  persona reprobó y debe repetir— y, peor, dejaría a quien mira sin saber por qué el contenido
  que busca no está en la lista. El aviso aparece al elegirlo, antes de confirmar.
- **El motivo es obligatorio.** Es la regla de la casa: se exige donde la decisión tiene
  consecuencia. Asignar le abre trabajo a una persona y le corre un plazo; dentro de seis meses
  «¿por qué tengo esto?» tiene que tener respuesta en la bitácora. La reasignación ya lo exige
  (`tareas.ts:571`) y no hay motivo para que crear pese menos que mover.
- **El plazo no tiene valor por omisión.** Proponer «+30 días» sería el número inventado que
  este repo prohíbe en todas partes; la fecha la pone quien asigna. Lo único que se valida es
  que no sea anterior a hoy.
- Con **tarea puntual**, el selector se reemplaza por título y descripción, que es lo que el
  modelo pide cuando no hay contenido (`prisma/schema.prisma:1688`).
- El `periodo` de una asignación manual se escribe como el mes de la fecha límite (`2026-10`),
  que es lo que la bandeja y los reportes esperan leer ahí. **Esto sólo es posible con Op-2**;
  con el índice de hoy, la segunda del mes falla.
- Al asignar se refresca la lista y el contador de la pestaña, y la fila nueva aparece en su
  lugar por urgencia. El número de la columna del censo queda viejo hasta recargar: se
  revalida la ruta, igual que hace la reasignación.

### Exportar

Un `.xlsx` real por `GET /api/sig/exportar-pendientes`, siguiendo punto por punto el patrón de
`app/api/sgsi/exportar-activos/route.ts`, que ya resolvió esto bien:

- La ruta **no está bajo `/sig`**, así que la puerta del layout no la ve: verifica la sesión y
  `puede(rol, 'operacion:ver')` de forma explícita. Con sesión buena y sin permiso responde
  **403**, no 404 — quien tiene cuenta merece saber que existe y que no le corresponde.
- **Una ruta, dos entradas.** Sin parámetros exporta los pendientes de todo el censo; con
  `?persona=<id>` exporta los de una. El botón de la pestaña usa la segunda; un botón en la
  franja de la pantalla usa la primera, respetando el chip Activas/Inactivas/Todas vía
  `?estado=`. Dos rutas para dos vistas de la misma lista es el error que D-2 evita adentro y
  que no tiene por qué repetirse afuera.
- **Cómo se ve el archivo vive en `lib/sig/pendientes-libro.ts`**, sin sesión y sin Prisma, para
  que una prueba pueda construir el libro y leerlo de vuelta. Es literalmente lo que dice el
  encabezado de `exportar-activos` sobre `inventario-libro.ts`, y es lo que permite que el
  formato esté probado sin montar la pantalla.
- Columnas, una fila por asignación abierta: `Código`, `Título`, `Tipo`, `Persona`, `Correo`,
  `Área`, `Cargo`, `Periodo`, `Fecha límite`, `Días` (negativos si está vencida), `Estado del
  plazo` (`En plazo` / `Vencida`), `Avance del curso` (el porcentaje, **vacío cuando el paquete
  no lo reporta** — nunca 0), `Intentos`.
- Nombre del archivo: `pendientes-<censo|persona>-AAAA-MM-DD.xlsx`.

> El archivo lleva nombres, correos y la carga de trabajo de personas reales. No entra al
> repositorio, y es la misma clase de dato que `HARNESS.md` mantiene fuera con los libros del
> SGSI y con `test-results/`.

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

Y en `app/sig/acciones/tareas.ts`, donde ya viven `reasignarAsignacion` y
`reasignarPendientesDe` —crear y mover la carga de alguien son vecinos, y el archivo ya trae
la bitácora y los permisos de esa familia—:

```ts
export async function asignarAPersona(
  personaId: number,
  datos: {
    /// Uno de los dos, nunca los dos. Con `contenidoId`, el título y la descripción los
    /// manda el contenido; sin él, son obligatorios (`prisma/schema.prisma:1688`).
    contenidoId?: number;
    titulo?: string;
    descripcion?: string;
    fechaLimite: string;
    /// Obligatorio. Asignar le abre trabajo a alguien: dentro de seis meses «¿por qué
    /// tengo esto?» tiene que tener respuesta en la bitácora.
    motivo: string;
  },
): Promise<Resultado>;
```

Valida, en este orden, y cada una con su mensaje: la persona existe y está activa; hay
contenido **o** título, no ambos ni ninguno; la fecha límite no es anterior a hoy; el motivo
no está vacío. Escribe una fila de `bitacora` con `tabla: 'asignacion'`, `campo: 'alta'` y el
motivo de quien asignó, distinguible de la generación automática —que escribe
`'generada · <periodo>'`— porque la franja de la última corrida del censo se arma leyendo esa
misma tabla (`censo.query.ts:106`) y **no puede confundir una asignación manual con una
sincronización**. Es exactamente la trampa que P28 ya documenta en ese archivo.

### `app/api/sig/exportar-pendientes/route.ts` y `lib/sig/pendientes-libro.ts` — nuevos

La ruta hace sesión, permiso, consulta y descarga; el libro no sabe de ninguna de las cuatro
cosas. La separación es la de `exportar-activos` / `inventario-libro.ts`, y existe para que el
formato se pueda probar: `exceljs` ya es dependencia (`package.json:24`).

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
| `prisma/migrations/<fecha>_asignacion_manual/` | **Nuevo.** Op-2: el índice único pasa a parcial, `WHERE obligacion_id IS NOT NULL`. Se escribe a mano, con su comentario, como ya se hizo en `20260903143000_alcance_por_activo`: Prisma no expresa ni `NULLS NOT DISTINCT` ni el `WHERE`. |
| `app/sig/acciones/tareas.ts` | Entra `asignarAPersona`. |
| `app/sig/personas/PendientesPersona.tsx` | **Nuevo.** La pestaña Pendientes, con el bloque de reasignación y el panel de asignar adentro. Aparte porque `PopupPersona.tsx` ya tiene ~980 líneas y cuatro estados asíncronos. |
| `app/api/sig/exportar-pendientes/route.ts` | **Nuevo.** Sesión, permiso, consulta, descarga. |
| `lib/sig/pendientes-libro.ts` | **Nuevo.** El libro, sin sesión y sin Prisma, para poder probarlo. |
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

`lib/sig/__tests__/pendientes-libro.test.ts` — nuevo. Construye el libro y lo lee de vuelta,
que es para lo que el módulo no importa Prisma:

1. Una fila por asignación abierta, y el encabezado en el orden declarado.
2. Un curso **sin** `progressMeasure` deja la celda de avance **vacía**, no en `0`. En una
   hoja de cálculo un cero se suma, se promedia y se grafica: es la peor superficie posible
   para confundir «no sé» con «cero».
3. Una vencida sale con días negativos y `Estado del plazo = Vencida`, coherente con el signo.
4. Sin pendientes, el libro se genera igual con sólo el encabezado — un archivo vacío es una
   respuesta, un error no.

`lib/sig/__tests__/asignacion-manual.test.ts` — nuevo, sobre las validaciones puras de
`asignarAPersona` (que viven en un helper de `lib/sig/`, no dentro de la acción):

1. Con `contenidoId` **y** título → rechaza, porque el modelo ignora el título y quien lo
   escribió creería que se guardó.
2. Sin ninguno de los dos → rechaza.
3. Fecha límite anterior a hoy → rechaza. Nace vencida y nadie lo quiso.
4. Motivo vacío o sólo espacios → rechaza.
5. El `periodo` derivado de la fecha límite es el mes (`2026-10-31` → `2026-10`), en el
   formato que la bandeja ya lee.

`lib/__tests__/use-server.test.ts` cubre solo los archivos nuevos de acciones sin tocarlo: ya
escanea el directorio. Importa acá porque `TIPOS_DE_FORMACION` **no puede** vivir en el
archivo `'use server'`.

### La prueba que este cambio no puede dejar de tener

**Dos asignaciones manuales a la misma persona en el mismo mes.** Es el bloqueo entero en un
caso, y es el que hay que **ver en rojo antes de escribir la migración**: hoy la segunda
levanta violación de unicidad. Necesita base, así que va donde estén las pruebas que la usan;
si no hay ninguna todavía, va como paso obligatorio del recorrido de punta a punta escrito en
el PR, con el mensaje de error de antes y el resultado de después.

Sin este caso, Op-2 se escribe y nadie comprueba que resolvió algo.

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

9. **Exportar** en la pestaña → llega un `.xlsx` con `content-type` de hoja de cálculo y con
   tantas filas de datos como decía el contador. Descargar es leer: entra al spec.

Los recorridos **con escritura** —asignar y reasignar— no entran al spec por la regla de sólo
lectura de `e2e/`. Se prueban a mano y el PR escribe el recorrido paso a paso, con el formato
que `HARNESS.md` exige. El de asignar tiene que incluir, explícitamente, **la segunda
asignación del mismo mes**.

### Los tres checks

`npm run verificar:build` antes del PR. Lo de siempre, y acá importa el `build`: se agregan
dos componentes cliente y un archivo `'use server'`, que es la clase de cambio que tumbó el
despliegue del 16/09/2026.

---

## Supuestos que hay que confirmar antes de planear

| # | Supuesto | Qué cambia si es falso |
|---|---|---|
| ~~**A-1**~~ | ~~Leer los pendientes de otra persona pasa a exigir `personas:administrar`.~~ **Resuelto el 18/09/2026:** la puerta por rol a `Líderes SIG` alcanza y no se agrega control nuevo. Ver D-7. | — |
| **A-2** | La pestaña Formación lista sólo formación **asignada** en el SIG (sale de `Asignacion`). | Si se espera cargar formación externa a mano, es un modelo nuevo y un alcance distinto: spec propia. |
| **A-3** | El bloque de reasignación **se muda** a la pestaña Pendientes y desaparece de Datos base (D-2). | Si se prefiere no tocar Datos base, hay que decidir cuál de las dos listas es la buena — y esa es exactamente la decisión que D-2 evita. |
| **A-4** | La pestaña Pendientes lista **todas** las abiertas, no sólo las de formación. | El pedido dice «en especial las de formación»; se resolvió con marca y filtro (D-6), no restringiendo la lista. |
| **A-5** | Con cero pendientes no hay botón, se sigue viendo el `0` plano. | Si se quiere botón siempre, abre una lista vacía y hay que redactar ese estado. |
| **A-6** | **Op-2**: el índice único de `asignacion` pasa a parcial. Es condición para que «Asignar» exista. | Sin Op-2 no hay «Asignar» construible sin ensuciar `periodo`, y los dos defectos de `metricas.ts` y `hallazgos.ts` siguen abiertos. Si Op-2 se rechaza, hay que decidir cuál de las dos cosas se cede. |
| **A-7** | «Asignar» es asignarle a **esta** persona, desde su popup. | Si lo que se quiere es asignar en lote —el mismo curso a doce personas—, eso no es una pestaña: es una pantalla, y probablemente la inversa que ya está anotada abajo. |
| **A-8** | «Exportar» son los **pendientes**. | Si se esperaba exportar el censo completo —personas con área, cargo y rol— es otra hoja y otras columnas, y conviene decidirlo ahora porque la ruta se escribe una sola vez. |

---

## Estado de la implementación

Construido el 18/09/2026. Los cuatro checks de la Regla 2 en verde: `tsc` 0 errores, ESLint 0
errores (los 5 warnings preexistentes), **2581 pruebas en 145 suites**, y el build compila con
`/api/sig/exportar-pendientes` registrada.

### Lo que se verificó, y cómo

| Pieza | Prueba | Estado |
|---|---|---|
| Reglas del avance y la frontera de formación | `lib/sig/__tests__/formacion.test.ts` | **19 casos, verde**. Se vieron 14 en rojo por aserción contra un esqueleto antes de escribir el módulo. |
| Validación de la asignación manual | `lib/sig/__tests__/asignacion-manual.test.ts` | **12 casos, verde**. 8 vistos en rojo primero. |
| El libro de exportación | `lib/sig/__tests__/pendientes-libro.test.ts` | **8 casos, verde**. Los 8 vistos en rojo primero. |
| `'use server'` sin `export const` | `lib/__tests__/use-server.test.ts` | Verde; escanea el directorio y ya cubre los archivos nuevos. |

### La migración, verificada contra base

**Ejecutado el 18/09/2026 contra `localhost:5432/sgi_sgsi`**, la base local sembrada.
Reproducible con `scripts/verificar-indice-asignacion.ts`, que quedó en el repositorio:

```
  OK   1 · índice viejo, dos manuales        la segunda falló · 23505 asignacion_..._key
  OK   2 · índice parcial, dos manuales      las dos entraron
  OK   3 · índice parcial, misma obligación  la segunda falló · 23505 asignacion_..._key
  OK   4 · la base quedó como estaba         2 asignaciones
```

Los tres escenarios son los que hacen que esto pruebe algo:

1. **El defecto, reproducido.** Con el índice viejo la segunda asignación manual levanta
   `23505` sobre ese índice exacto. Es el rojo que la Regla 1 exige ver primero: sin él, el
   punto 2 pasaría igual aunque el defecto nunca hubiera existido.
2. **El arreglo.** Con el índice parcial las dos entran.
3. **Lo que no se podía romper.** Con el índice parcial, dos asignaciones de la **misma
   obligación** siguen chocando: la idempotencia del cron quedó intacta. Si este escenario
   dejara entrar las dos, la migración habría roto justo lo que el índice existía para
   proteger, y nadie lo notaría hasta ver asignaciones duplicadas en la bandeja de alguien.

Todo corre dentro de una transacción que termina en `ROLLBACK` —en PostgreSQL el DDL es
transaccional, así que el `DROP INDEX` se revierte igual que los `INSERT`— y el punto 4
comprueba contando que la base quedó como estaba, en vez de afirmarlo. El script sólo corre
contra `localhost`, con la misma guarda que `preparar-bd-local.ts`.

### El recorrido de punta a punta, ejecutado

`npx playwright test e2e/personas.spec.ts`, contra `localhost:5432/sgi_sgsi`:

```
  1 · Abrir /sig/personas                -> 9 filas
  2 · Primera con pendientes             -> 1 en la celda
  3 · Abre en Pendientes                 -> aria-selected=true
  4 · Columna == filas de la lista       -> 1 == 1
  5 · Sin vencidas                       -> ninguna fila dice «Vencida»
  6 · Filtro «Sólo formación»            -> 1 de 1, y vuelve
  7 · Ningún 0% inventado                -> ninguna fila mezcla «no reporta» con un porcentaje
  8 · Pestaña Formación                  -> En curso y pendiente (1) CUR-001 Inducción Corporativa
  9 · Exportar                           -> pendientes-daniel-medina-2026-09-18.xlsx
 10 · Cerrar sin escribir                -> 9 filas siguen

  1 passed (15.1s)
```

### El defecto que el recorrido encontró, y que ninguna otra prueba veía

La primera corrida **falló en el paso 4**: la pestaña se quedaba en «Cargando lo que tiene
abierto…» para siempre. Los cuatro checks de la Regla 2 estaban en verde mientras tanto.

La causa es de composición, no de una pieza. React en modo estricto —que Next trae activo por
omisión en desarrollo— monta cada efecto, lo limpia y lo vuelve a montar:

```
1er montaje  -> pide, marca el ref «en vuelo»
limpieza     -> vigente = false
2º montaje   -> ve el ref en vuelo y se va sin pedir
la respuesta -> se descarta por vigente
finally      -> libera el ref, pero ya nadie vuelve a disparar el efecto
```

**Los otros cinco efectos de `PopupPersona` tienen el mismo patrón y nunca fallaron**, porque
sólo se alcanzan por clic, después del montaje. `seccionInicial` hizo que uno arrancara en el
montaje y destapó una trampa que ya estaba puesta. Es exactamente la forma que describe
`HARNESS.md`: el defecto no vivía en ninguna pieza, vivía entre ellas.

El arreglo es sacar la bandera `vigente` de los dos efectos nuevos, con el porqué escrito al
lado. No hacía falta: el popup se monta por persona y `persona.id` no cambia mientras vive, así
que no hay respuesta vieja de otra persona contra la que protegerse. Se sacó también del efecto
de Formación, que hoy no arranca en el montaje pero lo haría en cuanto alguien abra el popup
ahí — `seccionInicial` es un prop público, y dejarlo frágil «porque hoy nadie lo usa así» es
dejar la trampa puesta.

### El recorrido de escritura, ejecutado a mano

Asignar y reasignar **escriben**, así que no pueden entrar a `e2e/`: esos specs sólo leen,
porque corren contra producción por el túnel. Este recorrido se condujo con Playwright desde un
guion suelto, contra la base LOCAL, y borró al final exactamente lo que creó.

```
  1 · Abrir el censo                  -> 1 pendiente(s) en la celda
  2 · Abrir en Pendientes             -> 1 fila listada, con «Empezado; el curso no
                                          reporta avance» — la regla D-5, en vivo
  3 · Llenar el panel de asignar      -> ACE-SIG-01 · Aceptación de las políticas,
                                          vence 2026-10-31, con motivo
  4 · Asignar                         -> «Asignada a Daniel Medina: aparece en su
                                          bandeja de Mi SIG.» · la lista pasa a 2
  5 · SEGUNDA del mismo mes (2026-10) -> OK · la lista pasa a 3
  6 · Fecha pasada y sin motivo       -> RECHAZADA, con las dos razones
  7 · Reasignar las 3                 -> «3 asignaciones reasignadas a Albeiro Medina.»
  8 · La lista tras reasignar         -> 0 filas
```

**El paso 5 es el que cierra el círculo.** La migración ya estaba probada al nivel del índice;
esto comprueba que el flujo real —el botón, la acción, la transacción y la bitácora— tampoco
choca. Con el índice viejo, esa segunda asignación habría tumbado la operación entera.

El paso 4 muestra además que la lista se refresca sola: a los 800 ms todavía se ve la lista
vieja con 1 fila, a los 2 000 ms ya hay 2 y el mensaje de éxito. No hay que recargar la
pantalla.

**Estado de la base al terminar**, comprobado y no afirmado: las mismas 2 asignaciones de
antes, con sus dueños originales, y 0 filas de bitácora de `asignacion`.

### Lo que **no** se ejecutó

Nada de este cambio queda sin ejercitar. Lo que sigue pendiente es de otro orden: el spec de
punta a punta corrió contra la base **local sembrada**, con 9 personas y 2 asignaciones, no
contra el censo real de 91 personas por el túnel. Los conteos que comprueba son relativos —la
columna contra la lista— así que el tamaño no cambia lo que prueba, pero conviene correrlo una
vez contra datos reales antes de mergear.

### Tres desviaciones entre esta spec y el código

Vale la regla de la casa: el código manda sobre lo que el sistema hace, la spec sobre lo que
debería hacer. Acá los tres casos son mejoras y la spec queda corregida a lo construido.

1. **`fraseSinProgreso` devuelve `string | null`, no `string`.** `null` es «no hay nada que
   explicar» —una lectura no habla de avance en absoluto— y es distinto de una cadena vacía.
2. **`avanceDelCurso` es el punto de entrada único**, y `progresoDeCurso` / `fraseSinProgreso`
   quedan expuestas sólo para probarlas. El caso torcido —un curso de clase `ENLACE` con
   intentos colgados— sólo se resuelve bien si una sola función mira las dos cosas a la vez.
3. **No existe `pendientes-coherentes.test.ts`.** La coherencia entre el número de la columna
   y el largo de la lista se sostiene con el predicado escrito idéntico en los tres lugares,
   cada uno con el comentario que dice por qué no puede cambiar, y **se comprueba en el paso 4
   del spec de punta a punta**, que mide las dos cuentas contra datos reales. Un test que
   compare dos archivos leyendo su texto habría comprobado que dos cadenas coinciden, no que
   dos consultas cuentan lo mismo.

### Archivos

Nuevos: `lib/sig/formacion.ts`, `lib/sig/asignacion-manual.ts`, `lib/sig/pendientes-libro.ts`,
`app/sig/acciones/persona-actividad.ts`, `app/api/sig/exportar-pendientes/route.ts`,
`app/sig/personas/PendientesPersona.tsx`, `app/sig/personas/FormacionPersona.tsx`,
`prisma/migrations/20260918120000_asignacion_manual/`, `e2e/personas.spec.ts`, y las tres
suites de prueba.

Modificados: `censo.query.ts` (pierde `abiertas`, gana el catálogo de contenidos),
`Personas.client.tsx` (botón rotulado, `seccionInicial`, deja de armar el pie),
`PopupPersona.tsx` (dos pestañas, carga a nivel de popup, `SeccionDelPopup` exportado),
`BloqueoCuenta.tsx` (recibe los pendientes por prop), `tareas.ts` (`asignarAPersona`),
`Colaboradores.client.tsx` (`destinos` en vez de `pieDeDatosBase`), `prisma/schema.prisma`
(la nota de que el índice es parcial en la base).

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
  hoy mirando persona por persona. Es una pantalla, no una pestaña, y es también donde
  viviría el asignar en lote que A-7 deja afuera.
- Los **dos defectos** de `metricas.ts` y `hallazgos.ts` documentados arriba. Op-2 los cierra
  de paso; si Op-2 no entra, quedan abiertos y necesitan su propio arreglo.
- `app/components/sgsi/inventario/InventarioActivos.tsx:1150` le dice al usuario
  «Revis**á** la sesión e intent**á** de nuevo». Es voseo, y `HARNESS.md` lo prohíbe
  explícitamente en el copy visible. Una línea de corrección, ajena a este cambio; se anota
  acá porque la encontré leyendo el patrón de exportación que esta spec copia — y conviene
  que el patrón que se copia no arrastre el defecto.
