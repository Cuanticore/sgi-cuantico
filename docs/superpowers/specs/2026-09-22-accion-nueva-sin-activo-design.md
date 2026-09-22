# Una acción del plan que no nace de un activo — Especificación y diseño

**Fecha:** 2026-09-22
**Código:** PLA-SIG-02 · pantalla «Planes de tratamiento»
**Versión:** 1.0
**Módulo:** SGSI — Tratamiento del riesgo
**Afecta:** `app/components/sgsi/planes/PlanesTratamiento.tsx`, `app/components/sgsi/planes/PopupAccion.tsx`, `app/components/sgsi/planes/CamposAccion.tsx` (nuevo), `app/components/sgsi/planes/PopupAccionNueva.tsx` (nuevo), `app/sgsi/acciones/plan.ts`
**Depende de:** `2026-09-22-plan-tratamiento-formulario-design.md` — el formulario que este popup reusa
**Estado:** Diseñado, sin implementar

---

## 1. Qué se pide y por qué

«Adquirir una póliza de ciberriesgo» es una decisión de tratamiento legítima y **hoy no hay forma
de registrarla desde la aplicación**. Los tres caminos que crean un `PT-0NN` nacen todos colgados
de algo:

| Camino | Nace de | Dónde |
|---|---|---|
| `crearAccionDesdeControl` | un control con brecha de madurez | `/sgsi/controles` |
| `crearAccionDesdeRiesgo` | un riesgo residual de un activo | popup de residual |
| `registrarPlanesActivo` | las amenazas de un activo, en lote | grilla de Análisis |

Una póliza no cuelga de ninguno de los tres. Tampoco «formalizar el comité de seguridad», ni
«contratar la auditoría externa»: decisiones que el SGSI toma sin que las dispare un activo
concreto. La única vía hoy es importar un FOR-SIG-13 o escribir en la base.

---

## 2. Lo que el sistema ya permite

Verificado sobre el código y el esquema antes de diseñar. **El modelo no es el obstáculo.**

- `AccionPlan` **no tiene columna de activo ni de riesgo**. Un plan sin activo ya es
  representable; siempre lo fue.
- `controlId` es opcional en el esquema. Lo que exige control es una **regla de negocio** en
  `guardarAccion`: sólo `tipo === 'MITIGAR'`.
- `origen` es texto libre. `parsearOrigen` (`lib/sgsi/origen-plan.ts`) devuelve `null` para un
  origen sin prefijo de máquina, y eso **ya está documentado como el caso normal**, no como dato
  corrupto: es lo que produce hoy `crearAccionDesdeControl`.

**No hay migración y no hay regla nueva.** Falta la pantalla.

---

## 3. Decisión: se respeta la regla de control que ya existe

Se descartó relajar la exigencia para `MITIGAR` (habría que tocar la validación del servidor y la
del popup de edición) y se descartó obligar a que todo plan lleve control (fuerza una asociación
que a veces no existe: una póliza no sube la madurez de ningún control del anexo A).

Queda como está: **`MITIGAR` exige control; `TRANSFERIR`, `ACEPTAR` y `EVITAR` no.** «Adquirir
póliza cyber» entra como `TRANSFERIR`, con instrumento y riesgo remanente, y sin control.

### 3.1 La consecuencia que eso tiene, y que hay que decir

Cuatro de las once columnas de la grilla salen del control —Control, Madurez → objetivo, Salto,
Qué mitiga— y **dos de los seis KPI también**:

```ts
// PlanesTratamiento.tsx:215-218
const saltoPendiente = vigentes.reduce((suma, a) => {
  if (!a.control) return suma;            // ← una póliza aporta 0
  return suma + Math.max(0, (a.control.objetivo ?? 0) - (a.control.actual ?? 0));
}, 0);
```

Una acción sin control aporta **0** al salto pendiente y **0** a los riesgos alcanzados. Eso es
correcto —una póliza efectivamente no mueve la madurez de ningún control— pero la cifra se lee
como si cubriera todas las acciones del plan, y a partir de este cambio ya no.

Es la misma forma del defecto que el acta de riesgo residual tuvo el 21/09: un denominador que
sólo contaba los casos resolubles mostraba «0 / 0», y «0 / 0» se lee como «no queda nada por
hacer». **Una cifra que se calcula sobre un subconjunto tiene que decir sobre cuál.**

