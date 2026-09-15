-- Qué cuentas del dominio encarna un activo de tipo [P] Personal.
--
-- ESCRITA A MANO, no generada por `prisma migrate dev`: el equipo donde se desarrolló esta
-- tanda no tiene base de datos. El SQL sigue el patrón que Prisma emite para el mismo
-- cambio de esquema (ver 20260915073050_criticidad_negocio), y el esquema pasa
-- `prisma validate`. **No se ejecutó contra ninguna base**: la primera corrida es la
-- verificación real, y conviene hacerla en desarrollo antes que en producción.
--
-- No toca ninguna tabla existente: sólo crea `activo_persona` y sus dos llaves foráneas.
-- Es aditiva, así que una base sin esta tabla y el código anterior siguen funcionando.

-- CreateTable
CREATE TABLE "activo_persona" (
    "activo_id" INTEGER NOT NULL,
    "persona_id" INTEGER NOT NULL,
    "desde" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activo_persona_pkey" PRIMARY KEY ("activo_id","persona_id")
);

-- CreateIndex
CREATE INDEX "activo_persona_persona_id_idx" ON "activo_persona"("persona_id");

-- AddForeignKey
-- CASCADE sobre el activo: esto es un vínculo, no un hecho histórico. El único borrado
-- real de activos es la carga completa del consolidado, que vacía la tabla; sin el cascade
-- esa carga abortaría contra esta llave.
ALTER TABLE "activo_persona" ADD CONSTRAINT "activo_persona_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "activo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT sobre la persona: quien sale de la organización se inactiva, nunca se borra,
-- porque sus registros sostienen una auditoría.
ALTER TABLE "activo_persona" ADD CONSTRAINT "activo_persona_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
