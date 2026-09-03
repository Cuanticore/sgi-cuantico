-- Verificaciones programadas y metricas del SGSI (REQ-SIG-07 3.3 y 3.4).
--
-- `obligacion.anclaje` cierra la regla R12, que el control de integracion listaba como
-- pendiente. Nace con DEFAULT 'ANCLADA', que es el comportamiento que el generador ya
-- tenia: ninguna obligacion existente cambia de conducta al aplicar esta migracion.
--
-- `ejecucion_verificacion` es lo unico nuevo de la seccion de verificaciones. Todo lo
-- demas —el calendario, los vencimientos, los avisos, el cierre— ya lo hace el motor de
-- tareas del modulo A.
--
-- No hay tabla de alertas de metrica a proposito: una medicion esta en alerta cuando cruza
-- el umbral en el sentido malo, y eso se calcula. Lo que se persiste es la REACCION, en
-- `medicion_metrica.asignacion_id`.
-- CreateEnum
CREATE TYPE "anclaje" AS ENUM ('ANCLADA', 'FLOTANTE');

-- CreateEnum
CREATE TYPE "resultado_verificacion" AS ENUM ('CONFORME', 'HALLAZGO', 'NO_CONFORME');

-- CreateEnum
CREATE TYPE "sentido_metrica" AS ENUM ('MENOR_ES_MEJOR', 'MAYOR_ES_MEJOR');


-- AlterTable
ALTER TABLE "obligacion" ADD COLUMN     "anclaje" "anclaje" NOT NULL DEFAULT 'ANCLADA';

-- CreateTable
CREATE TABLE "ejecucion_verificacion" (
    "id" SERIAL NOT NULL,
    "asignacion_id" INTEGER NOT NULL,
    "resultado" "resultado_verificacion" NOT NULL,
    "nota" TEXT,
    "hallazgo_id" INTEGER,
    "registrado_por_id" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ejecucion_verificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrica" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "control_anexo_a" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "umbral" DECIMAL(12,2) NOT NULL,
    "sentido" "sentido_metrica" NOT NULL,
    "periodicidad" "periodicidad" NOT NULL,
    "responsable_id" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicion_metrica" (
    "id" SERIAL NOT NULL,
    "metrica_id" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "registrado_por_id" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asignacion_id" INTEGER,

    CONSTRAINT "medicion_metrica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ejecucion_verificacion_asignacion_id_key" ON "ejecucion_verificacion"("asignacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "metrica_codigo_key" ON "metrica"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "medicion_metrica_metrica_id_periodo_key" ON "medicion_metrica"("metrica_id", "periodo");

-- AddForeignKey
ALTER TABLE "ejecucion_verificacion" ADD CONSTRAINT "ejecucion_verificacion_asignacion_id_fkey" FOREIGN KEY ("asignacion_id") REFERENCES "asignacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejecucion_verificacion" ADD CONSTRAINT "ejecucion_verificacion_hallazgo_id_fkey" FOREIGN KEY ("hallazgo_id") REFERENCES "hallazgo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ejecucion_verificacion" ADD CONSTRAINT "ejecucion_verificacion_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrica" ADD CONSTRAINT "metrica_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicion_metrica" ADD CONSTRAINT "medicion_metrica_metrica_id_fkey" FOREIGN KEY ("metrica_id") REFERENCES "metrica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicion_metrica" ADD CONSTRAINT "medicion_metrica_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicion_metrica" ADD CONSTRAINT "medicion_metrica_asignacion_id_fkey" FOREIGN KEY ("asignacion_id") REFERENCES "asignacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

