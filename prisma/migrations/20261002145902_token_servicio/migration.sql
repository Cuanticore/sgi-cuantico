-- Fase 2 de hoja-de-vida-api-servicio · D3 · TokenServicio es EnlaceFirma con alcance.
--
-- `prisma migrate dev` detectó, además de esta tabla, dos cambios de deriva PREEXISTENTES y
-- ajenos a esta tarea (un `DROP INDEX accion_plan_clase_activa_idx` y un `RENAME CONSTRAINT`
-- sobre `plantilla_nivel`): el schema ya no los declara pero la historia de migraciones sí los
-- dejó. Se retiraron de este archivo a propósito — no son parte de la Fase 2 y mezclarlos acá
-- los habría aplicado sin que nadie los revisara. Quedan para quien toque esos modelos.

-- CreateTable
CREATE TABLE "token_servicio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "prefijo" TEXT NOT NULL,
    "alcance" TEXT[],
    "expira_en" TIMESTAMP(3) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT NOT NULL,
    "ultimo_uso_en" TIMESTAMP(3),
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_en" TIMESTAMP(3),
    "revocado_en" TIMESTAMP(3),
    "motivo_revocacion" TEXT,

    CONSTRAINT "token_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_servicio_token_hash_key" ON "token_servicio"("token_hash");

-- CreateIndex
CREATE INDEX "token_servicio_expira_en_idx" ON "token_servicio"("expira_en");
