-- CreateTable
CREATE TABLE "evidencia_archivo" (
    "id" SERIAL NOT NULL,
    "evidencia_id" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidencia_archivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evidencia_archivo_evidencia_id_key" ON "evidencia_archivo"("evidencia_id");

-- AddForeignKey
ALTER TABLE "evidencia_archivo" ADD CONSTRAINT "evidencia_archivo_evidencia_id_fkey" FOREIGN KEY ("evidencia_id") REFERENCES "evidencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
