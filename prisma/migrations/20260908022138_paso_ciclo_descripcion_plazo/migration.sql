-- AlterTable
ALTER TABLE "paso_ciclo" ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "plazo" TEXT;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- El QUÉ y el CUÁNDO de cada paso, tomados de PRO-TAL-03 y del lienzo de desvinculación.
--
-- La pantalla mostraba «Revocación de accesos» y nada más. Quien nunca ejecutó el
-- procedimiento no tiene cómo saber que revocar incluye las sesiones activas y el gestor de
-- contraseñas, ni que el acta de borrado va DESPUÉS de la devolución. Un paso sin su
-- descripción es una casilla que se marca por costumbre.
--
-- El plazo es TEXTO y no una cantidad de días: PRO-TAL-03 fija hitos relativos entre sí
-- —«tras la devolución», «antes de liquidar»— y convertirlos a números sería inventar una
-- precisión que el procedimiento no da. La única excepción es la revocación, que sí tiene
-- un plazo contado: el mismo día.
-- ─────────────────────────────────────────────────────────────────────────────────────────

UPDATE "paso_ciclo" SET
  "descripcion" = 'Deshabilitar la cuenta, revocar sesiones activas y retirar del gestor de contraseñas.',
  "plazo" = 'El mismo día'
WHERE "codigo" = 'DES-SEG-1';

UPDATE "paso_ciclo" SET
  "descripcion" = 'Portátil, token de acceso, llave de oficina y cualquier otro activo entregado.',
  "plazo" = 'A la terminación'
WHERE "codigo" = 'DES-SEG-2';

UPDATE "paso_ciclo" SET
  "descripcion" = 'Borrado por un medio que impida la reconstrucción, con constancia y evidencia.',
  "plazo" = 'Tras la devolución'
WHERE "codigo" = 'DES-SEG-3';

UPDATE "paso_ciclo" SET
  "descripcion" = 'Confidencialidad por cinco años, secretos empresariales y código fuente de forma indefinida, y datos personales mientras subsista el deber legal.',
  "plazo" = 'A la terminación'
WHERE "codigo" = 'DES-SEG-4';

UPDATE "paso_ciclo" SET
  "descripcion" = 'Paz y salvo del líder del proceso —sin pendientes de información ni entregables— y liquidación con las desafiliaciones.',
  "plazo" = 'Antes de liquidar'
WHERE "codigo" = 'DES-ADM-N1';

UPDATE "paso_ciclo" SET
  "descripcion" = 'No hay liquidación: se tramita la terminación del contrato de prestación de servicios.',
  "plazo" = 'Según el contrato'
WHERE "codigo" = 'DES-ADM-C1';

-- El paso que el lienzo dibuja y no existía. Un activo cuyo custodio se fue no queda «sin
-- dueño» por sí solo: sigue apuntando a una persona retirada hasta que alguien lo suelta, y
-- es el hallazgo más común de la revisión trimestral de inventario.
INSERT INTO "paso_ciclo" ("ciclo", "grupo", "aplica_a", "codigo", "texto", "descripcion", "plazo", "fuente", "orden", "activo") VALUES
  ('DESVINCULACION','SEGURIDAD','TODOS','DES-SEG-5','Retiro del inventario de activos a cargo',
   'Los activos asignados quedan sin custodio y vuelven al pool disponible.',
   'Tras la devolución','PRO-TAL-03 · A.5.11',5,true);

-- ── Vinculación: sólo el CUÁNDO, que es lo que el procedimiento fija ─────────────────────
-- Los siete de seguridad van antes del primer acceso; PRO-TAL-01 es explícito: «ningún
-- acceso se habilita antes de que estas obligaciones estén suscritas».
UPDATE "paso_ciclo" SET "plazo" = 'Antes del primer acceso'
WHERE "ciclo" = 'VINCULACION' AND "grupo" = 'SEGURIDAD';
