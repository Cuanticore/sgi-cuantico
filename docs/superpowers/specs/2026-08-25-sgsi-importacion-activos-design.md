# Importación masiva de activos — Especificación y diseño

**Fecha:** 2026-08-25
**Plan:** `../plans/2026-08-25-sgsi-importacion-activos.md`
**Plan maestro:** `../plans/2026-08-24-sgsi-handoff-v2.md`
**Origen:** pedido explícito del cliente sobre la pantalla `/sgsi/inventario`, fuera de las ocho fases
**Estado:** Implementado

---

## Requerimiento

Textual: *"en inventario de activos necesitamos un botón donde se pueda descargar la plantilla de importación y un botón para cargar la plantilla de importación con los datos. Podemos colocar solo 1 botón y que abra un popup y ahí hacemos todo el proceso, y alertas si se subieron los datos correctamente, y toda la gestión en esta vista."*

Se traduce en cuatro requisitos:

| # | Requisito | Escenario de aceptación |
|---|---|---|
| R1 | Un solo punto de entrada en `/sgsi/inventario` | Existe un botón «Importar desde Excel» junto a «Exportar a Excel». Abre un popup y todo el proceso ocurre ahí, sin navegar |
| R2 | Descarga de la plantilla | El popup ofrece un `.xlsx` con las columnas a llenar y los valores válidos vigentes |
| R3 | Carga con validación previa | Al subir el archivo se muestra fila por fila qué se leyó y qué está mal, **antes** de escribir nada |
| R4 | Alertas de resultado | Al confirmar, un aviso dice cuántos activos entraron, con qué códigos, y cuántas filas quedaron afuera y por qué |

---

## Decisiones de diseño

### 1. La plantilla se genera desde la base, no se versiona como archivo

`GET /api/sgsi/plantilla-activos` arma el libro en el momento con dos hojas:

- **`Activos`** — los 17 encabezados a llenar más una fila de ejemplo marcada `EJEMPLO — borrá esta fila`.
- **`Valores válidos`** — cada tipo, subtipo, proceso, cargo, ubicación, entorno, proveedor y nivel de la escala, **tal como están hoy en la base**, con la nota de a qué tipo pertenece cada subtipo.

**Por qué:** una plantilla con la lista de valores escrita a mano queda obsoleta el día que alguien agrega un subtipo en Parametrización, y desde entonces cada importación falla por un motivo que nadie puede ver. Generarla desde el catálogo hace que el archivo y el validador no puedan divergir.

Dos columnas **no** existen a propósito:

- **Código del activo.** Lo emite el sistema (`AAA-TTT-NNNN`), es inmutable y no se reutiliza. Una columna para él sería una invitación a llenarla.
- **Valor del activo.** Es `max(v_D, v_I, v_C)`. Se calcula, no se captura — misma regla que rige toda la herramienta.

### 2. Dos pasos: analizar y después importar

Dos server actions, no una:

- `analizarPlantilla(FormData)` → `Analisis`. Lee, valida, **no escribe**.
- `importarPlantilla(FormData)` → `Resultado`. Vuelve a leer **el mismo archivo** y escribe lo que valida.

**Por qué el import vuelve a leer el archivo en lugar de recibir las filas ya parseadas del navegador:** el cliente puede poner cualquier cosa en ese payload, incluidos `areaId` y `subtipoId` que nunca aparecieron en el archivo. Mandar de vuelta las filas era más barato y era una vulnerabilidad. El costo real es volver a abrir un `.xlsx` de pocos KB.

Efecto colateral deseable: la vista previa y la importación comparten el lector, así que **no pueden discrepar**.

### 3. La decisión de qué significa una fila vive en un módulo puro

