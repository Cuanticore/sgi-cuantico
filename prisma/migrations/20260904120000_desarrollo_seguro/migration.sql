-- Desarrollo seguro (REQ-SIG-08).
--
-- Ocho entidades nuevas y CERO tablas para los 73 items: el catalogo es un `ContenidoSig`
-- de tipo VERIFICACION, verificar una puerta es una `Asignacion` del modulo A y el
-- resultado por item es la `RespuestaItem` que ya existe. Lo unico que se agrega es cuatro
-- columnas a `item_verificacion`. Construir un segundo motor de listas de verificacion
-- seria el error mas caro del paquete.
--
-- `sistema.proyecto_id` nace SIN llave foranea: `Proyecto` no existe todavia como entidad.
-- Es el mismo patron que uso `obligacion.alcance_nivel_activo_id` antes de que
-- `nivel_activo` existiera.
--
-- Al final se siembran los parametros de G6 y G7. Ninguno de esos numeros vive en el
-- codigo, y esa es la razon por la que estan aca: cambiar el plazo de remediacion de
-- severidad alta no debe requerir un despliegue.
-- CreateEnum
CREATE TYPE "fase_sistema" AS ENUM ('F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7');

-- CreateEnum
CREATE TYPE "rol_tratamiento" AS ENUM ('RESPONSABLE', 'ENCARGADO');

-- CreateEnum
CREATE TYPE "puerta" AS ENUM ('P1', 'P2', 'P3', 'P4', 'P5', 'P6');

-- CreateEnum
CREATE TYPE "resultado_puerta" AS ENUM ('PENDIENTE', 'SUPERADA', 'SUPERADA_CON_EXCEPCION', 'NO_SUPERADA');

-- AlterTable
ALTER TABLE "item_verificacion" ADD COLUMN     "aplica_a" TEXT NOT NULL DEFAULT 'AMBOS',
ADD COLUMN     "control_anexo_a" TEXT,
ADD COLUMN     "evidencia_esperada" TEXT,
ADD COLUMN     "puerta" "puerta";

