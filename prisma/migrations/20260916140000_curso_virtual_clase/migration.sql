-- REQ-SIG-26 · D-1 · la clase del curso virtual se DECLARA.
--
-- ESCRITA A MANO, no generada por `prisma migrate dev`: el equipo donde se desarrolló esta
-- tanda no tiene base de datos. Es el mismo SQL que Prisma emite para un enum nuevo más una
-- columna opcional, y el esquema pasa `prisma validate`. **No se ejecutó contra ninguna
-- base.**
--
-- VA EN UNA SOLA TRANSACCIÓN, y eso no contradice a `20260915180000_curso_virtual`. La
-- restricción de Postgres es sobre `ALTER TYPE ... ADD VALUE`: un valor agregado a un enum
-- existente no se puede USAR en la misma transacción en que se agrega. Acá `clase_curso` es
-- un tipo NUEVO, y crear un tipo y usarlo en la misma transacción es correcto.
--
-- ADITIVA: la columna nace opcional y sin valor por defecto, así que ninguna fila existente
-- queda inválida por agregarla. Lo único que escribe es el backfill del final.

-- CreateEnum
CREATE TYPE "clase_curso" AS ENUM ('PAQUETE', 'ENLACE');

-- AlterTable
--
-- SIN DEFAULT a propósito. Un `DEFAULT 'PAQUETE'` le pondría clase de curso a las lecturas,
-- las tareas y las verificaciones, y el invariante que sostiene el servidor es que la clase
-- existe si y sólo si el contenido es un CURSO_VIRTUAL. Una columna con default la llenaría
-- de filas que dicen algo falso sobre sí mismas.
ALTER TABLE "contenido_sig" ADD COLUMN "clase_curso" "clase_curso";

-- Backfill.
--
-- NO ES LIMPIEZA: ES PARTE DE LA MIGRACIÓN. Un CURSO_VIRTUAL con la clase en NULL queda en
-- un estado que la aplicación no sabe mostrar y que la validación del servidor rechaza —la
-- ficha no sabría si ofrecer el cargador de paquete o el campo de enlace—. La migración no
-- puede dejar filas en ese estado ni por un minuto.
--
-- `PAQUETE` y no `ENLACE` porque los cursos virtuales que existen hoy son los de
-- `20260915220000_cursos_virtuales`, y los dos se recorren dentro de la aplicación con su
-- paquete SCORM. El de inducción es de clase DESPACHO —el contenido lo entrega Coursebox—,
-- que NO es lo mismo que un enlace externo: en el despacho la persona no sale de la
-- aplicación, el reproductor sigue reportando y el cierre sigue siendo automático.
--
-- Idempotente y a prueba de una base vacía: si no hay ningún curso virtual, no toca nada.
UPDATE "contenido_sig" SET "clase_curso" = 'PAQUETE' WHERE "tipo" = 'CURSO_VIRTUAL';
