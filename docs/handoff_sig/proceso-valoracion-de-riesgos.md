# Requerimiento · El proceso de valoración de riesgos, de punta a punta

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-20 · proceso de valoración de riesgos |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-11 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo (ejecución asistida con Claude Code) |
| **Toca** | `FichaActivo.tsx` · `InventarioActivos.tsx` · `lib/sgsi/consolidado-lectura.ts` · `AccionPlan` · sidebar · una ruta nueva, una migración y **una columna nueva en `FOR-SIG-12`** |
| **Estado** | D-2, D-3 y D-5 **cerradas** · D-1, D-4 y D-6 abiertas sin bloquear · **listo para ejecutar** (§15) |

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

### 3.1 Deshabilitar la pestaña no alcanza: hay que dejar de calcular

**Hallazgo verificado en el código de hoy.** `FichaActivo.tsx` sí conoce el umbral —`entraAlAnalisis` en la línea 530— pero **la pasada de derivación de la línea 592 corre para todos los activos**, entre o no entre. Para un activo de valor 3 el resultado es que la pantalla se contradice:

| Dónde | Qué hace hoy |
|---|---|
| `:2446` | Un párrafo dice «no requiere análisis y **no genera riesgos**» |
| `:2505` | …y a continuación `filas.map` **lista las amenazas con su impacto, inherente y residual ya calculados** |
| `:3451` | La pestaña Matrices las distribuye y las cuenta como «los N riesgos de este activo» |
| `:1197` | La insignia de la pestaña dice «no requiere» sobre N filas |

Fue **deliberado**: el propio párrafo lo argumenta como previsualización —«las N amenazas siguen listadas como referencia de lo que se generaría al subir la valoración»—. Pero el efecto es que **la pantalla afirma que no genera riesgos y acto seguido los muestra**, y lo que el lector ve son cifras de riesgo sobre un activo fuera del análisis.

**Qué se hace (D-5, cerrada):**

1. **La pasada de derivación no corre** cuando el activo no alcanza el umbral. No es solo deshabilitar la pestaña: es **no calcular**.
2. **La previsualización se retira por completo.** No queda detrás de un botón ni plegada: se va.
3. La insignia de la pestaña no muestra conteo. Sin filas no hay número que mostrar.
4. Las dos pestañas quedan deshabilitadas con la explicación del §3.

**Y hay un beneficio de paso que conviene medir:** hoy esa pasada corre sobre las amenazas del tipo en **cada apertura de ficha de los 299 activos**, cuando solo 37 la necesitan. Es trabajo del cliente desperdiciado en el 88 % de los casos.

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
2. Si se cierra sin registrar, **el guardado ocurre igual** y el riesgo queda marcado **«plan pendiente»**, con fecha.
3. Ese estado **alerta con nombre y apellido en dos listas** (§7.3), aparece en la tarjeta «Sin plan» del §5.1, y **genera una obligación** para el propietario del activo.
4. A los N días sin plan, escala. El plazo sale de `CriterioAceptacion.plazoPlan`, que ya existe y ya dice quién aprueba.

El riesgo no se puede esconder; simplemente no se secuestra la pantalla.

### 7.3 La alerta nombra los activos, no cuenta un número

Un contador que dice «3 sin plan» obliga a ir a buscar cuáles. La alerta **lista los códigos** y cada uno abre su ficha con el contrato de URL del §6.

Va en **dos lugares**, porque son dos personas distintas las que la tienen que ver:

**En la lista de planes de tratamiento** (`/sgsi/planes`) — la ve quien gestiona el plan:

```
⚠  3 activos con riesgo residual Crítico y sin plan de tratamiento
   TEC-GEN-0004 · MINTRACE producción        A.24 Denegación de servicio    hace 6 días
   TEC-EQU-0003 · srv-clientes-pro           A.11 Acceso no autorizado      hace 2 días
   TEC-SER-0051 · UNAD producción            A.24 Denegación de servicio    hoy
                                                          [ Registrar plan → ]
```

