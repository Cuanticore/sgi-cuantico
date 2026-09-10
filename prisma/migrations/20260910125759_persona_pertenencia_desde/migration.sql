-- CreateEnum
CREATE TYPE "clase_paquete" AS ENUM ('AUTOCONTENIDO', 'DESPACHO');

-- CreateEnum
CREATE TYPE "estado_intento" AS ENUM ('EN_CURSO', 'SUSPENDIDO', 'COMPLETADO', 'ABANDONADO');

-- AlterTable
ALTER TABLE "persona" ADD COLUMN     "area_desde" DATE,
ADD COLUMN     "cargo_desde" DATE;

-- AlterTable
ALTER TABLE "version_contenido" ADD COLUMN     "paquete_scorm_id" INTEGER;

-- CreateTable
CREATE TABLE "paquete_scorm" (
    "id" SERIAL NOT NULL,
    "contenido_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "clase" "clase_paquete" NOT NULL,
    "edicion" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL,
    "titulo_organizacion" TEXT NOT NULL,
    "entrada_href" TEXT NOT NULL,
    "dominios_externos" TEXT[],
    "zip_sha256" TEXT NOT NULL,
    "zip_tamano" INTEGER NOT NULL,
    "archivos" INTEGER NOT NULL,
    "subido_por_id" INTEGER,
    "subido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paquete_scorm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivo_scorm" (
    "id" SERIAL NOT NULL,
    "paquete_id" INTEGER NOT NULL,
    "ruta" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "archivo_scorm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intento_scorm" (
    "id" SERIAL NOT NULL,
    "asignacion_id" INTEGER NOT NULL,
    "persona_id" INTEGER NOT NULL,
    "paquete_id" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "estado_intento" NOT NULL DEFAULT 'EN_CURSO',
    "completion_status" TEXT NOT NULL DEFAULT 'unknown',
    "success_status" TEXT NOT NULL DEFAULT 'unknown',
    "score_scaled" DECIMAL(5,4),
    "progress_measure" DECIMAL(5,4),
    "location" TEXT,
    "suspend_data" TEXT,
    "entry" TEXT NOT NULL DEFAULT 'ab-initio',
    "exit" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'normal',
    "session_time_segundos" INTEGER NOT NULL DEFAULT 0,
    "total_time_segundos" INTEGER NOT NULL DEFAULT 0,
    "cmi" JSONB NOT NULL,
    "iniciado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultima_actividad_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminado_en" TIMESTAMP(3),
    "registro_id" INTEGER,
    "ip" TEXT,
    "agente" TEXT,

    CONSTRAINT "intento_scorm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paquete_scorm_contenido_id_version_key" ON "paquete_scorm"("contenido_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "archivo_scorm_paquete_id_ruta_key" ON "archivo_scorm"("paquete_id", "ruta");

-- CreateIndex
CREATE UNIQUE INDEX "intento_scorm_registro_id_key" ON "intento_scorm"("registro_id");

-- CreateIndex
CREATE INDEX "intento_scorm_estado_ultima_actividad_en_idx" ON "intento_scorm"("estado", "ultima_actividad_en");

-- CreateIndex
CREATE UNIQUE INDEX "intento_scorm_asignacion_id_numero_key" ON "intento_scorm"("asignacion_id", "numero");

-- AddForeignKey
ALTER TABLE "version_contenido" ADD CONSTRAINT "version_contenido_paquete_scorm_id_fkey" FOREIGN KEY ("paquete_scorm_id") REFERENCES "paquete_scorm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paquete_scorm" ADD CONSTRAINT "paquete_scorm_contenido_id_fkey" FOREIGN KEY ("contenido_id") REFERENCES "contenido_sig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paquete_scorm" ADD CONSTRAINT "paquete_scorm_subido_por_id_fkey" FOREIGN KEY ("subido_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivo_scorm" ADD CONSTRAINT "archivo_scorm_paquete_id_fkey" FOREIGN KEY ("paquete_id") REFERENCES "paquete_scorm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intento_scorm" ADD CONSTRAINT "intento_scorm_asignacion_id_fkey" FOREIGN KEY ("asignacion_id") REFERENCES "asignacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intento_scorm" ADD CONSTRAINT "intento_scorm_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intento_scorm" ADD CONSTRAINT "intento_scorm_paquete_id_fkey" FOREIGN KEY ("paquete_id") REFERENCES "paquete_scorm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intento_scorm" ADD CONSTRAINT "intento_scorm_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro_realizado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
