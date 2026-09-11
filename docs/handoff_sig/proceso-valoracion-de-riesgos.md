# Requerimiento · El proceso de valoración de riesgos, de punta a punta

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-20 · proceso de valoración de riesgos |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-11 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo (ejecución asistida con Claude Code) |
| **Toca** | `FichaActivo.tsx` · `InventarioActivos.tsx` · `lib/sgsi/riesgos.ts` · `AccionPlan` · sidebar · una ruta nueva y una migración |
| **Estado** | D-1 a D-6 abiertas · **D-3 y D-5 bloquean** (§15) |

---

## 1 · Objetivo

Nueve peticiones que comparten una sola idea: **la valoración de riesgos es un proceso y hoy la aplicación no lo muestra como tal.** Muestra pantallas —un inventario, unas matrices, unos planes— y deja que quien las usa reconstruya mentalmente en qué paso está, qué activo le falta y por qué un número dice lo que dice.

Este requerimiento convierte esas pantallas en un camino con principio y fin: **qué activos entran, qué amenazas los alcanzan, de dónde sale cada cifra, y qué hay que hacer cuando el residual no baja.**

---

## 2 · El dato que dimensiona todo, y cambia la conversación

Corrí el umbral sobre los 299 activos de V19. El resultado reencuadra el alcance de las nueve peticiones:

| Valor del activo | Activos | ¿Entra al análisis? |
|---:|---:|---|
| 5 | **3** | Sí |
| 4 | **34** | Sí |
| 3 | 244 | No |
| 2 | 18 | No |
| | **299** | **37 entran** |

**Treinta y siete activos de doscientos noventa y nueve.** Generan **725 riesgos** (activo × amenazas de su tipo), no los 2.256 de la migración anterior.

Eso es lo que hace viables las nueve peticiones. Pedir una ecuación paso a paso, un plan obligatorio por residual crítico y una ficha por activo es inmanejable sobre 299 activos y **perfectamente manejable sobre 37**.

Los 37, repartidos:

| Por proceso | | Por propietario | | Por tipo MAGERIT | |
|---|---:|---|---:|---|---:|
| Gestión Tecnológica | 14 | Chief Operating Officer | 17 | `[D]` Datos | 18 |
| Gestión de Proyectos | 10 | Operations & Services Manager | 7 | `[HW]` Equipos | 8 |
| Gestión Financiera | 6 | Finance and Administrative Manager | 7 | `[SW]` Software | 5 |
| Gestión Legal y Compras | 3 | Chief Legal Officer | 4 | `[S]` Servicios | 4 |
| Talento Humano | 2 | Chief Commercial Officer | 2 | `[K]` Claves | 2 |
| Comercial · Estratégica | 1 · 1 | | | | |

Y los tres de valor 5, que son los que el §11 usa como caso:

```
TEC-EQU-0003  [HW]  D5 I5 C5  srv-clientes-pro                   Chief Operating Officer
TEC-GEN-0004  [HW]  D5 I5 C5  MINTRACE — Ambiente de producción  Chief Operating Officer
TEC-SER-0051  [HW]  D5 I4 C3  UNAD — Ambiente de producción      Chief Operating Officer
```

**Una advertencia sobre la sensibilidad del umbral.** 244 activos están en valor 3, a un punto de entrar. Si en la próxima revisión treinta de ellos suben a 4, el alcance crece un 80 % y las pantallas de este requerimiento tienen que aguantarlo. Nada acá puede asumir «son 37».

---

## 3 · P1 · Las pestañas de Amenazas y Matrices solo para valor ≥ 4

En `FichaActivo.tsx`, las pestañas **Amenazas** y **Matrices** se habilitan solo cuando `max(D,I,C) >= umbral_valoracion`.

**Pero no se ocultan en silencio.** Una pestaña que desaparece se lee como un defecto. Van visibles y deshabilitadas, y al pasar por encima dicen por qué:

