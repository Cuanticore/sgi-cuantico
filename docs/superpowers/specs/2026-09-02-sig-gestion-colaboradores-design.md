# REQ-SIG-09 · Gestión de Colaboradores

**Fecha:** 02/09/2026 · **Versión:** 1.0 · **Estado:** especificado, sin implementar
**Superficie:** sección «Colaboradores» · **Extiende:** `Persona` de REQ-SIG-02
**Diseño:** `docs/handoff_colaboradores/design/` — cinco artboards
**Análisis de origen:** [directorio-de-colaboradores.md](../../handoff_a/directorio-de-colaboradores.md) · [lectura-aceptacion-firma.md](../../handoff_a/lectura-aceptacion-firma.md)
**Fuentes documentales:** PRO-TAL-01, PRO-TAL-03, PRO-TAL-04, POL-TAL-01 y el Excel maestro de Talento Humano.

---

## 1. La decisión que define el módulo

**Nómina y contratistas van en una sola tabla, con un solo proceso.**

El argumento es empírico: de las 38 personas activas, **solo 6 son de nómina**. Los otros 32 son contratistas, y PRO-TAL-04 les exige capacitación cuando la naturaleza del servicio lo requiera o cuando hayan tenido más de un contrato. Un diseño que trate al contratista como caso aparte deja fuera del control a la mayoría de la organización.

Y es correcto además por el fondo: **la seguridad de la información no distingue el tipo de contrato.** Un contratista firma el mismo acuerdo de confidencialidad, recibe la misma inducción, se le verifica el mismo equipo, se le revocan los accesos el mismo día y se le levanta la misma acta de borrado seguro.

Lo que sí cambia son las **afiliaciones** y la **liquidación**: cinco casillas. Separar los dos grupos duplicaría el proceso entero para ahorrarse esas cinco.

---

## 2. Alcance

### 2.1 Dentro

- Listado único de colaboradores, activos e inactivos, sincronizado del Directorio Activo.
- Ficha por persona: identidad, vinculación, contacto, accesos vigentes, activos a cargo, formación y actas firmadas.
- Ciclo de **vinculación** con sus siete pasos de seguridad y los administrativos según el tipo.
- Ciclo de **desvinculación** con la revocación inmediata, la devolución de activos y el acta de borrado seguro.
- **`ActaBorradoSeguro`** (FOR-SIG-18).

### 2.2 Fuera

- **Nómina, seguridad social y bienestar.** EPS, pensión, ARL, caja, cesantías, hijos, edad y fecha de cumpleaños **no entran**. Son datos de nómina; el SIG necesita identificar, contactar, asignar tareas y controlar accesos. Traerlos convertiría la aplicación en un sistema de nómina y multiplicaría la superficie de datos personales que hay que proteger, justificar y retener.
- **La creación y revocación de cuentas en Azure AD.** El módulo registra y exige; no administra el directorio.
- **El mecanismo de firma**, que es de REQ-SIG-02 y se documenta aparte.

---

## 3. Modelo

### 3.1 Lo que gana `Persona`

| Campo | Tipo | Nota |
|---|---|---|
| `origen` | `enum` — `DIRECTORIO` · `MANUAL` | `MANUAL` es excepción transitoria y **se muestra como anomalía** |
| `documentoIdentidad` | `String?` | |
| `tipoContratoId` | → catálogo cerrado | Cuatro valores. En el Excel de origen hay siete, con «Prestación de Servicios» escrito de tres formas |
| `tipoColaboradorId` | → catálogo | `BASE` · `RECURRENTE` · `TEMPORAL`. **Sin `inactivo`**: el estado no es un tipo |
| `fechaIngreso`, `fechaInicioContrato`, `fechaTerminacion` | `Date?` | |
| `proyectoId` | → `Proyecto` | Hoy es texto libre |
| `telefono`, `correoPersonal`, `ciudad`, `direccion` | `String?` | |
| `verificacionAntecedentesEn` | `Date?` | |
| `retiradoEn` | `DateTime?` | |

**No hay columna `estado`.** Activo o inactivo se calcula de `retiradoEn`. Una sola tabla y un filtro: nadie corta y pega entre pestañas, y **el tipo de contrato sobrevive al retiro**, que es lo que hoy se pierde.

### 3.2 `ActaBorradoSeguro` — FOR-SIG-18

`personaId`, `fecha`, `activos` (N:M → `Activo`), `metodo` (catálogo), `ejecutadoPorId`, `evidenciaId`.

Cierra el control A.8.10 y el ítem 62 del catálogo PTR-TEC-03. Sin acta, la desvinculación no está completa aunque la persona ya no tenga cuenta.

### 3.3 Lo que se reutiliza y no se duplica

| Concepto | Dónde vive |
|---|---|
| Compromisos firmados | `ActaAceptacion` de REQ-SIG-02 |
| Accesos con vigencia | `AccesoPersona` de REQ-SIG-07 |
| Devolución de activos | `Solicitud` tipo `DEVOLUCION` de REQ-SIG-07 |
| Alta de accesos | `Solicitud` tipo `ACCESO` de REQ-SIG-07 |
| Inducción y capacitación | `ContenidoSig` + `Asignacion` de REQ-SIG-02 |
| Equipo asignado y su verificación | `Activo` con `personaId`, REQ-SIG-06 |

