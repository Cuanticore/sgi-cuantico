# Prompt de arranque · REQ-SIG-16 (asignar equipos a las personas)

Copia todo lo que está debajo de la línea y pégalo como primer mensaje en la sesión del agente, con el repositorio ya clonado y en `main`.

**Aviso para quien especifica, no para el agente:** la especificación está cerrada y verificada contra el código, pero **dos decisiones esperan tu visto bueno** y el prompt le dice al agente que se detenga en ellas: **D-11** (la columna `esDelColaborador`, que es la única migración) y **D-4** (valoración obligatoria en el alta). Si las ratificás antes de arrancar, borrá el §7 de este prompt y el agente no se detiene.

---

Vas a construir en el SIG de CUANTICO la **asignación de equipos a las personas**: un popup en la pantalla de Equipos que permite entregarle a alguien un activo del inventario, crear el activo si no existe, y exigir el acta de borrado cuando el equipo ya estuvo en manos de otro. La especificación está escrita, verificada contra el código y con sus decisiones cerradas salvo dos. **No hay que diseñar el qué: hay que planear el cómo, ejecutarlo y detenerse donde la spec dice que hay que preguntar.**

## 1. Antes de escribir una línea

Leé `AGENTS.md` en la raíz. Esta versión de Next **no es la que conocés**: las guías están en `node_modules/next/dist/docs/`, y hay cambios que te van a morder si asumís lo de siempre.

Después, en este orden:

1. `docs/handoff_sig/decisiones-2026-09-02.md` — las diecisiete decisiones del sistema. **Es la fuente de verdad: si una spec dice otra cosa, manda este documento.**
2. `docs/handoff_sig/asignar-equipo-desde-inventario.md` — REQ-SIG-16 v1.3. Trece decisiones; **D-4 y D-11 esperan visto bueno** y están marcadas (§7).
3. `docs/handoff_a/lectura-aceptacion-firma.md` — REQ-SIG-02. Sin ella no se entiende qué es `ActaAceptacion`, que este requerimiento **lee** para el caso BYOD.
4. `docs/handoff_a/directorio-de-colaboradores.md` §3.1 y §3.2 — los dos ciclos. De ahí sale por qué la aceptación de los lineamientos va **antes** que el equipo.

Y leé el código que vas a tocar, antes de tocarlo: `app/sgsi/acciones/activos.ts` (entero: es donde vive todo lo que vas a extender), `app/tecnologia/equipos/page.tsx`, `app/tecnologia/equipos/Equipos.client.tsx`, `app/components/sgsi/Popup.tsx`, `app/components/sgsi/activos/ficha.query.ts` y `lib/sgsi/bitacora.ts`.

## 2. Lo primero que entregás es un plan, no código

Escribí el plan en `docs/superpowers/plans/` con el formato de los que ya están ahí —`2026-09-08-sig-soportes-sharepoint.md` es el modelo— y **esperá el visto bueno antes de construir**. Una tarea por paso, con la prueba que tiene que fallar primero, el comando exacto y su salida esperada.

Sugerencia de corte, no obligatoria: **(F1)** la asignación y el alta con su bitácora, que es lo que hace que la pantalla deje de mostrar 36 filas rojas; **(F2)** la titularidad BYOD con la verificación del acta de aceptación; **(F3)** el acta de borrado. F1 entrega valor solo y las otras dos se apilan encima sin rehacerlo.

## 3. Cómo se trabaja en este repositorio

- **Las decisiones se prueban; el cableado no.** Todo lo que decide algo —un filtro, un default, una condición de rechazo— vive en un módulo puro con su prueba en `__tests__`. Lo que toca Prisma o la red no lleva prueba unitaria: se verifica corriendo.
- **`npm test` con jest.** Nada de otro corredor.
- **`npx tsc --noEmit -p tsconfig.json` no es opcional.** `next.config.js` tiene `typescript.ignoreBuildErrors: true`, así que el build **no** te avisa de un error de tipos.
- **Migraciones con `npx prisma migrate dev --name <nombre>`**, base local con `npm run db:up`.
- **La bitácora va en la misma transacción** que el hecho que registra (invariante 7).
- **Lo derivable se calcula, no se almacena** (invariante 1).
- **No hay borrados físicos** (invariante 2).
- **Los roles los dan los grupos de AD** (invariante 8). Las claves de permiso no se renombran; las nuevas se agregan al vocabulario de `lib/sgsi/permisos.ts`.

