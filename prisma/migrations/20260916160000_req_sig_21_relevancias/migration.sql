-- REQ-SIG-21 §6 · las 272 relevancias control–amenaza, designadas.
--
-- QUÉ CAMBIA. Hasta esta migración `control_amenaza.relevancia_id` estaba en NULL en las 272
-- filas, así que `desglosarEficaciaAmenaza` caía a la rama v2 —media simple, sin techo del
-- principal— en las 57 amenazas. Con la designación aplicada, la eficacia pasa a la regla
-- aprobada: media ponderada 70/20/10 acotada por el control principal (MET-SIG-01 v3 §7.4,
-- presupuestos de REQ-SIG-21 §4). El residual de TODOS los activos se mueve con ella.
--
-- POR QUÉ ES UNA MIGRACIÓN Y NO SOLO EL CSV. Son dos caminos distintos y se necesitan los dos:
-- `prisma/data/relevancia-pendiente.csv` es el que lee la siembra, y sin él una siembra futura
-- volvería a poner los 272 en NULL —`prisma/seeds/iso.ts` hace `update: { relevanciaId }` con
-- lo que traiga el archivo, así que la columna vacía no conserva: borra—. Esta migración es la
-- que alcanza a una base que ya existe, que es el único camino que corre el despliegue
-- (`prisma migrate deploy`; la siembra no corre en CI). `prisma/__tests__/relevancias.test.ts`
-- compara los dos conjuntos para que no puedan discrepar en silencio.
--
-- REPETIBLE. El UPDATE deja los mismos valores si ya estaban, y la bitácora se inserta SÓLO
-- para los pares que de verdad cambian de relevancia: una segunda aplicación no duplica el
-- registro histórico. Producción ya tiene esto aplicado a mano, así que la primera corrida
-- allá no escribirá ninguna fila de bitácora — que es lo correcto, el hecho ya está asentado.
--
-- SE VERIFICA ANTES DE ESCRIBIR. Un par inexistente o una amenaza sin exactamente un Principal
-- aborta la transacción. Una amenaza clasificada a medias pesaría un control en 3 y a su
-- hermano en 1 sin que nadie lo haya decidido, y eso se lee como criterio cuando es un olvido.

CREATE TEMP TABLE _rel(amenaza text, control text, relevancia text) ON COMMIT DROP;