---

## 4. El diseño

### 4.1 El botón

En la cabecera de `/sgsi/planes`, a la izquierda de «Importar FOR-SIG-13» y con el acento verde:
es la acción principal de la pantalla y hoy la única que hay allí es cargar un archivo.

Se llama **«Acción nueva»**, no «Plan nuevo», porque es el vocabulario de la propia pantalla —el
subtítulo dice «una fila por acción, no por riesgo»— y llamar «plan» a una fila cuando la pantalla
entera se llama «Planes de tratamiento» confunde la unidad.

### 4.2 Los campos salen a un componente propio

`CamposAccion.tsx` — los campos del formulario, sin carcasa, sin pie de botones y sin decidir qué
se hace con ellos. Lo usan los dos popups:

| | Edición (`PopupAccion`) | Creación (`PopupAccionNueva`) |
|---|---|---|
| Acción, Tipo, Control, Origen, Responsable, Aprueba, Fecha objetivo, Recursos, Observaciones | sí | sí |
| Estado, Avance, Verificación, Madurez alcanzada | sí | **no** |
| Bloques de Transferir / Aceptar | sí | sí |
| Pie «dar de baja» | sí | no |

Esto es lo que el spec del formulario dejó prometido en su §4.4: que el orden de los campos y el
tamaño de Observaciones se decidan **una vez**. Dos formularios que describen la misma entidad y
se mantienen por separado es exactamente cómo divergen.

### 4.3 Por qué la creación no ofrece los campos de seguimiento

Una acción recién creada es `NO_INICIADA`, avance `0` y verificación `PENDIENTE` **por
definición**. Ofrecer esos cuatro campos en la creación invita a registrar una acción que nace
cerrada, y el propio guardado la rechazaría: `guardarAccion` impide cerrar con la verificación
pendiente.

**Limitación conocida, y aceptada:** registrar una póliza **ya comprada** obliga a dos pasos —
crearla y luego abrirla y cerrarla—. Es el precio de no tener cuatro campos que en el 95 % de los
casos se dejan como vienen.

### 4.4 La acción de servidor

`crearAccionLibre(datos: DatosAccion, ...)` en `app/sgsi/acciones/plan.ts`:

- **Las mismas validaciones que `guardarAccion`.** No se copian: se extraen a una función que
  las dos invocan. Copiarlas deja dos piezas comprobando lo mismo desde orígenes distintos, que es
  el defecto que este repo ya pagó tres veces.
- **La misma generación de código** que los otros dos caminos: `PT-0NN` calculado **dentro de la
  transacción**, sin reutilizar números de acciones dadas de baja.
- **`origen` es lo que escriba la persona**, sin prefijo de máquina. Es obligatorio — lo exige
  ISO/IEC 27001 6.1.3 y ya lo exige el formulario.
- **Bitácora**: `registrarAlta` más un asiento de `origen`, igual que `crearAccionDesdeRiesgo`.
- Defaults fijos: `estado: 'NO_INICIADA'`, `avance: 0`, `verificacion: 'PENDIENTE'`.

### 4.5 Los KPI dicen su denominador

Las tarjetas ya aceptan un `pie` (`PlanesTratamiento.tsx:345-349`), así que esto es texto, no
estructura:

| KPI | Pie hoy | Pie nuevo |
|---|---|---|
| Salto pendiente | `Σ máx(0, objetivo − actual)` | `Σ máx(0, objetivo − actual) · sobre 19 de 20 acciones` |
| Riesgos alcanzados | `sobre el inventario real` | `sobre el inventario real · 19 de 20 acciones` |

El denominador aparece **sólo cuando los dos números difieren**. Mientras todas las acciones
tengan control, decir «sobre 19 de 19» es ruido.

---

## 5. Lo que NO entra

- **No hay migración**, y no se agrega ninguna columna.
- **No se relaja ninguna validación.** `MITIGAR` sigue exigiendo control.
- **La acción nueva no se vincula a activos ni a riesgos.** Si alguien quiere eso, el camino es
  el popup de la grilla de Análisis, que ya existe y escribe el prefijo verificable en `origen`.
