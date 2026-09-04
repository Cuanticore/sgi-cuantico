-- La carga inicial de `plazo_por_tipo_hallazgo`, que nunca se aplico.
--
-- HALLAZGO REAL: la tabla existia y estaba VACIA. La tarjeta «Dias hasta el cierre» de
-- /sig/mejora hace `plazos.map(...)`, asi que con cero filas se renderizaba en blanco y
-- parecia «no hay datos» cuando lo que faltaba era la configuracion. El motor tampoco tenia
-- de donde sacar el plazo de un hallazgo recien clasificado.
--
-- Los valores salen de `docs/superpowers/plans/2026-08-31-sig-b-mejora.md`, que traia esta
-- misma sentencia y nunca se corrio. Se usan ESOS y no los del lienzo `Plazos.dc.html`:
--
--   * El plan da los TRES plazos que el modelo tiene —analisis, ejecucion y verificacion—.
--   * El lienzo da UNO solo por tipo (30/60/90/120 dias), que no se puede repartir en tres
--     sin inventar dos numeros. Queda anotado como divergencia entre el lienzo y el plan
--     para que quien especifica decida cual manda; mientras tanto rige el plan, que es el
--     unico que encaja con la tabla.
--
-- B7 · ningun plazo vive en el codigo: estan aca para poder cambiarlos sin desplegar.
INSERT INTO "plazo_por_tipo_hallazgo" ("tipo", "dias_analisis", "dias_ejecucion", "dias_verificacion", "actualizado_en") VALUES
  ('NC_MAYOR',    15, 30, 10, now()),
  ('NC_MENOR',    10, 20, 10, now()),
  ('OBSERVACION', 10, 15,  7, now()),
  ('OPORTUNIDAD', 15, 30,  7, now())
ON CONFLICT ("tipo") DO NOTHING;