**En la lista de activos** —tanto el inventario como la página del §5— la ve quien responde por el activo. Misma franja, y además **la fila del activo se marca**: un punto ámbar junto al código, con el texto «sin plan» al pasar por encima.

Cuatro reglas:

- **La franja no se puede descartar para siempre.** Se colapsa a una línea y vuelve entera en la siguiente sesión. Es una deuda abierta, no un aviso.
- **Muestra hasta cinco y luego «+n más»**, que enlaza a la página del §5 ya filtrada por «sin plan».
- **Dice cuánto lleva pendiente.** «Hace 6 días» contra el plazo de `CriterioAceptacion.plazoPlan` es lo que convierte la alerta en algo que escala.
- **Si el plan es de tipo `ACEPTAR`, el activo sale de la lista.** Aceptar es planificar: la decisión está tomada, firmada y con fecha de revisión. Lo que la alerta persigue es el silencio, no el riesgo alto.

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

**D-3 cerrada: la criticidad la declara el negocio en el archivo, no la calcula el sistema.** Es una columna nueva de `FOR-SIG-12`, al lado de la valoración D/I/C, diligenciada por el dueño del proceso. La razón es la misma por la que la valoración se declara y no se deduce: **cuánta interrupción tolera un servicio es un compromiso de negocio, no un resultado aritmético.** Si el sistema la calculara del peor residual, diría que un activo es crítico *porque está mal protegido* — exactamente al revés de lo que se necesita, que es saber cuánto exige **antes** de mirar cómo está.

Y es lo que separa a MinTrace de UNAD: **los dos valen D=5 y no toleran lo mismo.**

### 11.1 La escala propuesta

Dos ejes, porque son dos preguntas distintas y una no implica la otra: **RTO** —cuánto puede estar caído— y **RPO** —cuánto dato se puede perder—.

| Nivel | RTO | RPO | Lo que exige en arquitectura |
|---|---|---|---|
| **C1 · Crítica continua** | **≤ 10 min** | **≤ 5 min** | Multi-región activo-activo, o conmutación automática **probada**. Réplica síncrona o casi |
| **C2 · Crítica** | ≤ 4 h | ≤ 1 h | Segunda región en espera tibia, con conmutación probada y documentada |
| **C3 · Importante** | ≤ 24 h | ≤ 8 h | Respaldo restaurable con prueba de restauración periódica |
| **C4 · Estándar** | ≤ 72 h | ≤ 24 h | Respaldo diario, restauración bajo demanda |
| **C5 · Sin compromiso** | sin SLA | sin SLA | Esfuerzo razonable. Es un valor, no la ausencia de uno |

El `C1` recoge tu propuesta de RTO y RPO por debajo de diez minutos, y es el único nivel que **exige por definición una segunda región**: ningún respaldo restaura en diez minutos. Ahí está el valor de la columna — **decir «MinTrace es C1» es decir «MinTrace necesita dos regiones», sin discutir arquitectura.**

`C5` existe a propósito y no es «vacío». Un activo sin compromiso declarado es distinto de uno que nadie clasificó: el primero es una decisión, el segundo es trabajo pendiente. Los no clasificados quedan en nulo y se listan como faltantes.

### 11.2 Dónde vive el dato

| Capa | Qué se agrega |
|---|---|
| `FOR-SIG-12` | **Columna 26 · «Criticidad de negocio (RTO/RPO)»**, después de «Nivel del activo». Desplegable con los cinco valores |
| Esquema | `Activo.criticidadId` → catálogo **`CriticidadNegocio`** (`codigo`, `nombre`, `rtoMinutos`, `rpoMinutos`, `descripcion`, `orden`, `activo`) |
| Importador | `consolidado-lectura.ts` resuelve la columna 26 contra el catálogo. **Nulo permitido**, con aviso — igual que el custodio |
| Ficha del activo | Se edita en la pestaña General, junto a la valoración |
| Listas | Columna en el §5.2 y en el inventario, con su chip |
| Semilla | Los cinco niveles, con sus minutos |

