-- CreateEnum
CREATE TYPE "origen_persona" AS ENUM ('DIRECTORIO', 'MANUAL');

-- CreateEnum
CREATE TYPE "tipo_colaborador" AS ENUM ('BASE', 'RECURRENTE', 'TEMPORAL');

-- AlterTable
ALTER TABLE "persona" ADD COLUMN     "ciudad" TEXT,
ADD COLUMN     "correo_personal" TEXT,
ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "documento_identidad" TEXT,
ADD COLUMN     "fecha_ingreso" DATE,
ADD COLUMN     "fecha_inicio_contrato" DATE,
ADD COLUMN     "fecha_terminacion" DATE,
ADD COLUMN     "origen" "origen_persona" NOT NULL DEFAULT 'DIRECTORIO',
ADD COLUMN     "retirado_en" TIMESTAMP(3),
ADD COLUMN     "telefono" TEXT,
ADD COLUMN     "tipoColaborador" "tipo_colaborador",
ADD COLUMN     "tipo_contrato_id" INTEGER,
ADD COLUMN     "verificacion_antecedentes_en" DATE;

-- CreateTable
CREATE TABLE "tipo_contrato" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "es_nomina" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metodo_borrado" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "metodo_borrado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acta_borrado_seguro" (
    "id" SERIAL NOT NULL,
    "persona_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "metodo_id" INTEGER NOT NULL,
    "ejecutado_por_id" INTEGER,
    "evidencia_id" INTEGER,
    "nota" TEXT,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acta_borrado_seguro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acta_borrado_activo" (
    "acta_id" INTEGER NOT NULL,
    "activo_id" INTEGER NOT NULL,

    CONSTRAINT "acta_borrado_activo_pkey" PRIMARY KEY ("acta_id","activo_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_contrato_nombre_key" ON "tipo_contrato"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "metodo_borrado_nombre_key" ON "metodo_borrado"("nombre");

-- AddForeignKey
ALTER TABLE "persona" ADD CONSTRAINT "persona_tipo_contrato_id_fkey" FOREIGN KEY ("tipo_contrato_id") REFERENCES "tipo_contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acta_borrado_seguro" ADD CONSTRAINT "acta_borrado_seguro_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acta_borrado_seguro" ADD CONSTRAINT "acta_borrado_seguro_metodo_id_fkey" FOREIGN KEY ("metodo_id") REFERENCES "metodo_borrado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acta_borrado_seguro" ADD CONSTRAINT "acta_borrado_seguro_ejecutado_por_id_fkey" FOREIGN KEY ("ejecutado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acta_borrado_activo" ADD CONSTRAINT "acta_borrado_activo_acta_id_fkey" FOREIGN KEY ("acta_id") REFERENCES "acta_borrado_seguro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acta_borrado_activo" ADD CONSTRAINT "acta_borrado_activo_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "activo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- C8 · el catalogo cerrado de tipo de contrato.
--
-- Las etiquetas salen de la COMPOSICION REAL que dibuja el lienzo
-- (`handoff_colaboradores/design/Colaboradores.dc.html`), que es el dato del Excel maestro
-- de Talento Humano con las 56 personas.
--
-- OJO CON UNA DISCREPANCIA: la spec §3.1 dice «cuatro valores. En el Excel de origen hay
-- siete, con "Prestacion de Servicios" escrito de tres formas». El lienzo muestra CINCO
-- etiquetas distintas. Siete menos las dos variantes ortograficas dan cinco, no cuatro, asi
-- que se cargan las cinco del lienzo —que es la fuente mas nueva y la unica que las nombra—
-- y queda anotado que la spec dice otra cifra. Cual de las cinco sobra, si sobra alguna, lo
-- decide Talento Humano.
--
-- `es_nomina` marca lo unico que el tipo de contrato cambia para el SIG: las afiliaciones y
-- la liquidacion. Los siete pasos de seguridad son identicos para todos, y ese es el
-- argumento central del modulo.
-- ─────────────────────────────────────────────────────────────────────────────────────────

INSERT INTO "tipo_contrato" ("nombre", "es_nomina", "orden", "activo") VALUES
  ('Prestación de servicios', false, 1, true),
  ('Nómina',                  true,  2, true),
  ('Familiar',                false, 3, true),
  ('Activa por proveedor',    false, 4, true),
  ('Por horas',               false, 5, true)
ON CONFLICT ("nombre") DO NOTHING;

-- Los metodos de borrado. Son los que PTR-TEC-03 item 62 admite como evidencia: el metodo
-- no es un detalle tecnico, es lo que responde ante un auditor.
INSERT INTO "metodo_borrado" ("nombre", "orden", "activo") VALUES
  ('Formateo con sobrescritura', 1, true),
  ('Borrado criptográfico',      2, true),
  ('Destrucción física',         3, true),
  ('Restablecimiento de fábrica', 4, true)
ON CONFLICT ("nombre") DO NOTHING;
