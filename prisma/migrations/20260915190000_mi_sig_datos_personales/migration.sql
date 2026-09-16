-- REQ-SIG-25 · lo que la persona mantiene desde Mi SIG: sus datos, sus hijos y la
-- autoevaluación de su puesto de trabajo (FOR-SIG-13).
--
-- ESCRITA A MANO, no generada por `prisma migrate dev`: el equipo donde se desarrolló esta
-- tanda no tiene base de datos. Sigue el patrón que Prisma emite para el mismo cambio y el
-- esquema pasa `prisma validate`. **No se ejecutó contra ninguna base.**
--
-- ADITIVA: agrega cinco columnas nulables a `persona` y crea dos tablas. No modifica ni una
-- fila existente, así que una base con el código anterior sigue funcionando igual.
--
-- SOBRE LOS DATOS QUE ENTRAN ACÁ. La EPS revela afiliación al sistema de salud y la fecha de
-- nacimiento permite inferir edad; los hijos son datos personales de terceros —menores, casi
-- siempre— que no firmaron nada. Los tres deben quedar inscritos en el inventario de
-- tratamientos (`TratamientoDatosPersonales`) con su finalidad, y ninguno sale en las
-- exportaciones del censo. El esquema los recoge al mínimo a propósito.

-- CreateEnum
CREATE TYPE "genero" AS ENUM ('FEMENINO', 'MASCULINO', 'NO_DECLARA');

-- AlterTable
ALTER TABLE "persona" ADD COLUMN     "fecha_nacimiento" DATE,
ADD COLUMN     "eps" TEXT,
ADD COLUMN     "arl" TEXT,
ADD COLUMN     "foto_clave" TEXT,
ADD COLUMN     "foto_actualizada_en" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "hijo_colaborador" (
    "id" SERIAL NOT NULL,
    "persona_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha_nacimiento" DATE NOT NULL,
    "genero" "genero" NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hijo_colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autoevaluacion_puesto" (
    "id" SERIAL NOT NULL,
    "persona_id" INTEGER NOT NULL,
    "respondida_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "formulario_version" TEXT NOT NULL,
    "respuestas" JSONB NOT NULL,
    "observaciones" TEXT,

    CONSTRAINT "autoevaluacion_puesto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hijo_colaborador_persona_id_idx" ON "hijo_colaborador"("persona_id");

-- CreateIndex
CREATE INDEX "autoevaluacion_puesto_persona_id_idx" ON "autoevaluacion_puesto"("persona_id");

-- AddForeignKey
-- CASCADE en los hijos: son un dato DE la persona y no tienen vida propia. Si la fila de la
-- persona desapareciera de verdad, conservarlos seria guardar datos de un menor sin ningun
-- titular al que respondan.
ALTER TABLE "hijo_colaborador" ADD CONSTRAINT "hijo_colaborador_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT en las autoevaluaciones: son EVIDENCIA de un requisito anual y sobreviven a todo.
-- Quien sale de la organizacion se inactiva, nunca se borra, asi que esto nunca se dispara —
-- y si alguna vez se intentara, negarse es la respuesta correcta.
ALTER TABLE "autoevaluacion_puesto" ADD CONSTRAINT "autoevaluacion_puesto_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
