-- CreateEnum
CREATE TYPE "clase_riesgo" AS ENUM ('RIESGO', 'OPORTUNIDAD');

-- CreateEnum
CREATE TYPE "fuente_riesgo" AS ENUM ('PROCESO', 'PARTE_INTERESADA', 'DOFA', 'PESTEL');

-- CreateEnum
CREATE TYPE "tipo_parte" AS ENUM ('INTERNA', 'EXTERNA');

-- CreateEnum
CREATE TYPE "clase_necesidad" AS ENUM ('NECESIDAD', 'EXPECTATIVA');

-- CreateEnum
CREATE TYPE "resultado_cumplimiento" AS ENUM ('CUMPLE', 'PARCIAL', 'NO_CUMPLE');

-- CreateEnum
CREATE TYPE "tipo_analisis" AS ENUM ('DOFA', 'PESTEL');

-- CreateEnum
CREATE TYPE "efecto_entrada" AS ENUM ('FAVORABLE', 'ADVERSO');

-- CreateTable
CREATE TABLE "parte_interesada" (
    "id" SERIAL NOT NULL,
    "tipo" "tipo_parte" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "parte_interesada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "necesidad_expectativa" (
    "id" SERIAL NOT NULL,
    "parte_id" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "clase" "clase_necesidad" NOT NULL,
    "riesgo_oportunidad_texto" TEXT,
    "es_riesgo" BOOLEAN NOT NULL DEFAULT false,
    "es_oportunidad" BOOLEAN NOT NULL DEFAULT false,
    "poder" TEXT NOT NULL,
    "interes" TEXT NOT NULL,
    "genera_requisitos_sgsi" BOOLEAN NOT NULL DEFAULT false,
    "requisito_cambio_climatico" BOOLEAN NOT NULL DEFAULT false,
    "requiere_cambio_alcance_sig" BOOLEAN NOT NULL DEFAULT false,
    "responsable_id" INTEGER,

    CONSTRAINT "necesidad_expectativa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seguimiento_parte_anual" (
    "id" SERIAL NOT NULL,
    "necesidad_id" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "plan_accion" TEXT,
    "seguimiento" TEXT,
    "evidencia" TEXT,

    CONSTRAINT "seguimiento_parte_anual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisito_legal" (
    "id" SERIAL NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "normatividad" TEXT NOT NULL,
    "articulo" TEXT,
    "expedidaPor" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "aplicacion" TEXT NOT NULL,
    "sistema_gestion" TEXT NOT NULL,
    "proceso_encargado" TEXT,
    "responsable_id" INTEGER,
    "enlace" TEXT,
    "periodicidad_revision" TEXT NOT NULL,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "derogado_en" TIMESTAMP(3),
    "norma_que_deroga" TEXT,

    CONSTRAINT "requisito_legal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluacion_cumplimiento" (
    "id" SERIAL NOT NULL,
    "requisito_id" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultado" "resultado_cumplimiento" NOT NULL,
    "evidencia" TEXT,
    "evaluado_por_id" INTEGER NOT NULL,
    "hallazgo_id" INTEGER,

    CONSTRAINT "evaluacion_cumplimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "riesgo_organizacional" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "clase" "clase_riesgo" NOT NULL,
    "proceso" TEXT NOT NULL,
    "fuente" "fuente_riesgo" NOT NULL,
    "necesidad_expectativa_id" INTEGER,
    "entrada_contexto_id" INTEGER,
    "descripcion" TEXT NOT NULL,
    "causa" TEXT NOT NULL,
    "efecto" TEXT NOT NULL,
    "factor_id" INTEGER NOT NULL,
    "probabilidad_id" INTEGER NOT NULL,
    "impacto_id" INTEGER NOT NULL,
    "responsable_id" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "nivel_sugerido" TEXT,

    CONSTRAINT "riesgo_organizacional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_riesgo_org" (
    "id" SERIAL NOT NULL,
    "riesgo_id" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tipo_id" INTEGER NOT NULL,
    "eficacia_id" INTEGER NOT NULL,

    CONSTRAINT "control_riesgo_org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materializacion_riesgo" (
    "id" SERIAL NOT NULL,
    "riesgo_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "descripcion_evento" TEXT NOT NULL,
    "impacto_generado" TEXT NOT NULL,
    "causa_raiz" TEXT NOT NULL,
    "reportante_id" INTEGER NOT NULL,
    "hallazgo_id" INTEGER,

    CONSTRAINT "materializacion_riesgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analisis_contexto" (
    "id" SERIAL NOT NULL,
    "tipo" "tipo_analisis" NOT NULL,
    "anio" INTEGER NOT NULL,
    "aprobado_por_id" INTEGER,
    "fecha_aprobacion" TIMESTAMP(3),
    "acta_referencia" TEXT,
    "vigente" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "analisis_contexto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entrada_contexto" (
    "id" SERIAL NOT NULL,
    "analisis_id" INTEGER NOT NULL,
    "casilla" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "efecto" "efecto_entrada" NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "entrada_contexto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala_probabilidad" (
    "id" SERIAL NOT NULL,
    "valor" INTEGER NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "descripcion" TEXT,
    "color" TEXT NOT NULL,

    CONSTRAINT "escala_probabilidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala_impacto_riesgo" (
    "id" SERIAL NOT NULL,
    "valor" INTEGER NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "porcentaje_patrimonio" DECIMAL(5,2),
    "referencia_cop" DECIMAL(18,0),

    CONSTRAINT "escala_impacto_riesgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala_impacto_oportunidad" (
    "id" SERIAL NOT NULL,
    "valor" INTEGER NOT NULL,
    "etiqueta" TEXT NOT NULL,

    CONSTRAINT "escala_impacto_oportunidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factor_riesgo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "factor_riesgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_control_riesgo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "reduce" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "tipo_control_riesgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eficacia_control" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "valor" DECIMAL(4,3) NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "eficacia_control_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nivel_riesgo" (
    "id" SERIAL NOT NULL,
    "minimo" INTEGER NOT NULL,
    "maximo" INTEGER NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "accion_riesgo" TEXT NOT NULL,
    "accion_oportunidad" TEXT NOT NULL,

    CONSTRAINT "nivel_riesgo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seguimiento_parte_anual_necesidad_id_anio_key" ON "seguimiento_parte_anual"("necesidad_id", "anio");

-- CreateIndex
CREATE INDEX "evaluacion_cumplimiento_requisito_id_fecha_idx" ON "evaluacion_cumplimiento"("requisito_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "riesgo_organizacional_codigo_key" ON "riesgo_organizacional"("codigo");

-- CreateIndex
CREATE INDEX "riesgo_organizacional_clase_activo_idx" ON "riesgo_organizacional"("clase", "activo");

-- CreateIndex
CREATE INDEX "materializacion_riesgo_riesgo_id_fecha_idx" ON "materializacion_riesgo"("riesgo_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "analisis_contexto_tipo_anio_key" ON "analisis_contexto"("tipo", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "entrada_contexto_analisis_id_orden_key" ON "entrada_contexto"("analisis_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "escala_probabilidad_valor_key" ON "escala_probabilidad"("valor");

-- CreateIndex
CREATE UNIQUE INDEX "escala_impacto_riesgo_valor_key" ON "escala_impacto_riesgo"("valor");

-- CreateIndex
CREATE UNIQUE INDEX "escala_impacto_oportunidad_valor_key" ON "escala_impacto_oportunidad"("valor");

-- CreateIndex
CREATE UNIQUE INDEX "factor_riesgo_nombre_key" ON "factor_riesgo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_control_riesgo_nombre_key" ON "tipo_control_riesgo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "eficacia_control_nombre_key" ON "eficacia_control"("nombre");

-- AddForeignKey
ALTER TABLE "necesidad_expectativa" ADD CONSTRAINT "necesidad_expectativa_parte_id_fkey" FOREIGN KEY ("parte_id") REFERENCES "parte_interesada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "necesidad_expectativa" ADD CONSTRAINT "necesidad_expectativa_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguimiento_parte_anual" ADD CONSTRAINT "seguimiento_parte_anual_necesidad_id_fkey" FOREIGN KEY ("necesidad_id") REFERENCES "necesidad_expectativa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisito_legal" ADD CONSTRAINT "requisito_legal_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluacion_cumplimiento" ADD CONSTRAINT "evaluacion_cumplimiento_requisito_id_fkey" FOREIGN KEY ("requisito_id") REFERENCES "requisito_legal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluacion_cumplimiento" ADD CONSTRAINT "evaluacion_cumplimiento_evaluado_por_id_fkey" FOREIGN KEY ("evaluado_por_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo_organizacional" ADD CONSTRAINT "riesgo_organizacional_factor_id_fkey" FOREIGN KEY ("factor_id") REFERENCES "factor_riesgo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo_organizacional" ADD CONSTRAINT "riesgo_organizacional_probabilidad_id_fkey" FOREIGN KEY ("probabilidad_id") REFERENCES "escala_probabilidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo_organizacional" ADD CONSTRAINT "riesgo_organizacional_impacto_id_fkey" FOREIGN KEY ("impacto_id") REFERENCES "escala_impacto_riesgo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo_organizacional" ADD CONSTRAINT "riesgo_organizacional_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo_organizacional" ADD CONSTRAINT "riesgo_organizacional_entrada_contexto_id_fkey" FOREIGN KEY ("entrada_contexto_id") REFERENCES "entrada_contexto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_riesgo_org" ADD CONSTRAINT "control_riesgo_org_riesgo_id_fkey" FOREIGN KEY ("riesgo_id") REFERENCES "riesgo_organizacional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_riesgo_org" ADD CONSTRAINT "control_riesgo_org_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipo_control_riesgo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_riesgo_org" ADD CONSTRAINT "control_riesgo_org_eficacia_id_fkey" FOREIGN KEY ("eficacia_id") REFERENCES "eficacia_control"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materializacion_riesgo" ADD CONSTRAINT "materializacion_riesgo_riesgo_id_fkey" FOREIGN KEY ("riesgo_id") REFERENCES "riesgo_organizacional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materializacion_riesgo" ADD CONSTRAINT "materializacion_riesgo_reportante_id_fkey" FOREIGN KEY ("reportante_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analisis_contexto" ADD CONSTRAINT "analisis_contexto_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrada_contexto" ADD CONSTRAINT "entrada_contexto_analisis_id_fkey" FOREIGN KEY ("analisis_id") REFERENCES "analisis_contexto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
