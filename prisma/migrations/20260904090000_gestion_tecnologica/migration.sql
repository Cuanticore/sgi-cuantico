-- Gestion Tecnologica (REQ-SIG-06).
--
-- Tres cosas que el SQL hace y el esquema de Prisma no puede decir:
--
-- 1. El indice de idempotencia de `despliegue` se recrea con NULLS NOT DISTINCT. Sin eso,
--    dos filas con el mismo repo y ambiente pero `servidor` nulo NO chocarian —en SQL
--    estandar dos nulos son distintos— y cada reimportacion duplicaria exactamente las
--    filas que menos informacion tienen. E6 dice que reimportar actualiza, no duplica.
--
-- 2. Se siembran los TRES niveles de grado 1. Son los valores cerrados de D8, y sin ellos
--    no hay donde colgar un nivel 2: la pantalla naceria pidiendo que alguien invente la
--    raiz.
--
-- 3. Se siembra la plantilla minima de un producto —Codigo Fuente, Ambientes, Dependencias
--    y Documentacion con sus activos esperados—. Es la lista del requerimiento, no una
--    interpretacion, y es lo que permite que la ficha diga «le faltan el ambiente de
--    staging y la documentacion publica».
--
-- Lo que NO se hace aca: asignar `nivel_id` a los 234 activos existentes. Nadie dijo a que
-- nivel pertenece cada uno, y repartirlos por su area seria inventar la jerarquia que esta
-- pantalla existe para levantar. Nacen en nulo y la pantalla los cuenta como sin clasificar.
-- CreateEnum
CREATE TYPE "clase_nivel" AS ENUM ('EMPRESA', 'PRODUCTOS', 'PROYECTOS');

-- CreateEnum
CREATE TYPE "tipo_dependencia" AS ENUM ('USA', 'SE_ALOJA_EN', 'AUTENTICA_CON', 'ALMACENA_EN');

-- CreateEnum
CREATE TYPE "confianza_dato" AS ENUM ('ALTA', 'MEDIA', 'BAJA');

-- AlterTable
ALTER TABLE "activo" ADD COLUMN     "nivel_id" INTEGER,
ADD COLUMN     "persona_id" INTEGER;

