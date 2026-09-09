-- Los catalogos del modulo estrategico (MAN-CAL-01) viajan con el codigo.
--
-- POR QUE. Estas 33 filas existian SOLO en `prisma/seeds/estrategico.ts`, y el despliegue
-- corre `prisma migrate deploy` sin sembrar nada. Resultado en produccion: los estantes
-- construidos y sin libros. `/estrategico/mapa` dibujaba una malla 5x5 con los ejes sin
-- nombre y sin bandas de color, y `riesgo_organizacional.factor_id` es NOT NULL, asi que
-- no se podia ni dar de alta un riesgo: la lista de factores estaba vacia.
--
-- No son datos de nadie: son las definiciones de las escalas del manual. Un catalogo que la
-- aplicacion necesita para arrancar pertenece a la migracion, no a una semilla que alguien
-- tiene que acordarse de correr.
--
-- ON CONFLICT DO NOTHING en la columna unica de cada tabla, y a proposito:
--
--   * donde las filas YA estan (cualquier base sembrada a mano) no cambia nada;
--   * donde no estan, se crean;
--   * si alguien edito un color o una etiqueta en su ambiente, SE RESPETA. Un `DO UPDATE`
--     pisaria esa correccion en cada despliegue, y una migracion que revierte el trabajo de
--     una persona cada vez que se despliega es peor que no tenerla.
--
-- El `id` no se escribe: lo pone la secuencia de cada tabla. Fijarlo a mano chocaria en
-- cuanto una base tuviera esas filas con otros numeros.
--
-- Los nombres se copian LITERALES de la semilla porque el codigo compara contra ellos:
-- `medicionDe` en `app/estrategico/mapa/page.tsx` distingue 'Débil' de 'Moderado', y
-- `tipoToken` distingue 'Preventivo y correctivo' de 'Preventivo'. Un acento de menos acá no
-- falla: cae en el valor por defecto y el calculo del riesgo residual queda mal en silencio.

-- Escala de probabilidad · el eje vertical del mapa de calor
INSERT INTO "escala_probabilidad" ("valor", "etiqueta", "descripcion", "color") VALUES
  (1, 'Muy baja', 'Casi nunca',            '#e6efe9'),
  (2, 'Baja',     'Ocasionalmente',        '#eef7f1'),
  (3, 'Media',    'Con cierta frecuencia', '#faf1d3'),
  (4, 'Alta',     'Frecuentemente',        '#fbe6d2'),
  (5, 'Muy alta', 'Casi siempre',          '#f7dcd9')
ON CONFLICT ("valor") DO NOTHING;

-- Escala de impacto para riesgos · el eje horizontal
INSERT INTO "escala_impacto_riesgo" ("valor", "etiqueta", "porcentaje_patrimonio", "referencia_cop") VALUES
  (1, 'Insignificante',  1,    70000000),
  (2, 'Menor',           3,   210000000),
  (3, 'Moderado',        7,   490000000),
  (4, 'Mayor',          12,   840000000),
  (5, 'Catastrófico',   20,  1400000000)
ON CONFLICT ("valor") DO NOTHING;

-- Escala de impacto para oportunidades · la cara positiva del mismo metodo
INSERT INTO "escala_impacto_oportunidad" ("valor", "etiqueta") VALUES
  (1, 'Menor'),
  (2, 'Moderada'),
  (3, 'Significativa'),
  (4, 'Importante'),
  (5, 'Excepcional')
ON CONFLICT ("valor") DO NOTHING;

-- Factores de riesgo · `riesgo_organizacional.factor_id` es NOT NULL, asi que sin estas
-- seis filas no se puede crear ni un riesgo.
INSERT INTO "factor_riesgo" ("nombre") VALUES
  ('Legal'),
  ('Operacional'),
  ('Personal'),
  ('Tecnológico'),
  ('Reputacional'),
  ('Externo')
ON CONFLICT ("nombre") DO NOTHING;

-- Tipos de control · `reduce` dice sobre que eje actua el control, y de eso depende como se
-- calcula el riesgo residual.
INSERT INTO "tipo_control_riesgo" ("nombre", "reduce", "descripcion") VALUES
  ('Preventivo',              'PROBABILIDAD', 'Evita que el riesgo ocurra'),
  ('Correctivo',              'IMPACTO',      'Reduce el daño cuando ocurre'),
  ('Preventivo y correctivo', 'AMBOS',        'Actúa antes y después'),
  ('Reforzador',              'PROBABILIDAD', 'Hace más probable la oportunidad'),
  ('Reactivo',                'IMPACTO',      'Definido en el manual; la matriz no lo usa'),
  ('Proactivo',               'AMBOS',        'Refuerza y amplía la oportunidad')
ON CONFLICT ("nombre") DO NOTHING;

-- Eficacia del control · la fraccion que se le descuenta al riesgo inherente
INSERT INTO "eficacia_control" ("nombre", "valor", "descripcion") VALUES
  ('Débil',    0.100, 'Reduce el 10 %'),
  ('Moderado', 0.400, 'Reduce el 40 %'),
  ('Fuerte',   0.800, 'Reduce el 80 %')
ON CONFLICT ("nombre") DO NOTHING;

-- Niveles de riesgo · las bandas de color del mapa y la accion que corresponde a cada una
INSERT INTO "nivel_riesgo" ("minimo", "maximo", "etiqueta", "color", "accion_riesgo", "accion_oportunidad") VALUES
  ( 0,  4, 'Aceptable',   '#0b5c44', 'Aceptar',           'Esperar'),
  ( 5, 12, 'Moderado',    '#c25a1e', 'Mitigar o reducir', 'Mejorar'),
  (13, 25, 'Inaceptable', '#a52016', 'Evitar',            'Explotar')
ON CONFLICT ("minimo") DO NOTHING;
