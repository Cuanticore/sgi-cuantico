# Leer, aceptar y firmar

**Fecha:** 02/09/2026 · **Extiende:** REQ-SIG-02 · **Plantilla:** [Acta de aceptacion y firma - base.docx](plantillas/Acta%20de%20aceptacion%20y%20firma%20-%20base.docx)

Un solo mecanismo para todo lo que en el sistema documental dice «firmará»: acuerdos de confidencialidad, autorización de tratamiento de datos personales, aceptación de las políticas del SGSI, lineamientos del puesto de trabajo remoto, actas de compromiso y la autoevaluación del puesto (FOR-SIG-13).

Tres pasos, un registro, un PDF.

---

## 1. El flujo

**Leer.** Se muestra el documento en la aplicación. El botón de aceptar permanece deshabilitado hasta que la persona lo abre. No se pide que lea completo —eso no se puede comprobar y fingirlo enseña a mentirle al sistema— pero sí que el documento haya estado delante.

**Aceptar.** Una casilla explícita con el texto de la declaración a la vista, no un enlace a ella. Quien acepta lee lo que está aceptando en la misma pantalla.

**Firmar.** La persona confirma con su nombre completo y su documento de identidad. La identidad no la aporta ese tecleo: la aporta la sesión autenticada con la cuenta corporativa. El tecleo es el acto deliberado que distingue firmar de hacer clic.

Al confirmar se genera el acta y su PDF, en la misma transacción que cierra la asignación.

---

## 2. Modelo

### 2.1 Lo que se agrega a `ContenidoSig`

| Campo | Tipo | Nota |
|---|---|---|
| `exigeFirma` | `Boolean @default(false)` | Cualquier tipo de contenido puede exigirla, no solo las lecturas |
| `declaracion` | `String?` | El texto que la persona acepta. Obligatorio cuando `exigeFirma` |

**No es un tipo nuevo de contenido.** Una capacitación puede exigir firma, una lista de verificación también. Hacerlo un tipo obligaría a duplicar cada contenido que además necesite firmarse.

### 2.2 `ActaAceptacion`

| Campo | Tipo |
|---|---|
| `codigo` | `String @unique` — `ACT-2026-0001`, inmutable |
| `personaId` | → `Persona` |
| `contenidoId` | → `ContenidoSig` |
| `contenidoVersion` | `Int` — **congelada** |
| `registroId` | → `RegistroRealizado`, `@unique` |
| `declaracion` | `String` — **el texto exacto aceptado, copiado, no referenciado** |
| `documentoHash` | `String` — SHA-256 del archivo mostrado |
| `nombreFirmante`, `documentoFirmante` | `String` — lo tecleado |
| `aceptadoEn` | `DateTime` con zona |
| `ip`, `agente`, `sesionId` | `String` |
| `pdfId` | → `Evidencia` |
| `actaHash` | `String` — SHA-256 del PDF generado |

---

## 3. Reglas

**F1 · Sin lectura no hay firma.** El botón de aceptar se habilita solo después de abrir el documento.

**F2 · La declaración se copia, no se referencia.** El acta guarda el texto literal. Si mañana se cambia la redacción para las firmas futuras, esta acta conserva la suya. Referenciarla convertiría cada edición en una falsificación retroactiva de lo que la gente aceptó.

**F3 · La huella del archivo se guarda.** Sin ella, «acepté la versión 2» no prueba nada si el archivo de la versión 2 cambió después. Con ella, el acta identifica el texto exacto.

**F4 · El acta es inmutable.** No se corrige ni se reemplaza. Si el documento cambia y hay que volver a firmar, nace una nueva y la anterior se conserva.

**F5 · El PDF se genera al aceptar, no al consultar.** Un PDF que se arma cada vez que alguien lo abre puede salir distinto mañana. Se genera una vez, se guarda como `Evidencia` y se le calcula la huella.

**F6 · Es firma electrónica simple, y se dice así.** No hay certificado digital ni entidad de certificación. La confiabilidad viene del control de acceso a la cuenta corporativa, de la trazabilidad del numeral 4 del acta y de la inalterabilidad del registro. El documento base lo declara en esos términos, sin prometer más de lo que es.

