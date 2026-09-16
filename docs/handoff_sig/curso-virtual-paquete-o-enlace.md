# REQ-SIG-26 · Cargar el contenido de un Curso Virtual: paquete o enlace

**Fecha:** 16/09/2026 · **Estado:** **construido** el 16/09/2026 en `feat/ajustes-visuales`. D-1, D-2 y D-3 cerradas · **Verificado contra:** el código, no contra las specs.

> **Construido, no ejecutado contra una base.** La migración `20260916140000_curso_virtual_clase` está escrita a mano y **no corrió contra ningún Postgres**: el equipo donde se desarrolló no tiene base. `prisma validate` pasa, `tsc --noEmit` pasa, `eslint` pasa, `next build` pasa y las 2332 pruebas pasan. Lo que falta verificar con base viva está en §13.

## 0 · Qué quedó construido

| Pieza | Dónde |
|---|---|
| `ClaseCurso` y `ContenidoSig.claseCurso` | `prisma/schema.prisma` · migración `20260916140000_curso_virtual_clase` |
| `cambiaElTexto` recibe el tipo (D-2) | `lib/sig/contenidos.ts` · 5 pruebas nuevas |
| `elCursoCierraSolo` — la fuga de §6.3 | `lib/sig/cierre.ts` · 8 pruebas nuevas |
| La compuerta del paquete, con criterio nuevo | `app/sig/acciones/scorm.ts` |
| Validación, alta, edición y compuerta del cierre | `app/sig/acciones/tareas.ts` |
| El alta con las dos clases, y la ficha | `app/sig/contenidos/Contenidos.client.tsx` |
| La clase declarada en la bandeja | `app/mi-sig/bandeja.query.ts` |
| El aviso preciso y el cierre por declaración | `app/mi-sig/PanelCierre.tsx` |
| Pantalla completa del reproductor | `app/mi-sig/curso/[asignacionId]/Player.client.tsx` |

**Dos cosas se construyeron distinto de como las describe el cuerpo de este documento**, y las dos están anotadas donde corresponde: la regla del cierre se extrajo a una función pura en vez de quedar como un `if` dentro de la acción (§6.3), y el aviso de R10 en la ficha dejó de prometer que se sube la versión cuando sólo se corrigió el enlace (§5.2.1).

REQ-SIG-24 creó `CURSO_VIRTUAL` como tipo propio de contenido y construyó el lado del colaborador. **No construyó el lado de quien publica.** Este requerimiento cierra ese hueco y define las dos clases de curso —paquete SCORM y enlace externo— como una elección explícita del alta, no como algo que se adivina de qué campos quedaron vacíos.

---

## 1 · El callejón sin salida que hay hoy

Un `CURSO_VIRTUAL` creado desde la aplicación **no se puede completar por ninguna vía**. No es que falte un campo: faltan las dos.

| Dónde | Qué pasa | Evidencia |
|---|---|---|
| Alta | El formulario tiene ramas para `LECTURA`, `CAPACITACION` y `VERIFICACION`. Para `CURSO_VIRTUAL` no hay ninguna: elegir el chip violeta no cambia nada en pantalla. | `Contenidos.client.tsx:1015-1134` |
| Ficha · paquete | El cargador de zip está detrás de `tipo === 'CAPACITACION'`. Un curso virtual nunca lo ve. | `Contenidos.client.tsx:603` |
| Ficha · enlace | Los campos de documento se renderizan sólo para `LECTURA`, y `guardar()` sólo los envía si el tipo es `LECTURA`. | `Contenidos.client.tsx:520`, `:277-281` |
| Servidor | `subirPaqueteScorm` rechaza cualquier tipo que no sea `CAPACITACION`. | `app/sig/acciones/scorm.ts:53-60` |

Y del otro lado el trabajo **ya está hecho y está esperando**: `PanelCierre.tsx:91` manda todo `CURSO_VIRTUAL` al camino del reproductor, tenga paquete o no, y cuando no hay ni paquete ni enlace muestra *«Este curso todavía no tiene contenido cargado. Avisale a quien lo publicó»* (`:157`).

**El colaborador ve «avisale a quien lo publicó», y quien lo publicó no tiene dónde cargarlo.** Ése es el estado actual, y es el que este requerimiento termina.

### 1.1 · La compuerta del servidor apunta a una premisa que ya se revirtió

