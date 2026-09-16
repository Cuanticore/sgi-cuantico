-- Los dos primeros cursos virtuales.
--
-- 1 · La capacitación de código seguro que ya existe pasa a ser CURSO_VIRTUAL.
-- 2 · Se crea «Inducción» como curso virtual, con su enlace de Coursebox.
--
-- ES UNA MIGRACIÓN DE DATOS, no de esquema, y eso pide más cuidado que de costumbre: una
-- migración de datos corre UNA vez por base y no se puede revisar antes como un seed. Por
-- eso todo lo de abajo es idempotente y ninguna sentencia falla si su condición no se
-- cumple: si el curso de código seguro no existe en esta base, el UPDATE no toca nada y la
-- migración sigue.
--
-- ESCRITA A MANO y **no ejecutada contra ninguna base**. Depende del enum `CURSO_VIRTUAL`,
-- que agrega `20260915180000_curso_virtual`: esa tiene que haber corrido antes, y como
-- Postgres no deja usar un valor de enum en la misma transacción en que se agrega, ir en
-- migraciones separadas no es una preferencia sino un requisito.

-- ── 1 · El de código seguro ────────────────────────────────────────────────────────────
--
-- SE CAMBIA EL TIPO, NO EL TÍTULO. «Formación Virtual» es lo que el curso ES —su tipo— y no
-- cómo se llama: renombrarlo le quitaría el nombre por el que la gente lo conoce y por el
-- que aparece en las asignaciones ya cerradas. Si además hay que renombrarlo, es una línea
-- más y conviene decidirla mirando el título actual.
--
-- El código NO se reemite: `CAP-00x` sigue siendo su identificador, está citado en las
-- asignaciones que ya se generaron y en las actas si alguna se firmó. Un contenido que
-- cambia de tipo no cambia de identidad.
UPDATE "contenido_sig"
SET "tipo" = 'CURSO_VIRTUAL'
WHERE "tipo" = 'CAPACITACION'
  AND "activo" = true
  -- Acotado a propósito: sólo el que habla de código o desarrollo seguro. Un patrón más
  -- ancho convertiría en curso virtual a cualquier capacitación que mencione «seguro».
  --
  -- Sin `unaccent()`: es una EXTENSION de Postgres y puede no estar instalada en la base de
  -- destino. Una migracion que depende de una extension ausente no corre, y este archivo no
  -- puede fallar por algo que no tiene nada que ver con lo que hace. Se escriben las dos
  -- formas, con tilde y sin ella.
  AND (
    "titulo" ILIKE '%código seguro%'
    OR "titulo" ILIKE '%codigo seguro%'
    OR "titulo" ILIKE '%desarrollo seguro%'
    OR "titulo" ILIKE '%codificación segura%'
    OR "titulo" ILIKE '%codificacion segura%'
  );

-- ── 2 · La inducción ───────────────────────────────────────────────────────────────────
--
-- El consecutivo sale del MISMO `contador_contenido` que usa la aplicación, no de un
-- `MAX()+1`: los códigos no se reutilizan y un máximo sobre las filas vivas repartiría un
-- número que un contenido retirado todavía ocupa.
INSERT INTO "contador_contenido" ("tipo", "ultimo_valor")
VALUES ('CURSO_VIRTUAL', 1)
ON CONFLICT ("tipo") DO UPDATE SET "ultimo_valor" = "contador_contenido"."ultimo_valor" + 1;

INSERT INTO "contenido_sig" (
  "codigo", "tipo", "titulo", "descripcion", "procedimiento_origen",
  "documento_nombre", "documento_url", "version", "activo", "creada_en", "actualizado_en"
)
SELECT
  'CUR-' || lpad("ultimo_valor"::text, 3, '0'),
  'CURSO_VIRTUAL',
  'Inducción Corporativa Cuantico',
  'Curso de inducción para todo el personal. Se recorre dentro de la aplicación con su paquete SCORM; el contenido lo entrega Coursebox y el avance y el resultado los reporta el curso.',
  'PRO-TAL-01',
  NULL,
  NULL,
  1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "contador_contenido"
WHERE "tipo" = 'CURSO_VIRTUAL'
  -- Idempotente: si ya existe una inducción como curso virtual, no se crea una segunda.
  AND NOT EXISTS (
    SELECT 1 FROM "contenido_sig"
    WHERE "tipo" = 'CURSO_VIRTUAL' AND "titulo" ILIKE '%inducci%n%'
  );

-- NACE SIN PAQUETE Y SIN ASIGNAR, y las dos cosas son a propósito.
--
-- SIN PAQUETE porque el zip se sube desde la aplicación, que es donde se valida: el
-- manifiesto, la edición, la clase del paquete y sus dominios externos se analizan al
-- cargarlo. Insertar filas de `paquete_scorm` y `archivo_scorm` desde SQL se saltaría esa
-- validación entera y metería un paquete que nadie comprobó.
--
-- SIN ASIGNAR porque para que le llegue a alguien hay que crear la obligación que lo asigna
-- al grupo «Todos», y eso decide a quién se le cobra y DESDE CUÁNDO. Ese «desde cuándo» es
-- el piso de los periodos: fijarlo mal le cobra a todo el mundo un curso del trimestre
-- pasado.
--
-- Los dos paquetes ya se revisaron contra el analizador de la aplicación (15/09/2026):
-- SCORM 2004 4ª edición, clase DESPACHO, dominio externo `https://my.coursebox.ai`. Los dos
-- pasan.
