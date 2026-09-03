-- CreateEnum
CREATE TYPE "veredicto" AS ENUM ('INCIDENTE', 'OBSERVACION', 'FALSO_POSITIVO');

-- CreateEnum
CREATE TYPE "dimension_cid" AS ENUM ('CONFIDENCIALIDAD', 'INTEGRIDAD', 'DISPONIBILIDAD');

-- CreateEnum
CREATE TYPE "nivel_impacto" AS ENUM ('NINGUNO', 'BAJO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "fase_incidente" AS ENUM ('DETECCION', 'EVALUACION', 'CONTENCION', 'COMUNICACION', 'ERRADICACION', 'RECUPERACION');

-- AlterTable
ALTER TABLE "evidencia" ADD COLUMN     "evento_id" INTEGER;

-- CreateTable
CREATE TABLE "lugar_evento" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lugar_evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria_incidente" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categoria_incidente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivacion_incidente" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "motivacion_incidente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_seguridad" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fechaOcurrencia" TIMESTAMP(3) NOT NULL,
    "en_curso" BOOLEAN NOT NULL DEFAULT false,
    "donde_id" INTEGER,
    "otros_enterados" TEXT,
    "reportado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "veredicto" "veredicto",
    "justificacion" TEXT,
    "evaluado_por_id" INTEGER,
    "fecha_evaluacion" TIMESTAMP(3),
    "motivacion_id" INTEGER,
    "causa_raiz" TEXT,
    "costo_recuperacion" DECIMAL(14,2),
    "costo_impacto" DECIMAL(14,2),
    "leccion_aprendida" TEXT,
    "fecha_cierre" TIMESTAMP(3),
    "cerrado_por_id" INTEGER,

    CONSTRAINT "evento_seguridad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_categoria" (
    "evento_id" INTEGER NOT NULL,
    "categoria_id" INTEGER NOT NULL,

    CONSTRAINT "evento_categoria_pkey" PRIMARY KEY ("evento_id","categoria_id")
);

-- CreateTable
CREATE TABLE "impacto_evento" (
    "evento_id" INTEGER NOT NULL,
    "dimension" "dimension_cid" NOT NULL,
    "nivel" "nivel_impacto" NOT NULL,

    CONSTRAINT "impacto_evento_pkey" PRIMARY KEY ("evento_id","dimension")
);

-- CreateTable
CREATE TABLE "activo_afectado" (
    "evento_id" INTEGER NOT NULL,
    "activo_id" INTEGER NOT NULL,

    CONSTRAINT "activo_afectado_pkey" PRIMARY KEY ("evento_id","activo_id")
);

-- CreateTable
CREATE TABLE "accion_incidente" (
    "id" SERIAL NOT NULL,
    "evento_id" INTEGER NOT NULL,
    "fase" "fase_incidente" NOT NULL,
    "momento" TIMESTAMP(3) NOT NULL,
    "texto" TEXT NOT NULL,
    "autor_id" INTEGER,

    CONSTRAINT "accion_incidente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contador_evento" (
    "anio" INTEGER NOT NULL,
    "ultimo_valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contador_evento_pkey" PRIMARY KEY ("anio")
);

-- CreateIndex
CREATE UNIQUE INDEX "lugar_evento_nombre_key" ON "lugar_evento"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_incidente_nombre_key" ON "categoria_incidente"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "motivacion_incidente_nombre_key" ON "motivacion_incidente"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "evento_seguridad_codigo_key" ON "evento_seguridad"("codigo");

-- CreateIndex
CREATE INDEX "evento_seguridad_veredicto_creado_en_idx" ON "evento_seguridad"("veredicto", "creado_en");

-- CreateIndex
CREATE INDEX "accion_incidente_evento_id_momento_idx" ON "accion_incidente"("evento_id", "momento");

-- AddForeignKey
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento_seguridad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_seguridad" ADD CONSTRAINT "evento_seguridad_donde_id_fkey" FOREIGN KEY ("donde_id") REFERENCES "lugar_evento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_seguridad" ADD CONSTRAINT "evento_seguridad_motivacion_id_fkey" FOREIGN KEY ("motivacion_id") REFERENCES "motivacion_incidente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_seguridad" ADD CONSTRAINT "evento_seguridad_reportado_por_id_fkey" FOREIGN KEY ("reportado_por_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_seguridad" ADD CONSTRAINT "evento_seguridad_evaluado_por_id_fkey" FOREIGN KEY ("evaluado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_seguridad" ADD CONSTRAINT "evento_seguridad_cerrado_por_id_fkey" FOREIGN KEY ("cerrado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_categoria" ADD CONSTRAINT "evento_categoria_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento_seguridad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_categoria" ADD CONSTRAINT "evento_categoria_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_incidente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impacto_evento" ADD CONSTRAINT "impacto_evento_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento_seguridad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo_afectado" ADD CONSTRAINT "activo_afectado_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento_seguridad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo_afectado" ADD CONSTRAINT "activo_afectado_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "activo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accion_incidente" ADD CONSTRAINT "accion_incidente_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento_seguridad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accion_incidente" ADD CONSTRAINT "accion_incidente_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- El CHECK de `evidencia` gana su CUARTO dueno.
--
-- REQ-SIG-07 §3.2 dice que la evidencia de un incidente usa la misma tabla: es material de
-- prueba (A.5.28) y no merece un manejo de archivos aparte. Sin ampliar el CHECK, una
-- evidencia de evento se rechazaria — exactamente el defecto que este mismo CHECK tenia con
-- `hallazgo_id` hasta la migracion `20260903153000`.
-- ─────────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE "evidencia" DROP CONSTRAINT "evidencia_un_solo_origen";

ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_un_solo_origen" CHECK (
  ("control_id" IS NOT NULL)::integer
  + ("registro_id" IS NOT NULL)::integer
  + ("hallazgo_id" IS NOT NULL)::integer
  + ("evento_id" IS NOT NULL)::integer
  = 1
);

-- Los catalogos, del lienzo `handoff_operacion/design/Incidente.dc.html`.
--
-- Las DIEZ categorias son un catalogo cerrado, y esa es la razon: «sin texto libre en lo que
-- se va a contar». Es lo que permite responder «cuantos incidentes de phishing hubo este
-- año», que es el indicador de la clausula 9.1. Con texto libre, «phishing», «Phishing» y
-- «correo malicioso» son tres cosas.

INSERT INTO "categoria_incidente" ("nombre", "orden", "activo") VALUES
  ('Phishing e ingeniería social',        1, true),
  ('Malware o ransomware',                2, true),
  ('Acceso no autorizado',                3, true),
  ('Fuga o pérdida de información',       4, true),
  ('Pérdida o robo de dispositivo',       5, true),
  ('Denegación de servicio',              6, true),
  ('Falla técnica o indisponibilidad',    7, true),
  ('Error humano',                        8, true),
  ('Incumplimiento de política',          9, true),
  ('Vulneración de un proveedor',        10, true)
ON CONFLICT ("nombre") DO NOTHING;

-- Donde ocurrio. El formulario de reporte lo pregunta porque orienta la contencion, y son
-- opciones y no texto para que se pueda agrupar.
INSERT INTO "lugar_evento" ("nombre", "orden", "activo") VALUES
  ('Correo',                   1, true),
  ('Una aplicación',           2, true),
  ('Un equipo o portátil',     3, true),
  ('Documentos o archivos',    4, true),
  ('Una llamada o mensaje',    5, true),
  ('Otro sitio',               6, true)
ON CONFLICT ("nombre") DO NOTHING;

-- `motivacion_incidente` queda VACIA a proposito. La spec la declara como catalogo y NINGUNA
-- fuente —ni el lienzo ni el registro de decisiones— dice cuales son sus valores.
-- Inventarlos seria poner en la boca del SGSI una clasificacion de intencionalidad que nadie
-- aprobo, y la motivacion de un incidente es justo el campo donde eso se nota. La pantalla
-- lo muestra como faltante.
