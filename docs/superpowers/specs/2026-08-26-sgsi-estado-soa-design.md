# Columna «Aplica · SOA» — Especificación y diseño

**Fecha:** 2026-08-26
**Plan:** `../plans/2026-08-26-sgsi-estado-soa.md`
**Plan maestro:** `../plans/2026-08-24-sgsi-handoff-v2.md`
**Origen:** pedido del cliente sobre la grilla de madurez de los 93 controles, ISO/IEC 27001:2022 §6.1.3 d
**Estado:** Implementado

---

## Requerimiento

Agregar la columna «Aplica · SOA» a la grilla de Madurez de los controles (los 93 controles del Anexo A de ISO/IEC 27001:2022). Es el campo que materializa la Declaración de Aplicabilidad (SOA, cláusula 6.1.3 d).

El control tiene hoy el booleano `ap`. Reemplazarlo por un campo de tres estados `soa`: `'si'` (Aplica) | `'parcial'` (Parcialmente) | `'no'` (No aplica).

Se traduce en los siguientes requisitos:

| # | Requisito | Escenario de aceptación |
|---|---|---|
| R1 | Modelo de tres estados | `Control.soa` con valores SI/PARCIAL/NO; `aplica = soa != NO`. El booleano `aplica` desaparece del esquema |
| R2 | Trazabilidad | Justificación obligatoria en NO y PARCIAL; usuario y fecha del último cambio; toda modificación va a la bitácora con valor anterior, nuevo, autor y motivo. No hay borrado físico |
| R3 | Columna en la grilla | Insertada entre «Capacidad operativa» y «Madurez actual», ancho 92px, header mono 8.5px «APLICA · SOA» en #12437f, centrado. Celda: select de 3 opciones con los estilos especificados por estado |
| R4 | Filtros | «Solo aplicación parcial» y «Solo no aplicables» en el filtro de la grilla |
| R5 | Recálculo en el mismo render | Al cambiar `soa` se recalculan sin recargar: aplicables, índice, nivel típico/medio, L3+, cumplen objetivo, brechas, avance, distribución, spider, fichas del Resumen SGSI y tarjetas-filtro |
| R6 | Reglas de negocio | Justificación obligatoria; advertencia L4/L5 en PARCIAL; bloqueo con acciones abiertas al pasar a NO; advertencia por amenazas de riesgo residual Alto/Crítico; solo SIG-Seguridad edita |
| R7 | Exportación | «Exportar declaración de aplicabilidad» incluye estado, justificación, responsable y fecha del último cambio |

---

## Fuera de alcance

- La decisión de qué controles concretos pasan a `'parcial'` **es del líder del SIG** (los que hoy tienen evidencia parcial son candidatos; la referencia pide revisarlos antes de migrar). Este trabajo entrega el mecanismo; NO decide la migración de datos de negocio.
- No se agrega permiso nuevo: `soa` se edita con `sgsi:escribir` (exclusivo de SIG-Seguridad) y se lee con `sgsi:ver`.

---

## Decisiones de diseño

### 1. Enum de tres estados, siguiendo el precedente `Ternario`

`EstadoSoa { SI, PARCIAL, NO }` + `@@map("estado_soa")`, igual que `enum Ternario` (schema.prisma:511-517). El negocio habla en minúsculas (`'si'`/`'parcial'`/`'no'`); la capa de dominio mapea con un helper único para que ningún consumidor derive por su cuenta.

Regla de oro: **aplicable = `soa != NO`**. «Parcialmente» cuenta como aplicable a efectos de todos los indicadores; lo que lo distingue es que la cobertura parcial rara vez sostiene L4/L5 en auditoría (por eso la advertencia de la regla 2).

### 2. Reemplazo del campo `aplica` en `Control`

