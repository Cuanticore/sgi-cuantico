# Prompt para el desarrollador · REQ-SIG-17 bloque A

Copia todo lo que está debajo de la línea y pégalo como primer mensaje en la sesión del agente, con el repositorio clonado y la base de desarrollo levantada (`npm run db:up`).

---

Vas a construir el importador de la **primera carga de datos del SIG de CUANTICO**: las obligaciones del numeral 8, que son lo que pone en marcha el motor de tareas. Es una **carga de prueba**: el objetivo es ver el software andando con datos reales para después refinar, no dejar la base definitiva.

## 1 · Antes de escribir nada

Lee, en este orden:

1. **`docs/handoff_sig/carga-obligaciones-planes-contexto.md`** — el requerimiento. Es la fuente de verdad. Presta atención a §3 (por qué la fuente es el cronograma y no las políticas), §4.3 (cómo se derivó cada periodicidad) y §4.6 (los ocho defectos de la fuente).
2. **`docs/handoff_sig/carga-obligaciones-v1.xlsx`** — el libro de carga. **De acá lees los datos**, no del cronograma original. Empieza por la hoja `Leeme`.
3. `docs/handoff_sig/carga-de-datos.md` — el mapa general de orígenes. **Ojo: su §1 dice que el Cronograma SGC es una plantilla vacía y eso es falso.** El requerimiento lo corrige en su §2; si los dos se contradicen, manda REQ-SIG-17.
4. `prisma/seeds/activos.ts` y `prisma/seed.ts` — el patrón de semilla que vas a seguir: una función `seedXxx(prisma)`, idempotente por `upsert`, invocada desde `seed.ts`.

## 2 · La precondición que no se puede rodear

`Obligacion.responsableSeguimientoId` es **FK obligatoria a `Persona`**, y `Persona` sale del Directorio por Microsoft Graph con el app credential que ya existe (`SHAREPOINT_*`). **Sin personas no hay carga.**

`Persona.oid` es el object id de Azure AD, obligatorio y único. **No lo fabriques.** Si no podés correr la sincronización del Directorio, **detente y dilo**: sembrar tres personas con oid inventado deja la base mintiendo en la columna que identifica a la gente, y `OrigenPersona.MANUAL` existe justamente para marcar eso como anomalía, no como atajo.

Orden real: sincronizar Directorio → verificar que existan Daniel Medina (CEO), Laura Agudelo y Katherine Quiroga → recién ahí cargar.

## 3 · Qué construir

Un solo archivo nuevo, `prisma/seeds/obligaciones.ts`, con la firma del resto de las semillas, invocado desde `prisma/seed.ts` **después** de `seedMagerit` (que siembra áreas y cargos).

```
 0  Verificar Persona                     si no hay, abortar con mensaje explícito
 1  CargoResponsable · 2 altas            «Profesional de Calidad y Procesos»  (D-4)
                                          «Líder de proceso»                   (D-5)
 2  ContenidoSig (22) + VersionContenido (22)      hoja «Contenidos»
 3  Obligacion (27)                                hoja «Obligaciones»
 4  AnalisisContexto (2)                           §6 del requerimiento
```

Los pasos 2 y 3 van en **una transacción**. Un catálogo de 22 contenidos sin obligaciones no lo ejecuta nadie, y 27 obligaciones apuntando a contenidos a medias no arrancan.

Detalles que importan:

- **`ContenidoSig.codigo` lo emite el contador atómico** (`ContadorCodigo`/`ContadorContenido`), por tipo: `TAR-001`, `CAP-001`. La columna `CLAVE` del libro (`C01`…`C22`) **no es el código**: es solo la llave para enlazar las dos hojas durante la carga. No la persistas.
- **Nueve obligaciones comparten un contenido.** Las filas 33 a 41 del cronograma son la misma actividad para nueve procesos: un `ContenidoSig` (`C16`) y nueve `Obligacion` con `alcance = AREA`. Si te salen nueve contenidos, releé §4.4.
- **Cada `ContenidoSig` nace con su `VersionContenido` versión 1** y `publicadaPorId = null`: esas 22 versiones no tuvieron autor, y firmarlas en nombre de alguien sería falsificar.
- **`AnalisisContexto`: dos filas, cero entradas.** DOFA y PESTEL de 2026, `fechaAprobacion = 2026-04-22`, acta de referencia, aprobadas por Daniel Medina. Las casillas del DOFA y del PESTEL **no existen en ningún archivo del repositorio documental**; se escriben después en las pantallas de `app/estrategico/`. No las siembres.
- **Reusa las guardas, no las repitas.** `crearObligacion` en `app/sig/acciones/tareas.ts` ya valida contenido existente, responsable resuelto, `plazoDias > 0`, `diasAviso >= 0` y **exactamente un destino de alcance**. Si la semilla escribe directo con Prisma, tiene que respetar las mismas reglas; si podés, extrae la validación a una función y llámala desde los dos lados.

