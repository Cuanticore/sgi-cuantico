-- CreateTable
CREATE TABLE "contador_acta" (
    "anio" INTEGER NOT NULL,
    "ultimo_valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contador_acta_pkey" PRIMARY KEY ("anio")
);

