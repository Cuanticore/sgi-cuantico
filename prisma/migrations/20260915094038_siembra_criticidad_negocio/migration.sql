-- REQ-SIG-20 §11 · la criticidad de negocio, declarada por el negocio y no derivada del
-- residual (D-3): cuánta interrupción tolera un servicio es un compromiso de negocio, no
-- un resultado aritmético. Si el sistema la calculara del peor residual, diría que un activo
-- es crítico *porque está mal protegido* — exactamente al revés de lo que se necesita.
--
-- El timestamp es POSTERIOR al de `criticidad_negocio` (20260915073050), que crea la tabla.
-- Prisma aplica en orden lexicográfico del directorio; una fecha anterior haría que este
-- INSERT corriera antes de que la tabla exista y reventaría la cadena en cualquier base
-- creada desde cero, aunque en una base que ya tenga la tabla pareciera funcionar.
--
-- `ON CONFLICT (codigo) DO UPDATE` la hace repetible Y correctora: una segunda aplicación
-- no duplica y deja los valores vigentes del catálogo.
--
-- RTO/RPO van en MINUTOS, nunca texto: «≤ 4 h» es presentación, 240 es el dato — sin eso no
-- se puede ordenar ni comparar. C5 lleva NULL en ambos y es un valor declarado («sin
-- compromiso»), no una ausencia: nunca un centinela grande, que ordenaría a los activos
-- sin acuerdo de nivel de servicio como si fueran los más tolerantes del inventario.
INSERT INTO criticidad_negocio (codigo, nombre, rto_minutos, rpo_minutos, descripcion, orden, activo) VALUES
 ('C1','Crítica continua',   10,   5,   'Multi-región activo-activo, o con conmutación automática probada. Réplica síncrona o casi.', 1, true),
 ('C2','Crítica',            240,  60,  'Segunda región en espera tibia, con conmutación probada y documentada.',                  2, true),
 ('C3','Importante',         1440, 480, 'Respaldo restaurable con prueba de restauración periódica.',                              3, true),
 ('C4','Estándar',           4320, 1440,'Respaldo diario, restauración bajo demanda.',                                             4, true),
 ('C5','Sin compromiso',     NULL, NULL,'Esfuerzo razonable. Es un valor, no la ausencia de uno.',                                 5, true)
ON CONFLICT (codigo) DO UPDATE SET
 nombre = EXCLUDED.nombre, rto_minutos = EXCLUDED.rto_minutos, rpo_minutos = EXCLUDED.rpo_minutos,
 descripcion = EXCLUDED.descripcion, orden = EXCLUDED.orden, activo = EXCLUDED.activo;
