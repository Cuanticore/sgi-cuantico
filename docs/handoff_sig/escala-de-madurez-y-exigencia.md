# Requerimiento · La escala de madurez en porcentaje, y la exigencia como compuerta

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-24 · escala de madurez y exigencia |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-15 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo + líder del SIG (la rúbrica es criterio, no código) |
| **Gobierna** | `MET-SIG-01 Metodología v3 §7.4 y §8.2` — exige emitir **v4** |
| **Sustituye** | REQ-SIG-22 §7 (la restricción «no tocar la escala») · REQ-SIG-23 §3.1 (la tabla de exigencia, ahora en %) · REQ-SIG-20 §7 (la compuerta de la deuda de planes) |
| **Depende de** | REQ-SIG-21 (el control principal designado) para que la brecha sea **evaluable** |
| **Toca** | `EscalaMadurez` · `lib/sgsi/madurez.ts` · `lib/sgsi/exigencia.ts` · `lib/sgsi/analisis-riesgos.ts` · `lib/sgsi/deuda-planes.ts` · las pantallas de Madurez, Análisis y la ficha del activo |
| **Estado** | D-1 y D-2 abiertas · ninguna bloquea el arranque |

---

## 1 · Objetivo

Que el riesgo residual de los activos más críticos **exista en el tablero**, y que la criticidad del negocio decida algo.

Hoy no ocurre ninguna de las dos cosas, y las dos fallan por la misma causa: **la escala de madurez no tiene resolución en el tramo donde se decide el riesgo.**

---

## 2 · El hallazgo

### 2.1 La curva gasta sus escalones donde ya no cambia nada

La curva de eficacia vigente (PILAR/CCN-CERT, `MET-SIG-01 §8.2`) es:

```
L0 = 0 %    L1 = 10 %    L2 = 50 %    L3 = 90 %    L4 = 95 %    L5 = 100 %
```

Tomemos `TEC-GEN-0004 · MINTRACE producción` (D5 I5 C5) y veamos dónde cambian de banda sus riesgos al mover la eficacia:

| Amenaza | Inherente | Es **Crítico** mientras e ≤ | Es **Alto** mientras e ≤ |
|---|---:|---:|---:|
| A.8 Difusión de software dañino | 50 | 50 % | 90 % |
| A.11 Acceso no autorizado | 40 | 37.5 % | 87.5 % |
| E.1 Errores de los usuarios | 25 | 0 % | 80 % |

**Todo se decide entre el 30 % y el 90 %. En ese tramo la curva tiene un solo valor: el 50 %.** Y gasta tres de sus seis escalones —90, 95, 100— apiñados en el techo, donde el residual ya colapsó.

La consecuencia no es que los evaluadores sean optimistas: es que **la escala no les ofrece dónde ser honestos**. Un control «definido pero sin prueba de conmutación» tiene que elegir entre 50 % y 90 %, y entre esas dos opciones el residual de A.11 salta de 20 (Crítico) a 4 (Medio). El salto L2→L3 *es* el agujero por el que se cae el análisis.

### 2.2 Lo que eso produjo: dos mecanismos muertos

Con la eficacia declarada de hoy (índice 86.6 %, típico 90-95 %), el residual queda entre el 5 % y el 10 % del inherente. Contra las bandas vigentes —Bajo 0-0.5 · Medio 0.5-5 · Alto 5-25 · **Crítico ≥ 25**— eso significa:

> Para que un residual llegue a banda **Crítico** haría falta un inherente de **250** (con eficacia 90 %) o de **500** (con 95 %). **El inherente máximo alcanzable en todo el modelo es 50.**

La banda «Crítico» del residual es **inalcanzable por construcción**. Y todo lo que cuelga de ella está construido, probado y no puede dispararse nunca:

- la tarjeta **RESIDUAL CRÍTICO** de `/sgsi/valoracion-riesgos` → siempre 0;
- la **deuda de planes**, la franja «sin plan», el envejecimiento y el escalado de REQ-SIG-20 §7 → cola vacía;
- y el renglón de MINTRACE producción se pinta **verde**: «inherente 4-5 y residual 1-3». El activo más crítico de la compañía se ve como controlado.

### 2.3 Y la criticidad no decide nada

La tabla de exigencia de REQ-SIG-23 §3.1 pide **L4** a C1/C2 y **L3** a C3/C4. En la curva vigente eso es **95 % contra 90 %**: cinco puntos. La diferencia entre «crítica continua» (RTO ≤ 10 min) y «estándar» (RTO ≤ 72 h) mueve el residual un factor de dos, mientras que «exige L3, está en L2» son cuarenta puntos.

