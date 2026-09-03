# Decisiones del 02/09/2026

Doce decisiones tomadas por el líder del SIG en una sola sesión, a partir del control de integración y de la revisión de las siete políticas de Gobierno de la Seguridad y los ocho documentos de Continuidad del Negocio. Este documento es la fuente: si una spec dice otra cosa, manda esto y hay que corregir la spec.

---

## 1. Modelo de datos

### D1 · Se crea `Proceso` como entidad distinta de `Area`

Un proceso pertenece a un área: **`Proceso.areaId` obligatorio**, un área puede tener varios procesos, un proceso vive en una sola área. Los nueve procesos de FOR-CAL-04 son las filas iniciales.

La decisión se confirma sola con el caso de Yuliet Rojas: está en el área **Operaciones** y lidera el proceso **Tecnología y Soporte**. Con una sola entidad ese hecho no se puede escribir.

### D2 · Solo migra a `Proceso` lo que la norma pide por proceso

| Entidad | Llave |
|---|---|
| `Auditoria` y el programa anual | **`procesoId`** |
| Indicadores | **`procesoId`** |
| `RequisitoLegal.procesoEncargado` | **`procesoId`** — deja de ser `String`, que era la violación del invariante de origen tipado |
| Dueños de tarea (configuración base) | **`procesoId`** |
| `Activo` | `areaId`, sin cambio |
| `Hallazgo` | `areaId`, sin cambio |

Los 234 activos no se tocan. La columna `Proceso` de FOR-SIG-12 se conserva como dato heredado y no se vuelve llave.

### D3 · `AlcanceObligacion` se amplía con `ACTIVO`, `TIPO_ACTIVO` y `NIVEL_ACTIVO`

Es la costura que vuelve al activo el eje del sistema y sin la cual cuatro obligaciones de política no se pueden expresar.

Con alcance por tipo o por nivel, **la generación produce una asignación por activo vigente al abrir el periodo, dirigida a su propietario**. Una sola obligación cubre los 234 activos y sigue viva cuando entre el 235. El alcance `ACTIVO` cubre la obligación puntual sobre un activo concreto.

Regla que hay que escribir: si al abrir el periodo un activo no tiene propietario, la asignación **no se crea en el vacío** — se dirige al responsable de seguimiento de la obligación y se marca el faltante. Un activo sin propietario es un hallazgo, no un error de generación.

### D4 · `Proveedor` y `ParteInteresada` se fusionan en una sola entidad

Una tabla de organizaciones con un tipo, en vez de dos registros sin relación para la misma empresa. Habilita la reevaluación anual que exige POL-TEC-02 y el cruce proveedor → activos que soporta.

**Consecuencia que hay que aceptar explícitamente:** gestión estratégica y el inventario de activos pasan a compartir el dueño del dato. Antes, Compras editaba su matriz y Tecnología la suya sin pisarse. Después, un cambio de nombre o de estado se ve en los dos módulos. Hay que decidir quién autoriza el alta de una organización — la propuesta es Compras, con Tecnología pudiendo asociarla a activos pero no crearla.

### D5 · `Evidencia` exige dueño: al menos `controlId` o `hallazgoId`

Restricción a nivel de base. Se descarta la evidencia suelta, que en la práctica produce un cajón de archivos sin contexto. No se amplía por ahora a `activoId` ni `auditoriaId`.

### D6 · `ContenidoSig` se versiona, y el versionado no invalida

El registro de realizado apunta a **la versión que la persona leyó**. Corregir el texto no invalida los veinte registros previos, y el auditor puede ver el texto exacto que leyó cada uno. Es lo que pide POL-SIG-02 sobre control de versiones.

Queda sin resolver el caso duro: un cambio de fondo en una política **sí** debería obligar a leer de nuevo. La propuesta es que el versionado sea automático y la reapertura sea una acción explícita del líder del SIG al publicar la versión, no una consecuencia del guardado.

---

## 2. Periodicidades

### D7 · Se adopta el default para las catorce obligaciones que las políticas dejaron sin definir

