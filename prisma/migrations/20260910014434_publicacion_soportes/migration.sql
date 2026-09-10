-- CreateEnum
CREATE TYPE "estado_publicacion" AS ENUM ('PENDIENTE', 'PUBLICADO', 'BLOQUEADO');

-- AlterTable
ALTER TABLE "persona" ADD COLUMN     "carpeta_soportes_id" TEXT,
ADD COLUMN     "carpeta_soportes_ruta" TEXT;

-- CreateTable
CREATE TABLE "publicacion_soporte" (
    "id" SERIAL NOT NULL,
    "evidencia_id" INTEGER NOT NULL,
    "persona_id" INTEGER NOT NULL,
    "estado" "estado_publicacion" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_intento_en" TIMESTAMP(3),
    "causa_fallo" TEXT,
    "detalle_fallo" TEXT,
    "drive_item_id" TEXT,
    "web_url" TEXT,
    "ruta_publicada" TEXT,
    "nombre_archivo" TEXT,
    "publicado_en" TIMESTAMP(3),
    "baja_anotada_en" TIMESTAMP(3),
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publicacion_soporte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "publicacion_soporte_evidencia_id_key" ON "publicacion_soporte"("evidencia_id");

-- CreateIndex
CREATE INDEX "publicacion_soporte_estado_ultimo_intento_en_idx" ON "publicacion_soporte"("estado", "ultimo_intento_en");

-- AddForeignKey
ALTER TABLE "publicacion_soporte" ADD CONSTRAINT "publicacion_soporte_evidencia_id_fkey" FOREIGN KEY ("evidencia_id") REFERENCES "evidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacion_soporte" ADD CONSTRAINT "publicacion_soporte_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