## 4 · Invariantes que no se negocian

1. **No inventes datos que falten.** Si un cargo, una persona o una fecha no se resuelve, la carga falla con el nombre de la fila del libro. No pongas un valor por defecto silencioso.
2. **Lo derivable se calcula, nunca se almacena.** Ningún estado, porcentaje ni vencimiento en columnas.
3. **Ningún plazo ni periodicidad en el código.** Vienen del libro, que es dato.
4. **La semilla es idempotente.** Correrla dos veces no duplica nada. Es el mismo requisito que cumplen las otras siete.
5. **`Asignacion` y `RegistroRealizado` no se cargan nunca.** Los produce el sistema al operar. Cargarlos estrena la base con ejecuciones que nadie hizo.
6. **La bitácora va en la misma transacción** que el hecho que registra.

## 5 · Las cifras que tienen que cuadrar

Son criterio de aceptación, no orientación. Si te sale otra, el error está en la lectura del libro, no en el libro.

| Consulta | Resultado |
|---|---:|
| `select count(*) from contenido_sig` | **22** |
| `select count(*) from version_contenido` | **22** |
| `select count(*) from obligacion where activa` | **27** |
| `obligacion` con `periodicidad = 'MENSUAL'` | **14** |
| `... = 'ANUAL'` | **8** |
| `... = 'TRIMESTRAL'` | **4** |
| `... = 'SEMESTRAL'` | **1** |
| `obligacion` con `alcance = 'AREA'` | **10** (9 de indicadores + satisfacción del cliente) |
| `select count(distinct contenido_id) from obligacion where alcance='AREA' and ...` (las 9 de indicadores) | **1** |
| `select count(*) from obligacion where fecha_inicio < '2026-09-01'` | **0** |
| `select count(*) from obligacion where es_proveedor` | **1** |
| `select count(*) from analisis_contexto` | **2** |
| `select count(*) from entrada_contexto` | **0** |
| `select count(*) from asignacion` **antes** de generar | **0** |
| `select count(*) from hallazgo` | **0** |

Y una que no es un conteo: **cero ocurrencias de `POL-CAL-01`, `FOR-GAF-07` y `FOR-GAF-04`** en `documento_codigo`. Son los tres códigos obsoletos del cronograma; el libro ya trae el vigente (G-3).

## 6 · Después de cargar

Corré `generarAsignaciones()` —está en `app/sig/acciones/tareas.ts` y **hoy no la llama nadie**— y luego **corréla otra vez**: el conteo de `Asignacion` no debe cambiar. Esa es la prueba de que la generación es idempotente, y es lo que más vale de esta carga de prueba.

Reportá cuántas asignaciones salieron y para quién. Con 27 obligaciones, catorce de ellas mensuales y diez por área, el número del primer periodo es el dato que dirá si los alcances están bien puestos.

## 7 · Lo que NO debes hacer

- **No cargues el bloque de acciones y planes.** Las 46 filas de `FOR-CAL-03` no tienen fecha de detección y `Hallazgo.fechaDeteccion` es obligatoria. Está en D-7 del requerimiento, abierta a propósito.
- **No siembres `EntradaContexto`.** Ver §3.
- **No agregues `BIMESTRAL` al enum `Periodicidad`.** La decisión D-3 lo dejó fuera de esta carga y dos obligaciones van `TRIMESTRAL` a sabiendas.
- **No toques los 234 activos, los 2.256 riesgos ni las 25 acciones del plan de tratamiento.** Son del SGSI y ya están cargados.
- **No corrijas el cronograma original.** Sus ocho defectos están documentados en §4.6 y el libro de carga ya los resuelve; arreglar el Excel de OneDrive es del lado de quien especifica.
- **No renombres claves de permiso.**

## 8 · Cómo reportar

Si algo del requerimiento no se puede construir como está escrito, **anotalo y seguí con lo que no dependa de eso.** No cambies el requerimiento ni el libro por tu cuenta, y no adivines la intención.

Al terminar, decime: qué cargó, qué no, las cifras de §5 comparadas con las reales, cuántas asignaciones generó la primera corrida y qué pasó en la segunda. Si alguna cifra no coincide, esa es la conversación.
