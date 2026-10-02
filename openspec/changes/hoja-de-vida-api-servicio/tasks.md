# Tasks: Hoja de vida del sistema · API de servicio

TDD estricto. En cada tarea de código: prueba primero, roja, después el módulo. Los tres controles
encadenados con `&&` antes de cada PR: `npm run verificar && npm run verificar:build && npm run verificar:migraciones`.

Las Fases 1 y 2 son independientes y se pueden trabajar en paralelo. De la Fase 3 en adelante la
cadena es estricta.

## Fase 0 · Decisiones que bloquean

- [ ] 0.1 Llevar al Comité del SGI la hoja «Riesgos» (D15): probabilidad × impacto 1-5 no es MAGERIT, y `Riesgo` está claveado por `[activoId, amenazaId]` sin relación a `Sistema`. Las salidas posibles son entidad propia, mapeo a MAGERIT, o retirar la hoja del formato — **dueño: Comité**
- [ ] 0.2 Definir quién es el Responsable de Seguridad de la Información como persona concreta; `PuertaSistema.autoriza` y `ExcepcionSeguridad.aprobadaPor` lo necesitan nombrado — **dueño: Comité**
- [ ] 0.3 Decidir si el catálogo de 73 ítems se versiona, y qué pasa con las verificaciones ya firmadas cuando `PTR-TEC-03` cambie — **dueño: Responsable de Seguridad**
- [ ] 0.4 **Activar el branch ruleset de GitHub que hace obligatorio el control `verificar`.** El `HARNESS.md` lo reconoce pendiente: hoy el control informa y no bloquea, y merge a `main` despliega a producción sin paso intermedio. **Bloquea la Fase 4** — dueño: Infraestructura
- [ ] 0.5 Llevar al dueño del formato los 156 valores reales que no calzaron en sus listas desplegables y el caso F-02 (la lista «Resultado» de puertas no contempla «No evaluada») — **bloquea la Fase 6**

## Fase 1 · Cerrar el diligenciamiento por pantalla

- [ ] 1.1 `desarrollo.test.ts`: `actualizarSistema` acepta criticidad, `clasificacionId`, `rtoObjetivo`, `rpoObjetivo` y `rolTratamiento`; criticidad fuera de la escala del SGSI falla nombrando el valor; RTO/RPO negativos fallan
- [ ] 1.2 `app/sig/acciones/desarrollo.ts`: `actualizarSistema`; `faltantesDeHojaDeVida` deja de reportar faltantes que ninguna pantalla podía cerrar
- [ ] 1.3 `app/tecnologia/sistemas/Sistemas.client.tsx`: formulario de edición con los cinco campos
- [ ] 1.4 `desarrollo.test.ts`: `registrarPuerta` persiste `evidenciaId`; una evidencia de otro sistema es rechazada
- [ ] 1.5 `registrarPuerta`: `evidenciaId` deja de ser columna muerta — el campo existe en el schema desde la migración de septiembre y ningún código lo escribía
- [ ] 1.6 `desarrollo.test.ts` + acción + pantalla: `RequisitoSeguridad` (alta, edición, baja lógica); `codigo` único por sistema
- [ ] 1.7 `desarrollo.test.ts` + acción + pantalla: `PruebaSeguridad`; los cuatro conteos por severidad se capturan y **el veredicto de si bloquea se calcula** contra los criterios de aceptación y la excepción vigente, si la hay
- [ ] 1.8 `desarrollo.test.ts` + acción + pantalla: `Liberacion` — no confundir con `Despliegue`, que es dónde corre y ya tiene su propia acción
- [ ] 1.9 `desarrollo.test.ts` + acción + pantalla: `ComponenteTercero` (SBOM) con licencia, versión y vulnerabilidades conocidas
- [ ] 1.10 Migración: `codigo` + `@@unique([sistemaId, codigo])` en `ComponenteTercero` y `TratamientoDatosPersonales` — hoy no tienen clave natural y sin ella no hay `PUT` idempotente (D6)
- [ ] 1.11 Migración: `RespuestaItem` gana `evidenciaId`, `verificadoEn`, `verificadoPorId`, los tres opcionales (D8)
- [ ] 1.12 `app/tecnologia/verificacion`: la pantalla pasa de sólo lectura a permitir responder un ítem con su evidencia, fecha y verificador
- [ ] 1.13 Prueba de punta a punta narrada en el PR: crear un sistema y diligenciar su hoja de vida completa sin tocar la base de datos. Hoy esto no se puede hacer

