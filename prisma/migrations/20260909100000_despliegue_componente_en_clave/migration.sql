-- REQ-SIG-12 · el componente entra a la clave de idempotencia de `despliegue`.
--
-- POR QUE. El Detalle de ambiente del Consolidado V19 trae 129 filas, y con la clave
-- anterior —`repo_github + ambiente + servidor`— colapsaban a 107: se perdian 22 filas en
-- silencio, que es la peor forma de perderlas.
--
--   ("-", "produccion", "srv-cuantico-toolbox")  x15  Coolify, Plane, n8n, Superset,
--                                                     Keycloak, Grafana, GlitchTip, Evolution
--                                                     API, Infisical, Umami, WikiJS, CrowdSec…
--   ("-", "produccion", "Infraestructura ILC")   x3   Moodle 4.4, Moodle 4.3, Uptime Kuma
--   ("monitor_unad_agents", "desarrollo", …)     x3   Agents / worker / beat
--   y cuatro pares mas (gateway de pagos API+Admin, notificaciones API+Web…)
--
-- Los quince primeros son servicios de infraestructura que no tienen repositorio propio: el
-- libro escribe «-» en `repo_github` y todos corren en el mismo servidor y ambiente. El
-- resto son un mismo repositorio desplegado como varios procesos.
--
-- En los dos casos el `componente` es lo unico que los separa —«Panel de despliegue»,
-- «BI / dashboards», «Agents worker (celery)»— y separarlos es exactamente lo que la clave
-- tiene que hacer: son despliegues DISTINTOS, no la misma fila importada dos veces. Con el
-- componente adentro las 129 filas quedan distintas: verificado sobre el libro, 129 claves,
-- cero perdidas.
--
-- NULLS NOT DISTINCT (PostgreSQL 15+; corremos 17.11) se mantiene y ahora ademas cubre el
-- componente, que es nulable. Sin el, dos filas de un mismo repo y ambiente sin componente
-- declarado no chocarian —en SQL estandar dos nulos son distintos— y cada reimportacion las
-- duplicaria. Prisma no sabe expresarlo, por eso el indice se recrea a mano.

DROP INDEX "despliegue_repo_github_ambiente_servidor_key";

CREATE UNIQUE INDEX "despliegue_repo_github_ambiente_servidor_componente_key"
  ON "despliegue" ("repo_github", "ambiente", "servidor", "componente")
  NULLS NOT DISTINCT;