Peor: la brecha se define como `nivel_exigido − nivel_actual`, **una resta sobre una escala ordinal** — exactamente lo que `lib/sgsi/madurez.ts` prohíbe en su propia regla escrita («el nivel L0-L5 es ordinal y promediarlo es incorrecto en rigor»). Una «brecha de un nivel» significa cosas distintas según dónde caiga, y no se puede priorizar una lista con eso.

---

## 3 · La escala nueva

**Once escalones, de 0 % a 100 %, de diez en diez.** La eficacia *es* el número: no hay curva que interpretar.

Cada escalón lleva su descriptor escrito, y esa rúbrica **es el requerimiento**, no un anexo. Sin ella el cambio es un retroceso: un porcentaje sin ancla se elige por sensación, y la sensación fue la que llevó el índice del 5.1 % al 86.6 % en un ciclo.

| | Descriptor | Equivale a |
|---:|---|---|
| **0 %** | No existe. Nadie lo hace. | L0 |
| **10 %** | Reactivo: se hace cuando algo pasa, sin método ni constancia. | L1 |
| **20 %** | Se hace por iniciativa de una persona; se cae si esa persona falta. | |
| **30 %** | Práctica reconocible y repetida, no escrita. | |
| **40 %** | Escrita parcialmente; se aplica de forma desigual entre casos o áreas. | |
| **50 %** | Documentada y repetible; sin evidencia de que se aplique siempre. | L2 |
| **60 %** | Documentada, comunicada y aplicada; el registro es incompleto. | |
| **70 %** | Documentada, comunicada, aplicada y registrada. **Sin medición ni prueba.** | L3 |
| **80 %** | Con una medición o una prueba ejecutada y registrada; los resultados no se revisan. | |
| **90 %** | Medido, revisado periódicamente, y las desviaciones se corrigen. | L4 |
| **100 %** | **Reservado. No seleccionable.** | L5 |

**La regla de oro para calificar**, y es la que hace fácil lo que hoy es una discusión: *el escalón intermedio es «el nivel de abajo, con la evidencia que falta».* `A.8.14 Redundancia` con evidencia «redundancia en AWS, **sin prueba formal de conmutación**» no es 90 %: es **70 %**, y el sistema lo dice solo.

**El 100 % no es seleccionable.** Eficacia 1.0 da `residual = impacto × ARO × (1 − 1) = 0`: el riesgo desaparece del registro. Ningún control elimina un riesgo. El escalón existe en el catálogo por completitud de la escala y por si alguna vez hay que mapear hacia afuera, pero la interfaz no lo ofrece.

---

## 4 · El techo del motor

Además de no ofrecer el 100 %, **el cálculo acota la eficacia en 0.95**, venga de donde venga —de un escalón, de la media agregada de REQ-SIG-21, o de una excepción de madurez sobre el riesgo:

```
e_efectiva = MIN( e, 0.95 )        →        residual ≥ 5 % del inherente
```

Es defensa en profundidad, no redundancia: el catálogo de escalones es editable y la agregación tiene su propia aritmética. El piso del residual tiene que ser una propiedad del motor, no una consecuencia de que nadie haya escrito todavía un 100 en una tabla.

---

## 5 · La traducción de lo que ya existe

La traducción es **por eficacia, no por descriptor**:

```
L0 → 0 %     L1 → 10 %     L2 → 50 %     L3 → 90 %     L4 → 90 %     L5 → 100 %
```

`L3` y `L4` colapsan en 90 % porque 95 no existe en una escala de diez en diez — y porque REQ-SIG-22 §2.2 ya documentó que esos dos grupos hoy no se distinguen de verdad.

**Por qué por eficacia y no por descriptor.** Traducir por descriptor —L3 «definido» → 70 %— sería recalificar 44 controles de un plumazo, y `la aplicación registra y señala; no impide`: **ningún nivel de madurez cambia automáticamente** (REQ-SIG-22 §7). La traducción por eficacia es aritméticamente **neutra**: el índice pasa de ≈86.6 % a ≈84.9 %. Eso es una virtud — nadie podrá decir que el tablero cambió por un truco de escala. Todo el movimiento tiene que venir de la recalificación a mano.

**Y la traducción se marca.** Un control traducido lleva `recalificadoEn = null`, que significa «este número viene de la escala vieja; nadie lo miró con la rúbrica nueva». La pantalla de Madurez lo muestra, y **el índice se reporta dos veces: traducido y recalificado**. La diferencia entre los dos números es la medida de cuánto del tablero sigue descansando en la escala que este requerimiento vino a reemplazar — la misma mecánica que REQ-SIG-22 §3.3 pide para «declarado, no verificado».

---

## 6 · La exigencia, en porcentaje

Dos escaleras sobre la misma escala. La criticidad es un compromiso de **tiempo** (RTO/RPO), así que gobierna la **disponibilidad**; la confidencialidad y la integridad las gobierna su propia valoración (REQ-SIG-23 §3.1, sin cambios).

