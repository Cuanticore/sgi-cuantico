# REQ-SIG-08 · Ciclo de Vida de Desarrollo Seguro

**Fecha:** 02/09/2026 · **Versión:** 1.0 · **Estado:** especificado, sin implementar
**Superficie:** sección «Desarrollo seguro» dentro de la pestaña **Tecnología**
**Fuentes:** PRO-TEC-04 (procedimiento), FOR-TEC-04 (hoja de vida, 12 hojas), PTR-TEC-03 (73 ítems), FOR-LCO-05 (anexo contractual), POL-TEC-05.
**Análisis previo:** [hoja-de-vida-for-tec-04.md](../../handoff_tecnologia/hoja-de-vida-for-tec-04.md)
**Decisiones que la condicionan:** D14, D15 y D17 del [registro del 02/09/2026](../../handoff_sig/decisiones-2026-09-02.md)

---

## 1. Contexto

El sistema documental ya tiene este módulo escrito y aprobado. No hay que inventar el modelo: hay que transcribirlo sin perderlo.

- **PRO-TEC-04** define ocho fases, **F0 a F7**, acopladas a las fases de proyecto de PRO-PRO-01 y PRO-PRO-02, con **seis puertas de control** P1 a P6. F3 Construcción y F6 Operación no tienen puerta: llevan controles continuos.
- **FOR-TEC-04** es la hoja de vida: doce hojas enlazadas por un identificador `SIS-001` **inmutable, que no cambia ni cuando el sistema se renombra**.
- **PTR-TEC-03** enumera **73 ítems** de verificación, cada uno con su puerta, su evidencia esperada, su aplicabilidad —desarrollo propio o contratado— y su control del Anexo A.
- **FOR-LCO-05** traslada lo mismo a los contratistas, con plazos de remediación por severidad.

La frase que gobierna todo: **«Un sistema sin hoja de vida abierta no puede desplegarse en los entornos productivos.»**

---

## 2. Alcance

### 2.1 Dentro

Hoja de vida del sistema, puertas de control con su resultado, excepciones, requisitos de seguridad, pruebas de seguridad, tratamiento de datos personales, componentes de terceros, liberaciones, y la verificación de los 73 ítems.

### 2.2 Fuera, y por qué

| Qué | Por qué |
|---|---|
| **El bloqueo del avance por puerta no superada** | **D17.** La aplicación registra y señala; no impide. El control vive en el procedimiento y en la gerencia de proyectos |
| **Los riesgos del sistema** | **D15.** La hoja `Riesgos` de FOR-TEC-04 usa probabilidad×impacto 1-5, que no es MAGERIT ni ISO 31000. Sería una tercera escala. Va al comité, y hasta entonces **este hueco es deliberado** |
| **Un motor de listas de verificación** | Los 73 ítems son **contenido del módulo A**. Construir un segundo motor sería el error más caro del paquete |
| **Una tercera lista de proveedores** | La organización es la de D4. Lo que sí es nuevo es el **componente** de terceros con su licencia y sus vulnerabilidades |
| **El ciclo de vida del producto** | **D14.** El producto agrupa sistemas; el ciclo es del sistema |
| **La gestión documental del código y los informes** | Se referencian como evidencia; viven donde ya viven |

---

## 3. Modelo

### 3.1 `Sistema`

| Campo | Tipo |
|---|---|
| `codigo` | `String @unique` — `SIS-001`, **inmutable, sobrevive al renombre** |
| `nombre`, `descripcion` | `String` |
| `tipo` | catálogo — aplicación web, API, integración, componente |
| `productoId` | `Int?` → `Producto` (D14) |
| `proyectoId` | `Int?` → `Proyecto` — FOR-PRO-01 Banco de proyectos |
| `clienteRef` | `String?` — cliente o proceso al que sirve |
| `criticidad` | → escala del SGSI |
| `clasificacionId` | → clasificación de la información |
| `trataDatosPersonales` | `Boolean` |
| `rolTratamiento` | `enum` — `RESPONSABLE` · `ENCARGADO` |
| `rtoObjetivo`, `rpoObjetivo` | `Int` minutos |
| `propietarioId`, `responsableTecnicoId` | → `Persona` |
| `activoId` | `Int?` → **`Activo`** — el ítem 50 exige que el sistema quede en el inventario |
| `faseActual` | `enum F0..F7` |
| `abiertaEn`, `cerradaEn` | `DateTime?` |

**`rtoObjetivo` y `rpoObjetivo` no son decorativos:** son el insumo del BIA anual que exige el sistema de continuidad, y hoy no existen en ninguna parte.

### 3.2 `PuertaSistema`

`sistemaId`, `puerta` (`P1`…`P6`), `resultado` (`SUPERADA` · `SUPERADA_CON_EXCEPCION` · `NO_SUPERADA` · `PENDIENTE`), `fecha`, `verificadoPorId`, `autorizaId`, `evidenciaId`, `excepcionId?`, `observacion`.

