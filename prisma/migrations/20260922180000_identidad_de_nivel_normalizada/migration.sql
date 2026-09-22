-- La identidad de un nivel deja de ser su nombre LITERAL y pasa a ser su nombre NORMALIZADO.
--
-- POR QUÉ. `20260916200000_identidad_de_nivel` puso `UNIQUE (grado, nombre, padre_id)` y eso no
-- alcanzó: indexa el literal. En producción convivieron `MONITOR` #13 y `Monitor` #127 **bajo el
-- mismo padre**, y `PRODUCTOS` #2 junto a `Productos` #131 en la raíz, con el índice puesto y sin
-- que nada protestara. Enderezar 105 nombres sin cerrar esa puerta es un barrido: mañana entra el
-- 106.
--
-- EL ORDEN NO ES NEGOCIABLE, Y ES EL QUE AQUELLA MIGRACIÓN YA DEJÓ ESCRITO. Esta migración
-- **falla por diseño** mientras queden dos hermanos vivos que colapsen al mismo nombre
-- normalizado. Los datos se enderezan antes, con `scripts/estandarizar-niveles.ts --aplicar`, que
-- se corrió contra la base local y contra producción el 22/09/2026. Si esto falla con una
-- violación de unicidad, la falla es correcta: ese paso no se hizo.
--
-- `WHERE activo` — Y ESTO NO ES UN DETALLE, ES LO QUE HACE QUE LA MIGRACIÓN SEA APLICABLE.
--
-- Una fusión no borra: el nodo absorbido queda `activo = false` **conservando su nombre**, que es
-- lo único que permite deshacerla. Después de estandarizar, producción tiene tres de esas
-- lápidas: `Productos` #131, `Monitor` #127 y `Mintrace` #132. Un índice sin este filtro las
-- haría chocar contra sus propios supervivientes —`Productos` y `PRODUCTOS` colapsan al mismo
-- valor— y esta migración no podría aplicarse nunca sin borrar la historia que la fusión guardó a
-- propósito.
--
-- Dicho al derecho: **una lápida no ocupa identidad.** Sólo dos nodos VIVOS bajo el mismo padre
-- se disputan un nombre.
--
-- `upper(btrim(...))` Y NO LA REGLA ENTERA. `normalizarNombreNivel` además colapsa los espacios
-- internos, y meter un `regexp_replace` aquí agrega una función que tiene que ser `IMMUTABLE` y
-- que nadie va a recordar al leer el `indexdef`. Este índice cubre los dos ejes que produjeron
-- duplicados reales —la caja y los espacios de los bordes—; el colapso de los internos lo
-- garantizan los escritores, que ya pasan todos por esa función. Queda una asimetría conocida:
-- `CÓDIGO  FUENTE` con dos espacios entraría. Ningún escritor lo produce.
--
-- LAS TILDES SIGUEN DISTINGUIENDO, a propósito. `CODIGO` y `CÓDIGO` son dos identidades, y
-- unirlas obliga a elegir qué ortografía sobrevive: eso es una decisión con dueño, no un efecto
-- secundario de un índice. `scripts/auditar-niveles.ts` §4 ya mide lo que costaría.
--
-- `NULLS NOT DISTINCT` se conserva y es lo que hace que esto sirva en el grado 1: en Postgres los
-- NULL son distintos entre sí dentro de un índice único, y las raíces tienen `padre_id NULL`. Sin
-- la cláusula, dos raíces con el mismo nombre pasan — que es EXACTAMENTE el caso `PRODUCTOS` /
-- `Productos` que originó todo esto.
--
-- VERIFICACIÓN. `scripts/verificar-fusion.ts` levanta una base efímera, le aplica estas
-- migraciones, le copia la forma real del árbol e intenta meter dos hermanos que sólo difieren en
-- la caja. Antes de esta migración: ACEPTADOS. Después: RECHAZADOS. `verificar:migraciones` no
-- puede detectarlo, porque sobre una base vacía no hay datos que hagan fallar nada.

DROP INDEX IF EXISTS "nivel_activo_identidad";

CREATE UNIQUE INDEX "nivel_activo_identidad"
  ON "nivel_activo" ("grado", upper(btrim("nombre")), "padre_id")
  NULLS NOT DISTINCT
  WHERE "activo";