## Fase 2 · Identidad de máquina

- [ ] 2.1 `token-servicio.test.ts`: el secreto generado tiene prefijo `sgi_live_`, 32 bytes de entropía en base64url, y **dos emisiones nunca coinciden**
- [ ] 2.2 `prisma/schema.prisma` + migración: `TokenServicio` con `tokenHash` (SHA-256, `@unique`), `prefijo`, `alcance`, `expiraEn` **no nulo**, `revocadoEn`, `motivoRevocacion`, `intentosFallidos`, `bloqueadoEn`, `ultimoUsoEn`
- [ ] 2.3 `token-servicio.test.ts`: la validación **busca por hash** y no compara secretos; un token inexistente, uno expirado, uno revocado y uno bloqueado devuelven **la misma respuesta**
- [ ] 2.4 `lib/api/token-servicio.ts`: `emitir`, `validar`, `revocar`, `registrarUso`. El secreto se devuelve **sólo** en `emitir` y nunca se persiste
- [ ] 2.5 `con-token.test.ts`: sin cabecera `Authorization` → 401; token válido sin el permiso pedido → 403; token válido con permiso → el manejador corre y recibe el autor
- [ ] 2.6 `lib/api/con-token.ts`: la envoltura resuelve el token, arma el `Autor` de clase `servicio` y aplica `puede(alcance, permiso)`
- [ ] 2.7 **`app/api/v1/__tests__/toda-ruta-usa-con-token.test.ts`**: recorre el árbol de `app/api/v1/` y falla si algún manejador exportado de algún `route.ts` no está envuelto en `conToken`. Es la red que sostiene D5, porque el matcher de `middleware.ts` deja pública toda ruta que no figure
- [ ] 2.8 `middleware.ts`: comentario que explica por qué `/api/v1` queda **fuera** del matcher a propósito — `withAuth` redirige a la pantalla de ingreso, que para un cliente máquina es un 302 hacia HTML en lugar de un 401 con cuerpo
- [ ] 2.9 Pantalla de administración de tokens bajo permiso de Líderes SIG: crear, listar con prefijo y último uso, revocar con motivo. El secreto se muestra **una sola vez**
- [ ] 2.10 `bitacora.test.ts`: una escritura con autor de clase servicio registra `usuario = "api:<nombre>"` y **el token no aparece en ningún campo**

## Fase 3 · Lectura por API

- [ ] 3.1 `GET /api/v1/sistemas` — prueba primero: sin token 401, con token de sólo lectura 200, con token de otro alcance 403
- [ ] 3.2 `GET /api/v1/sistemas/{codigo}` — la hoja de vida completa en JSON, con sus siete colecciones hijas
- [ ] 3.3 `GET` de cada colección por separado, con paginación estable (orden por clave natural, no por `id`)
- [ ] 3.4 `GET /api/v1/catalogo-verificacion` — los 73 ítems con puerta, control del Anexo A, evidencia esperada y a quién aplica
- [ ] 3.5 Errores uniformes en `problem+json`, con códigos estables y **sin filtrar detalles internos**
- [ ] 3.6 Documento OpenAPI servido por la propia aplicación, generado del código y no escrito aparte

## Fase 4 · Escritura por API

> No se despliega sin 0.4 cerrada y sin 7.1 en su sitio.

- [ ] 4.1 `autor.test.ts`: `autorizado` y `etiquetaDeBitacora` sobre las dos clases de autor; un autor de clase servicio con alcance vacío no autoriza nada
- [ ] 4.2 `lib/sig/autor.ts`: el tipo `Autor` y sus dos ayudantes
- [ ] 4.3 **Refactor de `lib/sig/desarrollo.ts`: el autor pasa a ser el primer parámetro, obligatorio y nunca opcional.** Un `autor?` con valor por defecto es la misma trampa de antes con otra ropa (D2)
- [ ] 4.4 Los llamadores de `app/sig/acciones/desarrollo.ts` resuelven el autor desde la sesión y lo pasan. Ninguna función de dominio vuelve a llamar `getServerSession` por su cuenta
- [ ] 4.5 Validación de entrada por esquema. **No hay ninguna librería de esquemas en el repo hoy**: evaluar si se agrega una o se escriben validadores puros al estilo de `exigirId`/`idOpcional`, y dejar la decisión escrita
- [ ] 4.6 `PUT /api/v1/sistemas/{codigo}` idempotente por `codigo`
- [ ] 4.7 `PUT` idempotente de requisitos, pruebas, liberaciones, componentes y tratamientos, resueltos como `upsert` por clave natural. **Prueba obligatoria: el mismo `PUT` repetido tres veces deja una sola fila** (D6)
- [ ] 4.8 `PUT /api/v1/sistemas/{codigo}/verificacion/{numeroItem}` — responder un ítem con estado, evidencia, fecha y verificador
- [ ] 4.9 **Prueba de que el alcance no alcanza**: un token no puede cerrar una puerta, aprobar ni prorrogar una excepción, ni cerrar la hoja de vida. Un agente diligencia; una persona cierra (D10)

