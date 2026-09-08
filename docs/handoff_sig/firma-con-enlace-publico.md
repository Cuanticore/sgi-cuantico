# Requerimiento · Firmar por enlace público cuando la cuenta corporativa ya no existe

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-16 · firma con enlace único al correo personal |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-08 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo (ejecución asistida con Claude Code) |
| **Extiende** | REQ-SIG-02 (leer / aceptar / firmar) · `docs/handoff_a/lectura-aceptacion-firma.md` |
| **Depende de** | REQ-SIG-15 §3.3 (el correo personal se puede editar) y §6 (el bloqueo de la cuenta), que es lo que crea este caso |
| **Estado** | Decisiones D-1 a D-9 tomadas por defecto (§9). **D-3 y D-8 requieren visto bueno de quien responde legalmente por la firma electrónica**, no del desarrollo. |

---

## 1 · El caso, y por qué hoy no tiene salida

Alguien sale de la organización con documentos pendientes de firmar —el acuerdo de confidencialidad, la política de tratamiento de datos, el acta de obligaciones subsistentes— y su cuenta corporativa ya está deshabilitada.

**Hoy no puede firmar, y no hay ninguna vía.** No es una incomodidad: es un camino cerrado, y se cierra dos veces.

1. Sin cuenta habilitada no hay token de Azure, así que no hay sesión y `/mi-sig` redirige al login (`middleware.ts:31`).
2. Y aun si la hubiera, la firma se niega: `app/sig/acciones/firma.ts:65` compara `asignacion.persona.correo` contra el correo de la sesión y rechaza cualquier otra cosa con «Sólo la persona asignada puede firmar. No hay firma por delegación.» Esa regla está bien y no se toca (§6 de REQ-SIG-02: firma cada persona y nadie por ella).

El resultado es que esas asignaciones quedan **abiertas para siempre**, contándose como vencidas en el tablero y en los indicadores de cumplimiento, sin que exista ninguna acción que pueda cerrarlas legítimamente. Cerrarlas administrativamente sería peor: un cierre sin acta afirma que alguien aceptó algo que nunca aceptó.

**Y REQ-SIG-15 vuelve esto frecuente.** El botón de bloqueo pone la cuenta en `accountEnabled = false` el mismo día del retiro, que es exactamente lo correcto para contener el acceso — y exactamente lo que deja sin firmar lo que faltaba. Los dos requerimientos van juntos: uno cierra el acceso, el otro deja abierta la única puerta que tiene que seguir abierta.

**Lo primero que hay que medir**, porque decide si esto es un caso o son cincuenta:

```sql
select p.nombre, p.correo, p.correo_personal, p.documento_identidad,
       count(*) as pendientes
from asignacion a
join persona p on p.id = a.persona_id
left join obligacion o on o.id = a.obligacion_id
left join contenido_sig c on c.id = coalesce(a.contenido_id, o.contenido_id)
where a.estado = 'PENDIENTE' and not p.activa and c.exige_firma
group by 1,2,3,4 order by pendientes desc;
```

Si la consulta devuelve gente con `correo_personal` nulo, **ese es el primer trabajo y no es de programación**: sin dirección a dónde escribir, este requerimiento no puede ayudarles.

---

## 2 · Lo que ya existe, y se reusa entero

| Pieza | Dónde | Qué aporta |
|---|---|---|
| El núcleo puro de la firma | `lib/sig/firma.ts` — `validarFirma`, `huella`, `codigoActa`, `generarActa` | Toda la lógica probatoria. **No se reescribe una línea** |
| La transacción de la firma | `app/sig/acciones/firma.ts:127-224` | Registro, evidencia, acta, cierre y bitácora en un solo `$transaction` (F7) |
| El panel de firma | `app/mi-sig/PanelFirma.tsx` | La pantalla que la pública tiene que espejar |
| `Persona.correo_personal` | Ya en el esquema (REQ-SIG-09) | El canal. Se hace editable en REQ-SIG-15 §3.3 |
| `Persona.documento_identidad` | Ya en el esquema | El segundo factor (P5) |
| Envío por SMTP | `lib/sgsi/notificaciones.ts` | `nodemailer` con credenciales de entorno. Ya configurado |
| Base del enlace | `PUBLIC_URL` en `.env.example:3` | `https://sig.cuantico.com`. No hay que inventar variable |
| Obligaciones subsistentes | `lib/sig/ciclos.ts:183-199` | La base legal para escribirle a alguien que ya salió (§8) |