| Periodicidad | Obligaciones |
|---|---|
| **Anual** | Revisión por la dirección · Verificación del directorio de autoridades y grupos de interés · Monitoreo del cumplimiento de políticas · Revisión de procedimientos · Revisión integral del inventario de activos · Revisión de los modelos de acuerdo de confidencialidad · Revisión de informes de protección física de proveedores |
| **Semestral** | Revisión de riesgos de la cadena de suministro TIC · Revisión de accesos, permisos e integraciones de proveedores · Revisión de servicios en la nube contra los requisitos |
| **Trimestral** | Verificación de configuración vigente contra la línea base · Revisión de la relación de software autorizado y prohibido · Verificación de eficacia de las listas de bloqueo · Revisión de excepciones al filtrado web |

**Esto no cierra la brecha documental.** Las políticas siguen diciendo «con la periodicidad que defina la organización» y esa definición ahora vive en la aplicación, no en un documento aprobado. Hay que llevarlo al comité y dejarlo en el documento que corresponda, o en la próxima auditoría la respuesta a «¿dónde está definida esta periodicidad?» va a ser «en el software».

### D8 · Pruebas de restauración de respaldos: **semestral**

Decisión del líder del SIG, contra la recomendación de cargar la más exigente.

> **Riesgo asumido, y hay que actuar sobre él.** Uno de los documentos de continuidad pide las pruebas **trimestrales**. Mientras ese documento diga trimestral y la operación sea semestral, tenemos una no conformidad que nos escribimos nosotros mismos: el auditor la encuentra comparando dos documentos propios. **Antes de cargar la obligación hay que modificar el documento que pide trimestral.** Si no se modifica, la decisión correcta es cargar trimestral.

### D9 · Autoevaluación del puesto de trabajo remoto: el código es **FOR-SIG-13**

El de POL-TAL-01, que es la dueña del control A.6.7 de trabajo remoto. Los documentos de Continuidad que la citan como FOR-SIG-16 están equivocados y hay que corregirlos.

---

## 3. Carga de datos

### D10 · `SIC` es **Sistema Integrado de Gestión**

El proceso lo lidera **Katherine**. Corrige mi lectura previa y cierra el último hueco del mapa de dueños de proceso.

### D11 · Áreas de origen

| Persona | Área | Procesos que lidera |
|---|---|---|
| Albeiro Medina | **Finanzas** | Financiero · Talento Humano |
| Yuliet Rojas | **Operaciones** | Tecnología y Soporte |

Ninguna de las dos áreas coincide con el nombre de un proceso, que es exactamente el escenario que D1 hace representable.

### D12 · Los dos servicios legacy se cargan sin abrir hallazgo

Entran al inventario con su marca de anomalía y su nivel de confianza a la vista. La decisión de apagarlos o documentarlos como vigentes queda en Tecnología, sin plazo ni responsable asignado por ahora.

> Uno de los dos acumula **5.822 reinicios** y sirve el mismo dominio que producción desde otro servidor. Cargarlo sin hallazgo significa que queda visible pero sin nadie a cargo de resolverlo. Vale la pena ponerle fecha en el comité aunque no sea un hallazgo formal.

---

## 4. Alcance

### D13 · Se escribe la spec de Operación del SGSI

Eventos, verificaciones y solicitudes —los antiguos M3, M4 y M6— pasan de seis artboards aprobados a especificación formal, con el mismo nivel que las otras cinco: entidades, reglas, pantallas, roles y criterios de aceptación. Era lo único del paquete sin spec, y entregarlo solo como dibujos repetiría el desfase que acabamos de reconciliar.

---

---

## 5. Ciclo de vida de desarrollo seguro

Decisiones tomadas tras revisar `7. Desarrollo Seguro` — FOR-TEC-04, PRO-TEC-04, PTR-TEC-03 y FOR-LCO-05. El análisis completo está en [hoja-de-vida-for-tec-04.md](../handoff_tecnologia/hoja-de-vida-for-tec-04.md).

### D14 · Un producto agrupa varios sistemas

`Producto` **sobrevive** como el nivel 1 `PRODUCTOS` de la jerarquía de activos, y **`Sistema` cuelga de él**. MINTRACE es un producto compuesto por varios desplegables con ciclo de vida independiente.