| Módulo | Responsabilidad |
|---|---|
| `lib/sgsi/plantilla.ts` | El contrato de columnas. Lo comparten la ruta que genera el `.xlsx`, la acción que lo lee y el popup que muestra la vista previa — tres lugares que no deben derivar |
| `lib/sgsi/plantilla-lectura.ts` | **Puro.** Sin Prisma ni exceljs. Recibe una matriz de texto de celdas más los catálogos, y devuelve el veredicto de cada fila |
| `app/sgsi/acciones/importar.ts` | Sólo IO: abre el libro, carga catálogos, escribe filas |

**Por qué:** mismo criterio que `lib/sgsi/madurez.ts`. La lógica que clasifica datos tiene que poder ejercitarse sin el entorno que los guarda. El resultado son 16 tests con catálogos ficticios y sin base de datos.

**El orden de las columnas es el contrato.** El lector direcciona celdas por posición, así que insertar una columna en el medio cambia lo que significa una plantilla ya distribuida. Se agrega al final.

### 4. La escritura es una sola transacción

Todas las filas válidas entran juntas o no entra ninguna.

**Por qué:** un inventario a medio importar es peor que ninguno — las cifras se ven plausibles y las filas que faltan son invisibles. Además los contadores de código ya se habrían movido para las filas que sí entraron, y esos números no se reutilizan.

Las filas **con errores** sí se omiten, y el mensaje final dice cuántas: una fila descartada que nadie informó es exactamente el defecto que esta pantalla existe para evitar.

Cada activo creado escribe su `registrarAlta` en la bitácora dentro de la misma transacción, y al cerrar se llama `generarRiesgos`: una valoración que alcanza el umbral es lo que trae los riesgos a la existencia.

### 5. Criterios de validación por fila

| Campo | Regla | Motivo |
|---|---|---|
| Tipo / Subtipo | Se matchea el **código entre corchetes**; `[D] Datos / Información` y `[D]` son lo mismo | El texto después del código es redacción de la persona, no dato |
| Subtipo | Debe pertenecer al tipo de **esa** fila | El error habitual es un subtipo válido bajo el tipo equivocado. El mensaje dice contra qué tipo se verificó, que es lo que lo hace corregible |
| Proceso, cargos, ubicación, entorno, proveedor | Nombre, ignorando acentos y mayúsculas | Escribir «Direccion» por «Dirección» es un error de tipeo, no de dato |
| Valor D/I/C | Acepta la etiqueta (`4 — Alto`) **o** el número suelto (`4`) | Excel convierte la celda en número en cuanto alguien la retipea |
| Valor fuera de escala | Se rechaza, no se recorta | Un 9 recortado a 5 es un dato inventado |
| Código heredado | Opcional. Se rechaza si ya existe en el inventario o si se repite dentro del archivo, señalando la primera fila | Es la trazabilidad con documentos ya emitidos: duplicarlo la rompe |
| Preguntas Sí/No | Lo no reconocido queda `POR_DEFINIR`, nunca `NO` | Una pregunta sin responder sobre datos personales no debe leerse como una respuesta |
| Fila de ejemplo y filas en blanco | Se omiten sin reportarlas | Una línea vacía en medio de una hoja es normal, y el ejemplo no es dato |

Los errores de una fila se **acumulan todos**, no se corta en el primero: quien corrige la planilla quiere ver de una vez todo lo que le falta.

### 6. Permiso y tope

Ambas acciones exigen `sgsi:escribir` vía `autorConPermiso` — el autor y el permiso juntos, porque cada activo creado necesita un autor en la bitácora. La ruta de la plantilla exige sesión.

Tope de 8 MB por archivo: muy por encima de cualquier inventario plausible y muy por debajo de algo que duela parsear.

---

## Fuera de alcance

- **Actualizar activos existentes.** La plantilla sólo da de alta. Modificar por lote requiere decidir qué campos son sobreescribibles y qué motivo se registra en la bitácora, y eso no está pedido.
- **Importar valoraciones sobre activos ya cargados.** Se editan en la grilla del inventario.
- **Jerarquía (`superiorId`) y cantidad.** No están en la plantilla: el activo superior se referencia por código, que en una importación todavía no existe.