**F7 · Todo en una transacción.** Acta, PDF, registro de realizado, cierre de la asignación y bitácora. Un acta sin su registro, o un registro sin su acta, es peor que no tener ninguno de los dos.

---

## 4. El documento base

`plantillas/Acta de aceptacion y firma - base.docx`, con cinco numerales:

1. **Identificación de quien firma** — nombre, documento, cargo, proceso, correo, tipo de vinculación.
2. **Documento aceptado** — código, nombre, versión leída, huella SHA-256, ubicación.
3. **Declaración aceptada** — el marco `{{declaracion}}` más el texto por defecto, que es el que vas a querer redactar.
4. **Constancia de la aceptación** — fecha y hora con zona, IP, navegador, sesión y asignación asociada.
5. **Firma electrónica** — la nota de alcance y el cuadro de dos columnas: la firma de quien acepta y la constancia del sistema con la huella del acta.

Los campos van entre llaves dobles (`{{firmante_nombre}}`) y los reemplaza la aplicación al generar. **Editar el documento no requiere tocar código** mientras se conserven los nombres de los campos: es una plantilla, no una vista.

---

## 5. Dónde se usa

| Qué se firma | Cuándo | Fuente |
|---|---|---|
| Acuerdo de confidencialidad | Antes de otorgar cualquier acceso | PRO-TAL-01 |
| Autorización de tratamiento de datos personales | Antes de otorgar cualquier acceso | PRO-TAL-01 |
| Aceptación de las políticas del SGSI y del uso aceptable | Antes de otorgar cualquier acceso | PRO-TAL-01 |
| Lineamientos del puesto de trabajo remoto | Antes de habilitar el acceso | PRO-TAL-01 · PTR-TEC-02 |
| Autoevaluación del puesto de trabajo | Al vincularse y anualmente | POL-TAL-01 · FOR-SIG-13 |
| Acta de compromiso | Vinculación | FOR-TAL-01 |
| Lecturas de política con acuse | Según la obligación | POL-SIG-02 |

Los cuatro primeros son la condición que PRO-TAL-01 pone con todas las letras: **«Ningún acceso se habilita antes de que estas obligaciones estén suscritas»**. Con este mecanismo, esa frase deja de ser una intención y pasa a ser comprobable: la pantalla de altas de acceso puede mostrar cuáles faltan.

---

## 6. Dónde se ven las actas

En dos lugares, con dos públicos distintos:

- **Mi SIG · Mi historial.** Cada persona ve sus propias actas, junto a sus capacitaciones, lecturas, verificaciones y tareas, con enlace al PDF. Es la respuesta a «¿qué firmé y cuándo?».
- **Registros.** El punto central de evidencia. Un líder de proceso ve los registros de su módulo; el **Líder del SIG los ve todos**. Se filtra por numeral de la norma —`A.6.6` acuerdos de confidencialidad, `7.2` competencia, `A.8.10` borrado— y se exporta el paquete con los soportes enlazados.

**`Registros` no es una tabla nueva.** Cada fila vive en su módulo: el acta en Mi SIG, la ejecución en Operación del SGSI, la puerta de control en el sistema, el hallazgo en Mejora. Copiarlas a un registro central crearía una segunda verdad que se desincroniza el primer día. Es una vista con una proyección común: **qué pasó, quién, cuándo, contra qué requisito, y dónde está el soporte**.

Lo que convierte esa pantalla en herramienta de auditoría y no en bitácora es el filtro por requisito. La pregunta de un auditor nunca es «qué pasó en agosto»: es «muéstreme la evidencia del 7.2».

---

## 7. Lo que queda por decidir

1. **El texto de la declaración por defecto.** El del documento base es una propuesta; hay que revisarlo con Legal antes de usarlo.
2. **Si el documento de identidad se teclea o se muestra.** Tecleado es un acto deliberado; mostrado desde el perfil es más cómodo y menos probatorio. La plantilla soporta las dos.
3. **Retención de las actas.** MAT-SIG-04 debería decirlo. Las de confidencialidad conviene conservarlas al menos lo que dure la obligación: cinco años después de terminada la relación, indefinido para secretos empresariales y código fuente.
