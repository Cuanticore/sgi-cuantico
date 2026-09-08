# Requerimiento · Asignar un equipo a una persona desde la pantalla de Equipos

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-16 · asignación de custodio persona |
| **Versión** | 1.2 — D-2 cerrada **sin tabla de historia** (se usa `Activo.personaId`, que ya existe), la pantalla se diseña alrededor de la primera corrida (§3.4), y el equipo usado exige **acta de borrado** antes de cambiar de manos (§3.5, D-9) |
| **Fecha** | 2026-09-08 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo (ejecución asistida con Claude Code) |
| **Extiende** | El inventario del SGSI (`app/sgsi/acciones/activos.ts`) · la pantalla `tecnologia/equipos` · REQ-SIG-09 (desvinculación y acta de borrado FOR-SIG-18) |
| **Controles** | **A.5.9** inventario de activos con su responsable · **A.5.10** uso aceptable · **A.5.11** devolución de activos · **A.8.10** borrado de información antes de reutilizar un equipo (PTR-TEC-03 ítem 62) |
| **Estado** | Decisiones D-1 a D-10 **cerradas** (§7). **D-2 y D-9 las resolvió el líder del SIG**: sin tabla nueva, y el acta de borrado se exige y se registra desde el popup. D-4 y D-6 siguen marcadas para ratificación; el desarrollo no las espera |

---

## 1 · Objetivo

Que desde **Equipos de colaboradores** se abra un popup sobre la fila de una persona, se vea **qué equipos del inventario están disponibles**, y se le asigne uno con dos clics. Y que cuando no haya ninguno disponible —que hoy es lo normal, §2.2— el mismo popup permita **crear el activo ya asignado a esa persona**, sin salir de la pantalla.

El resultado que se busca no es un formulario: es que la tarjeta **ACTIVOS ASIGNADOS** deje de decir `0` y que **SIN NINGÚN ACTIVO** deje de decir `36`.

Y que un equipo que **ya estuvo en manos de otra persona no se entregue sin el acta de borrado** de quien lo tuvo (§3.5). Es el control A.8.10, y hoy no hay dónde cumplirlo: `ActaBorradoSeguro` está en el esquema y ninguna pantalla la crea.

**No hay campo que crear ni tabla que agregar.** `Activo.personaId` ya existe (§2.1), `ActaBorradoSeguro` y `ActaBorradoActivo` también, y `MetodoBorrado` está sembrado. Este requerimiento **no toca el esquema**: lo único que suma a la base es una fila en `Parametro` (§4.3). Todo el trabajo está en abrirles el camino de escritura y en la pantalla que los usa.

---

## 2 · El estado real de la pantalla hoy

### 2.1 · El campo existe, la pantalla lo lee, y nadie lo escribe

`Activo.personaId` —el custodio **persona**, distinto del custodio **cargo**— está en el esquema desde el 01/09/2026 (`schema.prisma:671-675`), con su relación `ActivoCustodioPersona` (`schema.prisma:703`) y su contraparte `Persona.activosACargo` (`schema.prisma:1061`). La pantalla de Equipos lo lee: `page.tsx:30-41` trae `activosACargo` y `page.tsx:46` cuenta los activos vigentes con `personaId: null`.

**Y no hay un solo camino de escritura en toda la aplicación.** Ni `crearActivo` ni `guardarDatosGenerales` incluyen el campo:

| Acción | Dónde | ¿Escribe `personaId`? |
|---|---|---|
| `guardarDatosGenerales` | `app/sgsi/acciones/activos.ts:95-115` (la interfaz) y `:153-168` (la lista de campos que registra) | **No.** El campo no está en `DatosGenerales` ni en el arreglo `campos` |
| `crearActivo` | `app/sgsi/acciones/activos.ts:212-231` (la interfaz) y `:302-320` (el `create`) | **No.** `ActivoNuevo` no lo declara y el `create` no lo pasa |
| La ficha del activo | `app/components/sgsi/activos/FichaActivo.tsx` | **No.** El campo no se dibuja |

Por eso las cuatro tarjetas dicen 36 · 0 · 36 · 0.0. **No es que nadie haya asignado equipos: es que la aplicación no tiene cómo.**

Y por eso el enlace actual es una promesa que no se cumple. `Equipos.client.tsx:196-204` dibuja «+ Asignar desde el inventario» como un `Link` a `/sgsi/inventario`, con este comentario encima:

> «La asignación se hace en el inventario del SGSI, que ya edita el activo con su bitácora. Un segundo lugar donde escribir el mismo campo es un segundo lugar donde puede escribirse distinto.»

El razonamiento es correcto y este requerimiento lo conserva (P6). Lo que no es cierto es la premisa: **en el inventario del SGSI ese campo tampoco se edita**. El enlace lleva a una pantalla donde no está lo que promete, y quien lo sigue vuelve sin haber asignado nada. Es el mismo cuadro que REQ-SIG-15 documentó para `areaId` y `cargoId`, y se cierra igual: con un camino de escritura, uno solo, y con bitácora.

### 2.2 · El inventario casi no tiene equipos de persona

De los **234 activos** cargados hoy, **19 son de tipo `[HW] Equipamiento informático`**, y su reparto por subtipo es este:

| Subtipo | Cuántos |
|---|---:|
| `[vhost]` Equipo virtual | 16 |
| `[pc]` Informática personal | **1** |
| `[firewall]` Cortafuegos | 1 |
| `[crypto]` Dispositivos criptográficos | 1 |

Con el Consolidado V19 de REQ-SIG-12 el inventario pasa a 296 activos (299 con las tres altas de su D-2), y los códigos con abreviatura `EQU` suman **≈21** (`TEC-EQU:16 · SIG-EQU:1 · COM-EQU:1 · FIN-EQU:1 · LCO-EQU:1 · EST-EQU:1`, REQ-SIG-12 §3).

**Veintiún activos de hardware para treinta y seis personas, y la mayoría son servidores virtuales.** La consecuencia de diseño es directa y hay que decirla antes de dibujar nada:

> **La rama «no hay disponibles, cree uno» no es el caso de borde. Es el caso normal.** Un popup que trate la creación como una salida de emergencia escondida detrás de un enlace pequeño va a hacer que asignar los 36 portátiles sea un trámite de 36 idas y vueltas al inventario.

Por eso el popup de §3 tiene **dos mitades del mismo tamaño**, no una lista con un enlace al pie.

### 2.3 · Lo que ya existe y se reusa