-- CreateTable
CREATE TABLE "sistema" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" TEXT NOT NULL,
    "producto_id" INTEGER,
    "proyecto_id" INTEGER,
    "cliente_ref" TEXT,
    "criticidad" INTEGER,
    "clasificacion_id" INTEGER,
    "trata_datos_personales" BOOLEAN NOT NULL DEFAULT false,
    "rol_tratamiento" "rol_tratamiento",
    "rto_objetivo" INTEGER,
    "rpo_objetivo" INTEGER,
    "propietario_id" INTEGER,
    "responsable_tecnico_id" INTEGER,
    "activo_id" INTEGER,
    "contratado" BOOLEAN NOT NULL DEFAULT false,
    "fase_actual" "fase_sistema" NOT NULL DEFAULT 'F0',
    "abierta_en" TIMESTAMP(3),
    "cerrada_en" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sistema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puerta_sistema" (
    "id" SERIAL NOT NULL,
    "sistema_id" INTEGER NOT NULL,
    "puerta" "puerta" NOT NULL,
    "resultado" "resultado_puerta" NOT NULL DEFAULT 'PENDIENTE',
    "fecha" TIMESTAMP(3),
    "verificado_por_id" INTEGER,
    "autoriza_id" INTEGER,
    "evidencia_id" INTEGER,
    "excepcion_id" INTEGER,
    "observacion" TEXT,

    CONSTRAINT "puerta_sistema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excepcion_seguridad" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "sistema_id" INTEGER NOT NULL,
    "puerta" "puerta",
    "justificacion" TEXT NOT NULL,
    "evaluacion_riesgo" TEXT NOT NULL,
    "aprobada_por_id" INTEGER,
    "fecha_aprobacion" DATE NOT NULL,
    "fecha_cierre" DATE NOT NULL,
    "cerrada_en" TIMESTAMP(3),
    "cerrada_por_id" INTEGER,
    "nota_cierre" TEXT,

    CONSTRAINT "excepcion_seguridad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisito_seguridad" (
    "id" SERIAL NOT NULL,
    "sistema_id" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "origen" TEXT,
    "prioridad" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PROPUESTO',
    "verificado_en_id" INTEGER,
    "observacion" TEXT,

    CONSTRAINT "requisito_seguridad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prueba_seguridad" (
    "id" SERIAL NOT NULL,
    "sistema_id" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "version_probada" TEXT,
    "fecha" DATE NOT NULL,
    "ejecutor_id" INTEGER,
    "ejecutor_externo" TEXT,
    "criticos" INTEGER NOT NULL DEFAULT 0,
    "altos" INTEGER NOT NULL DEFAULT 0,
    "medios" INTEGER NOT NULL DEFAULT 0,
    "bajos" INTEGER NOT NULL DEFAULT 0,
    "evidencia_id" INTEGER,
    "observacion" TEXT,

    CONSTRAINT "prueba_seguridad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tratamiento_datos_personales" (
    "id" SERIAL NOT NULL,
    "sistema_id" INTEGER NOT NULL,
    "categoria" TEXT NOT NULL,
    "sensibles" BOOLEAN NOT NULL DEFAULT false,
    "finalidad" TEXT NOT NULL,
    "base_legitimacion" TEXT NOT NULL,
    "titulares" TEXT,
    "volumen" TEXT,
    "ubicacion_almacenamiento" TEXT,
    "transferencia_internacional" BOOLEAN NOT NULL DEFAULT false,
    "pais_destino" TEXT,
    "garantia_aplicada" TEXT,
    "retencion" TEXT,
    "responsable_id" INTEGER,

    CONSTRAINT "tratamiento_datos_personales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liberacion" (
    "id" SERIAL NOT NULL,
    "sistema_id" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" TEXT NOT NULL,
    "solicitud_id" INTEGER,
    "autoriza_id" INTEGER,
    "ejecuta_id" INTEGER,
    "plan_reversion" BOOLEAN NOT NULL DEFAULT false,
    "resultado" TEXT,
    "observacion" TEXT,

    CONSTRAINT "liberacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "componente_tercero" (
    "id" SERIAL NOT NULL,
    "sistema_id" INTEGER NOT NULL,
    "organizacion_id" INTEGER,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT,
    "funcion" TEXT,
    "criticidad" TEXT,
    "licencia" TEXT,
    "version" TEXT,
    "ultima_evaluacion" DATE,
    "vulnerabilidades_conocidas" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'VIGENTE',

    CONSTRAINT "componente_tercero_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sistema_codigo_key" ON "sistema"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "puerta_sistema_sistema_id_puerta_key" ON "puerta_sistema"("sistema_id", "puerta");

-- CreateIndex
CREATE UNIQUE INDEX "excepcion_seguridad_codigo_key" ON "excepcion_seguridad"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "requisito_seguridad_sistema_id_codigo_key" ON "requisito_seguridad"("sistema_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "prueba_seguridad_sistema_id_codigo_key" ON "prueba_seguridad"("sistema_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "liberacion_sistema_id_version_key" ON "liberacion"("sistema_id", "version");

-- AddForeignKey
ALTER TABLE "sistema" ADD CONSTRAINT "sistema_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sistema" ADD CONSTRAINT "sistema_propietario_id_fkey" FOREIGN KEY ("propietario_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sistema" ADD CONSTRAINT "sistema_responsable_tecnico_id_fkey" FOREIGN KEY ("responsable_tecnico_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sistema" ADD CONSTRAINT "sistema_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "activo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puerta_sistema" ADD CONSTRAINT "puerta_sistema_sistema_id_fkey" FOREIGN KEY ("sistema_id") REFERENCES "sistema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puerta_sistema" ADD CONSTRAINT "puerta_sistema_verificado_por_id_fkey" FOREIGN KEY ("verificado_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puerta_sistema" ADD CONSTRAINT "puerta_sistema_autoriza_id_fkey" FOREIGN KEY ("autoriza_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puerta_sistema" ADD CONSTRAINT "puerta_sistema_excepcion_id_fkey" FOREIGN KEY ("excepcion_id") REFERENCES "excepcion_seguridad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excepcion_seguridad" ADD CONSTRAINT "excepcion_seguridad_sistema_id_fkey" FOREIGN KEY ("sistema_id") REFERENCES "sistema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excepcion_seguridad" ADD CONSTRAINT "excepcion_seguridad_aprobada_por_id_fkey" FOREIGN KEY ("aprobada_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excepcion_seguridad" ADD CONSTRAINT "excepcion_seguridad_cerrada_por_id_fkey" FOREIGN KEY ("cerrada_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisito_seguridad" ADD CONSTRAINT "requisito_seguridad_sistema_id_fkey" FOREIGN KEY ("sistema_id") REFERENCES "sistema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisito_seguridad" ADD CONSTRAINT "requisito_seguridad_verificado_en_id_fkey" FOREIGN KEY ("verificado_en_id") REFERENCES "prueba_seguridad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prueba_seguridad" ADD CONSTRAINT "prueba_seguridad_sistema_id_fkey" FOREIGN KEY ("sistema_id") REFERENCES "sistema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prueba_seguridad" ADD CONSTRAINT "prueba_seguridad_ejecutor_id_fkey" FOREIGN KEY ("ejecutor_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tratamiento_datos_personales" ADD CONSTRAINT "tratamiento_datos_personales_sistema_id_fkey" FOREIGN KEY ("sistema_id") REFERENCES "sistema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tratamiento_datos_personales" ADD CONSTRAINT "tratamiento_datos_personales_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liberacion" ADD CONSTRAINT "liberacion_sistema_id_fkey" FOREIGN KEY ("sistema_id") REFERENCES "sistema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liberacion" ADD CONSTRAINT "liberacion_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liberacion" ADD CONSTRAINT "liberacion_autoriza_id_fkey" FOREIGN KEY ("autoriza_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liberacion" ADD CONSTRAINT "liberacion_ejecuta_id_fkey" FOREIGN KEY ("ejecuta_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componente_tercero" ADD CONSTRAINT "componente_tercero_sistema_id_fkey" FOREIGN KEY ("sistema_id") REFERENCES "sistema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- G6 · la severidad que bloquea es un PARAMETRO, no un numero en el codigo. Igual que los
-- umbrales de las metricas y los plazos por tipo de hallazgo.
--
-- G7 · los plazos de remediacion por severidad, con los valores de FOR-LCO-05 como carga
-- inicial. **Corren desde la notificacion, no desde el hallazgo**, y el nombre de la clave
-- lo dice para que nadie lo cuente distinto.
--
-- «baja» es 0 a proposito: FOR-LCO-05 dice «siguiente entrega planificada», que no es un
-- numero de dias. Cero significa «sin plazo en dias» y la pantalla lo lee asi; poner 90 o
-- 180 seria inventar un plazo que el formato no fijo.
INSERT INTO "parametro" ("clave", "valor", "descripcion", "actualizado") VALUES
  ('desarrollo_severidad_bloquea', 'ALTOS',
   'Desde que severidad una prueba de seguridad bloquea la liberacion: CRITICOS, ALTOS, MEDIOS o BAJOS. Un hallazgo de esa severidad o peor bloquea salvo excepcion aprobada.', now()),
  ('desarrollo_plazo_critica_horas', '72',
   'Plazo de remediacion de severidad critica, en HORAS, desde la notificacion (FOR-LCO-05).', now()),
  ('desarrollo_plazo_alta_dias', '15',
   'Plazo de remediacion de severidad alta, en dias, desde la notificacion (FOR-LCO-05).', now()),
  ('desarrollo_plazo_media_dias', '60',
   'Plazo de remediacion de severidad media, en dias, desde la notificacion (FOR-LCO-05).', now()),
  ('desarrollo_plazo_baja_dias', '0',
   'Severidad baja: FOR-LCO-05 dice «siguiente entrega planificada», que no es un numero de dias. Cero significa sin plazo en dias.', now())
ON CONFLICT ("clave") DO NOTHING;