> Este activo vale 3. El análisis de riesgos arranca en 4 — `Parametro.umbral_valoracion`. Subí su valoración en la pestaña anterior si corresponde.

El umbral se lee de la base, nunca se escribe en el código. Y la guarda va **también en el servidor**: las acciones que escriben degradación, frecuencia o madurez de un riesgo rechazan un activo bajo el umbral. Una pestaña deshabilitada es ayuda, no control.

---

## 4 · P5 · La grilla del inventario se centra en la valoración

Se **quitan** de la grilla las columnas de riesgo inherente y residual. El inventario responde «qué tenemos y cuánto vale», no «cuánto riesgo carga»: para eso están la página del §5 y las matrices.

Se **agrega** un filtro por valor del activo, con el conteo a la vista, que es la forma más rápida de llegar a los 37:

```
Valor:  ( ) Todos 299   ( ) 5 · 3   ( ) 4 · 34   ( ) 4 y 5 · 37   ( ) 3 · 244   ( ) 2 · 18
```

**Defecto que esto destapa y hay que resolver:** el filtro `color` de `InventarioActivos.tsx` es la **banda de riesgo del renglón**. Si la grilla ya no muestra riesgo, ese filtro queda huérfano — filtra por una columna que no existe. Se retira de la grilla y se lleva a la página del §5, que es donde el riesgo sí se muestra. No se borra el código: se mueve.

---

## 5 · P4 · Página nueva · los activos que entran al análisis

Ruta `/sgsi/valoracion-riesgos`, en el grupo «SGSI · Seguridad de la información», **después** de «Valoración de activos».

**Advertencia de nombre, y va primero.** REQ-SIG-18 ya creó `/sgsi/valoracion` con el rótulo «Valoración de activos». Dos entradas adyacentes llamadas «Valoración de activos» y «Valoración de riesgos» se van a confundir todos los días. Son cosas distintas y conviene que el menú lo diga:

| Pantalla | Qué responde | Alcance |
|---|---|---|
| Valoración de activos (existe) | Cuánto vale el inventario y quién responde | los 299 |
| **Esta** | Cuáles entran al análisis y cómo van | los **37** |

Propuesta: esta se llama **«Análisis de riesgos»**. Es la decisión **D-1** y si preferís el nombre que pediste, se deja tal cual y se acepta la adyacencia.

### 5.1 La ficha de resumen

Una fila de tarjetas arriba, cada una cliqueable y filtrando la lista:

```
┌─ EN ANÁLISIS ─┐ ┌─ MUY ALTOS ─┐ ┌─ ALTOS ─┐ ┌─ RESIDUAL CRÍTICO ─┐ ┌─ SIN PLAN ─┐
│      37       │ │      3      │ │   34    │ │         n          │ │     n      │
│  de 299       │ │  valor 5    │ │ valor 4 │ │  exigen plan (§7)  │ │  vencidos  │
└───────────────┘ └─────────────┘ └─────────┘ └────────────────────┘ └────────────┘
```

Las dos últimas son las que convierten la página en una lista de trabajo y no en un reporte. **«Sin plan» es el número que el líder del SIG mira los lunes.**

### 5.2 La lista

Una fila por activo, ordenada por peor residual descendente:

| Código | Nombre | Valor | Criticidad | Proceso | Propietario | Persona | Amenazas | Peor inherente | Peor residual | Plan |
|---|---|---:|---|---|---|---|---:|---|---|---|

- **Valor** con su chip de color, usando la rampa ordinal ya validada en REQ-SIG-18 §4.4.
- **Peor inherente / peor residual** con su banda, no solo el número.
- **Plan**: ✓ con enlace, «pendiente» en ámbar, o «—» si el residual no lo exige.
- Clic en la fila → abre el popup del activo (§6) en la pestaña Amenazas, sin salir de la página.

### 5.3 Los filtros

Una sola fila arriba, que reescopa la lista **y** las tarjetas: **proceso** · **propietario (cargo)** · **persona** · **valor (4 · 5 · ambos)** · **banda del residual** · **estado del plan**.