`@@unique([sistemaId, puerta])`. **Quien verifica y quien autoriza son campos distintos**, porque el procedimiento asigna esas dos autoridades a roles distintos.

### 3.3 `ExcepcionSeguridad`

| Campo | Tipo |
|---|---|
| `codigo` | `String @unique` — `EXC-2026-007` |
| `sistemaId`, `puerta` | a qué aplica |
| `justificacion` | `String` |
| `evaluacionRiesgo` | `String` |
| `aprobadaPorId` | → `Persona` — el Responsable de Seguridad de la Información |
| `fechaAprobacion` | `Date` |
| **`fechaCierre`** | `Date` — **obligatoria** |
| `cerradaEn`, `cerradaPorId` | `DateTime?` |

**Es la entidad más importante del módulo y la que ninguna spec tenía.** Una excepción es la única forma documentada de avanzar sin cumplir, así que lo que hay que controlar no es que exista, sino que **se cierre**. Por eso `fechaCierre` es obligatoria al crearla, no opcional: una excepción sin fecha de cierre es una exención permanente disfrazada.

### 3.4 `RequisitoSeguridad`

`sistemaId`, `codigo` (`REQ-001`), `categoriaId` (catálogo: control de acceso, cifrado, validación de entradas, registro de eventos, datos personales…), `texto`, `origen`, `prioridad`, `estado`, `verificadoEnId?` → `PruebaSeguridad`, `observacion`.

### 3.5 `PruebaSeguridad`

`sistemaId`, `codigo` (`PRB-003`), `tipo` (estático, composición, dinámico, penetración), `versionProbada`, `fecha`, `ejecutorId` o `ejecutorExterno`, `criticos`, `altos`, `medios`, `bajos`, `bloquea` (`enum` — `SI` · `NO` · `CON_EXCEPCION`), `evidenciaId`.

Los cuatro conteos por severidad se capturan; **el veredicto de si bloquea se calcula** contra los criterios de aceptación y la excepción, si la hay.

### 3.6 `TratamientoDatosPersonales`

`sistemaId`, `categoria`, `sensibles`, `finalidad`, `baseLegitimacion`, `titulares`, `volumen`, `ubicacionAlmacenamiento`, `transferenciaInternacional`, `paisDestino`, `garantiaAplicada`, `retencion`, `responsableId`.

Ley 1581 de 2012. **Es el bloque con mayor exposición legal del paquete** y hoy no existe en ninguna parte del sistema.

### 3.7 `Liberacion`

`sistemaId`, `version`, `fecha`, `tipo` (mayor, menor, corrección, emergencia), `solicitudId?` → **`Solicitud` tipo `CAMBIO_TI` de REQ-SIG-07**, `autorizaId`, `ejecutaId`, `planReversion` (`Boolean`), `resultado`, `observacion`.

> **Ojo con el nombre.** El `Despliegue` de REQ-SIG-06 es **dónde corre** —servidor, URL, contenedor, puerto—. `Liberacion` es **qué se liberó**. Son objetos distintos y en FOR-TEC-04 comparten el nombre «despliegue».

### 3.8 `ComponenteTercero`

`sistemaId`, `organizacionId?` → la organización fusionada de D4, `nombre`, `tipo`, `funcion`, `criticidad`, `licencia`, `version`, `ultimaEvaluacion`, `vulnerabilidadesConocidas`, `estado`.

Es el SBOM. La parte de «proveedor» ya está resuelta por D4; lo nuevo es el componente con su licencia, que el ítem 23 exige revisar por compatibilidad.

### 3.9 Los 73 ítems: contenido del módulo A

| Concepto de PTR-TEC-03 | Entidad |
|---|---|
| El catálogo de 73 ítems | **`ContenidoSig` de tipo `VERIFICACION`** + `ItemVerificacion` |
| Verificar una puerta de un sistema | **`Asignacion`** del módulo A |
| El resultado por ítem | **`RespuestaItem`**, que ya existe |

Lo único que hay que agregar a `ItemVerificacion` para este uso: `puerta`, `controlAnexoA`, `evidenciaEsperada` y `aplicaA` (`AMBOS` · `CONTRATADO`).

---

## 4. Reglas

**G1 · El código del sistema es inmutable y sobrevive al renombre.** Lo dice el propio formato, y es lo que permite que la trazabilidad no se rompa.

**G2 · Un sistema sin hoja de vida abierta no debe desplegarse en productivo.** La aplicación **lo señala; no lo impide** (D17).

**G3 · Las puertas no bloquean el avance** (D17). Se registran, se cuentan y salen en el tablero. El control vive en PRO-TEC-04 y en la gerencia de proyectos.

