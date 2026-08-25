-- CreateIndex
CREATE UNIQUE INDEX "escala_degradacion_orden_key" ON "escala_degradacion"("orden");

-- CreateIndex
CREATE UNIQUE INDEX "escala_frecuencia_orden_key" ON "escala_frecuencia"("orden");

-- CreateIndex
CREATE UNIQUE INDEX "umbral_impacto_orden_key" ON "umbral_impacto"("orden");

-- CreateIndex
CREATE UNIQUE INDEX "umbral_riesgo_orden_key" ON "umbral_riesgo"("orden");

