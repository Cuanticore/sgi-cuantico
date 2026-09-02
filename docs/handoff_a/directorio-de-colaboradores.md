# Directorio de colaboradores

**Fecha:** 02/09/2026 · **Extiende:** REQ-SIG-02 (`Persona`)
**Fuentes:** `05. TALENTO HUMANO\Contratacion\Relación Personal Cuantico.xlsx` · `06. GESTION LEGAL Y COMPRAS` · PRO-TAL-01, PRO-TAL-03 y PRO-TAL-04.

Un listado único de colaboradores, sincronizado del Directorio Activo, con activos e inactivos en la misma tabla, que sostenga los datos de contacto, el ciclo de vinculación y desvinculación, y las actas de borrado seguro.

---

## 1. Lo que hay hoy

Una hoja de cálculo con **31 columnas** y **dos pestañas**: 38 personas activas y 18 inactivas.

La composición sorprende y cambia el diseño:

| Tipo de contrato | Personas |
|---|---|
| Prestación de servicios | 25 |
| Nómina | 6 |
| Familiar | 5 |
| Activa por proveedor | 1 |
| Por horas | 1 |

**Solo 6 de 38 son de nómina.** Los otros 32 son contratistas, y PRO-TAL-04 les exige capacitación cuando la naturaleza del servicio lo requiera o cuando hayan tenido más de un contrato en la vigencia. Cualquier diseño que asuma «colaborador = cuenta del Directorio Activo» deja fuera a la mayoría.

### 1.1 Cinco problemas del archivo, que el modelo tiene que resolver

1. **«Prestación de Servicios» está escrito de tres formas distintas** —`Prestación de Servicios`, `prestación de Servicios` y `Pestación de Servicios`, esta última con error de digitación—. Siete valores donde debería haber cuatro. Es el argumento del catálogo cerrado, en su forma más literal.
2. **El estado se come el tipo.** En la hoja de inactivos, la columna `TIPO DE CONTRATO` dice `Inactivo`. Al pasar a inactivo **se pierde qué contrato tenía la persona**, que es justo lo que hay que saber después. `Tipo de Colaborador` tiene el mismo defecto: `inactivo` aparece como valor junto a Base, Recurrente y Temporal.
3. **Dos pestañas separadas.** Retirar a alguien es cortar y pegar entre hojas, con la estructura duplicada y ninguna garantía de que las columnas coincidan.
4. **`FECHA ÚLTIMA CAPACITACIÓN` y `FECHA EVALUA. DESEMPEÑO` se mantienen a mano.** Son exactamente lo que el motor del módulo A genera y registra. Hoy hay dos fuentes de verdad para el mismo hecho, y la del Excel es la que se cita en auditoría.
5. **Datos personales sensibles en una hoja de cálculo.** Cédula, dirección, teléfono, fecha de cumpleaños, hijos, edad, EPS, pensiones, ARL, caja y cesantías. Es un activo de información con datos personales de categoría especial, y merece estar en el inventario con esa clasificación.

---

## 2. Modelo

### 2.1 `Persona` — qué se agrega

`Persona` ya existe en REQ-SIG-02 y se alimenta del Directorio Activo. Se le agrega:

| Campo | Tipo | Nota |
|---|---|---|
| `origen` | `enum` — `DIRECTORIO` · `MANUAL` | La costura del problema de los contratistas: quien tiene cuenta se sincroniza; quien no, se crea a mano y no puede entrar a la aplicación, pero sí figura, se le controla y se le exige |
| `documentoIdentidad` | `String?` | |
| `tipoContratoId` | → catálogo | Cerrado. Cuatro valores, no siete |
| `tipoColaboradorId` | → catálogo | Base · Recurrente · Temporal. **Sin `inactivo`** |
| `fechaIngreso`, `fechaInicioContrato`, `fechaTerminacion` | `Date?` | |
| `proyectoId` | → `Proyecto` | Hoy es texto (`CUANTICO`, `SICOV`) |
| `telefono`, `correoPersonal`, `ciudad`, `direccion` | `String?` | Datos de contacto |
| `retiradoEn` | `DateTime?` | |

**No hay columna `estado`.** Activo o inactivo se calcula de `retiradoEn`, igual que todo lo derivable en este sistema. Una sola tabla, un solo filtro: nadie corta y pega entre pestañas, y el tipo de contrato sobrevive al retiro.

### 2.2 Lo que deliberadamente **no** entra

EPS, pensiones, ARL, caja de compensación, cesantías, hijos, edad y fecha de cumpleaños.

Son datos de nómina y bienestar, no del sistema de gestión. El SIG necesita **identificar, contactar, asignar tareas y controlar accesos**; no necesita saber la EPS de nadie. Traerlos convertiría la aplicación en un sistema de nómina y multiplicaría por diez la superficie de datos personales que hay que proteger, justificar y retener.

