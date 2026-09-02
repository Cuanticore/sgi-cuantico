# FOR-TEC-04 y la hoja de vida del sistema

**Fecha:** 02/09/2026 · **Fuente:** `14. Seguridad de la Informacion\7. Desarrollo Seguro` — FOR-TEC-04 (12 hojas), PRO-TEC-04 (procedimiento), PTR-TEC-03 (guía de 73 ítems) y FOR-LCO-05 (anexo contractual).

---

## 1. Lo que hay

FOR-TEC-04 no es un formato: es un módulo. Doce hojas, nueve de ellas de detalle, todas enlazadas a la hoja maestra `Sistemas` por un ID inmutable con formato `SIS-001` que **no cambia ni cuando el sistema se renombra**.

| Hoja | Qué registra |
|---|---|
| `Sistemas` | Identidad: tipo, cliente o proceso al que sirve, proyecto asociado, criticidad, clasificación, si trata datos personales, rol en el tratamiento, **RTO y RPO objetivo**, propietario |
| `Puertas de control` | Resultado de P1 a P6: superada / superada con excepción / no superada, fecha, quién verificó, quién autoriza, evidencia, excepción asociada |
| `Requisitos de seguridad` | `REQ-001` por categoría, con origen, prioridad, estado y en qué prueba se verificó |
| `Riesgos` | `RSG-001` con probabilidad 1-5, impacto 1-5, nivel, tratamiento y control del Anexo A |
| `Pruebas de seguridad` | `PRB-003` con tipo, versión probada, conteo por severidad y si bloquea la liberación |
| `Despliegues y cambios` | Versión, tipo de liberación, solicitud de cambio, quién autoriza, si hay plan de reversión, resultado |
| `Datos personales` | Categoría, sensibles, finalidad, base de legitimación, titulares, volumen, ubicación, **transferencia internacional y país**, garantía, retención |
| `Proveedores y componentes` | Proveedor o componente, función, criticidad, contrato, última evaluación, vulnerabilidades conocidas |
| `Catálogo verificación` | Los **73 ítems** de PTR-TEC-03, de solo consulta, cada uno con puerta, evidencia esperada, aplicabilidad y control del Anexo A |
| `Verificación` | El resultado por ítem y por sistema |

Y PRO-TEC-04 le pone el ciclo alrededor: ocho fases **F0 a F7** acopladas a las fases de proyecto de PRO-PRO-01 y PRO-PRO-02, con seis puertas. Una puerta no superada **impide avanzar de fase**, y la única alternativa es una excepción aprobada por el Responsable de Seguridad de la Información. *Un sistema sin hoja de vida abierta no puede desplegarse en los entornos productivos.*

---

## 2. Colisión con REQ-SIG-06

**El mismo objeto está especificado dos veces, y la versión del sistema documental es mucho mejor que la mía.**

| | REQ-SIG-06 §3.5 | FOR-TEC-04 + PRO-TEC-04 |
|---|---|---|
| Entidad | `Producto` / `VersionProducto` | `Sistema` (`SIS-001`) |
| Ciclo | `EtapaCicloVida`, siete etapas | Ocho fases F0–F7 y seis puertas P1–P6 |
| Verificación | No especificada | 73 ítems con evidencia esperada y control del Anexo A |
| Bloqueo | No especificado | La puerta no superada impide avanzar; excepción formal como única salida |
| Responsabilidades | No especificadas | Cinco roles con autoridad distinta por actividad |

**Propuesta: `Producto` de REQ-SIG-06 se retira y se reemplaza por el modelo de FOR-TEC-04.** El formato está aprobado, en uso, trazado a los controles del Anexo A, y su procedimiento define quién verifica y quién autoriza. Mi versión inventaba siete etapas sin respaldo documental.

Queda por confirmar contigo si **«producto» y «sistema de información» son lo mismo**. MINTRACE es un producto y también es un sistema; pero si un producto agrupa varios sistemas desplegables, entonces `Producto` sobrevive como el nivel 1 `PRODUCTOS` de la jerarquía y `Sistema` cuelga de él.

---

## 3. Entidades que el sistema documental exige y ninguna spec tiene

1. **`Sistema`** — con RTO y RPO, que además son el insumo del BIA anual de continuidad.
2. **`PuertaControl`** — el resultado por puerta, con verificador y autorizador distintos.
3. **`Excepcion`** (`EXC-2026-007`) — justificada, evaluada por riesgo, aprobada por el Responsable de SI y **con fecha de cierre**. Es la que permite avanzar sin cumplir, así que es la que más hay que controlar, y hoy no existe en ninguna parte.
4. **`RequisitoSeguridad`** (`REQ-001`).
5. **`PruebaSeguridad`** (`PRB-003`) — con conteo por severidad y la marca de si bloquea.
6. **`TratamientoDatosPersonales`** — Ley 1581 de 2012, con transferencia internacional y país de destino. Nada lo cubre, y es el que más exposición legal tiene.
7. **`Proyecto`** (`PRY-2026-014`) → FOR-PRO-01 Banco de proyectos. REQ-SIG-06 ya tiene `PROYECTOS` como valor de nivel 1 y ninguna spec define la entidad.

---

## 4. Cuatro duplicaciones que hay que resolver, no replicar

### 4.1 Una tercera metodología de riesgo

