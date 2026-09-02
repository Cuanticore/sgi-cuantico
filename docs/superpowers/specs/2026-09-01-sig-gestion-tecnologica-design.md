# Gestión Tecnológica y niveles del inventario — Especificación y diseño

**Fecha:** 2026-09-01
**Código:** REQ-SIG-06
**Versión:** 1.0
**Módulo:** E — Gestión Tecnológica · y cambios al inventario de activos
**Depende de:** el inventario del SGSI (`REQ-SIG-01`) y la entidad `Persona` del módulo A
**Fuente documental:** `FOR-SIG-12 Inventario - Ges. Tecno.xlsx` — hojas `Matriz de Activos`, `Diseño`, `Dependencias` y `Detalle de ambiente`
**Estado:** En diseño

---

## 1. Contexto

### 1.1 Lo que el sistema tiene hoy

Verificado sobre el código antes de diseñar:

1. **`Activo` tiene un solo padre.** `superiorId` con la relación autorreferente `ActivoJerarquia` (`prisma/schema.prisma:620`). Un activo depende de **un** activo superior, no de varios.
2. **No existen niveles.** Ninguna agrupación por encima del área y el tipo MAGERIT.
3. **El custodio es un cargo, no una persona.** `Activo.custodioId → CargoResponsable`. No hay forma de responder «quién tiene este portátil».
4. **No hay nada del despliegue**: ni servidores, ni ambientes, ni repositorios.
5. **234 activos y 2.256 riesgos** cuelgan del inventario actual. Cualquier cambio que multiplique activos multiplica riesgos.

### 1.2 Lo que trae el formato

El Excel de Gestión Tecnológica ya adelantó tres columnas —**Nivel 1, Nivel 2, Nivel 3**— antes del nombre del activo, y dos hojas nuevas:

| Hoja | Qué es | Volumen |
|---|---|---|
| `Diseño` | Bloc de trabajo con los valores de nivel: N1 `EMPRESA` · `PRODUCTOS` · `PROYECTOS`; N2 `MINTRACE` · `CONDUCPRO` · `Servicios Base` | 9 filas |
| `Dependencias` | `Activo Base · Activo relacionado · Nivel 3 del relacionado · Nombre relacionado` | 10 filas de ejemplo |
| `Detalle de ambiente` | Exportación real de GitHub, Coolify y los servidores: repo, ambiente, plataforma, servidor, ip, url, imagen, rama, contenedor, puerto, base de datos, estado, **evidencia** y **confianza** | 19 columnas · 130 filas |

La *Guía de uso* del formato **no documenta los niveles**: son posteriores a la versión 1 del documento. Esta especificación los define por primera vez.

### 1.3 Lo que el levantamiento de ambientes ya encontró

No es un dato menor para el diseño: la hoja `Detalle de ambiente` no es un catálogo limpio, es un hallazgo. Trae dos servicios marcados `legacy / abandonado` —uno con 5.822 reinicios—, una imagen de contenedor **sin tag ni registro** que no se puede rastrear, y una nota que dice literalmente *«RIESGO: vhost del mismo dominio que…»*. La pantalla de ambientes tiene que **mostrar eso**, no esconderlo detrás de una tabla ordenada.

---

## 2. Alcance

### 2.1 Dentro del alcance

- **Niveles del inventario**: jerarquía administrable de tres grados, con agrupación en el inventario de activos.
- **Dependencias entre activos**: relación de muchos a muchos, distinta de la jerarquía de contención.
- **Registro de despliegues**: las 130 filas de `Detalle de ambiente` como entidad propia, con importación.
- **Módulo Gestión Tecnológica**: niveles, ambientes, productos y proyectos.
- **Hoja de vida** de producto o proyecto, con versiones y etapas del ciclo de vida.
- **Mapa tecnológico**: árbol navegable con drill-down, exportable y editable desde el nodo.
- **Equipos**: cruce de personas del Directorio con los activos que tienen a cargo, y detección de quien no tiene ninguno.
- **`Activo.personaId`**: custodio persona, junto al custodio cargo que ya existe.

### 2.2 Fuera del alcance

| Qué | Por qué |
|---|---|
| Descubrimiento automático | El requerimiento de 2026 lo dejó para una fase posterior. Los despliegues se **importan** de un archivo exportado a mano; el modelo queda preparado para que mañana lo traiga una integración. |
| Valorar cada despliegue | Ver §3.4: un despliegue no es un activo y no genera riesgos. |
| Gestión de la configuración (`A.8.9`) | El análisis de registros del SGSI la marcó «no migrar»: la plantilla del consultor listaba servicios de otra organización. |
| Reemplazar `superiorId` | La jerarquía de contención se conserva. Ver §3.3. |

---

## 3. Modelo de datos

### 3.1 `NivelActivo` — la jerarquía de tres grados

| Campo | Tipo | Nota |
|---|---|---|
| `id` | `Int` | |
| `grado` | `Int` | 1, 2 o 3 |
| `nombre` | `String` | `EMPRESA`, `MINTRACE`, `Ambientes` |
| `padreId` | `Int?` → `NivelActivo` | Nulo solo en grado 1 |
| `clase` | `enum ClaseNivel?` | Solo en grado 1: `EMPRESA` · `PRODUCTO` · `PROYECTO` |
| `orden`, `activo` | | |

