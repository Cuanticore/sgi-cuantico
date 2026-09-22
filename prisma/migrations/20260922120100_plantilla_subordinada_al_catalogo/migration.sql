-- La plantilla minima pasa a ser un SUBCONJUNTO del catalogo, y deja de poder inventar nombres.
--
-- `plantilla_nivel` es lo que `aplicarPlantilla` usa para crear las ramas de un producto nuevo, y
-- sus cuatro nombres por clase divergen de los del arbol en los cuatro casos. Cada producto nuevo
-- nacia con una rama que no se parecia a ninguna de las 26 existentes. Todavia no habia producido
-- nada —no existe ningun `CODIGO FUENTE` sin tilde entre los 114 nodos— porque la plantilla no se
-- ha aplicado desde que `20260916200000_identidad_de_nivel` corrio su `upper()`. Era una trampa
-- armada y sin disparar.
--
-- **El orden de esta migracion no es cosmetico.** Primero se corrigen los nombres y despues se
-- pone la llave foranea: al reves, la llave rechaza las 16 filas que hay hoy y la migracion se
-- cae. Es la misma leccion de la cicatriz del 18/09/2026, una migracion que no se probo contra
-- datos.

-- 1 · Los tres renombres directos.
--
-- La caja ya la habia arreglado el `upper()` de `20260916200000_identidad_de_nivel`; lo que falta
-- son las tildes, porque `upper()` pone mayuscula y no inventa tildes. La plantilla se sembro sin
-- ellas ('Codigo Fuente', 'Documentacion') y `normalizarNombreNivel` las CONSERVA a proposito, asi
-- que `CODIGO FUENTE` y `CÓDIGO FUENTE` iban a ser dos nodos distintos para siempre.
UPDATE "plantilla_nivel" SET "nombre_nivel_3" = 'CÓDIGO FUENTE'
  WHERE "nombre_nivel_3" = 'CODIGO FUENTE';

UPDATE "plantilla_nivel" SET "nombre_nivel_3" = 'DOCUMENTACIÓN'
  WHERE "nombre_nivel_3" = 'DOCUMENTACION';

UPDATE "plantilla_nivel" SET "nombre_nivel_3" = 'DEPENDENCIAS'
  WHERE "nombre_nivel_3" = 'DEPENDENCIAS O RELACIONADOS';

-- 2 · `AMBIENTES` se abre en tres, por activo esperado.
--
-- Esa fila no es un nodo con un activo esperado: son TRES —Desarrollo, Staging, Produccion— y el
-- arbol real tiene tres nodos separados. Mapearla a uno solo dejaria «Desarrollo» esperado bajo
-- «Ambiente de produccion».
--
-- `Staging` se mapea a `AMBIENTE DE PRUEBAS`, que es el nombre que el arbol usa para eso. Si el
-- SIG decide que staging y pruebas son cosas distintas, esto es lo que hay que revisar.
UPDATE "plantilla_nivel" SET "nombre_nivel_3" = 'AMBIENTE DE DESARROLLO'
  WHERE "nombre_nivel_3" = 'AMBIENTES' AND "activo_esperado" = 'Desarrollo';

UPDATE "plantilla_nivel" SET "nombre_nivel_3" = 'AMBIENTE DE PRUEBAS'
  WHERE "nombre_nivel_3" = 'AMBIENTES' AND "activo_esperado" = 'Staging';

UPDATE "plantilla_nivel" SET "nombre_nivel_3" = 'AMBIENTE DE PRODUCCIÓN'
  WHERE "nombre_nivel_3" = 'AMBIENTES' AND "activo_esperado" = 'Produccion';

-- 3 · Cualquier fila que haya quedado fuera del catalogo entra ahora.
--
-- Red de seguridad para una base que no sea la que se leyo: si alguien agrego filas a
-- `plantilla_nivel` a mano, la llave foranea las rechazaria y la migracion se caeria en
-- produccion con un mensaje que no habla de eso. Esto las cataloga en vez de tumbar el despliegue.
INSERT INTO "catalogo_nivel_3" ("clase", "nombre")
SELECT DISTINCT p."clase_nivel", p."nombre_nivel_3"
FROM "plantilla_nivel" p
ON CONFLICT ("clase", "nombre") DO NOTHING;

-- 4 · Y ahora si, la llave.
--
-- Es lo que cierra la fabrica de divergencia EN LA RAIZ: con esto, `aplicarPlantilla` no puede
-- crear un nodo cuyo nombre el catalogo no tenga, porque la fila de la que saldria ese nombre no
-- se puede escribir.
ALTER TABLE "plantilla_nivel"
  ADD CONSTRAINT "plantilla_nivel_catalogo_fkey"
  FOREIGN KEY ("clase_nivel", "nombre_nivel_3")
  REFERENCES "catalogo_nivel_3"("clase", "nombre")
  ON DELETE RESTRICT ON UPDATE CASCADE;
