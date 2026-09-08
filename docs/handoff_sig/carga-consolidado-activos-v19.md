# Requerimiento · Carga del Consolidado de Activos V19

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-12 · carga del consolidado |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-07 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo (ejecución asistida con Claude Code) |
| **Fuente funcional** | `FOR-SIG-12 Consolidado de Activos de Información V19.xlsx` (344 KB, 12 hojas) |
| **Estado** | Decisiones D-1/D-2/D-3 **cerradas** (§9) · listo para ejecutar |

---

## 1 · Objetivo

Cargar el **archivo final V19** —activos, sus dependencias y el detalle de ambiente— preservando la **integridad relacional** que el libro ya construyó. Hoy la base tiene 234 activos migrados de una versión anterior con su valoración D/I/C; V19 los sustituye por **296 activos** ya codificados, jerarquizados y con su tejido de dependencias y despliegues.

El importador actual (`app/sgsi/acciones/importar.ts`) **solo carga `Activo` + `ActivoValor`** y **regenera el código**. Este requerimiento lo **extiende** para que además cargue jerarquía, dependencias y despliegues, y para que **respete el código que trae el libro**. Sin esa extensión, el 100 % del tejido relacional de V19 se pierde en la carga.

---

## 2 · Qué trae el archivo (hojas relevantes)

| Hoja | Filas con dato | Alimenta | Modelo destino |
|---|---:|---|---|
| **Matriz de Activos** (cab. fila 7, datos fila 8+) | 296 | El activo, su valoración, jerarquía y entorno | `Activo`, `ActivoValor`, `NivelActivo` |
| **Detalle de ambiente** (cab. fila 1, datos fila 2+) | 129 | Dónde vive cada componente (25 columnas) | `Despliegue` |
| **Dependencias** (cab. fila 1) | 107 (98 con base, 9 huérfanas) | Aristas activo→activo | `DependenciaActivo` |
| **Grafo** / **Grafo (aristas)** | 585 nodos / 718 aristas | **Derivadas** — verificación, no carga | — |
| **Hallazgos de criterios** | 44 (11 abiertos) | Deuda conocida del libro | — (contexto) |

Las dos hojas **Grafo** están **precalculadas a partir de las tres primeras**, con la columna «Fuente del dato» que declara de dónde sale cada arista. **No se importan**: son el patrón de oro contra el cual se verifica que la app reproduce el mismo grafo (§7).

---

## 3 · Regla de oro: el código del libro se PRESERVA, no se regenera

Es la decisión con más consecuencias, por eso va primero.

Los 296 activos ya traen su código en formato `AAA-TTT-NNNN` (los 296 cumplen `^[A-Z]{3}-[A-Z]{3}-[0-9]{4}$`, cero excepciones). **Toda** la hoja Dependencias, **todo** el Detalle de ambiente y **todas** las aristas del Grafo referencian a los activos por ese código exacto (`TEC-SER-0001`, `TEC-EQU-0004`…).

- **`Activo.codigo` ← el código del libro, tal cual.** No se llama a `ContadorCodigo` para emitir uno nuevo.
- **`Activo.codigoHeredado` queda nulo** (o se reserva para el código pre-migración si aún se conserva). El código del libro **ya es** el definitivo, no el heredado.
- **Sembrar `ContadorCodigo`** con el máximo consecutivo observado por cada `(área, tipo)`, para que las altas futuras continúen la serie sin repetir. Máximos por combinación (segmento 1 = área, segmento 2 = tipo):

  `TEC-SER:52 · TEC-APP:33 · TEC-EQU:16 · TEC-RED:13 · TEC-GEN:11 · TEC-PER:7 · TEC-CLA:6 · TEC-AUX:1` · `SIG-DAT:30 · SIG-PER:2 · SIG-APP:1 · SIG-EQU:1` · `PRO-DAT:17 · PRO-PER:7 · PRO-APP:2 · PRO-SER:2 · PRO-GEN:1` · `COM-DAT:19 · COM-PER:4 · COM-APP:3 · COM-CLA:1 · COM-EQU:1` · `FIN-DAT:8 · FIN-PER:6 · FIN-SER:5 · FIN-CLA:2 · FIN-APP:1 · FIN-EQU:1 · FIN-SOP:1` · `LCO-DAT:14 · LCO-PER:2 · LCO-APP:1 · LCO-EQU:1` · `EST-DAT:10 · EST-PER:4 · EST-EQU:1 · EST-INS:1` · `TAL-DAT:8 · TAL-PER:5` · `CLI-DAT:3`