**Nada de tokens ni de enlaces existe hoy**: no hay tabla, no hay ruta pública y no hay utilería de expiración. Es todo lo que este requerimiento construye.

---

## 3 · El problema que hay que resolver antes de escribir código: el acta diría una mentira

El artefacto del acta es texto determinista y su huella se calcula sobre ese texto (`lib/sig/firma.ts:163-166`). Su numeral 5 dice, hoy, literalmente:

> «Esta es una firma electrónica SIMPLE. […] Su confiabilidad se sustenta en **el control de acceso a la cuenta corporativa con la que se autenticó quien firma**, en la trazabilidad del numeral 4, y en la inalterabilidad de este registro.»

En una firma por enlace público **no hay cuenta corporativa y no hay autenticación**. Reusar ese texto produciría un acta que afirma como fundamento de su confiabilidad algo que no ocurrió — y ese acta es justo el documento que se le muestra a un auditor o a un juez. **Es evidencia fabricada, aunque el resto del registro sea impecable.**

Así que el acta no se reusa tal cual: se agrega **una variante del numeral 5 y dos campos al 1 y al 4** (§7). Es la parte del requerimiento que no se puede negociar por comodidad.

**P1 · el medio de identificación se guarda como dato, no se deduce del texto.** `ActaAceptacion` suma `medioIdentificacion` (§4.2). Deducirlo mañana leyendo el texto del acta —«¿dice cuenta corporativa o dice enlace?»— es la clase de consulta que nadie puede escribir para un informe.

---

## 4 · Modelo de datos

### 4.1 `EnlaceFirma` (nueva)

| Campo | Tipo | Nota |
|---|---|---|
| `id` | `Int @id` | |
| `codigo` | `String @unique` | `ENL-2026-0007`. **Lo que se nombra en la bitácora, en el acta y en un ticket de soporte.** Existe para que nadie tenga que pegar el token en ninguna parte (P3) |
| `asignacionId` | `Int` → `Asignacion` | Un enlace firma **una** asignación (D-4) |
| `tokenHash` | `String @unique` | SHA-256 del token. **El token en claro no se guarda nunca** (P2) |
| `correoDestino` | `String` | La dirección a la que se envió, **copiada** al emitir. Si la persona cambia su correo personal después, el acta tiene que seguir diciendo a dónde fue el enlace. Es la misma doctrina que la regla F2 de la declaración |
| `expiraEn` | `DateTime` | |
| `emitidoPor` | `String` | Correo de quien lo emitió. Es una autorización y tiene autor |
| `creadoEn` | `DateTime @default(now())` | |
| `enviadoEn` | `DateTime?` | |
| `vecesEnviado` | `Int @default(0)` | Reenviar es normal —«no me llegó»— y hay que poder contarlo |
| `usadoEn` | `DateTime?` | Instante de la firma |
| `actaId` | `Int? @unique` → `ActaAceptacion` | El acta que produjo. Cierra la trazabilidad enlace → acta → evidencia |
| `intentosFallidos` | `Int @default(0)` | Del documento de identidad (P5) |
| `bloqueadoEn` | `DateTime?` | |
| `revocadoEn` | `DateTime?` | |
| `motivoRevocacion` | `String?` | |

`@@index([asignacionId])`, `@@index([expiraEn])`.

**P2 · se guarda el hash, no el token.** Igual que una contraseña, y por la misma razón: un respaldo de la base, un `SELECT` de soporte o una fuga del volcado no pueden entregarle a nadie la capacidad de firmar en nombre de otro. La verificación es una **búsqueda por hash**, no una comparación de secretos —`where: { tokenHash: sha256(recibido) }`— así que no hay que preocuparse por comparaciones en tiempo variable: no se compara nada.

