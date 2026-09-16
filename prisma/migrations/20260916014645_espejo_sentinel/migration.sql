-- Espejo de consulta de Microsoft Sentinel.
--
-- Tabla nueva, tipo nuevo y tres columnas nullable en `evento_seguridad`. Aditiva: no
-- toca ninguna fila existente. El CHECK `evento_origen_completo` no lo emite Prisma desde
-- el schema (no hay forma de declarar un CHECK multi-columna en `schema.prisma`), así que
-- se agrega a mano en este archivo.

-- CreateEnum
CREATE TYPE "sistema_origen_evento" AS ENUM ('SENTINEL');

-- AlterTable
ALTER TABLE "evento_seguridad" ADD COLUMN     "origen_id_externo" TEXT,
ADD COLUMN     "origen_sistema" "sistema_origen_evento",
ADD COLUMN     "origen_url" TEXT;

-- CreateTable
CREATE TABLE "incidente_sentinel" (
    "id" SERIAL NOT NULL,
    "numero_incidente" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "severidad_sentinel" TEXT NOT NULL,
    "estado_sentinel" TEXT NOT NULL,
    "clasificacion" TEXT,
    "comentario_clasificacion" TEXT,
    "creado_en_sentinel" TIMESTAMP(3) NOT NULL,
    "primera_actividad" TIMESTAMP(3),
    "ultima_actividad" TIMESTAMP(3),
    "cerrado_en_sentinel" TIMESTAMP(3),
    "url" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "propietario_correo" TEXT,
    "etiquetas" TEXT,
    "alertas" TEXT,
    "sincronizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidente_sentinel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incidente_sentinel_numero_incidente_key" ON "incidente_sentinel"("numero_incidente");

-- CreateIndex
CREATE INDEX "incidente_sentinel_estado_sentinel_creado_en_sentinel_idx" ON "incidente_sentinel"("estado_sentinel", "creado_en_sentinel");

-- CreateIndex
CREATE UNIQUE INDEX "evento_origen_unico" ON "evento_seguridad"("origen_sistema", "origen_id_externo");

-- AddCheckConstraint (a mano — Prisma no emite CHECK multi-columna desde el schema)
--
-- Sistema e id externo van juntos o no van. Sin este CHECK, una fila con
-- `origen_sistema = 'SENTINEL'` y `origen_id_externo = NULL` pasaría el índice único (NULL
-- no colisiona) pero dejaría un evento marcado como "vino de Sentinel" sin ningún id para
-- volver al incidente de origen: una promoción a medio hacer que ninguna consulta futura
-- podría enlazar de vuelta.
ALTER TABLE "evento_seguridad" ADD CONSTRAINT "evento_origen_completo" CHECK (
  ("origen_sistema" IS NULL) = ("origen_id_externo" IS NULL)
);
