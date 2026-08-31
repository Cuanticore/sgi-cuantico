-- CreateEnum
CREATE TYPE "envio_tipo" AS ENUM ('NUEVA', 'PROXIMIDAD', 'VENCIMIENTO', 'SEMANAL', 'MENSUAL');

-- CreateEnum
CREATE TYPE "envio_resultado" AS ENUM ('ENVIADO', 'SIN_SMTP', 'FALLO');

-- CreateTable
CREATE TABLE "envio_notificacion" (
    "id" SERIAL NOT NULL,
    "tipo" "envio_tipo" NOT NULL,
    "periodo" TEXT NOT NULL,
    "persona_id" INTEGER NOT NULL,
    "enviado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultado" "envio_resultado" NOT NULL,
    "detalle" TEXT,

    CONSTRAINT "envio_notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "envio_notificacion_tipo_periodo_idx" ON "envio_notificacion"("tipo", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "envio_notificacion_tipo_periodo_persona_id_key" ON "envio_notificacion"("tipo", "periodo", "persona_id");

-- AddForeignKey
ALTER TABLE "envio_notificacion" ADD CONSTRAINT "envio_notificacion_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