**P3 · el token nunca se escribe en la bitácora, ni en un registro, ni en un mensaje de error.** Lo que se registra es el `codigo`. Un token en la bitácora es un token en manos de todo el que puede leer la bitácora, que es justamente el grupo que audita las firmas.

### 4.2 Se agrega a `ActaAceptacion`

| Campo | Tipo | Nota |
|---|---|---|
| `medioIdentificacion` | `MedioIdentificacion @default(SESION_CORPORATIVA)` | El `default` es lo que hace que la migración no toque ninguna acta existente: todas las que hay se firmaron con sesión corporativa, y eso es verdad |
| `correoNotificacion` | `String?` | El correo personal al que se envió el enlace. Nulo en las firmas con sesión |
| `enlaceCodigo` | `String?` | `ENL-2026-0007`. Redundante con `EnlaceFirma.actaId` a propósito: el acta tiene que poder leerse sola |

```prisma
enum MedioIdentificacion {
  /// Sesión de Azure AD con la cuenta corporativa. Lo de siempre.
  SESION_CORPORATIVA
  /// Enlace único de un solo uso enviado al correo personal, más el documento de identidad.
  ENLACE_CORREO_PERSONAL
}
```

**Por qué un enum y no un booleano `firmadoConEnlace`:** el día que aparezca un tercer medio —firma en sitio ante el líder del SIG, certificado digital— un booleano obliga a migrar la columna y a reinterpretar `false`. Y el enum se lee en un informe.

---

## 5 · El flujo, de punta a punta

### 5.1 · Emisión

Desde el popup de REQ-SIG-15, en la pestaña de Contactos, junto al correo personal: **«Enviar enlace de firma»**, con la lista de lo que queda por firmar.

**P4 · la aplicación se niega a emitir el enlace cuando la vía fuerte está disponible.** Se exige `Persona.activa = false`. Si la cuenta corporativa funciona, la persona firma en Mi SIG con su sesión, y punto.

Sin esta regla el enlace se convierte en el camino cómodo —no hay que iniciar sesión— y en seis meses la mitad de las actas de la organización tendrían el fundamento débil en vez del fuerte. Una vía de excepción que se puede usar sin excepción deja de ser una excepción.

**P5 · el enlace no se emite sin las dos piezas del segundo factor.** Se exige `correoPersonal` **y** `documentoIdentidad` cargados. Si falta el documento, el botón lo dice y manda a la pestaña de datos base a cargarlo.

Por qué: `validarFirma` ya obliga a teclear el documento (`lib/sig/firma.ts:30`), pero hoy **solo lo registra, no lo verifica** — con sesión corporativa no hace falta, porque la identidad ya la aportó Azure. Sin sesión, ese tecleo es lo único que separa «quien tiene el enlace» de «quien es la persona». Así que en esta vía **el documento tecleado se compara contra el guardado**, y si no coincide no se firma. Posesión del enlace más conocimiento del documento; un enlace filtrado, solo, no alcanza.

**P6 · emitir un enlace nuevo para la misma asignación revoca el anterior**, en la misma transacción y con motivo `reemplazado por ENL-…`. Dos enlaces válidos para la misma firma significan que el viejo —el que quedó en un correo reenviado, en una captura de pantalla, en un ticket— sigue sirviendo.

**P7 · un enlace por asignación, un correo por persona.** El enlace es por asignación (D-4), pero el correo que se envía puede llevar varios enlaces, uno por documento. Cuatro correos por cuatro documentos es hostil sin ganar nada; cuatro actos de firma por cuatro declaraciones sí importa.

### 5.2 · Entrega

**P8 · el envío se registra en `EnlaceFirma`, no en `EnvioNotificacion`.** `EnvioNotificacion` tiene `@@unique([tipo, periodo, personaId])` (`schema.prisma:1454`), que es exactamente lo que hace idempotentes los avisos del cron — y exactamente lo que impediría **reenviar** un enlace a alguien que dice que no le llegó. Reusar esa tabla por parecido de forma haría que el segundo envío fallara con un error de unicidad que nadie va a entender.

El correo lleva: qué documento hay que firmar, por qué se le escribe a una dirección personal, hasta cuándo sirve el enlace, y a quién escribirle si no reconoce la solicitud. **No lleva el documento adjunto** y no lleva ningún dato personal más que el nombre.

