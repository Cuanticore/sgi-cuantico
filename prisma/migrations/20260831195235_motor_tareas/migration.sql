-- CreateEnum
CREATE TYPE "tipo_contenido" AS ENUM ('CAPACITACION', 'LECTURA', 'VERIFICACION', 'TAREA');

-- CreateEnum
CREATE TYPE "alcance_obligacion" AS ENUM ('PERSONA', 'CARGO', 'AREA', 'TODOS');

-- CreateEnum
CREATE TYPE "periodicidad" AS ENUM ('UNICA', 'DIARIA', 'SEMANAL', 'MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "estado_asignacion" AS ENUM ('PENDIENTE', 'REALIZADA', 'NO_APLICA', 'ANULADA');

-- CreateEnum
CREATE TYPE "valor_respuesta" AS ENUM ('CUMPLE', 'NO_CUMPLE', 'NO_APLICA');

-- DropForeignKey
ALTER TABLE "evidencia" DROP CONSTRAINT "evidencia_control_id_fkey";

-- AlterTable
ALTER TABLE "evidencia" ADD COLUMN     "registro_id" INTEGER,
ALTER COLUMN "control_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "contenido_sig" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "tipo_contenido" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "procedimiento_origen" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "documento_codigo" TEXT,
    "documento_nombre" TEXT,
    "documento_version" TEXT,
    "documento_url" TEXT,
    "duracion_horas" DECIMAL(65,30),
    "modalidad" TEXT,
    "exige_evaluacion" BOOLEAN NOT NULL DEFAULT false,
    "nota_minima" DECIMAL(65,30),

    CONSTRAINT "contenido_sig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_verificacion" (
    "id" SERIAL NOT NULL,
    "contenido_id" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "obligatorio" BOOLEAN NOT NULL DEFAULT true,
    "permite_no_aplica" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "item_verificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obligacion" (
    "id" SERIAL NOT NULL,
    "contenido_id" INTEGER NOT NULL,
    "alcance" "alcance_obligacion" NOT NULL,
    "alcance_persona_id" INTEGER,
    "alcance_cargo_id" INTEGER,
    "alcance_area_id" INTEGER,
    "periodicidad" "periodicidad" NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "plazo_dias" INTEGER NOT NULL,
    "dias_aviso" INTEGER NOT NULL,
    "notificar" BOOLEAN NOT NULL DEFAULT true,
    "responsable_seguimiento_id" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obligacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignacion" (
    "id" SERIAL NOT NULL,
    "obligacion_id" INTEGER,
    "contenido_id" INTEGER,
    "titulo" TEXT,
    "descripcion" TEXT,
    "persona_id" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "fecha_apertura" DATE NOT NULL,
    "fecha_limite" DATE NOT NULL,
    "estado" "estado_asignacion" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_cierre" TIMESTAMP(3),
    "cerrada_por" INTEGER,
    "motivo" TEXT,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_realizado" (
    "id" SERIAL NOT NULL,
    "asignacion_id" INTEGER NOT NULL,
    "fecha_hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nota" TEXT,
    "version_leida" TEXT,
    "asistio" BOOLEAN,
    "calificacion" DECIMAL(65,30),
    "aprobado" BOOLEAN,

    CONSTRAINT "registro_realizado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respuesta_item" (
    "id" SERIAL NOT NULL,
    "registro_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "respuesta" "valor_respuesta" NOT NULL,
    "nota" TEXT,

    CONSTRAINT "respuesta_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contador_contenido" (
    "tipo" "tipo_contenido" NOT NULL,
    "ultimo_valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contador_contenido_pkey" PRIMARY KEY ("tipo")
);

-- CreateIndex
CREATE UNIQUE INDEX "contenido_sig_codigo_key" ON "contenido_sig"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "item_verificacion_contenido_id_orden_key" ON "item_verificacion"("contenido_id", "orden");

-- CreateIndex
CREATE INDEX "asignacion_persona_id_estado_idx" ON "asignacion"("persona_id", "estado");

-- CreateIndex
CREATE INDEX "asignacion_fecha_limite_idx" ON "asignacion"("fecha_limite");

-- CreateIndex
CREATE UNIQUE INDEX "asignacion_obligacion_id_persona_id_periodo_key" ON "asignacion"("obligacion_id", "persona_id", "periodo");

-- CreateIndex
CREATE INDEX "registro_realizado_asignacion_id_idx" ON "registro_realizado"("asignacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "respuesta_item_registro_id_item_id_key" ON "respuesta_item"("registro_id", "item_id");

-- AddForeignKey
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "control"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_verificacion" ADD CONSTRAINT "item_verificacion_contenido_id_fkey" FOREIGN KEY ("contenido_id") REFERENCES "contenido_sig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligacion" ADD CONSTRAINT "obligacion_contenido_id_fkey" FOREIGN KEY ("contenido_id") REFERENCES "contenido_sig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligacion" ADD CONSTRAINT "obligacion_alcance_persona_id_fkey" FOREIGN KEY ("alcance_persona_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligacion" ADD CONSTRAINT "obligacion_alcance_cargo_id_fkey" FOREIGN KEY ("alcance_cargo_id") REFERENCES "cargo_responsable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligacion" ADD CONSTRAINT "obligacion_alcance_area_id_fkey" FOREIGN KEY ("alcance_area_id") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligacion" ADD CONSTRAINT "obligacion_responsable_seguimiento_id_fkey" FOREIGN KEY ("responsable_seguimiento_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion" ADD CONSTRAINT "asignacion_obligacion_id_fkey" FOREIGN KEY ("obligacion_id") REFERENCES "obligacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion" ADD CONSTRAINT "asignacion_contenido_id_fkey" FOREIGN KEY ("contenido_id") REFERENCES "contenido_sig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion" ADD CONSTRAINT "asignacion_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion" ADD CONSTRAINT "asignacion_cerrada_por_fkey" FOREIGN KEY ("cerrada_por") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_realizado" ADD CONSTRAINT "registro_realizado_asignacion_id_fkey" FOREIGN KEY ("asignacion_id") REFERENCES "asignacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta_item" ADD CONSTRAINT "respuesta_item_registro_id_fkey" FOREIGN KEY ("registro_id") REFERENCES "registro_realizado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respuesta_item" ADD CONSTRAINT "respuesta_item_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_verificacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Evidencia: exactamente un origen (control del SGSI o registro del SIG), nunca ambos,
-- nunca ninguno. Los datos existentes tienen control_id, así que el CHECK no rompe nada.
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_un_solo_origen" CHECK (
  (control_id IS NOT NULL)::int + (registro_id IS NOT NULL)::int = 1
);
