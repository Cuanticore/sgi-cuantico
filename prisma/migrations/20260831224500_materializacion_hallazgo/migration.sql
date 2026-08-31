-- El unique de NivelRiesgo.minimo, aplicado a mano en la base de desarrollo cuando
-- Prisma 7 pidio TTY (ver plan D); se absorbe aqui. Y la relacion materializacion → hallazgo.
ALTER TABLE "nivel_riesgo" ADD CONSTRAINT "nivel_riesgo_minimo_key" UNIQUE ("minimo");
ALTER TABLE "materializacion_riesgo" ADD CONSTRAINT "materializacion_riesgo_hallazgo_id_fkey" FOREIGN KEY ("hallazgo_id") REFERENCES "hallazgo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
