-- D5 · `Evidencia` exige dueño, y el CHECK que lo imponia estaba INCOMPLETO.
--
-- El comentario del esquema afirmaba: «Exactamente uno de `controlId`, `registroId` o
-- `hallazgoId` esta presente — lo impone el CHECK en la migracion». El CHECK real era:
--
--   CHECK ((control_id IS NOT NULL)::int + (registro_id IS NOT NULL)::int = 1)
--
-- `hallazgo_id` NO estaba. Dos consecuencias, las dos verificadas contra la base:
--
--   1. Una evidencia SOLO de hallazgo daba 0 + 0 = 0 y era RECHAZADA. O sea que la costura
--      `Hallazgo → Evidencia` que el control de integracion lista como existente no se
--      podia usar: `verificarEficacia` con adjunto revienta la transaccion entera y la
--      verificacion se pierde con ella. Hoy no se alcanza porque la pantalla no ofrece el
--      adjunto — es una trampa cargada para quien lo agregue.
--   2. Una evidencia con control_id Y hallazgo_id daba 1 + 0 = 1 y PASABA. Dos duenos
--      entraban, que es justo lo que el CHECK decia impedir.
--
-- El CHECK nuevo cuenta los tres. `= 1` y no `>= 1`: dos duenos hacen que la misma
-- evidencia aparezca en dos listas y que borrarla de una no la borre de la otra.
--
-- No se amplia a `activo_id` ni `auditoria_id` (D5 lo dice expresamente). Cuando haga
-- falta, se agrega el termino aca.

ALTER TABLE "evidencia" DROP CONSTRAINT "evidencia_un_solo_origen";

ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_un_solo_origen" CHECK (
  ("control_id" IS NOT NULL)::integer
  + ("registro_id" IS NOT NULL)::integer
  + ("hallazgo_id" IS NOT NULL)::integer
  = 1
);
