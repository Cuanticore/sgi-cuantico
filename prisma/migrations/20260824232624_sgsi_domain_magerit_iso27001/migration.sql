-- CreateEnum
CREATE TYPE "tipo_evidencia" AS ENUM ('ENLACE', 'ARCHIVO', 'NOTA');

-- CreateEnum
CREATE TYPE "ternario" AS ENUM ('SI', 'NO', 'POR_DEFINIR');

-- CreateEnum
CREATE TYPE "origen_riesgo" AS ENUM ('GENERADO', 'EXCEPCION');

-- CreateEnum
CREATE TYPE "tipo_accion" AS ENUM ('MITIGAR', 'TRANSFERIR', 'EVITAR', 'ACEPTAR');

-- CreateEnum
CREATE TYPE "estado_accion" AS ENUM ('NO_INICIADA', 'EN_EJECUCION', 'EN_VERIFICACION', 'CERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "verificacion_eficacia" AS ENUM ('PENDIENTE', 'VERIFICADA_EFICAZ', 'VERIFICADA_NO_EFICAZ', 'NO_APLICA');

-- CreateTable
CREATE TABLE "dimension" (
    "id" SERIAL NOT NULL,
    "codigo" CHAR(1) NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "dimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala_valor" (
    "id" SERIAL NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "escala_valor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala_degradacion" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "factor" DECIMAL(4,2) NOT NULL,
    "lectura" TEXT,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "escala_degradacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala_frecuencia" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "veces_ano" DECIMAL(8,4) NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "escala_frecuencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala_madurez" (
    "id" SERIAL NOT NULL,
    "nivel" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "eficacia" DECIMAL(4,3) NOT NULL,
    "lectura" TEXT,

    CONSTRAINT "escala_madurez_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "umbral_impacto" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "desde" DECIMAL(9,4) NOT NULL,
    "hasta" DECIMAL(9,4) NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "umbral_impacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "umbral_riesgo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "desde" DECIMAL(12,4) NOT NULL,
    "hasta" DECIMAL(12,4) NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "umbral_riesgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relevancia_control" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "peso" INTEGER NOT NULL,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "criterio" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "relevancia_control_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criterio_aceptacion" (
    "id" SERIAL NOT NULL,
    "umbral_riesgo_id" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "plazo_plan" TEXT NOT NULL,
    "plazo_ejecucion" TEXT NOT NULL,
    "aprueba" TEXT NOT NULL,
    "ratificado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "criterio_aceptacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametro" (
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "descripcion" TEXT,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametro_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "area" (
    "id" SERIAL NOT NULL,
    "prefijo" CHAR(3) NOT NULL,
    "nombre" TEXT NOT NULL,
    "lider_cargo_id" INTEGER,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargo_responsable" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "cargo_responsable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "protegido" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ubicacion" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "protegido" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ubicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entorno" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "protegido" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "entorno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_magerit" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "abreviatura" CHAR(3) NOT NULL,
    "es_normativo" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "tipo_magerit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtipo_magerit" (
    "id" SERIAL NOT NULL,
    "tipo_id" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "es_normativo" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subtipo_magerit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenaza" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "frecuencia_id" INTEGER NOT NULL,
    "nota_aplicacion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "amenaza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenaza_tipo" (
    "amenaza_id" INTEGER NOT NULL,
    "tipo_id" INTEGER NOT NULL,
    "aplica" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "amenaza_tipo_pkey" PRIMARY KEY ("amenaza_id","tipo_id")
);

-- CreateTable
CREATE TABLE "amenaza_degradacion" (
    "amenaza_id" INTEGER NOT NULL,
    "dimension_id" INTEGER NOT NULL,
    "degradacion_id" INTEGER NOT NULL,
    "reasignada_desde" CHAR(1),

    CONSTRAINT "amenaza_degradacion_pkey" PRIMARY KEY ("amenaza_id","dimension_id")
);

-- CreateTable
CREATE TABLE "dominio_anexo_a" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "dominio_anexo_a_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacidad_operativa" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_corto" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "capacidad_operativa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "dominio_id" INTEGER NOT NULL,
    "capacidad_id" INTEGER NOT NULL,
    "aplica" BOOLEAN NOT NULL DEFAULT true,
    "linea_base_id" INTEGER,
    "actual_id" INTEGER,
    "objetivo_id" INTEGER,
    "evidencia" TEXT NOT NULL,
    "responsable_id" INTEGER,
    "fecha_objetivo" DATE,
    "funcion_control" TEXT,

    CONSTRAINT "control_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_amenaza" (
    "amenaza_id" INTEGER NOT NULL,
    "control_id" INTEGER NOT NULL,
    "relevancia_id" INTEGER NOT NULL,

    CONSTRAINT "control_amenaza_pkey" PRIMARY KEY ("amenaza_id","control_id")
);

-- CreateTable
CREATE TABLE "evidencia" (
    "id" SERIAL NOT NULL,
    "control_id" INTEGER NOT NULL,
    "tipo" "tipo_evidencia" NOT NULL,
    "texto" TEXT NOT NULL,
    "es_base" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creada_por" TEXT,

    CONSTRAINT "evidencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activo" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(12),
    "codigo_heredado" VARCHAR(50),
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "area_id" INTEGER NOT NULL,
    "tipo_id" INTEGER NOT NULL,
    "subtipo_id" INTEGER NOT NULL,
    "propietario_id" INTEGER NOT NULL,
    "custodio_id" INTEGER NOT NULL,
    "ubicacion_id" INTEGER,
    "entorno_id" INTEGER,
    "proveedor_id" INTEGER,
    "superior_id" INTEGER,
    "datos_cliente" "ternario" NOT NULL DEFAULT 'POR_DEFINIR',
    "datos_personales" "ternario" NOT NULL DEFAULT 'POR_DEFINIR',
    "expuesto_internet" "ternario" NOT NULL DEFAULT 'POR_DEFINIR',
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "baja_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activo_valor" (
    "activo_id" INTEGER NOT NULL,
    "dimension_id" INTEGER NOT NULL,
    "valor_id" INTEGER NOT NULL,

    CONSTRAINT "activo_valor_pkey" PRIMARY KEY ("activo_id","dimension_id")
);

-- CreateTable
CREATE TABLE "contador_codigo" (
    "area_id" INTEGER NOT NULL,
    "tipo_id" INTEGER NOT NULL,
    "ultimo_valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contador_codigo_pkey" PRIMARY KEY ("area_id","tipo_id")
);

-- CreateTable
CREATE TABLE "riesgo" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "activo_id" INTEGER NOT NULL,
    "amenaza_id" INTEGER NOT NULL,
    "origen" "origen_riesgo" NOT NULL DEFAULT 'GENERADO',
    "madurez_id" INTEGER,
    "frecuencia_id" INTEGER,
    "tratamiento_id" INTEGER,
    "estado_id" INTEGER,
    "responsable_id" INTEGER,
    "observacion" TEXT,
    "justificacion" TEXT,
    "obsoleto" BOOLEAN NOT NULL DEFAULT false,
    "obsoleto_en" TIMESTAMP(3),
    "impacto" DECIMAL(9,4),
    "riesgo_potencial" DECIMAL(12,4),
    "frecuencia_residual" DECIMAL(9,4),
    "riesgo_residual" DECIMAL(12,4),
    "calculado_en" TIMESTAMP(3),

    CONSTRAINT "riesgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "riesgo_degradacion" (
    "riesgo_id" INTEGER NOT NULL,
    "dimension_id" INTEGER NOT NULL,
    "degradacion_id" INTEGER NOT NULL,
    "justificacion" TEXT NOT NULL,

    CONSTRAINT "riesgo_degradacion_pkey" PRIMARY KEY ("riesgo_id","dimension_id")
);

-- CreateTable
CREATE TABLE "riesgo_calculo" (
    "id" BIGSERIAL NOT NULL,
    "riesgo_id" INTEGER NOT NULL,
    "entrada" JSONB NOT NULL,
    "impacto" DECIMAL(9,4) NOT NULL,
    "riesgo_potencial" DECIMAL(12,4) NOT NULL,
    "frecuencia_residual" DECIMAL(9,4) NOT NULL,
    "riesgo_residual" DECIMAL(12,4) NOT NULL,
    "calculado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "riesgo_calculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tratamiento_riesgo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "tratamiento_riesgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estado_tratamiento" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "estado_tratamiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accion_plan" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "tipo" "tipo_accion" NOT NULL,
    "control_id" INTEGER,
    "origen" TEXT NOT NULL,
    "responsable_id" INTEGER NOT NULL,
    "aprueba_id" INTEGER NOT NULL,
    "fecha_aprobacion" DATE,
    "fecha_objetivo" DATE,
    "recursos" TEXT,
    "estado" "estado_accion" NOT NULL DEFAULT 'NO_INICIADA',
    "avance" INTEGER NOT NULL DEFAULT 0,
    "evidencia" TEXT,
    "fecha_cierre" DATE,
    "madurez_alcanzada_id" INTEGER,
    "madurez_objetivo_id" INTEGER,
    "verificacion" "verificacion_eficacia" NOT NULL DEFAULT 'PENDIENTE',
    "observacion" TEXT,
    "instrumento" TEXT,
    "riesgo_remanente" TEXT,
    "justificacion_aceptacion" TEXT,
    "fecha_revision_aceptacion" DATE,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "baja_en" TIMESTAMP(3),

    CONSTRAINT "accion_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bitacora" (
    "id" BIGSERIAL NOT NULL,
    "tabla" TEXT NOT NULL,
    "registro_id" TEXT NOT NULL,
    "campo" TEXT,
    "valor_anterior" TEXT,
    "valor_nuevo" TEXT,
    "motivo" TEXT,
    "usuario" TEXT NOT NULL,
    "ocurrido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linea_base" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "creada_por" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linea_base_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dimension_codigo_key" ON "dimension"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "escala_valor_etiqueta_key" ON "escala_valor"("etiqueta");

-- CreateIndex
CREATE UNIQUE INDEX "escala_valor_valor_key" ON "escala_valor"("valor");

-- CreateIndex
CREATE UNIQUE INDEX "escala_degradacion_nombre_key" ON "escala_degradacion"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "escala_frecuencia_nombre_key" ON "escala_frecuencia"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "escala_madurez_nivel_key" ON "escala_madurez"("nivel");

-- CreateIndex
CREATE UNIQUE INDEX "umbral_impacto_nombre_key" ON "umbral_impacto"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "umbral_riesgo_nombre_key" ON "umbral_riesgo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "relevancia_control_nombre_key" ON "relevancia_control"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "criterio_aceptacion_umbral_riesgo_id_key" ON "criterio_aceptacion"("umbral_riesgo_id");

-- CreateIndex
CREATE UNIQUE INDEX "area_prefijo_key" ON "area"("prefijo");

-- CreateIndex
CREATE UNIQUE INDEX "area_nombre_key" ON "area"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "cargo_responsable_nombre_key" ON "cargo_responsable"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_nombre_key" ON "proveedor"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ubicacion_nombre_key" ON "ubicacion"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "entorno_nombre_key" ON "entorno"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_magerit_codigo_key" ON "tipo_magerit"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_magerit_abreviatura_key" ON "tipo_magerit"("abreviatura");

-- CreateIndex
CREATE UNIQUE INDEX "subtipo_magerit_tipo_id_codigo_key" ON "subtipo_magerit"("tipo_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "amenaza_codigo_key" ON "amenaza"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "dominio_anexo_a_nombre_key" ON "dominio_anexo_a"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "capacidad_operativa_nombre_key" ON "capacidad_operativa"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "control_codigo_key" ON "control"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "activo_codigo_key" ON "activo"("codigo");

-- CreateIndex
CREATE INDEX "activo_area_id_idx" ON "activo"("area_id");

-- CreateIndex
CREATE INDEX "activo_tipo_id_idx" ON "activo"("tipo_id");

-- CreateIndex
CREATE UNIQUE INDEX "riesgo_codigo_key" ON "riesgo"("codigo");

-- CreateIndex
CREATE INDEX "riesgo_obsoleto_idx" ON "riesgo"("obsoleto");

-- CreateIndex
CREATE INDEX "riesgo_riesgo_residual_idx" ON "riesgo"("riesgo_residual");

-- CreateIndex
CREATE UNIQUE INDEX "riesgo_activo_id_amenaza_id_key" ON "riesgo"("activo_id", "amenaza_id");

-- CreateIndex
CREATE INDEX "riesgo_calculo_riesgo_id_idx" ON "riesgo_calculo"("riesgo_id");

-- CreateIndex
CREATE UNIQUE INDEX "tratamiento_riesgo_nombre_key" ON "tratamiento_riesgo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "estado_tratamiento_nombre_key" ON "estado_tratamiento"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "accion_plan_codigo_key" ON "accion_plan"("codigo");

-- CreateIndex
CREATE INDEX "accion_plan_control_id_idx" ON "accion_plan"("control_id");

-- CreateIndex
CREATE INDEX "bitacora_tabla_registro_id_idx" ON "bitacora"("tabla", "registro_id");

-- CreateIndex
CREATE INDEX "bitacora_ocurrido_en_idx" ON "bitacora"("ocurrido_en");

-- CreateIndex
CREATE UNIQUE INDEX "linea_base_nombre_key" ON "linea_base"("nombre");

-- AddForeignKey
ALTER TABLE "criterio_aceptacion" ADD CONSTRAINT "criterio_aceptacion_umbral_riesgo_id_fkey" FOREIGN KEY ("umbral_riesgo_id") REFERENCES "umbral_riesgo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area" ADD CONSTRAINT "area_lider_cargo_id_fkey" FOREIGN KEY ("lider_cargo_id") REFERENCES "cargo_responsable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtipo_magerit" ADD CONSTRAINT "subtipo_magerit_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipo_magerit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenaza" ADD CONSTRAINT "amenaza_frecuencia_id_fkey" FOREIGN KEY ("frecuencia_id") REFERENCES "escala_frecuencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenaza_tipo" ADD CONSTRAINT "amenaza_tipo_amenaza_id_fkey" FOREIGN KEY ("amenaza_id") REFERENCES "amenaza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenaza_tipo" ADD CONSTRAINT "amenaza_tipo_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipo_magerit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenaza_degradacion" ADD CONSTRAINT "amenaza_degradacion_amenaza_id_fkey" FOREIGN KEY ("amenaza_id") REFERENCES "amenaza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenaza_degradacion" ADD CONSTRAINT "amenaza_degradacion_dimension_id_fkey" FOREIGN KEY ("dimension_id") REFERENCES "dimension"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenaza_degradacion" ADD CONSTRAINT "amenaza_degradacion_degradacion_id_fkey" FOREIGN KEY ("degradacion_id") REFERENCES "escala_degradacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control" ADD CONSTRAINT "control_dominio_id_fkey" FOREIGN KEY ("dominio_id") REFERENCES "dominio_anexo_a"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control" ADD CONSTRAINT "control_capacidad_id_fkey" FOREIGN KEY ("capacidad_id") REFERENCES "capacidad_operativa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control" ADD CONSTRAINT "control_linea_base_id_fkey" FOREIGN KEY ("linea_base_id") REFERENCES "escala_madurez"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control" ADD CONSTRAINT "control_actual_id_fkey" FOREIGN KEY ("actual_id") REFERENCES "escala_madurez"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control" ADD CONSTRAINT "control_objetivo_id_fkey" FOREIGN KEY ("objetivo_id") REFERENCES "escala_madurez"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control" ADD CONSTRAINT "control_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "cargo_responsable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_amenaza" ADD CONSTRAINT "control_amenaza_amenaza_id_fkey" FOREIGN KEY ("amenaza_id") REFERENCES "amenaza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_amenaza" ADD CONSTRAINT "control_amenaza_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "control"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_amenaza" ADD CONSTRAINT "control_amenaza_relevancia_id_fkey" FOREIGN KEY ("relevancia_id") REFERENCES "relevancia_control"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "control"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipo_magerit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_subtipo_id_fkey" FOREIGN KEY ("subtipo_id") REFERENCES "subtipo_magerit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_propietario_id_fkey" FOREIGN KEY ("propietario_id") REFERENCES "cargo_responsable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_custodio_id_fkey" FOREIGN KEY ("custodio_id") REFERENCES "cargo_responsable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "ubicacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_entorno_id_fkey" FOREIGN KEY ("entorno_id") REFERENCES "entorno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_superior_id_fkey" FOREIGN KEY ("superior_id") REFERENCES "activo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo_valor" ADD CONSTRAINT "activo_valor_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "activo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo_valor" ADD CONSTRAINT "activo_valor_dimension_id_fkey" FOREIGN KEY ("dimension_id") REFERENCES "dimension"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activo_valor" ADD CONSTRAINT "activo_valor_valor_id_fkey" FOREIGN KEY ("valor_id") REFERENCES "escala_valor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contador_codigo" ADD CONSTRAINT "contador_codigo_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contador_codigo" ADD CONSTRAINT "contador_codigo_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipo_magerit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo" ADD CONSTRAINT "riesgo_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "activo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo" ADD CONSTRAINT "riesgo_amenaza_id_fkey" FOREIGN KEY ("amenaza_id") REFERENCES "amenaza"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo" ADD CONSTRAINT "riesgo_madurez_id_fkey" FOREIGN KEY ("madurez_id") REFERENCES "escala_madurez"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo" ADD CONSTRAINT "riesgo_frecuencia_id_fkey" FOREIGN KEY ("frecuencia_id") REFERENCES "escala_frecuencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo" ADD CONSTRAINT "riesgo_tratamiento_id_fkey" FOREIGN KEY ("tratamiento_id") REFERENCES "tratamiento_riesgo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo" ADD CONSTRAINT "riesgo_estado_id_fkey" FOREIGN KEY ("estado_id") REFERENCES "estado_tratamiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo" ADD CONSTRAINT "riesgo_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "cargo_responsable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo_degradacion" ADD CONSTRAINT "riesgo_degradacion_riesgo_id_fkey" FOREIGN KEY ("riesgo_id") REFERENCES "riesgo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo_degradacion" ADD CONSTRAINT "riesgo_degradacion_dimension_id_fkey" FOREIGN KEY ("dimension_id") REFERENCES "dimension"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo_degradacion" ADD CONSTRAINT "riesgo_degradacion_degradacion_id_fkey" FOREIGN KEY ("degradacion_id") REFERENCES "escala_degradacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riesgo_calculo" ADD CONSTRAINT "riesgo_calculo_riesgo_id_fkey" FOREIGN KEY ("riesgo_id") REFERENCES "riesgo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accion_plan" ADD CONSTRAINT "accion_plan_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "control"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accion_plan" ADD CONSTRAINT "accion_plan_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "cargo_responsable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accion_plan" ADD CONSTRAINT "accion_plan_aprueba_id_fkey" FOREIGN KEY ("aprueba_id") REFERENCES "cargo_responsable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accion_plan" ADD CONSTRAINT "accion_plan_madurez_alcanzada_id_fkey" FOREIGN KEY ("madurez_alcanzada_id") REFERENCES "escala_madurez"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accion_plan" ADD CONSTRAINT "accion_plan_madurez_objetivo_id_fkey" FOREIGN KEY ("madurez_objetivo_id") REFERENCES "escala_madurez"("id") ON DELETE SET NULL ON UPDATE CASCADE;
