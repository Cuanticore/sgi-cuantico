# Prompt para el desarrollador · REQ-SIG-18

Copia todo lo que está debajo de la línea y pégalo como primer mensaje en la sesión del agente, con el repositorio clonado en `main` (commit `1bfdde1` o posterior) y la base de desarrollo levantada (`npm run db:up`).

---

Vas a construir la pantalla **Valoración de Activos** del SGSI de CUANTICO, y antes de eso a **corregir los registros de responsable del inventario**. Son dos entregables y el orden no es negociable: la pantalla resume `propietarioId` y `custodioId`, así que si los corriges después, lo primero que vas a ver son 35 activos en una fila «sin asignar» que no debería existir.

## 1 · Antes de escribir nada

Lee, en este orden:

1. **`docs/handoff_sig/pagina-valoracion-de-activos.md`** — el requerimiento, 792 líneas. Es la fuente de verdad. Empieza por el **§15** (la corrección de registros), sigue con el **§7** (lo que hay que cambiar en el inventario) y solo después el §4 al §6, que es la pantalla. Ese orden es el de ejecución.
2. **§14** del mismo documento — el anexo del match cargo → persona. Trae los nombres reales y las tres decisiones que estaban abiertas, ya cerradas el 2026-09-09.
3. `docs/handoff_sig/carga-consolidado-activos-v19.md` — REQ-SIG-12, la carga del consolidado. El §15 se apoya en su hallazgo H-19 y en su mapeo de columnas.
4. `docs/handoff_sig/carga-de-datos.md` — el mapa de orígenes. **Ojo: su §1 dice que el Cronograma SGC es una plantilla vacía y eso es falso**, corregido en REQ-SIG-17 §2. Si dos documentos se contradicen, manda el REQ más nuevo.

## 2 · Paso 0 · la consulta que decide la ruta

```sql
select count(*) from activo;
```

- **234** → **Ruta A**. V19 todavía no entró. No lleva **ni un solo `UPDATE`** sobre activos.
- **296 o 299** → **Ruta B**. V19 ya entró y hay que corregir lo cargado, con bitácora.

Las dos rutas están en el §15.5 y terminan en el mismo estado. **Dime cuál te salió antes de seguir**: cambia el trabajo de la mañana entera.

**A favor de la Ruta A: el importador de V19 ya está construido**, en `5d4dabb` (la lectura pura y probada), `1ab05b8` (el importador lo reconoce antes que el formato histórico) y `b40f69e` (la pantalla muestra el parte y lo que borra). Así que la Ruta A se reduce a corregir el catálogo, agregar el mapeo, y correr una importación que ya existe.

**El libro no está en el repositorio.** Si vas por la Ruta A necesitás que te lo pasen: `FOR-SIG-12 Consolidado de Activos de Información V19.xlsx`, que vive en el repositorio documental del SIG, en `14. Seguridad de la Informacion/2. Gestión de Activos y Protección de Información/0. Formato de Inventario por procesos/`. Pedilo antes de empezar.

## 3 · Entregable 1 · la corrección de registros

### 3.1 El catálogo de cargos · resuelve 26 casillas sin tocar un activo

Una renombrada y tres altas en `CargoResponsable`:

| Acción | Fila |
|---|---|
| **Renombrar** | `Architecture Manager` → `Architecture and Technology Manager` |
| Alta | `Project Manager` · solo `esCustodio` |
| Alta | `Data Analytics Manager` · solo `esCustodio` |
| Alta | `Quality Analyst` · `esPropietario` **y** `esCustodio` |

**Renombra la fila; no agregues una segunda.** Son el mismo cargo, hay **siete llaves foráneas** apuntando a `CargoResponsable`, y duplicarlo repite el incidente que el propio esquema documenta en su comentario: «así es como “Líder del SIG” y “Lider del SIG” terminaron coexistiendo en producción». Si te da la tentación de crear la nueva y dejar la vieja, releé §15.2.

Las altas nacen con `activo = true` y su `orden` a continuación del último. Las banderas van según el uso real en V19, no en `true` por defecto: poner las dos ofrecería en el desplegable de propietario dos cargos que la organización no usa así.

### 3.2 Las diez reasignaciones de H-19 · con sus códigos

| De (valor en V19) | A | Códigos |
|---|---|---|
| `Cada usuario` | **Operations & Services Manager** | `TEC-APP-0007` `TEC-APP-0008` `TEC-APP-0009` `TEC-APP-0010` `TEC-APP-0011` `TEC-APP-0012` `TEC-APP-0013` `TEC-APP-0014` |
| `External Legal Counsel` | **Chief Legal Officer** | `TEC-APP-0015` |
| `Cliente` | **Chief Operating Officer** | `TEC-EQU-0008` |

