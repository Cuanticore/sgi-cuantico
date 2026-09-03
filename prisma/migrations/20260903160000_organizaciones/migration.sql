-- CreateEnum
CREATE TYPE "tipo_organizacion" AS ENUM ('PROVEEDOR', 'CLIENTE', 'ENTE_CONTROL', 'ALIADO', 'OTRO');

-- CreateEnum
CREATE TYPE "resultado_evaluacion_org" AS ENUM ('CUMPLE', 'CUMPLE_CON_OBSERVACIONES', 'NO_CUMPLE');

-- AlterTable
ALTER TABLE "proveedor" ADD COLUMN     "parte_interesada_id" INTEGER,
ADD COLUMN     "tipo" "tipo_organizacion" NOT NULL DEFAULT 'PROVEEDOR';

-- CreateTable
CREATE TABLE "evaluacion_organizacion" (
    "id" SERIAL NOT NULL,
    "organizacion_id" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "resultado" "resultado_evaluacion_org" NOT NULL,
    "nota" TEXT,
    "evaluado_por_id" INTEGER,

    CONSTRAINT "evaluacion_organizacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evaluacion_organizacion_organizacion_id_anio_key" ON "evaluacion_organizacion"("organizacion_id", "anio");

-- AddForeignKey
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_parte_interesada_id_fkey" FOREIGN KEY ("parte_interesada_id") REFERENCES "parte_interesada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluacion_organizacion" ADD CONSTRAINT "evaluacion_organizacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluacion_organizacion" ADD CONSTRAINT "evaluacion_organizacion_evaluado_por_id_fkey" FOREIGN KEY ("evaluado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