---

## 4. Reglas

**C1 · Todo colaborador activo tiene cuenta del Directorio.** Un activo con `origen = MANUAL` es una anomalía de la vinculación, no una categoría válida, y la lista lo muestra en rojo.

**C2 · La cuenta se crea sin acceso a ningún sistema.** Solo entra a Mi SIG, con el piso `misig:ver` que ya existe. Resuelve la contradicción entre «ningún acceso antes de firmar» y «hay que autenticarse para firmar»: una cuenta que solo permite firmar no es acceso a la información.

**C3 · Ningún acceso se habilita antes de suscribir los cuatro compromisos.** PRO-TAL-01, literal. La pantalla de vinculación lo muestra como una puerta cerrada con el conteo a la vista.

**C4 · La revocación de accesos se ejecuta el mismo día de la terminación**, sin esperar a la liquidación ni al paz y salvo. **Ningún paso de la desvinculación depende de otro:** si la pantalla los encadena, contradice el procedimiento.

**C5 · El mismo trámite aplica al cambio de cargo** que deja accesos sin sustento. Es el origen más común de los «accesos sin sustento» que marca REQ-SIG-07.

**C6 · La verificación de antecedentes se repite** al promover a alguien a un cargo con acceso a información Confidencial o con privilegios de administración. Deber por evento, no periódico.

**C7 · El registro de una persona inactiva no se borra.** Las obligaciones subsistentes duran cinco años, e indefinidamente para secretos empresariales y código fuente.

**C8 · El tipo de contrato es un catálogo cerrado.** El texto libre produjo siete valores para cuatro conceptos, uno con error de digitación.

---

## 5. Pantallas

| Pantalla | Contenido |
|---|---|
| **Colaboradores** | Lista única con filtros activos / inactivos / **con anomalía**. Columnas: persona, vinculación, proyecto, cuenta, compromisos, accesos. Panel lateral con las cuatro anomalías y la composición real |
| **Ficha del colaborador** | Identidad y vinculación, accesos vigentes con su sustento, activos a cargo, compromisos firmados con enlace al acta, formación y competencia, últimos registros |
| **Vinculación** | Los siete pasos de seguridad —idénticos para todos— y los administrativos según el tipo, con la puerta de accesos a la derecha |
| **Desvinculación** | El trámite con sus plazos, los accesos vigentes en rojo mientras no se revoquen, y las obligaciones subsistentes |
| **Leer, aceptar y firmar** | El mecanismo de REQ-SIG-02, incluido acá porque es donde más se usa |

### 5.1 Las cuatro anomalías que la lista responde sola

Todas son cruces entre listas que hoy viven separadas, y ninguna requiere que alguien se acuerde de mirar:

1. Personas **activas sin cuenta** del Directorio — no pueden recibir asignaciones ni firmar.
2. Personas **inactivas con accesos vigentes** — el «acceso sin sustento» de REQ-SIG-07.
3. Quienes **salieron sin acta de borrado seguro**.
4. Quienes **tienen accesos sin haber firmado los cuatro compromisos**.

---

## 6. Roles

| Acción | Quién |
|---|---|
| Ver la lista y las fichas | `Líderes SIG` |
| Ver su propia ficha | La persona, desde Mi SIG |
| Ejecutar vinculación y desvinculación | Talento Humano · Líder Administrativo |
| Verificar el equipo | Gestión Tecnológica |
| Levantar el acta de borrado seguro | Gestión Tecnológica |
| Firmar | Cada persona, y nadie por ella |

---

## 7. Criterios de aceptación

1. Retirar a una persona no la mueve de tabla y **conserva su tipo de contrato**.
2. Consultar la lista al 31/12/2025 muestra a quien estaba activo ese día.
3. Una persona activa sin cuenta del Directorio aparece marcada y contable.
4. La puerta de accesos permanece cerrada mientras falte cualquiera de los cuatro compromisos.
5. Cambiar el tipo de vinculación en la pantalla de vinculación **no cambia ninguno de los siete pasos de seguridad**.
6. La revocación de accesos se puede ejecutar sin que exista paz y salvo.
7. Un acta de borrado seguro sin activos asociados no se guarda.
8. Las obligaciones subsistentes siguen visibles en la ficha de una persona inactiva.

---

## 8. Lo que queda por decidir

1. **Quién manda cuando el Directorio y Talento Humano difieren.** Hoy el Excel lo mantiene Talento Humano y la aplicación sincroniza del Directorio.
2. **Retención de los datos de una persona inactiva.** MAT-SIG-04 debería fijarlo; las obligaciones subsistentes sugieren cinco años como piso.
3. **Los acuerdos de confidencialidad ya firmados en papel**, que están como archivos sueltos en `06. GESTION LEGAL Y COMPRAS`. Hay que decidir si se referencian o si solo se registra la marca de que existen.
4. **`Proyecto`** todavía no existe como entidad (ver D1 y D2 del registro de decisiones).