**Por criticidad** — sólo sobre amenazas que degradan **D**:

| | | Exige al control principal |
|---|---|---|
| **C1** | Crítica continua · RTO ≤ 10 min | **90 % · con verificación vigente** |
| **C2** | Crítica · RTO ≤ 4 h | **90 %** |
| **C3** | Importante · RTO ≤ 24 h | **80 %** |
| **C4** | Estándar · RTO ≤ 72 h | **70 %** |
| **C5** | Sin compromiso | — |

**Por valor** — sobre la dimensión que la amenaza degrada:

| Valor de la dimensión | Exige |
|---|---|
| 5 | **90 %** |
| 4 | **70 %** |
| ≤ 3 | — |

**Sobre D manda el mayor de los dos.** Los dos casos que REQ-SIG-23 §6 usa como criterio se sostienen: `D=5 con C4` → máx(90, 70) = **90 por el valor**; `D=3 con C1` → **90 por la criticidad**, que es el caso que el valor D no detecta solo.

### 6.1 El salto de C1 es la verificación, no cinco puntos más

C1 no exige un número mayor que C2: exige **el mismo número, verificado**. El control principal debe tener una `EjecucionVerificacion` con resultado `CONFORME` en los últimos **12 meses**.

Tres razones, y la tercera es la que decide:

1. **Es auditable sin juicio.** Una verificación existe con su fecha o no existe. No hay escalón que redactar ni discusión que tener. Un 95 % en cambio exigiría escribir un descriptor que se distinga del de 90 % — y si no se distingue en palabras, el evaluador elige el de arriba.
2. **Ataca el modo de falla real.** El problema de MINTRACE producción nunca fue que `A.8.14` estuviera en 90 y no en 95: fue que estaba en 90 **sin prueba de conmutación**.
3. **La brecha vuelve a ser accionable.** «Falta la prueba formal de conmutación de A.8.14» es una tarea con dueño, fecha y costo. «Faltan cinco puntos» no es nada — y con la población actual, una exigencia de 95 % produciría **55 brechas, de las cuales 44 serían de cinco puntos**, enterrando las 11 que importan. Con 90 %, las brechas son 11 y todas son de 40 puntos.

### 6.2 La brecha

```
brecha(activo, amenaza) = exigido − actual_del_principal        (en puntos)
```

Positiva es brecha; cero o negativa, no hay nada que reportar. Y ahora la brecha **se traduce sola al riesgo**: `residual ×= (1 − actual) / (1 − exigido)`. Una brecha de 20 puntos desde 90 % es un residual **tres veces mayor**. Una sola cifra, dos lecturas que no se contradicen.

Cinco estados, y ninguno de ellos es «cero por ausencia»:

| Estado | Cuándo |
|---|---|
| `cubierto` | Hay principal, alcanza lo exigido (y, en C1, tiene verificación vigente) |
| `brecha` | Hay principal y no alcanza. Lleva los puntos que faltan |
| `brecha-de-verificacion` | Alcanza el nivel, pero es C1 y no tiene verificación vigente |
| `sin-exigencia` | Ni la criticidad ni la valoración exigen nada sobre esta amenaza |
| `sin-principal` / `principal-sin-evaluar` | **No se puede evaluar.** Nunca una brecha de cero |

Los dos últimos son hoy el estado de las 57 amenazas: los 272 pares de `ControlAmenaza` siguen con `relevanciaId` en null. Mientras REQ-SIG-21 no corra, la columna Brecha dice «pendiente de clasificar» y remite a ese requerimiento. **Un tablero que afirma con precisión que no hay brechas es el peor resultado posible**, y por eso la ausencia de principal nunca se muestra como cumplimiento.

---

## 7 · La compuerta: de la banda residual a la brecha

Este es el cambio que enciende la maquinaria muerta del §2.2.

**Hoy**: un activo requiere plan cuando su peor residual cae en banda **Crítico** — que es inalcanzable.
**Desde acá**: un activo requiere plan cuando **alguna de sus amenazas tiene brecha**.

El riesgo residual deja de ser la compuerta y pasa a ser la **magnitud**: es lo que ordena la lista, no lo que decide quién entra. Son dos compuertas con dos dueños, y esa separación es deliberada:

- el **dueño del control** cierra brechas — subir el control, o firmar la aceptación;
- el **dueño del riesgo** acepta o trata residuales, contra `CriterioAceptacion`.

Y hay que asumir la consecuencia: **cumplir no implica residual aceptable.** Un activo C4 que cumple exactamente su 70 % carga residual Alto en varias amenazas. El sistema dirá «cumple» y «Alto» a la vez, y eso es verdad, no una inconsistencia.

---

## 8 · Criterios de aceptación