**RTO y RPO se guardan en minutos**, no como texto. «≤ 4 h» es presentación; `240` es el dato. Sin eso no se puede ordenar, comparar ni calcular una brecha.

### 11.3 Dos comprobaciones que la columna habilita

La criticidad y la valoración D son primas, no gemelas — y cuando se contradicen, una de las dos está mal:

- **Criticidad C1 o C2 con `D ≤ 3`** → sospechoso. Si no tolera diez minutos de caída, difícilmente su disponibilidad valga «Medio». La pantalla lo marca y pide revisar la valoración.
- **`D = 5` con criticidad C4 o C5** → coherente y hay que dejarlo pasar. Perder el activo es catastrófico **y** se puede esperar tres días a recuperarlo. Son cosas distintas y confundirlas es el error que esta columna existe para evitar.

### 11.4 La exigencia queda declarada, no implementada

Con la columna aparece **la exigencia**, que es el concepto que te interesó: la criticidad fija el **nivel exigido** del control principal de cada amenaza que alcanza al activo, y la brecha contra la madurez real es el hallazgo.

```
MINTRACE producción · criticidad C1 (RTO ≤ 10 min · RPO ≤ 5 min)
   exige A.8.14 Redundancia en L4        la organización está en L3
   ▸ brecha de un nivel  ▸ plan de tratamiento o aceptación firmada
```

Eso es el plan de las dos regiones, dicho por el sistema y no por una reunión.

**Pero la regla de exigencia no entra acá.** Toca el modelo de madurez, el tablero y el plan de tratamiento, y merece su propio requerimiento — **REQ-SIG-23**. En REQ-SIG-20 se crea **la columna, el catálogo, la carga, la edición y la visualización**, que es lo que permite empezar a diligenciarla ya. La regla llega después, sobre un dato que para entonces existe.

---

## 12 · El recálculo

Correr `generarRiesgos()` después de todo lo anterior.

| Resultado esperado | |
|---|---:|
| Activos vigentes | 299 |
| Activos en análisis (valor ≥ 4) | **37** |
| Riesgos generados | **725** |
| Riesgos obsoletos | los de activos que bajaron del umbral |

**Sobre «a los demás dejarlos en 0».** No es una decisión de presentación: es alcance. Los 262 activos bajo el umbral **no tienen filas de `Riesgo`** —`generarRiesgos` los salta en la línea 143— y **tampoco deben tener cifras calculadas en ninguna pantalla**. El §3.1 quita la única que las producía.

La regla, en una línea: **un activo bajo el umbral está fuera del análisis, y estar fuera significa que no se calcula, no que se calcula y da cero.** Es el mismo criterio que REQ-SIG-18 §8 aplicó a «Sin valorar»: no calculado y calculado en cero son hechos distintos, y confundirlos es lo que hace que un tablero sume 262 ceros y concluya que el 88 % del inventario tiene riesgo nulo.

Donde una exportación o una API tenga que emitir la fila igual —el inventario completo sale a Excel— el campo va **vacío**, nunca `0`.

---

## 13 · Orden de ejecución y estimación

Nueve peticiones, cuatro bloques. El orden importa: los dos primeros son la base de los otros.

| # | Bloque | Incluye | Días |
|---|---|---|---:|
| 1 | **Base** | P1 guardas de umbral · P5 grilla · recálculo | 1.5 |
| 2 | **Trazabilidad** | P7 fórmulas visibles · P8 pestaña Ecuación | 3.0 |
| 3 | **El camino** | P3 URL del popup · P4 página nueva | 5.0 |
| 4 | **El cierre** | P2 plan por residual crítico · P6 notas · P9 criticidad | 8.0 |
| | **Pruebas, ajuste y verificación** | | 2.0 |
| | | | **19.5** |

