-- SOA declaration replaces the applicability boolean.
--
-- ISO/IEC 27001:2022 clause 6.1.3 d requires the Statement of Applicability to be more
-- than in/out: a control can apply, not apply, or apply only to part of the scope.
-- PARCIAL counts as applicable for every indicator — partial scope coverage is not an
-- exclusion — which is exactly the state a boolean could never represent.
--
-- The 7 controls previously recorded as `aplica = false` (the physical ones, the
-- organisation operates 100% remote) become SOA = NO, and their long-standing written
-- justification, kept in `evidencia` up to now, moves to `justificacion_soa`. The old
-- boolean column is dropped: its history stays in the bitácora, and its current meaning
-- lives in the two new columns.

-- CreateEnum
CREATE TYPE "estado_soa" AS ENUM ('SI', 'PARCIAL', 'NO');

-- AddField
ALTER TABLE "control" ADD COLUMN "soa" "estado_soa" NOT NULL DEFAULT 'SI';
ALTER TABLE "control" ADD COLUMN "justificacion_soa" TEXT;
ALTER TABLE "control" ADD COLUMN "soa_actualizado_por" TEXT;
ALTER TABLE "control" ADD COLUMN "soa_actualizado_en" TIMESTAMP(3);

-- Backfill: the 7 non-applicable controls become NO and keep their justification.
UPDATE "control"
SET "soa" = 'NO',
    "justificacion_soa" = "evidencia"
WHERE "aplica" = false;

-- DropField
ALTER TABLE "control" DROP COLUMN "aplica";
