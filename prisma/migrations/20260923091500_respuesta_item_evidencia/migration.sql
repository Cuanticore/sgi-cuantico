-- D8 · la evidencia de verificacion de PTR-TEC-03 baja a nivel de item.
--
-- Las tres columnas son opcionales a proposito: el mismo motor (`RespuestaItem`) sirve a
-- las listas de verificacion del modulo A, donde no aplican. La exigencia de que esten
-- llenas vive en la regla de cierre de la hoja de vida, no en la columna.

-- AlterTable
ALTER TABLE "respuesta_item" ADD COLUMN "evidencia_id" INTEGER,
ADD COLUMN "verificado_en" TIMESTAMP(3),
ADD COLUMN "verificado_por_id" INTEGER;

-- AddForeignKey
ALTER TABLE "respuesta_item" ADD CONSTRAINT "respuesta_item_verificado_por_id_fkey" FOREIGN KEY ("verificado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