La hoja `Riesgos` valora probabilidad 1-5 × impacto 1-5 y asocia un control del Anexo A. Eso **no es** MAGERIT (la del SGSI, sobre activos, con dimensiones y escalas propias) ni la organizacional de ISO 31000. Serían tres escalas conviviendo.

**Decisión pendiente:** o el riesgo de un sistema es un `Riesgo` de MAGERIT sobre el activo que representa ese sistema —y la hoja desaparece—, o es una tabla propia y hay que decir explícitamente que no se suma ni se promedia con las otras dos. Igual que hicimos con la organizacional.

### 4.2 «Despliegue» significa dos cosas distintas

- `Despliegue` de REQ-SIG-06 = **dónde corre**: servidor, URL, contenedor, puerto.
- `Despliegues y cambios` de FOR-TEC-04 = **qué se liberó**: versión, tipo, solicitud de cambio, plan de reversión, resultado.

Mismo nombre, objetos distintos. Propuesta: REQ-SIG-06 conserva `Despliegue` y lo de FOR-TEC-04 entra como **`Liberacion`**.

### 4.3 Los 73 ítems son contenido del módulo A, no un motor nuevo

La hoja `Verificación` es exactamente lo que el módulo A ya hace: `ContenidoSig` + `ItemVerificacion` + `RegistroRealizado`. El catálogo de PTR-TEC-03 es **un contenido**; verificar una puerta de un sistema es **una asignación**. Construir un segundo motor de listas de verificación sería el error más caro de este paquete.

### 4.4 Proveedores por tercera vez

La hoja `Proveedores y componentes` es una tercera lista de proveedores, después de `Proveedor` y `ParteInteresada`. Con D4 ya fusionamos las dos primeras; esta hoja aporta dos cosas nuevas que sí valen: el **componente de terceros** (SBOM, con licencia y vulnerabilidades) y la **última evaluación**, que es la evidencia de la reevaluación anual de POL-TEC-02.

---

## 5. Obligaciones nuevas que salen del catálogo

De la fase Operación del catálogo de 73 ítems:

| Ítem | Obligación | Periodicidad | Alcance |
|---|---|---|---|
| 60 | **Prueba de penetración si el sistema está expuesto a Internet** | Al menos anual | Por sistema expuesto |
| 56 | Revisión de accesos al sistema y a su repositorio | La definida → **anual por D7** | Por sistema |
| 57 | Pruebas de restauración del respaldo del sistema | Enlaza con **D8, semestral** | Por sistema |
| 54-55 | Remediación de vulnerabilidades dentro de plazo | Continuo | Por vulnerabilidad |
| 59 | Revisión de requisitos cuando cambia funcionalidad, arquitectura o riesgos | Por evento | Por sistema |

El ítem 60 es el caso que justifica **D3** por sí solo: `Activo.expuestoInternet` ya existe en el esquema, así que una obligación con alcance por tipo de activo filtrada por esa bandera genera la tarea sola, para el sistema que sea, sin que nadie mantenga una lista.

Y FOR-LCO-05 fija los **plazos de remediación por severidad**: crítica **72 horas**, alta **15 días**, media **60 días**, baja **siguiente entrega planificada**. Es la misma forma que `PlazoPorTipoHallazgo`, que ya existe en el esquema — se parametriza, no se codifica.

---

## 6. Una no conformidad encontrada hoy, contra este mismo catálogo

> **Ítem 31 · puerta Construcción · control A.8.28**
> *«No hay credenciales, tokens, llaves ni cadenas de conexión en el código ni en los archivos versionados.»*
> Evidencia esperada: *«Resultado de la detección de secretos, sin hallazgos abiertos.»*

Hoy, al publicar la rama de especificación, la protección de push de GitHub bloqueó un **secreto de aplicación de Azure AD en texto plano** en dos documentos versionados del repositorio. Se limpió el historial y no llegó a ninguna rama remota, pero el ítem 31 **no se cumple**, y FOR-LCO-05 exige exactamente lo mismo a los contratistas.

En el mismo repositorio están, sin versionar pero en la carpeta de trabajo, `.env prod.env` con secretos de producción y una llave privada SSH `.ppk`. Ambos quedaron en `.gitignore` en su momento, lo que evita que se versionen pero no que estén ahí.

**Recomendación:** abrir el hallazgo. El ítem 30 pide además que *«la detección de secretos esté activa sobre el repositorio y su historial»* — la protección de push de GitHub cubre lo que entra, no lo que ya está, así que conviene una pasada sobre el historial completo antes de dar el ítem por cumplido.

---

## 7. Qué recomiendo hacer con esto

1. **Confirmar si producto = sistema de información.** De ahí sale si `Producto` sobrevive o se retira.
2. **Reemplazar REQ-SIG-06 §3.5** por el modelo de FOR-TEC-04, con puertas y excepciones.
3. **Decidir la tercera metodología de riesgo** (§4.1) antes de que se construya nada.
4. **Cargar los 73 ítems como contenido del módulo A**, no como motor nuevo.
5. **Rotar el secreto de Azure** y abrir el hallazgo del ítem 31.

Esto es material para una spec propia —REQ-SIG-07, Ciclo de Vida de Desarrollo Seguro— que es del mismo tamaño que Gestión Tecnológica. No la escribo sin que decidas lo primero.