**Por qué no regenerar.** El prefijo de área del código **no siempre coincide** con la columna «Proceso o Área» del mismo activo (p. ej. hay 134 códigos con prefijo `TEC` pero solo 122 activos en el proceso «Gestión Tecnológica»; y 29 códigos `PRO` frente a 41 activos en «Gestión de Proyectos»). Si el importador recalcula el código desde `(área, tipo)` como hace hoy, esos ~12 activos recibirían un prefijo distinto al que ya llevan en el libro y **se romperían todas sus referencias** en Dependencias, Ambiente y Grafo. El código es inmutable por diseño (REQ-SIG-01 §3); la carga lo respeta.

---

## 4 · Mapeo hoja → modelo

### 4.1 Matriz de Activos → `Activo` + `ActivoValor` + jerarquía

| Col | Encabezado | Campo destino | Nota |
|---:|---|---|---|
| 2 | Código | `codigo` | **preservar** (§3) |
| 3–5 | Nivel 1 / 2 / 3 | `nivelId` | resolver contra `NivelActivo` grado 3 (§4.4) |
| 6 | Nombre del activo | `nombre` | |
| 7 | Descripción | `descripcion` | |
| 8 | Cantidad | `cantidad` | |
| 9 | Tipo de activo | `tipoId` | por código entre corchetes `[S]`, `[D]`… |
| 10 | Subtipo de activo | `subtipoId` | por código entre corchetes, dependiente del tipo |
| 11 | Proceso o Área | `areaId` | catálogo `Area` |
| 12 | Custodio | `custodioId` | `CargoResponsable` · **18 vacíos** (permitido, §6) |
| 13 | Propietario del activo | `propietarioId` | `CargoResponsable` · 0 vacíos |
| 14 | Ubicación | `ubicacionId` | 12 vacíos (H-21) |
| 15 | Entorno | `entornoId` | catálogo `Entorno` · 43 vacíos + 193 «No aplica» |
| 16 | ¿Datos de cliente? | `datosCliente` | `Ternario` (Sí/No) |
| 17 | ¿Datos personales (1581)? | `datosPersonales` | `Ternario` |
| 18 | ¿Expuesto a Internet? | `expuestoInternet` | `Ternario` |
| 19 | Proveedor o subencargado | `proveedorId` | catálogo `Proveedor` |
| 20 | Depende del activo superior | `superiorId` | **2ª pasada** (§5) · 9 filas con dato |
| 21–23 | Valor D / I / C | `ActivoValor` (una fila por dimensión) | escala 0–5, acepta «4 — Alto» o «4» |
| 24 | Valor del activo (0 a 5) | — | **derivado, NO se guarda** (máx. de D/I/C) |

### 4.2 Detalle de ambiente → `Despliegue`

Mapeo casi 1:1 (el libro ya resolvió los códigos del activo padre y del servidor):

| Col | Encabezado | Campo | | Col | Encabezado | Campo |
|---:|---|---|---|---:|---|---|
| 1 | Activo Padre Ambiente | `activoId` (por código) | | 14 | url | `url` |
| 3 | Activo Padre Servidor | `servidorId` (por código) | | 15 | imagen | `imagen` |
| 7 | Nombre | `nombre` | | 16 | tag_rama | `tagRama` |
| 8 | componente | `componente` | | 17 | contenedor_servicio | `contenedorServicio` |
| 9 | repo_github | `repoGithub` | | 18 | puerto | `puerto` |
| 10 | ambiente | `ambiente` | | 19 | base_datos | `baseDatos` |
| 11 | plataforma | `plataforma` | | 20 | estado | `estado` |
| 12 | servidor | `servidor` | | 21 | evidencia | `evidencia` |
| 13 | ip | `ip` | | 22 | confianza | `confianza` (`ALTA`/`MEDIA`) |
| | | | | 23 | notas | `notas` |

