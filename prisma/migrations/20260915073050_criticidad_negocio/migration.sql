-- AlterTable
ALTER TABLE "activo" ADD COLUMN     "criticidad_id" INTEGER;

-- CreateTable
CREATE TABLE "criticidad_negocio" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rto_minutos" INTEGER,
    "rpo_minutos" INTEGER,
    "descripcion" TEXT,
    "orden" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "criticidad_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "criticidad_negocio_codigo_key" ON "criticidad_negocio"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "criticidad_negocio_nombre_key" ON "criticidad_negocio"("nombre");

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_criticidad_id_fkey" FOREIGN KEY ("criticidad_id") REFERENCES "criticidad_negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