**≈ 19 a 20 días de desarrollo · 4 semanas de una persona.** El desglose fino:

| Petición | Días | Por qué |
|---|---:|---|
| P1 · guardas de umbral | 0.5 | Render condicional + guarda en servidor |
| P5 · grilla de inventario | 0.5 | Quitar dos columnas, agregar un filtro, mover `color` |
| P7 · fórmulas visibles | 1.5 | Recálculo en vivo sin duplicar aritmética |
| P8 · pestaña Ecuación | 1.5 | Siete pasos, excepciones y copiar como texto |
| P3 · URL del popup | 2.0 | Overlay, volver al origen, refresco de la pantalla de abajo |
| P4 · página nueva | 3.0 | Lista, cinco tarjetas, seis filtros que reescopan las dos |
| P2 · plan por residual crítico | 4.0 | Popup, prellenado, estado pendiente, obligación, **la franja de alerta en dos listas** (§7.3), integración con planes |
| P6 · notas al final | 1.5 | Toca el flujo de bitácora; hay que no romper la auditoría |
| P9 · criticidad | 2.5 | Migración, catálogo con RTO/RPO en minutos, semilla, **columna 26 de FOR-SIG-12 y su lectura en el importador**, edición en la ficha, dos listas, las dos comprobaciones de coherencia |
| Recálculo y verificación | 0.5 | |
| Pruebas y ajuste | 2.0 | |

**Lo que puede mover la estimación:**

- **+2 a 3 días** si D-3 se resuelve por la lectura B **y** se decide implementar la exigencia acá en vez de dejarla para REQ-SIG-23.
- **+1 a 2 días** si el popup del activo (§6) resulta más acoplado a su página de lo que se ve desde afuera. `FichaActivo.tsx` es el archivo más grande del módulo.
- **−1 día** si D-1 se resuelve reusando la página de REQ-SIG-18 en vez de crear una nueva.
- **No incluye** asignar la relevancia de los 272 pares ni corregir las madureces declaradas. Son dos trabajos de criterio, no de desarrollo, y van en paralelo.

---

## 14 · Criterios de aceptación

1. Un activo de valor 3 abre su ficha con **Amenazas y Matrices deshabilitadas y explicadas**; la acción de servidor que escribe una degradación para ese activo **rechaza**.
1b. En ese mismo activo, la pestaña Amenazas **no lista ni una fila** y la de Matrices **no cuenta ningún riesgo**. La pasada de derivación **no se ejecuta**: verificable poniendo una traza en el `useMemo` de `FichaActivo.tsx:592` y abriendo un activo de valor 3 y otro de valor 5 — corre una sola vez, en el segundo.
2. `select count(*) from activo where activo` → 299. Activos con al menos un `Riesgo` no obsoleto → **37**. Riesgos no obsoletos → **725**.
3. Cambiar `umbral_valoracion` a 3 y regenerar: el conteo de activos en análisis sube **sin tocar código**, y las pestañas se habilitan solas.
4. La grilla del inventario **no muestra** columnas de inherente ni residual, y el filtro por valor da 3 · 34 · 37 · 244 · 18.
5. La página nueva lista **37 filas**; las tarjetas suman lo mismo que la lista bajo cualquier combinación de filtros.
6. `?activo=TEC-GEN-0004&tab=ecuacion` abre el overlay en esa pestaña **desde tres módulos distintos**; al cerrar, los filtros y el scroll de abajo quedan intactos.
7. Guardar una madurez que deja un residual en Crítico **guarda igual**, abre el popup prellenado, y al cerrarlo sin registrar deja el riesgo en **«plan pendiente»**, suma 1 a la tarjeta «Sin plan» y **hace aparecer el código del activo** en la franja de alerta de `/sgsi/planes` **y** de la lista de activos. Registrar un plan de tipo `ACEPTAR` lo saca de las dos franjas.
8. Un plan registrado desde ahí **aparece en el módulo de planes de tratamiento** y guarda el activo y la amenaza que lo originaron.
9. Tres cambios en una sesión de edición producen **tres filas de `Bitacora`**, cada una con su campo, su valor anterior, su valor nuevo y **la misma nota** como motivo. Guardar sin nota **falla**.
10. La pestaña Ecuación de `TEC-GEN-0004 × A.24` resuelve los siete pasos y su paso 7 **coincide hasta el cuarto decimal** con `Riesgo.riesgoResidual`. Si difieren, hay dos aritméticas.
11. Ninguna cifra de las pantallas nuevas se calcula fuera de `lib/sgsi/formulas.ts`.
12. `CriticidadNegocio` tiene **5 filas** con sus `rtoMinutos` y `rpoMinutos` en minutos —`C1` con 10 y 5— y **no en texto**. Ordenar la lista del §5.2 por criticidad las ordena por RTO.
13. Un `FOR-SIG-12` con la columna 26 diligenciada carga la criticidad; uno sin ella carga los activos con criticidad **nula y un aviso**, nunca con un valor por defecto.
14. Un activo con criticidad `C1` y `D ≤ 3` muestra la advertencia de coherencia del §11.3. Uno con `D = 5` y criticidad `C4` **no** muestra ninguna: es una combinación válida.
15. Las pantallas nuevas **no escriben nada** al visitarlas: ni una fila de `Bitacora`.