- Columnas 2, 4, 5, 6 (nombres de padre y Nivel 1/2) son de contexto/visualización; 24 «servidor original» y 25 «Revisión del enlace» son metadatos de origen. No van al modelo (o van a `notas`/`evidencia` si se quiere conservar).
- **Idempotencia** por `@@unique([repoGithub, ambiente, servidor])` con `NULLS NOT DISTINCT` (ya en el modelo, E6): reimportar actualiza, no duplica.
- **58 de 129 filas no traen «Activo Padre Ambiente»** → `Despliegue.activoId = NULL`, estado **PENDIENTE DE ASOCIAR** (E7). Se cargan, se cuentan y se ven; **no se descartan en silencio**. `confianza`: 54 alta, 75 media.

### 4.3 Dependencias → `DependenciaActivo`

- 107 filas: **98 con «Activo Base» válido** y **9 huérfanas** sin base (servicios de información externos: Apollo, RNEC, ANI, RUES, RUCOM, TusDatos, TransUnion, ANM, ILC Fabric — es el hallazgo **H-43**, abierto).
- Dirección: `activoId` = «Activo Base», `dependeDeId` = «Activo relacionado».
- **Sin ciclos de ninguna longitud** (E3): validar la cadena completa con `caminoDelCiclo` de `lib/sig/dependencias.ts` antes de aceptar cada arista.
- **El tipo se deriva del Grafo.** La hoja Dependencias no trae la columna del enum `TipoDependencia`, pero «Grafo (aristas)» sí lo tiene derivado (`usa` 50, `depende de` 49, `alojado en` 19). **Cerrado (D-1):** el importador toma el tipo de esa hoja cruzando cada par (Activo Base → relacionado) contra su arista, con el mapeo `usa`→`USA`, `alojado en`→`SE_ALOJA_EN`, `depende de`→`USA` (por defecto). `AUTENTICA_CON`/`ALMACENA_EN` no aparecen en el libro y quedan para refinamiento manual en la app.

### 4.4 Niveles (columnas 3/4/5 de la Matriz) → `NivelActivo`

- Es una **jerarquía real de 3 grados**, no tres columnas sueltas (E1). Grado 1 = Nivel 1 (`clase`: `EMPRESA` para CUANTICO, `PRODUCTOS`, `PROYECTOS`), grado 2 = Nivel 2 (`padreId` → su grado 1), grado 3 = Nivel 3 (`padreId` → su grado 2).
- `Activo.nivelId` apunta **solo al grado 3**; los grados 1 y 2 se derivan subiendo por `padreId`.
- Distribución Nivel 1: CUANTICO 230 · PRODUCTOS 48 · PROYECTOS 18.
- **H-33 (abierto):** 18 filas del Detalle de ambiente usan ramas de Nivel 2 que no existen en las listas maestras de la Matriz. Homologar antes de cargar, o el nivel quedará sin resolver.

---

## 5 · Orden de carga (una transacción, con 2ª pasada)

1. **Verificar catálogos** ya cargados (`Area`, `TipoMagerit`/`SubtipoMagerit`, `CargoResponsable`, `Ubicacion`, `Entorno`, `Proveedor`). Abortar con reporte si falta un valor referenciado — no crear catálogos al vuelo.
2. **`NivelActivo`** — sembrar la jerarquía de 3 grados desde las combinaciones Nivel 1/2/3 distintas.
3. **`Activo` + `ActivoValor`** — con el **código preservado**; `superiorId` y `nivelId` aún nulos si el destino no se ha creado.
4. **2ª pasada `superiorId`** — resolver «Depende del activo superior» y `nivelId` cuando ya existen todos los activos y niveles.
5. **`DependenciaActivo`** — con validación de ciclos; saltar y reportar las 9 huérfanas.
6. **`Despliegue`** — idempotente; `activoId` nulo cuando no hay padre.
7. **Sembrar `ContadorCodigo`** al máximo por `(área, tipo)` (§3).
8. `generarRiesgos(prisma)` **solo sobre activos**, nunca sobre despliegues (E5: un despliegue no es un activo y no genera riesgos).

