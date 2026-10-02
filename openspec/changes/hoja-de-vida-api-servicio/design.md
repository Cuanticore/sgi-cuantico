# Design: Hoja de vida del sistema · API de servicio

## D1 · La pantalla antes que la API, y no por gusto

El orden natural para quien pide la funcionalidad es al revés: lo que se pidió fue la API. Pero cuatro de las nueve hojas del formato —`RequisitoSeguridad`, `PruebaSeguridad`, `Liberacion`, `ComponenteTercero`— no tienen hoy **ningún** camino de carga: ni pantalla, ni semilla, ni script.

Si la primera escritura sobre esas tablas llega por API, el dato queda donde nadie puede verlo ni corregirlo. Y el trabajo de la hoja de vida no es guardar datos: es **sostener evidencia ante un auditor**. Una fila que sólo un agente puede leer no es evidencia, es un rumor con llave primaria.

La Fase 1 (pantallas) y la Fase 2 (identidad de máquina) no se tocan entre sí y corren en paralelo. De la Fase 3 en adelante la cadena es estricta.

## D2 · El autor se pasa; no se adivina

Esta es la decisión que sostiene todo lo demás.

Hoy la identidad se resuelve **dentro** de la función de dominio:

```ts
// app/mi-sig/acciones/mis-datos.ts:52-57
async function yo() {
  const session = await getServerSession(authOptions);
  // ...
}
```

Lo mismo en `autorConPermiso()` (`app/sgsi/acciones/sesion.ts:81-90`). No hay forma de invocar `guardarMisDatos` «en nombre de» otro actor sin fabricar una sesión falsa.

Las dos salidas posibles eran:

1. **Que la API reimplemente las reglas.** Barata hoy, cara siempre. Dos implementaciones de las mismas reglas sobre la misma tabla divergen —no es una hipótesis, es lo que pasa— y el día que diverjan, la hoja de vida dirá una cosa por pantalla y otra por API. Para un sistema cuyo único propósito es ser consultado por un auditor, eso es el peor defecto posible, porque no falla: miente.
2. **Extraer el autor a parámetro.** Más caro hoy, y es lo que se hace.

```ts
type Autor =
  | { clase: 'persona'; personaId: number; correo: string; rol: Rol }
  | { clase: 'servicio'; tokenId: number; nombre: string; alcance: readonly Permiso[] };

export function autorizado(autor: Autor, permiso: Permiso): boolean
export function etiquetaDeBitacora(autor: Autor): string   // 'ana@…' | 'api:robot-mintrace'
```

La Server Action resuelve el autor desde la sesión, la ruta lo resuelve desde el token, **y las dos llaman a la misma función de `lib/sig/desarrollo.ts`**. El refactor se limita a ese módulo y a sus llamadores directos; no se toca `lib/sgsi/`.

El parámetro va **primero** en la firma, no último con valor por defecto. Un `autor?` opcional es la misma trampa de antes con otra ropa: el día que alguien lo omita, la función vuelve a adivinar.

## D3 · `TokenServicio` es `EnlaceFirma` con alcance

El repo ya resolvió el problema del secreto portador cuando construyó la firma remota, y lo resolvió bien (`lib/sig/enlace-firma.ts`). No se diseña de nuevo: se copia lo que ya está probado y se le agrega lo que un token de servicio necesita de más.

Lo que se copia tal cual:

| Propiedad | Cómo | Por qué |
|---|---|---|
| Generación | `randomBytes(32).toString('base64url')` | 256 bits de `node:crypto`. Nunca UUID: un UUIDv4 trae 122 bits y un formato que invita a tratarlo como identificador público |
| Reposo | sólo `tokenHash` (SHA-256, `@unique`) | El secreto no toca la base. Un volcado de `token_servicio` no sirve para autenticarse |
| Validación | **búsqueda por hash**, no comparación | Elimina el ataque de temporización por construcción, no por cuidado |
| Caducidad | `expiraEn` obligatorio | Ver D4 |
| Revocación | `revocadoEn` + `motivoRevocacion` | Un token revocado dice por qué lo fue |
| Fuerza bruta | `intentosFallidos`, `bloqueadoEn` | |
| Respuesta al fallo | **idéntica en todos los casos** | No oracular si un token existe, expiró o fue revocado |
| Bitácora | registra el uso, **nunca el token** | Regla heredada de `lib/sig/firma-por-enlace.ts:51-62` |

Lo que se agrega:

- **Prefijo visible.** El secreto se entrega como `sgi_live_<22 caracteres>`; se persisten el hash completo y los primeros ocho caracteres en claro (`prefijo`). Sirve para nombrarlo en la bitácora, listarlo en pantalla y reconocerlo en un registro de servidor **sin poder reconstruirlo**. Sin prefijo, un token filtrado en un log no se puede identificar para revocarlo: hay que revocarlos todos.
- **Alcance con el vocabulario que ya existe.** `alcance: Permiso[]` sobre los 25 valores de `lib/sgsi/permisos.ts:57-95`. No se abre un segundo sistema de autorización. Un token con `sistema:escribir` no toca personas, hallazgos ni auditorías.
- **`ultimoUsoEn`.** Para poder caducar lo que duerme. Un token que nadie usó en noventa días es un riesgo sin contrapartida.
- **El secreto se muestra una sola vez**, al crearlo. Si se pierde, se revoca y se emite otro. No hay «ver token».