El mensaje de rechazo de `scorm.ts:57-58` dice:

> *«sólo una CAPACITACION puede tener paquete SCORM. P1: un curso no es un tipo nuevo de contenido, es una capacitación con paquete.»*

**`P1` es de la spec anterior, y REQ-SIG-24 lo dio vuelta.** El mismo texto sobrevive en `prisma/schema.prisma` sobre la relación `ContenidoSig.paquetes`. No es una compuerta que haya que relajar con cuidado: es una compuerta escrita contra un diseño que ya no rige. Hay que reescribirla **y reescribir el comentario**, porque el comentario es lo que va a hacer que el próximo que pase lo vuelva a cerrar.

### 1.2 · La capa que guarda paquetes ya acepta cursos virtuales

`guardarPaquete` (`lib/sig/scorm-paquete.ts`) **no mira el tipo del contenido**. `scripts/cargar-cursos-virtuales.ts` lo llama directo y sube los zip de los dos cursos virtuales existentes sin tocar la acción del servidor. Es decir: el análisis del manifiesto, la clasificación en `AUTOCONTENIDO`/`DESPACHO`, la extracción de dominios y el versionado del paquete **ya funcionan para este tipo**. Lo único que bloquea es el `if` de la acción y la ausencia del formulario.

Esto acota el trabajo de verdad: **no hay nada que construir en la capa de paquetes.**

---

## 2 · Las dos clases, y por qué no son el mismo curso con otra cara

Un curso virtual llega a la organización de dos maneras, y la diferencia no es de presentación:

**Clase `PAQUETE` — SCORM 2004, se recorre dentro de la aplicación.** El reproductor reporta avance y resultado, el cierre lo hace el curso, la persona retoma donde quedó. La aplicación ve todo.

**Clase `ENLACE` — se abre en la plataforma del proveedor.** La aplicación no ve nada de lo que pasa del otro lado: no hay avance que reanudar ni nota que recibir. **El cierre vuelve a ser una declaración de la persona.**

`PanelCierre.tsx:94-103` ya distingue las dos y dice por qué presentarlas igual sería mentir en los dos sentidos —prometer un seguimiento que no existe, o esconder el que sí existe—. **El alta tiene que preguntar cuál de las dos es, con esas mismas palabras**, porque de esa respuesta depende si el registro de ese curso es evidencia de que se hizo o la declaración de alguien de que lo hizo. Un auditor necesita poder separarlas.

---

## 3 · D-1 · La clase se declara — **cerrada (16/09/2026)**

Hoy la clase se **infiere de qué campos quedaron vacíos** (`PanelCierre.tsx:103`):

```
const externo = !tarjeta.tienePaqueteScorm && tarjeta.documentoUrl !== null;
```

Eso deja un estado que no se puede leer: **un curso sin paquete y sin enlace no dice si le falta el zip o le falta la URL.** Es la misma confusión entre «no sé» y «cero» que este repo no admite en ninguna otra parte, y hoy ya tiene una fila real: el «Inducción Corporativa Cuantico» que crea `20260915220000_cursos_virtuales` nace sin las dos cosas (§8).

**La clase se declara.** Se elige en el alta, se guarda en el modelo y se puede cambiar desde la ficha. No se infiere de nada.

### 3.1 · El modelo

```prisma
enum ClaseCurso {
  /// SCORM 2004. El curso vive dentro de la aplicación, el reproductor reporta avance y
  /// resultado, y la asignación la cierra el curso.
  PAQUETE
  /// El curso vive en la plataforma del proveedor. La aplicación no ve nada de lo que pasa
  /// del otro lado, y por eso el cierre vuelve a ser una declaración de la persona.
  ENLACE

  @@map("clase_curso")
}
```

En `ContenidoSig`, junto a los campos de `CAPACITACION`:

```prisma
  // CURSO_VIRTUAL · REQ-SIG-26
  /// Cuál de las dos clases de curso es. `NULL` en todo lo que no sea CURSO_VIRTUAL.
  ///
  /// Se declara y no se deriva de si hay paquete o URL cargados: sin este campo, un curso
  /// al que todavía no le subieron nada es indistinguible de uno al que le falta el
  /// enlace, y el aviso que lee el colaborador no puede decir qué falta.
  claseCurso ClaseCurso? @map("clase_curso")
```

