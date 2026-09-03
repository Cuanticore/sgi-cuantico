-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "alcance_obligacion" ADD VALUE 'ACTIVO';
ALTER TYPE "alcance_obligacion" ADD VALUE 'TIPO_ACTIVO';
ALTER TYPE "alcance_obligacion" ADD VALUE 'NIVEL_ACTIVO';

-- DropIndex
DROP INDEX "asignacion_obligacion_id_persona_id_periodo_key";

-- AlterTable
ALTER TABLE "asignacion" ADD COLUMN     "activo_id" INTEGER;

-- AlterTable
ALTER TABLE "obligacion" ADD COLUMN     "alcance_activo_id" INTEGER,
ADD COLUMN     "alcance_nivel_activo_id" INTEGER,
ADD COLUMN     "alcance_tipo_activo_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "asignacion_obligacion_id_persona_id_periodo_activo_id_key" ON "asignacion"("obligacion_id", "persona_id", "periodo", "activo_id");

-- AddForeignKey
ALTER TABLE "obligacion" ADD CONSTRAINT "obligacion_alcance_activo_id_fkey" FOREIGN KEY ("alcance_activo_id") REFERENCES "activo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligacion" ADD CONSTRAINT "obligacion_alcance_tipo_activo_id_fkey" FOREIGN KEY ("alcance_tipo_activo_id") REFERENCES "tipo_magerit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion" ADD CONSTRAINT "asignacion_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "activo"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- T1 · la idempotencia, recuperada con NULLS NOT DISTINCT (PostgreSQL 15+; corremos 17.11)
--
-- La unica de `asignacion` paso de tres columnas a cuatro porque una obligacion por tipo
-- de activo produce VARIAS asignaciones para la misma persona en el mismo periodo —una por
-- activo que posee— y con la restriccion de tres solo cabia la primera.
--
-- Pero Prisma crea el indice con el comportamiento por omision de SQL, donde dos NULL se
-- consideran DISTINTOS. Con eso, dos filas de `activo_id` nulo no chocan, y la garantia se
-- perderia justo para las obligaciones que NO son por activo — que son todas las que hay
-- hoy. El cron dejaria de ser reintentable en silencio: nadie lo notaria hasta ver
-- asignaciones duplicadas en la bandeja de alguien.
--
-- Prisma no puede expresar NULLS NOT DISTINCT en el esquema, asi que el indice se recrea
-- aca. Mismo nombre y mismas columnas, para que la comparacion contra el esquema no vea
-- diferencia.
-- ─────────────────────────────────────────────────────────────────────────────────────────

DROP INDEX "asignacion_obligacion_id_persona_id_periodo_activo_id_key";

CREATE UNIQUE INDEX "asignacion_obligacion_id_persona_id_periodo_activo_id_key"
  ON "asignacion" ("obligacion_id", "persona_id", "periodo", "activo_id")
  NULLS NOT DISTINCT;