Persona sale de `Activo.personaId` con la advertencia de REQ-SIG-18 §6.6: hoy está casi vacío, así que ese filtro va a devolver poco y **no es un defecto**.

---

## 6 · P3 · Una URL para abrir el popup del activo desde cualquier módulo

Hoy `/sgsi/inventario/[codigo]` abre la ficha como página propia, y hay varios lugares que necesitan editar un activo sin perder el contexto.

**Contrato:** cualquier pantalla acepta `?activo=<código>` y abre la ficha **como overlay encima de lo que estabas viendo**. Opcionalmente `&tab=amenazas|matrices|ecuacion|general` para llegar directo a la pestaña.

```
/sgsi/valoracion-riesgos?activo=TEC-GEN-0004&tab=amenazas
/estrategico/riesgos?activo=TEC-GEN-0004
/sgsi/planes?activo=TEC-GEN-0004&tab=ecuacion
```

Cuatro reglas:

1. **Al cerrar se vuelve exactamente a donde estabas**, con los filtros y el scroll intactos. `router.replace` quita el parámetro sin apilar historial.
2. **Al guardar, la pantalla de abajo se refresca.** Si cambiaste la valoración desde la lista del §5, la fila tiene que reflejarlo sin recargar.
3. **La ruta `/sgsi/inventario/[codigo]` se conserva** como página completa: es la que se puede compartir por correo y la que funciona sin contexto.
4. **Un código que no existe** no abre un overlay vacío: avisa y deja la pantalla como estaba.

Es un componente y dos envoltorios, no una ficha nueva. Si te salen dos fichas, la de página y la del overlay van a divergir.

---

## 7 · P2 · Residual crítico exige plan de tratamiento

### 7.1 Exige, no bloquea

Pediste que «obligue» a registrar el plan. **La casa tiene una regla que dice lo contrario y hay que respetarla**: «la aplicación registra y señala; no impide» (decisión D17 del paquete, la misma que prohibió el bloqueo por puerta de control).

Bloquear el guardado tiene además un efecto perverso conocido: quien tiene prisa baja la valoración o sube la madurez para poder guardar, y el dato queda peor que si lo hubiera dejado crítico.

**Cómo se resuelve sin bloquear:**

1. Al guardar algo que deja un residual en **Crítico**, se abre el popup de plan **prellenado**. Nadie tiene que buscar nada.
2. Si se cierra sin registrar, el riesgo queda marcado **«plan pendiente»**, con fecha.
3. Ese estado aparece en la tarjeta «Sin plan» del §5.1, en el tablero del SIG, y **genera una obligación** para el propietario del activo con el plazo de `CriterioAceptacion`.
4. A los N días sin plan, escala. El plazo sale de `CriterioAceptacion.plazoPlan`, que ya existe y ya dice quién aprueba.

El riesgo no se puede esconder; simplemente no se secuestra la pantalla.

### 7.2 El plan es sobre el control, originado en el activo

Otra tensión que hay que resolver bien. Pediste «plan de tratamiento **del activo**». La metodología dice que la unidad es el **control**:

> «Un plan por riesgo es inmanejable —Cuántico tiene más de dos mil— y además incorrecto… lo único que mueve la aguja es elevar la madurez de un control, y eso reduce de golpe todos los riesgos que ese control mitiga.»

Las dos cosas se concilian sin romper ninguna: **la `AccionPlan` sigue siendo sobre un control, y guarda de qué activo y qué amenaza nació.** El popup prellena:

| Campo | De dónde sale |
|---|---|
| Control | **El principal de la amenaza crítica** — o el de menor madurez si aún no hay relevancia asignada |
| Tipo | `MITIGAR` por defecto · `ACEPTAR` · `TRANSFERIR` · `EVITAR` |
| Riesgo de origen | El activo y la amenaza que dispararon el plan |
| Madurez actual → objetivo | La actual del control; el objetivo lo pone quien registra |
| Responsable | El propietario del activo, editable |
| Fecha | Hoy + `CriterioAceptacion.plazoEjecucion` |

