# CRUD de catálogos de apoyo — Plan de implementación

**Fecha:** 2026-08-25
**Diseño:** `../specs/2026-08-25-sgsi-catalogos-crud-design.md`
**Plan maestro:** `2026-08-24-sgsi-handoff-v2.md`
**Estado:** Completado · pendiente el recorrido en navegador

**Goal:** Que los ocho catálogos de apoyo de la pantalla 9 se puedan dar de alta, renombrar, retirar y reactivar desde la app, con bitácora y sin borrados físicos.

---

## Tareas

| # | Tarea | Archivo | Estado |
|---|---|---|---|
| 1 | Tabla de reglas por catálogo, compartida por acción y componente | `lib/sgsi/catalogos.ts` (nuevo, 142 líneas) | ✅ |
| 2 | Cuatro server actions con bitácora en la misma transacción | `app/sgsi/acciones/catalogos.ts` (nuevo, 597) | ✅ |
| 3 | Componente editable genérico | `app/components/sgsi/parametros/CatalogoEditable.tsx` (nuevo, 402) | ✅ |
| 4 | Cableado de los ocho catálogos | `ParametrosModelo.tsx`, `parametros/page.tsx` | ✅ |
| 5 | Baja del componente que sólo simulaba escribir | `CatalogoProveedores.tsx` (eliminado) | ✅ |
| 6 | Reconciliación de ubicaciones contra «Listas SGSI.xlsx» | `prisma/data/listas.json`, `prisma/seeds/magerit.ts` | ✅ |

### Dónde quedó cada tarjeta

- **Ubicaciones · Entornos · Proveedores** — reemplazadas en el lugar (§7).
- **Opciones de tratamiento** pasó a editable, y **Estado del tratamiento** recibió tarjeta hermana en §7. Se separaron porque dos `CatalogoEditable` en una misma tarjeta apilaban dos pies idénticos de tres líneas, que era una regresión visual.
- **Procesos y áreas** — tarjeta nueva en §6, debajo de la tabla de codificación. La tabla existente lleva el líder del área, que `ItemVista` no tiene dónde poner: sustituirla habría perdido información.
- **Capacidades operativas** — tarjeta de renombre solamente, dentro de la `Rejilla` de §8.
- **Cargos responsables** — reemplazada en el lugar.

---

## Verificación ejecutada

Corrida por el agente y **repetida por mí de forma independiente**:

```
npx tsc --noEmit        exit=0
npx eslint <tocados>    exit=0
npx jest                7 suites · 66 tests · todo en verde
npm run build           ✓ Compiled successfully · /sgsi/parametros presente
```

`npm run build` es el único de los cuatro que detecta un export ilegal en un módulo `'use server'`. Por eso está en la lista.

### Ida y vuelta contra la base real

El agente no pudo invocar las server actions desde un script — `autorConPermiso` necesita sesión de next-auth y `revalidatePath` necesita un request scope — **y lo dijo en lugar de afirmar que lo había hecho**. Importó los módulos reales `lib/sgsi/catalogos.ts` y `lib/sgsi/bitacora.ts` y corrió las mismas secuencias de transacción. **No se puenteó la autenticación en el código de la aplicación.**

Por cada uno de los siete catálogos con alta: alta → 1 fila de bitácora `alta`; renombre → 1 fila `nombre`; baja con motivo → la fila sigue existiendo con `vigente = false` y el motivo en la bitácora; reactivación → `vigente = true`; total 4 filas de rastro. Después limpieza y conteos de vuelta al valor inicial. `capacidad` ejercitó renombre + `nombreCorto`.

La guarda del área se probó en las dos direcciones: **con** un activo vigente la baja se rechaza, **sin** activos vigentes se permite.

Verificación de residuo: cero filas `ZZ Prueba` en las ocho tablas y en `activo`, cero `prefijo = 'ZZZ'`, `bitacora` en 0, y `capacidades 15 | áreas 10 | activos 234`.

### Reseed completo — ubicaciones reproducibles

```
npx tsx prisma/seed.ts
  234 activos · 25 acciones · 2256 riesgos sobre 122 activos
  omitido: 272 pares esperan la asignación de relevancia
  ✓ las 12 cifras de referencia del libro, todas
```

Y el estado del catálogo después del reseed, idéntico al aplicado a mano:

```
  vigente     0  Equipo Colaborador
  vigente     2  Físico
  vigente    27  No aplica  [protegido]
  vigente     0  Nube AWS
  vigente     0  Nube Microsoft 365
  vigente     0  Nube otro proveedor
  RETIRADA    0  Física
  RETIRADA    0  Local
  RETIRADA  205  Nube
activos sin ubicación: 0 · total activos: 234
```

Dos detalles del seed que costaron y quedaron comentados en `magerit.ts`:

1. `seedCatalogo` ahora setea `activo` **explícitamente** en el upsert. Dejarlo al default hacía que la bandera dependiera de si la fila ya existía — o sea, que el resultado del seed dependiera del estado previo de la base.
2. Los nombres retirados **se agregan a propósito** a la unión de valores. Si se los deja afuera, la fila del seed anterior queda intacta y **activa**: seguiría ofreciéndose justamente porque el catálogo dejó de listarla.

---

## Pendiente

**Recorrido en navegador.** El agente no levantó `next dev`, así que el renombre en línea, el Escape sin escribir y la fila de motivo están verificados por construcción y por tipos, no haciendo clic. El camino de Escape depende de que React 19 no dispare `blur` al desmontar, con un `ref` de cancelación como segunda barrera. Eso hay que verlo funcionando.

**Dos decisiones de datos que el CRUD ahora permite tomar, y que son del negocio:**

- `Transversal` (TRA) está en la base, no está en la lista del cliente, y tiene 0 activos.
- `Jhon Tamayo` es custodio de **57 activos** en la tabla de *cargos*. Es un nombre de persona en una tabla de posiciones. Cuando esa persona cambie de puesto, 57 activos apuntan a un fantasma — para eso existe `Por asignar`. Reasignarlos exige saber a qué posición corresponden.

**Proveedores:** los rangos del libro vivo dicen 14 (`$D$5:$D$18`); tenemos 7. Los otros 7 no están en ninguna fuente disponible. Se agregan desde el CRUD cuando el cliente los pase.
