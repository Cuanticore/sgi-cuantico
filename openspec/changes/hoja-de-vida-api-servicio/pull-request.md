# Entrega · Fases 1 y 2

Documento de traspaso. Qué quedó hecho, qué quedó abierto y qué hay que mirar antes de seguir.
Fecha: 2026-10-02. PR de implementación: **#40**. Propuesta: **#26**.

## 1. Qué cambió, en una frase

Antes de este trabajo no se podía crear un sistema y diligenciar su hoja de vida completa sin
escribir SQL. Ahora sí. Y existe una identidad de máquina con alcance, caducidad y revocación,
aunque todavía no haya ninguna ruta de escritura que la use.

## 2. Lo entregado

### Fase 1 · Diligenciamiento por pantalla (#32)

| Qué | Dónde |
|---|---|
| `actualizarSistema`: criticidad, clasificación, RTO/RPO, rol en el tratamiento | `lib/sig/desarrollo.ts`, `app/sig/acciones/desarrollo.ts`, `Sistemas.client.tsx` |
| `registrarPuerta` persiste `evidenciaId` — era columna muerta desde septiembre | `app/sig/acciones/desarrollo.ts` |
| Alta, edición y baja de `RequisitoSeguridad`, `PruebaSeguridad`, `Liberacion`, `ComponenteTercero` | `app/tecnologia/sistemas/` |
| `codigo` + `@@unique([sistemaId, codigo])` en `ComponenteTercero` y `TratamientoDatosPersonales` | migración `20260923090000_hoja_de_vida_clave_natural` |
| `RespuestaItem` gana `evidenciaId`, `verificadoEn`, `verificadoPorId`, los tres opcionales | migración `20260923091500_respuesta_item_evidencia` |
| `/tecnologia/verificacion` pasa de solo lectura a verificar un ítem sobre su evidencia | `app/tecnologia/verificacion/` |

La criticidad se valida contra la escala del SGSI y falla **nombrando el valor recibido y los
admitidos**. RTO/RPO negativos fallan: son el insumo del BIA anual y un negativo lo corrompe en
silencio.

### Fase 2 · Identidad de máquina (#33)

| Qué | Dónde |
|---|---|
| `TokenServicio`: emitir, validar, revocar, registrar uso | `lib/api/token-servicio.ts` |
| `conToken(permiso, handler)`: la envoltura obligatoria de `/api/v1` | `lib/api/con-token.ts` |
| El tipo `Autor` y sus ayudantes | `lib/sig/autor.ts` |
| La prueba que recorre el árbol con el AST de TypeScript | `app/api/v1/__tests__/toda-ruta-usa-con-token.test.ts` |
| Pantalla de administración | `app/tokens/` |
| Pestaña enlazada en la barra corporativa | `app/components/sgsi/EncabezadoSig.tsx` |
| Permiso `tokenServicio:administrar` | `lib/sgsi/permisos.ts` |
| Migración | `20261002145902_token_servicio` |

`TokenServicio` no se diseñó de cero: copia `EnlaceFirma`, que ya había resuelto bien el problema
del secreto portador. En reposo solo vive el hash SHA-256; la validación es **búsqueda del hash**,
no comparación, lo que elimina el ataque de temporización por construcción y no por cuidado de
quien escriba el comparador.

## 3. Verificación

Los tres controles sobre la rama integrada, en verde. CI del PR #40: `verificar` pasa en 6m20s.

```
npm run verificar             → 182 suites / 3060 pruebas · tsc 0 errores
                                lint 0 errores (5 warnings preexistentes)
npm run build                 → compila
npm run verificar:migraciones → "Las migraciones aplican limpias sobre una base vacía"
```

Línea base antes de este trabajo: **174 suites / 2971 pruebas**.

### Comprobado contra el servidor corriendo

```
/auth/signin                      → 200
/tecnologia/sistemas              → 307   el matcher frena sin sesión
/tokens                           → 307   igual
/api/v1/salud sin token           → 401 JSON, no redirección
/api/v1/salud con token inventado → 401, cuerpo IDÉNTICO al anterior
```

Las dos últimas líneas son el diseño funcionando. Un cliente máquina recibe un 401 que puede
interpretar en lugar de un 302 hacia HTML, y los fallos son indistinguibles entre sí, de modo que
la ruta no sirve como oráculo para averiguar qué tokens existieron.

### Recorrido de punta a punta

1. `/tecnologia/sistemas` → «Nuevo sistema» → *«SIS-001 creado con sus seis puertas pendientes»*,
   con el aviso **«La hoja de vida está incompleta»**