Y se publica en el módulo de planes de tratamiento, que ya existe, sin una segunda lista paralela.

**El caso `ACEPTAR` importa tanto como `MITIGAR`.** Un residual crítico que se acepta por presupuesto —el caso de la segunda región de MinTrace— es una decisión legítima que ISO 27001 contempla. Exige justificación escrita, fecha de revisión y el aprobador de `CriterioAceptacion.aprueba`. Registrada así, se ve en el tablero; escondida en una madurez optimista, no.

---

## 8 · P7 · Las fórmulas visibles en la pestaña Amenazas

Cada renglón de amenaza muestra su aritmética **al lado del dato que la produce**, no en un tooltip.

Encima del combo de degradación, el valor que entra:

```
  Dimensión   Valor del activo      Degradación           Impacto
  D           2 — Bajo      (2)  ×  [No aplica  ▾] (0.0)  =  0.00
  I           3 — Medio     (3)  ×  [Alta       ▾] (0.8)  =  2.40
  C           4 — Alto      (4)  ×  [Alta       ▾] (0.8)  =  3.20
                                              impacto = max(…)  =  3.20
```

Y debajo, la frecuencia y el cierre:

```
  Frecuencia   [Alta — ocurre cada mes ▾]  =  10 veces/año
  Inherente    impacto 3.20 × ARO 10       =  32.00   ▸ Crítico
  Eficacia     media de 7 controles         =  93.6 %   ⚠ sin relevancia asignada
  Residual     3.20 × (10 × (1 − 0.936))    =   2.06   ▸ Medio
```

Tres reglas para que sea trazable y no decorativo:

- **El número entre paréntesis cambia con el combo**, en vivo, antes de guardar. Es lo que permite tantear.
- **El aviso de «sin relevancia» va acá**, junto a la eficacia. Es donde alguien lo va a ver y entender.
- **Ninguna cifra se recalcula en el cliente con su propia aritmética.** Todo sale de `lib/sgsi/formulas.ts`, que es puro y ya está probado. Dos implementaciones divergen.

---

## 9 · P8 · La pestaña Ecuación

Una pestaña nueva que resuelve el cálculo paso a paso, para la amenaza seleccionada. La fórmula a la izquierda, la resolución a la derecha.

```
ECUACIÓN · TEC-GEN-0004 × A.24 Denegación de servicio

1  Valor del activo
   valor = max(v_D, v_I, v_C)                        max(5, 5, 5)          =  5

2  Impacto por dimensión
   impacto_d = v_d × degradación_d                   D: 5 × 1.0            =  5.00
                                                      I: 5 × 0.0            =  0.00
                                                      C: 5 × 0.0            =  0.00

3  Impacto acumulado
   impacto = max(impacto_D, impacto_I, impacto_C)    max(5.00, 0, 0)       =  5.00
   ▸ el máximo, no la suma: mantiene la escala 0–5 del valor

4  Riesgo inherente
   inherente = impacto × ARO                          5.00 × 1              =  5.00
   ▸ banda Alto  (Alto ≥ 5)

5  Eficacia agregada de los controles
   e = media ponderada acotada por el principal       4 controles           = 92.5 %
   ⚠ sin relevancia asignada → media simple (v2), el techo no opera

6  Frecuencia residual
   ARO_res = ARO × (1 − e)                            1 × (1 − 0.925)       =  0.0750

7  Riesgo residual
   residual = impacto × ARO_res                       5.00 × 0.0750         =  0.3750
   ▸ banda Bajo

   ▸ El impacto NO cambia entre inherente y residual. La eficacia reduce la
     frecuencia, nunca el daño. Un impacto residual sería un error de implementación.
```

Cuatro cosas que esta pestaña tiene que respetar:

- **Muestra los pasos que realmente corrieron.** Si el riesgo tiene excepción de degradación, de frecuencia o de madurez (`RiesgoDegradacion`, `Riesgo.frecuenciaId`, `Riesgo.madurezId`), el paso lo dice y muestra la justificación escrita.
- **El paso 5 se puede expandir** al desglose por grupos de control del §8 de REQ-SIG-18 — principal, secundario, complementario — cuando la relevancia exista.
- **Es de solo lectura.** Se edita en la pestaña Amenazas; acá se entiende.
- **Se puede copiar como texto.** Es lo que se pega en un acta de comité o se le manda a un auditor.

---

## 10 · P6 · Las notas al final, sin perder el rastro

Pediste que en vez de pedir razón en cada cambio, se escriban unas notas al terminar. Tiene sentido: editar cinco degradaciones y responder cinco modales es una forma de conseguir cinco «ajuste» escritos a la carrera.

**Lo que no se puede perder**, y por eso la solución no es simplemente quitar el modal:

- `Riesgo.justificacion` existe con la regla «una excepción sin razón escrita no se puede guardar».
- El invariante 7 del paquete: la bitácora va en la misma transacción que el hecho.
- Una fila de `Bitacora` **por campo cambiado** es lo que permite responder «quién bajó esta degradación y cuándo».

**Cómo se resuelve quedándose con las dos cosas.** Se separa el *registro* de la *narrativa*:

1. Mientras se edita, **los cambios se acumulan sin pedir nada** y la pantalla muestra el borrador: «3 cambios sin guardar».
2. Al guardar, **un solo cuadro** con la lista de lo que cambió y **un campo de notas**:

   ```
   Vas a guardar 3 cambios en TEC-GEN-0004 × A.24
     · degradación D    Alta (0.8)  →  Muy alta (1.0)
     · frecuencia       Media (1)   →  Alta (10)
     · madurez del riesgo   —       →  L1

   Notas — qué cambió en la realidad y por qué  (obligatorio)
   ┌──────────────────────────────────────────────────────────┐
   │                                                          │
   └──────────────────────────────────────────────────────────┘
   ```

3. Al confirmar, se escribe **una fila de `Bitacora` por campo** —con su valor anterior, su valor nuevo y **la misma nota como `motivo`**— todo en una transacción. Y la nota va también a `Riesgo.justificacion`.

Se gana la experiencia que pediste y no se pierde una sola fila de auditoría. La nota sigue siendo obligatoria: sin ella no hay guardado, porque sin ella la excepción no se puede almacenar.

---

## 11 · P9 · La criticidad

**No existe hoy.** No hay columna de criticidad en V19 ni atributo en `Activo`.

Y «incluye la criticidad» admite dos lecturas que llevan a construcciones distintas. Es la decisión **D-3** y bloquea:

**Lectura A · la criticidad es derivada** — la banda del peor riesgo residual del activo. No cuesta nada: es una columna calculada en la lista del §5.2 y ya se muestra como «peor residual».

**Lectura B · la criticidad es un atributo propio del negocio** — un catálogo que dice cuánta interrupción tolera el activo, independiente de su valoración D/I/C. Es lo que discutimos con MinTrace y UNAD: **los dos están en D=5 y no exigen lo mismo**. UNAD tolera horas de caída; MinTrace no.

**Recomiendo la B**, porque es la que resuelve el problema que la originó y porque la A ya está cubierta por la columna de residual. Sería:

```
Activo.criticidadId  →  CriticidadNegocio
   Crítica      RTO < 1 h      exige el control principal en L4
   Alta         RTO < 8 h      exige L3
   Media        RTO < 72 h     exige L3
   Baja         sin compromiso  sin exigencia adicional
```

Y con eso aparece **la exigencia**, que es el concepto que te gustó: la criticidad del activo fija el **nivel exigido** del control principal de cada amenaza que lo alcanza, y la brecha contra la madurez real es el hallazgo.

