-- CreateEnum
CREATE TYPE "ciclo_colaborador" AS ENUM ('VINCULACION', 'DESVINCULACION');

-- CreateEnum
CREATE TYPE "grupo_paso" AS ENUM ('SEGURIDAD', 'ADMINISTRATIVO');

-- CreateEnum
CREATE TYPE "aplica_a" AS ENUM ('TODOS', 'NOMINA', 'CONTRATISTA');

-- CreateTable
CREATE TABLE "paso_ciclo" (
    "id" SERIAL NOT NULL,
    "ciclo" "ciclo_colaborador" NOT NULL,
    "grupo" "grupo_paso" NOT NULL,
    "aplica_a" "aplica_a" NOT NULL DEFAULT 'TODOS',
    "codigo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "fuente" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "paso_ciclo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paso_de_colaborador" (
    "id" SERIAL NOT NULL,
    "persona_id" INTEGER NOT NULL,
    "paso_id" INTEGER NOT NULL,
    "completado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completado_por_id" INTEGER,
    "nota" TEXT,

    CONSTRAINT "paso_de_colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paso_ciclo_codigo_key" ON "paso_ciclo"("codigo");

-- CreateIndex
CREATE INDEX "paso_ciclo_ciclo_grupo_orden_idx" ON "paso_ciclo"("ciclo", "grupo", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "paso_de_colaborador_persona_id_paso_id_key" ON "paso_de_colaborador"("persona_id", "paso_id");

-- AddForeignKey
ALTER TABLE "paso_de_colaborador" ADD CONSTRAINT "paso_de_colaborador_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paso_de_colaborador" ADD CONSTRAINT "paso_de_colaborador_paso_id_fkey" FOREIGN KEY ("paso_id") REFERENCES "paso_ciclo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paso_de_colaborador" ADD CONSTRAINT "paso_de_colaborador_completado_por_id_fkey" FOREIGN KEY ("completado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- Los pasos del tramite, del lienzo `handoff_colaboradores/design/Vinculacion.dc.html`.
--
-- LOS SIETE DE SEGURIDAD VAN CON `aplicaA = TODOS`, y eso ES el criterio de aceptacion 5:
-- «cambiar el tipo de vinculacion no cambia ninguno de los siete pasos de seguridad». Con
-- este dato, el filtro por tipo solo puede recortar los administrativos — la regla la
-- sostiene la carga, no una condicion en el codigo que alguien pueda cambiar sin darse
-- cuenta.
--
-- Sobre «Afiliacion a EPS, pension, ARL y caja»: es un PASO, no un dato. El prompt prohibe
-- traer esos datos al modulo de colaboradores porque son de nomina; una casilla que dice
-- que la afiliacion se verifico no guarda ninguna EPS. La distincion importa: sin el paso,
-- el tramite administrativo de nomina queda incompleto; con el dato, la aplicacion se
-- vuelve un sistema de nomina.
-- ─────────────────────────────────────────────────────────────────────────────────────────

INSERT INTO "paso_ciclo" ("ciclo", "grupo", "aplica_a", "codigo", "texto", "fuente", "orden", "activo") VALUES
  -- Los SIETE de seguridad. Identicos para todos.
  ('VINCULACION','SEGURIDAD','TODOS','VIN-SEG-1','Verificación de antecedentes','PRO-TAL-01',1,true),
  ('VINCULACION','SEGURIDAD','TODOS','VIN-SEG-2','Acuerdo de confidencialidad','PRO-TAL-01',2,true),
  ('VINCULACION','SEGURIDAD','TODOS','VIN-SEG-3','Autorización de tratamiento de datos personales','PRO-TAL-01',3,true),
  ('VINCULACION','SEGURIDAD','TODOS','VIN-SEG-4','Aceptación de las políticas del SGSI y del uso aceptable','PRO-TAL-01',4,true),
  ('VINCULACION','SEGURIDAD','TODOS','VIN-SEG-5','Lineamientos del puesto de trabajo remoto','PRO-TAL-01 · PTR-TEC-02',5,true),
  ('VINCULACION','SEGURIDAD','TODOS','VIN-SEG-6','Verificación del equipo: cifrado, bloqueo automático y antimalware','PTR-TEC-03',6,true),
  ('VINCULACION','SEGURIDAD','TODOS','VIN-SEG-7','Inducción de seguridad de la información','POL-TAL-01',7,true),
  -- Administrativos de NOMINA.
  ('VINCULACION','ADMINISTRATIVO','NOMINA','VIN-ADM-N1','Contrato laboral suscrito','PRO-TAL-01',11,true),
  ('VINCULACION','ADMINISTRATIVO','NOMINA','VIN-ADM-N2','Afiliación a EPS, pensión, ARL y caja de compensación','PRO-TAL-01',12,true),
  ('VINCULACION','ADMINISTRATIVO','NOMINA','VIN-ADM-N3','Examen médico de ingreso','PRO-TAL-01',13,true),
  ('VINCULACION','ADMINISTRATIVO','NOMINA','VIN-ADM-N4','Registro en nómina y política de retribución','PRO-TAL-01',14,true),
  -- Administrativos de CONTRATISTA.
  ('VINCULACION','ADMINISTRATIVO','CONTRATISTA','VIN-ADM-C1','Contrato de prestación de servicios suscrito','PRO-TAL-04',11,true),
  ('VINCULACION','ADMINISTRATIVO','CONTRATISTA','VIN-ADM-C2','RUT y certificación bancaria','PRO-TAL-04',12,true),
  ('VINCULACION','ADMINISTRATIVO','CONTRATISTA','VIN-ADM-C3','Afiliación como independiente verificada','PRO-TAL-04',13,true),
  -- DESVINCULACION. Ninguno depende de otro (C4): el orden es de lectura, no de
  -- dependencia. La revocacion va PRIMERA porque PRO-TAL-03 la exige el mismo dia, sin
  -- esperar a la liquidacion ni al paz y salvo.
  ('DESVINCULACION','SEGURIDAD','TODOS','DES-SEG-1','Revocación de accesos — el mismo día de la terminación','PRO-TAL-03',1,true),
  ('DESVINCULACION','SEGURIDAD','TODOS','DES-SEG-2','Devolución de activos asignados','PRO-TAL-03 · A.5.11',2,true),
  ('DESVINCULACION','SEGURIDAD','TODOS','DES-SEG-3','Acta de borrado seguro del equipo','FOR-SIG-18 · A.8.10',3,true),
  ('DESVINCULACION','SEGURIDAD','TODOS','DES-SEG-4','Recordatorio de las obligaciones subsistentes','PRO-TAL-03',4,true),
  ('DESVINCULACION','ADMINISTRATIVO','NOMINA','DES-ADM-N1','Liquidación y paz y salvo','PRO-TAL-03',11,true),
  ('DESVINCULACION','ADMINISTRATIVO','CONTRATISTA','DES-ADM-C1','Acta de terminación del contrato','PRO-TAL-04',11,true)
ON CONFLICT ("codigo") DO NOTHING;