**G4 · Toda excepción nace con fecha de cierre.** Sin ella no se guarda. Una excepción vencida y sin cerrar es un hallazgo automático.

**G5 · Quien verifica una puerta no es quien la autoriza.** Dos campos, dos personas.

**G6 · La severidad que bloquea es un parámetro, no un número en el código.** Igual que los umbrales de las métricas y los plazos por tipo de hallazgo.

**G7 · Los plazos de remediación por severidad se parametrizan**, con los valores de FOR-LCO-05 como carga inicial: crítica **72 horas**, alta **15 días**, media **60 días**, baja **siguiente entrega planificada**. Corren desde la notificación, no desde el hallazgo.

**G8 · No se usan datos reales de producción en pruebas** salvo autorización escrita, temporal, con conjunto mínimo definido y fecha de eliminación. Es el ítem 40 y, según FOR-LCO-05, *«el requisito que con más frecuencia se incumple»*.

**G9 · La profundidad de la verificación es proporcional a la criticidad** del sistema y a la clasificación de la información que trata.

**G10 · Las mismas puertas aplican al desarrollo contratado.** Cambia quién ejecuta y que la evidencia se exige por contrato, no el nivel de exigencia. Los ítems marcados `CONTRATADO` se suman; ninguno se resta.

**G11 · Cerrar la hoja de vida exige P6.** El retiro no está completo sin migración o eliminación segura, revocación de accesos y credenciales, baja de componentes y salida del inventario, del monitoreo y del respaldo.

**G12 · Este módulo no tiene entidad de riesgo** (D15). Es deliberado y está documentado; no es un olvido.

---

## 5. Pantallas

Sección «Desarrollo seguro» dentro de la pestaña **Tecnología**.

| Pantalla | Contenido |
|---|---|
| **Sistemas** | Lista con fase actual, puertas superadas, criticidad y si trata datos personales. Filtro por producto, proyecto y fase |
| **Hoja de vida** | La ficha completa del sistema, con sus pestañas: identidad, puertas, requisitos, pruebas, datos personales, componentes y liberaciones |
| **Puertas de control** | El detalle de P1 a P6 con resultado, evidencia, quién verificó y quién autorizó. Ya existe como resumen en «Producto y puertas de control» |
| **Excepciones** | **La pantalla que más importa.** Todas las excepciones vigentes, con su fecha de cierre y los días que faltan o que ya pasaron |
| **Verificación** | Los 73 ítems filtrados por puerta y aplicabilidad, con el resultado por sistema. Monta sobre el motor del módulo A |
| **Datos personales** | El registro por sistema, con la transferencia internacional y el país de destino a la vista |

---

## 6. Roles

Los cinco de PRO-TEC-04, mapeados a lo que la aplicación puede distinguir:

| Rol del procedimiento | En la aplicación |
|---|---|
| Responsable técnico del sistema | `Sistema.responsableTecnicoId`. Mantiene la hoja de vida |
| Propietario del sistema | `Sistema.propietarioId`. Aprueba clasificación, paso a producción y retiro |
| Responsable de Seguridad de la Información | `Líderes SIG`. Verifica puertas y **aprueba excepciones** |
| Líder del proyecto | Vía `Proyecto`. Convoca la verificación |
| Proveedor de desarrollo | La organización de D4. No entra a la aplicación; su evidencia se carga |

---

## 7. Criterios de aceptación

1. Renombrar un sistema no cambia su código.
2. Una excepción sin fecha de cierre no se guarda.
3. Una excepción vencida y sin cerrar aparece en la pantalla de excepciones y genera hallazgo.
4. Registrar P4 como no superada **no impide** registrar P5: la aplicación lo señala y sigue.
5. La misma persona no puede figurar como quien verifica y quien autoriza una puerta.
6. Cambiar el plazo de remediación de severidad alta no requiere desplegar.
7. Los 73 ítems se cargan como contenido y **no crean tablas nuevas**.
8. Un sistema con `trataDatosPersonales = true` y sin registro de tratamiento aparece incompleto.
9. Cerrar la hoja de vida sin P6 registrada no es posible.
10. Un sistema marcado como contratado muestra los siete ítems adicionales de FOR-LCO-05.

---

## 8. Lo que queda por decidir

1. **Los riesgos del sistema** (D15), en el comité.
2. **Quién es el Responsable de Seguridad de la Información** como persona concreta, dado que el modelo de roles quedó en dos.
3. **Si el catálogo de 73 ítems se versiona.** PTR-TEC-03 va a cambiar, y las verificaciones ya hechas deben seguir apuntando a la versión con la que se hicieron — es la regla R10 del módulo A aplicada acá.
4. **`Proyecto`** todavía no existe como entidad.
5. **Cómo entra la evidencia del desarrollo contratado**, que la produce un tercero sin acceso a la aplicación.