- **No se toca el tablero Gantt** ni el filtro de la cabecera.
- **No se toca la importación de FOR-SIG-13.**

---

## 6. Pruebas · Regla 1 del harness

| # | Qué prueba | Por qué falla hoy |
|---|---|---|
| P1 | `crearAccionLibre` crea con el siguiente `PT-0NN` y no reutiliza el de una acción dada de baja | La acción no existe |
| P2 | `crearAccionLibre` con `MITIGAR` y sin control **se rechaza**, con el mismo mensaje que `guardarAccion` | No existe |
| P3 | `crearAccionLibre` con `TRANSFERIR`, sin control y con instrumento y remanente, **se acepta** | No existe. Es el caso «póliza cyber» |
| P4 | `crearAccionLibre` sin `origen` se rechaza | No existe |
| P5 | La acción nace `NO_INICIADA`, avance `0`, verificación `PENDIENTE` aunque los datos digan otra cosa | No existe |
| P6 | `crearAccionLibre` deja asiento de alta en la bitácora | No existe |
| P7 | El pie del KPI dice «19 de 20» cuando una acción no tiene control | Hoy el pie es fijo |
| P8 | El pie **no** dice el denominador cuando todas tienen control | Hoy el pie es fijo |
| P9 | `PopupAccionNueva` no renderiza Estado, Avance, Verificación ni Madurez alcanzada | El componente no existe |
| P10 | `PopupAccion` (edición) **sí** los renderiza — la extracción a `CamposAccion` no se llevó nada por delante | Es la invariante de la refactorización |

P3 es la prueba del pedido. P10 es la que vigila que extraer los campos no rompa el popup que ya
funciona.

---

## 7. Recorrido de punta a punta · Regla 3

Aplica: es una pantalla que una persona opera, y un flujo de varios pasos donde la salida de uno
alimenta al siguiente.

```
Recorrido a ejecutar:
  1. Abrir /sgsi/planes                          -> 19 acciones, botón «Acción nueva»
  2. Clic en «Acción nueva»                      -> el popup abre vacío, tipo «Mitigar»
  3. Intentar guardar sin nada                   -> el botón apagado dice qué falta
  4. Escribir la acción y el origen, tipo Mitigar-> sigue pidiendo control asociado
  5. Cambiar el tipo a «Transferir»              -> desaparece la exigencia de control,
                                                    aparecen instrumento y remanente
  6. Llenar «Póliza de ciberriesgo» y el remanente-> el botón se enciende
  7. Guardar                                     -> «PT-026 creada», el popup cierra
  8. La grilla                                   -> 20 acciones; PT-026 dice «sin control»
                                                    y las tres columnas del control, vacías
  9. Los KPI                                     -> «Acciones en el plan 20»,
                                                    «Salto pendiente 600 · sobre 19 de 20»
 10. Abrir PT-026 con el lápiz                   -> el popup de edición la muestra completa,
                                                    con Estado y Avance
 11. Abrir PT-013 con el lápiz                   -> sigue viéndose igual que antes
```

El paso 11 es el que confirma que extraer `CamposAccion` no cambió el popup que ya estaba.
El paso 5 es el que prueba que la regla de control se aplica en la pantalla y no sólo al guardar.

---

## 8. Riesgos

**La extracción de `CamposAccion` es la parte peligrosa, no la funcionalidad nueva.** Mover trece
campos de un archivo a otro es donde se pierde un `onChange` sin que ninguna prueba lo note.
P10 y el paso 11 del recorrido existen por eso. Conviene hacer la extracción **en un commit
propio**, sin funcionalidad nueva encima, para que sea revertible sola.

**Este spec depende del formulario.** `CamposAccion` se extrae con la disposición nueva (1040 px,
cinco columnas, Observaciones alto), así que el formulario se implementa primero. Hacerlo al revés
significa extraer la disposición vieja y reacomodarla después, en el archivo recién creado.

**Una acción sin control desaparece de media pantalla.** La grilla la muestra con cuatro columnas
vacías, el tablero Gantt la dibuja sin control, y el informe de valoración no la conoce. Nada de
eso es incorrecto, pero si con el tiempo hay muchas acciones libres, la pantalla va a necesitar
una forma de verlas juntas. **No se diseña ahora**: hoy habría una.
