# Requerimiento · Player de SCORM 2004 para ejecutar cursos dentro del SIG

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-14 · player SCORM 2004 |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-08 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo (ejecución asistida con Claude Code) |
| **Extiende** | REQ-SIG-02 (contenidos, asignaciones y cierre) · `docs/handoff_a/contenidos-capacitacion.md` |
| **Paquete de prueba** | `scorm_package_2004.zip` (18 KB, 17 archivos) · **verificado**, ver §2 |
| **Estado** | Decisiones D-1 a D-5 cerradas (§12) · listo para ejecutar. **D-4 quedó decidida el 08/09/2026** (correo y nombre); lo único abierto es si existe cobertura contractual para la transferencia a un proveedor de cursos, y eso no bloquea la construcción. |

---

## 1 · Objetivo

Que una capacitación del SIG se **ejecute dentro de la aplicación** y que su resultado —completó, aprobó, con qué nota, cuánto tiempo, en qué intento— **cierre la asignación por sí solo**, sin que nadie transcriba a mano lo que un curso ya sabe.

Hoy una `CAPACITACION` se cierra declarando `asistio` y `calificacion` en un formulario (`app/sig/acciones/tareas.ts:209-213`). Es una **afirmación de la persona sobre sí misma**. Un player de SCORM convierte eso en un hecho medido por el contenido: es la diferencia entre «dice que hizo el curso» y «el curso reportó que lo terminó y con cuánto».

---

## 2 · Lo que reveló el paquete de prueba (leerlo antes de estimar)

Descomprimí y leí el paquete. Los hechos, verificados:

| Hecho | Evidencia en el paquete |
|---|---|
| Es SCORM **2004 3rd Edition** | `imsmanifest.xml:16` → `<schemaversion>2004 3rd Edition</schemaversion>` |
| Un **solo SCO**, una organización, un objetivo primario | `<item identifier="it1">` con `identifierref="c1"`; `resource … scormType="sco" href="index.html"` |
| El SCO **fija por contenido** su completitud y su resultado | `deliveryControls tracked="true" completionSetByContent="true" objectiveSetByContent="true"` |
| Trae reglas de *rollup* propias | `imsss:rollupRules` — con un comentario que dice que existen para corregir el comportamiento por defecto de **SCORM Cloud** |
| **El curso NO está en el paquete** | `index.html` son 22 líneas: carga `https://my.coursebox.ai/assets/scripts/scormxd-driver.min.js` y abre un `<iframe>` contra `https://my.coursebox.ai/scormxd/access?course_token=…&student_id=LEARNER_ID&student_name=LEARNER_NAME` |
| Los 15 archivos restantes son los **XSD** del estándar | `adlcp_v1p3.xsd`, `imsss_v1p0*.xsd`, … — esquemas, no contenido |

**Esto no es un curso autocontenido: es un paquete de despacho** («dispatch»). El `.zip` es una cáscara de 18 KB que delega el contenido a Coursebox. Tres consecuencias que ningún diseño puede ignorar:

1. **Necesita internet y una excepción explícita de CSP.** El SCO carga *script* y *iframe* de un tercero. Un player que sirva el contenido con una CSP cerrada —lo correcto para contenido no confiable— **muestra una pantalla en blanco** con este paquete. La lista de dominios permitidos tiene que ser configuración, y tiene que ser una decisión consciente por curso.

2. **La huella del paquete no congela el curso.** REQ-SIG-02 · F3 guarda el SHA-256 de lo que se mostró, «porque *acepté la versión 2* no prueba nada si el archivo cambió después». En un paquete de despacho el hash cubre **la cáscara**, no el contenido: Coursebox puede cambiar el curso mañana y el hash seguirá idéntico. **La app debe decirlo**, no simularlo (D-1).

3. **El nombre y el identificador de la persona viajan a un tercero.** `student_id=LEARNER_ID&student_name=LEARNER_NAME` son marcadores que el *driver* sustituye con `cmi.learner_id` y `cmi.learner_name`. Es decir: **lo que la app ponga en esos dos campos se transmite a `my.coursebox.ai`**. Eso es tratamiento —y probablemente transferencia internacional— de datos personales. Es D-4, y no la decide el desarrollo.

**Lo que este paquete sí prueba, y es útil:** el player no necesita descomprimir ni servir contenido para funcionar con despachos. Le basta **exponer correctamente la API de SCORM 2004** en la cadena de ventanas: el *driver* de Coursebox hace el puente entre su iframe remoto y `API_1484_11`. Es el mejor primer caso de prueba, porque ejercita la API y nada más. **Pero no ejercita el camino de los paquetes autocontenidos**, que es el que la mayoría de los cursos del SIG va a usar. Hay que probar con los dos (§13).

