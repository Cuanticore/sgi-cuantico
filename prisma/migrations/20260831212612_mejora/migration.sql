-- CreateEnum
CREATE TYPE "tipo_hallazgo" AS ENUM ('NC_MAYOR', 'NC_MENOR', 'OBSERVACION', 'OPORTUNIDAD');

-- CreateEnum
CREATE TYPE "origen_hallazgo" AS ENUM ('AUDITORIA_INTERNA', 'AUDITORIA_EXTERNA', 'QUEJA', 'INDICADOR', 'REVISION_DIRECCION', 'SGSI', 'OTRO');

-- CreateEnum
CREATE TYPE "metodo_causa" AS ENUM ('CINCO_PORQUES', 'ISHIKAWA', 'LIBRE');

-- CreateEnum
CREATE TYPE "papel_accion_hallazgo" AS ENUM ('CORRECCION', 'CORRECTIVA', 'MEJORA', 'VERIFICACION');

-- CreateEnum
CREATE TYPE "resultado_eficacia" AS ENUM ('EFICAZ', 'NO_EFICAZ');

-- AlterTable
ALTER TABLE "evidencia" ADD COLUMN     "hallazgo_id" INTEGER;

-- CreateTable
CREATE TABLE "hallazgo" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "tipo_hallazgo" NOT NULL,
    "origen" "origen_hallazgo" NOT NULL,
    "origen_referencia" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "requisito_incumplido" TEXT NOT NULL,
    "evidencia_objetiva" TEXT NOT NULL,
    "area_id" INTEGER NOT NULL,
    "detectado_por_id" INTEGER NOT NULL,
    "fecha_deteccion" DATE NOT NULL,
    "clasificado_por_id" INTEGER,
    "fecha_clasificacion" DATE,
    "responsable_id" INTEGER,
    "fecha_compromiso" DATE,
    "hallazgo_anterior_id" INTEGER,
    "fecha_cierre" TIMESTAMP(3),
    "cerrado_por_id" INTEGER,
    "anulado_en" TIMESTAMP(3),
    "motivo_anulacion" TEXT,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hallazgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correccion_hallazgo" (
    "id" SERIAL NOT NULL,
    "hallazgo_id" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "responsable_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,

    CONSTRAINT "correccion_hallazgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analisis_causa" (
    "id" SERIAL NOT NULL,
    "hallazgo_id" INTEGER NOT NULL,
    "metodo" "metodo_causa" NOT NULL,
    "desarrollo" JSONB NOT NULL,
    "causa_raiz" TEXT NOT NULL,
    "realizado_por_id" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analisis_causa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_problema" (
    "id" SERIAL NOT NULL,
    "hallazgo_id" INTEGER NOT NULL,
    "evaluada" BOOLEAN NOT NULL DEFAULT true,
    "existe_en_otra_parte" BOOLEAN NOT NULL,
    "analisis" TEXT NOT NULL,

    CONSTRAINT "extension_problema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hallazgo_accion" (
    "id" SERIAL NOT NULL,
    "hallazgo_id" INTEGER NOT NULL,
    "asignacion_id" INTEGER NOT NULL,
    "papel" "papel_accion_hallazgo" NOT NULL,

    CONSTRAINT "hallazgo_accion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verificacion_eficacia_hallazgo" (
    "id" SERIAL NOT NULL,
    "hallazgo_id" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificado_por_id" INTEGER NOT NULL,
    "resultado" "resultado_eficacia" NOT NULL,
    "nota" TEXT,

    CONSTRAINT "verificacion_eficacia_hallazgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plazo_por_tipo_hallazgo" (
    "id" SERIAL NOT NULL,
    "tipo" "tipo_hallazgo" NOT NULL,
    "dias_analisis" INTEGER NOT NULL,
    "dias_ejecucion" INTEGER NOT NULL,
    "dias_verificacion" INTEGER NOT NULL,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plazo_por_tipo_hallazgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contador_hallazgo" (
    "anio" INTEGER NOT NULL,
    "ultimo_valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contador_hallazgo_pkey" PRIMARY KEY ("anio")
);

-- CreateIndex
CREATE UNIQUE INDEX "hallazgo_codigo_key" ON "hallazgo"("codigo");

-- CreateIndex
CREATE INDEX "hallazgo_area_id_fecha_deteccion_idx" ON "hallazgo"("area_id", "fecha_deteccion");

-- CreateIndex
CREATE UNIQUE INDEX "correccion_hallazgo_hallazgo_id_key" ON "correccion_hallazgo"("hallazgo_id");

-- CreateIndex
CREATE UNIQUE INDEX "analisis_causa_hallazgo_id_key" ON "analisis_causa"("hallazgo_id");

-- CreateIndex
CREATE UNIQUE INDEX "extension_problema_hallazgo_id_key" ON "extension_problema"("hallazgo_id");

-- CreateIndex
CREATE UNIQUE INDEX "hallazgo_accion_hallazgo_id_asignacion_id_key" ON "hallazgo_accion"("hallazgo_id", "asignacion_id");

-- CreateIndex
CREATE INDEX "verificacion_eficacia_hallazgo_hallazgo_id_fecha_idx" ON "verificacion_eficacia_hallazgo"("hallazgo_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "plazo_por_tipo_hallazgo_tipo_key" ON "plazo_por_tipo_hallazgo"("tipo");

-- AddForeignKey
ALTER TABLE "hallazgo" ADD CONSTRAINT "hallazgo_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hallazgo" ADD CONSTRAINT "hallazgo_detectado_por_id_fkey" FOREIGN KEY ("detectado_por_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hallazgo" ADD CONSTRAINT "hallazgo_clasificado_por_id_fkey" FOREIGN KEY ("clasificado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hallazgo" ADD CONSTRAINT "hallazgo_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hallazgo" ADD CONSTRAINT "hallazgo_cerrado_por_id_fkey" FOREIGN KEY ("cerrado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hallazgo" ADD CONSTRAINT "hallazgo_hallazgo_anterior_id_fkey" FOREIGN KEY ("hallazgo_anterior_id") REFERENCES "hallazgo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correccion_hallazgo" ADD CONSTRAINT "correccion_hallazgo_hallazgo_id_fkey" FOREIGN KEY ("hallazgo_id") REFERENCES "hallazgo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correccion_hallazgo" ADD CONSTRAINT "correccion_hallazgo_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analisis_causa" ADD CONSTRAINT "analisis_causa_hallazgo_id_fkey" FOREIGN KEY ("hallazgo_id") REFERENCES "hallazgo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analisis_causa" ADD CONSTRAINT "analisis_causa_realizado_por_id_fkey" FOREIGN KEY ("realizado_por_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_problema" ADD CONSTRAINT "extension_problema_hallazgo_id_fkey" FOREIGN KEY ("hallazgo_id") REFERENCES "hallazgo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hallazgo_accion" ADD CONSTRAINT "hallazgo_accion_hallazgo_id_fkey" FOREIGN KEY ("hallazgo_id") REFERENCES "hallazgo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hallazgo_accion" ADD CONSTRAINT "hallazgo_accion_asignacion_id_fkey" FOREIGN KEY ("asignacion_id") REFERENCES "asignacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verificacion_eficacia_hallazgo" ADD CONSTRAINT "verificacion_eficacia_hallazgo_hallazgo_id_fkey" FOREIGN KEY ("hallazgo_id") REFERENCES "hallazgo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verificacion_eficacia_hallazgo" ADD CONSTRAINT "verificacion_eficacia_hallazgo_verificado_por_id_fkey" FOREIGN KEY ("verificado_por_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