**Nullable a propósito.** No hay valor por defecto en la base: un `LECTURA` con `claseCurso = 'PAQUETE'` sería una mentira tipada. El invariante que hay que sostener es **`claseCurso IS NOT NULL` si y sólo si `tipo = 'CURSO_VIRTUAL'`**, y lo sostiene la validación del servidor (§6.2), no una restricción de la base.

### 3.2 · La migración

Una sola, y **puede ir en una sola transacción**: la restricción que obligó a separar `20260915180000_curso_virtual` es la de `ALTER TYPE ... ADD VALUE`, que no aplica acá porque `clase_curso` es un tipo **nuevo**. Crear un enum y usarlo en la misma transacción es correcto.

Los tres pasos, en orden:

1. `CREATE TYPE "clase_curso" AS ENUM ('PAQUETE', 'ENLACE');`
2. `ALTER TABLE "contenido_sig" ADD COLUMN "clase_curso" "clase_curso";`
3. **El backfill**, que es el paso que no se puede olvidar:

```sql
UPDATE "contenido_sig" SET "clase_curso" = 'PAQUETE' WHERE "tipo" = 'CURSO_VIRTUAL';
```

Los dos cursos virtuales que existen son de clase paquete (§8). Dejarlos en `NULL` los pone en un estado que la aplicación no sabe mostrar y que la validación considera inválido: el backfill **no es limpieza, es parte de la migración**.

Como las anteriores de esta tanda, se escribe a mano y hay que anotar en el encabezado si se ejecutó contra alguna base o no.

### 3.3 · Lo que se descartó, y por qué queda anotado

La alternativa era **no tocar el esquema**: exigir en la validación que un curso de clase enlace tenga `documentoUrl` y derivar la clase de su presencia. Funciona —la derivación queda completa si la validación cierra los huecos— y se descartó por tres costos concretos:

- `documentoUrl` haría dos trabajos distintos: referencia opcional en `LECTURA`, discriminador de clase en `CURSO_VIRTUAL`.
- La ausencia seguiría significando dos cosas durante toda la ventana entre crear el contenido y subir el zip.
- El mensaje de qué falta se escribiría por inferencia, que es justamente lo que el colaborador necesita que sea exacto.

Queda escrito para que nadie lo vuelva a proponer sin saber qué se pesó.

---

## 4 · El alta · `NuevoContenido`

Cuando el tipo elegido es `CURSO_VIRTUAL`, el formulario muestra un selector de clase y, debajo, **sólo los campos de la clase elegida**. Nada de mostrar las dos y dejar que el usuario adivine cuál gana.

### 4.1 · El selector

Dos opciones, con el texto que explica la consecuencia —no sólo el nombre—:

| Opción | Texto de apoyo |
|---|---|
| **Paquete SCORM** | Se recorre dentro de la aplicación. El curso reporta el avance y el resultado, y la asignación **se cierra sola**. |
| **Enlace externo** | Se abre en la plataforma del proveedor. Desde acá no se ve el avance, así que **al terminarlo la persona lo declara**. |

Por defecto: **Paquete SCORM**. Es la clase de los dos cursos que la organización ya tiene y la única que produce evidencia verificable.

### 4.2 · Clase `ENLACE` — se completa en un paso

Dos campos: **Plataforma** (`documentoNombre`, p. ej. «Coursebox») y **Enlace del curso** (`documentoUrl`).

- La URL es **obligatoria** para esta clase: un curso de enlace sin enlace no es un curso incompleto, es un curso que no existe.
- Debe empezar por `https://`. No es cosmético: la pestaña se abre desde una sesión autenticada del SIG.
- El contenido nace **completo**. El colaborador puede abrirlo apenas se le asigne.

### 4.3 · Clase `PAQUETE` — dos pasos que hay que contar como dos

El campo de archivo va en el formulario de alta, y **el envío son dos llamadas, no una**: `crearContenido` primero —que es quien emite el código `CUR-00x`— y `subirPaqueteScorm` después, con el id que devuelve.

Eso obliga a tres cosas:

1. **`crearContenido` tiene que devolver el id.** Hoy devuelve `{ ok, mensaje }` (`tareas.ts:634`). Agregar `id` a la respuesta del camino feliz es el cambio mínimo; no hace falta tocar `Resultado` para el resto de las acciones.

