# Delta for system-lifecycle-write

## Purpose

La hoja de vida existe como modelo desde la migración de septiembre, pero no se puede llenar. `crearSistema` acepta nueve campos y no hay acción de actualización, así que criticidad, clasificación, RTO y RPO quedan huérfanos apenas se crea el sistema. Cuatro de las nueve hojas del formato —requisitos, pruebas, liberaciones y componentes— no tienen ningún camino de carga: ni pantalla, ni semilla, ni script. Y `PuertaSistema.evidenciaId` está en el schema sin que ningún código lo escriba.

Esta capacidad cierra el diligenciamiento, y lo hace sobre **una sola implementación** servida por pantalla y por API.

## ADDED Requirements

### Requirement: La hoja de vida se puede completar sin tocar la base de datos

MUST existir una acción `actualizarSistema` que acepte `criticidad`, `clasificacionId`, `rtoObjetivo`, `rpoObjetivo` y `rolTratamiento`. MUST existir escritura —acción y pantalla— para `RequisitoSeguridad`, `PruebaSeguridad`, `Liberacion` y `ComponenteTercero`.

`faltantesDeHojaDeVida` ya sabe detectar «sin criticidad» y «sin RTO/RPO». Un sistema que sabe nombrar un faltante que ninguna pantalla puede cerrar no está informando: está acusando.

#### Scenario: Un sistema nuevo llega a hoja de vida completa

- GIVEN un sistema recién creado con `faltantesDeHojaDeVida` devolviendo criticidad y RTO/RPO
- WHEN una persona los diligencia desde la pantalla de sistemas
- THEN la lista de faltantes queda vacía, sin que nadie haya escrito SQL

#### Scenario: Criticidad fuera de la escala del SGSI falla nombrando el valor

- GIVEN la escala de criticidad vigente del SGSI
- WHEN se intenta guardar un valor fuera de ella
- THEN la escritura falla diciendo qué valor se recibió y cuáles se admiten, y no persiste nada

#### Scenario: RTO y RPO son minutos, no texto

- GIVEN un RTO negativo
- WHEN se intenta guardar
- THEN la escritura falla, porque son el insumo del BIA anual y un valor negativo lo corrompe en silencio

### Requirement: `PuertaSistema.evidenciaId` deja de ser columna muerta

`registrarPuerta` MUST persistir `evidenciaId` cuando se le entrega. La evidencia referida MUST pertenecer al mismo sistema de la puerta; en caso contrario la escritura MUST fallar.

El campo existe desde la migración `20260904090000_gestion_tecnologica` y ningún código lo escribe. Una puerta registrada sin evidencia enlazable obliga a buscar el soporte por fuera del sistema, que es exactamente lo que `PTR-TEC-03` quiere evitar cuando exige que el verificador trabaje sobre la evidencia y no sobre la afirmación.

#### Scenario: La puerta queda enlazada a su soporte

- GIVEN una evidencia cargada para SIS-001 y la puerta P2 de ese sistema
- WHEN se registra la puerta citando esa evidencia
- THEN `evidenciaId` queda persistido y la pantalla ofrece abrir el soporte

#### Scenario: Una evidencia de otro sistema se rechaza

- GIVEN una evidencia que pertenece a SIS-002
- WHEN se intenta citarla al registrar una puerta de SIS-001
- THEN la escritura falla, porque un soporte prestado entre expedientes invalida los dos

### Requirement: El autor se pasa como primer parámetro y nunca es opcional

Las funciones de dominio de `lib/sig/desarrollo.ts` MUST recibir el autor como primer parámetro obligatorio, de tipo `Autor`, con sus dos clases: persona autenticada o token de servicio. MUST NOT resolver la identidad llamando `getServerSession` dentro de la función. El parámetro MUST NOT declararse opcional ni con valor por defecto.

Hoy `yo()` y `autorConPermiso()` resuelven la sesión por su cuenta, de modo que no hay forma de invocar la lógica en nombre de otro actor sin fabricar una sesión falsa. Un `autor?` opcional es la misma trampa con otra ropa: el día que alguien lo omita, la función vuelve a adivinar.

#### Scenario: Pantalla y API ejecutan la misma regla

- GIVEN la regla que valida la criticidad contra la escala del SGSI
- WHEN se diligencia desde la pantalla y luego por `PUT /api/v1/sistemas/SIS-001`
- THEN los dos caminos llaman a la misma función y rechazan exactamente los mismos valores

#### Scenario: La bitácora distingue quién escribió

- GIVEN la misma escritura hecha por una persona y por un token
- WHEN se consulta la bitácora
- THEN una entrada lleva el correo de la persona y la otra `api:<nombre>`, sin que la regla aplicada haya cambiado

### Requirement: Las escrituras por API son idempotentes por clave natural

Las escrituras de `/api/v1` MUST exponerse como `PUT` sobre la clave natural y resolverse como `upsert`. Repetir el mismo `PUT` MUST dejar el mismo estado final, sin filas duplicadas.

Un agente reintenta: se le cae la red, se reinicia el proceso, el operador relanza el trabajo. Con identificadores autoincrementales cada reintento deja un duplicado, y la hoja de vida se llena de requisitos repetidos que después alguien tiene que depurar a mano.

#### Scenario: Tres veces el mismo PUT deja una fila

- GIVEN `PUT /api/v1/sistemas/SIS-001/requisitos/REQ-001` con el mismo cuerpo
- WHEN se envía tres veces seguidas
- THEN existe una sola fila y su contenido es el del último envío

#### Scenario: Cambiar el cuerpo actualiza, no duplica

- GIVEN REQ-001 ya existente con prioridad media
- WHEN se envía el mismo `PUT` con prioridad alta
- THEN la fila se actualiza, sigue siendo una sola, y la bitácora guarda valor anterior y nuevo

### Requirement: Toda colección de la hoja de vida tiene clave natural

`ComponenteTercero` y `TratamientoDatosPersonales` MUST ganar un campo `codigo` con `@@unique([sistemaId, codigo])`. Las demás colecciones ya la tienen y MUST conservarla.

Sin clave natural no hay `PUT` idempotente, y aceptar `POST` no idempotente sólo para esas dos dejaría al cliente adivinando cuál colección se puede reintentar y cuál no. Esa asimetría se paga en el peor momento: cuando el agente ya falló y está reintentando.

#### Scenario: El SBOM también se puede reintentar

- GIVEN `PUT /api/v1/sistemas/SIS-001/componentes/CMP-014`
- WHEN se reenvía tras un corte de red
- THEN el componente queda una sola vez, con los datos del último envío
