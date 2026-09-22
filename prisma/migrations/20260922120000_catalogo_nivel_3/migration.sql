-- El VOCABULARIO de nombres de grado 3, por clase. Una decision, no un residuo.
--
-- Hasta hoy la unica lista de nombres de grado 3 que existia era `plantilla_nivel`, que tiene
-- cuatro por clase y los cuatro divergen del arbol real (`CODIGO FUENTE` contra `CÓDIGO FUENTE`,
-- `AMBIENTES` contra los tres ambientes que de verdad se usan). El selector de Nivel 3 de la
-- ficha no tenia entonces nada que ofrecer salvo los hijos que la rama ya tuviera: bajo
-- `PROYECTOS / INC`, dos.
--
-- La siembra se DERIVA DEL ARBOL y no viene escrita a mano. Dos razones, y la segunda es la que
-- importa: una lista escrita aqui seria la de la base donde se leyo —5432, el 22/09/2026— y esta
-- migracion tiene que correr tambien contra produccion, que puede no tener lo mismo. Derivarla
-- hace que cada base se catalogue a si misma. La de mas: 52 filas a mano son 52 oportunidades de
-- escribir mal una tilde, en la tabla que existe justamente para que las tildes dejen de bailar.
CREATE TABLE "catalogo_nivel_3" (
    "id"     SERIAL       NOT NULL,
    "clase"  "clase_nivel" NOT NULL,
    "nombre" TEXT         NOT NULL,
    "orden"  INTEGER      NOT NULL DEFAULT 0,
    "activo" BOOLEAN      NOT NULL DEFAULT true,

    CONSTRAINT "catalogo_nivel_3_pkey" PRIMARY KEY ("id")
);

-- (clase, nombre) y no solo (nombre): `DOCUMENTACION` vive en las tres clases, y retirarla de
-- PRODUCTOS no puede retirarla de EMPRESA porque son dos decisiones distintas.
CREATE UNIQUE INDEX "catalogo_nivel_3_clase_nombre_key"
  ON "catalogo_nivel_3"("clase", "nombre");

-- 1 · El vocabulario que el arbol ya usa.
--
-- La clase sale de la RAIZ, subiendo por `padre_id` — los grados 2 y 3 no la guardan, y por eso
-- el JOIN sube dos escalones en vez de leerla del nivel 2. Un nivel 3 cuya cadena no llegue a una
-- raiz con clase NO entra: es una rama rota, y catalogarla bajo una clase adivinada meteria la
-- adivinanza en el vocabulario de todos.
--
-- `upper(btrim(...))` porque el arbol todavia no esta estandarizado cuando esto corre: 104 de los
-- 114 nodos de grado 3 estan fuera de mayuscula. Es la mitad de `normalizarNombreNivel` que
-- importa aqui; el colapso de espacios internos lo garantizan los escritores.
INSERT INTO "catalogo_nivel_3" ("clase", "nombre")
SELECT DISTINCT r."clase", upper(btrim(n3."nombre"))
FROM "nivel_activo" n3
  JOIN "nivel_activo" n2 ON n2."id" = n3."padre_id"
  JOIN "nivel_activo" r  ON r."id"  = n2."padre_id"
WHERE n3."grado" = 3
  AND r."clase" IS NOT NULL
ON CONFLICT ("clase", "nombre") DO NOTHING;

-- 2 · Los nombres que la plantilla minima va a necesitar.
--
-- Van explicitos y no derivados porque la siguiente migracion pone una llave foranea de
-- `plantilla_nivel` hacia aqui, y `plantilla_nivel` se siembra en
-- `20260904090000_gestion_tecnologica`. Sobre una base VACIA —que es como corre
-- `verificar:migraciones`— el paso 1 no inserta nada, porque no hay arbol del cual derivar, y la
-- llave foranea reventaria contra un catalogo vacio. Estas seis por clase son lo que hace que esa
-- verificacion signifique algo.
--
-- `AMBIENTES` de la plantilla se abre en tres. No es un capricho de nomenclatura: esa fila lleva
-- TRES activos esperados —Desarrollo, Staging, Produccion— y el arbol real tiene tres nodos
-- distintos. Dejarla en uno solo pondria «Desarrollo» como activo esperado de «Ambiente de
-- produccion», que no significa nada.
INSERT INTO "catalogo_nivel_3" ("clase", "nombre", "orden") VALUES
  ('PRODUCTOS', 'CÓDIGO FUENTE',          1),
  ('PRODUCTOS', 'AMBIENTE DE DESARROLLO', 2),
  ('PRODUCTOS', 'AMBIENTE DE PRUEBAS',    3),
  ('PRODUCTOS', 'AMBIENTE DE PRODUCCIÓN', 4),
  ('PRODUCTOS', 'DEPENDENCIAS',           5),
  ('PRODUCTOS', 'DOCUMENTACIÓN',          6),
  ('PROYECTOS', 'CÓDIGO FUENTE',          1),
  ('PROYECTOS', 'AMBIENTE DE DESARROLLO', 2),
  ('PROYECTOS', 'AMBIENTE DE PRUEBAS',    3),
  ('PROYECTOS', 'AMBIENTE DE PRODUCCIÓN', 4),
  ('PROYECTOS', 'DEPENDENCIAS',           5),
  ('PROYECTOS', 'DOCUMENTACIÓN',          6)
ON CONFLICT ("clase", "nombre") DO NOTHING;
