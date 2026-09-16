-- REQ-SIG-24 §3 y §5 · la escala de madurez pasa de L0-L5 a once escalones de 0 a 100.
--
-- POR QUÉ `nivel` PASA A SER EL PORCENTAJE Y NO SE RENUMERA 0..10 (design D1). El remapeo
-- de abajo dice qué hace: «lo que apuntaba al escalón 3 pasa a apuntar al 90». Con una
-- renumeración 0..10, `L3 → 3` seguiría siendo un `3` válido apuntando a OTRA cosa — el
-- error más caro posible, porque no falla.
--
-- ORDEN OBLIGATORIO: insertar → remapear → verificar → borrar. Borrar primero rompería las
-- seis claves foráneas; borrar sin verificar dejaría filas apuntando al vacío.
--
-- NO ESCRIBE `bitacora` (design D7). Un remapeo que PRESERVA el significado —L3 y 90 % son
-- la misma eficacia de 0.90— no es un cambio de madurez, y escribir 93×3 filas diciendo que
-- alguien cambió el nivel sería falso: nadie lo cambió. La marca que sí significa algo es
-- `recalificado_en`, más abajo.

BEGIN;

-- ── 1 · Los escalones nuevos ────────────────────────────────────────────────────────────
-- Los descriptores son la RÚBRICA de §3, y son el requerimiento, no un anexo: un porcentaje
-- sin ancla se elige por sensación. La regla de oro para calificar es que el escalón
-- intermedio es «el nivel de abajo, con la evidencia que falta».
--
-- `ON CONFLICT (nivel) DO UPDATE` la hace repetible: el 0 ya existe con el mismo
-- significado en las dos escalas y se corrige en vez de duplicarse.
INSERT INTO escala_madurez (nivel, nombre, eficacia, lectura) VALUES
 (0,   'No existe. Nadie lo hace.',                                                            0.000, 'Equivale a L0 de la escala CMM anterior'),
 (10,  'Reactivo: se hace cuando algo pasa, sin método ni constancia.',                        0.100, 'Equivale a L1 de la escala CMM anterior'),
 (20,  'Se hace por iniciativa de una persona; se cae si esa persona falta.',                   0.200, NULL),
 (30,  'Práctica reconocible y repetida, no escrita.',                                          0.300, NULL),
 (40,  'Escrita parcialmente; se aplica de forma desigual entre casos o áreas.',                0.400, NULL),
 (50,  'Documentada y repetible; sin evidencia de que se aplique siempre.',                     0.500, 'Equivale a L2 de la escala CMM anterior'),
 (60,  'Documentada, comunicada y aplicada; el registro es incompleto.',                        0.600, NULL),
 (70,  'Documentada, comunicada, aplicada y registrada. Sin medición ni prueba.',               0.700, 'Equivale a L3 de la escala CMM anterior'),
 (80,  'Con una medición o una prueba ejecutada y registrada; los resultados no se revisan.',   0.800, NULL),
 (90,  'Medido, revisado periódicamente, y las desviaciones se corrigen.',                      0.900, 'Equivale a L4 de la escala CMM anterior'),
 (100, 'Reservado. Ningún control elimina un riesgo.',                                          1.000, 'Equivale a L5 de la escala CMM anterior')
ON CONFLICT (nivel) DO UPDATE SET
 nombre = EXCLUDED.nombre, eficacia = EXCLUDED.eficacia, lectura = EXCLUDED.lectura;

-- ── 2 · El remapeo, POR EFICACIA ────────────────────────────────────────────────────────
-- L0→0  L1→10  L2→50  L3→90  L4→90  L5→100.
--
-- L3 y L4 caen en el mismo escalón porque 95 % no existe en una escala de diez en diez, y
-- porque REQ-SIG-22 §2.2 ya documentó que esos dos grupos hoy no se distinguen de verdad.
-- La traducción es casi NEUTRA —el índice pasa de 86.7 % a 84.9 %— y eso es una virtud:
-- nadie podrá decir que el tablero cambió por un truco de escala. Todo el movimiento tiene
-- que venir de la recalificación a mano, control por control, con su bitácora.
--
-- Traducir por DESCRIPTOR en cambio (L3 «definido» → 70 %) habría recalificado 44 controles
-- de un plumazo, y «ningún nivel de madurez cambia automáticamente» (REQ-SIG-22 §7).
CREATE TEMP TABLE _traduccion(viejo INT PRIMARY KEY, nuevo INT) ON COMMIT DROP;
INSERT INTO _traduccion VALUES (0,0),(1,10),(2,50),(3,90),(4,90),(5,100);

