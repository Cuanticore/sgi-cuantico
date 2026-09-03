-- AlterTable
ALTER TABLE "registro_realizado" ADD COLUMN     "version_contenido_id" INTEGER;

-- CreateTable
CREATE TABLE "version_contenido" (
    "id" SERIAL NOT NULL,
    "contenido_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "documento_codigo" TEXT,
    "documento_nombre" TEXT,
    "documento_version" TEXT,
    "documento_url" TEXT,
    "publicada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicada_por_id" INTEGER,

    CONSTRAINT "version_contenido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "version_contenido_contenido_id_version_key" ON "version_contenido"("contenido_id", "version");

-- AddForeignKey
ALTER TABLE "registro_realizado" ADD CONSTRAINT "registro_realizado_version_contenido_id_fkey" FOREIGN KEY ("version_contenido_id") REFERENCES "version_contenido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_contenido" ADD CONSTRAINT "version_contenido_contenido_id_fkey" FOREIGN KEY ("contenido_id") REFERENCES "contenido_sig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_contenido" ADD CONSTRAINT "version_contenido_publicada_por_id_fkey" FOREIGN KEY ("publicada_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Respaldo de datos: cada contenido existente estrena su fila de version con el texto que
-- tiene AHORA.
--
-- Se copia la version ACTUAL y solo esa. Las anteriores, si un contenido ya iba por la 2 o
-- la 3, no se pueden reconstruir: `editarContenido` hacia `update` sobre el titulo y la
-- descripcion, asi que ese texto no existe en ninguna parte. Inventarlo seria escribir un
-- documento y afirmar que alguien lo leyo.
--
-- En esta base el respaldo es completo por suerte, no por diseno: los cinco contenidos
-- estan en v1 y no hay ningun registro de realizado todavia. Nada se perdio. Es exactamente
-- el momento en que este cambio sale gratis, y por eso se hace ahora.
--
-- `publicada_por_id` queda nulo: estas versiones no tuvieron autor, y poner uno seria
-- firmar un documento en nombre de otro.
-- ─────────────────────────────────────────────────────────────────────────────────────────

INSERT INTO "version_contenido" (
  "contenido_id", "version", "titulo", "descripcion",
  "documento_codigo", "documento_nombre", "documento_version", "documento_url",
  "publicada_en", "publicada_por_id"
)
SELECT
  "id", "version", "titulo", "descripcion",
  "documento_codigo", "documento_nombre", "documento_version", "documento_url",
  "creada_en", NULL
FROM "contenido_sig";

-- Los registros de realizado que ya apuntaban a una version POR TEXTO quedan apuntando a
-- su fila, cuando la fila existe. Los que citan una version cuyo texto se perdio conservan
-- su `version_leida` y quedan sin `version_contenido_id`: eso es informacion —dice que el
-- acuse no se puede verificar contra su texto— y es preferible a colgarlos de la version
-- equivocada.
UPDATE "registro_realizado" r
SET "version_contenido_id" = v."id"
FROM "asignacion" a
  LEFT JOIN "obligacion" o ON o."id" = a."obligacion_id"
  JOIN "version_contenido" v
    ON v."contenido_id" = COALESCE(a."contenido_id", o."contenido_id")
WHERE r."asignacion_id" = a."id"
  AND r."version_leida" IS NOT NULL
  AND v."version" = r."version_leida"::int;
