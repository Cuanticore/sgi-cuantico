-- CreateEnum
CREATE TYPE "tipo_auditoria" AS ENUM ('INTERNA', 'EXTERNA', 'PROVEEDOR');

-- CreateEnum
CREATE TYPE "tipo_nota" AS ENUM ('OK', 'NC', 'OM', 'RM', 'FORTALEZA');

-- CreateEnum
CREATE TYPE "tipo_acta" AS ENUM ('APERTURA', 'CIERRE');

-- CreateEnum
CREATE TYPE "version_informe" AS ENUM ('PRELIMINAR', 'FINAL');

-- CreateEnum
CREATE TYPE "papel_equipo" AS ENUM ('LIDER', 'AUDITOR', 'EN_FORMACION', 'EXPERTO');

-- CreateTable
CREATE TABLE "norma_auditable" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "norma_auditable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisito_norma" (
    "id" SERIAL NOT NULL,
    "norma_id" INTEGER NOT NULL,
    "numeral" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "auditable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "requisito_norma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programa_auditoria" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "alcance" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL,
    "criterios" TEXT NOT NULL,
    "metodos" TEXT NOT NULL,
    "aprobado_por_id" INTEGER,
    "fecha_aprobacion" TIMESTAMP(3),

    CONSTRAINT "programa_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_programada" (
    "id" SERIAL NOT NULL,
    "programa_id" INTEGER NOT NULL,
    "proceso_ref" TEXT NOT NULL,
    "meses" TEXT NOT NULL,
    "tipo" "tipo_auditoria" NOT NULL DEFAULT 'INTERNA',
    "responsable_id" INTEGER NOT NULL,
    "plazo_informe_dias" INTEGER NOT NULL,

    CONSTRAINT "auditoria_programada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" SERIAL NOT NULL,
    "programada_id" INTEGER,
    "tipo" "tipo_auditoria" NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE,
    "sitio" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "alcance" TEXT NOT NULL,
    "criterios" TEXT NOT NULL,
    "auditor_lider_id" INTEGER NOT NULL,
    "entidad_auditora" TEXT,
    "emitido_en" TIMESTAMP(3),
    "cerrada_en" TIMESTAMP(3),

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipo_auditor" (
    "id" SERIAL NOT NULL,
    "auditoria_id" INTEGER NOT NULL,
    "persona_id" INTEGER,
    "nombre_externo" TEXT,
    "papel" "papel_equipo" NOT NULL,

    CONSTRAINT "equipo_auditor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "celda_plan" (
    "id" SERIAL NOT NULL,
    "auditoria_id" INTEGER NOT NULL,
    "proceso_ref" TEXT NOT NULL,
    "requisito_norma_id" INTEGER NOT NULL,
    "hora" TEXT,
    "auditor_id" INTEGER,
    "planificada" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "celda_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_auditor" (
    "id" SERIAL NOT NULL,
    "celda_id" INTEGER NOT NULL,
    "nota_evidencia" TEXT NOT NULL,
    "tipo" "tipo_nota" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auditor_id" INTEGER NOT NULL,
    "hallazgo_id" INTEGER,

    CONSTRAINT "nota_auditor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acta_auditoria" (
    "id" SERIAL NOT NULL,
    "auditoria_id" INTEGER NOT NULL,
    "tipo" "tipo_acta" NOT NULL,
    "fecha" DATE NOT NULL,
    "asistentes" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,

    CONSTRAINT "acta_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "informe_auditoria" (
    "id" SERIAL NOT NULL,
    "auditoria_id" INTEGER NOT NULL,
    "version" "version_informe" NOT NULL,
    "fecha_informe" DATE NOT NULL,
    "conclusiones" TEXT NOT NULL,
    "recomendaciones" TEXT NOT NULL,
    "emitido_por_id" INTEGER,
    "emitido_en" TIMESTAMP(3),

    CONSTRAINT "informe_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_auditor" (
    "id" SERIAL NOT NULL,
    "persona_id" INTEGER,
    "nombre_externo" TEXT,
    "formacion" TEXT NOT NULL,
    "certificacion" TEXT NOT NULL,
    "entidad_certificadora" TEXT NOT NULL,
    "vigencia" DATE NOT NULL,
    "experiencia_anios" INTEGER NOT NULL,
    "aprobado_por_id" INTEGER,
    "aprobado_en" TIMESTAMP(3),

    CONSTRAINT "perfil_auditor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "norma_auditable_codigo_key" ON "norma_auditable"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "requisito_norma_norma_id_numeral_key" ON "requisito_norma"("norma_id", "numeral");

-- CreateIndex
CREATE UNIQUE INDEX "programa_auditoria_anio_key" ON "programa_auditoria"("anio");

-- CreateIndex
CREATE UNIQUE INDEX "celda_plan_auditoria_id_proceso_ref_requisito_norma_id_key" ON "celda_plan"("auditoria_id", "proceso_ref", "requisito_norma_id");

-- CreateIndex
CREATE UNIQUE INDEX "acta_auditoria_auditoria_id_tipo_key" ON "acta_auditoria"("auditoria_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "informe_auditoria_auditoria_id_version_key" ON "informe_auditoria"("auditoria_id", "version");

-- AddForeignKey
ALTER TABLE "requisito_norma" ADD CONSTRAINT "requisito_norma_norma_id_fkey" FOREIGN KEY ("norma_id") REFERENCES "norma_auditable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programa_auditoria" ADD CONSTRAINT "programa_auditoria_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_programada" ADD CONSTRAINT "auditoria_programada_programa_id_fkey" FOREIGN KEY ("programa_id") REFERENCES "programa_auditoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_programada" ADD CONSTRAINT "auditoria_programada_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_programada_id_fkey" FOREIGN KEY ("programada_id") REFERENCES "auditoria_programada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_auditor_lider_id_fkey" FOREIGN KEY ("auditor_lider_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_auditor" ADD CONSTRAINT "equipo_auditor_auditoria_id_fkey" FOREIGN KEY ("auditoria_id") REFERENCES "auditoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipo_auditor" ADD CONSTRAINT "equipo_auditor_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celda_plan" ADD CONSTRAINT "celda_plan_auditoria_id_fkey" FOREIGN KEY ("auditoria_id") REFERENCES "auditoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celda_plan" ADD CONSTRAINT "celda_plan_requisito_norma_id_fkey" FOREIGN KEY ("requisito_norma_id") REFERENCES "requisito_norma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_auditor" ADD CONSTRAINT "nota_auditor_celda_id_fkey" FOREIGN KEY ("celda_id") REFERENCES "celda_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nota_auditor" ADD CONSTRAINT "nota_auditor_auditor_id_fkey" FOREIGN KEY ("auditor_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acta_auditoria" ADD CONSTRAINT "acta_auditoria_auditoria_id_fkey" FOREIGN KEY ("auditoria_id") REFERENCES "auditoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "informe_auditoria" ADD CONSTRAINT "informe_auditoria_auditoria_id_fkey" FOREIGN KEY ("auditoria_id") REFERENCES "auditoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "informe_auditoria" ADD CONSTRAINT "informe_auditoria_emitido_por_id_fkey" FOREIGN KEY ("emitido_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_auditor" ADD CONSTRAINT "perfil_auditor_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_auditor" ADD CONSTRAINT "perfil_auditor_aprobado_por_id_fkey" FOREIGN KEY ("aprobado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;
