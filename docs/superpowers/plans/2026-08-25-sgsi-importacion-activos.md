# Importación masiva de activos — Plan de implementación

**Fecha:** 2026-08-25
**Diseño:** `../specs/2026-08-25-sgsi-importacion-activos-design.md`
**Plan maestro:** `2026-08-24-sgsi-handoff-v2.md`
**Estado:** Completado

**Goal:** Un solo botón en `/sgsi/inventario` que abra un popup y resuelva ahí todo el ciclo: descargar la plantilla, subirla llena, ver fila por fila qué se leyó, y confirmar con alertas de resultado.

---

## Tareas

| # | Tarea | Archivo | Estado |
|---|---|---|---|
| 1 | Contrato de columnas compartido por la ruta, la acción y el popup | `lib/sgsi/plantilla.ts` | ✅ |
| 2 | Lector puro: valida una matriz de celdas contra los catálogos | `lib/sgsi/plantilla-lectura.ts` | ✅ |
| 3 | Ruta que genera el `.xlsx` desde la base, con hoja de valores válidos | `app/api/sgsi/plantilla-activos/route.ts` | ✅ |
| 4 | Server actions: `analizarPlantilla` (dry run) e `importarPlantilla` (transacción) | `app/sgsi/acciones/importar.ts` | ✅ |
| 5 | Popup de tres pasos con vista previa y alertas | `app/components/sgsi/inventario/PopupImportacion.tsx` | ✅ |
| 6 | Botón «Importar desde Excel» cableado en la vista | `app/components/sgsi/inventario/InventarioActivos.tsx` | ✅ |
| 7 | Tests del lector con catálogos ficticios | `lib/sgsi/__tests__/plantilla-lectura.test.ts` | ✅ |
| 8 | Verificación de ida y vuelta contra la base real | script descartable | ✅ |

---

## Verificación ejecutada

**Tests unitarios** — 16 casos nuevos sobre `leerFilas`, cada uno un error que alguien comete de verdad en una planilla: subtipo válido bajo el tipo equivocado, valor fuera de escala, código heredado repetido dentro del mismo archivo, nombre de proceso sin acento, valor como número suelto en lugar de etiqueta.

```
npx jest → 7 suites, 66 tests, todo en verde (eran 50)
```

**Ida y vuelta contra la base real** — lo que los tests con catálogos ficticios no pueden probar: que los códigos y etiquetas **que están en la base** sean las formas que el lector matchea. Se generó una hoja con una fila por cada tipo MAGERIT vigente, se reabrió como lo hace la acción y se pasó por `leerFilas` con los catálogos reales:

```
tipos en base: 10 · escala: 5 — Muy Alto | 4 — Alto | 3 — Medio | 2 — Bajo | 1 — Muy Bajo | 0 — Irrelevante
filas leídas: 11 (la de ejemplo omitida)
resueltas:    10
  fila 13 «Debe fallar»: Tipo MAGERIT desconocido: «[NOPE]». Proceso o área desconocido:
  «Área inexistente». El custodio «Nadie» no está en la lista de cargos. Valor en
  Disponibilidad fuera de la escala: «9».
ROUNDTRIP OK
```

Los 10 tipos pasan, y la fila deliberadamente mala se rechaza con los cuatro errores acumulados. La fila mala está ahí para que un lector que apruebe todo quede en evidencia.

**Compilación** — `npx tsc --noEmit` limpio, `npx eslint` limpio, `npm run build` completo. El build es el que valida la regla de Next de que un módulo `'use server'` sólo exporte funciones async: por eso el contrato de columnas terminó en `lib/`, no junto a las acciones.

---

## Un error del camino, anotado

El primer borrador exportaba `COLUMNAS_PLANTILLA` desde `app/sgsi/acciones/importar.ts`, un archivo `'use server'`. Next lo rechaza: en un módulo de server actions **todo export debe ser una función async**. De ahí sale la separación en tres módulos del diseño, que además resultó la estructura correcta por otro motivo — el popup es un componente cliente y necesita esos encabezados para la tabla de vista previa.

---

## Pendiente de validación por el usuario

Lo único que no se puede ejercitar sin una sesión real de Azure AD es el recorrido en el navegador: abrir el popup, descargar la plantilla, llenarla y subirla. Las acciones exigen `sgsi:escribir` vía `autorConPermiso`, así que no hay forma de invocarlas desde un script sin puentear la autenticación — y eso no se toca.

Recorrido a probar en `http://localhost:3004/sgsi/inventario`:

1. «Importar desde Excel» → «Descargar plantilla .xlsx».
2. Llenar dos o tres filas usando la hoja `Valores válidos`, y **dejar una mal a propósito** para ver la vista previa marcarla.
3. Subir → «Validar archivo». Debe aparecer el conteo de listas y con errores, la tabla con lo leído y el detalle de cada error con su número de fila.
4. «Importar N activos» → el aviso verde con los códigos emitidos, y el inventario refrescado detrás.