### 5.3 · Uso

`GET ${PUBLIC_URL}/firmar/<token>`

**P9 · la URL no lleva nada más que el token.** Ni el id de la persona, ni el correo, ni el id de la asignación. Esa URL viaja por servidores de correo, se pega en chats y queda en el historial del navegador: el correo de alguien en una URL es una fuga sin necesidad, y un id secuencial en una URL es una invitación a probar el siguiente.

**P10 · la ruta pública no entra al `matcher` del middleware, y eso hay que decirlo en el archivo.** `middleware.ts:24-39` enumera lo protegido, así que una ruta nueva nace pública **por omisión** — cómodo hoy, peligroso el día que alguien agregue `/firmar/panel-interno`. Va un comentario en `middleware.ts` diciendo que `/firmar` es deliberadamente pública y que su autorización es el token.

**P11 · la página muestra el mínimo: el nombre de la persona y el documento a firmar.** Nada de área, cargo, otras tareas, otros documentos, ni navegación hacia la aplicación. El nombre sí, porque sin él nadie sabe si la solicitud es para él. Todo lo demás es superficie que un enlace filtrado expone gratis.

**P12 · `Referrer-Policy: no-referrer` en la respuesta, y ni un enlace externo en la página.** El token va en la ruta, así que cualquier recurso o enlace de tercero se lo lleva en la cabecera `Referer`. Y la ruta **se excluye del registro de accesos** —o se enmascara el último segmento— porque un token en un log es un token.

**P13 · un token que no sirve produce siempre la misma página.** Inexistente, expirado, revocado o bloqueado: la misma frase neutral —«este enlace no está disponible; escribí a …»— sin nombres y sin decir cuál de los cuatro casos es. Distinguirlos convierte la ruta en un oráculo para saber si un token adivinado existe.

La excepción, que sí informa: **un enlace ya usado dice que ya se firmó, con la fecha y el código del acta.** Quien vuelve a abrir su propio enlace después de firmar necesita esa confirmación, y a esa altura ya no hay nada que proteger.

**P14 · cinco documentos equivocados y el enlace queda bloqueado.** `intentosFallidos` cuenta; al quinto, `bloqueadoEn` y se exige emitir uno nuevo. Un documento de identidad son entre seis y diez dígitos: sin tope, quien consiga un enlace lo adivina.

### 5.4 · Firma

**P15 · un solo núcleo de firma, dos puertas.** La transacción de `firmarYAceptar` (registro, evidencia, acta, cierre, bitácora) se **extrae** a una función que recibe la identidad del autor y el medio de identificación, y las dos vías la llaman:

```
lib/sig/firma.ts            ← puro, ya existe, no cambia salvo el numeral 5 (§7)
app/sig/acciones/firma.ts   ← firmarYAceptar(asignacionId, datos)     · sesión corporativa
                              firmarConEnlace(token, datos)           · enlace público
                              ↓ las dos llaman a
                              asentarFirma(tx, { asignacion, contenido, version, datos,
                                                 autor, medio, enlace? })
```

Copiar la transacción sería la decisión que arruina el requerimiento. Son cinco escrituras acopladas cuya regla F7 es que ocurren juntas o no ocurren; la segunda copia se desincroniza en el primer cambio, y el defecto aparece en las actas —el artefacto probatorio— de una sola de las dos vías. Es la misma trampa que `prevision.ts:10-13` documenta para el alcance.

**P16 · `firmarConEnlace` no llama a `autorActual()`.** No hay sesión: llamarlo lanzaría `SinSesionError`. El autor de la bitácora es `enlace:ENL-2026-0007 · nombre@gmail.com`, **nunca el correo corporativo**, que afirmaría una sesión que no existió. Y acá sí se puebla `Bitacora.ip`, que el esquema tiene y hoy solo usa el flujo de anexos.

**P17 · las tres puertas de `firmarYAceptar` que se conservan idénticas**, porque no dependen de la sesión: la asignación existe, no está ya cerrada (`registros.length > 0`), y el contenido `exigeFirma` y tiene su `VersionContenido` guardada. La cuarta —`persona.correo !== sesion`— se **reemplaza**, no se elimina: en esta vía el vínculo entre la persona y el acto lo establece el token, que apunta a la asignación, más el documento verificado.