## 4. Lo primero que hay que entender: por qué el tablero dice 0

`Activo.personaId` existe desde el 01/09 (`schema.prisma:675`), la pantalla lo lee (`app/tecnologia/equipos/page.tsx:30-46`) y **ninguna acción lo escribe**. No está en `DatosGenerales` (`activos.ts:95-115`), no está en `ActivoNuevo` (`activos.ts:212-231`), no se dibuja en la ficha. El enlace «+ Asignar desde el inventario» lleva a `/sgsi/inventario`, donde el campo tampoco está.

Comprobalo antes de arrancar, es un minuto:

```bash
grep -rn "personaId" app/sgsi/acciones/activos.ts app/components/sgsi/activos/ | wc -l   # → 0
```

Si te da 0, entendiste el requerimiento: **no es una pantalla nueva sobre un dato existente, es abrirle la escritura a un campo que nadie escribe.**

## 5. Once cosas que no se negocian

Si alguna te estorba, **pará y preguntá.** No la rodees.

1. **Un campo, un camino.** La custodia se escribe **solo** desde este popup. No la agregues a `DatosGenerales` ni a la ficha del activo (D-5). Y al revés: el popup escribe la custodia y **ningún otro campo** del activo. Nombre, área, tipo y valoración se siguen editando en la ficha.
2. **La bitácora escribe nombres, no ids.** `valorAnterior: 'Carlos Andrés Mejía'`, no `12`. Sin tabla de historia (D-2), esa fila es **el único registro** de que el equipo cambió de manos, y dentro de un año nadie va a saber quién era el 12.
3. **La primera pregunta es de quién es el equipo, no si es nuevo.** BYOD es la mayoría del parque —el SoA lo declara en A.6.7 y A.8.1— y decide todo lo demás: qué acta corresponde, qué métodos de borrado son legales y si el activo puede reasignarse.
4. **Sin aceptación de los lineamientos no se registra el equipo BYOD.** Es bloqueo, no aviso (D-12). PRO-TAL-01 es tajante: ningún acceso se habilita antes de que las obligaciones estén suscritas. El acta no se crea acá: **se consulta** la de `ActaAceptacion` que ya se firmó al ingresar.
5. **Un equipo BYOD no se reasigna nunca.** Se va con su dueño. Al salir la persona, se da de baja con su acta de retiro remoto; no se libera para nadie (T5).
6. **El equipo usado no se entrega sin acta de borrado, y la validación va en el servidor.** El acta tiene que ser **de la persona que lo tuvo** y **cubrir ese activo**, las dos condiciones. Una validación que solo vive en el cliente se salta llamando a la acción directamente, y ésta sostiene un control de la norma.
7. **El borrado que no se hizo no se registra.** No inventes un estado «pendiente». La asignación se detiene, el equipo se deja liberado, y el pendiente **se deriva** de una consulta (B4, B5).
8. **El formulario del acta va en `app/components/sgsi/ActaBorrado.tsx`, no dentro del popup.** La desvinculación de REQ-SIG-09 necesita el mismo, y si nace embebido, esa pantalla va a escribir su propia versión: dos formas de crear el acta que cierra A.8.10.
9. **La valoración por defecto es `2/2/4` y sale de `Parametro`.** El 4 en confidencialidad no es decorativo: `max(D,I,C) = 4` es exactamente `umbral_valoracion`, así que el equipo **entra** al análisis. Con 3 los 36 portátiles quedarían fuera de las matrices y el inventario de equipos no tocaría el SGSI en ningún punto.
10. **El filtro de subtipos es por par `tipo/subtipo`, no por subtipo suelto.** `[mobile]` existe en `[HW]` (un portátil) y en `[COM]` (la red celular). Filtrar por el código a secas mete una red de comunicaciones en la lista de equipos entregables.
11. **La corrida de arranque es el caso de uso real del primer día.** Hay ~21 activos de hardware para 36 personas: **crear va a ser lo normal, no la excepción**. El formulario recuerda la última alta, «Guardar y seguir» no cierra el popup, y ni la pregunta de titularidad ni la de nuevo/usado le cobran un clic a esa corrida. Si tu implementación obliga a cerrar y reabrir 36 veces, no cumpliste el requerimiento aunque pasen las pruebas.

## 6. Lo que NO debes hacer