**Es una jerarquía de verdad, no tres columnas sueltas.** En el Excel nada impide que `MINTRACE` aparezca bajo `EMPRESA`; aquí el nivel 2 pertenece a un nivel 1 y el 3 a un 2. Sin eso, «agrupar por niveles» produce árboles imposibles y el mapa tecnológico no se puede dibujar.

`Activo` gana **`nivelId Int?`** apuntando al nivel 3 —el más específico—; los otros dos se derivan subiendo por `padreId`. Guardar los tres sería guardar lo derivable, contra la regla transversal del sistema.

### 3.2 `PlantillaNivel` — la configuración mínima de un producto

El requerimiento dice que un producto o proyecto tiene **al menos** esta configuración:

| Nivel 3 | Activos esperados |
|---|---|
| Código Fuente | Repositorio de código fuente |
| Ambientes | Desarrollo · Staging · Producción |
| Dependencias o Relacionados | Los activos de los que depende |
| Documentación | Privada · Confidencial · Pública |

`PlantillaNivel` guarda esa expectativa: `claseNivel`, `nombreNivel3`, `activoEsperado`, `obligatorio`. Al dar de alta un producto, el sistema **crea los nodos de nivel 3** y deja marcado lo que falta.

Es lo que convierte el inventario en algo verificable: la ficha del producto puede decir *«le faltan el ambiente de staging y la documentación pública»*, que es exactamente el trabajo que hoy nadie hace porque nadie sabe qué debería estar.

### 3.3 `DependenciaActivo` — el grafo, junto a la jerarquía

| Campo | Tipo |
|---|---|
| `activoId` | `Int` → `Activo` · el activo base |
| `dependeDeId` | `Int` → `Activo` · el activo relacionado |
| `tipo` | `enum TipoDependencia` — `USA` · `SE_DESPLIEGA_EN` · `AUTENTICA_CON` · `ALMACENA_EN` |
| `nota` | `String?` |

`@@unique([activoId, dependeDeId, tipo])`, y **una regla que el Excel no puede tener: no se admite un ciclo.** Si A depende de B y B de A, el mapa tecnológico deja de ser un árbol y el drill-down no termina.

**Convive con `superiorId`, no lo reemplaza.** Son dos relaciones distintas y confundirlas es el error clásico de estos inventarios:

- **`superiorId` es contención:** «este ambiente *está dentro de* MINTRACE». Un padre, un árbol.
- **`DependenciaActivo` es dependencia:** «el CRM *depende de* Apollo, RNEC, ANI, RUES, RUCOM, TusDatos, TransUnion, ANM y la credencial ILC Fabric». Muchos, y un grafo.

Los diez ejemplos de la hoja `Dependencias` son todos del segundo tipo.

### 3.4 `Despliegue` — el registro técnico

Las 19 columnas de `Detalle de ambiente`, con `activoId` (el activo padre, que es el componente) y `servidorId` (el activo servidor, cuando se conoce):

`nombre` · `componente` · `repoGithub` · `ambiente` · `plataforma` · `servidor` · `ip` · `url` · `imagen` · `tagRama` · `contenedorServicio` · `puerto` · `baseDatos` · `estado` · `evidencia` · `confianza` · `notas`

**Un despliegue no es un activo, por decisión del 01/09/2026.** El CRM aparece tres veces —staging, desarrollo y experimental— y son el mismo activo desplegado tres veces. Si cada fila fuera un activo, el inventario de Gestión Tecnológica se multiplicaría por seis y el motor generaría cerca de mil doscientos riesgos que nadie va a valorar. El riesgo se aprecia sobre el activo; el despliegue dice **dónde vive**.

Dos campos que no se pierden porque son la mitad del valor de la hoja:

- **`evidencia`** — de dónde salió el dato: «Coolify DB (tabla applications) + nginx sites-enabled». Un inventario técnico sin esto no se puede volver a verificar.
- **`confianza`** — `alta` · `media` · `baja`. Un dato inferido y uno confirmado no valen igual, y la pantalla lo muestra.

`ambiente` y `estado` son catálogos, no texto: sin eso no se puede contar cuántos servicios `legacy / abandonado` hay, que es justo lo que el levantamiento encontró.

### 3.5 Producto y su hoja de vida

| Entidad | Contenido |
|---|---|
| **`Producto`** | `nivelId` (grado 1 clase PRODUCTO o PROYECTO), `nombre`, `descripcion`, `responsableId` → `Persona`, `clienteRef?`, `activo` |
| **`VersionProducto`** | `productoId`, `version`, `fecha`, `notas`, `vigente` |
| **`EtapaCicloVida`** | `versionId`, `etapa`, `cumplida`, `evidencia`, `responsableId`, `fecha` |