2. «Editar hoja de vida» → criticidad 4, RTO 240, RPO 60 → *«Se guardaron 3 campos»*
3. Requisito REQ-001, prueba PEN-001, componente CMP-001
4. **El aviso desaparece.** Antes de este PR era imposible llegar ahí sin escribir SQL
5. Puertas → registrar P1 con quién verifica y quién autoriza → `SUPERADA`, con dos personas
   distintas en los dos campos

## 4. Lo que este trabajo NO habilita

Un token **no** puede cerrar una puerta, aprobar o prorrogar una excepción, ni cerrar la hoja de
vida. Hay prueba que lo demuestra.

No es prudencia genérica: `PuertaSistema` separa `verificadoPorId` de `autorizaId` porque
`PRO-TEC-04` asigna esas dos autoridades a roles distintos. Un token que cerrara puertas
colapsaría las dos en una sola identidad de máquina, y la separación que el procedimiento exige
dejaría de existir en los hechos aunque siguiera escrita en el documento.

Tampoco hay escritura por API. La única ruta que existe es `GET /api/v1/salud`, y existe nada más
para que la prueba del árbol tenga algo que vigilar.

## 5. Lo que hay que mirar antes de mergear

1. **El backfill de la migración de `codigo` no se probó con filas reales.** Va en tres pasos
   (nullable → backfill → `NOT NULL`) justo por si producción ya tiene filas en
   `tratamiento_datos_personales`, que lleva semanas funcionando. En local las tablas estaban
   vacías. **Hay que mirarlo contra la base de verdad.**
2. **`clasificacionId` queda `Int?` sin validar**: no existe modelo `Clasificacion` ni catálogo en
   el código. Si se abre esa capacidad, la validación se agrega ahí.
3. **Evidencia de otro sistema** se rechaza comprobando si el `evidenciaId` ya está citado por una
   puerta o prueba de otro sistema, en lugar de darle `sistemaId` a `Evidencia`. Esa ampliación del
   `CHECK` es Fase 5 y no se adelantó.
4. **Tarea 1.14, abierta.** El escenario *«Cerrar la hoja de vida sí exige evidencia en los ítems»*
   del spec `verification-item-evidence` no tenía tarea en la lista original. La columna es
   opcional a propósito (D8) porque el motor se comparte con el módulo A, y la exigencia debía
   vivir en la regla de cierre — esa regla no se escribió. **Es un vacío de la planeación, no de la
   implementación.**

## 6. Lo que sigue, y qué lo frena

| Fase | Estado |
|---|---|
| 3 · API de lectura (#34) | lista para empezar |
| 4 · API de escritura (#35) | **bloqueada por #30** |
| 5 · Evidencias por API (#36) | depende de la 4 |
| 6 · Generar el FOR-TEC-04 (#37) | **bloqueada por #31** |
| 7 · Endurecimiento (#38) | 7.1 (límite de tasa) bloquea el despliegue de la 4 |

Sobre **#30**: hoy el control `verificar` informa pero no bloquea el merge, y merge a `main`
despliega a producción sin paso intermedio. Abrir una ruta de escritura automatizada con esas dos
condiciones a la vez es exactamente lo que la propuesta dice que no se hace. El branch ruleset va
antes que la Fase 4.

## 7. Hallazgo aparte: #39

Durante este trabajo se detectó que `prisma/schema.prisma` y el historial de migraciones **no
coinciden**: tras aplicar todas las migraciones queda un índice que el schema no declara
(`accion_plan_clase_activa_idx`) y una llave foránea con nombre distinto en `plantilla_nivel`.

Es anterior a este PR, verificado contra `origin/main` sobre base limpia. Lo peligroso es que **se
ve verde en todos los controles**: `prisma generate` lee el schema y no las migraciones; `tsc`,
ESLint, Jest y el build ni las miran; y `verificar:migraciones` comprueba que las migraciones
*apliquen*, no que el resultado *coincida* con el schema.

El efecto práctico es que al próximo que corra `prisma migrate dev` se le cuela un `DROP INDEX`
sobre una tabla de producción dentro de una migración que no tiene nada que ver. Tiene la forma
exacta del incidente del 18/09/2026 que narra el `HARNESS.md`.

## 8. Dónde está cada cosa

- Propuesta: `openspec/changes/hoja-de-vida-api-servicio/` — `proposal.md`, `design.md` (D1-D11),
  `tasks.md`, y cuatro `specs/`
- Milestone **Hoja de vida del sistema · FOR-TEC-04**, issues #27 a #39
- Ramas: `feat/hoja-de-vida-fase-1` y `feat/hoja-de-vida-fase-2`, integradas en
  `feat/hoja-de-vida-fases-1-y-2` (PR #40)