**P18 · al firmar, se le manda copia al correo personal.** El código del acta, su huella y su fecha. Es constancia para quien firmó —que ya no tiene dónde consultar su historial, porque `/mi-sig` le está cerrado— y es la evidencia de que la notificación llegó a la dirección que el acta declara.

---

## 6 · La forma del token

```
crypto.randomBytes(32) → base64url  (43 caracteres, 256 bits)
```

**No un UUID.** Un v4 tiene 122 bits, que alcanzarían, pero su formato invita a tratarlo como identificador —se pega en tickets, se registra en logs, se autocompleta— y no toda librería que los genera usa un generador criptográfico. Un token opaco de 32 bytes no se confunde con un id.

`FIRMA_ENLACE_DIAS`, por defecto **7**. El criterio: suficiente para quien no revisa su correo personal a diario, corto para que un correo reenviado meses después no siga firmando. Es parámetro y no constante porque cambiar un plazo no debe ser un despliegue.

---

## 7 · El acta, cuando la identificación fue por enlace

Cambia en tres numerales y **solo cuando el medio es `ENLACE_CORREO_PERSONAL`**. Con sesión corporativa el texto sigue siendo carácter por carácter el de hoy, así que **ninguna acta existente cambia de huella**.

**Numeral 1**, se agrega una línea:

```
   Correo personal (canal de notificación): daniel.medina@gmail.com
```

**Numeral 4**, se agregan dos:

```
   Medio de identificación: enlace único de un solo uso (ENL-2026-0007)
   Enviado a: daniel.medina@gmail.com el 2026-09-10T14:02:11Z
```

**Numeral 5**, texto propio y honesto:

```
5. FIRMA ELECTRÓNICA
   Esta es una firma electrónica SIMPLE. No interviene un certificado digital ni una
   entidad de certificación. Quien firma NO se autenticó con una cuenta corporativa:
   su cuenta ya estaba deshabilitada al momento de la firma. La confiabilidad se
   sustenta en tres hechos verificables: la posesión de un enlace único de un solo uso
   enviado exclusivamente a la dirección de correo personal registrada en su ficha; el
   conocimiento del número de documento de identidad, que fue verificado contra el
   registrado; y la trazabilidad del numeral 4.
```

**P19 · lo que el acta no puede afirmar, no lo afirma.** Si la fecha en que se registró el correo personal no consta —porque el valor entró por una carga inicial y no por una edición con bitácora—, el acta dice `dirección registrada en la ficha; sin registro de origen`. Es información que un auditor va a pedir para evaluar la atribución, y decir «registrada por RRHH el 3 de marzo» sin poder probarlo es peor que decir que no consta.

**P20 · el orden de los campos, una vez desplegado, es fijo.** Igual que en la vía existente (`lib/sig/firma.ts:110-113`): reordenarlo cambia la huella de todas las actas futuras sin cambiar su contenido, y dos actas con el mismo contenido dejarían de tener la misma huella.

---

## 8 · Base legal y datos personales

Esto no lo decide el desarrollo. Lo que el desarrollo tiene que garantizar es que **lo que la ley pide quede registrado y sea verificable**.

**Firma electrónica.** La Ley 527 de 1999 y el Decreto 2364 de 2012 admiten la firma electrónica y exigen que el método sea **confiable y apropiado para el propósito**, con criterios de identificación del firmante y de integridad del mensaje. Lo que este diseño aporta a ese examen: identificación por dos elementos independientes (§5.3), control exclusivo razonable del canal (una dirección personal declarada por la propia persona), integridad por SHA-256 del documento y del acta, y constancia de fecha, hora, IP y agente. **Que eso sea suficiente para el uso que la organización le va a dar es un juicio jurídico** — D-3.

**Escribirle a alguien que ya salió.** El correo personal se usa **solo** para las obligaciones que subsisten a la terminación, que están enumeradas en `lib/sig/ciclos.ts:183-199` con su vigencia y su fuente. No para avisos generales, ni para el resumen semanal, ni para encuestas. La finalidad limitada es lo que sostiene el uso del dato después de la relación laboral (Ley 1581).

