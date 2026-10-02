# Proposal: Hoja de vida del sistema · cierre de diligenciamiento y API de servicio

## Intent

La hoja de vida del sistema de información (`FOR-TEC-04`) **ya es un componente del SIG**: REQ-SIG-08 la especificó, la migración `20260904090000_gestion_tecnologica` la creó y `app/tecnologia/*` la muestra. Lo que no existe es la forma de **llenarla** y la forma de **sacarla**.

Medido por lo que una persona puede hacer sin tocar la base de datos: de las nueve hojas de detalle del formato, tres tienen escritura funcional (Sistemas parcial, Excepciones, Datos personales), cuatro no tienen ningún camino de carga (`RequisitoSeguridad`, `PruebaSeguridad`, `Liberacion`, `ComponenteTercero`), y la verificación de los 73 ítems de PTR-TEC-03 es de sólo lectura. `crearSistema` no acepta `criticidad`, `clasificacionId`, `rolTratamiento`, `rtoObjetivo` ni `rpoObjetivo`, y **no existe ninguna acción de actualización** — de modo que `faltantesDeHojaDeVida` (`lib/sig/desarrollo.ts:292-312`) sabe detectar «sin criticidad» y «sin RTO/RPO» sin que exista pantalla donde cerrar ese faltante. `PuertaSistema.evidenciaId` existe en el schema desde la migración y **ningún código lo escribe**: columna muerta.

El resultado es que el formato se sigue diligenciando a mano. El registro del último traslado del expediente SIS-001 lo documenta: **464 comentarios de celda**, cinco reglas de mapeo aplicadas a mano, 214 casillas marcadas `[PENDIENTE]`, 156 valores reales que no calzaban en sus listas desplegables, y verificación abriendo el libro en LibreOffice para recalcular 4.000 fórmulas. Eso no escala a un segundo sistema.

Esta propuesta cierra el diligenciamiento por pantalla, abre una **API de servicio con token portador** para que un agente pueda alimentar la hoja de vida sin suplantar a una persona, y genera el `.xlsx` desde la base en vez de editarlo a mano.

Fuentes: `docs/handoff_tecnologia/hoja-de-vida-for-tec-04.md`, `docs/superpowers/specs/2026-09-02-sig-desarrollo-seguro-design.md`, `PTR-TEC-03`, `PRO-TEC-04`.

## Scope

### In Scope

- §1 · `actualizarSistema` y formulario de edición: criticidad, clasificación, RTO/RPO, rol en el tratamiento
- §1 · `PuertaSistema.evidenciaId` expuesto en `registrarPuerta` — el campo ya existe y nadie lo escribe
- §1 · Escritura de `RequisitoSeguridad`, `PruebaSeguridad`, `Liberacion` y `ComponenteTercero` (acción + pantalla)
- §1 · Evidencia, fecha y verificador **por ítem** en la verificación de los 73 (hoy sólo por lote)
- §2 · `TokenServicio`: identidad de máquina con alcance, caducidad, revocación y bitácora
- §2 · Envoltura `conToken(permiso, handler)` obligatoria para toda ruta `/api/v1`, con prueba que lo verifica
- §3 · `GET /api/v1` de la hoja de vida completa y de cada colección hija, más el catálogo de 73 ítems
- §4 · **Autor por parámetro** en `lib/sig/desarrollo.ts`: una sola implementación servida por pantalla y por API
- §4 · `PUT`/`PATCH` idempotentes por clave natural sobre las siete colecciones
- §5 · Carga de evidencias por `multipart` reusando el conducto de `app/api/sgsi/anexo/route.ts`
- §6 · `for-tec-04-libro.ts`: el libro generado desde la base, con reporte de casillas faltantes y su dueño
- §7 · Límite de tasa, cabeceras uniformes y pruebas de ruta para `/api/v1`

### Out of Scope

- **La hoja «Riesgos» del formato (D15).** Usa probabilidad × impacto 1-5, que no es MAGERIT; `Riesgo` está claveado por `[activoId, amenazaId]` y no tiene relación con `Sistema`. El hueco es deliberado y está señalado en `prisma/schema.prisma:3929-3931`. Va al Comité del SGI, no se resuelve aquí
- La entidad `Proyecto` (D14) — `Sistema.proyectoId` sigue sin llave foránea
- Bloquear el avance de fase por puerta no superada (D17) — la decisión de que las puertas registran y no bloquean no se toca
- Un segundo motor de listas de verificación — los 73 ítems siguen siendo `ContenidoSig` + `ItemVerificacion` del módulo A
- Versionado del catálogo de 73 ítems cuando `PTR-TEC-03` cambie — decisión abierta, ver `design.md` §D8
- Corregir el formato `FOR-TEC-04` (listas desplegables que no admiten valores reales) — es documento controlado del SGSI

## Capabilities

### New Capabilities

- `service-token-auth`: token portador con alcance, hash en reposo, caducidad obligatoria, revocación y rastro en bitácora
- `system-lifecycle-write`: diligenciamiento completo de la hoja de vida, por pantalla y por API, sobre una sola implementación
- `verification-item-evidence`: evidencia, fecha y verificador por cada uno de los 73 ítems
- `for-tec-04-export`: el libro `FOR-TEC-04` generado desde la base, con reporte de faltantes

