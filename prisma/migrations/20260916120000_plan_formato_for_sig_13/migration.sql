-- FOR-SIG-13 «Plan de Tratamiento y Mejora»: los campos que el formato tiene y el modelo no.
--
-- ESCRITA A MANO y **no ejecutada contra ninguna base**. Sólo agrega: un enum, tres columnas
-- nullable y una con default. No reescribe ni borra ninguna fila existente.
--
-- ── POR QUÉ CADA UNA ────────────────────────────────────────────────────────────────────
--
-- `clase` — El formato es UNA matriz con dos clases de plan: «Plan de Tratamiento de Riesgos»
-- y «Plan de Mejora». Enterrar esa distinción dentro del texto de `origen` la habría hecho
-- irrecuperable para filtrar, para contar y para volver a exportar el formato — y el formato
-- se reexporta, porque es el que el cliente llena. `origen` sigue siendo la justificación en
-- prosa que pide ISO/IEC 27001 6.1.3; la clase es un dato.
--
-- `descripcion` — El formato separa «Actividad» de «Descripción», y un auditor las lee
-- distinto: la actividad es lo que se promete, la descripción es cómo. Concatenarlas en
-- `accion` habría hecho que reexportar el formato no pudiera volver a partirlas.
--
-- `seguimiento` / `fecha_seguimiento` — No es `evidencia` y por eso no se reusa ese campo. La
-- evidencia prueba que la acción terminó; el seguimiento dice cómo iba en una fecha, y hay
-- muchos seguimientos antes de que haya una evidencia. En su propio par de columnas, además,
-- se puede contestar «¿hace cuánto que nadie mira este plan?».
--
-- ── EL DEFAULT DE `clase` NO ES NEUTRO, Y ES A PROPÓSITO ────────────────────────────────
--
-- Los 18 planes que ya existen nacieron del análisis de riesgos: todos son TRATAMIENTO. El
-- default los deja correctamente clasificados sin tocar una fila. Un default MEJORA —o una
-- columna nullable que la pantalla mostrara como «sin clasificar»— habría reclasificado en
-- silencio a todo lo que ya estaba bien.

-- ── 1 · La clase del plan ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clase_plan') THEN
    CREATE TYPE "clase_plan" AS ENUM ('TRATAMIENTO', 'MEJORA');
  END IF;
END
$$;

ALTER TABLE "accion_plan"
  ADD COLUMN IF NOT EXISTS "clase" "clase_plan" NOT NULL DEFAULT 'TRATAMIENTO';

-- ── 2 · La descripción de la actividad ─────────────────────────────────────────────────
ALTER TABLE "accion_plan"
  ADD COLUMN IF NOT EXISTS "descripcion" TEXT;

-- ── 3 · El último seguimiento ──────────────────────────────────────────────────────────
ALTER TABLE "accion_plan"
  ADD COLUMN IF NOT EXISTS "seguimiento" TEXT;

ALTER TABLE "accion_plan"
  ADD COLUMN IF NOT EXISTS "fecha_seguimiento" DATE;

-- ── 4 · Para el tablero ────────────────────────────────────────────────────────────────
--
-- El tablero filtra por clase y la pantalla de planes la muestra como columna. Con 18 filas
-- el índice no cambia nada; se crea igual porque la matriz del cliente tiene cientos de filas
-- y el día que se importe entera, este índice es la diferencia entre filtrar y recorrer.
CREATE INDEX IF NOT EXISTS "accion_plan_clase_activa_idx"
  ON "accion_plan" ("clase", "activa");
