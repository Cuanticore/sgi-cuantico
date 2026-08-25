-- Relevance becomes optional on the control-threat pair.
--
-- The 272 pairs are data the MAGERIT workbook already holds, inside the AVERAGE formulas
-- of the AX column of «Amenazas MAGERIT». Relevance (MET-SIG-01 v3 section 7.4) is the
-- refinement that replaces that plain average with a weighted, capped one. NOT NULL made
-- the refinement a precondition for recording the pair, so the table stayed empty and
-- every residual risk read "sin calcular".
--
-- ON DELETE SET NULL is the right behaviour now: retiring a relevance level must drop the
-- pair back to the workbook aggregation, never delete the mapping.

-- DropForeignKey
ALTER TABLE "control_amenaza" DROP CONSTRAINT "control_amenaza_relevancia_id_fkey";

-- AlterTable
ALTER TABLE "control_amenaza" ALTER COLUMN "relevancia_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "control_amenaza" ADD CONSTRAINT "control_amenaza_relevancia_id_fkey" FOREIGN KEY ("relevancia_id") REFERENCES "relevancia_control"("id") ON DELETE SET NULL ON UPDATE CASCADE;