## D4 · La caducidad es obligatoria, igual que en `ExcepcionSeguridad`

`ExcepcionSeguridad.fechaCierre` es `DateTime` y no `DateTime?`, con el comentario que explica por qué: *«una excepción sin fecha de cierre es una exención permanente disfrazada»*.

`TokenServicio.expiraEn` sigue la misma regla y por la misma razón. Un token sin vencimiento es un acceso permanente que nadie va a revisar nunca, porque no hay ningún momento en que el sistema obligue a mirarlo. El vencimiento por defecto es de noventa días, parametrizable por entorno como ya lo es el de la firma (`FIRMA_ENLACE_DIAS`).

## D5 · `/api/v1` queda FUERA del matcher, y una prueba sostiene la decisión

`middleware.ts:26` lo dice con todas las letras: *«toda ruta que no figure nace pública por omisión»*. El matcher es lista blanca de lo **protegido**, y el propio archivo narra el caso de `/tecnologia` olvidado.

Entonces hay dos formas de equivocarse y una de acertar:

- **Olvidar `/api/v1` del matcher** → la API nace pública. Es el defecto que el archivo ya cometió una vez.
- **Meter `/api/v1` en el matcher** → `withAuth` responde con una redirección a la pantalla de ingreso. Para un cliente máquina eso es una respuesta 302 hacia HTML en lugar de un 401 con cuerpo JSON: el agente no entiende qué pasó y el operador tampoco.
- **Dejarla fuera a propósito, con el porqué escrito en el matcher, y hacer obligatoria la envoltura.**

Se toma la tercera. Y como «obligatoria» por disciplina dura exactamente lo que dura la primera semana apurada, la sostiene una prueba:

```
app/api/v1/__tests__/toda-ruta-usa-con-token.test.ts
```

Recorre el árbol de `app/api/v1/`, y por cada `route.ts` verifica que todo manejador exportado (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) esté envuelto en `conToken`. Si aparece una ruta nueva sin envoltura, la prueba falla antes del PR. La red es la prueba, no la buena memoria.

## D6 · Escrituras idempotentes por clave natural

Un agente reintenta. Es lo que hacen los agentes cuando se les cae la red, cuando el proceso se reinicia, cuando el operador vuelve a lanzar el trabajo. Si la escritura es `POST` con identificador autoincremental, cada reintento deja un duplicado y la hoja de vida se llena de requisitos repetidos.

Las claves naturales ya están en el schema y son únicas:

| Entidad | Clave |
|---|---|
| `Sistema` | `codigo` (`@unique`) |
| `RequisitoSeguridad` | `@@unique([sistemaId, codigo])` |
| `PruebaSeguridad` | `@@unique([sistemaId, codigo])` |
| `Liberacion` | `@@unique([sistemaId, version])` |
| `PuertaSistema` | `@@unique([sistemaId, puerta])` |
| `ExcepcionSeguridad` | `codigo` (`@unique`) |

Así que la escritura es `PUT /api/v1/sistemas/{codigo}/requisitos/{codigoRequisito}` resuelto como `upsert`. Reintentar es inofensivo por construcción.

`ComponenteTercero` y `TratamientoDatosPersonales` **no tienen clave natural** hoy. Para ellas, el `PUT` idempotente exige una: se agrega `codigo` con `@@unique([sistemaId, codigo])` en la misma migración. La alternativa —aceptar `POST` no idempotente sólo para esas dos— deja al cliente adivinando cuál colección se puede reintentar y cuál no.

## D7 · El conducto de adjuntos se reusa entero; lo único acoplado es la sesión

`app/api/sgsi/anexo/route.ts` ya hace lo correcto, y es bastante más de lo que suele hacerse:

1. Un solo dueño, impuesto por `CHECK` en SQL (`evidencia_un_solo_origen`)
2. Lista blanca de doce extensiones, sin ejecutables ni macros
3. **Verificación del contenido real** por números mágicos, no sólo por extensión → 415 si no coinciden
4. Tamaño por archivo y cuota acumulada por dueño
5. Antivirus opcional por `SGI_ANTIVIRUS_CMD`
6. SHA-256 del contenido
7. Si falla el guardado del bloque, **se revierte la fila de metadatos** — nunca metadatos huérfanos
8. Bitácora en la misma transacción

Nada de eso está atado al navegador: el manejador ya recibe `FormData` y `File` de la API web estándar. Lo único que impide usarlo desde una ruta con token portador es el `getServerSession` de la primera línea — que D2 resuelve.

Lo que sí hay que ampliar es el `CHECK` de dueño único. Hoy admite control, evento o hallazgo; la hoja de vida necesita además puerta, requisito, prueba e ítem de verificación. Se amplía la restricción en la misma migración, nunca se relaja: un adjunto con dos dueños es un adjunto que aparece dos veces en el expediente.

