# Prompt de arranque · REQ-SIG-13 (soportes en SharePoint) y REQ-SIG-14 (player SCORM)

Copia todo lo que está debajo de la línea y pégalo como primer mensaje en la sesión del agente, con el repositorio ya clonado y en `main`.

---

Vas a construir dos cosas en el SIG de CUANTICO, en este orden: la **publicación de los soportes en SharePoint** y el **player de SCORM 2004**. La especificación y el plan paso a paso ya están escritos y verificados contra el código. **No hay que diseñar nada: hay que ejecutar, y detenerse donde el plan dice que hay que preguntar.**

## 1. Antes de escribir una línea

Lee `AGENTS.md` en la raíz. Esta versión de Next **no es la que conocés**: las guías están en `node_modules/next/dist/docs/`, y hay cambios que te van a morder si asumís lo de siempre.

Después, en este orden:

1. `docs/handoff_sig/decisiones-2026-09-02.md` — las diecisiete decisiones del sistema. **Es la fuente de verdad: si una spec dice otra cosa, manda este documento.**
2. `docs/handoff_sig/soportes-en-sharepoint.md` — REQ-SIG-13, decisiones D-1 a D-4 cerradas.
3. `docs/handoff_sig/player-scorm-2004.md` — REQ-SIG-14, decisiones D-1 a D-5 cerradas.
4. Los tres planes, que son lo que vas a ejecutar tarea por tarea:
   - `docs/superpowers/plans/2026-09-08-sig-soportes-sharepoint.md` (9 tareas)
   - `docs/superpowers/plans/2026-09-08-sig-scorm-f1-ejecucion.md` (11 tareas)
   - `docs/superpowers/plans/2026-09-08-sig-scorm-f2-cierre.md` (8 tareas)

Los planes traen el código completo de cada paso, la prueba que tiene que fallar primero, el comando exacto y su salida esperada. Seguilos en orden y commiteá donde dicen.

## 2. Cómo se trabaja en este repositorio

- **Las decisiones se prueban; el cableado no.** Todo lo que decide algo —un nombre, un umbral, un código de error, una política de reintentos— vive en un módulo puro de `lib/sig/` con su prueba en `__tests__`. Lo que toca Prisma o la red no lleva prueba unitaria: se verifica corriendo. Mismo criterio que `trabajos-catalogo.ts` frente a `trabajos.ts`.
- **`npm test` con jest.** Nada de otro corredor.
- **`npx tsc --noEmit -p tsconfig.json` no es opcional.** `next.config.js` tiene `typescript.ignoreBuildErrors: true`, así que el build **no** te avisa de un error de tipos.
- **Migraciones con `npx prisma migrate dev --name <nombre>`**, base local con `npm run db:up`.
- **La bitácora va en la misma transacción** que el hecho que registra (invariante 7).
- **Lo derivable se calcula, no se almacena** (invariante 1). Las columnas derivadas que sí aparecen en los planes —`completionStatus`, `estado` de una publicación— están ahí porque son la consulta de un tablero o la cola de un trabajo, y el plan lo dice donde toca.
- **No hay borrados físicos** (invariante 2). La baja de una evidencia publicada se anota; el archivo en SharePoint no se borra.
- **Los roles los dan los grupos de AD** (invariante 8). Las claves de permiso son `operacion:*`, `sgsi:*`, `tecnologia:*` y no se renombran.

## 3. Diez cosas que no se negocian en estos dos requerimientos

Si alguna te estorba, **pará y preguntá.** No la rodees.