Consecuencias que hay que escribir en la spec:

- La **hoja de vida es del sistema, no del producto**. Las seis puertas de control, los 73 ítems de verificación y las ocho fases F0–F7 pertenecen a `Sistema`. `Producto` no tiene ciclo de vida propio.
- `Producto` queda reducido a lo que es: un agrupador con nombre, responsable y cliente. **`VersionProducto` y `EtapaCicloVida` de REQ-SIG-06 §3.5 se retiran** — la versión y el ciclo son del sistema.
- La pantalla «Hoja de vida del producto» del prototipo pasa a mostrar **el resumen de los sistemas que lo componen**, con el estado de puertas de cada uno, y la hoja de vida detallada se abre al entrar a un sistema.

### D15 · La tercera metodología de riesgo va al comité

No se construye nada de riesgos del sistema hasta que el comité unifique las metodologías. La hoja `Riesgos` de FOR-TEC-04 valora probabilidad 1-5 × impacto 1-5, que no es MAGERIT ni ISO 31000.

**Queda como brecha documentada.** Mientras tanto, la spec del ciclo de vida se escribe **sin** la entidad de riesgo del sistema, y con una nota de que ese hueco es deliberado. Si el comité decide que son riesgos MAGERIT, no hay nada que deshacer; si decide que son propios, se agrega la entidad después.

### D16 · Orden: primero Operación del SGSI, después Desarrollo Seguro

Se respeta el orden de D13. Operación del SGSI tiene los seis artboards aprobados y solo le falta la spec. El ciclo de vida de desarrollo seguro (REQ-SIG-07) entra después, con D14 y D15 ya resueltas.

> **Riesgo del orden, y hay que vigilarlo:** REQ-SIG-06 §3.5 sigue en el paquete con el modelo viejo. Está marcada como provisional y con la advertencia de no construirla, pero si el desarrollador llega a Gestión Tecnológica antes de que exista REQ-SIG-07, va a construir `Producto` con un ciclo de vida que D14 ya retiró. **La nota tiene que sobrevivir en el PR.**

### D17 · Las puertas de control no bloquean en el software

En REQ-SIG-08, la aplicación **registra y señala; no impide**. No se implementa el bloqueo de avance por puerta no superada, ni la excepción como llave que lo desbloquea.

- La **`Excepcion` sigue existiendo** como registro —PRO-TEC-04 la exige documentada, justificada, evaluada por riesgo, aprobada por el Responsable de Seguridad y con fecha de cierre— pero es un hecho que se anota, no un permiso que el sistema concede.
- Una puerta no superada se ve, se cuenta y sale en el tablero. Nadie queda trabado esperando una aprobación dentro de la herramienta.
- Es coherente con lo que la plantilla mínima del producto ya hace: *«no bloquea: señala»*.

> **Lo que esto implica, para que quede dicho.** El control de «una puerta no superada impide avanzar» pasa a vivir **en el procedimiento y en la gerencia de proyectos, no en el software**. La aplicación deja de ser evidencia de que el control operó y pasa a ser evidencia de que el estado se conoció. Si un auditor pregunta cómo se impide desplegar sin P4, la respuesta es PRO-TEC-04 y el líder del proyecto, no una validación de servidor. Es una decisión razonable —una herramienta que bloquea sin conocer el contexto termina obligando a mentirle— pero conviene que el procedimiento lo diga con esas palabras.

---

## Lo que sigue abierto

1. **Quién autoriza el alta de una organización** tras la fusión de D4.
2. **Si un cambio de fondo reabre la lectura** en D6, y quién lo decide al publicar.
3. **Modificar el documento de continuidad** que pide pruebas trimestrales (D8) y los que citan FOR-SIG-16 (D9).
4. **Llevar al comité** las catorce periodicidades de D7 para que queden en un documento aprobado.
5. **Ponerle fecha a los dos servicios legacy** (D12).
6. La anomalía del residual de oportunidades en la matriz de riesgos organizacionales, pendiente de llevar al comité de riesgos.