2. **El mensaje tiene que decir cuál de los dos pasos falló.** Si el contenido se creó y el paquete no pasó el análisis, el contenido **existe y se queda**: no se borra. El aviso dice, textualmente, que el contenido `CUR-00x` quedó creado, que el paquete no se aceptó, cuál fue el motivo que devolvió el analizador, y que se sube desde la ficha. Un «no se pudo crear el contenido» ahí sería falso, y el que lo lea va a intentar crearlo de nuevo y va a terminar con dos.

3. **El archivo es opcional en el alta.** Se puede crear el curso ahora y subir el zip cuando el proveedor lo entregue. Si se crea sin archivo, el formulario lo dice: *«El curso queda creado sin contenido y nadie va a poder iniciarlo hasta que subas el paquete desde la ficha.»* Esa frase es el contrato con el colaborador que después va a leer «avisale a quien lo publicó».

### 4.4 · Lo que el alta **no** hace

No valida el zip en el cliente. Ni la edición, ni el número de SCO, ni el tamaño: todo eso lo decide `guardarPaquete` en el servidor y devuelve el motivo en palabras. Una validación de cliente que adivine reglas SCORM va a divergir de la real, y la divergencia se descubre con una persona frente a un curso que no abre.

---

## 5 · La ficha · `Contenidos.client.tsx`

### 5.1 · El cargador de paquetes

`Contenidos.client.tsx:603` pasa de `tipo === 'CAPACITACION'` a **`CAPACITACION` o `CURSO_VIRTUAL` de clase `PAQUETE`**. Un curso virtual de clase `ENLACE` no muestra el cargador: no tiene paquete que subir y ofrecerlo insinúa que tiene sentido.

El componente `PaquetesScorm` **se reusa tal cual**. Todo lo que ya dice —la advertencia de despacho antes de subir, la tabla de versiones, la frase de que la huella cubre la cáscara y no el curso— aplica igual y ya está escrito. Lo único que hay que revisar es el párrafo de `:685-691`, que dice «esta capacitación»: el texto tiene que nombrar lo que es en cada caso.

### 5.2 · Los campos de enlace

Para `CURSO_VIRTUAL` de clase `ENLACE`, la ficha muestra **Plataforma** y **Enlace**, y `guardar()` tiene que **enviarlos** —hoy la condición de `:277-281` es `tipo === 'LECTURA'`—. El servidor no hay que tocarlo: `editarContenido` ya acepta `documentoUrl` para cualquier tipo.

### 5.2.1 · D-2 · Corregir el enlace **no** sube la versión — cerrada (16/09/2026)

Hoy `cambiaElTexto` (`lib/sig/contenidos.ts:199-212`) mira una lista plana de seis claves, `documentoUrl` y `documentoNombre` entre ellas, sin saber de qué tipo de contenido se trata. Con la ficha de §5.2 construida, **corregir una URL rota de un curso ya asignado subiría la versión del contenido** y le pediría un acuse nuevo a gente que ya lo hizo.

Eso es incorrecto para este tipo: en un curso virtual, `documentoUrl` es **dónde está el curso**, no qué dice. El texto que la persona lee son el título y la descripción, y ésos siguen subiendo la versión como hasta ahora.

**El cambio:** `cambiaElTexto` recibe el tipo del contenido y, cuando es `CURSO_VIRTUAL`, excluye `documentoUrl` y `documentoNombre` de la comparación. Las otras cuatro claves y el resto de los tipos **no cambian de comportamiento** — en particular `LECTURA`, donde cambiar el enlace del documento sí apunta a otro documento y sí tiene que versionar.

Es un módulo puro con pruebas propias: `lib/sig/__tests__/contenidos-version.test.ts` cubre `cambiaElTexto` (líneas 38-65) y la firma nueva rompe esos casos. **Se actualizan las pruebas y se agregan las dos del tipo nuevo**: que cambiar la URL de un `CURSO_VIRTUAL` devuelve `false`, y que cambiar su título devuelve `true`.

### 5.3 · Cambiar de clase después

Se permite, y **no se borra nada**. Un curso que pasa de `ENLACE` a `PAQUETE` conserva su `documentoUrl` en la base aunque deje de usarse: es el rastro de dónde estuvo el curso antes, y los registros cerrados contra la clase anterior siguen explicándose con él. La ficha lo dice cuando hay un paquete y además una URL guardada, para que nadie lea el enlace como el camino vigente.

