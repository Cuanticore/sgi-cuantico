-- The asset sheet's PROPIETARIO and CUSTODIO lists become independent.
--
-- REQ-SIG-01:212 has one list feed owner, custodian and treatment responsible, and the
-- client's own «Listas SGSI» agrees: LstCargo is a single named range. The client asked for
-- the two lists to be separate anyway, so this is one row per POSITION with two curated
-- views of it -- not two tables. cargo_responsable is pointed at by eight foreign keys, and
-- splitting it would mean two truths about the same position the first time somebody
-- renames one side.
--
-- Both default TRUE so nothing disappears from either dropdown on deploy.

-- AlterTable
ALTER TABLE "cargo_responsable" ADD COLUMN     "es_custodio" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "es_propietario" BOOLEAN NOT NULL DEFAULT true;