**P21 · el enlace solo alcanza a lo que ya estaba asignado.** No crea obligaciones, no reabre nada y no toca otra asignación que la suya. Emitirlo no es asignar.

**P22 · el correo personal se muestra enmascarado en las pantallas de gestión.** `d••••••@gmail.com`, con el valor completo visible solo al emitir el enlace y en el acta. La lista del censo no necesita imprimir la dirección personal de 90 personas.

---

## 9 · Decisiones

**D-1 · La regla «firma cada persona y nadie por ella» no se toca.** El enlace no es una firma por delegación: lo usa la persona, no quien lo emite. Quien emite **habilita el canal**, y eso queda registrado con su nombre en `EnlaceFirma.emitidoPor`.

**D-2 · El acta declara el medio real de identificación** (§7, P1).
*Por qué:* reusar el numeral 5 actual produciría un acta que invoca una autenticación que no ocurrió. Una herramienta de SGSI que emite evidencia inexacta sobre su propia evidencia es el peor hallazgo posible.
*Si se revierte* (un solo texto para las dos vías): hay que redactar un numeral 5 que sea verdadero en los dos casos, y el único que lo es dice mucho menos que los dos actuales.

**D-3 · El método es firma electrónica simple, y su suficiencia jurídica la valida quien responde por ella.** ⚠️ **Requiere visto bueno externo al desarrollo.**
*Qué hay que llevar a esa revisión:* el texto del numeral 5 (§7), las dos piezas de identificación (P5), el plazo de expiración (§6) y el uso único (D-5). *Qué NO resuelve este requerimiento:* si para el acuerdo de confidencialidad de un ex colaborador la organización necesita firma electrónica **certificada** — eso sería otro requerimiento, con proveedor y costo.

**D-4 · Un enlace, una asignación.**
*Por qué:* un enlace que firma cuatro documentos convierte cuatro declaraciones distintas en un solo acto de voluntad, y multiplica por cuatro lo que cuesta una filtración. El correo puede llevar los cuatro enlaces (P7), que resuelve la incomodidad sin tocar lo probatorio.

**D-5 · Un solo uso para firmar; abrirlo, cuantas veces haga falta.** La gente cierra la pestaña, se le va la conexión, quiere leer el documento dos veces antes de aceptar. Lo que se consume una sola vez es la **firma**; después, el enlace solo muestra la constancia (P13).

**D-6 · El enlace solo se emite si la cuenta corporativa NO está habilitada** (P4).
*Si se revierte* (permitirlo con una cuenta activa, para un buzón roto): hay que exigir motivo, marcarlo como excepción visible en `/sig/estado` y aceptar que la vía débil se vuelva elegible. **La recomendación es no revertirlo**: el día que se pueda elegir, se elige.

**D-7 · El documento de identidad se verifica, no solo se registra** (P5).
*Consecuencia operativa que hay que aceptar:* sin `documentoIdentidad` cargado no hay enlace. Es una carga de datos que hoy está incompleta, y este requerimiento la vuelve un prerrequisito en vez de un pendiente.

**D-8 · El plazo por defecto es de 7 días y la organización puede cambiarlo.** ⚠️ **Confirmar el valor con el líder del SIG antes de desplegar**; el parámetro no requiere despliegue después.

**D-9 · La ruta pública es una sola y no crece.** `/firmar/<token>` sirve la página y recibe la firma. No se agregan rutas públicas para «ver mi historial», «descargar mi acta» ni «actualizar mis datos». Cada ruta pública nueva es superficie de ataque sobre una aplicación que gobierna el SGSI, y las tres tentaciones anteriores se resuelven por correo (P18).

---

## 10 · Variables de entorno

```
# ─── Firma por enlace público (REQ-SIG-16) ────────────────────────────────────
# Días de validez del enlace de firma. Sin ella, 7.
FIRMA_ENLACE_DIAS=7
# La base del enlace es PUBLIC_URL, que ya existe. Si PUBLIC_URL no está definida el
# enlace NO se emite: un correo con un enlace a localhost es un correo perdido.
```

