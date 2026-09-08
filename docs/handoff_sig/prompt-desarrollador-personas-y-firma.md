# Prompt de arranque · REQ-SIG-15 (edición de persona) y REQ-SIG-19 (firma por enlace público)

Copia todo lo que está debajo de la línea y pégalo como primer mensaje en la sesión del agente, con el repositorio ya clonado y en `main`.

**Aviso para quien especifica, no para el agente:** a diferencia del paquete REQ-SIG-13/14, **este no tiene planes paso a paso escritos**. Las dos especificaciones están cerradas y verificadas contra el código, pero el plan de ejecución lo escribe el agente y hay que revisarlo antes de que construya. El prompt lo pide así en su §2.

---

Vas a construir dos cosas en el SIG de CUANTICO, en este orden estricto: la **edición de una persona con sus pertenencias** y la **firma por enlace público**. Las dos especificaciones están escritas, verificadas contra el código y con sus decisiones cerradas. **No hay que diseñar el qué: hay que planear el cómo, ejecutarlo y detenerse donde la spec dice que hay que preguntar.**

El orden no es negociable: REQ-SIG-19 existe porque REQ-SIG-15 permite bloquear la cuenta de alguien que todavía tiene documentos sin firmar. Construir el bloqueo sin la salida deja gente sin poder cumplir.

## 1. Antes de escribir una línea

Lee `AGENTS.md` en la raíz. Esta versión de Next **no es la que conocés**: las guías están en `node_modules/next/dist/docs/`, y hay cambios que te van a morder si asumís lo de siempre.

Después, en este orden:

1. `docs/handoff_sig/decisiones-2026-09-02.md` — las diecisiete decisiones del sistema. **Es la fuente de verdad: si una spec dice otra cosa, manda este documento.**
2. `docs/handoff_sig/edicion-de-persona.md` — REQ-SIG-15 v1.1. Diez decisiones, todas cerradas.
3. `docs/handoff_sig/firma-con-enlace-publico.md` — REQ-SIG-19. Nueve decisiones; **D-3 y D-8 esperan visto bueno legal** y están marcadas (§5).
4. `docs/handoff_a/lectura-aceptacion-firma.md` — REQ-SIG-02, la spec que REQ-SIG-19 extiende. Sin ella no se entiende por qué el acta es como es.

Y leé el código que vas a tocar, antes de tocarlo: `lib/sig/generacion.ts`, `lib/sig/periodos.ts`, `lib/sig/prevision.ts`, `app/sig/acciones/firma.ts`, `lib/sig/firma.ts`, `app/sig/personas/Personas.client.tsx` y `app/components/sgsi/Popup.tsx`.

## 2. Lo primero que entregás es un plan, no código

Por cada requerimiento, escribí el plan en `docs/superpowers/plans/` con el formato de los que ya están ahí —`2026-09-08-sig-soportes-sharepoint.md` es el modelo— y **esperá el visto bueno antes de construir**. Una tarea por paso, con la prueba que tiene que fallar primero, el comando exacto y su salida esperada.

Dos razones por las que acá importa más que de costumbre: REQ-SIG-15 **cambia el generador de tareas para todo el sistema** (§5.2), y REQ-SIG-19 **toca el artefacto probatorio de las firmas**. Ninguna de las dos es una pantalla nueva que se pueda deshacer con un `revert` sin consecuencias.

## 3. Cómo se trabaja en este repositorio

- **Las decisiones se prueban; el cableado no.** Todo lo que decide algo —un nombre, un umbral, un piso de fechas, una política de reintentos— vive en un módulo puro de `lib/sig/` con su prueba en `__tests__`. Lo que toca Prisma o la red no lleva prueba unitaria: se verifica corriendo. Mismo criterio que `trabajos-catalogo.ts` frente a `trabajos.ts`.
- **`npm test` con jest.** Nada de otro corredor.
- **`npx tsc --noEmit -p tsconfig.json` no es opcional.** `next.config.js` tiene `typescript.ignoreBuildErrors: true`, así que el build **no** te avisa de un error de tipos.
- **Migraciones con `npx prisma migrate dev --name <nombre>`**, base local con `npm run db:up`.
- **La bitácora va en la misma transacción** que el hecho que registra (invariante 7).
- **Lo derivable se calcula, no se almacena** (invariante 1).
- **No hay borrados físicos** (invariante 2).
- **Los roles los dan los grupos de AD** (invariante 8). Las claves de permiso no se renombran; las nuevas se agregan al vocabulario de `lib/sgsi/permisos.ts`.

