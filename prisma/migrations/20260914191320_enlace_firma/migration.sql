-- CreateEnum
CREATE TYPE "medio_identificacion" AS ENUM ('SESION_CORPORATIVA', 'ENLACE_CORREO_PERSONAL');

-- AlterTable
ALTER TABLE "acta_aceptacion" ADD COLUMN     "correo_notificacion" TEXT,
ADD COLUMN     "enlace_codigo" TEXT,
ADD COLUMN     "medio_identificacion" "medio_identificacion" NOT NULL DEFAULT 'SESION_CORPORATIVA';

-- CreateTable
CREATE TABLE "enlace_firma" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "asignacion_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "correo_destino" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "emitido_por" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_en" TIMESTAMP(3),
    "veces_enviado" INTEGER NOT NULL DEFAULT 0,
    "usado_en" TIMESTAMP(3),
    "acta_id" INTEGER,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_en" TIMESTAMP(3),
    "revocado_en" TIMESTAMP(3),
    "motivo_revocacion" TEXT,

    CONSTRAINT "enlace_firma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contador_enlace" (
    "anio" INTEGER NOT NULL,
    "ultimo_valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contador_enlace_pkey" PRIMARY KEY ("anio")
);

-- CreateIndex
CREATE UNIQUE INDEX "enlace_firma_codigo_key" ON "enlace_firma"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "enlace_firma_token_hash_key" ON "enlace_firma"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "enlace_firma_acta_id_key" ON "enlace_firma"("acta_id");

-- CreateIndex
CREATE INDEX "enlace_firma_asignacion_id_idx" ON "enlace_firma"("asignacion_id");

-- CreateIndex
CREATE INDEX "enlace_firma_expira_en_idx" ON "enlace_firma"("expira_en");

-- AddForeignKey
ALTER TABLE "enlace_firma" ADD CONSTRAINT "enlace_firma_asignacion_id_fkey" FOREIGN KEY ("asignacion_id") REFERENCES "asignacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enlace_firma" ADD CONSTRAINT "enlace_firma_acta_id_fkey" FOREIGN KEY ("acta_id") REFERENCES "acta_aceptacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
