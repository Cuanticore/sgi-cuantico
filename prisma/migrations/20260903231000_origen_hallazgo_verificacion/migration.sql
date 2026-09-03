-- El hallazgo que sale de una ejecucion de verificacion programada (REQ-SIG-07 3.3).
--
-- Va SOLO en su propia migracion: en PostgreSQL un `ALTER TYPE ... ADD VALUE` no puede
-- compartir transaccion con sentencias que USEN el valor nuevo, y separarlo es mas barato
-- que razonar cada vez sobre si alguna de las que vienen lo usa.
ALTER TYPE "origen_hallazgo" ADD VALUE IF NOT EXISTS 'VERIFICACION';
