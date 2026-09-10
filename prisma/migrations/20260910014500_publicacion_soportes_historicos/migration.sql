-- REQ-SIG-13 §7.3 · el histórico entra por la MISMA cola.
--
-- No hay script aparte a propósito: un script de una sola vez sería una segunda
-- implementación del publicador —con sus propios reintentos y sus propios errores— y sería
-- justo la que nadie prueba. Acá sólo se encola; el trabajo horario hace el resto con el
-- código que ya se ejercita todos los días.
--
-- `ON CONFLICT DO NOTHING` sobre `evidencia_id` (único) la hace repetible: si la migración
-- se vuelve a aplicar sobre una base que ya tiene filas, no duplica ninguna.
--
-- El timestamp es POSTERIOR al de `publicacion_soportes`, que crea la tabla. Prisma aplica
-- las migraciones en orden lexicográfico del nombre del directorio, así que una fecha
-- anterior haría que este INSERT corriera antes de que la tabla exista y reventaría la
-- cadena completa en cualquier base creada desde cero — aunque en una base que ya tenga la
-- tabla aplicada pareciera funcionar.
INSERT INTO publicacion_soporte (evidencia_id, persona_id, estado, intentos)
SELECT a.pdf_id, a.persona_id, 'PENDIENTE', 0
FROM acta_aceptacion a
WHERE a.pdf_id IS NOT NULL
ON CONFLICT (evidencia_id) DO NOTHING;
