-- Identidad de un nivel del inventario: (grado, nombre, padre) — y el nombre, normalizado.
--
-- Hasta hoy `nivel_activo` no tenia ninguna restriccion de unicidad, y los tres escritores
-- buscaban el nivel con igualdad exacta y sensible a la caja. Una hoja que escribiera
-- `Productos` donde otra escribio `PRODUCTOS` creaba una rama nueva del arbol en vez de
-- encontrar la que ya existia. Asi aparecieron cinco raices donde debian estar tres.
--
-- Esta migracion solo pone la RESTRICCION. Los nombres ya existentes se normalizan y se
-- fusionan antes, con `scripts/estandarizar-niveles.ts`, porque fusionar es mudar hijos y
-- activos y eso no se resuelve en SQL a ciegas: hay casos —dos niveles que encabezan un
-- Producto— que exigen una decision de negocio.
--
-- Si esta migracion falla con una violacion de unicidad, es que ese paso no se corrio: la
-- falla es correcta y el orden es primero el script, despues la migracion.

-- `NULLS NOT DISTINCT` es lo que hace que esto sirva de algo.
--
-- En Postgres los NULL son distintos entre si dentro de un indice unico. Las raices tienen
-- `padre_id NULL`, asi que un unique comun sobre (grado, nombre, padre_id) dejaria pasar dos
-- raices con el mismo nombre — que es EXACTAMENTE el caso que origino todo esto. La clausula
-- existe desde PostgreSQL 15; el servidor corre 17.
-- `IF NOT EXISTS` porque esta migracion ya fallo una vez en produccion (18/09/2026, P3018)
-- DESPUES de esta linea: si Postgres alcanzo a crear el indice antes de abortar, reaplicarla
-- sin la clausula volveria a fallar, ahora por una razon distinta y mas confusa.
CREATE UNIQUE INDEX IF NOT EXISTS "nivel_activo_identidad"
  ON "nivel_activo" ("grado", "nombre", "padre_id") NULLS NOT DISTINCT;

-- La plantilla se sembro en caja de titulo ('Codigo Fuente', 'Ambientes'). `faltantesDePlantilla`
-- compara sin caja, asi que seguiria funcionando, pero la pantalla de niveles mostraria
-- `Codigo Fuente` al lado de `CODIGO FUENTE` y nadie sabria cual de los dos es el nombre.
-- La columna es `nombre_nivel_3`, no `nombre`: `plantilla_nivel` nunca tuvo una columna
-- llamada `nombre` — ver la migracion 20260904090000_gestion_tecnologica, que la crea con
-- (id, clase_nivel, nombre_nivel_3, activo_esperado, obligatorio, orden). Escrito como
-- `nombre`, este UPDATE tumbo el despliegue del 18/09/2026 con 42703.
UPDATE "plantilla_nivel" SET "nombre_nivel_3" = upper(btrim("nombre_nivel_3"));
