-- Asignar a mano: el indice de idempotencia se vuelve PARCIAL.
--
-- ── EL DEFECTO ───────────────────────────────────────────────────────────────────────────
--
-- El indice unico de `asignacion` cubre cuatro columnas con NULLS NOT DISTINCT:
--
--   ("obligacion_id", "persona_id", "periodo", "activo_id")
--
-- Eso es exactamente lo que hace falta para que el cron sea reintentable, y la migracion
-- 20260903143000_alcance_por_activo lo explica bien: sin NULLS NOT DISTINCT, dos filas con
-- `activo_id` nulo no chocarian y la idempotencia se perderia para todas las obligaciones
-- que no son por activo, que son todas las que hay hoy. Esa parte no se toca.
--
-- Pero una asignacion que NO nace de una obligacion —una tarea puntual, una accion de un
-- hallazgo, una alerta de metrica, o la que alguien asigna a mano desde el popup de una
-- persona— lleva `obligacion_id` Y `activo_id` en nulo. Su llave se reduce a
--
--   (NULL, persona_id, periodo, NULL)
--
-- y con NULLS NOT DISTINCT esos nulos SI chocan. Resultado: **una persona solo puede tener
-- UNA asignacion manual por periodo**. La segunda levanta violacion de unicidad y, como todo
-- esto corre dentro de una transaccion, tumba la operacion entera.
--
-- ── ESTO NO ES TEORICO: YA ESTA MORDIENDO EN DOS LUGARES ─────────────────────────────────
--
--   · `app/sig/acciones/metricas.ts` crea la tarea de alerta con `periodo: datos.periodo`
--     (`2026-09`). Dos metricas distintas con el mismo responsable que crucen umbral en el
--     mismo periodo colisionan, y lo que falla no es la alerta: es que **no se puede
--     registrar la medicion**, porque comparten transaccion.
--
--   · `app/sig/acciones/hallazgos.ts` usa `periodo: hallazgo.codigo` para esquivar la
--     colision — el parche de meter una llave sintetica en `periodo`. Funciona con una
--     accion por hallazgo, y falla en cuanto un hallazgo tiene dos acciones para el mismo
--     responsable.
--
-- Los dos se cierran con esta migracion, sin tocar su codigo.
--
-- ── POR QUE PARCIAL Y NO OTRA COSA ───────────────────────────────────────────────────────
--
-- El cron SIEMPRE escribe `obligacion_id` (`lib/sig/trabajos.ts` y `personas-edicion.ts`
-- salen los dos de `planificarGeneracion`, que produce asignaciones de obligaciones). Asi
-- que restringir el indice a las filas con obligacion deja su idempotencia intacta, letra
-- por letra, y libera la asignacion manual — que nunca fue idempotente porque nada la
-- reintenta: la crea una persona apretando un boton, una vez.
--
-- Las dos alternativas se descartaron:
--
--   · Meter un discriminador en `periodo` (`2026-09#FOR-CAP-04`) rompe el significado de la
--     columna en todo lo que ya la lee —la bandeja, los reportes, el planificador agrupan
--     por ella—. Es el parche que produjo los dos defectos de arriba.
--   · Crear una `Obligacion` «puntual» por cada asignacion a mano llena el catalogo de
--     reglas que no son reglas, y obliga al planificador a aprender a ignorarlas.
--
-- Esta migracion solo RELAJA una restriccion: no puede fallar sobre los datos existentes.
--
-- Prisma no expresa ni NULLS NOT DISTINCT ni el WHERE en el esquema, asi que el indice se
-- recrea aca con el mismo nombre y las mismas columnas, igual que hizo
-- 20260903143000_alcance_por_activo.

DROP INDEX "asignacion_obligacion_id_persona_id_periodo_activo_id_key";

CREATE UNIQUE INDEX "asignacion_obligacion_id_persona_id_periodo_activo_id_key"
  ON "asignacion" ("obligacion_id", "persona_id", "periodo", "activo_id")
  NULLS NOT DISTINCT
  WHERE "obligacion_id" IS NOT NULL;