## 4. Doce cosas que no se negocian en estos dos requerimientos

Si alguna te estorba, **pará y preguntá.** No la rodees.

1. **Ninguna asignación nace vencida.** El piso de una asignación es el más tardío de tres instantes: `obligacion.creadaEn`, el ingreso de la persona y el inicio de su pertenencia. Y el piso no solo salta periodos cerrados: **corre `fechaApertura` y con ella la fecha límite**, o una obligación mensual con plazo de 15 días le crea a quien entra el día 28 una tarea vencida en el mismo instante en que se crea. (REQ-SIG-15 §5.2, P16–P18.)
2. **La etiqueta del periodo NO cambia con el piso.** Sigue siendo la del calendario (`2026-09`). La llave única `@@unique([obligacionId, personaId, periodo, activoId])` es lo que hace idempotente al cron: si la etiqueta llevara la fecha de ingreso, la corrida siguiente crearía una segunda fila para el mismo periodo.
3. **La misma regla del piso rige para el popup y para el cron.** Vive en el módulo puro y la llaman los dos. Si discrepan, el número que el popup informa al guardar es falso a la mañana siguiente.
4. **El número de tareas que informa el popup es un hecho, no una previsión.** Guardar la pertenencia y generar las asignaciones ocurren en la **misma transacción**, y se genera **solo para esa persona** — no corriendo el trabajo `generar-asignaciones`, que devolvería un total con las de todos los demás.
5. **El grupo de interés «Todos» es derivado: no tiene filas de membresía y su casilla no se puede desmarcar.** Elegirlo en una obligación guarda `alcance: 'TODOS'`, que ya existe. Dos representaciones de «todo el mundo» divergen, y una fila de membresía que faltó deja a alguien fuera del curso de concienciación **sin aparecer en ninguna lista de faltantes**.
6. **Un grupo de interés no otorga ningún permiso.** El acceso lo siguen dando solo los grupos del Directorio. Dos fuentes de autorización dejan sin respuesta la pregunta «quién autorizó esto».
7. **Al bloquear una cuenta, `revokeSignInSessions` no es opcional.** Deshabilitar la cuenta no invalida el token que la persona ya tiene: sigue dentro hasta una hora. Un bloqueo por incidente que deja a alguien dentro una hora no contiene nada.
8. **Para bloquear se piden `User.EnableDisableAccount.All` y `User.RevokeSessions.All`, nunca `User.ReadWrite.All`.** El segundo da escritura sobre todos los atributos de todas las cuentas del tenant a un secreto que vive en un `.env`.
9. **La pestaña de licencias no pide ningún permiso nuevo y no escribe nada.** Ya se comprobó que las dos consultas responden con el consentimiento vigente. Al construirla, **anotá en REQ-SIG-19 §7 qué permiso las habilitó**.
10. **Del token de firma se guarda el hash, nunca el token.** Y el token no aparece en la bitácora, ni en un log, ni en un mensaje de error: lo que se registra es el código `ENL-2026-0007`. Un token en la bitácora es un token en manos del grupo que audita las firmas.
11. **Un solo núcleo de firma, dos puertas.** La transacción de `firmarYAceptar` —registro, evidencia, acta, cierre y bitácora, que es la regla F7— se **extrae** a una función que recibe el autor y el medio de identificación, y la llaman las dos vías. Copiarla garantiza que el próximo cambio se desincronice y que el defecto aparezca en las actas de una sola de las dos.
12. **El acta declara el medio real de identificación.** El numeral 5 actual dice que la confiabilidad se sustenta en «el control de acceso a la cuenta corporativa con la que se autenticó quien firma»; en la vía por enlace eso es **falso**, y el acta es el documento que se le muestra a un auditor. Va un numeral 5 propio (REQ-SIG-19 §7). Con sesión corporativa el texto no cambia **un carácter**: ninguna acta existente puede cambiar de huella.