| Pieza | Dónde | Para qué acá |
|---|---|---|
| Cáscara de popup | `app/components/sgsi/Popup.tsx` | Overlay, Escape, foco de vuelta, cuerpo con scroll a 61vh, `PopupVacio` para el estado sin resultados. Ya resuelto |
| Buscador de activos en popup | `ficha.query.ts:205-212` (`ActivoBreve`) y `:301-311` | La ficha ya carga `{id, codigo, nombre, area, subtipo}` de todos los activos vigentes para el popup de «activo superior». **Es exactamente la forma de fila que necesita esta lista** |
| Alta de activo con código | `activos.ts:288-335` | `ContadorCodigo` atómico, código `AAA-TTT-NNNN` inmutable, valoración inicial y `registrarAlta`. **No se reescribe: se le agrega un campo** |
| Bitácora | `lib/sgsi/bitacora.ts` (`registrar`, `registrarAlta`) | Toda asignación con anterior, nuevo y motivo |
| Permisos | `lib/sgsi/permisos.ts:74-76` | `tecnologia:escribir` ya existe y ya es el permiso del módulo |
| Acta de borrado | `ActaBorradoSeguro` + `ActaBorradoActivo` (`schema.prisma:2498-2537`) | El modelo de FOR-SIG-18, con su N:M de activos. **Está y nadie lo escribe** (B6) |
| Métodos de borrado | `MetodoBorrado`, sembrado en `20260903170000_colaboradores/migration.sql:119-124` | Cuatro métodos ya cargados: formateo con sobrescritura, borrado criptográfico, destrucción física, restablecimiento de fábrica |
| Regeneración de riesgos | `lib/sgsi/riesgos.ts` (`generarRiesgos`) | El alta valorada trae riesgos a la existencia, igual que hoy |

---

## 3 · El popup

Se abre al pulsar **«+ Asignar desde el inventario»** en la fila de una persona. El botón deja de ser un `Link` a `/sgsi/inventario` y pasa a ser un `button` que abre el popup **en la misma pantalla**: el valor de esta pantalla es que se recorre persona por persona, y cada navegación fuera pierde el hilo y el scroll.

Ancho **760 px**. Cabecera: el nombre de la persona, su área y —si la tiene— su cargo. Título: **«Asignar equipo a Andres Felipe Jaramillo»**.

**P1 · el popup exige `tecnologia:escribir`.** Es el permiso del módulo (`permisos.ts:74-76`) y el que ya cubre el inventario. Sin él, el botón **no se dibuja** y la fila queda de solo lectura: la pantalla de Equipos sigue siendo visible con `tecnologia:ver`, porque «a quién le falta equipo» es una pregunta que también responde quien no asigna. Un botón que existe y devuelve «no autorizado» se lee como que la aplicación está rota.

**P2 · dos secciones, no una lista con un enlace.** El cuerpo son dos bloques con el mismo peso visual, separados por una línea:

```
┌─ Asignar equipo a Andres Felipe Jaramillo ─────────────────── × ─┐
│  Gestión Tecnológica · sin cargo asignado                        │
├──────────────────────────────────────────────────────────────────┤
│  DEL INVENTARIO                                                  │
│  [ buscar por código o nombre…            ]  [x] solo disponibles│
│                                                                  │
│  ○ TEC-EQU-0004  Portátil Dell Latitude 5440   [pc]      libre   │
│  ○ TEC-EQU-0009  Monitor LG 24"                [peripheral] libre│
│  ○ TEC-EQU-0011  Portátil HP ProBook           [pc]              │
│                  en manos de Carlos Andrés Mejía                 │
│                                                                  │
│  Se ofrecen 3 de 21 equipos. El resto son servidores y equipos   │
│  virtuales, que no se entregan a una persona.                    │
├──────────────────────────────────────────────────────────────────┤
│  ¿NO ESTÁ EN LA LISTA?                                           │
│  Créelo acá y queda asignado a esta persona.                     │
│  [ + Crear equipo nuevo ]                                        │
├──────────────────────────────────────────────────────────────────┤
│                                    [ Cancelar ]  [ Asignar ]     │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 · Qué activos se ofrecen

**P3 · el filtro es por subtipo, y la lista de subtipos es dato, no código.** Un equipo que una persona tiene en la mano es un `[pc]`, un `[mobile]`, un `[peripheral]`, un `[print]`, un `[scan]`, un `[crypto]` o un `[usb]`. Un `[vhost]`, un `[firewall]` o un `[router]` no se le entregan a nadie: viven en un rack o en una nube, y su responsable es un cargo, no unas manos.

La lista vive en `Parametro` (`schema.prisma:179-186`), con la clave **`equipos_subtipos_asignables`**, sembrada así:

```
[HW]/[pc]  [HW]/[mobile]  [HW]/[pda]  [HW]/[peripheral]  [HW]/[print]
[HW]/[scan]  [HW]/[crypto]  [Media]/[usb]  [Media]/[disk]  [Media]/[cd]
[Media]/[dvd]  [Media]/[tape]  [AUX]/[furniture]
```

**El par `tipo/subtipo` y no el subtipo suelto: `[mobile]` existe dos veces** en la taxonomía —`[HW]/[mobile]` es un portátil o una tableta, `[COM]/[mobile]` es la red celular—, y filtrar por el código a secas metería una red de comunicaciones en la lista de equipos entregables. La verificación 4 de §8 lo comprueba.

En `Parametro`, y no en un `Record<string, string>` del fuente, por lo mismo que REQ-SIG-15 argumentó para los nombres de las licencias: el día que la organización empiece a entregar diademas o lectores biométricos, agregar el subtipo tiene que ser una fila, no un despliegue.

**P4 · el interruptor «solo disponibles» viene marcado, y desmarcarlo no oculta la verdad.** Marcado, la lista trae los activos vigentes, del subtipo asignable, con `personaId = null`. Desmarcado, trae también los que ya están en manos de alguien, **con el nombre de quien los tiene** en la propia fila. No se ocultan: un equipo que rota de una persona a otra es el segundo caso más común después del alta, y esconderlo obligaría a ir al inventario —que es de donde venimos.

**P5 · reasignar un equipo que ya tiene dueño exige motivo.** Elegir una fila «en manos de…» habilita un campo de motivo obligatorio (mínimo 10 caracteres) antes del botón Asignar. Sin motivo, la bitácora diría que el portátil cambió de manos y no por qué, que es justo lo que un auditor pregunta cuando el equipo se pierde. Y como no hay tabla de historia (§4.1), **esa fila de bitácora es todo lo que va a quedar de esa entrega**: un motivo vacío no se puede reconstruir después.

**P6 · el activo se sigue editando en un solo lugar, y este popup no lo contradice.** El comentario de `Equipos.client.tsx:196-198` tiene razón: dos pantallas que escriben el mismo campo escriben distinto. La regla que este requerimiento respeta es más fina y es la que hay que dejar escrita:

> **El popup escribe UN campo —la custodia— y ninguno más.** Nombre, descripción, área, tipo, valoración, propietario, ubicación: nada de eso se toca acá. Se editan en la ficha del activo, que es su único lugar. Y la custodia no se edita en la ficha: se asigna acá.

Es un reparto por campo, no dos caminos para el mismo campo. La fila del popup enlaza a `/sgsi/inventario/[codigo]` para todo lo demás.

**P7 · un activo con `cantidad > 1` se puede asignar, pero el popup dice qué significa.** El esquema permite que una fila agrupe unidades (`Activo.cantidad`, `schema.prisma:681`) y V19 trae una columna Cantidad. Asignar «Portátiles Dell · cantidad 20» a una persona registra que **las veinte** están en sus manos. El popup lo advierte con esa frase y pide confirmación explícita, en vez de rechazarlo: hay agrupaciones legítimas —un juego de periféricos, tres discos— y el sistema no puede decidir cuál es cuál. Lo que no puede es dejar que alguien lo haga sin darse cuenta.

**P8 · el pie de la lista dice cuántos quedaron fuera y por qué.** «Se ofrecen 3 de 21 equipos. El resto son servidores y equipos virtuales, que no se entregan a una persona.» Una lista corta sin explicación se lee como una lista rota, y con 16 de 19 activos de hardware siendo `[vhost]`, esa sospecha sería la reacción correcta.

### 3.2 · Cuando no hay nada que ofrecer

**P9 · el vacío no es un `PopupVacio`: es el formulario de alta, ya abierto.** Si la lista filtrada vuelve sin filas, el popup **no** muestra «no hay resultados» con un botón debajo. Muestra:

> **El inventario no tiene equipos disponibles.** Créelo acá y queda asignado a Andres Felipe Jaramillo.

…y el formulario de §3.3 **desplegado**, no plegado. Es la aplicación del §2.2: con 21 equipos para 36 personas, exigir un clic extra para llegar al camino que se va a usar 30 veces seguidas es cobrar 30 clics por una decisión de diseño.

### 3.3 · El alta rápida

Seis campos. Todo lo demás se propone y se puede corregir:

| Campo | Se propone | Editable | Obligatorio |
|---|---|---|---|
| Nombre | vacío | Sí | **Sí** |
| Tipo MAGERIT | `[HW] Equipamiento informático` | Sí | Sí |
| Subtipo | `[pc] Informática personal` | Sí | Sí |
| Proceso o área | **el área de la persona** | Sí | Sí |
| Custodio (cargo) | **el cargo de la persona** | Sí | Sí — lo exige `crearActivo` |
| Valoración D / I / C | vacía | Sí | **Sí** (P11) |
| Descripción, ubicación, entorno, proveedor, propietario | — | No se piden | No |

**P10 · el área y el cargo se proponen desde la persona, y se dicen en voz alta.** Bajo los dos campos: «tomados de la ficha de Andres Felipe Jaramillo». Si la persona no tiene área o cargo —hoy las 36 están así, `sin área` en cada fila de la pantalla— los campos quedan vacíos y obligatorios, con el enlace al popup de REQ-SIG-15 para ponérselos. **No se inventa un área por defecto**: el prefijo del área forma el código del activo, y el código es inmutable (`activos.ts:233-237`). Un `TEC-EQU-0022` emitido con un área adivinada no se corrige nunca.

**P11 · la valoración D/I/C es obligatoria en el alta desde este popup, aunque `crearActivo` la acepte vacía.** Un activo sin valoración no alcanza el umbral, no entra al análisis y **no genera un solo riesgo** —lo dice la propia acción, `activos.ts:341-343`—. Crear 36 portátiles sin valorar produciría 36 activos invisibles para las matrices, para el SoA y para los planes: un listado de bienes, no un inventario de activos de información. Y nadie vuelve después a valorar 36 filas una por una.

Para que la obligación no sea un muro, el formulario ofrece **la valoración del último equipo creado desde este popup** como valor inicial de los tres campos, con la frase «igual que el equipo anterior». Los portátiles de una organización se parecen entre sí; lo que no se puede es que el sistema decida por su cuenta cuánto vale la información de alguien.

**P12 · el alta usa `crearActivo`, extendida con un campo.** No nace una segunda acción de creación de activos. `ActivoNuevo` (`activos.ts:212-231`) suma `personaId?: number | null`, el `create` (`activos.ts:302-320`) lo pasa, y todo lo demás —contador atómico, código `AAA-TTT-NNNN`, valoración, `registrarAlta`, `generarRiesgos`— queda exactamente como está. Una segunda ruta de alta sería una segunda forma de emitir códigos, y los códigos son irrepetibles por diseño.

### 3.4 · La primera corrida: 36 altas seguidas

El inventario que hay hoy no tiene los computadores de la gente (§2.2), y los consolidados que vienen sí los traerán. Entre una cosa y la otra hay **una corrida de arranque en la que alguien va a crear un PC por cada una de las 36 personas, uno detrás de otro, en una sola sentada**. Ése es el uso real de este popup en su primer día, y es el que decide si la herramienta sirve o si el trabajo termina haciéndose en un Excel.

Cuatro reglas, todas para esa corrida:

**P12b · el formulario recuerda la última alta.** Tipo, subtipo, área, custodio cargo y valoración D/I/C arrancan con **lo que se puso en el alta anterior de la misma sesión**, no con los valores por defecto de P10. Los 36 portátiles de una organización son el mismo modelo, la misma valoración y casi siempre la misma área. El único campo que siempre nace vacío es el **nombre**, porque es el único que de verdad cambia entre uno y otro. Con esto el alta número 30 es escribir un renglón y pulsar Guardar.

El área propuesta sigue siendo la de la persona cuando la persona tiene área (P10); lo recordado se aplica **solo donde no hay nada mejor que proponer**, que hoy es siempre, porque las 36 filas dicen `sin área`.

**P12c · «Guardar y seguir con la siguiente sin equipo».** El botón principal del alta tiene una segunda forma: guarda, **no cierra el popup**, y lo reabre sobre la siguiente persona de la lista que no tenga ningún activo, con el formulario ya relleno según P12b. El pie dice **«quedan 34 personas sin equipo»**. Sin esto la corrida son 36 ciclos de abrir–llenar–guardar–cerrar–buscar la siguiente fila–abrir, y el sexto ya se hace en otra parte.

El orden en que avanza es el mismo de la pantalla —`nombre asc`, `page.tsx:41`— y respeta el filtro activo: si quien trabaja puso **Sin activos**, avanza por esa lista, que es exactamente lo que quiere.

**P12d · el nombre repetido se avisa antes de guardar.** Treinta y seis activos llamados «Portátil» son treinta y seis filas que no se pueden distinguir en el inventario, en el acta de borrado ni en una matriz de riesgos. Y no es una hipótesis: el Consolidado V19 ya trae dos pares de nombres repetidos y están levantados como hallazgo **H-14** (REQ-SIG-12 §6). Antes de guardar, si el nombre ya existe entre los activos vigentes, el popup lo dice —«ya hay un activo vigente llamado así: `TEC-EQU-0007`»— y propone la forma que sí distingue:

```
Portátil Dell Latitude 5440 · S/N 7XKQ2M3
```

Es un aviso, no un bloqueo: dos monitores idénticos con nombre igual son legítimos y quien asigna lo sabe. Lo que no puede es que se le escape.

**P12e · el código lo emite el contador, y por eso la corrida no se puede paralelizar a mano.** Cada alta incrementa `ContadorCodigo` dentro de la transacción (`activos.ts:289-300`), así que 36 altas seguidas producen `TEC-EQU-0022` … `TEC-EQU-0057` sin huecos ni choques. Quien haga la corrida con dos pestañas abiertas obtiene códigos correctos igual; lo que no obtiene es un orden predecible, y el código no se corrige después porque es inmutable.

### 3.5 · Equipo nuevo o equipo usado: el acta de borrado

Entregarle a alguien un equipo que otra persona usó **sin haber borrado la información** es entregarle los correos, los archivos y las credenciales del anterior. Es el control **A.8.10** y es el ítem 62 de PTR-TEC-03. Por eso la asignación de un equipo usado no se completa sin el acta.

Los puntos de este bloque llevan la serie **B**, porque son un control propio y no detalles del popup.

**B1 · el popup pregunta, pero no pregunta a ciegas: propone la respuesta y dice de dónde la sacó.**

| Lo que el sistema encuentra | Qué propone | ¿Se puede cambiar? |
|---|---|---|
| `Activo.personaId ≠ null` | **Usado**, y por quién: la persona que aparece en la fila | **No.** Es un hecho del dato, no una opinión |
| `personaId = null`, pero hay bitácora de `campo: 'custodio persona'` para ese código | **Usado**, y el `valorAnterior` de la última fila dice quién | Sí, con la advertencia |
| Ninguna de las dos | **Nuevo** | Sí — y hay que poder cambiarlo (B2) |

Es acá donde la bitácora deja de ser solo el rastro que quedó al renunciar a la tabla de historia (§4.1) y **pasa a ser la entrada de un control**. Ése es el segundo argumento, además del de auditoría, para que la fila de bitácora de P14 escriba nombres y no ids.

**B2 · «nuevo» es una propuesta, no un veredicto, y por una razón concreta.** Todo activo que llegue por el consolidado —los que van a traer los computadores— nace en la base sin una sola línea de bitácora de custodia, así que el sistema lo verá como nuevo **aunque lleve tres años en el escritorio de alguien**. Quien asigna tiene que poder decir «este ya estaba en uso» y, si lo dice, elegir quién lo tenía —de la lista de personas, **incluidas las inactivas**, que son justo las que devuelven equipos—. Un control que solo se activa con datos que la aplicación misma produjo no protege nada durante el primer año.

**B3 · sin acta, no hay asignación.** Marcado «usado», el botón Asignar queda deshabilitado hasta que haya un acta de borrado **de la persona que lo tuvo** y **que incluya ese activo**. Las dos condiciones: un acta de Carlos que no menciona el portátil no dice que el portátil se borró, y un acta que menciona el portátil pero es de otra persona no dice nada de los datos de Carlos.

Dos caminos, en el mismo popup:

1. **Escoger del listado.** Las actas de esa persona (`ActaBorradoSeguro where personaId = anterior`), con su fecha y su método. Si el acta ya incluye el activo, se selecciona y ya. Si no lo incluye, **se le agrega** —una fila de `ActaBorradoActivo`— en la misma transacción de la asignación. Es lo correcto: el acta de una desvinculación cubre el portátil, el celular y el disco externo, y que a alguien se le haya pasado uno no obliga a levantar un acta nueva.
2. **Registrar una nueva.** Cinco campos, todos del modelo que ya existe: fecha del borrado, **método** (del catálogo `MetodoBorrado` —«Formateo con sobrescritura», «Borrado criptográfico», «Destrucción física», «Restablecimiento de fábrica»—, sembrado en `migration.sql:119-124`), quién lo ejecutó, nota, y evidencia opcional por `Evidencia`. El acta nace con el activo ya asociado, que es lo que exige el criterio de aceptación 7 del propio modelo: *un acta sin activos asociados no se guarda*.

```
│  TEC-EQU-0011  Portátil HP ProBook                               │
│  ● Ya estuvo en uso — lo tiene Carlos Andrés Mejía               │
│  ○ Es nuevo                                                      │
│                                                                  │
│  ⚠ Antes de entregarlo hay que constar que se borró la           │
│    información de Carlos Andrés Mejía.                           │
│                                                                  │
│  ● Usar un acta ya registrada                                    │
│      ▸ 12/08/2026 · Borrado criptográfico · 3 activos            │
│        (no incluye este equipo — se le agrega)                   │
│  ○ Registrar el borrado ahora                                    │
│      fecha [        ]  método [ Formateo con sobrescritura ▾ ]   │
│      lo ejecutó [ ▾ ]  nota [                    ]  evidencia    │
│  ○ Todavía no se ha borrado                                      │
│      → Este equipo no se puede entregar. [ Dejarlo liberado ]    │
```

**B4 · el borrado que todavía no se hizo NO se registra: la asignación se detiene.** Si el disco no se ha borrado, el popup no ofrece un tercer camino que diga «pendiente». Dice esto:

> **Este equipo no se puede entregar todavía.** Bórrelo primero y vuelva a registrar el acta acá. Mientras tanto, puede dejarlo liberado.

Y ofrece liberar el activo (`personaId = null`, P17), que es exactamente lo que corresponde: el equipo volvió y espera borrado. **Un estado «pendiente de borrado» guardado en la base sería una forma de decir que el control se cumplió a medias**, y a medias no existe: o la información se borró o el próximo la va a encontrar.

**B5 · «equipos esperando acta de borrado» se deriva, no se guarda.** El renglón nuevo de la pantalla sale de una consulta, sin campo, sin enum y sin tabla:

> activos vigentes con `personaId = null`, con al menos una fila de bitácora de custodio persona, y **sin** acta que los incluya.

Es el mismo criterio que ya usa el renglón naranja de «sin custodio persona» (`page.tsx:46`) y la misma doctrina de REQ-SIG-15: un estado derivable no se guarda, porque una marca guardada se puede quedar vieja y una consulta no.

**B6 · éste es el primer camino de la aplicación para crear un acta de borrado, y por eso el formulario no vive dentro del popup.** `ActaBorradoSeguro` está en el esquema desde `20260903170000_colaboradores` y **nadie la escribe**: el único uso en `app/` es el conteo de anomalías de `app/sig/estado/page.tsx:96`. Hoy la aplicación sabe contar quién salió sin acta y no tiene cómo resolverlo.

El formulario de B3.2 se construye en **`app/components/sgsi/ActaBorrado.tsx`** y el popup lo usa desde ahí, no en línea. La desvinculación de REQ-SIG-09 necesita exactamente el mismo formulario, y si nace embebido en este popup, esa pantalla escribirá su propia versión: dos formas de crear el acta que cierra A.8.10, con dos conjuntos de campos obligatorios. Es la misma razón por la que `Popup.tsx` existe en un solo lugar.

**B7 · la corrida de arranque no ve nada de esto.** Un equipo creado en el formulario de §3.3 es nuevo por construcción —acaba de nacer con `personaId` puesto— y la pregunta no se hace. Las 36 altas seguidas de §3.4 no pagan un solo clic por este control. Aparece cuando tiene que aparecer: el día que el primer portátil cambie de manos.

---

## 4 · Modelo de datos

### 4.1 · No se agrega nada: el campo ya está

**El esquema no cambia.** `Activo.personaId` existe con su `@map("persona_id")` (`schema.prisma:675`), su relación `ActivoCustodioPersona` (`schema.prisma:703`) y su contraparte `Persona.activosACargo` (`schema.prisma:1061`). No hay migración, no hay tabla nueva, no hay columna nueva.

**Y no hay historia de custodia** (D-2, resuelta por el líder del SIG). Un activo apunta a quien lo tiene ahora y a nadie más. La consecuencia hay que decirla una vez y con nombre propio, porque es la que se va a sentir:

> Cuando un equipo pasa de una persona a otra, **el único rastro de que la primera lo tuvo queda en la bitácora**: `tabla: 'activo'`, `campo: 'custodio persona'`, con `valorAnterior`, `valorNuevo`, `motivo` y `ocurridoEn` (P14). La pregunta «¿quién tenía este portátil en marzo?» se contesta, pero se contesta leyendo la bitácora, no consultando una relación.

Dónde muerde: la desvinculación de REQ-SIG-09 arma el **acta de borrado seguro** con los activos de quien sale (`ActaBorradoSeguro` → `ActaBorradoActivo`, `schema.prisma:2506-2537`), y esa lista se construye leyendo `activosACargo`. Si el equipo ya rotó al reemplazo antes de que alguien arme el acta, el activo ya no figura. **La regla de trabajo que compensa esto —y que va en el documento de procedimiento, no en el código— es: el acta de borrado se arma ANTES de reasignar el equipo.** Es el orden correcto de todas maneras: primero se verifica que la información se borró, después el equipo se entrega a otro.

**Tampoco se guarda una fecha de entrega.** La fecha que queda es `Bitacora.ocurridoEn`, que es **cuándo se digitó**, no desde cuándo la persona tiene el equipo. Para la corrida de arranque las dos coinciden en la práctica. El día que se construya el acta de entrega (D-6) hará falta la fecha real, y ése es el requerimiento que agrega la columna: acá no se agrega para no cobrarle un campo de fecha a las 36 altas seguidas de §3.4.

### 4.2 Las dos interfaces de TypeScript

Lo único que cambia en el modelo de escritura son dos tipos, no dos tablas:

- `ActivoNuevo` (`activos.ts:212-231`) suma `personaId?: number | null` (P12), y el `create` de `activos.ts:302-320` lo pasa.
- `DatosGenerales` (`activos.ts:95-115`) **no lo suma.** La custodia no se edita en la ficha del activo: se asigna en el popup, que es el único camino y el único que escribe la bitácora con su motivo. Agregarlo a los dos sería reabrir el problema que `Equipos.client.tsx:196-198` señala con razón — y sin tabla de historia, **la bitácora es todo el rastro que hay**, así que un segundo camino que la escriba distinto es más caro ahora que en la versión 1.0 de este documento.

### 4.3 El parámetro

Una fila en `Parametro`: clave `equipos_subtipos_asignables`, valor la lista de pares `tipo/subtipo` de P3 separados por coma, descripción «Subtipos MAGERIT que se entregan a una persona y que ofrece el popup de asignación de equipos (REQ-SIG-16)».

---

## 5 · La acción de servidor

Una sola, nueva, **en `app/sgsi/acciones/activos.ts`** —junto a `crearActivo`, `guardarDatosGenerales` y `darDeBajaActivo`—:

```ts
asignarCustodioPersona(
  codigoActivo: string,
  personaId: number | null,   // null = liberar
  motivo?: string,            // obligatorio si el activo ya tenía custodio (P5)
  borrado?:                   // obligatorio si el equipo es usado (B3)
    | { actaId: number }                      // escogida del listado
    | { acta: ActaBorradoNueva },             // registrada en el momento
): Promise<Resultado>
```

Sin parámetro de fecha de entrega: no hay dónde guardarla (§4.1). La que queda es la de la bitácora. La fecha que sí viaja es la **del borrado**, dentro de `acta`, porque ésa sí tiene columna (`ActaBorradoSeguro.fecha`).

**No nace un `app/tecnologia/acciones/`: no existe.** Las siete pantallas de Tecnología importan sus acciones de `app/sig/acciones/*` (`Dependencias.client.tsx:15`, `Ambientes.client.tsx:16`, `Sistemas.client.tsx:15`…), y esta escribe un campo de `Activo`, cuyo módulo de acciones es el del SGSI. Abrir una tercera carpeta de acciones para una función haría que mañana la mitad de las escrituras de `Activo` estén en un archivo y la mitad en otro.

**P13 · exige `tecnologia:escribir` con `autorConPermiso`** (`app/sgsi/acciones/sesion.ts:81`) y va envuelta en `ejecutar`, como todas las demás. El popup no llama a Prisma.

Es el único permiso del archivo que no es `sgsi:escribir` ni `activo:valorar`, y es deliberado: quien administra los equipos de la gente no es necesariamente quien valora activos de información. Hoy los tres los tiene el mismo grupo (`permisos.ts:100-108`), así que no cambia nada en la práctica y deja la separación lista, que es la doctrina que `permisos.ts:16-19` ya fija.

**P14 · una transacción, dos escrituras, y la segunda es la que sostiene todo.**

| # | Escritura | Cuándo | Por qué |
|---|---|---|---|
| 1 | `ActaBorradoSeguro` + su `ActaBorradoActivo` | Solo si vino `{ acta }` | El acta nueva de B3.2, con el activo ya asociado |
| 2 | `ActaBorradoActivo` sobre un acta existente | Solo si vino `{ actaId }` y el acta aún no incluía el activo | B3.1 |
| 3 | `Activo.personaId = personaId` | Siempre | Es el dato. Lo que la pantalla lee (`page.tsx:30-46`) |
| 4 | `Bitacora`: `tabla: 'activo'`, `registroId` = el código del activo, `campo: 'custodio persona'`, `valorAnterior` y `valorNuevo` con el **nombre de la persona**, nunca el id, más el `motivo` | Siempre | **Sin tabla de historia, esta fila es el único registro de que el equipo cambió de manos.** Una fila que diga «12 → 27» no la lee nadie, y dentro de un año nadie sabrá quiénes eran 12 y 27 |
| 5 | `Bitacora` del alta del acta, si se creó una | Solo con `{ acta }` | `registrarAlta(tx, autor, 'acta_borrado_seguro', …)`, igual que cualquier otra alta |

**Las cinco en el mismo `$transaction`**, por el patrón que ya siguen `guardarDatosGenerales` (`activos.ts:137-187`) y `darDeBajaActivo` (`activos.ts:367-376`). Y acá la transacción no es una formalidad: **un acta guardada con la asignación fallida deja constancia de un borrado para una entrega que no ocurrió, y una asignación guardada con el acta fallida entrega el equipo sin la evidencia**. El segundo caso es precisamente el incidente que B3 existe para impedir.

**P14b · el acta se valida en el servidor, no solo en el popup.** La acción comprueba por su cuenta que, si el activo tuvo custodio anterior, el acta corresponde a **esa persona** y cubre **ese activo** (B3). Una validación que solo vive en el cliente es una validación que se salta con una llamada directa a la acción de servidor, y ésta es la que sostiene un control de la norma.

**P15 · validaciones, y cada una con su frase.** El activo existe y está vigente; la persona existe y está activa; el subtipo está en `equipos_subtipos_asignables` **o** quien asigna confirmó el aviso de P7/P16; hay motivo si el activo ya tenía custodio (P5); y **hay acta de borrado si el equipo es usado** (P14b). Cada rechazo devuelve `ok: false` con la razón concreta, nunca «no se pudo asignar».

**P16 · asignar un activo fuera de la lista de subtipos es posible y avisa.** El filtro es un default, no una cárcel: el interruptor «ver todo el inventario» deja elegir cualquier activo vigente, y al hacerlo el popup dice «`TEC-SER-0012` es un servicio, no un equipo entregable; su responsable normalmente es un cargo». Se puede seguir. Bloquearlo por completo obligaría a editar un parámetro para el caso raro y legítimo; no avisar dejaría a alguien registrando que una persona «tiene en la mano» un servicio en la nube.

**P17 · liberar un equipo está en la misma acción.** `personaId: null` con motivo deja el activo libre, que es lo que hace falta cuando alguien devuelve el portátil y todavía no se sabe a quién va. El botón vive en la fila de la persona, en la píldora del activo asignado (la `×` que hoy no existe, `Equipos.client.tsx:179-187`). El motivo es obligatorio también acá: liberar es cambiar de manos a nadie, y sin tabla de historia esa bitácora es el único sitio donde queda que el equipo volvió.

**P18 · `revalidarSgsi` suma `/tecnologia/equipos` a su lista de rutas.** Hoy revalida seis (`activos.ts:417-428`) y **ninguna es la de esta pantalla**, así que sin agregarla la tarjeta ACTIVOS ASIGNADOS y el renglón naranja de «activos vigentes sin custodio persona» (`Equipos.client.tsx:228-241`) seguirían mostrando los números de antes. Un contador que sigue diciendo 0 después de asignar hace que quien asigna lo intente otra vez. Se agrega en la función que ya existe, no con un `revalidatePath` suelto en la acción nueva: la lista de rutas del SGSI vive en un solo lugar y así se queda.

---

## 6 · Lo que esto mueve en el resto del sistema, y lo que no

**P19 · asignar un custodio persona NO genera tareas, y el popup no promete un número.** Es la diferencia con el popup de REQ-SIG-15, y conviene entenderla. Las obligaciones de alcance `ACTIVO` y `TIPO_ACTIVO` se reparten al **propietario**, que es un **cargo**, y sus destinatarios son quienes ocupan ese cargo (`lib/sig/generacion.ts:186-192`). El custodio persona no participa hoy en ninguna resolución de alcance. Así que este requerimiento **no toca el generador ni la previsión**, y el popup no imprime «se le asignaron N tareas» porque serían cero y decirlo confundiría.

Lo que sí deja listo es la puerta: con la custodia registrada, una obligación tipo «cada persona revisa el estado de su equipo» o «firma el acta de entrega» se vuelve expresable. Eso es un alcance nuevo (`CUSTODIO_ACTIVO`) y **es otro requerimiento**, con su resolución en `generacion.ts` y en `prevision.ts` —los dos, que es la duplicación consciente que `prevision.ts:10-13` declara—.

**P20 · el renglón naranja se vuelve un termómetro.** «N activos vigentes sin custodio persona» pasa de ser un dato inerte a la medida de cuánto falta. Con V19 arrancará en ~21 y debería bajar. Es el número que responde A.5.9 (inventario de activos con su responsable) sin salir de la pantalla.

**P21 · al desvincular, los equipos NO se liberan solos.** `Activo.personaId` se queda apuntando a la persona inactiva, y sus equipos siguen listados para armar el acta de borrado (`ActaBorradoSeguro`, `schema.prisma:2506-2537`). Liberarlos automáticamente inventaría una devolución que quizá no ocurrió —y sin tabla de historia (§4.1) **borraría el único dato que dice qué tenía esa persona**, justo el día en que hace falta—. Es la misma regla R9 que gobierna las tareas pendientes: se listan y se reasignan a mano, con motivo.

Esto hace que la pantalla necesite un renglón más: **«N equipos siguen asignados a personas inactivas»**, con su enlace. Sin él, esos activos quedan fuera de las 36 filas —que solo traen personas activas, `page.tsx:25`— y fuera del conteo de «sin custodio persona» —que solo cuenta `personaId: null`, `page.tsx:46`—. Serían invisibles en las dos direcciones, que es exactamente el hueco que el renglón naranja actual existe para evitar.

---

## 7 · Decisiones

Las ocho quedan **cerradas con la recomendación técnica adoptada el 2026-09-08**, para no frenar el desarrollo. Son ratificables; si el líder del SIG cambia alguna, se ajusta la sección asociada y el resto del requerimiento no depende de cuál se elija.

**D-1 · El filtro por defecto es una lista de subtipos parametrizable, con interruptor para ver todo** (P3, P4, P16).
*Por qué:* ofrecer los 296 activos hace que buscar el portátil entre servicios y datos sea inservible; ofrecer solo `[HW]` deja fuera los discos externos y las USB, que sí se entregan y sí entran al acta de borrado. La lista en `Parametro` evita que agregar un subtipo sea un despliegue.
*Si se revierte a «todo el inventario»:* hay que resolver la búsqueda con paginación del lado del servidor, porque 296 filas en el cliente ya no se filtran con un `useMemo`.

**D-2 · Sin tabla de historia: se usa `Activo.personaId`, que ya existe** (§4.1). **Resuelta por el líder del SIG el 2026-09-08**, sobre la propuesta contraria de la versión 1.0 de este documento.
*Por qué:* el esquema no se toca, no hay migración, y la asignación es un `update` de un campo. La corrida de arranque —36 altas seguidas, §3.4— es lo que hay que hacer funcionar primero, y una tabla de historia no la ayuda en nada: en la primera corrida no hay historia que guardar, porque ningún equipo ha rotado todavía.
*Qué se acepta a cambio:* el rastro de un cambio de manos vive **solo en la bitácora**, y el acta de borrado de quien sale hay que armarla **antes** de reasignar su equipo (§4.1). Es una regla de procedimiento, no un control del sistema, y por eso va escrita también en el documento de desvinculación.
*Cuándo habría que volver sobre esto:* el día que los equipos empiecen a rotar de verdad —una reasignación por mes ya lo justifica— o el día que el acta de entrega (D-6) necesite la fecha real. La tabla se puede agregar después sin migrar nada de lo que este requerimiento escriba: `Activo.personaId` seguiría siendo el puntero a la custodia vigente y las filas históricas se reconstruyen desde la bitácora, que para entonces será el único lugar donde están.

**D-3 · El activo ya asignado se muestra y reasignar exige motivo** (P5).
*Por qué:* un equipo que rota entre dos personas es el segundo caso más común. Ocultarlo dejaría como única salida el inventario, que es donde el campo no existe.

**D-4 · La valoración D/I/C es obligatoria en el alta desde el popup** (P11). ⚠️ **Para ratificación: es más estricto que `crearActivo`.**
*Por qué:* 36 portátiles sin valorar son 36 activos fuera de las matrices, del SoA y de los planes, y nadie vuelve a valorarlos después.
*Si se revierte:* el activo se crea sin valoración y la pantalla necesita una lista de «equipos creados sin valorar» con su conteo, o el hueco queda invisible.

**D-5 · La custodia se escribe SOLO desde este popup; la ficha del activo no la edita** (P6, §4.2).
*Por qué:* es la regla que el comentario de `Equipos.client.tsx:196-198` defiende, aplicada por campo en vez de por pantalla. Un campo, un camino, una bitácora.

**D-6 · El acta de ENTREGA queda fuera; la de BORRADO no** (§9, D-9). ⚠️ **Para ratificación: es lo que un auditor puede pedir a continuación.**
*Son dos actas distintas y conviene no confundirlas:* la de **borrado** (FOR-SIG-18, A.8.10) certifica que la información del anterior se eliminó, y **entra en este requerimiento** porque sin ella la reasignación es el incidente. La de **entrega** la firma quien recibe, con las condiciones de uso y el compromiso de devolución, y ésa es la que queda fuera.
*Por qué:* la entrega firmada con condiciones de uso y compromiso de devolución necesita plantilla de documento, firma (REQ-SIG-02) y publicación del soporte (REQ-SIG-13). Meterlo acá triplica el requerimiento y retrasa lo que hoy no existe, que es el registro. Ese requerimiento es el que va a necesitar la **fecha real de entrega**, que este no guarda (§4.1): es la columna que agregará, junto con la firma.

**D-7 · El popup no informa tareas generadas** (P19).
*Por qué:* serían cero. El alcance por activo se reparte al propietario, que es un cargo. Imprimir un cero sin explicación se lee como un fallo.

**D-8 · El activo con `cantidad > 1` se asigna con confirmación, no se rechaza** (P7).
*Por qué:* hay agrupaciones legítimas y el sistema no puede distinguirlas. Lo que no puede pasar es que alguien registre veinte portátiles en manos de una persona sin enterarse.

**D-9 · El equipo usado no se entrega sin acta de borrado, y el acta se registra desde este popup** (§3.5). **Pedida por el líder del SIG el 2026-09-08.**
*Por qué se registra acá y no se remite a otra pantalla:* porque esa pantalla no existe. `ActaBorradoSeguro` lleva en el esquema desde el 03/09 sin un solo camino de escritura (B6), así que «escoja el acta del listado» encontraría el listado vacío para siempre. La alternativa —bloquear la asignación y mandar a crear el acta a otra parte— sería mandar a un lugar que no está construido.
*Qué se acepta:* el requerimiento crece con un formulario de cinco campos y con el componente `ActaBorrado.tsx`. A cambio, la anomalía «salió sin acta de borrado» que `sig/estado/page.tsx:96` hoy solo sabe **contar** pasa a tener cómo resolverse, y la desvinculación de REQ-SIG-09 se encuentra el componente hecho.
*Qué NO se hace:* no se guarda un estado «pendiente de borrado» (B4). El equipo que espera borrado se deriva (B5).

**D-10 · No se crea una `Solicitud` para pedir el borrado.**
*Por qué:* `TipoSolicitud` tiene cuatro valores —`CAMBIO_TI`, `ACCESO`, `DEVOLUCION`, `UTILITARIO` (`schema.prisma:2614-2625`)— y ninguno es «borrado seguro». Agregar uno es una migración y, sobre todo, un flujo de tres pasos —pide, autoriza, ejecuta— para una acción que dura veinte minutos y que hace la misma persona que está entregando el equipo. El circuito de B4 —no se entrega, se libera, se borra, se vuelve— resuelve lo mismo sin estado nuevo.
*Si se revierte:* el día que el borrado lo ejecute un área distinta de la que entrega —un proveedor, por ejemplo— el trámite sí hace falta, y entonces `Solicitud` es el modelo correcto y no uno nuevo.

---

## 8 · Verificación — hecho significa demostrado

| # | Qué se comprueba | Cómo |
|---|---|---|
| 1 | El camino de escritura existe | Asignar `TEC-EQU-0004` a una persona y recargar: la tarjeta ACTIVOS ASIGNADOS pasa de 0 a 1 y la fila sale del rojo |
| 2 | El contador inverso se mueve | El renglón «N activos vigentes sin custodio persona» baja en 1 en la misma recarga (P18) |
| 3 | El filtro por defecto | Con el inventario V19 cargado, el popup ofrece los subtipos de `equipos_subtipos_asignables` y **ningún** `[vhost]`, `[firewall]` ni `[router]` |
| 4 | El par tipo/subtipo, no el subtipo suelto | Con un activo `[COM]/[mobile]` (red celular) en el inventario: **no** aparece en la lista. Con uno `[HW]/[mobile]`: sí |
| 5 | El pie dice cuántos quedaron fuera | «Se ofrecen 3 de 21 equipos», y los dos números cuadran con `SELECT count(*)` |
| 6 | Reasignar exige motivo, y la bitácora lo cuenta con nombres | Mover un equipo de A a B: el botón está deshabilitado sin motivo; después existe una fila de `Bitacora` con `campo = 'custodio persona'`, `valor_anterior` = **«Carlos Andrés Mejía»** y `valor_nuevo` = **«Andres Felipe Jaramillo»** — nombres, no ids (P14) |
| 7 | El esquema no cambió | `npx prisma migrate diff` entre `main` y la rama: **cero migraciones**. Lo único nuevo en la base es la fila de `Parametro` (§4.3) |
| 8 | El vacío abre el formulario | Con `personaId` puesto en todos los equipos: el popup no muestra «sin resultados», muestra el alta desplegada (P9) |
| 9 | El alta queda asignada de una vez | Crear un equipo desde el popup: el activo nace con código `AAA-TTT-NNNN` y con `personaId` puesto, en una sola operación. No queda ni un instante en que el activo exista sin dueño |
| 9b | **La corrida de arranque completa** | Con el inventario sin equipos y 36 personas sin nada: crear los 36 PCs **sin cerrar el popup ni una vez**, usando «Guardar y seguir». Al final, `SIN NINGÚN ACTIVO` = 0, `PROMEDIO POR PERSONA` = 1.0, y 36 activos nuevos con código consecutivo y sin huecos (P12c, P12e) |
| 9c | El formulario recuerda | En la corrida anterior, a partir de la segunda alta el único campo que hay que escribir es el nombre: tipo, subtipo, área, custodio cargo y D/I/C vienen del alta previa (P12b) |
| 9d | El nombre repetido avisa | Crear dos equipos con el mismo nombre: en el segundo el popup nombra el código del primero y propone la forma con serial. Se puede seguir de todos modos (P12d) |
| 10 | El alta valorada genera riesgos | El equipo creado con D/I/C que alcanzan el umbral aparece en las matrices; `generarRiesgos` devuelve más riesgos que antes |
| 11 | El área no se adivina | Persona sin área: los campos quedan vacíos y obligatorios, y el alta se rechaza con la frase, en vez de emitir un código con un prefijo inventado (P10) |
| 12 | Sin permiso, sin botón | Con `tecnologia:escribir` ausente: el botón no está en el DOM y la pantalla sigue siendo legible |
| 13 | El aviso de cantidad | Activo con `cantidad = 20`: la confirmación aparece y sin ella no se asigna (P7) |
| 14 | Liberar | `personaId: null` con motivo: el activo vuelve a la lista de disponibles y queda su fila de bitácora con el nombre de quien lo tenía (P17) |
| 14b | Los equipos de quien se va no desaparecen | Inactivar a una persona con dos equipos: siguen apuntando a ella, no salen en las filas de arriba, no se cuentan como «sin custodio persona», **y el renglón nuevo dice «2 equipos siguen asignados a personas inactivas»** (P21) |
| 15 | La ficha del activo no lo edita | Buscar el campo de custodio persona en `/sgsi/inventario/[codigo]`: no existe (D-5) |
| 16 | El generador no cambió | Correr `generar-asignaciones` antes y después de asignar 10 equipos: **el mismo número de asignaciones** (P19) |
| 17 | Teclado y foco | Escape cierra, el foco vuelve al botón de la fila, la lista se recorre con Tab y la búsqueda no roba el foco al escribir |
| **18** | **El equipo usado no se entrega sin acta** | Con un activo que tiene custodio: intentar asignarlo a otra persona sin acta. El botón está deshabilitado; y **llamando a la acción de servidor directamente**, con el acta omitida, devuelve `ok: false` (P14b) |
| 18b | El acta tiene que ser de esa persona y de ese activo | Con un acta de **otra** persona que sí incluye el activo: rechazada. Con un acta de la persona correcta que **no** incluye el activo: se acepta y le agrega la fila de `ActaBorradoActivo` (B3.1) |
| 18c | El acta nueva nace con el activo | Registrar un acta desde el popup: queda con `ActaBorradoActivo` desde el primer instante. No existe un momento en que el acta esté guardada sin activos (criterio 7 del modelo) |
| 18d | Todo o nada | Forzar el fallo de la escritura del acta: el activo **no** cambia de custodio. Forzar el fallo de la asignación: el acta **no** queda guardada (P14) |
| 18e | El sistema propone la respuesta | Activo con custodio: el popup dice «usado» y no deja cambiarlo. Activo liberado con bitácora de custodia: dice «usado» y nombra a quien lo tuvo. Activo recién creado: dice «nuevo» (B1) |
| 18f | Y se puede corregir | Un activo cargado por el consolidado, sin bitácora: el popup propone «nuevo» y **deja marcarlo como usado**, eligiendo al tenedor anterior entre las personas, inactivas incluidas (B2) |
| 18g | El pendiente se deriva, no se guarda | Liberar un equipo usado sin acta: aparece en el renglón «N equipos esperando acta de borrado» y **no hay ninguna columna nueva** que lo diga (B4, B5) |
| 18h | El formulario del acta es reusable | El acta se crea desde `app/components/sgsi/ActaBorrado.tsx`, no en línea dentro del popup (B6) |
| 19 | La corrida de arranque no lo padece | Las 36 altas de la verificación 9b: la pregunta de equipo nuevo/usado **no aparece ni una vez** (B7) |

---

## 9 · Qué NO hace este requerimiento

- **No genera el acta de entrega** ni la hace firmar (D-6). Registra la custodia y su fecha, que es lo que el acta va a citar.
- **No genera tareas** ni toca `generacion.ts` / `prevision.ts` (P19, D-7). El alcance `CUSTODIO_ACTIVO` es otro requerimiento.
- **No edita el activo.** Un solo campo, la custodia. Nombre, área, tipo, valoración, propietario y ubicación se siguen editando en la ficha (P6, D-5).
- **No toca el custodio CARGO.** `Activo.custodioId` sigue siendo la responsabilidad formal en el organigrama y no cambia cuando cambia quien lo tiene en la mano. Son dos campos y siguen siendo dos.
- **No guarda historia de custodia ni fecha de entrega** (D-2, §4.1). Un activo apunta a quien lo tiene ahora; lo anterior queda en la bitácora.
- **No guarda un estado «pendiente de borrado»** (B4, B5). El equipo que espera borrado se deriva de una consulta.
- **No tramita el borrado con una `Solicitud`** (D-10). No hace falta un flujo de pide-autoriza-ejecuta para algo que hace la misma persona que entrega el equipo.
- **No construye la pantalla de actas de borrado.** Crea el componente que la escribe (B6) y la primera vía para registrarlas. La lista completa de actas, su consulta y su exportación son de REQ-SIG-09, que es donde vive la desvinculación.
- **No verifica que el borrado se hizo.** Registra quién dice que lo hizo, cuándo, con qué método y con qué evidencia. La aplicación no puede mirar un disco; lo que puede es que nadie entregue un equipo usado sin que alguien firme esa afirmación.
- **No libera equipos al desvincular ni al bloquear** (P21). Los deja asignados para armar el acta de borrado, y agrega el renglón que los hace visibles.
- **No importa equipos en lote.** El consolidado que traiga los computadores entra por `importar.ts` con las reglas de REQ-SIG-12, y ése ya sabe cargar activos; lo que **no** trae el consolidado es a quién pertenece cada uno, así que la asignación se sigue haciendo acá. Cargar la pareja equipo↔persona desde un Excel es un requerimiento aparte, y solo tiene sentido el día que exista un archivo que ya traiga esa columna.
- **No deja que la persona vea ni edite su propia custodia.** Los activos a cargo en Mi SIG son de solo lectura y ya los resuelve `misig:ver` (`permisos.ts:102-104`).
- **No inventa áreas, cargos ni valoraciones** (P10, P11). Cuando el dato falta, lo pide.
