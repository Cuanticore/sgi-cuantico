-- DropForeignKey
ALTER TABLE "activo" DROP CONSTRAINT "activo_custodio_id_fkey";

-- DropForeignKey
ALTER TABLE "activo" DROP CONSTRAINT "activo_propietario_id_fkey";

-- AlterTable
ALTER TABLE "activo" ALTER COLUMN "propietario_id" DROP NOT NULL,
ALTER COLUMN "custodio_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_propietario_id_fkey" FOREIGN KEY ("propietario_id") REFERENCES "cargo_responsable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_custodio_id_fkey" FOREIGN KEY ("custodio_id") REFERENCES "cargo_responsable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