## 5. Lo que NO debes hacer

- **No editar el nombre ni el correo de una persona.** Los manda el Directorio y la sincronización los sobrescribe a las 05:00. Un campo editable cuyo valor se revierte solo es peor que uno bloqueado.
- **No asignar ni quitar licencias** (D-2 de REQ-SIG-15). Quitar una de Exchange arranca el reloj de 30 días del buzón.
- **No escribir membresías en grupos de Azure** (D-4 de REQ-SIG-15). Exigiría `GroupMember.ReadWrite.All`, con el que la aplicación podría agregar a alguien al grupo que le da acceso a ella misma.
- **No recalcular la fecha límite de ninguna asignación existente.** La regla del piso se aplica **al generar**. Mover el plazo de una tarea abierta es una prórroga, con su motivo y su fila de bitácora; un `UPDATE` masivo borraría la diferencia entre un plazo concedido y uno cambiado por un despliegue.
- **No cerrar, anular ni reasignar tareas automáticamente** al cambiar de área, de grupo, o al bloquear. Se listan y se ofrece qué hacer con ellas (R9).
- **No permitir la firma por delegación**, ni con enlace ni sin él. Quien emite el enlace habilita el canal; firma la persona.
- **No emitir el enlace de firma si la cuenta corporativa está habilitada** (D-6 de REQ-SIG-19). Una vía de excepción que se puede usar sin excepción deja de ser una excepción.
- **No crear sesión con el enlace**, ni agregar rutas públicas para «ver mi historial» o «descargar mi acta» (D-9). Cada ruta pública nueva es superficie de ataque sobre la aplicación que gobierna el SGSI.
- **No convertir el acta a PDF.** Sigue siendo el `.txt` con su huella. Cambiar el formato altera la huella de lo ya firmado y es otro requerimiento.
- **No renombrar `middleware.ts` a `proxy.ts`.** El proyecto lo mantiene así a propósito.
- **No inventar datos que falten.** Si a alguien le falta el correo personal o el documento de identidad, el enlace **no se emite y la pantalla dice qué falta**. Un botón que falla en silencio no es un resultado aceptable.

## 6. Tres cosas que no dependen de ti, y bloquean producción

Pedilas el primer día:

1. **Azure:** los dos permisos de **aplicación** del punto 8, con consentimiento de administrador. Mientras no estén, `GRAPH_BLOQUEO_HABILITADO` queda en `false` y **el botón de bloqueo no se dibuja** — ese es el comportamiento correcto, no lo «arregles» pidiendo `User.ReadWrite.All`.
2. **El visto bueno legal de D-3 de REQ-SIG-19**: si la firma electrónica simple por enlace alcanza para lo que la organización le va a dar. No bloquea construir; bloquea usarlo con ex colaboradores.
3. **El plazo del enlace (D-8)**, hoy 7 días por defecto. Es parámetro, así que cambiarlo después no es un despliegue.

## 7. Lo primero que hay que medir, antes de construir REQ-SIG-19

La consulta está en §1 de la spec. Correla y decime el resultado: cuántas personas inactivas tienen firmas pendientes, y **cuántas de ellas tienen `correo_personal` cargado**. Si hay gente sin correo personal, este requerimiento no puede ayudarles y el primer trabajo no es de programación.

## 8. Cómo reportar

Si una spec contradice al código, o algo especificado no se puede construir como está escrito: **anotalo y seguí con lo que no dependa de eso.** No cambies la spec por tu cuenta y no adivines la intención — el documento de decisiones se actualiza del lado de quien especifica.

Al terminar cada plan, decime qué quedó construido, qué no y por qué, y qué verificación del checklist quedó sin correr. Los checklists son §11 de REQ-SIG-15 (21 puntos) y §11 de REQ-SIG-19 (17 puntos), y son la definición de «hecho».
