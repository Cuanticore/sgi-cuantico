-- AlterTable
ALTER TABLE "bitacora" ADD COLUMN     "ip" TEXT;

-- AlterTable
ALTER TABLE "evidencia" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "archivo_key" TEXT,
ADD COLUMN     "archivo_mime" TEXT,
ADD COLUMN     "archivo_nombre" TEXT,
ADD COLUMN     "archivo_sha256" TEXT,
ADD COLUMN     "archivo_tamano" INTEGER,
ADD COLUMN     "archivo_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "archivo_version_de" INTEGER;