- **No agregues una tabla de historia de custodia.** Se decidió no tenerla (D-2). Si te parece que hace falta —y hay un argumento—, anotalo y seguí.
- **No guardes fecha de entrega.** No hay columna y es deliberado. La fecha que queda es la de la bitácora.
- **No liberes equipos automáticamente al desvincular o bloquear** (P21). Se quedan apuntando a la persona inactiva para poder armar el acta de borrado, y la pantalla agrega el renglón que los hace visibles.
- **No sincronices dispositivos desde Intune** (D-13). Ni cumplimiento, ni cifrado, ni versión de sistema operativo. Ese registro ya existe y es el de Intune; el SGSI registra lo que Intune no sabe.
- **No ejecutes el borrado remoto.** Se registra que se hizo. Lo ejecuta Intune, desde su consola.
- **No crees una `Solicitud` para pedir el borrado** (D-10). `TipoSolicitud` no tiene ese valor y no hace falta un flujo de pide-autoriza-ejecuta para algo que hace la misma persona que entrega el equipo.
- **No toques el generador de tareas.** El alcance por activo se reparte al **propietario**, que es un cargo (`lib/sig/generacion.ts:186-192`). La custodia persona no participa en ninguna resolución de alcance, y el popup **no** informa tareas generadas: serían cero (D-7).
- **No inventes área, cargo ni valoración cuando falten.** El prefijo del área forma el código del activo y el código es **inmutable**: un `TEC-EQU-0022` emitido con un área adivinada no se corrige nunca. Si la persona no tiene área, el alta se rechaza y dice qué falta.
- **No agregues un segundo camino de alta de activos.** `crearActivo` se extiende con dos campos; el contador de códigos sigue siendo uno solo.

## 7. Dos cosas que no dependen de ti — pará y preguntá al llegar

1. **D-11 · la columna `Activo.esDelColaborador`.** Es la **única migración** del requerimiento y contradice la propiedad de «no toca el esquema» que traía la versión anterior de la spec. Verificá vos mismo que no se deriva —`propietarioId` está vacío en los 234 activos por diseño (`schema.prisma:658-661`), `Proveedor` guarda organizaciones y el subtipo dice qué aparato es— y **preguntá antes de correr `migrate dev`**. Si se rechaza, F1 y F3 se construyen igual; F2 no.
2. **D-4 · valoración obligatoria en el alta.** Es más estricto que `crearActivo`, que la acepta vacía. Si se relaja, hace falta una lista y un conteo de «equipos creados sin valorar», o el hueco queda invisible.

Y una que sí depende de vos y hay que pedir el primer día: **cuál es el `ContenidoSig` de los lineamientos de dispositivos personales**, para sembrar el parámetro `contenido_lineamientos_dispositivos`. Sin él, la verificación de T3 no tiene contra qué comparar. Si ese contenido todavía no existe en la base, decilo: el caso BYOD —que es la mayoría— no se puede construir completo, y eso es una respuesta válida, no un bloqueo tuyo.

## 8. Lo primero que hay que medir, antes de construir

Tres consultas. Corrélas y decime el resultado antes del plan:

1. **Cuántos activos vigentes caen en los subtipos asignables.** Es el tamaño real de la lista de candidatos, y de él depende si la búsqueda del popup necesita paginación del servidor o le alcanza con un `useMemo`.
2. **Cuántas de las 36 personas activas tienen área y cargo.** Si son cero —que es lo que la pantalla sugiere, todas dicen `sin área`— entonces el alta va a rechazar todo hasta que REQ-SIG-15 esté construido, y **eso hay que saberlo antes de planear, no al probar**.
3. **Cuántas personas activas tienen firmada la aceptación de los lineamientos.** Es cuánta gente va a poder registrar su equipo BYOD el primer día. Si son pocas, el primer trabajo no es de programación.

## 9. Cómo reportar

Si la spec contradice al código, o algo especificado no se puede construir como está escrito: **anotalo y seguí con lo que no dependa de eso.** No cambies la spec por tu cuenta y no adivines la intención — el documento de decisiones se actualiza del lado de quien especifica.

Al terminar cada fase, decime qué quedó construido, qué no y por qué, y qué verificación del checklist quedó sin correr. El checklist es **§8 de REQ-SIG-16, 38 puntos**, y es la definición de «hecho». Los que más importan y los que más se saltan: la **9b** —las 36 altas seguidas sin cerrar el popup ni una vez— y la **18**, que exige llamar a la acción de servidor **directamente**, sin pasar por la pantalla, para comprobar que el acta se valida donde tiene que validarse.