---

## 15 · Decisiones

- **D-1 · el nombre de la página nueva.** «Valoración de riesgos» como pediste, o **«Análisis de riesgos»** para no dejar dos entradas casi homónimas pegadas en el menú. Recomiendo la segunda.
- **D-2 · exigir sin bloquear · CERRADA.** El guardado ocurre siempre. El residual crítico abre el popup prellenado y, si se cierra, deja el riesgo en «plan pendiente» y **alerta nombrando los activos** en la lista de planes y en la de activos (§7.3). Es la regla de la casa y además evita que alguien falsee el dato para poder guardar.
- **D-3 · la criticidad · CERRADA.** Es una **variable explícita del negocio**, columna 26 de `FOR-SIG-12`, con escala de cinco niveles sobre RTO y RPO (§11.1). No se deriva del peor residual: eso diría que un activo es crítico porque está mal protegido, al revés de lo que se necesita.
- **D-4 · el plan es sobre el control.** Originado en el activo y la amenaza, que quedan guardados, pero la unidad de gestión sigue siendo el control, como manda la metodología.
- **D-5 · los activos bajo el umbral no se consideran · CERRADA.** No era una decisión de presentación —esa fue una mala lectura mía de «dejalos en 0»— sino de alcance: **no se calculan**. La previsualización de `FichaActivo.tsx` que hoy los computa y los lista **se retira por completo** (§3.1). En exportaciones el campo va vacío, nunca `0`.
- **D-6 · el filtro `color`** se mueve del inventario a la página nueva. Confirmar que nadie dependa de él donde está.

---

## 16 · Lo que no entra

- **La regla de exigencia por criticidad.** Acá se crea el atributo; la regla que lo convierte en nivel exigido y en brecha es **REQ-SIG-23**.
- **Asignar la relevancia de los 272 pares** y **corregir las madureces declaradas.** Son los dos trabajos que hacen que estos números signifiquen algo, y son de criterio, no de desarrollo. El aviso «sin relevancia asignada» del §8 y del §9 existe justamente para que la brecha se vea mientras tanto.
- **Cambiar la fórmula, la curva de eficacia o el catálogo de amenazas.** Nada de eso se toca acá.
- **Un plan por riesgo.** La metodología lo descartó y este requerimiento no lo reintroduce.
