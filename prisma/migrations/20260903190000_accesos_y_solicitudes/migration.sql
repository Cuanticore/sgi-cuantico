-- CreateEnum
CREATE TYPE "tipo_solicitud" AS ENUM ('CAMBIO_TI', 'ACCESO', 'DEVOLUCION', 'UTILITARIO');

-- AlterTable
ALTER TABLE "obligacion" ADD COLUMN     "control_anexo_a" TEXT,
ADD COLUMN     "es_proveedor" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "solicitud" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "tipo_solicitud" NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "justificacion" TEXT NOT NULL,
    "solicitante_id" INTEGER NOT NULL,
    "vigencia_desde" DATE,
    "vigencia_hasta" DATE,
    "es_emergencia" BOOLEAN NOT NULL DEFAULT false,
    "autorizado_por_id" INTEGER,
    "fecha_autorizacion" TIMESTAMP(3),
    "nota_autorizacion" TEXT,
    "rechazada" BOOLEAN NOT NULL DEFAULT false,
    "ejecutado_por_id" INTEGER,
    "fecha_ejecucion" TIMESTAMP(3),
    "nota_ejecucion" TEXT,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_acceso" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "sistema" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "perfil_acceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acceso_persona" (
    "id" SERIAL NOT NULL,
    "persona_id" INTEGER NOT NULL,
    "perfil_id" INTEGER NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE,
    "solicitud_id" INTEGER,
    "motivo_retiro" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceso_persona_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitud_codigo_key" ON "solicitud"("codigo");

-- CreateIndex
CREATE INDEX "solicitud_tipo_creada_en_idx" ON "solicitud"("tipo", "creada_en");

-- CreateIndex
CREATE UNIQUE INDEX "perfil_acceso_sistema_nombre_key" ON "perfil_acceso"("sistema", "nombre");

-- CreateIndex
CREATE INDEX "acceso_persona_persona_id_desde_idx" ON "acceso_persona"("persona_id", "desde");

-- CreateIndex
CREATE INDEX "acceso_persona_perfil_id_desde_idx" ON "acceso_persona"("perfil_id", "desde");

-- AddForeignKey
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_autorizado_por_id_fkey" FOREIGN KEY ("autorizado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_ejecutado_por_id_fkey" FOREIGN KEY ("ejecutado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceso_persona" ADD CONSTRAINT "acceso_persona_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceso_persona" ADD CONSTRAINT "acceso_persona_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil_acceso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceso_persona" ADD CONSTRAINT "acceso_persona_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE SET NULL ON UPDATE CASCADE;