## D8 · La evidencia de verificación baja a nivel de ítem

El formato pide Evidencia, Fecha y Verificado por en las columnas H, I y J de la hoja `Verificación` — una terna **por cada uno de los 73 ítems**. La aplicación las tiene hoy a nivel de `EjecucionVerificacion`: una fecha y un verificador por lote completo.

Para la mayoría de los módulos eso basta. Para éste no: `PTR-TEC-03` §3 dice que el Oficial de Seguridad verifica **sobre la evidencia, no sobre la afirmación** de quien diligenció, y un lote con una sola fecha no permite decir qué evidencia sostiene cuál ítem.

`RespuestaItem` gana `evidenciaId`, `verificadoEn` y `verificadoPorId`, los tres opcionales. Opcionales porque el módulo A los usa para listas de verificación donde no aplican, y obligar ahí rompería el motor compartido que REQ-SIG-08 decidió no duplicar. La exigencia de que estén llenos vive en la regla de cierre de la hoja de vida, no en la columna.

> Queda abierta la decisión de qué pasa con las verificaciones ya firmadas cuando `PTR-TEC-03` cambie de versión. Hoy el catálogo no se versiona. No se resuelve en este cambio: afecta la validez de evidencia ya recogida y es del Responsable de Seguridad de la Información.

## D9 · El libro se genera; el formato no se edita nunca más

`lib/sig/for-tec-04-libro.ts` es un constructor **puro**: recibe los datos ya consultados, devuelve el libro, no toca Prisma ni sesión. Es el patrón que `lib/sgsi/inventario-libro.ts` ya estableció y que permite probar las doce hojas sin base de datos.

Tres cosas que el traslado manual del expediente SIS-001 dejó aprendidas y que el constructor tiene que respetar desde el primer día:

- **Los encabezados viven en la fila 4**, no en la primera, y las columnas de fórmula están pre-copiadas hasta la fila 504 aunque no haya dato. Contar filas reales exige filtrar por la columna de identificador no vacía, nunca por la última fila del libro.
- **La fila 5 del formato es un ejemplo**, no un dato. El expediente le dedicó una nota entera a advertir que `SIS-001` en el extracto oficial trae una fila ilustrativa que no corresponde al sistema real. El generador la reemplaza siempre.
- **El formato original trae una fórmula rota**, `_xlfn._LONGTEXT()`, que no existe. El traslado la sustituyó por `CONCATENATE()` sólo en la copia. El generador escribe la fórmula correcta de entrada.

**Y lo que no se hace:** no se replican los 464 comentarios de celda. Ese mecanismo nació porque 156 valores reales no calzaban en las listas desplegables del formato y 214 casillas estaban pendientes. La respuesta correcta a un dato que no cabe en la lista no es esconderlo en un comentario: es decir que la lista está mal. Los casos se acumulan en el reporte de faltantes y se llevan al dueño del formato.

El reporte de faltantes reemplaza a los `[PENDIENTE]` escritos a mano: por cada casilla vacía, qué falta y de quién es. Es la pieza que hace honesto al libro.

## D10 · Un agente diligencia; una persona cierra

El alcance de un token de servicio **no incluye** cerrar una puerta de control ni aprobar una excepción.

No es una restricción de prudencia genérica: el modelo ya separa `verificadoPorId` de `autorizaId` en `PuertaSistema` (`schema.prisma:4016-4017`), y el comentario explica por qué — *«quien verifica no es quien autoriza»*, porque `PRO-TEC-04` asigna esas dos autoridades a roles distintos. Un token que pudiera cerrar puertas colapsaría las dos en una sola identidad de máquina, y la separación de autoridades que el procedimiento exige dejaría de existir en los hechos aunque siguiera escrita en el documento.

Un agente puede: crear el sistema, diligenciar requisitos, pruebas, liberaciones, componentes y tratamientos, responder ítems de verificación y adjuntar evidencia. No puede: cerrar una puerta, aprobar o prorrogar una excepción, ni cerrar la hoja de vida.

## D11 · El límite de tasa llega antes que la escritura, no después

Hoy no hay límite de tasa en ninguna parte del repo. Mientras la única entrada fue una sesión de Azure AD detrás de una pantalla, eso era defendible. Una ruta de escritura con token portador cambia el cálculo: un agente en bucle puede escribir miles de veces por minuto contra la base que sostiene la evidencia de certificación, y el `HARNESS.md` ya narra un incidente de producción exactamente así —un bucle de creación de catálogo, con la batería de pruebas en verde.

Por eso el límite entra en la Fase 7 pero **la Fase 4 no se despliega sin él**. Y antes de la Fase 4 tiene que estar activo el branch ruleset que hace obligatorio `verificar`, que el propio `HARNESS.md` reconoce como pendiente: merge a `main` despliega a producción sin paso intermedio, y abrir escritura automatizada con ese portón abierto no se hace.
