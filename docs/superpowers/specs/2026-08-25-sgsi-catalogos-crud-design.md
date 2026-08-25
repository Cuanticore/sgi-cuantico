# CRUD de catálogos de apoyo — Especificación y diseño

**Fecha:** 2026-08-25
**Plan:** `../plans/2026-08-25-sgsi-catalogos-crud.md`
**Plan maestro:** `../plans/2026-08-24-sgsi-handoff-v2.md`
**Origen:** pedido del cliente al recibir «Listas SGSI.xlsx» — que las listas se puedan editar dentro de la app
**Estado:** Implementado · pendiente el recorrido en navegador

---

## Requerimiento

Textual: *"quiero que esto también sean editables, o sea que dentro de la app en alguna sección pueda eliminar algún item o agregar más según la lista — mejor dicho, el CRUD para cada una de ellas."*

La pantalla 9 (`/sgsi/parametros`) ya mostraba los catálogos, pero **de sólo lectura**. `CatalogoProveedores.tsx` parecía editable y no lo era: su propio comentario de cabecera lo admitía — *"the write path arrives with the mutation layer"*. Editabas, decía «2 cambios sin guardar», y no se guardaba nada.

---

## Alcance: ocho catálogos, más dos vistas filtradas

| Catálogo | Alta | Baja | Nota |
|---|---|---|---|
| Proceso o área | ✅ | ⚠️ | El prefijo es inmutable; baja rechazada si tiene activos vigentes |
| Cargo responsable | ✅ | ✅ | |
| Proveedor | ✅ | ✅ | Sin columna `orden`: se lee por nombre |
| Ubicación | ✅ | ✅ | Ídem |
| Entorno | ✅ | ✅ | Ídem |
| Opción de tratamiento | ✅ | ✅ | `Riesgo.tratamientoId` es nullable |
| Estado del tratamiento | ✅ | ✅ | `Riesgo.estadoId` es nullable |
| Capacidad operativa | ❌ | ❌ | **Renombre solamente** |

### Y dos vistas filtradas, agregadas después

`cargoPropietario` y `cargoCustodio` son **vistas** de `cargo_responsable`, no catálogos nuevos: una fila por posición, dos listas curadas por separado a través de las banderas `esPropietario` / `esCustodio`. El cliente pidió que PROPIETARIO y CUSTODIO ofrecieran listas distintas, después de que este documento se escribiera.

**Su «retirar» significa otra cosa** y esa es la parte que hay que tener presente: en una vista filtrada voltea la bandera, no da de baja la posición. La fila sigue viva, conserva su otra bandera y sigue respondiendo por los activos, controles, riesgos y acciones que la apuntan. En el catálogo completo (`cargo`, pantalla 9) sigue siendo una baja lógica.

Por qué banderas y no dos tablas: `cargo_responsable` es apuntado por siete claves foráneas, y partirlo deja dos verdades sobre la misma posición la primera vez que alguien renombra un lado. Detalle en `2026-08-25-sgsi-listas-cargo-separadas` (memoria) y en el comentario del esquema.

### Por qué la capacidad operativa no admite alta ni baja

`Control.capacidadId` **no es nullable** y el modelo **no tiene bandera de vigencia**. Una baja es imposible a nivel de base de datos, y una capacidad nueva sería un eje del radar con cero controles. Las quince salen de ISO/IEC 27002:2022 y suman exactamente los 93 controles del Anexo A. Se puede renombrar, y también su `nombreCorto`, porque las columnas angostas y los ejes del radar no admiten el nombre completo.

Las acciones **rechazan con un mensaje**, no lanzan excepción: la pantalla tiene que poder explicar por qué, no romperse.

### Lo que NO entra, y por qué

**`EstadoAccion`, `TipoAccion`, `VerificacionEficacia`, `Ternario`, `OrigenRiesgo`** son *enums* de Postgres. Editarlos exige una migración y además gobiernan lógica. Los cuatro primeros coinciden al 100% con lo que pide «Listas SGSI.xlsx», así que no hay nada que reconciliar.

**Las escalas** (valor, degradación, frecuencia, madurez, umbrales de impacto y riesgo) alimentan la aritmética del motor. Ya tienen su propia sección en la pantalla 9 y no son listas de texto libre: un CRUD genérico sobre ellas sería la forma más rápida de romper la clasificación de riesgo.

**La taxonomía MAGERIT** (tipos y subtipos) es normativa y la abreviatura del tipo está dentro del código del activo.

---