CREATE TEMP TABLE _mapa_id(id_viejo INT PRIMARY KEY, id_nuevo INT NOT NULL) ON COMMIT DROP;
INSERT INTO _mapa_id
SELECT v.id, n.id
FROM _traduccion t
JOIN escala_madurez v ON v.nivel = t.viejo
JOIN escala_madurez n ON n.nivel = t.nuevo
WHERE v.id <> n.id;

UPDATE control      SET linea_base_id        = m.id_nuevo FROM _mapa_id m WHERE linea_base_id        = m.id_viejo;
UPDATE control      SET actual_id            = m.id_nuevo FROM _mapa_id m WHERE actual_id            = m.id_viejo;
UPDATE control      SET objetivo_id          = m.id_nuevo FROM _mapa_id m WHERE objetivo_id          = m.id_viejo;
UPDATE riesgo       SET madurez_id           = m.id_nuevo FROM _mapa_id m WHERE madurez_id           = m.id_viejo;
UPDATE accion_plan  SET madurez_alcanzada_id = m.id_nuevo FROM _mapa_id m WHERE madurez_alcanzada_id = m.id_viejo;
UPDATE accion_plan  SET madurez_objetivo_id  = m.id_nuevo FROM _mapa_id m WHERE madurez_objetivo_id  = m.id_viejo;

-- ── 3 · La verificación, ANTES de borrar ────────────────────────────────────────────────
-- Si algo quedó apuntando a un escalón viejo, la migración entera se deshace. Un `DELETE`
-- optimista dejaría claves foráneas rotas o —peor, si alguien las hubiera puesto en
-- `ON DELETE SET NULL`— 93 controles «sin evaluar» sin que nadie lo decidiera.
DO $$
DECLARE colgadas INT;
BEGIN
  SELECT count(*) INTO colgadas
  FROM (
    SELECT linea_base_id AS id FROM control
    UNION ALL SELECT actual_id FROM control
    UNION ALL SELECT objetivo_id FROM control
    UNION ALL SELECT madurez_id FROM riesgo
    UNION ALL SELECT madurez_alcanzada_id FROM accion_plan
    UNION ALL SELECT madurez_objetivo_id FROM accion_plan
  ) refs
  JOIN escala_madurez e ON e.id = refs.id
  WHERE e.nivel IN (1, 2, 3, 4, 5);

  IF colgadas > 0 THEN
    RAISE EXCEPTION
      'REQ-SIG-24: quedan % referencias a escalones de la escala vieja. No se borra nada.',
      colgadas;
  END IF;
END $$;

-- ── 4 · Fuera los escalones viejos ──────────────────────────────────────────────────────
-- El 0 NO se borra: existe con el mismo significado y la misma eficacia en las dos escalas.
DELETE FROM escala_madurez WHERE nivel IN (1, 2, 3, 4, 5);

-- ── 5 · La marca de «traducido, sin recalificar» (§5) ───────────────────────────────────
-- `null` NO significa «nunca se recalificó» en el sentido de un dato faltante: significa que
-- el nivel viene de la traducción automática de arriba y que nadie lo miró todavía con la
-- rúbrica nueva. Es lo que permite reportar DOS índices —traducido y recalificado— cuya
-- diferencia mide cuánto del tablero sigue descansando en la escala que este requerimiento
-- vino a reemplazar. Misma mecánica que «declarado, no verificado» de REQ-SIG-22 §3.3.
ALTER TABLE control ADD COLUMN IF NOT EXISTS recalificado_en TIMESTAMP(3);

COMMIT;
