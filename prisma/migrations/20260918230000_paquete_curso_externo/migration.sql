-- REQ-SIG-24 · el id del curso en el proveedor de despacho (Coursebox).
--
-- Se saca del `course_token` del paquete al analizarlo, y es la llave con la que el webhook
-- «Course Completed» de Coursebox (campo `courseId`) cruza el resultado con el paquete que la
-- persona ejecutó. Nulo en un AUTOCONTENIDO: ahí no hay proveedor externo que reporte nada.
ALTER TABLE "paquete_scorm" ADD COLUMN "curso_externo_id" TEXT;