> Si Talento Humano los necesita en un solo lugar, la respuesta correcta es que ese lugar sea su propio sistema y que el SIG referencie a la persona, no que el SIG los copie.

### 2.3 `ActaBorradoSeguro` — FOR-SIG-18

| Campo | Tipo |
|---|---|
| `personaId` | → `Persona` |
| `fecha` | `Date` |
| `activos` | N:M → `Activo` — qué equipos y medios se borraron |
| `metodo` | catálogo — el medio que impide la reconstrucción |
| `ejecutadoPorId` | → `Persona` |
| `evidencia` | → `Evidencia` |

Es el ítem 62 del catálogo de PTR-TEC-03 y el cierre del control A.8.10. Sin acta, la desvinculación no está completa aunque la persona ya no tenga cuenta.

---

## 3. Los dos ciclos, que hoy nadie dibuja completos

### 3.1 Vinculación — PRO-TAL-01

El procedimiento es tajante: **«Ningún acceso se habilita antes de que estas obligaciones estén suscritas»** — acuerdo de confidencialidad, autorización de tratamiento de datos personales, y aceptación de las políticas del SGSI, del uso aceptable y de los lineamientos del puesto remoto.

| Paso | Dónde vive |
|---|---|
| Verificación de antecedentes | `Persona` · marca con fecha |
| Suscripción de los tres compromisos | Contenidos de tipo lectura con acuse, módulo A |
| Verificación del equipo: cifrado de disco, bloqueo automático, antimalware | Gestión Tecnológica · Equipos de colaboradores |
| Inducción de seguridad | Contenido de capacitación, módulo A |
| Alta de accesos | `Solicitud` tipo `ACCESO` → `AccesoPersona`, REQ-SIG-07 |

**Regla que hay que escribir:** la verificación de antecedentes **se repite** cuando alguien es promovido a un cargo con acceso a información Confidencial o con privilegios de administración. Es un deber por evento, no periódico.

### 3.2 Desvinculación — PRO-TAL-03

| Paso | Dónde vive |
|---|---|
| **Revocación de accesos el mismo día** | Cierre de `AccesoPersona.hasta`, REQ-SIG-07 |
| Paz y salvo FOR-TAL-03 | `Persona` · marca |
| Entrega de activos | `Solicitud` tipo `DEVOLUCION`, REQ-SIG-07 |
| Acta de borrado seguro FOR-SIG-18 | `ActaBorradoSeguro` |
| Obligaciones subsistentes | Confidencialidad por cinco años; **indefinida** para secretos empresariales y código fuente |

Dos cosas del procedimiento que la aplicación tiene que respetar y que es fácil implementar al revés:

- La revocación **no espera** a la liquidación ni al paz y salvo. Si la pantalla encadena los pasos, la está contradiciendo.
- **El mismo tratamiento aplica al cambio de cargo** que deja sin sustento los accesos vigentes. Eso conecta directo con el «acceso sin sustento» que la pantalla de Accesos de REQ-SIG-07 ya marca en rojo: la mayoría de esos casos nacen de un cambio de cargo que nadie tramitó.

---

## 4. La pantalla

Una lista única con filtro de activos / inactivos / todos, y ficha por persona con cuatro bloques: identidad y contrato, contacto, ciclo de vinculación con sus marcas, y ciclo de desvinculación cuando aplique.

Lo que la lista tiene que dejar ver de un golpe, porque es lo que hoy no se ve:

- **Quién no tiene cuenta del Directorio** (`origen = MANUAL`), porque no puede recibir asignaciones.
- **Quién tiene accesos vigentes estando inactivo** — el cruce con `AccesoPersona` de REQ-SIG-07.
- **Quién salió sin acta de borrado seguro.**
- **Quién no tiene los tres compromisos suscritos** y sin embargo ya tiene accesos.

---

## 5. Decisiones pendientes

1. **Los 32 contratistas: ¿tienen cuenta del Directorio Activo?** De la respuesta depende si el motor de tareas puede alcanzarlos o si hay que darles una vía de acceso distinta. Es la decisión que más condiciona el diseño.
2. **Quién administra este listado.** El Excel lo mantiene Talento Humano; la aplicación lo sincroniza del Directorio. Hay que decidir quién manda cuando difieren.
3. **Retención.** Cuánto tiempo se conservan los datos de una persona inactiva, y qué se borra al cumplirse. MAT-SIG-04 Matriz de Retención Documental debería decirlo.
4. **Contratistas y acuerdos de confidencialidad.** Los acuerdos de `06. GESTION LEGAL Y COMPRAS` están por archivo suelto, con una sola convención de nombre. Si se quiere que la aplicación muestre «esta persona tiene acuerdo firmado», hay que decidir si se referencia el archivo o se registra la marca.
