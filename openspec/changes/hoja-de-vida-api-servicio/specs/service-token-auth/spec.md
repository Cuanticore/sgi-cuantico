# Delta for service-token-auth

## Purpose

Un agente automatizado necesita escribir en la hoja de vida sin suplantar a una persona. Hoy la única identidad que el sistema reconoce es una sesión de Azure AD, así que la única forma de que un proceso escriba es prestarle la cuenta de alguien — y entonces la bitácora miente sobre quién hizo qué.

`TokenServicio` es una identidad de máquina con nombre propio, alcance acotado y vencimiento. No se diseña de cero: copia lo que `EnlaceFirma` ya resolvió bien para la firma remota, y le agrega lo que un token de servicio necesita de más.

## ADDED Requirements

### Requirement: El secreto nunca se persiste

El secreto MUST generarse con `randomBytes(32).toString('base64url')` de `node:crypto` y entregarse con el prefijo `sgi_live_`. En la base MUST persistirse únicamente el hash SHA-256 (`tokenHash`, `@unique`) y los ocho primeros caracteres en claro (`prefijo`). El secreto completo MUST NOT escribirse en ninguna columna, ningún registro de servidor ni ninguna entrada de bitácora.

La validación MUST resolverse **buscando el hash** del secreto recibido, nunca comparando secretos. Eso elimina el ataque de temporización por construcción y no por cuidado de quien escriba el comparador.

#### Scenario: Un volcado de la tabla no sirve para autenticarse

- GIVEN un token emitido y usado con éxito
- WHEN se lee la fila completa de `token_servicio`
- THEN ninguna columna contiene el secreto, y con lo que hay no se puede construir una petición autenticada

#### Scenario: El prefijo identifica sin revelar

- GIVEN un secreto `sgi_live_7Kq2...` filtrado en un registro de servidor ajeno
- WHEN el operador busca ese prefijo en la pantalla de tokens
- THEN encuentra cuál revocar, sin que el prefijo permita reconstruir el secreto

#### Scenario: Dos emisiones nunca coinciden

- GIVEN mil tokens emitidos seguidos
- WHEN se comparan sus hashes
- THEN no hay ninguna colisión, y la restricción `@unique` nunca se dispara

### Requirement: La caducidad es obligatoria

`TokenServicio.expiraEn` MUST ser no nulo. La emisión MUST rechazarse si no se puede determinar una fecha de vencimiento. El valor por defecto SHOULD ser noventa días, parametrizable por entorno.

Es la misma regla que `ExcepcionSeguridad.fechaCierre`, y por la misma razón: un token sin vencimiento es un acceso permanente que nadie va a revisar nunca, porque no existe ningún momento en que el sistema obligue a mirarlo.

#### Scenario: No hay token eterno

- GIVEN una petición de emisión sin fecha de vencimiento ni valor por defecto resoluble
- WHEN se intenta emitir
- THEN la emisión falla nombrando el campo, y no se crea ninguna fila

#### Scenario: El secreto se muestra una sola vez

- GIVEN un token recién emitido cuyo secreto se mostró al operador
- WHEN el operador vuelve a abrir ese token en la pantalla
- THEN ve el prefijo, el alcance, el vencimiento y el último uso, y no hay ninguna forma de volver a ver el secreto

### Requirement: Todo fallo de autenticación responde igual

Un token inexistente, uno expirado, uno revocado y uno bloqueado por intentos fallidos MUST producir **la misma respuesta**: el mismo código de estado, el mismo cuerpo y el mismo tiempo de respuesta observable. La respuesta MUST NOT permitir distinguir cuál de los cuatro casos ocurrió.

Distinguirlos convierte la ruta en un oráculo: quien prueba secretos al azar aprende cuáles existieron alguna vez.

#### Scenario: Los cuatro fallos son indistinguibles

- GIVEN un secreto inventado, uno expirado ayer, uno revocado y uno bloqueado
- WHEN se envía cada uno en la cabecera `Authorization`
- THEN las cuatro respuestas son idénticas en código y cuerpo

#### Scenario: El bloqueo por intentos no se anuncia

- GIVEN un token que acumuló el tope de `intentosFallidos` y quedó con `bloqueadoEn`
- WHEN se envía el secreto correcto de ese mismo token
- THEN la respuesta es la misma que para un token inexistente