Todo en un `$transaction` (patrón del importador actual). Los riesgos se **generan**, no se cargan.

---

## 6 · Casos borde y deuda conocida (de «Hallazgos de criterios»)

| # | Situación | Cantidad | Cómo la trata la carga |
|---|---|---:|---|
| H-20 | Activos sin custodio | 18 | `custodioId` nulo permitido por el esquema; se cargan |
| H-19 | Propietario como rol genérico («Cada usuario», «Cliente») | 9 | mapear al `CargoResponsable` correspondiente; reportar |
| H-14 | Nombres de activo repetidos | 2 pares | `TEC-RED-0001`/`0004` (54.86.37.61) · `TEC-RED-0008`/`0009`. Se cargan (el código desambigua); reportar para desduplicar |
| H-21 | Sin Ubicación | 12 | `ubicacionId` nulo; se cargan |
| H-43 | Dependencias sin activo base | 9 | **no** se cargan como arista; se reportan como pendientes |
| H-41 | Componentes sin activo padre en Ambiente | 58 | `Despliegue.activoId` nulo, PENDIENTE DE ASOCIAR |
| H-33 | Nivel 2 del Ambiente fuera de las listas de la Matriz | 18 | homologar antes; si no resuelve, reportar sin abortar |

Ningún caso borde debe **abortar** la carga completa: se cargan las filas válidas y se devuelve el parte fila por fila, como ya hace `analizarPlantilla`.

---

## 7 · Verificación: ¿el grafo está en línea con la data?

Se hicieron dos comprobaciones distintas.

### 7.1 Coherencia interna del libro (Grafo vs. sus propias hojas)

El «Grafo (aristas)» es **derivado y trazable**: cada una de las 718 aristas declara su fuente, y los conteos cuadran con las hojas de origen:

| Relación en el Grafo | # | Sale de |
|---|---:|---|
| `contiene` | 405 | Matriz · Niveles 1/2/3 (299 + 85 + 18 + 3) |
| `se despliega en` | 71 | Detalle de ambiente · Activo Padre Ambiente |
| `corre en` | 67 | Detalle de ambiente · Activo Padre Servidor |
| `forma parte de` | 57 | Detalle de ambiente · componente sin despliegue |
| `usa` | 50 | Hoja Dependencias |
| `depende de` | 49 | Hoja Dependencias |
| `alojado en` | 19 | Derivada del Detalle de ambiente |

**Está en línea, salvo por 3 nodos colgantes** — el único desajuste real:

> **3 activos existen como nodo del grafo y como destino de aristas, pero NO son filas de la Matriz de Activos:**
> - `TEC-GEN-0012` — «Arquitectura — Repositorio de código fuente» (contenedor de 6 componentes sin despliegue)
> - `TEC-SER-0053` — «SERVICIOS BASE — Dependencias de terceros»
> - `TEC-SER-0054` — «SIG — Dependencias de terceros»
>
> Por eso el grafo cuenta **299 activos** y la Matriz solo **296**: `299 = 296 + 3`. Son nodos agregadores que el grafo asume existentes pero que el inventario no lista. **Cerrado (D-2):** se dan de alta como activos con su mismo código, con área y tipo tomados del propio código (`TEC-GEN`→Gestión Tecnológica/genérico, `TEC-SER`→Servicios), nombre del nodo del grafo y valoración por regla (H-31), marcados «pendiente de confirmar atributos». Con ellos el inventario pasa a 299 y ninguna arista queda colgando.

Resto de integridad referencial: Detalle de ambiente **0 códigos rotos**; Dependencias y Grafo solo rompen contra esos mismos 3 códigos; **todos los 296 activos de la Matriz aparecen como nodo** (0 faltantes).

### 7.2 El grafo de la APP vs. el grafo del libro

El grafo de la aplicación (`app/tecnologia/grafo/`, SVG a mano) se dibuja **solo** desde `DependenciaActivo` (aristas sólidas) y `Activo.superiorId` (contención, punteadas). **No pinta los despliegues.** El libro sí: `se despliega en` (71) y `corre en` (67) salen del Detalle de ambiente.