| Campo | Tipo | Nota |
|---|---|---|
| `soa` | `EstadoSoa @default(SI)` | Reemplaza a `aplica Boolean @default(true)` |
| `justificacionSoa` | `String?` | Obligatoria en NO y PARCIAL (validación en la acción, no solo UI) |
| `soaActualizadoPor` | `String?` | Autor del último cambio |
| `soaActualizadoEn` | `DateTime?` | Fecha del último cambio |

La columna `aplica` se **dropea** en la migración. El valor histórico queda en la bitácora (registro de la migración con campo `'aplicación SOA'`) y, para los 7 no aplicables, su justificación se copia de `evidencia` a `justificacion_soa`.

### 3. La transición a NO anula la madurez

El modelo actual es explícito: un control no aplicable tiene madurez `null` (schema.prisma:404-406, seed invariante :115-117, guardarMadurez :217-221). Al pasar a NO, `actualId` y `objetivoId` se ponen en null en la misma transacción, con registro en bitácora. Al volver a SI/PARCIAL quedan disponibles de nuevo (la justificación anterior no se borra, se reemplaza con nuevo registro).

### 4. Una acción nueva, validaciones en servidor y confirmación en UI

`cambiarEstadoSoa(codigoControl, estado, justificacion, motivo, confirmacion)` en `app/sgsi/acciones/controles.ts`:

- **Regla 1** — NO/PARCIAL sin justificación → rechazo (servidor, no se confía en la UI).
- **Regla 2** — En PARCIAL con madurez actual >= L4 → devuelve advertencia informativa. La UI la muestra ANTES de guardar; no bloquea (la regla es "advertir", no prohibir).
- **Regla 3** — Pasando a NO con acciones abiertas (`AccionPlan.activa && estado != TERMINADA`): si no viene `confirmacion`, rechaza y devuelve la lista de acciones afectadas para que la UI la presente y exija confirmación explícita.
- **Regla 4** — Pasando a NO con amenazas de riesgo residual Alto/Crítico: devuelve la advertencia con el impacto; la UI la muestra y vuelve a llamar con confirmación (el servidor no bloquea — es una advertencia, la exclusión es atribuible en bitácora con motivo).

Bitácora: dos entradas por cambio — `'aplicación SOA'` (nueva/estado) y `'justificación SOA'`, con posterior anterior/nuevo/motivo, en la misma transacción (`lib/sgsi/bitacora.ts:40`).

### 5. El recálculo vive en el dominio y se mueve por el mismo camino que hoy

`lib/sgsi/madurez.ts` sigue siendo la única implementación (client-side en la grilla, server-side en seed y dashboard). `ControlMadurez` pasa a `soa`; `metricasMadurez` agrega `parciales` al resultado. El dashboard (`inicio.query.ts`, `evaluacion.query.ts`, etc.) sirve `soa` y todos los filtros `c.aplica` pasan a `esAplicable(c.soa)`.

### 6. Roles

Solo SIG-Seguridad (`sgsi:escribir`) edita. SIG-Propietarios y SIG-Auditoría ven la columna en solo lectura: el select se renderiza `disabled` según rol (la grilla hoy no oculta selects por rol — se valida al guardar; acá se respeta la regla 5 del pedido, que es más estricta).

### 7. Exportación

`lib/sgsi/declaracion-libro.ts` (puro, sin sesión ni Prisma → testeable) + `app/api/sgsi/declaracion-soa/route.ts` (patrón `plantilla-activos/route.ts:19-79`: GET, `sgsi:ver`, exceljs). Columnas: Código · Control · Dominio · Capacidad · Estado SOA · Justificación · Responsable · Fecha último cambio · Madurez actual.

---

## Decisión pendiente del negocio (no bloquea la implementación)

Seleccionar con el líder del SIG los controles que pasan a `'parcial'` al hacer la migración fina. El código y la migración de tipo (`aplica=false` → `soa='NO'` con justificación) se entregan con 86 SI / 0 PARCIAL / 7 NO, cifras de la referencia. La matización posterior es un campo de datos, no de código.