Cambia **solo `propietarioId`**. El custodio de esos diez no se toca.

### 3.3 La bitácora no es opcional

Invariante 7 del paquete: la bitácora va en la misma transacción que el hecho. Usa **`registrar(escritor, usuario, cambios)`** de `lib/sgsi/bitacora.ts` —el mismo que llama `crearActivo`— con `tabla: 'activo'`, `registroId` = el código, `campo: 'propietario'`, el valor anterior y el nuevo, y `motivo: 'REQ-SIG-18 §15.3 · H-19 · rol genérico reasignado a cargo real'`.

Sale idempotente casi gratis: `registrar()` ya filtra los cambios que no cambian nada (`bitacora.ts:45`). Haz el `update` del activo condicional al valor actual también, o mueves `updatedAt` sin motivo.

### 3.4 El mapeo en el importador · sin esto se deshace solo

**Las tres cadenas siguen en `FOR-SIG-12 … V19.xlsx`.** Si corriges la base y no el importador, la próxima reimportación las reintroduce y nadie lo nota hasta que la tabla vuelva a mostrar ocho activos sin propietario.

En `lib/sgsi/consolidado-lectura.ts`, antes de `opcional('propietario', …)` (línea 311), una tabla de sinónimos con las tres traducciones, **y que el aviso reporte que tradujo**. Un mapeo callado es tan malo como el null callado que reemplaza.

## 4 · Entregable 2 · la pantalla

`/sgsi/valoracion`, en el grupo «SGSI · Seguridad de la información» del sidebar, justo después de «Inventario de activos», abreviatura `VAL`.

Tres piezas, todas en el §4 al §6 del requerimiento:

- **Cuatro pilas alineadas** — Valor final, C, I, D — horizontales, apiladas por nivel, sobre una **escala absoluta compartida**. No normalices al 100 %: el largo tiene que significar cuántos activos. La marca del umbral cae en una x distinta por fila y esa desalineación es el hallazgo de la pantalla.
- **La matriz 4 × 6 en números**, debajo, que es la vista de tabla accesible.
- **Dos tablas de detalle**: la A por propietario (cargo) × nivel siguiendo la dimensión seleccionada; la B por persona × los cuatro criterios × seis niveles. **Son un solo componente llamado dos veces** —agrupador × criterios × niveles—; si te salen dos, el tinte y el cuadre van a divergir.

Lo que no debes volver a decidir:

- **El valor es `max(D,I,C)`** y ya está escrito en `lib/sgsi/formulas.ts:38`. No lo reimplementes y no lo guardes en una columna: es derivado.
- **El umbral se lee de `Parametro.umbral_valoracion`** (hoy 4). Cambiarlo a 3 tiene que mover las cuatro marcas sin recompilar.
- **Itera sobre las dimensiones activas**, no sobre tres constantes. `Dimension` admite cinco y hoy hay tres sembradas.
- **La rampa está validada** y es una sola para las cuatro pilas, claro → oscuro, valor 0 → 5:

  ```
  #93b4e0  #6c95d4  #4874c2  #2b52b8  #1b3a8a  #0c2461
  ```

  Los tres oscuros son `--hf-brand-500/700/900`. **No uses `--hf-brand-100` como paso claro**: da 1.12:1 contra el blanco y el segmento del valor 0 queda invisible. Si cambias un paso, vuelve a correr el validador (criterio 10).
- **Nada de verde ni rojo.** El verde está reservado para estado bueno; un activo de valor 5 es valioso, no malo.

### 4.1 Arranca la Tabla B por el caso vacío

Hoy casi ningún activo tiene custodio persona: `Activo.personaId` se escribe de a uno desde el popup de REQ-SIG-16 y solo para los subtipos entregables (**≈21 de 299**). El primer día la matriz va a estar casi vacía y **eso es correcto** — la línea de encuadre del §6.6 es la que lo explica. No pongas fila «Sin asignar»: con 275 activos aplastaría a las demás.

**Y hay una segunda capa que te va a parecer un error tuyo y no lo es.** `Activo.personaId` es llave foránea a `Persona`, y `Persona` se puebla desde el Directorio por Microsoft Graph — una sincronización que, por REQ-SIG-17 §7, **todavía no se ha corrido**. Así que la Tabla B puede quedar vacía **incluso si los `personaId` estuvieran puestos**, simplemente porque no hay personas. Constrúyela igual, verifica su caso vacío, y repórtalo: no es un bloqueo de esta pantalla, es una precondición de otro requerimiento. Lo que **no** debes hacer es sembrar personas para probar — `Persona.oid` es el object id de Azure AD y no se fabrica.

