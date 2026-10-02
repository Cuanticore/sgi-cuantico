-- D6 · ComponenteTercero y TratamientoDatosPersonales ganan clave natural.
--
-- Sin `codigo`, el `PUT` idempotente de la API de servicio (Fase 4) no tiene sobre qué
-- clavear el `upsert`: un reintento tras un corte de red dejaría una fila duplicada por
-- cada intento.
--
-- La columna se agrega en tres pasos (NULL -> backfill -> NOT NULL) en vez de en uno solo
-- para no asumir que las tablas están vacías: un `ADD COLUMN ... NOT NULL` directo sobre
-- una tabla con filas existentes revienta el despliegue. El backfill usa el `id` de cada
-- fila -- no es un código de negocio, es un valor de relleno técnico para lo que ya existía
-- antes de que esta migración corriera; lo que no se sabe no se inventa.

-- AlterTable: componente_tercero
ALTER TABLE "componente_tercero" ADD COLUMN "codigo" TEXT;
UPDATE "componente_tercero" SET "codigo" = 'CMP-' || "id" WHERE "codigo" IS NULL;
ALTER TABLE "componente_tercero" ALTER COLUMN "codigo" SET NOT NULL;

-- AlterTable: tratamiento_datos_personales
ALTER TABLE "tratamiento_datos_personales" ADD COLUMN "codigo" TEXT;
UPDATE "tratamiento_datos_personales" SET "codigo" = 'TDP-' || "id" WHERE "codigo" IS NULL;
ALTER TABLE "tratamiento_datos_personales" ALTER COLUMN "codigo" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "componente_tercero_sistema_id_codigo_key" ON "componente_tercero"("sistema_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tratamiento_datos_personales_sistema_id_codigo_key" ON "tratamiento_datos_personales"("sistema_id", "codigo");
