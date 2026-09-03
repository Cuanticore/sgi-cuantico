-- CreateEnum
CREATE TYPE "resultado_trabajo" AS ENUM ('EXITOSO', 'FALLIDO', 'PARCIAL');

-- CreateTable
CREATE TABLE "ejecucion_trabajo" (
    "id" SERIAL NOT NULL,
    "trabajo" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3),
    "resultado" "resultado_trabajo",
    "creados" INTEGER NOT NULL DEFAULT 0,
    "detalle" TEXT,
    "error" TEXT,
    "invocado_por" TEXT NOT NULL,

    CONSTRAINT "ejecucion_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ejecucion_trabajo_trabajo_inicio_idx" ON "ejecucion_trabajo"("trabajo", "inicio");