---

## 3 · Dónde encaja: no hay un tipo nuevo de contenido

**P1 · un curso SCORM es una `CAPACITACION` con paquete, no un `TipoContenido` nuevo.** Es la misma regla que ya rige para `exigeFirma`, documentada en el esquema: «hacerlo un tipo obligaría a duplicar cada contenido que además necesite firmarse». Un curso SCORM también puede exigir firma, también entra en una obligación, también genera asignaciones y también se reporta en la bandeja. Un tipo nuevo duplicaría las cinco cosas.

Lo que se agrega a `ContenidoSig` es la referencia al paquete, en el mismo lugar donde ya viven `duracionHoras`, `modalidad`, `exigeEvaluacion` y `notaMinima`.

**P2 · la versión del contenido congela el paquete.** `VersionContenido` ya copia la referencia al documento al publicar. Se le agrega `paqueteScormId`: un registro de realizado contra «Codificación Segura v2» tiene que seguir apuntando al paquete que se ejecutó, aunque mañana se suba una v3. Sin esto, el historial de capacitación deja de ser verificable en el momento en que alguien actualiza un curso.

---

## 4 · Arquitectura del player

Tres documentos y una frontera de origen. La frontera es el punto del diseño.

```
┌─ sig.cuantico.com ───────────────────────────────────────────────┐
│  /mi-sig/curso/<asignacionId>        (página del player)          │
│  · barra de progreso, tiempo, botón «Salir y guardar»             │
│  · el ÚNICO que habla con el servidor (server actions + Prisma)   │
│                                                                   │
│  ┌─ cursos.sig.cuantico.com ─ ORIGEN DISTINTO ─────────────────┐  │
│  │  /runner?intento=<token>          (el shim de la API)        │  │
│  │  · define window.API_1484_11 con las 8 funciones             │  │
│  │  · traduce cada llamada a postMessage contra el padre        │  │
│  │                                                              │  │
│  │  ┌─ mismo origen que el runner ─────────────────────────┐    │  │
│  │  │  index.html del SCO                                   │    │  │
│  │  │  · encuentra API_1484_11 subiendo por window.parent   │    │  │
│  │  │  · (en un despacho, abre su propio iframe al tercero) │    │  │
│  │  └───────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

**P3 · el contenido del curso se sirve desde un origen distinto al de la aplicación.** No es una preferencia: es la única forma de aislarlo.

Un SCO es **JavaScript de un tercero**. Si se sirve desde `sig.cuantico.com`, ese JavaScript corre **en el origen de la aplicación**: puede leer el `localStorage`, invocar las *server actions* con la sesión de quien está viendo el curso, y leer cualquier pantalla del SIG con los permisos de esa persona. Es una vulnerabilidad de tipo XSS con permiso de fábrica, dentro de la herramienta que gestiona la seguridad de la información.

**Y el `sandbox` del iframe no resuelve esto.** Sin `allow-same-origin`, cada documento sandbox recibe un origen opaco y **distinto**, así que el SCO no podría alcanzar `API_1484_11` del runner: SCORM exige acceso a JavaScript por la cadena de padres y el aislamiento opaco lo rompe. Y `allow-scripts` junto con `allow-same-origin` anula el sandbox por definición del estándar. Por eso el aislamiento tiene que ser **por origen**, que es además cómo lo hacen las plataformas comerciales.

Condiciones que el origen aparte impone, y hay que cumplirlas o no sirve de nada:

- **Las cookies de sesión deben seguir siendo *host-only*.** NextAuth no fija `Domain` por omisión, así que hoy no se envían a subdominios. Si alguien alguna vez pone `Domain=.cuantico.com`, el aislamiento desaparece en silencio. Dejarlo dicho en el `.env.example`.
- **El origen del curso no monta la aplicación**: solo dos rutas, `/runner` y el servidor de archivos del paquete. Nada de Prisma, nada de sesión.
- El `postMessage` valida **siempre** `event.origin` contra la lista blanca, en las dos direcciones. Un `origin: '*'` acá es entregarle la API a cualquier página que logre abrir el runner en un iframe.

**P4 · cada ejecución lleva un token de intento de un solo uso.** El runner no recibe `asignacionId`: recibe un token firmado (mismo mecanismo que `firmarAnexo` en `lib/sgsi/anexo-archivo.ts`) que el servidor canjea por el intento. Sin esto, cambiar un número en la URL sería suficiente para escribir en el intento de otra persona.

**P5 · el player no acepta el resultado que le llega por `postMessage` sin validarlo.** El mensaje dice qué elemento del modelo de datos se está fijando y con qué valor; el **servidor** decide si ese elemento es escribible, si el valor cumple su tipo y si el intento está abierto. Un cliente puede mandar `cmi.success_status=passed`; el servidor tiene que poder rechazarlo si el intento ya está cerrado, y tiene que registrar el intento de escritura.

---

## 5 · Dónde se guarda el paquete

**D-2 · los archivos del paquete van a Postgres, como los anexos.**

Y hay un hecho del despliegue que lo decide: **el contenedor de la aplicación no tiene volumen.** `docker-compose.prod.yml:68-84` persiste únicamente `sgi-postgres-data`. Todo lo que la app escriba en su sistema de archivos **desaparece en el siguiente despliegue** — y los despliegues son frecuentes. Un curso descomprimido en `var/scorm/` estaría ahí hasta el próximo `git push`, y después la capacitación obligatoria de toda la organización devolvería 404 sin que nadie hubiera tocado nada.

Súmese que el disco del servidor **ya está en el límite**: el *workflow* de despliegue tuvo que agregar poda de Docker y un preflight que falla temprano por falta de espacio (`3a0a313`, `fc989f1`, `5e83477`). Un curso autocontenido pesa entre 20 y 500 MB. Postgres, además, ya está respaldado (`deploy/respaldo-postgres.sh`); un directorio suelto no.

- `SCORM_TAMANO_MAX_MB` (por omisión **200**) acota el `.zip`, y el límite se valida **antes** de descomprimir.
- Los archivos se sirven con `Cache-Control: public, max-age=31536000, immutable` y `ETag` por SHA-256: se leen de Postgres una vez por archivo y por despliegue, no una vez por vista.
- Si el volumen llega a doler, el paso siguiente es publicar el paquete a SharePoint (REQ-SIG-13 ya deja el camino abierto) y servirlo desde ahí. No hace falta ahora, y hacerlo ahora agrega una dependencia de red al camino crítico de ver un curso.

**P6 · descomprimir es un camino hostil y se trata como tal.** Un `.zip` subido por alguien puede traer `../../etc/passwd` en un nombre de archivo (*zip slip*), 40 000 archivos, o 10 GB comprimidos en 2 MB (*bomba zip*). Reglas: rechazar toda entrada cuya ruta normalizada salga del directorio del paquete; techo de archivos (2 000) y de tamaño descomprimido (`SCORM_TAMANO_MAX_MB` × 4); nada de enlaces simbólicos; y `imsmanifest.xml` **obligatorio en la raíz** o el paquete se rechaza con el motivo a la vista.

**P7 · el XML del manifiesto se parsea sin resolver entidades externas.** Un `imsmanifest.xml` con una entidad `SYSTEM "file:///etc/passwd"` es el ataque XXE, y acá el archivo lo sube un humano. Si el parser elegido admite `resolveExternalEntities`, va en `false` y con una prueba que lo demuestre.

---

## 6 · La API de ejecución (SCORM 2004 3rd Edition)

`window.API_1484_11` con las ocho funciones del estándar. Ni una más, ni una menos:

| Función | Obligación |
|---|---|
| `Initialize("")` | Abre la sesión. Una sola vez por intento; la segunda devuelve `103` |
| `Terminate("")` | Cierra la sesión. Persiste y acumula `total_time`. Después, todo devuelve `112`/`113` |
| `GetValue(elemento)` | Antes de `Initialize` → `122`. Elemento inexistente → `401` |
| `SetValue(elemento, valor)` | Elemento de solo lectura → `404`. Tipo inválido → `406`. Fuera de rango → `407` |
| `Commit("")` | Persiste. **Es el único punto donde el servidor escribe de verdad** |
| `GetLastError()` · `GetErrorString(n)` · `GetDiagnostic(n)` | El código, la frase del estándar, y el detalle nuestro |

**P8 · los códigos de error se implementan, no se aproximan.** Como mínimo: `0, 101, 102, 103, 104, 111, 112, 113, 122, 123, 132, 133, 142, 143, 201, 301, 351, 391, 401, 402, 403, 404, 405, 406, 407, 408`. Un curso bien hecho **ramifica según el código**: devolver siempre `101` hace que el curso decida mal y que el defecto parezca del curso. Es la misma lección de `lib/sgsi/graph-fallo.ts`: un error que significa cinco cosas manda a la gente a arreglar lo que no está roto.

Elementos del modelo de datos, con su nivel de soporte exigido:

| Elemento | Acceso | Notas |
|---|---|---|
| `cmi._version` | R | `1.0` |
| `cmi.learner_id` · `cmi.learner_name` | R | `Persona.correo` y `Persona.nombre` (D-4). En un paquete `DESPACHO` **salen hacia el tercero** |
| `cmi.completion_status` | RW | `completed` · `incomplete` · `not attempted` · `unknown` |
| `cmi.success_status` | RW | `passed` · `failed` · `unknown` |
| `cmi.score.scaled` | RW | `-1..1`. **Es la que manda** para la nota (§8) |
| `cmi.score.raw` · `.min` · `.max` | RW | Se guardan; solo se usan si no hay `scaled` |
| `cmi.progress_measure` | RW | `0..1`. Alimenta la barra de progreso |
| `cmi.session_time` | W | Duración ISO 8601 (`PT1H23M45S`) |
| `cmi.total_time` | R | **Lo acumula el LMS**, no el curso |
| `cmi.location` | RW | Hasta 1 000 caracteres |
| `cmi.suspend_data` | RW | **Hasta 64 000 caracteres.** Columna `Text`, no `VarChar` |
| `cmi.entry` | R | `ab-initio` · `resume` · `""` (§7) |
| `cmi.exit` | W | `time-out` · `suspend` · `logout` · `normal` · `""` |
| `cmi.credit` | R | `credit` |
| `cmi.mode` | R | `normal` · `review` · `browse` (§7) |
| `cmi.launch_data` | R | Del `<adlcp:dataFromLMS>` del manifiesto, si existe |
| `cmi.scaled_passing_score` · `cmi.completion_threshold` | R | Del manifiesto. **Informativos**: el aprobado del SIG lo decide `notaMinima` (§8) |
| `cmi.objectives.n.*` | RW | Colección completa: `id`, `success_status`, `completion_status`, `score.*`, `description` |
| `cmi.interactions.n.*` | RW | Colección completa. Es la evidencia fina de una evaluación: qué preguntó, qué respondió |
| `cmi.comments_from_learner.n.*` | RW | |
| `adl.nav.request` · `adl.nav.request_valid.*` | RW / R | Con un solo SCO: `exit` y `exitAll` terminan; `continue`/`previous` devuelven `unsupported` |

**P9 · las colecciones se implementan con `_count` y `_children` de verdad.** Escribir `cmi.objectives.3.id` cuando `_count` es 1 debe dar `351` (fuera de orden), no aceptarse en silencio. Un curso que pregunta `_count` y recibe basura escribe basura.

---

## 7 · Suspender y reanudar

**P10 · un intento suspendido se reanuda; no se empieza de nuevo.** Si el intento anterior terminó con `cmi.exit=suspend`, el siguiente lanzamiento entrega `cmi.entry=resume` y **devuelve** `location`, `suspend_data`, `objectives`, `interactions` y `total_time` tal como quedaron. Perder `suspend_data` es perder el avance de la persona en un curso de 40 minutos, y eso se paga con que nadie lo vuelva a intentar.

**P11 · `exit=normal` o `logout` cierra el intento; el siguiente lanzamiento es un intento nuevo** (`entry=ab-initio`), con su propia fila. Los intentos **no se sobreescriben**: el historial de cuántas veces alguien intentó una capacitación y con qué resultado es justamente lo que un auditor pregunta.

**P12 · después de cerrada la asignación, el curso se puede volver a abrir en `mode=review`,** que no escribe nada y no crea intento. Que alguien quiera repasar la capacitación que ya aprobó no debería obligarlo a arriesgar su registro.

**P13 · el cierre del navegador no pierde la sesión.** Muchos cursos no llaman `Terminate` si se cierra la pestaña. El player hace `Commit` automático cada 60 segundos y en `visibilitychange`/`pagehide`, y un trabajo programado marca `ABANDONADO` los intentos sin actividad por más de 12 horas —conservando lo comprometido— para que un intento colgado no bloquee el siguiente.

---

## 8 · Cómo cierra la asignación

**P14 · el cierre lo hace el player, y la persona no puede escribirlo a mano.** Cuando una `CAPACITACION` tiene paquete, el formulario de `asistio`/`calificacion` **se retira** de su panel de cierre. Dejar los dos caminos abiertos permitiría declararse aprobado en el curso que no se abrió, y anularía la razón de ser de este requerimiento.

Mapeo, al recibir `Terminate` o el `Commit` que completa el curso:

| Lo que reporta el SCO | Lo que se escribe en `RegistroRealizado` |
|---|---|
| `completion_status = completed` | `asistio = true` |
| `success_status = passed` | `aprobado = true` |
| `success_status = failed` | `aprobado = false` |
| `score.scaled` (si viene) | `calificacion = scaled × 100` |
| `score.raw` con `min`/`max` (si no hay `scaled`) | `calificacion` normalizada a 0–100 |
| Sin ninguna nota | `calificacion = null` |

**P15 · el veredicto lo da `notaMinima` del SIG, no el curso** —cuando el SIG tiene una—. `cmi.scaled_passing_score` es lo que el autor del curso opina; `notaMinima` es lo que la organización exige, y ya existe en `ContenidoSig` con su función `aprobadoDe()` (`lib/sig/cierre.ts:146-157`) y su regla de congelar `aprobado` al cerrar. Se **reutiliza esa función**: dos formas de decidir si alguien aprobó terminan discrepando, y la discrepancia se descubre en la auditoría.

**P16 · `completed` sin `passed` no cierra una capacitación que exige evaluación.** `exigeEvaluacion` con `success_status=unknown` deja la asignación abierta con la razón visible («el curso reportó que terminó pero no reportó resultado»). Cerrarla como aprobada sería inventar el dato que falta.

**P17 · si el contenido exige firma, la firma sigue después y no cambia.** El player cierra el curso; `PanelFirma` hace lo suyo con su acta y su huella, exactamente como hoy. El acta gana una línea: el intento SCORM que la respalda.

---

## 9 · Modelo de datos

### `PaqueteScorm`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | `Int @id` | |
| `contenidoId` | `Int` → `ContenidoSig` | |
| `version` | `Int` | Sube al reemplazar el paquete; `@@unique([contenidoId, version])` |
| `clase` | `ClasePaquete` | **`AUTOCONTENIDO`** · **`DESPACHO`** (D-1) |
| `edicion` | `String` | Del manifiesto: `2004 3rd Edition` |
| `organizacionId` · `tituloOrganizacion` | `String` | Del manifiesto |
| `entradaHref` | `String` | El `href` del recurso del SCO — `index.html` en el paquete de prueba |
| `dominiosExternos` | `String[]` | Los orígenes que el paquete necesita. **Poblado al analizar, no adivinado en tiempo de ejecución** |
| `zipSha256` · `zipTamano` | `String` · `Int` | La huella de la cáscara. En `DESPACHO` **no congela el contenido** y la pantalla lo dice |
| `archivos` | `Int` | Cuántos trae |
| `subidoPorId` · `subidoEn` | | |

### `ArchivoScorm`

`id` · `paqueteId` · `ruta` (relativa, normalizada) · `mime` · `tamano` · `sha256` · `bytes Bytes`, con `@@unique([paqueteId, ruta])`. La ruta es la llave: es con lo que responde el servidor de archivos.

### `IntentoScorm`

| Campo | Tipo | Nota |
|---|---|---|
| `id` · `asignacionId` · `personaId` · `paqueteId` | | El paquete **efectivamente ejecutado**, no el vigente |
| `numero` | `Int` | 1, 2, 3… por asignación |
| `estado` | `EstadoIntento` | `EN_CURSO` · `SUSPENDIDO` · `COMPLETADO` · `ABANDONADO` |
| `completionStatus` · `successStatus` | `String` | Derivados a columna: son la consulta de todos los tableros |
| `scoreScaled` | `Decimal?` | |
| `progressMeasure` | `Decimal?` | |
| `location` | `String?` | |
| `suspendData` | `String?` **`@db.Text`** | 64 000 caracteres (§6) |
| `entry` · `exit` · `mode` | `String` | |
| `sessionTimeSegundos` · `totalTimeSegundos` | `Int` | Acumulado por el LMS (P10) |
| `cmi` | `Json` | **El modelo completo tal como quedó**, incluidos `objectives` e `interactions` |
| `iniciadoEn` · `ultimaActividadEn` · `terminadoEn` | | |
| `registroId` | `Int?` → `RegistroRealizado` | El cierre que produjo, cuando lo produjo |
| `ip` · `agente` | `String?` | Misma constancia que el acta de firma |

`@@index([asignacionId, numero])` · `@@index([estado, ultimaActividadEn])` (la consulta del trabajo de abandono).

**Por qué `cmi` completo en `Json` además de las columnas derivadas.** Las columnas responden los tableros; el `Json` responde al auditor que pregunta «¿cómo sabe que aprobó?», y la respuesta es la lista de interacciones con qué se preguntó y qué se respondió. Guardar solo la nota deja el resultado sin sustento, y es el dato que no se puede reconstruir después.

**Módulos puros, con pruebas** (misma frontera que el resto de `lib/sig/`):

- `lib/sig/scorm-modelo.ts` — qué elemento es escribible, qué tipo tiene, qué código de error corresponde. Es el corazón y es 100 % probable sin base de datos.
- `lib/sig/scorm-tiempo.ts` — `PT1H23M45S` ↔ segundos, y la suma de `total_time`.
- `lib/sig/scorm-manifiesto.ts` — del XML al `PaqueteScorm`: edición, SCO de entrada, `AUTOCONTENIDO` vs `DESPACHO`, dominios externos.
- `lib/sig/scorm-cierre.ts` — el mapeo de §8, reusando `aprobadoDe()`.

---

## 10 · Seguridad — el resumen para el revisor

| Riesgo | Control |
|---|---|
| JavaScript del curso con acceso al origen del SIG | Origen aparte (P3) · cookies *host-only* · sin sesión en ese origen |
| CSP del origen de contenido | `default-src 'none'` + lo que el paquete declare en `dominiosExternos`, **por paquete**. Con `AUTOCONTENIDO` no se permite ningún dominio externo |
| Suplantación de intento | Token firmado de un solo uso (P4) · validación de `event.origin` en ambos sentidos |
| Escritura no autorizada en el modelo de datos | El servidor valida elemento, tipo y estado del intento (P5) |
| *Zip slip*, bomba zip, XXE | P6 y P7, con pruebas por cada uno |
| Archivos ejecutables dentro del paquete | Lista blanca de MIME para servir; nada se sirve como `text/html` salvo los `.html` del paquete; `X-Content-Type-Options: nosniff` |
| Datos personales hacia un tercero | Solo en paquetes `DESPACHO`, solo correo y nombre (D-4), registrado en `Bitacora` (P20) y advertido en pantalla al subir el paquete |

**Hoy el proyecto no define ninguna CSP** —ni `Content-Security-Policy`, ni `X-Frame-Options`, ni `frame-ancestors` en ningún archivo—, así que esto se agrega desde cero y no hay una política previa que respetar.

La CSP y los encabezados por ruta van en `next.config.js` (`headers()`), que hoy solo tiene `typescript.ignoreBuildErrors` y `output: 'standalone'`. **No moverlos al archivo de middleware ni renombrarlo:** el proyecto mantiene `middleware.ts` deliberadamente en lugar del `proxy.ts` de Next 16 porque, como dice el propio archivo (`middleware.ts:10-12`), «el rename también cambia el runtime de edge a nodejs, y eso necesita su propia verificación». Ese cambio no es parte de este requerimiento y meterlo acá mezclaría dos riesgos distintos en un mismo despliegue. Las rutas de API siguen siendo `route.ts` dentro de `app/`.

**P19 · la página del player queda cubierta por la puerta que ya existe; las rutas del origen de contenido no deben estarlo.** `/mi-sig/curso/<asignacionId>` cae bajo el `matcher` de `/mi-sig/:path*` (`middleware.ts:30`), así que exige sesión sin tocar nada. El runner y el servidor de archivos **no** llevan sesión —por diseño (P3)— y por eso el origen de contenido tiene que **rechazar todo lo que no sea esas dos rutas**: si se sirve desde la misma aplicación en otro nombre de host, cualquier otra ruta quedaría alcanzable desde el JavaScript del curso como si fuera propia.

---

## 11 · Superficies

| Pantalla | Qué cambia |
|---|---|
| `/sig/contenidos` | En una `CAPACITACION`: subir `.zip`, ver el análisis del manifiesto **antes** de guardar (edición, SCO, clase, dominios externos) y reemplazar el paquete creando versión |
| `/mi-sig` | La tarjeta de una capacitación con paquete abre el curso; sin formulario de `asistio`/`calificacion` (P14) |
| `/mi-sig/curso/<asignacionId>` | **Nueva.** El player: barra de progreso, tiempo, «Salir y guardar», y qué pasó si el curso no cargó |
| `/mi-sig/historial` | Los intentos con su resultado, nota y tiempo |
| `/sig/colaboradores/[id]` | Los intentos de esa persona, junto a las actas que ya se listan ahí |
| `/sig/estado` | Anomalía: intentos `ABANDONADO` y capacitaciones con paquete `DESPACHO` cuyo tercero no responde |

**P18 · cuando el curso no carga, la pantalla dice por qué.** Un iframe en blanco es el peor resultado posible: la persona cree que la herramienta está rota y quien administra no tiene nada que mirar. El player detecta que el SCO no llamó `Initialize` en 30 segundos y muestra qué falta —dominio externo bloqueado por CSP, archivo de entrada inexistente, sin salida a internet—, con la misma disciplina de `explicarFallo()`.

---

## 12 · Decisiones

**D-1 · El player soporta las dos clases de paquete, y la app dice cuál es cada uno.** `AUTOCONTENIDO` (los archivos están y se sirven desde el origen aislado) y `DESPACHO` (el contenido lo entrega un tercero). Se detecta al analizar el manifiesto: un SCO cuyo contenido efectivo apunta a un dominio externo es un despacho.
*Por qué importa la etiqueta:* la evidencia que produce cada uno **no vale lo mismo**. En un autocontenido, `zipSha256` congela lo que la persona vio. En un despacho, no congela nada (§2). La ficha del contenido tiene que mostrarlo con esas palabras, porque quien responde una auditoría necesita saber qué puede afirmar.

**D-2 · Los archivos del paquete van a Postgres** (§5), por el contenedor sin volumen y el disco ajustado del servidor.

**D-3 · Fase 1 soporta paquetes de un solo SCO; multi-SCO queda para fase 2 con tabla de contenidos plana y navegación `choice`.** **No se construye el motor completo de secuenciación IMS SS** (reglas de precondición, *rollup* con medida, objetivos globales, aleatorización).
*Por qué:* el paquete de prueba es de un SCO, como la enorme mayoría de los cursos de cumplimiento; y el motor de secuenciación completo es, con distancia, la parte más grande y menos usada del estándar. Construirlo primero atrasa meses lo que ya sirve. Lo que sí se hace en fase 1: **detectar** un paquete multi-SCO al analizarlo y **rechazarlo con el motivo claro**, en vez de ejecutar el primer SCO y dar por hecho el curso completo.

**D-4 · `cmi.learner_id` es el correo corporativo y `cmi.learner_name` es el nombre de la persona.** Decidido por el líder del SIG el 08/09/2026.

```
cmi.learner_id   = Persona.correo    (userPrincipalName, minúsculas)
cmi.learner_name = Persona.nombre
```

*Ventaja de usar el correo:* es la misma llave con la que la persona se identifica en toda la organización, así que el reporte que devuelva un proveedor de cursos se cruza con el SIG sin tabla de traducción, y un curso reanudado meses después reconoce a la misma persona aunque su registro en la app haya cambiado de `id`.

*Lo que hay que aceptar, dicho una vez y anotado acá para que no sorprenda:* con un paquete de **despacho**, el correo corporativo y el nombre completo de cada colaborador **se transmiten al tercero** —hoy `my.coursebox.ai`, §2— porque el propio SCO los pone en la URL del contenido. Con un paquete **autocontenido** no salen de la aplicación. Por eso `PaqueteScorm.clase` no es un dato decorativo: es lo que separa «este curso no comparte datos» de «este curso comparte correo y nombre», y la pantalla que sube el paquete debe decirlo con esas palabras **antes** de guardar.

*Lo que sigue abierto y no es de desarrollo:* si existe contrato, cláusula de tratamiento o autorización que cubra esa transferencia a ese proveedor (Ley 1581 · transferencia internacional; control A.5.19 · relaciones con proveedores). El player no lo puede resolver y no lo bloquea: **construye los dos caminos**. Si la respuesta es que no hay cobertura contractual, la salida es no habilitar paquetes de despacho y exigir cursos autocontenidos — una decisión de configuración, no un rediseño.

**P20 · el envío de datos al tercero queda registrado.** Cada lanzamiento de un paquete `DESPACHO` anota en `Bitacora` qué datos salieron y hacia qué dominio. Sin ese registro, la organización no puede responder «a quién le compartimos los datos de nuestros colaboradores y cuándo», que es exactamente lo que un titular de datos tiene derecho a preguntar.

**D-5 · La CSP se define por paquete, a partir de los dominios que el análisis encontró, y un dominio nuevo exige aprobación al subir el paquete.**
*Por qué:* una lista blanca global crecería hasta permitir cualquier cosa, y el día que un curso empiece a cargar contenido de un dominio nuevo eso debe ser una decisión visible y no un efecto secundario.

---

## 13 · Verificación — hecho significa demostrado

| # | Qué se comprueba | Cómo |
|---|---|---|
| 1 | El modelo de datos y los códigos de error | Pruebas unitarias de `scorm-modelo.ts`: solo lectura → `404`, tipo inválido → `406`, `GetValue` antes de `Initialize` → `122`, `objectives` fuera de orden → `351` |
| 2 | Duraciones ISO 8601 | `scorm-tiempo.ts` ida y vuelta, incluidas fracciones (`PT0.5S`) y la suma de `total_time` |
| 3 | Análisis del manifiesto | Con **el paquete entregado**: detecta `2004 3rd Edition`, un SCO, `index.html`, clase `DESPACHO` y `my.coursebox.ai` en `dominiosExternos` |
| 4 | **El paquete entregado corre de punta a punta** | Subirlo, lanzarlo, ver el curso de Coursebox dentro del player, terminarlo y verificar que la asignación quedó cerrada con su nota |
| 5 | Un paquete **autocontenido** corre de punta a punta | Con un paquete de referencia (por ejemplo los *Golf Examples* de ADL para 2004 3rd Ed): sin salida a internet permitida y con CSP sin dominios externos |
| 6 | Reanudar funciona | Suspender a mitad de curso, cerrar el navegador, volver a entrar: `entry=resume`, y `location` y `suspend_data` intactos |
| 7 | `suspend_data` grande no se trunca | 64 000 caracteres, ida y vuelta, comparados byte a byte |
| 8 | Aislamiento de origen | Desde el runner, `window.parent.document` **lanza** error de origen cruzado; el `postMessage` con un `origin` ajeno se rechaza y se registra |
| 9 | El token de intento no es reutilizable ni transferible | Reusar un token: rechazado. Cambiar el `asignacionId` de otra persona: rechazado |
| 10 | Zip slip, bomba zip y XXE | Tres paquetes maliciosos preparados a mano, tres rechazos con su motivo |
| 11 | El curso no cierra lo que no reportó | `completed` + `success_status=unknown` con `exigeEvaluacion`: la asignación **sigue abierta** y la pantalla explica por qué (P16) |
| 12 | El multi-SCO se rechaza y lo dice | Paquete con dos SCO: rechazo explícito, no ejecución parcial (D-3) |
| 13 | El intento colgado no bloquea | Abandonar una sesión, correr el trabajo: `ABANDONADO` con lo comprometido conservado, y se puede volver a intentar |

---

## 14 · Variables de entorno nuevas

```
# ─── Player SCORM 2004 (REQ-SIG-14) ───────────────────────────────────────────
# Origen DISTINTO al de la aplicación desde el que se sirve el contenido de los
# cursos. Es un requisito de aislamiento, no una preferencia: el JavaScript de un
# curso es código de un tercero (§4/P3). Necesita DNS y certificado propios.
SCORM_ORIGEN_CONTENIDO=https://cursos.sig.cuantico.com
# El origen de la aplicación que el runner acepta en postMessage. Sin él, no corre.
SCORM_ORIGEN_APP=https://sig.cuantico.com
# Techo del .zip. Se valida ANTES de descomprimir.
SCORM_TAMANO_MAX_MB=200
# Minutos sin actividad tras los cuales un intento se marca ABANDONADO.
SCORM_INTENTO_ABANDONO_MINUTOS=720
#
# Las cookies de sesión deben seguir siendo host-only (sin Domain=.cuantico.com):
# un cookie de dominio compartido anula el aislamiento del subdominio en silencio.
```

---

## 15 · Qué NO hace este requerimiento

- **No implementa el motor de secuenciación y navegación de IMS SS** (D-3): sin reglas de precondición, sin *rollup* por medida, sin objetivos globales, sin aleatorización. Los `imsss` del paquete de prueba se leen y se ignoran, salvo `completionSetByContent`/`objectiveSetByContent`.
- **No soporta SCORM 1.2** (API `window.API`, `cmi.core.*`, `suspend_data` de 4 096). Es otro modelo de datos, y agregarlo «de paso» es la vía rápida a un player que cumple mal los dos. Si aparece un curso 1.2, se decide entonces.
- **No soporta xAPI ni cmi5.**
- **No es una herramienta de autoría**: no crea ni edita cursos.
- **No convierte el paquete en evidencia congelada cuando es un despacho** (D-1). Publica lo que sabe y dice lo que no.
- **No verifica la cobertura contractual** de la transferencia de correo y nombre a un proveedor de cursos (D-4). Envía lo decidido, lo advierte en pantalla y lo registra; que exista el contrato es de gobierno.