Las etapas salen del ciclo de vida seguro que pide ISO/IEC 27001 en `A.8.25` a `A.8.31`: **requisitos de seguridad · diseño seguro · desarrollo · pruebas de seguridad · separación de entornos · paso a producción · retiro**. Son un catálogo parametrizable, no un enum en el código.

**Cada versión repite el ciclo.** Es lo que hace la hoja de vida útil en auditoría: no basta con que el producto haya cumplido las etapas una vez en 2024; la pregunta es si la versión que está en producción hoy las cumplió.

---

## 4. Reglas de negocio

| # | Regla |
|---|---|
| **E1** | El nivel 2 pertenece a un nivel 1 y el 3 a un 2. Un nivel con hijos no se puede desactivar sin resolver qué pasa con ellos. |
| **E2** | `Activo.nivelId` apunta al **nivel 3**. Los grados 1 y 2 se derivan; no se almacenan. |
| **E3** | **No se admiten ciclos** en `DependenciaActivo`. La validación va en el servidor: la interfaz ayuda, no decide. |
| **E4** | La dependencia es **dirigida y tipada**. «A depende de B» no implica «B depende de A», y el tipo dice en qué sentido. |
| **E5** | Un despliegue **no genera riesgos**. El riesgo se aprecia sobre su activo padre. |
| **E6** | La importación de despliegues es **idempotente** por `repoGithub + ambiente + servidor`: reimportar la exportación de GitHub actualiza, no duplica. |
| **E7** | Un despliegue importado **sin activo padre reconocido queda pendiente de asociar**, visible y contado. No se descarta en silencio, que es como se pierden los servicios olvidados. |
| **E8** | La plantilla del producto **no bloquea**: señala lo que falta. Un producto incompleto se puede guardar; lo que no se puede es que nadie lo sepa. |
| **E9** | `Activo.personaId` es el custodio **persona**; `custodioId` sigue siendo el cargo. Al inactivar una persona, sus activos quedan listados para reasignar, igual que sus tareas. |
| **E10** | Baja lógica y bitácora en todo, como en el resto del sistema. |

---

## 5. Pantallas

Pestaña nueva en el header: **Tecnología**, junto a Mi SIG · Indicadores · Estratégico · SGSI · Operación.

| Pantalla | Contenido |
|---|---|
| **Mapa tecnológico** | El componente clave. Árbol con drill-down desde el nivel 1 hasta el activo y su despliegue, con icono por tipo, hoja en los ítems, exportable, y edición del activo desde el nodo. |
| **Niveles** | Administración de la jerarquía de tres grados y de las plantillas por clase. |
| **Ambientes** | Los despliegues: importación, asociación al activo padre, y los pendientes de asociar. Con el estado y la confianza a la vista. |
| **Productos y proyectos** | Listado y **hoja de vida**: versiones y cumplimiento de las etapas del ciclo de vida. |
| **Dependencias** | El esquema de dos listas —activos de información a la izquierda, relacionados a la derecha— con selección múltiple. |
| **Equipos** | Personas del Directorio cruzadas con los activos que tienen a cargo, y quién no tiene ninguno. |

Y un cambio en una pantalla existente: **el inventario de activos gana agrupación por niveles**, junto a los filtros que ya tiene.

---

## 6. Roles

Con el modelo de dos roles vigente desde el 01/09/2026: **`Líderes SIG`** administra todo el módulo. **Colaborador** no entra, salvo para ver los activos que tiene a cargo desde su propia ficha.

Permisos nuevos: `tecnologia:ver`, `tecnologia:escribir`, `tecnologia:administrar`.

---

## 7. Criterios de aceptación

| Criterio | Verificación |
|---|---|
| Niveles | Un nivel 2 no puede colgar de otro nivel 2, y el inventario agrupa por los tres grados. |
| Dependencias | El CRM muestra sus nueve dependencias; intentar cerrar un ciclo se rechaza en el servidor. |
| Importación | Reimportar las 130 filas no crea duplicados, y las que no reconocen su activo padre quedan contadas como pendientes. |
| Sin inflar el riesgo | Tras importar los 130 despliegues, el número de riesgos del sistema **no cambia**. |
| Plantilla | Un producto nuevo nace con sus cuatro nodos de nivel 3 y señala los activos que le faltan. |
| Hoja de vida | Una versión nueva arranca con las etapas del ciclo sin cumplir; la versión anterior conserva las suyas. |
| Equipos | La vista lista las personas activas del Directorio sin ningún activo a cargo. |
| Evidencia | Cada despliegue conserva de dónde salió el dato y con qué confianza. |

---

## 8. Lo que queda por decidir

1. **Los valores reales de nivel 1.** La hoja `Diseño` lista `CUANTICO`, `PRODUCTOS` y `PROYECTOS`, pero la matriz usa `EMPRESA`. Hay que fijar cuál es.
2. **Qué hacer con los dos servicios `legacy / abandonado`** que encontró el levantamiento. No es una decisión de software: o se apagan o se documentan como activos vigentes.
3. **Si el mapa tecnológico incluye los despliegues como hojas** o se detiene en el activo. Lo diseño incluyéndolos, porque es donde está la información que hoy no se ve.