`claseCurso` se suma a `DatosContenido` y viaja por `crearContenido` y `editarContenido` como un campo más. **Cambiar la clase no sube la versión del contenido** —por la misma razón que D-2: es configuración de dónde vive el curso, no del texto que la persona lee—, así que no entra en la lista de `cambiaElTexto`.

Un cambio de clase **sí deja rastro en la bitácora**, con el valor anterior y el nuevo. Es la clase de cambio que después hay que poder explicar: de ella depende si el registro de una persona es evidencia de que hizo el curso o la declaración de que lo hizo.

### 5.4 · La etiqueta equivocada

`Extra` (`:1213-1328`) resuelve `CAPACITACION`, `VERIFICACION` y `LECTURA`, y **cae por defecto a la de `TAREA`**: un curso virtual muestra hoy «Evidencia · Nota y anexo», que no es nada de lo que ese tipo guarda. Necesita su propia rama: **clase del curso, y el alcance de las asignaciones** —lo mismo que muestran `LECTURA` y `CAPACITACION`, derivado de `usos`—.

---

## 6 · El servidor · las tres compuertas

### 6.1 · `subirPaqueteScorm` — abrirla al tipo nuevo

`scorm.ts:53` pasa a aceptar `CAPACITACION` y `CURSO_VIRTUAL`, **y sigue rechazando `LECTURA`, `VERIFICACION` y `TAREA`**. La compuerta no desaparece: cambia de criterio. El mensaje de rechazo se reescribe sin la cita a `P1`, y el comentario de `ContenidoSig.paquetes` en `prisma/schema.prisma` también.

La acción rechaza además un paquete sobre un curso de clase `ENLACE`, con el motivo dicho: *«este curso está declarado como enlace externo; cambiá la clase en la ficha antes de subir un paquete»*.

### 6.2 · `validarDatosContenido` — la regla de la clase

`tareas.ts:621-631` no tiene ninguna regla para `CURSO_VIRTUAL`. Agregar tres, con la misma forma que la regla de `LECTURA` que ya está ahí:

- **Un `CURSO_VIRTUAL` exige `claseCurso`.** Es el invariante de §3.1 visto desde el lado que lo sostiene.
- **Ningún otro tipo admite `claseCurso`.** Un `LECTURA` que llegue con clase se rechaza; no se ignora en silencio.
- **Un curso de clase `ENLACE` exige `documentoUrl`**, y la URL empieza por `https://`.

La validación vive en el servidor y la pantalla la repite; no al revés.

### 6.3 · El cierre manual de un curso virtual está abierto — **y no lo dice el código, lo dice al revés**

Éste no salió de la pantalla de contenidos, pero sale del mismo tipo y hay que arreglarlo en la misma tanda.

`PanelCierre.tsx:81-83` afirma:

> *«El servidor lo rechaza igual (`app/sig/acciones/tareas.ts`), pero una pantalla que ofrece lo que el servidor niega enseña a desconfiar de la pantalla.»*

**No lo rechaza.** La compuerta de `tareas.ts:130` está escrita así:

```
if (contenido.tipo === 'CAPACITACION' && !esAdministrativo && datos.asistio !== undefined) {
```

Sólo cubre `CAPACITACION`. Y `validarCierre` (`lib/sig/cierre.ts:56-84`) no tiene caso para `CURSO_VIRTUAL`: el `switch` lo atraviesa sin errores y el cierre pasa.

Consecuencia: **un `CURSO_VIRTUAL` con paquete se puede cerrar invocando la acción desde el navegador**, sin asistencia, sin nota y sin un solo intento del reproductor. Es exactamente lo que P14 existe para impedir, y la pantalla lo esconde bien —por eso nadie lo vio—.

**Hay que extender la compuerta a `CURSO_VIRTUAL` de clase `PAQUETE`**, con la excepción de siempre para el cierre administrativo de R5, que es intencional y tiene permiso propio. Un curso de clase `ENLACE` **sí** se cierra por declaración: ahí el cierre manual no es una fuga, es el único mecanismo que hay.

---

## 7 · Cómo queda el panel del colaborador

`PanelCierre` **casi no cambia**, y eso es señal de que la clase estaba bien pensada desde REQ-SIG-24. Lo que cambia:

- `externo` deja de inferirse: sale de `claseCurso === 'ENLACE'`. `tienePaqueteScorm` sigue existiendo, pero ahora responde otra pregunta —si el curso está **completo**—, no cuál es su clase.
- El aviso de contenido faltante se separa en dos, porque ahora se sabe cuál falta: *«Este curso todavía no tiene el paquete cargado»* / *«Este curso todavía no tiene el enlace cargado»*. En los dos casos sigue el «avisale a quien lo publicó», que ahora es una instrucción que alguien puede cumplir.
- El párrafo de `:134-137` dice «Esta capacitación es un curso en línea». Para un `CURSO_VIRTUAL` hay que nombrarlo por lo que es.

### 7.1 · El cierre de un curso de clase enlace, que hoy no existe

El panel ofrece «Abrir el curso ↗» (`:174-186`) y **ningún botón para registrar que se terminó**. La persona abre el curso, lo hace, vuelve, y la asignación le sigue figurando pendiente sin nada que apretar.

> **Esto es trabajo real y no estaba en el diagnóstico inicial.** Un curso de clase enlace no se puede cerrar hoy por ninguna vía desde la interfaz.

**D-3 · Qué pide ese cierre — cerrada (16/09/2026)**

Pide dos cosas, y ninguna es un campo obligatorio más:

1. **Que la pantalla diga qué está firmando.** No «Registrar», sino una declaración explícita: *«Declaro que completé este curso en la plataforma del proveedor. La aplicación no puede verificarlo: este registro vale por lo que declarás.»* Es la diferencia entre lo que un auditor puede afirmar y lo que no, dicha en el momento en que se decide.
2. **Un anexo opcional** para la constancia que emita la plataforma. Coursebox emite certificado; otras no. **Opcional y no obligatorio**: exigirlo bloquearía a quien usa una plataforma que no emite ninguno, y un requisito que no se puede cumplir termina en gente cerrando con una captura de pantalla de cualquier cosa. Ofrecerlo hace que quien lo tiene lo adjunte.

Esto último toca `PanelCierre.tsx:64-67`, donde `archivo` se envía sólo para `TAREA` y `CAPACITACION`: hay que sumar `CURSO_VIRTUAL` de clase `ENLACE`. `cerrarAsignacion` ya guarda el anexo como `Evidencia` con `registroId` para cualquier tipo, así que del lado del servidor no hay nada nuevo.

**No hace falta un campo que marque el registro como «declarado».** Ya se distingue solo: un curso de clase paquete tiene `IntentoScorm`; uno de enlace no tiene ninguno. La pregunta «¿esto lo reportó el curso o lo dijo la persona?» ya tiene respuesta en el modelo.

---

## 8 · Los dos cursos que ya existen

`20260915220000_cursos_virtuales` convierte el curso de código seguro y crea el de inducción. **Los dos nacen sin paquete y sin enlace**, y eso es a propósito: los zip los sube `scripts/cargar-cursos-virtuales.ts`, que pasa por el analizador de verdad en vez de insertar bytes desde SQL.

Dos cosas para el desarrollador:

1. **El encabezado de esa migración está desactualizado.** Dice *«se crea Inducción como curso virtual, **con su enlace de Coursebox**»*, pero el `INSERT` escribe `documento_url` en `NULL` y el diseño que quedó es paquete SCORM de clase despacho apuntando a `my.coursebox.ai`. **La migración es correcta; el comentario miente.** Corregir el comentario, no el SQL: la migración pudo haber corrido ya.

2. **Los dos son de clase `PAQUETE`**, y de ahí sale el backfill de §3.2. El de inducción lo dice su propia descripción —*«se recorre dentro de la aplicación con su paquete SCORM; el contenido lo entrega Coursebox»*—: es un paquete de clase despacho apuntando a `my.coursebox.ai`, no un enlace externo. Las dos cosas se parecen y no son lo mismo: en el despacho la persona **no sale de la aplicación**, el reproductor sigue reportando y el cierre sigue siendo automático.

