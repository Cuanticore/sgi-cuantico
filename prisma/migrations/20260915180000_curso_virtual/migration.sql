-- REQ-SIG-24 · «Curso Virtual» como tipo de contenido propio.
--
-- ESCRITA A MANO, no generada por `prisma migrate dev`: el equipo donde se desarrolló esta
-- tanda no tiene base de datos. Es el mismo SQL que Prisma emite para agregar un valor a un
-- enum, y el esquema pasa `prisma validate`. **No se ejecutó contra ninguna base.**
--
-- ADITIVA Y SIN RIESGO SOBRE LO EXISTENTE: agregar un valor a un enum no toca ni una fila.
-- Los contenidos que hoy son CAPACITACION siguen siendo CAPACITACION — esta migración no
-- migra ninguno, y esa decisión es deliberada: cuál de las capacitaciones existentes es en
-- realidad un curso virtual lo sabe quien las creó, no una regla automática que mire si hay
-- un zip cargado.
--
-- UN VALOR Y NO DOS. Postgres 12 y posteriores admiten `ADD VALUE` dentro de la transacción
-- en que corre la migración mientras el valor nuevo no se USE en esa misma transacción.
-- Acá sólo se agrega, así que no hay nada que separar en dos pasos.

-- AlterEnum
ALTER TYPE "tipo_contenido" ADD VALUE 'CURSO_VIRTUAL';
