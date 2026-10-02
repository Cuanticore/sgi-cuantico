# Delta for verification-item-evidence

## Purpose

`PTR-TEC-03` §3 dice que el Oficial de Seguridad verifica **sobre la evidencia, no sobre la afirmación** de quien diligenció. Hoy la aplicación guarda la fecha y el verificador a nivel de `EjecucionVerificacion`: una terna por lote de 73 ítems. Con eso no se puede decir qué soporte sostiene cuál ítem, que es justamente lo que el procedimiento pide.

El formato lo refleja: las columnas H, I y J de la hoja `Verificación` piden Evidencia, Fecha y Verificado por **para cada ítem**.

## ADDED Requirements

### Requirement: La evidencia de verificación baja a nivel de ítem

`RespuestaItem` MUST ganar `evidenciaId`, `verificadoEn` y `verificadoPorId`. Los tres MUST ser opcionales en el modelo.

Opcionales porque el mismo motor sirve a las listas de verificación del módulo A, donde esas columnas no aplican, y REQ-SIG-08 decidió a propósito no duplicar el motor. La exigencia de que estén llenos MUST vivir en la regla de cierre de la hoja de vida, no en la columna: la restricción pertenece al dominio que la necesita, no a la tabla que comparten varios.

#### Scenario: Cada ítem cita su propio soporte

- GIVEN los ítems 21 y 49 respondidos como cumple en la misma ejecución
- WHEN cada uno se responde con su evidencia y su fecha
- THEN los dos conservan soportes distintos, y la hoja `Verificación` los exporta en filas separadas

#### Scenario: El motor del módulo A no se rompe

- GIVEN una lista de verificación del módulo A sin ítems con puerta
- WHEN una persona la responde
- THEN la respuesta se guarda sin exigir evidencia, fecha ni verificador

#### Scenario: Cerrar la hoja de vida sí los exige

- GIVEN un sistema cuya verificación tiene ítems en cumple sin evidencia citada
- WHEN se intenta cerrar la hoja de vida
- THEN el cierre se rechaza nombrando los ítems sin soporte

### Requirement: El `CHECK` de dueño único se amplía, nunca se relaja

La restricción SQL `evidencia_un_solo_origen` MUST ampliarse para admitir como dueño una puerta de control, un requisito de seguridad, una prueba de seguridad o una respuesta de ítem de verificación, además de los dueños actuales. La restricción MUST seguir exigiendo **exactamente un** dueño por evidencia.

Un adjunto con dos dueños aparece dos veces en el expediente y se cuenta dos veces en los indicadores. El que lo descubra va a ser el auditor.

#### Scenario: Un adjunto con dos dueños no entra

- GIVEN una evidencia que referencia a la vez una puerta y un hallazgo
- WHEN se intenta insertar
- THEN la base la rechaza por la restricción, no la aplicación

#### Scenario: Un adjunto sin dueño tampoco

- GIVEN una evidencia con todas las referencias de dueño en nulo
- WHEN se intenta insertar
- THEN la base la rechaza

### Requirement: La carga por API conserva las garantías del conducto existente

`POST` de evidencias por `multipart` MUST reusar el conducto de `app/api/sgsi/anexo/route.ts` y MUST conservar sus ocho garantías: dueño único, lista blanca de extensiones, verificación del contenido real por números mágicos, tope de tamaño y cuota acumulada por dueño, antivirus cuando esté configurado, SHA-256 del contenido, reversión de la fila de metadatos si falla el guardado del bloque, y bitácora en la misma transacción.

El conducto ya trabaja con `FormData` y `File` de la API web estándar; lo único que lo ata al navegador es el `getServerSession` de la primera línea. Reimplementarlo para la API significaría tener dos conductos y perder una de las ocho garantías en el que se escriba de segundo.

#### Scenario: Un ejecutable disfrazado de PDF se rechaza

- GIVEN un `.exe` renombrado a `.pdf`
- WHEN se envía por `POST /api/v1/.../evidencias`
- THEN la respuesta es 415, porque los números mágicos no coinciden con la extensión, y no se persiste nada

#### Scenario: Si falla el bloque no quedan metadatos huérfanos

- GIVEN una carga cuyo guardado del contenido falla después de crear la fila de metadatos
- WHEN termina la petición
- THEN no existe ninguna fila de `Evidencia` sin su `EvidenciaArchivo`

#### Scenario: La cuota aplica igual por API que por pantalla

- GIVEN un dueño que ya alcanzó su cuota acumulada
- WHEN carga un archivo más por API
- THEN se rechaza con el mismo criterio con que se rechazaría desde la pantalla