3. **Se decidió no rescatarlos (16/09/2026).** Los cursos actuales **se van a crear de nuevo desde la aplicación y los anteriores se eliminan**, ahora que el alta existe. Por eso no hay script de reparación ni migración correctiva de datos: el camino de rescate era completar esas dos filas desde la ficha, y con cursos nuevos deja de hacer falta.

   El backfill de §3.2 **se queda igual**, y no por si acaso: mientras la migración corra y los cursos viejos todavía existan, un `CURSO_VIRTUAL` con la clase en `NULL` es una fila que la validación rechaza y que la ficha no sabe dibujar. El backfill los deja consistentes durante ese rato; borrarlos después es una operación aparte.

   `scripts/cargar-cursos-virtuales.ts` queda **obsoleto para cursos nuevos** —sube zips buscando los contenidos por título— pero **no se borró**: sigue siendo la única forma de cargar un paquete sin pasar por el navegador, que es lo que se quiere para un zip grande o para una carga desatendida.

---

## 9 · Lo que **no** hay que hacer

- **No borrar el contenido si falla la subida del paquete.** Queda creado y se completa desde la ficha (§4.3).
- **No convertir `CAPACITACION` con paquete en `CURSO_VIRTUAL`.** REQ-SIG-24 fue explícito: cuál de las capacitaciones existentes es en realidad un curso virtual lo sabe quien las creó, no una regla que mire si hay un zip.
- **No tocar `guardarPaquete`, el analizador de manifiesto, la clasificación de paquete ni el reproductor.** Ya aceptan este tipo (§1.2).
- **No validar el zip en el cliente** (§4.4).
- **No quitar la compuerta de `subirPaqueteScorm`**: se cambia su criterio, no se elimina (§6.1).
- **No emitir código nuevo a un contenido que cambia de clase.** El código es identidad; la clase es configuración.

---

## 10 · Criterios de aceptación

Los de comportamiento, que son los que se pueden probar:

| # | Qué tiene que pasar |
|---|---|
| 1 | Elegir «Curso Virtual» en el alta muestra el selector de clase. Elegir enlace pide URL; elegir paquete ofrece el archivo. |
| 2 | Crear un curso de clase enlace sin URL **falla en el servidor**, no sólo en la pantalla. |
| 3 | Crear un curso de clase paquete con un zip válido deja el contenido **y** el paquete en una sola operación de la persona, con el código `CUR-00x` a la vista. |
| 4 | Crear un curso de clase paquete con un zip inválido deja el contenido creado, **no** el paquete, y el mensaje nombra el código creado y el motivo del rechazo. |
| 5 | La ficha de un curso virtual de clase paquete muestra el cargador; la de clase enlace muestra el enlace. Ninguna muestra «Evidencia · Nota y anexo». |
| 6 | Un paquete subido a un `CURSO_VIRTUAL` produce la misma fila de bitácora, la misma advertencia de despacho y la misma tabla de versiones que uno subido a una `CAPACITACION`. |
| 7 | `subirPaqueteScorm` sobre una `LECTURA`, una `TAREA` o una `VERIFICACION` **sigue fallando**. |
| 8 | Llamar `cerrarAsignacion` desde el navegador sobre un `CURSO_VIRTUAL` con paquete **falla**, y sobre uno de clase enlace **funciona**. |
| 9 | Un curso de clase enlace se puede cerrar desde el panel del colaborador (§7.1), y la pantalla dice que es una declaración antes de que la persona la haga. |
| 10 | El colaborador de un curso sin contenido lee cuál de las dos cosas falta. |
| 11 | Corregir la URL de un curso virtual ya asignado **no** sube la versión. Corregir su título **sí**. |
| 12 | Crear un `LECTURA` enviando `claseCurso` falla; crear un `CURSO_VIRTUAL` sin clase falla. |

Y las cifras que cuadran al final:

| | |
|---|---:|
| `contenido_sig where tipo = 'CURSO_VIRTUAL' and clase_curso is null` | **0** |
| `contenido_sig where tipo <> 'CURSO_VIRTUAL' and clase_curso is not null` | **0** |
| cursos virtuales que no se pueden completar desde la aplicación | **0** (hoy: todos) |

---

## 11 · Orden sugerido

| # | Bloque | Por qué en ese lugar |
|---|---|---|
| 1 | §3.2 — la migración y su backfill | Todo lo demás lee `claseCurso`. Va primero, y con el backfill adentro. |
| 2 | §6.1 y §5.1 — abrir la compuerta y mostrar el cargador en la ficha | Desbloquea los dos cursos que ya existen. Es el camino más corto a que algo funcione de verdad. |
| 3 | §6.3 — la compuerta del cierre | Es una fuga abierta. No se deja para el final. |
| 4 | §5.2 con §5.2.1, §5.3, §5.4 — enlace, versión, clase y etiqueta en la ficha | Completa la ficha antes de tocar el alta. El cambio de `cambiaElTexto` arrastra pruebas. |
| 5 | §4 — el alta | El formulario nuevo se apoya en todo lo anterior, y su camino de dos pasos necesita que la ficha ya sepa recibir el paquete que falló. |
| 6 | §7 y §7.1 — el panel del colaborador | Cierra el circuito. Confirmar D-3 antes de empezar §7.1. |