1. `EscalaMadurez` tiene **once filas**, de 0 a 100 de diez en diez, cada una con su descriptor. El motor lee la eficacia **de esa tabla**, no de una constante en el código: cambiar un escalón no es recompilar.
2. Ningún camino de cálculo produce una eficacia efectiva mayor que **0.95**, ni aun con un escalón de 100 %, la agregación de REQ-SIG-21 y una excepción de madurez actuando juntas. `residual ≥ 0.05 × inherente`, siempre.
3. La interfaz **no ofrece el 100 %**.
4. Tras la traducción, el índice de madurez declarado queda entre **84 % y 87 %** — la traducción no mueve el tablero. Y **ningún control cambia de nivel por regla**: los 93 quedan con `recalificadoEn = null`.
5. La pantalla de Madurez reporta **dos índices**: traducido y recalificado. Al arrancar el segundo no existe; ése es el punto.
6. `A.8.14` recalificado de 90 % a **70 %** mueve el residual de `A.24` sobre `TEC-GEN-0004` de **0.45 a 1.50**, y abre una **brecha de 20 puntos** contra la exigencia de C1 — en una sola regeneración y sin tocar nada más.
7. `TEC-GEN-0004` con criticidad **C1** y su principal de disponibilidad en 70 % muestra brecha **20** sobre `A.24` y sobre `E.24`, y la franja dice **«2 brechas, 1 control»**.
8. El mismo activo con criticidad **C5** sigue teniendo brecha: `D=5` exige 90 % por la vía del valor. Cambiar la criticidad no la borra.
9. Un activo con `D=3` y criticidad **C1** tiene brecha si su principal de disponibilidad está bajo 90 %. Es el caso que el valor D no detecta solo.
10. Una amenaza que degrada **sólo C** no recibe exigencia de la criticidad. Verificable con `A.19` sobre un activo C1.
11. Un activo **C1** cuyo principal está en 90 % **sin** `EjecucionVerificacion` `CONFORME` en 12 meses muestra `brecha-de-verificacion`, no `cubierto`. El mismo activo en **C2** muestra `cubierto`.
12. Una amenaza **sin principal designado** no produce brecha ni cumplimiento: dice «pendiente de clasificar» y remite a REQ-SIG-21. Hoy eso cubre las 57.
13. La tarjeta **RESIDUAL CRÍTICO** y la deuda de planes cuentan **brechas**, no bandas residuales. Con los datos de hoy dejan de ser cero.
14. La lista de análisis sigue ordenada por peor residual: la magnitud no cambió de papel.
15. `select count(*)` sobre cualquier tabla antes y después de abrir las pantallas de brecha → igual. La exigencia y la brecha **se calculan al leer**.

---

## 9 · Decisiones

- **D-1 · dónde vive la tabla de exigencia.** Es la D-1 de REQ-SIG-23, todavía abierta. Recomiendo cerrarla ahora a favor del **catálogo editable con bitácora**, `ExigenciaControl`, por una razón nueva: los valores de §6 son criterio del negocio y van a moverse durante el primer ciclo. Mientras no se cree, la tabla vive en `lib/sgsi/exigencia.ts` en **una sola constante**, para que mudarla sea mover una constante y no quince condicionales.
- **D-2 · la ventana de la verificación.** Propongo **12 meses**, alineado con el ciclo de auditoría interna, igual que la D-3 de REQ-SIG-22. Si la revisión por la dirección es semestral, puede ser 6.
- **D-3 · el vínculo control ↔ verificación es por texto.** `Obligacion.controlAnexoA` es un `String` con el código del control («A.8.14»), no una clave foránea. Funciona, y es frágil: un código mal escrito rompe el vínculo en silencio. Recomiendo que la lectura **falle diciendo el código** cuando no resuelve, en vez de devolver «sin verificación».

---

## 10 · Lo que no entra

- **Recalibrar las bandas de riesgo** (`UmbralRiesgo`). Con la compuerta movida a la brecha ya no es urgente, y tocar las dos cosas a la vez haría imposible atribuir el cambio del tablero a una de ellas. Queda como decisión separada, con el residual funcionando primero.
- **Recalificar los 93 controles.** Es trabajo de criterio del SIG con cada líder de proceso, a mano y con bitácora — REQ-SIG-22 §3.2, ahora con el instrumento correcto. Este requerimiento entrega la escala y la marca de «sin recalificar»; no mueve un solo nivel.
- **Asignar las 272 relevancias.** Es REQ-SIG-21 y sigue siendo el prerequisito para que la brecha sea evaluable.
- **Cambiar la frecuencia de ninguna amenaza.** El caso `A.24` sobre un activo con RTO ≤ 10 min —una denegación de servicio parametrizada «una vez al año» para todos los activos— es real y ninguna escala de madurez lo arregla. Va aparte.
- **Bajar niveles automáticamente**, ni por regla ni por migración. La madurez la mueve una persona, con evidencia y bitácora.