INSERT INTO _rel VALUES
 ('A.10','A.8.24','De apoyo'),
 ('A.10','A.8.26','Principal'),
 ('A.10','A.8.29','Complementario'),
 ('A.11','A.5.15','Principal'),
 ('A.11','A.5.23','De apoyo'),
 ('A.11','A.5.24','De apoyo'),
 ('A.11','A.8.2','Complementario'),
 ('A.11','A.8.20','De apoyo'),
 ('A.11','A.8.3','Complementario'),
 ('A.11','A.8.5','Complementario'),
 ('A.12','A.8.20','De apoyo'),
 ('A.12','A.8.22','Complementario'),
 ('A.12','A.8.24','Principal'),
 ('A.13','A.5.28','Complementario'),
 ('A.13','A.5.31','De apoyo'),
 ('A.13','A.8.15','Principal'),
 ('A.13','A.8.17','De apoyo'),
 ('A.13','A.8.24','Complementario'),
 ('A.14','A.6.7','De apoyo'),
 ('A.14','A.8.20','Complementario'),
 ('A.14','A.8.21','Complementario'),
 ('A.14','A.8.24','Principal'),
 ('A.15','A.5.33','Complementario'),
 ('A.15','A.8.15','Complementario'),
 ('A.15','A.8.24','De apoyo'),
 ('A.15','A.8.3','Principal'),
 ('A.18','A.5.26','De apoyo'),
 ('A.18','A.5.29','Complementario'),
 ('A.18','A.8.13','Principal'),
 ('A.18','A.8.3','Complementario'),
 ('A.19','A.5.13','Complementario'),
 ('A.19','A.5.31','De apoyo'),
 ('A.19','A.5.32','De apoyo'),
 ('A.19','A.5.34','Complementario'),
 ('A.19','A.6.6','De apoyo'),
 ('A.19','A.8.12','Principal'),
 ('A.19','A.8.24','Complementario'),
 ('A.22','A.5.21','De apoyo'),
 ('A.22','A.8.25','Complementario'),
 ('A.22','A.8.27','De apoyo'),
 ('A.22','A.8.28','Complementario'),
 ('A.22','A.8.30','De apoyo'),
 ('A.22','A.8.31','Principal'),
 ('A.22','A.8.4','Complementario'),
 ('A.23','A.7.2','De apoyo'),
 ('A.23','A.7.8','Principal'),
 ('A.23','A.7.9','Complementario'),
 ('A.23','A.8.1','Complementario'),
 ('A.24','A.5.26','De apoyo'),
 ('A.24','A.8.14','Principal'),
 ('A.24','A.8.20','Complementario'),
 ('A.24','A.8.6','Complementario'),
 ('A.25','A.7.10','Complementario'),
 ('A.25','A.7.2','De apoyo'),
 ('A.25','A.7.9','Principal'),
 ('A.25','A.8.1','De apoyo'),
 ('A.25','A.8.24','Complementario'),
 ('A.26','A.5.29','Principal'),
 ('A.26','A.7.1','Complementario'),
 ('A.26','A.7.2','De apoyo'),
 ('A.26','A.7.4','Complementario'),
 ('A.27','A.5.29','Principal'),
 ('A.27','A.7.1','Complementario'),
 ('A.27','A.7.2','De apoyo'),
 ('A.27','A.7.6','Complementario'),
 ('A.28','A.5.29','Principal'),
 ('A.28','A.5.4','Complementario'),
 ('A.28','A.6.4','De apoyo'),
 ('A.28','A.6.5','Complementario'),
 ('A.29','A.5.26','Principal'),
 ('A.29','A.5.5','De apoyo'),
 ('A.29','A.6.2','De apoyo'),
 ('A.29','A.6.3','Complementario'),
 ('A.29','A.6.4','De apoyo'),
 ('A.29','A.6.6','Complementario'),
 ('A.3','A.5.28','De apoyo'),
 ('A.3','A.5.33','Principal'),
 ('A.3','A.8.15','Complementario'),
 ('A.3','A.8.2','Complementario'),
 ('A.30','A.5.14','De apoyo'),
 ('A.30','A.5.17','Complementario'),
 ('A.30','A.5.6','De apoyo'),
 ('A.30','A.5.7','De apoyo'),
 ('A.30','A.6.3','Principal'),
 ('A.30','A.6.8','De apoyo'),
 ('A.30','A.8.5','Complementario'),
 ('A.4','A.8.16','De apoyo'),
 ('A.4','A.8.2','Complementario'),
 ('A.4','A.8.32','Complementario'),
 ('A.4','A.8.9','Principal'),
 ('A.5','A.5.16','Complementario'),
 ('A.5','A.5.17','Complementario'),
 ('A.5','A.6.3','De apoyo'),
 ('A.5','A.8.2','De apoyo'),
 ('A.5','A.8.5','Principal'),
 ('A.6','A.5.18','Complementario'),
 ('A.6','A.5.3','Complementario'),
 ('A.6','A.8.16','De apoyo'),
 ('A.6','A.8.18','De apoyo'),
 ('A.6','A.8.2','Principal'),
 ('A.6','A.8.34','De apoyo'),
 ('A.7','A.5.10','Principal'),
 ('A.7','A.5.36','De apoyo'),
 ('A.7','A.8.19','Complementario'),
 ('A.7','A.8.23','Complementario'),
 ('A.8','A.5.24','De apoyo'),
 ('A.8','A.5.26','De apoyo'),
 ('A.8','A.5.27','De apoyo'),
 ('A.8','A.5.7','De apoyo'),
 ('A.8','A.8.13','Complementario'),
 ('A.8','A.8.19','Complementario'),
 ('A.8','A.8.7','Principal'),
 ('A.8','A.8.8','Complementario'),
 ('A.9','A.8.20','Complementario'),
 ('A.9','A.8.21','Complementario'),
 ('A.9','A.8.22','Principal'),
 ('A.9','A.8.24','De apoyo'),
 ('E.1','A.5.1','De apoyo'),
 ('E.1','A.5.10','Complementario'),
 ('E.1','A.5.12','Complementario'),
 ('E.1','A.6.2','De apoyo'),
 ('E.1','A.6.3','Principal'),
 ('E.1','A.8.12','De apoyo'),
 ('E.1','A.8.5','De apoyo'),
 ('E.10','A.5.8','De apoyo'),
 ('E.10','A.8.25','Complementario'),
 ('E.10','A.8.27','De apoyo'),
 ('E.10','A.8.29','Principal'),
 ('E.10','A.8.32','Complementario'),
 ('E.14','A.5.13','Complementario'),
 ('E.14','A.5.14','Complementario'),
 ('E.14','A.5.8','De apoyo'),
 ('E.14','A.7.7','De apoyo'),
 ('E.14','A.8.11','De apoyo'),
 ('E.14','A.8.12','Principal'),
 ('E.15','A.5.33','Complementario'),
 ('E.15','A.5.35','De apoyo'),
 ('E.15','A.8.13','Principal'),
 ('E.15','A.8.3','Complementario'),
 ('E.15','A.8.9','De apoyo'),
 ('E.18','A.5.33','Complementario'),
 ('E.18','A.8.10','De apoyo'),
 ('E.18','A.8.13','Principal'),
 ('E.18','A.8.3','Complementario'),
 ('E.19','A.5.14','Complementario'),
 ('E.19','A.5.31','De apoyo'),
 ('E.19','A.5.34','Complementario'),
 ('E.19','A.8.11','De apoyo'),
 ('E.19','A.8.12','Principal'),
 ('E.19','A.8.33','De apoyo'),
 ('E.2','A.5.3','Complementario'),
 ('E.2','A.5.9','De apoyo'),
 ('E.2','A.8.15','De apoyo'),
 ('E.2','A.8.2','De apoyo'),
 ('E.2','A.8.32','Principal'),
 ('E.2','A.8.34','De apoyo'),
 ('E.2','A.8.9','Complementario'),
 ('E.20','A.8.25','Complementario'),
 ('E.20','A.8.27','De apoyo'),
 ('E.20','A.8.28','De apoyo'),
 ('E.20','A.8.29','Complementario'),
 ('E.20','A.8.30','De apoyo'),
 ('E.20','A.8.8','Principal'),
 ('E.21','A.8.19','Complementario'),
 ('E.21','A.8.31','Complementario'),
 ('E.21','A.8.32','Principal'),
 ('E.21','A.8.8','De apoyo'),
 ('E.23','A.7.13','Principal'),
 ('E.23','A.8.32','Complementario'),
 ('E.23','A.8.9','De apoyo'),
 ('E.24','A.8.14','Complementario'),
 ('E.24','A.8.16','De apoyo'),
 ('E.24','A.8.6','Principal'),
 ('E.25','A.5.11','De apoyo'),
 ('E.25','A.7.10','Complementario'),
 ('E.25','A.7.9','Principal'),
 ('E.25','A.8.1','De apoyo'),
 ('E.25','A.8.24','Complementario'),
 ('E.28','A.5.2','Complementario'),
 ('E.28','A.5.29','Complementario'),
 ('E.28','A.5.30','Principal'),
 ('E.28','A.5.8','De apoyo'),
 ('E.28','A.6.1','De apoyo'),
 ('E.28','A.6.2','De apoyo'),
 ('E.28','A.6.5','De apoyo'),
 ('E.3','A.5.24','De apoyo'),
 ('E.3','A.5.25','Complementario'),
 ('E.3','A.8.15','Principal'),
 ('E.3','A.8.16','Complementario'),
 ('E.3','A.8.17','De apoyo'),
 ('E.4','A.8.31','Complementario'),
 ('E.4','A.8.32','Complementario'),
 ('E.4','A.8.8','De apoyo'),
 ('E.4','A.8.9','Principal'),
 ('E.7','A.5.1','De apoyo'),
 ('E.7','A.5.2','Principal'),
 ('E.7','A.5.3','De apoyo'),
 ('E.7','A.5.35','De apoyo'),
 ('E.7','A.5.36','De apoyo'),
 ('E.7','A.5.37','Complementario'),
 ('E.7','A.5.4','Complementario'),
 ('E.7','A.5.9','De apoyo'),
 ('E.8','A.5.7','De apoyo'),
 ('E.8','A.6.3','De apoyo'),
 ('E.8','A.8.19','Complementario'),
 ('E.8','A.8.23','Complementario'),
 ('E.8','A.8.7','Principal'),
 ('E.9','A.8.20','Complementario'),
 ('E.9','A.8.21','Complementario'),
 ('E.9','A.8.22','Principal'),
 ('E.9','A.8.9','De apoyo'),
 ('I.*','A.5.29','Complementario'),
 ('I.*','A.5.30','Principal'),
 ('I.*','A.7.5','De apoyo'),
 ('I.*','A.8.14','Complementario'),
 ('I.1','A.5.29','Complementario'),
 ('I.1','A.7.11','De apoyo'),
 ('I.1','A.7.3','De apoyo'),
 ('I.1','A.7.5','Complementario'),
 ('I.1','A.8.13','Principal'),
 ('I.10','A.7.10','Complementario'),
 ('I.10','A.7.14','De apoyo'),
 ('I.10','A.8.13','Principal'),
 ('I.11','A.7.12','Complementario'),
 ('I.11','A.7.5','Principal'),
 ('I.11','A.8.24','De apoyo'),
 ('I.2','A.7.5','Complementario'),
 ('I.2','A.7.8','Complementario'),
 ('I.2','A.8.13','Principal'),
 ('I.3','A.7.13','Complementario'),
 ('I.3','A.7.5','Complementario'),
 ('I.3','A.7.8','Principal'),
 ('I.4','A.7.12','De apoyo'),
 ('I.4','A.7.5','Principal'),
 ('I.4','A.7.8','Complementario'),
 ('I.5','A.5.30','Complementario'),
 ('I.5','A.7.13','De apoyo'),
 ('I.5','A.8.13','Complementario'),
 ('I.5','A.8.14','Principal'),
 ('I.5','A.8.6','De apoyo'),
 ('I.6','A.5.30','Complementario'),
 ('I.6','A.7.11','Complementario'),
 ('I.6','A.8.13','De apoyo'),
 ('I.6','A.8.14','Principal'),
 ('I.7','A.7.11','De apoyo'),
 ('I.7','A.7.5','Principal'),
 ('I.7','A.7.8','Complementario'),
 ('I.8','A.5.22','De apoyo'),
 ('I.8','A.5.30','Complementario'),
 ('I.8','A.8.14','Principal'),
 ('I.8','A.8.21','Complementario'),
 ('I.9','A.5.19','De apoyo'),
 ('I.9','A.5.20','Complementario'),
 ('I.9','A.5.22','De apoyo'),
 ('I.9','A.5.23','De apoyo'),
 ('I.9','A.5.30','Principal'),
 ('I.9','A.8.14','Complementario'),
 ('N.*','A.5.29','De apoyo'),
 ('N.*','A.5.30','Principal'),
 ('N.*','A.7.5','De apoyo'),
 ('N.*','A.8.13','Complementario'),
 ('N.*','A.8.14','Complementario'),
 ('N.1','A.5.29','Complementario'),
 ('N.1','A.5.30','Principal'),
 ('N.1','A.7.11','De apoyo'),
 ('N.1','A.7.3','De apoyo'),
 ('N.1','A.7.5','De apoyo'),
 ('N.1','A.8.13','Complementario'),
 ('N.2','A.5.29','Complementario'),
 ('N.2','A.7.5','Complementario'),
 ('N.2','A.7.8','De apoyo'),
 ('N.2','A.8.13','Principal');

