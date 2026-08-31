-- CreateTable
CREATE TABLE "persona" (
    "id" SERIAL NOT NULL,
    "oid" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "sincronizada_en" TIMESTAMP(3),
    "area_id" INTEGER,
    "cargo_id" INTEGER,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persona_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "persona_oid_key" ON "persona"("oid");

-- CreateIndex
CREATE UNIQUE INDEX "persona_correo_key" ON "persona"("correo");

-- AddForeignKey
ALTER TABLE "persona" ADD CONSTRAINT "persona_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persona" ADD CONSTRAINT "persona_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargo_responsable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
