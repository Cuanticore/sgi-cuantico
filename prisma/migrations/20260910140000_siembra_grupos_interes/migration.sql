-- REQ-SIG-15 §4.2 · los dos grupos de interés con los que arranca el sistema.
--
-- El timestamp es POSTERIOR al de `grupos_interes_y_contactos`, que crea la tabla. Prisma
-- aplica en orden lexicográfico del nombre del directorio, así que una fecha anterior haría
-- que este INSERT corriera antes de que la tabla exista y reventaría la cadena completa en
-- cualquier base creada desde cero — aunque en una base que ya tenga la tabla pareciera
-- funcionar. Es exactamente el defecto que REQ-SIG-18 §15 tuvo y que se corrigió allá.
--
-- `ON CONFLICT (codigo) DO NOTHING` la hace repetible: una segunda aplicación no duplica.
--
-- **«Todos» nace con `derivado = true` y NUNCA lleva filas de membresía** (P10). Su
-- pertenencia es «toda persona con activa = true», calculada al generar. Con filas de
-- membresía, la persona a la que le faltara la fila —por un alta que falló, por una migración
-- que corrió antes— no recibiría el curso de concienciación Y NO APARECERÍA EN NINGUNA LISTA
-- DE FALTANTES, porque para el sistema no pertenece. Derivada, ese estado no se alcanza.
--
-- **«Desarrolladores» nace VACÍO** y con `derivado = false`. Nadie queda dentro hasta que
-- alguien lo marque: poblarlo adivinando por cargo o por área sería inventar una pertenencia
-- que después nadie sabe de dónde salió.
INSERT INTO grupo_interes (codigo, nombre, descripcion, derivado, activo, orden)
VALUES
  ('TODOS',
   'Todos',
   'Toda persona activa de la organización, por construcción. Concienciación en seguridad y políticas de obligada lectura. La casilla va marcada y no se puede desmarcar: una persona fuera de la concienciación es una excepción que necesita justificación, no una casilla.',
   true, true, 1),
  ('DESARROLLADORES',
   'Desarrolladores',
   'Quienes escriben o despliegan software. Codificación segura y el resto de las obligaciones de desarrollo seguro de REQ-SIG-08 (PRO-TEC-04 y sus puertas).',
   false, true, 2)
ON CONFLICT (codigo) DO NOTHING;