```
MINTRACE producción · criticidad Crítica · exige A.8.14 en L4
La organización está en L3.  ▸ brecha de un nivel  ▸ plan o aceptación
```

Eso es el plan de las dos regiones, dicho por el sistema. **Pero la exigencia es un requerimiento propio**: toca el modelo de datos, el tablero y el plan de tratamiento. Acá se crea **el atributo y su catálogo**, se muestra en la lista y en la ficha, y **la regla de exigencia queda declarada y sin implementar** — anotada como REQ-SIG-21.

---

## 12 · El recálculo

Correr `generarRiesgos()` después de todo lo anterior.

| Resultado esperado | |
|---|---:|
| Activos vigentes | 299 |
| Activos en análisis (valor ≥ 4) | **37** |
| Riesgos generados | **725** |
| Riesgos obsoletos | los de activos que bajaron del umbral |

**Sobre «a los demás dejar en 0».** Los 262 activos bajo el umbral **no tienen filas de `Riesgo`** — `generarRiesgos` los salta. Mostrar `0` diría que se calculó y dio cero; la verdad es que no se calculó.

Es el mismo error que REQ-SIG-18 §8 ya evitó con «Sin valorar»: no valorado y valorado en cero son hechos distintos. **Propongo mostrar «—» con el tooltip «fuera del análisis · valor 3»** en vez de `0`. Es la decisión **D-5** y si preferís el `0`, se pone `0`.

---

## 13 · Orden de ejecución y estimación

Nueve peticiones, cuatro bloques. El orden importa: los dos primeros son la base de los otros.

| # | Bloque | Incluye | Días |
|---|---|---|---:|
| 1 | **Base** | P1 guardas de umbral · P5 grilla · recálculo | 1.5 |
| 2 | **Trazabilidad** | P7 fórmulas visibles · P8 pestaña Ecuación | 3.0 |
| 3 | **El camino** | P3 URL del popup · P4 página nueva | 5.0 |
| 4 | **El cierre** | P2 plan por residual crítico · P6 notas · P9 criticidad | 6.5 |
| | **Pruebas, ajuste y verificación** | | 2.0 |
| | | | **18** |

**≈ 18 días de desarrollo · 3,5 a 4 semanas de una persona.** El desglose fino:

| Petición | Días | Por qué |
|---|---:|---|
| P1 · guardas de umbral | 0.5 | Render condicional + guarda en servidor |
| P5 · grilla de inventario | 0.5 | Quitar dos columnas, agregar un filtro, mover `color` |
| P7 · fórmulas visibles | 1.5 | Recálculo en vivo sin duplicar aritmética |
| P8 · pestaña Ecuación | 1.5 | Siete pasos, excepciones y copiar como texto |
| P3 · URL del popup | 2.0 | Overlay, volver al origen, refresco de la pantalla de abajo |
| P4 · página nueva | 3.0 | Lista, cinco tarjetas, seis filtros que reescopan las dos |
| P2 · plan por residual crítico | 3.5 | Popup, prellenado, estado pendiente, obligación, integración con planes |
| P6 · notas al final | 1.5 | Toca el flujo de bitácora; hay que no romper la auditoría |
| P9 · criticidad | 1.5 | Migración, catálogo, semilla, dos pantallas |
| Recálculo y verificación | 0.5 | |
| Pruebas y ajuste | 2.0 | |

**Lo que puede mover la estimación:**

- **+2 a 3 días** si D-3 se resuelve por la lectura B **y** se decide implementar la exigencia acá en vez de dejarla para REQ-SIG-21.
- **+1 a 2 días** si el popup del activo (§6) resulta más acoplado a su página de lo que se ve desde afuera. `FichaActivo.tsx` es el archivo más grande del módulo.
- **−1 día** si D-1 se resuelve reusando la página de REQ-SIG-18 en vez de crear una nueva.
- **No incluye** asignar la relevancia de los 272 pares ni corregir las madureces declaradas. Son dos trabajos de criterio, no de desarrollo, y van en paralelo.

