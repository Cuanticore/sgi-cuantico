-- AlterTable
ALTER TABLE "control" ADD COLUMN     "soa_alcance_adaptado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "soa_aprobado_por" TEXT,
ADD COLUMN     "soa_descripcion" TEXT,
ADD COLUMN     "soa_documento" TEXT,
ADD COLUMN     "soa_fecha" DATE,
ADD COLUMN     "soa_version" TEXT;