### Modified Capabilities

Ninguna capacidad existente cambia de comportamiento. `registrarPuerta`, `crearSistema` y `registrarTratamiento` ganan campos y un parámetro de autor; lo que ya hacían lo siguen haciendo igual.

## Approach

Siete fases, ordenadas por dependencia y no por apetito:

**La pantalla va antes que la API.** Si un agente escribe en tablas que ninguna pantalla muestra, nadie puede revisar ni corregir lo que dejó, y una hoja de vida que sólo un agente puede leer no sirve como evidencia ante un auditor. La Fase 1 (pantallas) y la Fase 2 (identidad de máquina) son independientes entre sí y se pueden trabajar en paralelo; de la 3 en adelante la cadena es estricta.

**La API no reimplementa nada.** Hoy la identidad se resuelve *dentro* de la función: `yo()` en `app/mi-sig/acciones/mis-datos.ts:52-57` y `autorConPermiso()` en `app/sgsi/acciones/sesion.ts:81-90` llaman `getServerSession()` por su cuenta, así que no hay forma de invocar esa lógica en nombre de otro actor sin falsificar una sesión. La Fase 4 extrae el autor a parámetro explícito antes de escribir la primera ruta de escritura. Si en vez de eso la API copiara las reglas, en seis meses la pantalla y la API validarían distinto sobre la misma tabla, y el que pierde es el auditor.

**El token no se inventa.** `EnlaceFirma` ya resolvió bien el problema del secreto portador: `randomBytes(32)`, sólo el hash en reposo, validación por búsqueda del hash, caducidad, revocación, contador de intentos y la misma respuesta ante cualquier fallo. `TokenServicio` copia ese patrón y reusa el vocabulario `Permiso` que ya existe (`lib/sgsi/permisos.ts:57-95`) como alcance, en vez de abrir un segundo sistema de autorización.

**El libro es salida, no fuente.** `for-tec-04-libro.ts` nace como constructor puro —sin sesión, sin Prisma, probable aislado—, igual que `lib/sgsi/inventario-libro.ts`. Y no se replican los 464 comentarios de celda: cuando un dato real no calza en una lista desplegable del formato, el defecto es de la lista. Esos casos se acumulan y se llevan al dueño del formato.

## Affected Areas

| Area | Impact | Change |
|---|---|---|
| `lib/sig/desarrollo.ts` | Modified | autor por parámetro; reglas de diligenciamiento servidas a pantalla y API |
| `app/sig/acciones/desarrollo.ts` | Modified | `actualizarSistema`; `evidenciaId` en `registrarPuerta`; acciones de requisitos, pruebas, liberaciones y componentes |
| `app/tecnologia/{sistemas,verificacion}/*.client.tsx` | Modified | formularios de edición y de los cuatro bloques sin camino de carga |
| `prisma/schema.prisma` + migración | Modified | `TokenServicio`; evidencia por ítem en `RespuestaItem`; `CHECK` de dueño de `Evidencia` ampliado |
| `lib/api/token-servicio.ts` | New | emisión, hash, validación, revocación, caducidad |
| `lib/api/con-token.ts` | New | envoltura de autorización obligatoria de `/api/v1` |
| `app/api/v1/**` | New | lectura y escritura de la hoja de vida, más carga de evidencias |
| `lib/sig/for-tec-04-libro.ts` | New | constructor puro del libro y del reporte de faltantes |
| `middleware.ts` | Modified | `/api/v1` queda fuera del matcher a propósito, con el porqué escrito |
| `app/api/sgsi/anexo/route.ts` | Modified | el conducto de adjuntos acepta un autor que no venga de sesión |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Una ruta `/api/v1` nace pública por olvido — el matcher de `middleware.ts:26` es lista blanca de lo protegido, y el archivo ya narra el caso de `/tecnologia` olvidado | Alta | La envoltura `conToken` es obligatoria **y** una prueba recorre el árbol de `app/api/v1/` y falla si algún `route.ts` no la usa. La red es la prueba, no la disciplina |
| El refactor de autor toca código que hoy funciona en producción | Media | TDD estricto (regla 1 del `HARNESS.md`), fase aislada, PR propio, sin mezclar con rutas nuevas |
| Merge a `main` despliega a producción sin paso intermedio, y el branch ruleset que haría obligatorio `verificar` todavía no está configurado | Alta | El ruleset se activa **antes** de la Fase 4. Abrir escritura automatizada con el portón abierto no se hace |
| No hay prueba alguna bajo `app/api/` hoy | Alta | Prueba primero en toda ruta nueva desde la Fase 3; la Fase 7 cubre las rutas que ya existían |
| Un agente cierra una puerta de control o aprueba una excepción | Media | El alcance del token no incluye cierre ni autorización. El diseño ya separa `verificadoPorId` de `autorizaId` porque el procedimiento asigna esas dos autoridades a roles distintos |
| El libro promete columnas que la aplicación nunca pudo llenar | Media | La Fase 6 depende de la 1, y el reporte de faltantes nombra cada casilla vacía con su dueño |
| El formato `FOR-TEC-04` cambia a mitad del trabajo | Media | La corrección del formato se decide antes de la Fase 6 |
