-- El hallazgo que sale del analisis de causa raiz de un incidente (REQ-SIG-07 3.2, O8).
--
-- Valor propio del enum y no SGSI con el codigo metido en el texto: el origen es tipado
-- para que «cuantos hallazgos vienen de incidentes» sea una consulta y no una busqueda
-- por subcadena. `origen_referencia` guarda el codigo del evento (EVT-AAAA-NNNN).
--
-- Se agrega al final y no en su posicion alfabetica: reordenar un enum en PostgreSQL
-- obliga a recrear el tipo y todas las columnas que lo usan, y el orden del enum no lo
-- lee nadie — las pantallas ordenan por etiqueta.
ALTER TYPE "origen_hallazgo" ADD VALUE IF NOT EXISTS 'INCIDENTE';
