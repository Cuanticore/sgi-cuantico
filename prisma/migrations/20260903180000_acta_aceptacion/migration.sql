-- AlterTable
ALTER TABLE "contenido_sig" ADD COLUMN     "declaracion" TEXT,
ADD COLUMN     "exige_firma" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "acta_aceptacion" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "persona_id" INTEGER NOT NULL,
    "contenido_id" INTEGER NOT NULL,
    "contenido_version" INTEGER NOT NULL,
    "version_contenido_id" INTEGER,
    "registro_id" INTEGER NOT NULL,
    "declaracion" TEXT NOT NULL,
    "documento_hash" TEXT NOT NULL,
    "nombre_firmante" TEXT NOT NULL,
    "documento_firmante" TEXT NOT NULL,
    "aceptado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "agente" TEXT,
    "sesion_id" TEXT,
    "pdf_id" INTEGER,
    "acta_hash" TEXT NOT NULL,

    CONSTRAINT "acta_aceptacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "acta_aceptacion_codigo_key" ON "acta_aceptacion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "acta_aceptacion_registro_id_key" ON "acta_aceptacion"("registro_id");

-- CreateIndex
CREATE INDEX "acta_aceptacion_persona_id_aceptado_en_idx" ON "acta_aceptacion"("persona_id", "aceptado_en");

-- AddForeignKey
ALTER TABLE "acta_aceptacion" ADD CONSTRAINT "acta_aceptacion_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acta_aceptacion" ADD CONSTRAINT "acta_aceptacion_contenido_id_fkey" FOREIGN KEY ("contenido_id") REFERENCES "contenido_sig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acta_aceptacion" ADD CONSTRAINT "acta_aceptacion_version_contenido_id_fkey" FOREIGN KEY ("version_contenido_id") REFERENCES "version_contenido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acta_aceptacion" ADD CONSTRAINT "acta_aceptacion_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro_realizado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acta_aceptacion" ADD CONSTRAINT "acta_aceptacion_pdf_id_fkey" FOREIGN KEY ("pdf_id") REFERENCES "evidencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

