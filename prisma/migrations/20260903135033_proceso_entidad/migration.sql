-- CreateEnum
CREATE TYPE "tipo_proceso" AS ENUM ('ESTRATEGICO', 'MISIONAL', 'APOYO');

-- AlterTable
ALTER TABLE "auditoria_programada" ADD COLUMN     "proceso_id" INTEGER;

-- AlterTable
ALTER TABLE "celda_plan" ADD COLUMN     "procesoId" INTEGER;

-- AlterTable
ALTER TABLE "requisito_legal" ADD COLUMN     "proceso_id" INTEGER;

-- CreateTable
CREATE TABLE "proceso" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "tipo_proceso" NOT NULL,
    "area_id" INTEGER NOT NULL,
    "cargo_id" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "proceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proceso_codigo_key" ON "proceso"("codigo");

-- CreateIndex
CREATE INDEX "proceso_tipo_activo_idx" ON "proceso"("tipo", "activo");

-- AddForeignKey
ALTER TABLE "requisito_legal" ADD CONSTRAINT "requisito_legal_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "proceso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_programada" ADD CONSTRAINT "auditoria_programada_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "proceso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celda_plan" ADD CONSTRAINT "celda_plan_procesoId_fkey" FOREIGN KEY ("procesoId") REFERENCES "proceso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso" ADD CONSTRAINT "proceso_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso" ADD CONSTRAINT "proceso_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargo_responsable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