## Decisiones de diseño

### 1. Nunca se borra físicamente

La fila `parametro` `borrado_fisico = false` ya fijaba la regla: *"Toda baja es lógica; la bitácora es inmutable."*

`retirarItem` pone `activo: false` (`activa` en `Area`). La fila queda, las FK aguantan, y el valor deja de ofrecerse. **Un valor retirado todavía tiene que explicar los datos históricos que lo apuntan** — 205 activos siguen diciendo «Nube» y esa respuesta tiene que seguir siendo legible.

Que funcione depende de un hecho verificado: **todos los desplegables filtran `where: { activo: true }`** (`ficha.query.ts`, `importar.ts`, `plantilla-activos/route.ts`). La pantalla 9 los muestra todos, que es lo correcto: es la pantalla de administración.

Hay un segundo argumento estructural: `AccionPlan.responsableId` y `AccionPlan.apruebaId` apuntan a `CargoResponsable` con **FK no nullable**. Un borrado físico fallaría.

### 2. El motivo de la baja es obligatorio

`registrarBaja` lo exige y la acción lo valida antes de escribir. *"¿Por qué desapareció este valor?"* es la pregunta que un auditor siempre hace. La interfaz pide el motivo escrito en una fila en línea — un `window.confirm` no alcanza, porque no deja rastro.

### 3. Las filas retiradas se muestran, atenuadas, con «reactivar»

No se esconden. Esconderlas es exactamente cómo alguien vuelve a crear el duplicado. Y por eso el choque de nombres tiene **dos** mensajes distintos: si el nombre lo tiene una fila vigente, es un duplicado; si lo tiene una fila **retirada**, el mensaje dice que la reactive en lugar de crear una segunda.

### 4. El prefijo del área es inmutable

`Area.prefijo` es `@db.Char(3)` único y está **dentro del código de cada activo del área** (`AAA-TTT-NNNN`, inmutable y no reutilizable). Entonces: obligatorio en el alta, validado contra `^[A-Z]{3}$`, y `renombrarItem` **nunca** lo toca. El `nombre` sí se renombra libremente — el nombre no es la FK.

La baja de un área con activos vigentes **se rechaza**, no se hace lógica: su contador por (área, tipo) y su prefijo siguen en uso, y la ficha necesita el área para renderizar.

### 5. Toda escritura va a la bitácora, en la misma transacción

`registrarAlta`, `registrar` (campo `nombre`) y `registrarBaja`, con `tabla` = el nombre del `@@map` para que una entrada del rastro se pueda trazar hasta la fila sin saber qué pantalla la escribió. La reactivación también deja fila, con motivo «Se deshizo la baja».

### 6. Las diferencias entre catálogos viven en una tabla, no en ocho ramas

`lib/sgsi/catalogos.ts` describe los ocho una sola vez (`tabla`, `etiqueta`, `sustantivoUso`, `permiteAlta`, `permiteBaja`, `tieneOrden`, `pidePrefijo`, `usaNombreCorto`). La validación se escribe una vez. Sólo las escrituras de Prisma se despachan con un `switch`, porque los delegates no son intercambiables estructuralmente y pelear con los tipos sale peor que tres `switch` explícitos.

Vive en `lib/` y no junto a las acciones porque **un módulo `'use server'` no puede exportar constantes**. `tsc` no lo detecta; sólo `npm run build`. `export type { Catalogo }` sí es legal: SWC lo borra antes de la comprobación.

---

## Dos errores del brief, corregidos por el agente

1. **`Proveedor`, `Ubicacion` y `Entorno` no tienen columna `orden`.** El brief pedía `max(orden)+1` para los ocho. Son tres los que se leen por nombre; el `orden` aplica a los otros cinco.
2. **El conteo de usos de los cargos estaba mal.** `page.tsx` sumaba 5 de las 7 relaciones, omitiendo `riesgos` y `accionesAprueba`. Y el pie de la tarjeta llama *"candidato a baja"* a un cargo con cero referencias — o sea que el subconteo invitaba a retirar un cargo que dos relaciones todavía usaban. Corregido en `page.tsx` y en la acción, y el pie ahora nombra las siete.

---

## Riesgo conocido, aceptado

`max(orden)+1` se calcula dentro de la transacción, pero en `READ COMMITTED` dos altas simultáneas pueden caer en el mismo `orden`. **`orden` no es único en ninguno de estos modelos**, así que es un empate cosmético en el orden de la lista, no una violación de restricción. No amerita un lock.