Cada bloque deja la aplicación en un estado usable. Si hay que parar en el 3, lo construido sirve: los dos cursos que existen quedan completables y la fuga del cierre queda tapada.

---

## 12 · Decisiones

| | Qué | Estado |
|---|---|---|
| **D-1** | La clase del curso se **declara** en el modelo (`ContenidoSig.claseCurso`), no se deriva de qué campos quedaron vacíos. §3 | **Cerrada** · 16/09/2026 |
| **D-2** | Corregir el enlace de un curso virtual ya asignado **no** sube la versión del contenido; corregir su título o su descripción sí. §5.2.1 | **Cerrada** · 16/09/2026 |
| **D-3** | El cierre de un curso de clase enlace pide una **declaración explícita con sus palabras** y admite un **anexo opcional** para la constancia del proveedor. §7.1 | **Cerrada** · 16/09/2026 |

**No quedan decisiones abiertas.**

---

## 13 · Lo que falta verificar, y no se puede verificar sin base

Todo lo de abajo está construido y **ninguna de estas afirmaciones se comprobó contra un Postgres vivo**, porque el entorno donde se desarrolló no tiene base. Son las pruebas que hay que correr en desarrollo antes de considerarlo terminado, y están en orden de qué duele más si falla.

1. **La migración aplica.** `npx prisma migrate deploy` sobre una base con los cursos virtuales de `20260915220000_cursos_virtuales` ya creados. Después: `SELECT tipo, clase_curso, count(*) FROM contenido_sig GROUP BY 1,2` — ningún `CURSO_VIRTUAL` con `clase_curso` nula, ningún otro tipo con clase no nula.
2. **El alta de dos pasos con un zip que falla.** Crear un curso de clase paquete con un zip inválido a propósito: el contenido tiene que quedar creado, con su código en el aviso, y el paquete no. Es el camino que produce datos raros si está mal, y el único que no se puede probar sin subir un archivo de verdad.
3. **La fuga del cierre, cerrada.** Invocar `cerrarAsignacion` desde la consola del navegador sobre un `CURSO_VIRTUAL` de clase paquete: tiene que fallar. Sobre uno de clase enlace: tiene que funcionar. `elCursoCierraSolo` está probada, pero lo que estas pruebas no cubren es que la acción la llame con los datos correctos.
4. **La bitácora del cambio de clase** escribe una fila con el valor anterior y el nuevo.
5. **La pantalla completa del reproductor**, que depende del navegador y no de nosotros: entrar, salir con Escape, y comprobar que el rótulo del botón acompaña —se lee de `fullscreenchange` justamente para eso—.
6. **Un curso de más de una hora sin interrupciones**, para el token renovado (`player-scorm-2004.md` §16.3 a). Las pruebas cubren la vigencia y la renovación por separado; lo que no cubren es una máquina que se suspende a mitad del curso.

---

## 14 · Dependencia de despliegue que este requerimiento NO resuelve

Un curso virtual de clase `PAQUETE` **no abre en ningún entorno hoy**, y no por nada de REQ-SIG-26: el player exige un origen de contenido aparte (`SCORM_ORIGEN_CONTENIDO` y `SCORM_ORIGEN_APP`) y esas variables no están configuradas en ninguna parte. Hace falta subdominio, DNS, certificado y el `server` de nginx que ya está de ejemplo en `deploy/origen-cursos.nginx.example`.

Queda dicho acá porque es lo que va a pasar al probar: se crea el curso, se sube el paquete, y al iniciarlo aparece *«SCORM_ORIGEN_CONTENIDO no está configurado»*. Eso **no es un defecto de este requerimiento** — es el despliegue que falta. Los detalles, en `player-scorm-2004.md` §16.4.

La clase `ENLACE` sí funciona sin nada de eso: el curso se abre en la plataforma del proveedor y no pasa por el player.