## 5 · Los cinco arreglos en el inventario

Sin esto, el clic no filtra y el requerimiento no está cumplido. Todos verificados en el código de hoy, §7 del requerimiento:

| | Defecto | Cambio |
|---|---|---|
| 7.1 | `InventarioActivos.tsx:215` arranca en `FILTROS_VACIOS` y no lee `useSearchParams` | Hidratar filtros desde la URL y reflejarlos con `router.replace` |
| 7.2 | No hay filtro por valor. El más cercano es `color`, que es banda de riesgo | Agregar `valor` y `valorMinimo` |
| 7.3 | No hay filtro por dimensión | Agregar `dimension` (`MAX` por defecto). El dato ya está: `page.tsx:67` arma el mapa por dimensión |
| 7.4 | `responsable` (`:298-300`) acepta si coincide **propietario O custodio** | Agregar `propietario` propio. **No cambies la semántica de `responsable`** |
| 7.5 | `ActivoVista` no trae `persona` y `page.tsx` no la selecciona | Agregar `persona` y `conPersona` |

**El 7.4 es el que hay que entender antes de tocar nada.** Si la celda cuenta por propietario y el enlace usa `responsable`, el inventario muestra **más filas de las que la celda dijo**: clic en un 41 y aparecen 63. Nada falla — el número simplemente miente. El contrato completo de parámetros está en el §8.

## 6 · Las cifras que tienen que cuadrar

De la corrección (§15.7):

| Consulta | Resultado |
|---|---:|
| `cargo_responsable where nombre = 'Architecture Manager'` | **0** |
| `cargo_responsable where nombre = 'Architecture and Technology Manager'` | **1** |
| `count(*) from cargo_responsable` | **14** |
| `activo where activo and propietario_id is null` | **0** |
| `activo where activo and custodio_id is null` | **18** — ni uno más |

De la pantalla (§10), como invariantes y no como cifras fijas, porque el total depende de qué carga esté aplicada:

1. En **cada** fila de la matriz, los seis niveles más «Sin valorar» suman los activos vigentes.
2. La fila del Valor final coincide con la primera pila **y** con los totales de la Tabla A. Un dato en tres lugares.
3. **Monotonía**: activos con máximo `≥ n` es siempre `≥` que cualquier dimensión con valor `≥ n`. Es aritméticamente obligatorio y es la prueba más barata de que el máximo está bien.
4. **Cuadre del clic**: cada celda con cuenta `n` abre el inventario con exactamente `n` filas. Pruébalo en una celda por propietario y en un segmento de cada pila.
5. Recargar V19 después de la corrección **no reintroduce** ningún null de responsable.
6. La pantalla **no escribe nada**: ni una fila en `Bitacora` por visitarla.

## 7 · Lo que NO debes hacer

- **No agregues otra librería de gráficos.** El repo ya tiene `echarts` y `echarts-for-react`. Mira `app/components/sgsi/inicio/RadarCapacidades.tsx`, el único SVG a mano del módulo, antes de decidir por cuál de las dos vías vas.
- **No crees tablas ni columnas nuevas en el esquema.** La pantalla agrega lo que ya existe.
- **No agregues `BIMESTRAL`** ni ningún valor a un enum sin que lo pida el requerimiento.
- **No pongas fila «Sin asignar» en la Tabla B** (decisión D-8) ni omitas «Sin propietario» en la Tabla A (D-3). Son decisiones opuestas a propósito, y la razón es la proporción.
- **No desempates el máximo.** Un activo con `C=4, I=4` cuenta en las dos dimensiones y por eso las cifras de «qué dimensión manda» no suman el total. La advertencia va **en pantalla**, no en un comentario.
- **No toques el filtro `color`.** Es banda de riesgo.
- **No corrijas el libro V19 ni el organigrama.** Los dos tienen defectos anotados (§14.4, §15.6) y se corrigen del lado de quien especifica.
- **No inventes datos que falten.** Si un cargo o una persona no resuelve, la corrección falla con el código del activo. Nada de valores por defecto en silencio.

## 8 · Cómo reportar

Si algo del requerimiento no se puede construir como está escrito, **anótalo y sigue con lo que no dependa de eso.** No cambies el requerimiento por tu cuenta y no adivines la intención: el documento de decisiones se actualiza del lado de quien especifica.

Al terminar, dime:

1. Qué ruta te salió en el paso 0, y cuántas casillas de responsable corregiste.
2. Las cifras del §6 comparadas con las reales.
3. Cuántos activos aparecen en la Tabla B el primer día.
4. Si alguna cifra no coincide — esa es la conversación.
