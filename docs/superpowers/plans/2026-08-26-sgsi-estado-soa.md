# Columna «Aplica · SOA» — Plan de implementación

**Fecha:** 2026-08-26
**Diseño:** `../specs/2026-08-26-sgsi-estado-soa-design.md`
**Plan maestro:** `2026-08-24-sgsi-handoff-v2.md`
**Estado:** Implementado

**Goal:** La grilla de los 93 controles tiene la columna «Aplica · SOA» de tres estados con trazabilidad completa, recálculo en el mismo render, y exportación de la declaración de aplicabilidad.

---

## Tareas

| # | Tarea | Archivo | Estado |
|---|---|---|---|
| 1 | Migración: enum `EstadoSoa` + campos `soa/justificacion/por/en` en `Control`, backfill 7 NO, drop `aplica` | `prisma/schema.prisma`, nueva migración | ✅ |
| 2 | Dominio: `ControlMadurez.soa`, `MetricasMadurez.parciales`, helper `esAplicable`, validadores puros | `lib/sgsi/madurez.ts` | ✅ |
| 3 | Seeds y datos: `iso-controles.json` + `seeds/iso.ts` con `soa` e invariantes | `prisma/data/iso-controles.json`, `prisma/seeds/iso.ts` | ✅ |
| 4 | Acción `cambiarEstadoSoa` con reglas 1-4 y bitácora | `app/sgsi/acciones/controles.ts` | ✅ |
| 5 | Columna + select + filtros + recálculo sin recargar + searchParams | `app/components/sgsi/controles/ControlesMadurez.tsx` | ✅ |
| 6 | Popup: estado, justificación, autor/fecha; solo lectura según rol | `app/components/sgsi/controles/PopupControl.tsx` | ✅ |
| 7 | Export «Declaración de aplicabilidad» (libro + ruta + botón en grilla) | `lib/sgsi/declaracion-libro.ts`, `app/api/sgsi/declaracion-soa/route.ts` | ✅ |
| 8 | Consumidores `c.aplica` → `esAplicable(c.soa)` (dashboard, evaluación, planes, riesgos, amenazas, verificacion, metodologia, parametros) | ~10 archivos | ✅ |
| 9 | Tests: `madurez.test.ts` + nuevos (validadores, derivación) | `lib/sgsi/__tests__/` | ✅ |
| 10 | Verificación: migrate, seed, build, tsc, eslint, jest | — | ✅ |

---

## Orden de ejecución

1→2→3 son la base (schema, dominio, datos). 4 depende de 2. 5, 6, 7, 8 dependen de 2 y 4. 9 y 10 cierran.

---

## Verificación de línea base (contra la que se valida el resultado)

93 controles · 86 aplican (SI) · 7 no aplican (NO) · índice de madurez 86,7 % · nivel típico 3,00 · 75 controles en L3 o superior · 11 brechas · brecha total 64.