Consecuencia: sin cambios, **una vez cargado V19 el grafo de la app mostraría ~195 aristas menos** que el libro (los 71 + 67 + 57 de ambiente/componentes). No es un error de datos —la data está completa en `Despliegue`— sino una diferencia de **qué decide dibujar la vista**. **Cerrado (D-3):** la vista del grafo **incorpora** las aristas de despliegue (`se despliega en` activo↔ambiente, `corre en` activo↔servidor) dentro del modo «Ambas», con **interruptor propio y apagadas por defecto**. Así el modo por defecto conserva la legibilidad que buscó el autor del SVG y, cuando se necesita el mapa técnico completo, está a un clic; la data queda además en `tecnologia/mapa` y las fichas de ambiente.

---

## 8 · Criterios de aceptación (prueba de paridad)

La carga se considera terminada cuando, contra V19:

1. **296** activos cargados, los 296 con su código **idéntico** al del libro y su valoración D/I/C.
2. **0** referencias rotas entre `DependenciaActivo`/`Despliegue` y `Activo` (incluidas las 3 altas de D-2 → **299** activos en total).
3. **98** dependencias cargadas (+ 9 huérfanas reportadas, no cargadas) y **0 ciclos**.
4. **129** despliegues (71 con activo padre, 58 pendientes de asociar); reimportar el mismo archivo **no crea duplicados**.
5. Jerarquía de 3 grados navegable; `Activo.nivelId` siempre a grado 3.
6. Los riesgos se **regeneran** solo sobre activos; su número cambia respecto a los 234 previos y eso es esperado.
7. El grafo de la app reproduce las aristas de dependencia y contención del libro, y las de despliegue en el modo «Ambas» (D-3).

---

## 9 · Decisiones cerradas

Las tres decisiones quedan **cerradas con la recomendación adoptada el 2026-09-07** para no frenar el desarrollo. Son ratificables por el comité del SGSI, pero la implementación **no las espera**.

- **D-1 · Tipo de dependencia → DERIVAR DEL GRAFO.** El importador toma el tipo de «Grafo (aristas)» cruzando cada par (Activo Base → relacionado): `usa`→`USA`, `alojado en`→`SE_ALOJA_EN`, `depende de`→`USA` (por defecto). `AUTENTICA_CON`/`ALMACENA_EN` no existen en el libro y se refinan a mano en la app. *No* requiere editar el Excel, así que no bloquea. Fondo de H-22 pendiente: una futura versión del formato debería traer la columna del tipo explícita.
- **D-2 · Los 3 nodos colgantes → DARLOS DE ALTA.** `TEC-GEN-0012`, `TEC-SER-0053`, `TEC-SER-0054` se crean como activos con su código, área y tipo tomados del propio código, nombre del nodo del grafo y valoración por regla (H-31), marcados «pendiente de confirmar atributos». El inventario pasa a **299** y ninguna arista queda colgando.
- **D-3 · Aristas de despliegue en el grafo → INCORPORARLAS, apagadas por defecto.** La vista `tecnologia/grafo` suma `se despliega en` / `corre en` dentro del modo «Ambas», con interruptor propio, off por defecto. El defecto mantiene la legibilidad; el mapa técnico completo queda a un clic.

> Estas resoluciones son mi recomendación técnica como especificación, no un acuerdo de comité. Si el comité del SGSI cambia alguna, solo se ajusta este §9 y su sección asociada; el resto del requerimiento no depende de cuál se elija.

---

## 10 · Resumen para el desarrollador

Extender `app/sgsi/acciones/importar.ts` (y su lector `plantilla-lectura.ts`) para: **(1)** preservar `Activo.codigo` y sembrar `ContadorCodigo`; **(2)** leer Nivel 1/2/3 → `NivelActivo` y `superiorId` en 2ª pasada; **(3)** cargar la hoja Dependencias → `DependenciaActivo` con validación de ciclos; **(4)** cargar Detalle de ambiente → `Despliegue` idempotente. Todo en una transacción, con parte fila por fila y sin abortar por casos borde. Las hojas Grafo no se cargan: son la verificación. **D-1/D-2/D-3 quedan cerradas (§9)** con la recomendación adoptada, así que el desarrollo puede arrancar sin esperar al comité.