-- CreateTable
CREATE TABLE "nivel_activo" (
    "id" SERIAL NOT NULL,
    "grado" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "padre_id" INTEGER,
    "clase" "clase_nivel",
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "nivel_activo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla_nivel" (
    "id" SERIAL NOT NULL,
    "clase_nivel" "clase_nivel" NOT NULL,
    "nombre_nivel_3" TEXT NOT NULL,
    "activo_esperado" TEXT NOT NULL,
    "obligatorio" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plantilla_nivel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependencia_activo" (
    "id" SERIAL NOT NULL,
    "activo_id" INTEGER NOT NULL,
    "depende_de_id" INTEGER NOT NULL,
    "tipo" "tipo_dependencia" NOT NULL,
    "nota" TEXT,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dependencia_activo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "despliegue" (
    "id" SERIAL NOT NULL,
    "activo_id" INTEGER,
    "servidor_id" INTEGER,
    "nombre" TEXT NOT NULL,
    "componente" TEXT,
    "repo_github" TEXT,
    "ambiente" TEXT NOT NULL,
    "plataforma" TEXT,
    "servidor" TEXT,
    "ip" TEXT,
    "url" TEXT,
    "imagen" TEXT,
    "tag_rama" TEXT,
    "contenedor_servicio" TEXT,
    "puerto" TEXT,
    "base_datos" TEXT,
    "estado" TEXT NOT NULL,
    "evidencia" TEXT,
    "confianza" "confianza_dato" NOT NULL DEFAULT 'MEDIA',
    "notas" TEXT,
    "activo_registro" BOOLEAN NOT NULL DEFAULT true,
    "importado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "despliegue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto" (
    "id" SERIAL NOT NULL,
    "nivel_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "responsable_id" INTEGER NOT NULL,
    "cliente_ref" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nivel_activo_grado_padre_id_idx" ON "nivel_activo"("grado", "padre_id");

-- CreateIndex
CREATE UNIQUE INDEX "plantilla_nivel_clase_nivel_nombre_nivel_3_activo_esperado_key" ON "plantilla_nivel"("clase_nivel", "nombre_nivel_3", "activo_esperado");

-- CreateIndex
CREATE INDEX "dependencia_activo_depende_de_id_idx" ON "dependencia_activo"("depende_de_id");

-- CreateIndex
CREATE UNIQUE INDEX "dependencia_activo_activo_id_depende_de_id_tipo_key" ON "dependencia_activo"("activo_id", "depende_de_id", "tipo");

-- CreateIndex
CREATE INDEX "despliegue_activo_id_idx" ON "despliegue"("activo_id");

-- CreateIndex
CREATE UNIQUE INDEX "despliegue_repo_github_ambiente_servidor_key" ON "despliegue"("repo_github", "ambiente", "servidor");

-- CreateIndex
CREATE UNIQUE INDEX "producto_nivel_id_key" ON "producto"("nivel_id");

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_nivel_id_fkey" FOREIGN KEY ("nivel_id") REFERENCES "nivel_activo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nivel_activo" ADD CONSTRAINT "nivel_activo_padre_id_fkey" FOREIGN KEY ("padre_id") REFERENCES "nivel_activo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencia_activo" ADD CONSTRAINT "dependencia_activo_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "activo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependencia_activo" ADD CONSTRAINT "dependencia_activo_depende_de_id_fkey" FOREIGN KEY ("depende_de_id") REFERENCES "activo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despliegue" ADD CONSTRAINT "despliegue_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "activo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despliegue" ADD CONSTRAINT "despliegue_servidor_id_fkey" FOREIGN KEY ("servidor_id") REFERENCES "activo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_nivel_id_fkey" FOREIGN KEY ("nivel_id") REFERENCES "nivel_activo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- E6 · el indice de idempotencia, con NULLS NOT DISTINCT (PostgreSQL 15+).
--
-- Prisma no lo sabe expresar, asi que el indice que genero arriba se reemplaza. Sin esto,
-- las filas con `servidor` o `repo_github` nulos —que son justo las de los servicios que
-- nadie documento— se duplicarian en cada importacion.
DROP INDEX "despliegue_repo_github_ambiente_servidor_key";
CREATE UNIQUE INDEX "despliegue_repo_github_ambiente_servidor_key"
  ON "despliegue" ("repo_github", "ambiente", "servidor")
  NULLS NOT DISTINCT;

-- D8 · los tres niveles de grado 1. Valores cerrados: el nivel 1 no separa razones
-- sociales, separa naturalezas de activo.
INSERT INTO "nivel_activo" ("grado", "nombre", "padre_id", "clase", "orden", "activo") VALUES
  (1, 'EMPRESA',   NULL, 'EMPRESA',   1, true),
  (1, 'PRODUCTOS', NULL, 'PRODUCTOS', 2, true),
  (1, 'PROYECTOS', NULL, 'PROYECTOS', 3, true);

-- La plantilla minima de un producto o proyecto. Es la lista del requerimiento tal cual:
-- «un producto o proyecto tiene AL MENOS esta configuracion».
--
-- `obligatorio = false` solo en la documentacion publica: un producto interno puede no
-- tenerla legitimamente, y marcarla obligatoria produciria un faltante permanente que nadie
-- puede resolver — que es la forma mas rapida de que la gente deje de mirar los faltantes.
INSERT INTO "plantilla_nivel" ("clase_nivel", "nombre_nivel_3", "activo_esperado", "obligatorio", "orden") VALUES
  ('PRODUCTOS', 'Codigo Fuente',              'Repositorio de codigo fuente', true,  1),
  ('PRODUCTOS', 'Ambientes',                  'Desarrollo',                   true,  2),
  ('PRODUCTOS', 'Ambientes',                  'Staging',                      true,  3),
  ('PRODUCTOS', 'Ambientes',                  'Produccion',                   true,  4),
  ('PRODUCTOS', 'Dependencias o Relacionados','Activos de los que depende',   true,  5),
  ('PRODUCTOS', 'Documentacion',              'Privada',                      true,  6),
  ('PRODUCTOS', 'Documentacion',              'Confidencial',                 true,  7),
  ('PRODUCTOS', 'Documentacion',              'Publica',                      false, 8),
  ('PROYECTOS', 'Codigo Fuente',              'Repositorio de codigo fuente', true,  1),
  ('PROYECTOS', 'Ambientes',                  'Desarrollo',                   true,  2),
  ('PROYECTOS', 'Ambientes',                  'Staging',                      true,  3),
  ('PROYECTOS', 'Ambientes',                  'Produccion',                   true,  4),
  ('PROYECTOS', 'Dependencias o Relacionados','Activos de los que depende',   true,  5),
  ('PROYECTOS', 'Documentacion',              'Privada',                      true,  6),
  ('PROYECTOS', 'Documentacion',              'Confidencial',                 true,  7),
  ('PROYECTOS', 'Documentacion',              'Publica',                      false, 8);