1. **Ninguna llamada a Microsoft Graph dentro de una transacción de Prisma.** El cliente HTTP tiene 10 s de timeout; una transacción esperándolo sostiene sus bloqueos todo ese tiempo. **Si Graph está caído, la firma se completa igual** y el soporte queda pendiente.
2. **Al subir a SharePoint, `conflictBehavior: fail`. Nunca `replace` ni `rename`.** `replace` permitiría sobrescribir un acta firmada. Un 409 significa «ya está publicado» y se resuelve consultando el ítem: es lo que hace idempotente el reintento del cron.
3. **La carpeta base de SharePoint no se crea: se exige.** Un 404 sobre `SHAREPOINT_SOPORTES_PATH` es un fallo con mensaje, no una carpeta nueva.
4. **La carpeta de cada persona se direcciona por su `driveItem.id`, no por su nombre.** Alguien la va a renombrar desde SharePoint, y las publicaciones tienen que seguir cayendo donde deben.
5. **El enlace a SharePoint sólo se muestra a quien puede abrirlo.** La carpeta está restringida a los responsables (D-4): en `/mi-sig` la persona recibe la ruta de la aplicación, nunca el `webUrl`. Un enlace que devuelve «acceso denegado» hace parecer roto lo que funciona.
6. **El contenido de los cursos se sirve desde un origen distinto al de la aplicación.** No es preferencia: un SCO es JavaScript de un tercero, y en el origen del SIG podría invocar las server actions con la sesión de quien ve el curso. El `sandbox` del iframe **no** sustituye esto —sin `allow-same-origin` el SCO no alcanza `API_1484_11` por la cadena de padres, y con `allow-same-origin` el sandbox queda anulado—. Si el origen aparte no está configurado, el player **no corre y lo dice**.
7. **`postMessage` valida `event.origin` en las dos direcciones, siempre.** Un `'*'` acá es entregarle la API a cualquier página que logre abrir el runner en un iframe.
8. **El servidor valida cada escritura del modelo de datos**, con el mismo módulo puro que usa el runner. Un cliente puede mandar `cmi.success_status=passed`; el servidor decide si el elemento es escribible, si el valor cumple su tipo y si el intento está abierto.
9. **Los códigos de error de SCORM se implementan, no se aproximan.** Un curso bien hecho ramifica según el código: devolver siempre 101 hace que decida mal y que el defecto parezca del curso.
10. **Con paquete SCORM, la capacitación no se cierra a mano.** El formulario de asistencia y nota desaparece de la pantalla **y la acción del servidor lo rechaza**. Dejar los dos caminos abiertos permitiría declararse aprobado en el curso que no se abrió.

## 4. Lo que NO debes hacer

- **No convertir el acta de firma a PDF.** Hoy el artefacto es texto plano (`app/sig/acciones/firma.ts:181-186`), el campo se llama `pdfId` por herencia, y cambiar el formato altera la huella SHA-256 de lo ya firmado. Publicá lo que existe; convertirlo es otro requerimiento.
- **No mover los anexos que sube la gente a SharePoint** (D-2 de REQ-SIG-13).
- **No construir el motor de secuenciación IMS SS ni soportar multi-SCO** (D-3 de REQ-SIG-14). Un paquete con dos SCO se **rechaza con el motivo a la vista**; ejecutar el primero cerraría la asignación con medio curso visto.
- **No soportar SCORM 1.2, xAPI ni cmi5.** Es otro modelo de datos; agregarlo «de paso» produce un player que cumple mal los dos.
- **No descomprimir el paquete al disco del contenedor.** El contenedor de la aplicación **no tiene volumen** (`docker-compose.prod.yml:68-84`): lo que escriba ahí desaparece en el próximo despliegue, y la capacitación obligatoria devolvería 404 sin que nadie tocara nada. Los archivos van a Postgres.
- **No renombrar `middleware.ts` a `proxy.ts`.** El proyecto lo mantiene así a propósito: el rename cambia el runtime de edge a nodejs y necesita su propia verificación, que no es parte de esto.
- **No inventar datos que falten.** Si un soporte no se pudo publicar, la pantalla dice por qué. Si un curso no cargó, la pantalla dice qué falta. Un iframe en blanco o un «error» genérico no son resultados aceptables.

## 5. Dos cosas que no dependen de ti, y bloquean producción

Pedilas el primer día, porque sin ellas el código correcto igual no publica ni ejecuta:

1. **Azure:** permiso de **aplicación** `Sites.Selected` con consentimiento de administrador, y rol `write` concedido **sólo** sobre el sitio `Cuantico` (REQ-SIG-13 §8). No pidas `Files.ReadWrite.All`: daría escritura sobre todo el tenant a un secreto que vive en un `.env`.
2. **DNS y certificado** para el origen de contenido de los cursos (`cursos.sig.cuantico.com`), y la regla del proxy inverso que en ese host enruta **sólo** `/scorm/*`. Las cookies de sesión deben seguir siendo *host-only*: un `Domain=.cuantico.com` anularía el aislamiento en silencio.

Mientras no estén, cada publicación termina `BLOQUEADO` con `SIN_PERMISO` y el player dice que no hay origen configurado. **Ese es el comportamiento correcto** — no lo «arregles» sirviendo el contenido desde el origen de la aplicación.

## 6. Cómo reportar

Si una spec contradice al código, o algo especificado no se puede construir como está escrito: **anotalo y seguí con lo que no dependa de eso.** No cambies la spec por tu cuenta y no adivines la intención — el documento de decisiones se actualiza del lado de quien especifica.

Al terminar cada plan, decime qué quedó construido, qué no y por qué, y qué verificación del checklist quedó sin correr.