## Fase 5 · Evidencias por API

- [ ] 5.1 Migración: el `CHECK` `evidencia_un_solo_origen` se **amplía** a puerta, requisito, prueba e ítem de verificación. Se amplía, nunca se relaja: un adjunto con dos dueños aparece dos veces en el expediente
- [ ] 5.2 `app/api/sgsi/anexo/route.ts`: el conducto acepta un autor que no venga de sesión. Es la única línea que lo ata al navegador — el resto ya trabaja con `FormData` y `File` estándar
- [ ] 5.3 `POST /api/v1/.../evidencias` por multipart. Pruebas de que las ocho garantías siguen en pie: dueño único, lista blanca de extensiones, **415 cuando los números mágicos no coinciden con la extensión**, cuota por dueño, antivirus, SHA-256, reversión de metadatos si falla el bloque, bitácora en la misma transacción
- [ ] 5.4 Prueba del caso que importa: un `.exe` renombrado a `.pdf` se rechaza con 415

## Fase 6 · Generar el FOR-TEC-04

> Depende de la Fase 1: sin ella el libro exportaría columnas que la aplicación nunca pudo llenar.
> Depende de 0.5.

- [ ] 6.1 `for-tec-04-libro.test.ts`: las doce hojas, los encabezados en la **fila 4**, y el conteo de filas reales por columna de identificador no vacía — **nunca por la última fila del libro**, que viene pre-copiada hasta la 504 con fórmulas sin dato
- [ ] 6.2 `lib/sig/for-tec-04-libro.ts`: constructor puro, sin Prisma ni sesión, al estilo de `lib/sgsi/inventario-libro.ts`
- [ ] 6.3 Prueba: la fila 5 de ejemplo del formato se reemplaza siempre. El expediente SIS-001 dedicó una nota entera a advertir que esa fila ilustrativa no corresponde al sistema real
- [ ] 6.4 Prueba: el libro generado no contiene `_xlfn._LONGTEXT()` — la fórmula rota del formato original — sino la fórmula válida
- [ ] 6.5 Listas desplegables y fórmulas del tablero, con la hoja de listas al estilo de `plantilla-activos`
- [ ] 6.6 `faltantes.test.ts` + implementación: por cada casilla vacía, qué falta y de quién es. Reemplaza los 214 `[PENDIENTE]` escritos a mano
- [ ] 6.7 Ruta de descarga y botón en `app/tecnologia/sistemas`
- [ ] 6.8 `GET /api/v1/sistemas/{codigo}/for-tec-04.xlsx`
- [ ] 6.9 Prueba de punta a punta narrada en el PR: generar el libro de SIS-001 y contrastarlo contra el diligenciado a mano. Las diferencias que aparezcan son hallazgos, no ruido

## Fase 7 · Endurecimiento

- [ ] 7.1 **Límite de tasa por token.** Hoy no existe en ninguna parte del repo, y el `HARNESS.md` ya narra un incidente de producción por un bucle de creación con la batería en verde. **La Fase 4 no se despliega sin esto**
- [ ] 7.2 Cabeceras de seguridad uniformes para `/api/v1`, incluido `Cache-Control: no-store` en toda respuesta con datos del expediente
- [ ] 7.3 Pruebas de los manejadores de ruta que ya existían bajo `app/api/` — hoy hay cero, y el único ejemplo del repo vive fuera, en `app/scorm/archivo/.../__tests__/route.test.ts`
- [ ] 7.4 Caducidad de tokens dormidos por `ultimoUsoEn`, y aviso de token próximo a vencer
- [ ] 7.5 Actualizar `HARNESS.md` con lo que cambia para quien trabaje sobre `/api/v1`