Reusa `PUBLIC_URL` y las variables `SMTP_*` que ya usa `lib/sgsi/notificaciones.ts`. **Ninguna credencial nueva y ningún permiso nuevo de Azure**: esta vía no habla con Graph.

---

## 11 · Verificación — hecho significa demostrado

| # | Qué se comprueba | Cómo |
|---|---|---|
| 1 | El token en claro no está en la base | `select * from enlace_firma` no contiene el token del correo. Solo su hash |
| 2 | Ni en la bitácora ni en los logs | Emitir, firmar, y buscar el token en `bitacora` y en el registro de accesos del servidor: cero resultados (P3, P12) |
| 3 | Firmar por enlace produce un acta íntegra | El acta existe, su `documento_hash` coincide con el de la versión mostrada, y `acta_hash` es el SHA-256 del texto guardado en `evidencia_archivo` |
| 4 | **El acta dice la verdad** | Su numeral 5 es el de §7 y **no** menciona cuenta corporativa. `medio_identificacion = 'ENLACE_CORREO_PERSONAL'` |
| 5 | Las actas existentes no cambian | Recalcular el SHA-256 del texto de todas las actas previas: coincide con `acta_hash`. La migración no las tocó |
| 6 | Una sola implementación de la firma | Firmar por las dos vías el mismo tipo de contenido: los dos actas salen con la misma estructura, y `grep` encuentra **un** solo `actaAceptacion.create` en el proyecto (P15) |
| 7 | Documento equivocado no firma | Cinco intentos: los cinco rechazados, `intentos_fallidos = 5`, `bloqueado_en` puesto, el sexto ni se evalúa (P14) |
| 8 | Reemitir invalida el anterior | Emitir dos veces: el primer enlace deja de servir y queda con `motivo_revocacion` (P6) |
| 9 | Expirado, revocado e inexistente se ven igual | Los tres devuelven la misma página, sin nombres y sin distinguirse (P13) |
| 10 | Usado dice que ya se firmó | Con la fecha y el código del acta, y no vuelve a firmar |
| 11 | No hay enlace para cuenta activa | Intentar emitirlo sobre una persona `activa`: rechazado (P4) |
| 12 | La URL no lleva datos personales | Inspeccionar el enlace del correo: solo el token |
| 13 | La ruta pública no expone nada más | La página no trae área, cargo, otras tareas ni enlaces a la aplicación (P11) |
| 14 | `/firmar` es pública y el resto no | Sin sesión: `/firmar/<token>` responde 200 y `/mi-sig` redirige al login |
| 15 | La asignación queda cerrada de verdad | `estado = 'REALIZADA'`, `cerrada_por` = la propia persona, y la tarea desaparece de los vencidos del tablero |
| 16 | La constancia llega | El correo personal recibe el código del acta y su huella (P18) |
| 17 | Trazabilidad completa | Desde `enlace_firma.codigo` se llega al acta, a la evidencia y a la fila de bitácora, y desde el acta se llega de vuelta al enlace |

---

## 12 · Qué NO hace este requerimiento

- **No permite firmar por otro.** El enlace lo usa la persona; quien lo emite solo habilita el canal (D-1).
- **No crea sesión.** Usar el enlace no autentica a nadie ni da acceso a ninguna otra pantalla.
- **No abre `/mi-sig` a quien no tiene cuenta.** No hay historial público, ni descarga pública del acta (D-9).
- **No cierra tareas que no exijan firma.** Solo actúa donde hay `exigeFirma` y por lo tanto hay acta.
- **No asigna nada.** El enlace alcanza lo ya asignado (P21).
- **No convierte el acta en PDF.** Sigue siendo el `.txt` con su huella, igual que la vía existente. Cambiar el formato es el requerimiento que REQ-SIG-13 §13 ya dejó apartado.
- **No es firma electrónica certificada** y no lo dice en ninguna parte (D-3).
- **No usa el correo personal para nada más** que las obligaciones subsistentes (§8).
- **No reemplaza el trámite de desvinculación** de REQ-SIG-09: es una de sus piezas, la que permite cerrar los compromisos cuando el acceso ya se cortó.
