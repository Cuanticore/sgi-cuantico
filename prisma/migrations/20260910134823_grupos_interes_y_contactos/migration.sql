-- AlterEnum
ALTER TYPE "alcance_obligacion" ADD VALUE 'GRUPO_INTERES';

-- AlterTable
ALTER TABLE "obligacion" ADD COLUMN     "alcance_grupo_interes_id" INTEGER;

-- CreateTable
CREATE TABLE "grupo_interes" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "derivado" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "grupo_interes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "miembro_grupo_interes" (
    "id" SERIAL NOT NULL,
    "grupo_id" INTEGER NOT NULL,
    "persona_id" INTEGER NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "miembro_grupo_interes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacto_emergencia" (
    "id" SERIAL NOT NULL,
    "persona_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "parentesco" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 1,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacto_emergencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grupo_interes_codigo_key" ON "grupo_interes"("codigo");

-- CreateIndex
CREATE INDEX "miembro_grupo_interes_persona_id_idx" ON "miembro_grupo_interes"("persona_id");

-- CreateIndex
CREATE UNIQUE INDEX "miembro_grupo_interes_grupo_id_persona_id_key" ON "miembro_grupo_interes"("grupo_id", "persona_id");

-- CreateIndex
CREATE INDEX "contacto_emergencia_persona_id_idx" ON "contacto_emergencia"("persona_id");

-- AddForeignKey
ALTER TABLE "obligacion" ADD CONSTRAINT "obligacion_alcance_grupo_interes_id_fkey" FOREIGN KEY ("alcance_grupo_interes_id") REFERENCES "grupo_interes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miembro_grupo_interes" ADD CONSTRAINT "miembro_grupo_interes_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupo_interes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miembro_grupo_interes" ADD CONSTRAINT "miembro_grupo_interes_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacto_emergencia" ADD CONSTRAINT "contacto_emergencia_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