DO $$
DECLARE pares int; clases int; faltan int; sin_principal int;
BEGIN
  -- BASE NUEVA: NO ES UN ERROR, ES EL ORDEN NORMAL.
  --
  -- `control_amenaza` y `relevancia_control` NO las puebla ninguna migración: las siembra
  -- `prisma/seeds/iso.ts` desde los JSON y el CSV del repositorio. Así que en una base recién
  -- creada estas tablas están vacías cuando `prisma migrate deploy` llega hasta acá, y las
  -- verificaciones de abajo —escritas para una base con datos— abortarían la transacción y con
  -- ella TODA la cadena de migraciones: ningún entorno nuevo se podría levantar.
  --
  -- Se sale en silencio y la siembra hace el trabajo con el mismo CSV. La migración existe para
  -- las bases que YA tienen los 272 pares y no vuelven a sembrarse — producción, entre ellas.
  SELECT count(*) INTO pares FROM control_amenaza;
  IF pares = 0 THEN
    RAISE NOTICE 'REQ-SIG-21: control_amenaza vacía (base nueva). La siembra aplica el CSV; nada que hacer acá.';
    RETURN;
  END IF;

  -- Con pares pero sin catálogo de relevancia, los JOIN de abajo no encontrarían a qué id
  -- apuntar y el UPDATE no escribiría NADA, sin fallar. Un no-op silencioso en una migración
  -- de datos es peor que un error: la base queda a medias y el despliegue dice que salió bien.
  SELECT count(*) INTO clases FROM relevancia_control;
  IF clases = 0 THEN
    RAISE EXCEPTION 'REQ-SIG-21: hay % pares en control_amenaza pero relevancia_control está vacía. Siembre los catálogos antes de aplicar esta migración.', pares;
  END IF;

  SELECT count(*) INTO faltan
  FROM _rel r
  LEFT JOIN amenaza am ON am.codigo = r.amenaza
  LEFT JOIN control c ON c.codigo = r.control
  LEFT JOIN control_amenaza ca ON ca.amenaza_id = am.id AND ca.control_id = c.id
  WHERE ca.amenaza_id IS NULL;
  IF faltan > 0 THEN
    RAISE EXCEPTION 'REQ-SIG-21: % pares designados no existen en control_amenaza', faltan;
  END IF;

  SELECT count(*) INTO sin_principal FROM (
    SELECT amenaza FROM _rel WHERE relevancia = 'Principal'
    GROUP BY amenaza HAVING count(*) <> 1
  ) x;
  IF sin_principal > 0 THEN
    RAISE EXCEPTION 'REQ-SIG-21: % amenazas no tienen exactamente un Principal', sin_principal;
  END IF;

  -- La bitácora en la MISMA transacción que el hecho, y sólo por lo que cambia: una segunda
  -- aplicación no duplica el registro histórico.
  INSERT INTO bitacora (tabla, registro_id, campo, valor_anterior, valor_nuevo, motivo, usuario)
  SELECT 'control_amenaza', r.amenaza || ' x ' || r.control, 'relevancia',
         COALESCE(actual.nombre, 'sin asignar'), r.relevancia,
         'REQ-SIG-21 · designacion de relevancia. El Principal es el control sin el cual la amenaza NO SE CONTIENE: el unico cuyo nivel fija el techo de la eficacia y por tanto el unico cuya insuficiencia es una brecha real. En amenazas que degradan disponibilidad el principal es un control de continuidad, para que el residual de servidores y ambientes de produccion dependa de si hay redundancia probada y no de si hay una politica firmada. Hasta hoy los 272 pares estaban sin clasificar y la eficacia se calculaba con la media simple que MET-SIG-01 v3 §7.4 reemplazo.',
         'daniel.medina@cuantico.com'
  FROM _rel r
  JOIN amenaza am ON am.codigo = r.amenaza
  JOIN control c ON c.codigo = r.control
  JOIN control_amenaza ca ON ca.amenaza_id = am.id AND ca.control_id = c.id
  LEFT JOIN relevancia_control actual ON actual.id = ca.relevancia_id
  WHERE actual.nombre IS DISTINCT FROM r.relevancia;

  UPDATE control_amenaza ca
  SET relevancia_id = rc.id
  FROM _rel r
  JOIN amenaza am ON am.codigo = r.amenaza
  JOIN control c ON c.codigo = r.control
  JOIN relevancia_control rc ON rc.nombre = r.relevancia
  WHERE ca.amenaza_id = am.id AND ca.control_id = c.id;
END $$;
