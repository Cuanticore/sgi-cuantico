-- Cuantos dias antes del vencimiento una excepcion pasa a «por vencer».
--
-- Es un parametro y no una constante por la misma razon que los plazos de remediacion:
-- cuanto antes hay que avisar es una decision de la organizacion, y cambiarla no deberia
-- requerir un despliegue.
INSERT INTO "parametro" ("clave", "valor", "descripcion", "actualizado") VALUES
  ('desarrollo_excepcion_dias_aviso', '30',
   'Dias antes de la fecha de cierre en que una excepcion de seguridad pasa a «por vencer».', now())
ON CONFLICT ("clave") DO NOTHING;