---

## 14 · Criterios de aceptación

1. Un activo de valor 3 abre su ficha con **Amenazas y Matrices deshabilitadas y explicadas**; la acción de servidor que escribe una degradación para ese activo **rechaza**.
2. `select count(*) from activo where activo` → 299. Activos con al menos un `Riesgo` no obsoleto → **37**. Riesgos no obsoletos → **725**.
3. Cambiar `umbral_valoracion` a 3 y regenerar: el conteo de activos en análisis sube **sin tocar código**, y las pestañas se habilitan solas.
4. La grilla del inventario **no muestra** columnas de inherente ni residual, y el filtro por valor da 3 · 34 · 37 · 244 · 18.
5. La página nueva lista **37 filas**; las tarjetas suman lo mismo que la lista bajo cualquier combinación de filtros.
6. `?activo=TEC-GEN-0004&tab=ecuacion` abre el overlay en esa pestaña **desde tres módulos distintos**; al cerrar, los filtros y el scroll de abajo quedan intactos.
7. Guardar una madurez que deja un residual en Crítico abre el popup de plan prellenado; cerrarlo sin registrar deja el riesgo en **«plan pendiente»** y suma 1 a la tarjeta «Sin plan».
8. Un plan registrado desde ahí **aparece en el módulo de planes de tratamiento** y guarda el activo y la amenaza que lo originaron.
9. Tres cambios en una sesión de edición producen **tres filas de `Bitacora`**, cada una con su campo, su valor anterior, su valor nuevo y **la misma nota** como motivo. Guardar sin nota **falla**.
10. La pestaña Ecuación de `TEC-GEN-0004 × A.24` resuelve los siete pasos y su paso 7 **coincide hasta el cuarto decimal** con `Riesgo.riesgoResidual`. Si difieren, hay dos aritméticas.
11. Ninguna cifra de las pantallas nuevas se calcula fuera de `lib/sgsi/formulas.ts`.
12. Las pantallas nuevas **no escriben nada** al visitarlas: ni una fila de `Bitacora`.

---

## 15 · Decisiones

- **D-1 · el nombre de la página nueva.** «Valoración de riesgos» como pediste, o **«Análisis de riesgos»** para no dejar dos entradas casi homónimas pegadas en el menú. Recomiendo la segunda.
- **D-2 · exigir sin bloquear.** El residual crítico abre el popup y marca «plan pendiente», pero **no impide guardar** (§7.1). Es la regla de la casa y además evita que la gente falsee el dato para poder guardar.
- **D-3 · qué es la criticidad · BLOQUEA.** Derivada del peor residual, o atributo propio del negocio con su catálogo. Recomiendo el atributo, porque es el que habilita la exigencia (§11).
- **D-4 · el plan es sobre el control.** Originado en el activo y la amenaza, que quedan guardados, pero la unidad de gestión sigue siendo el control, como manda la metodología.
- **D-5 · «—» o `0` para los que no entran · BLOQUEA la aceptación 4.** Recomiendo «—»: no calculado y calculado en cero son hechos distintos.
- **D-6 · el filtro `color`** se mueve del inventario a la página nueva. Confirmar que nadie dependa de él donde está.

---

## 16 · Lo que no entra

- **La regla de exigencia por criticidad.** Acá se crea el atributo; la regla que lo convierte en nivel exigido y en brecha es **REQ-SIG-21**.
- **Asignar la relevancia de los 272 pares** y **corregir las madureces declaradas.** Son los dos trabajos que hacen que estos números signifiquen algo, y son de criterio, no de desarrollo. El aviso «sin relevancia asignada» del §8 y del §9 existe justamente para que la brecha se vea mientras tanto.
- **Cambiar la fórmula, la curva de eficacia o el catálogo de amenazas.** Nada de eso se toca acá.
- **Un plan por riesgo.** La metodología lo descartó y este requerimiento no lo reintroduce.
