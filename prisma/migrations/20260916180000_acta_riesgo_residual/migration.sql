-- CreateEnum
CREATE TYPE "estado_acta_residual" AS ENUM ('EMITIDA', 'APROBADA', 'DESACTUALIZADA', 'VENCIDA', 'ANULADA');

-- CreateTable
CREATE TABLE "acta_riesgo_residual" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "estado" "estado_acta_residual" NOT NULL DEFAULT 'EMITIDA',
    "alcance_hash" TEXT NOT NULL,
    "sin_calcular" INTEGER NOT NULL,
    "generada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generada_por_id" INTEGER NOT NULL,
    "documento_sha256" TEXT NOT NULL,
    "documento" BYTEA NOT NULL,
    "motivo_anulacion" TEXT,

    CONSTRAINT "acta_riesgo_residual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activo_acta_residual" (
    "id" SERIAL NOT NULL,
    "acta_id" INTEGER NOT NULL,
    "activo_id" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "proceso" TEXT NOT NULL,
    "banda" TEXT NOT NULL,
    "cifra_residual" DECIMAL(12,4) NOT NULL,
    "plan_codigo" TEXT,
    "plan_tipo" TEXT,
    "justificacion_excepcion" TEXT,

    CONSTRAINT "activo_acta_residual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firmante_acta_residual" (
    "id" SERIAL NOT NULL,
    "acta_id" INTEGER NOT NULL,
    "area_id" INTEGER NOT NULL,
    "proceso" TEXT NOT NULL,
    "cargo_id" INTEGER,
    "cargo_nombre" TEXT,
    "resoluble" BOOLEAN NOT NULL,
    "activos" INTEGER NOT NULL,
    "aprobo" BOOLEAN NOT NULL DEFAULT false,
    "firmante_id" INTEGER,
    "fecha_firma" DATE,
    "soporte_id" INTEGER,
    "registrado_por_id" INTEGER,
    "motivo" TEXT,

    CONSTRAINT "firmante_acta_residual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soporte_acta_residual" (
    "id" SERIAL NOT NULL,
    "acta_id" INTEGER NOT NULL,
    "nombre_original" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "cargado_por_id" INTEGER NOT NULL,
    "cargado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" TEXT,

    CONSTRAINT "soporte_acta_residual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "acta_riesgo_residual_codigo_key" ON "acta_riesgo_residual"("codigo");

-- CreateIndex
CREATE INDEX "acta_riesgo_residual_periodo_idx" ON "acta_riesgo_residual"("periodo");

-- CreateIndex
CREATE UNIQUE INDEX "activo_acta_residual_acta_id_activo_id_key" ON "activo_acta_residual"("acta_id", "activo_id");

-- CreateIndex
CREATE UNIQUE INDEX "firmante_acta_residual_acta_id_area_id_key" ON "firmante_acta_residual"("acta_id", "area_id");

-- CreateIndex
CREATE INDEX "soporte_acta_residual_acta_id_idx" ON "soporte_acta_residual"("acta_id");

-- AddForeignKey
ALTER TABLE "acta_riesgo_residual" ADD CONSTRAINT "acta_riesgo_residual_generada_por_id_fkey" FOREIGN KEY ("generada_por_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo_acta_residual" ADD CONSTRAINT "activo_acta_residual_acta_id_fkey" FOREIGN KEY ("acta_id") REFERENCES "acta_riesgo_residual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo_acta_residual" ADD CONSTRAINT "activo_acta_residual_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "activo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmante_acta_residual" ADD CONSTRAINT "firmante_acta_residual_acta_id_fkey" FOREIGN KEY ("acta_id") REFERENCES "acta_riesgo_residual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmante_acta_residual" ADD CONSTRAINT "firmante_acta_residual_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmante_acta_residual" ADD CONSTRAINT "firmante_acta_residual_firmante_id_fkey" FOREIGN KEY ("firmante_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmante_acta_residual" ADD CONSTRAINT "firmante_acta_residual_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmante_acta_residual" ADD CONSTRAINT "firmante_acta_residual_soporte_id_fkey" FOREIGN KEY ("soporte_id") REFERENCES "soporte_acta_residual"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soporte_acta_residual" ADD CONSTRAINT "soporte_acta_residual_acta_id_fkey" FOREIGN KEY ("acta_id") REFERENCES "acta_riesgo_residual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soporte_acta_residual" ADD CONSTRAINT "soporte_acta_residual_cargado_por_id_fkey" FOREIGN KEY ("cargado_por_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