### Requirement: El alcance reusa el vocabulario de permisos existente

`TokenServicio.alcance` MUST expresarse con los valores del tipo `Permiso` de `lib/sgsi/permisos.ts`. El sistema MUST NOT introducir un segundo vocabulario de autorización para las rutas de servicio.

La autorización MUST evaluarse contra el alcance del token, no contra un rol: un token no pertenece a `Líderes SIG` ni a ningún grupo de Directorio.

#### Scenario: Un token acotado no alcanza otras áreas

- GIVEN un token cuyo alcance es únicamente `sistema:escribir`
- WHEN pide `GET /api/v1/personas`
- THEN la respuesta es 403, y la bitácora registra el intento con la etiqueta del token

#### Scenario: Alcance vacío no autoriza nada

- GIVEN un token vigente con alcance vacío
- WHEN pide cualquier ruta de `/api/v1`
- THEN toda petición responde 403

### Requirement: Un agente diligencia; una persona cierra

El alcance de un token MUST NOT habilitar el cierre de una puerta de control, la aprobación o prórroga de una excepción de seguridad, ni el cierre de la hoja de vida. Esas tres acciones MUST exigir un autor de clase persona.

`PuertaSistema` separa `verificadoPorId` de `autorizaId` porque `PRO-TEC-04` asigna esas dos autoridades a roles distintos. Un token que pudiera cerrar puertas colapsaría las dos en una sola identidad de máquina, y la separación de autoridades dejaría de existir en los hechos aunque siguiera escrita en el procedimiento.

#### Scenario: El token no cierra la puerta

- GIVEN un token con alcance `sistema:escribir` y una puerta P3 en estado `PENDIENTE`
- WHEN intenta llevarla a `SUPERADA`
- THEN la respuesta es 403 y la puerta sigue `PENDIENTE`

#### Scenario: El token sí diligencia

- GIVEN el mismo token y el mismo sistema
- WHEN registra un requisito de seguridad y adjunta su evidencia
- THEN la escritura procede y la bitácora la atribuye al token

### Requirement: Toda ruta de `/api/v1` pasa por la envoltura, y una prueba lo sostiene

Todo manejador exportado de todo `route.ts` bajo `app/api/v1/` MUST estar envuelto en `conToken`. MUST existir una prueba que recorra ese árbol y falle cuando alguno no lo esté.

El matcher de `middleware.ts` es lista blanca de lo protegido —toda ruta que no figure nace pública—, y el propio archivo narra el caso de `/tecnologia` olvidado. Meter `/api/v1` en el matcher tampoco sirve: `withAuth` responde con redirección a la pantalla de ingreso, que para un cliente máquina es un 302 hacia HTML en lugar de un 401 con cuerpo. Por eso la ruta queda fuera a propósito y la red es la prueba, no la memoria de quien agregue el siguiente archivo.

#### Scenario: Una ruta nueva sin envoltura no llega al PR

- GIVEN un `app/api/v1/sistemas/nuevo/route.ts` que exporta `POST` sin `conToken`
- WHEN corre `npm run verificar`
- THEN la prueba falla nombrando el archivo y el manejador

#### Scenario: Sin cabecera no hay lectura

- GIVEN una ruta de `/api/v1` ya envuelta
- WHEN se pide sin cabecera `Authorization`
- THEN la respuesta es 401 con cuerpo JSON, y no una redirección

### Requirement: La escritura de un token deja rastro con su nombre

Toda escritura cuyo autor sea de clase servicio MUST registrarse en `Bitacora` con `usuario = "api:<nombre del token>"`. El secreto y su hash MUST NOT aparecer en ningún campo de la entrada. Cada validación exitosa MUST actualizar `ultimoUsoEn`.

#### Scenario: El auditor sabe que fue una máquina

- GIVEN un token llamado `robot-mintrace` que actualiza la criticidad de SIS-001
- WHEN se consulta la bitácora de esa fila
- THEN el campo `usuario` dice `api:robot-mintrace`, con valor anterior y nuevo, y en ninguna parte aparece el secreto

#### Scenario: Un token dormido se puede encontrar

- GIVEN un token vigente cuyo `ultimoUsoEn` quedó hace más de noventa días
- WHEN se lista la pantalla de tokens
- THEN aparece marcado como dormido, para poder revocarlo sin adivinar
