# Dos acentos: riesgo alto sin plan, y deuda de madurez — Especificación y diseño

**Fecha:** 2026-09-22
**Código:** PLA-SIG-02 / REQ-SIG-24 §7 · grilla «Análisis de riesgos» y popup «Planes de tratamiento»
**Versión:** 1.0
**Módulo:** SGSI — Valoración y tratamiento del riesgo
**Afecta:** `lib/sgsi/alto-sin-plan.ts` (nuevo), `lib/sgsi/analisis-riesgos.ts`, `lib/sgsi/columnas-analisis.ts`, `app/globals.css`, `app/components/sgsi/valoracion-riesgos/PopupPlanesActivo.tsx`
**Estado:** Diseñado, sin implementar · **bloqueado por coordinación** (ver §9)

---

## 1. Qué se pide

Que el renglón se marque en rojo cuando una amenaza en banda **Alto** —y por extensión
**Crítico**— todavía no tiene plan. En los dos sitios donde se ve esa información: la fila del
activo en la grilla de Análisis, y la fila de la amenaza dentro del popup de planes.

---

## 2. El obstáculo: ya hay un rojo, y dice otra cosa

`claseDeFila` (`lib/sgsi/columnas-analisis.ts:159-164`) pinta hoy:

```ts
if (fila.estadoPlan === 'pendiente') clases.push(CLASE_FILA_ALARMANTE);
```

Y `estadoPlan === 'pendiente'` se decide por **brecha de control** (`analisis-riesgos.ts:300-327`):
hay al menos un riesgo cuya exigencia supera el nivel del control principal, y ningún plan activo
lo cubre. **La banda residual no interviene.**

Las dos frases marcan activos distintos, y se cruzan en las cuatro combinaciones:

| Residual del activo | Brecha de control | Hoy | Se pide |
|---|---|---|---|
| Alto o Crítico, sin plan | sí | rojo | rojo |
| Alto o Crítico, sin plan | **no** | **sin acento** | **rojo** ← lo que falta |
| Medio o menos | sí, sin cubrir | rojo | debería distinguirse |
| Alto o Crítico, con plan | no | sin acento | sin acento |

El segundo renglón es el vacío que el pedido señala: un riesgo residual alto que **no** viene de
una brecha de madurez —porque el control ya alcanza lo exigido y aun así el riesgo queda alto—
hoy no se marca de ninguna forma. Es justamente el caso que ISO/IEC 27001 6.1.3 no deja pasar sin
una decisión escrita.

El tercero es el que obliga a decidir: si el rojo pasa a significar sólo lo nuevo, **se pierde**
un aviso que hoy existe.

### 2.1 · «Crítico» no existe en los datos, y el residual ya se probó como compuerta

Añadido el 2026-09-22, sobre una medición ajena verificada contra el código.

Medido contra las 34.914 filas de `riesgo_calculo` en la base local del 2026-09-21:

```
banda Crítico empieza en   25.0000     (umbral_riesgo)
máximo residual real       13.0000
reparto   Alto 191 · Medio 6.957 · Bajo 27.766 · Crítico 0
```

**Hoy no hay ninguno. Pero es un estado, no una imposibilidad** — y la primera versión de este
párrafo decía lo contrario.

`lib/sgsi/__tests__/eficacia-agregada.test.ts:100-105` prueba, sobre el mismo `calcularRiesgo`
que alimenta este residual, que con la regla `ponderada-acotada` un control principal flojo sí
llega:

| Principal | Residual | Banda |
|---|---|---|
| 10 % | 25.60 | **Crítico** |
| 0 % | 28.80 | **Crítico** |

**Lo que hoy lo impide es que ninguno de los 57 controles principales está en madurez baja.**
Están repartidos en escalones altos —30 «documentada y registrada», 19 «medido y revisado», 8
«documentada y repetible»— y llegar a Crítico exigiría un principal al 10 % o al 0 %. Es un
estado de los datos, no una propiedad del modelo: el día que se evalúe un principal flojo, o que
un control decaiga, aparecen los críticos.

**Dos avisos sobre este párrafo, porque ya se escribió mal dos veces.** La primera versión decía
que la escala no permitía llegar a Crítico —falso—. La segunda atribuía la causa a que los 272
pares de `ControlAmenaza` seguían sin `relevanciaId` —también falso: están todos asignados, 57
como principal—. Esta tercera versión viene de una medición con `psql` de otra sesión que **no
se pudo verificar desde aquí** (no hay `psql` en este entorno y Prisma 7 no instancia sin
adaptador). Si alguien la usa para decidir algo, que la vuelva a medir.

Y el dato que la desmiente sigue escrito en el código: `lib/sgsi/analisis-riesgos.ts:113` afirma
que «los 272 pares siguen con `relevanciaId` en null». **Ese comentario está obsoleto** y es la
fuente del error.

Dos consecuencias para este spec:

1. **Decir «Alto o Crítico» es hoy decir «Alto».** El predicado sigue incluyendo Crítico —y ahora
   se sabe que no es por prudencia sino porque llegará— pero **ningún ejemplo, prueba o texto de
   pantalla debe sugerir que hoy hay riesgos críticos**, y ninguno puede afirmar que no pueda
   haberlos.
2. **El residual ya se descartó una vez como compuerta, y por esto mismo.** `estadoPlanDe` se
   cambió de residual a brecha en REQ-SIG-24 §7 —el comentario está en
   `analisis-riesgos.ts:294`— justamente porque una compuerta sobre una banda que nadie alcanza
   no dispara nunca.

**Esto no invalida el diseño, pero cambia su tamaño.** Un acento rojo por residual Alto sin plan
sí dispara: hay 191 riesgos en Alto. Lo que no se puede es presentarlo como la compuerta que
reemplaza a la de brecha — sería repetir el movimiento que ya se deshizo. Por eso la decisión de
§3 (dos acentos, conservando el de brecha) no sólo es la más prudente: es la única que no
contradice REQ-SIG-24 §7.

**Y hay una consecuencia que este spec no resuelve pero conviene anticipar:** el día que se
asignen las relevancias, el tablero pasa de cero críticos a tenerlos **de golpe y sin que nadie
haya tocado esta pantalla**. Conviene que quien haga esa asignación lo sepa, porque el salto se
va a leer como un deterioro repentino del riesgo y no lo es: es el modelo empezando a funcionar.

---

## 3. Decisión: dos acentos, no uno

Se descartó reemplazar (pierde el aviso de brecha) y se descartó la unión (un solo rojo para dos
problemas distintos, sin forma de saber cuál tiene el activo).

| Acento | Significa | Clase |
|---|---|---|
| **Rojo** | Hay riesgo residual **Alto o Crítico** sin plan que lo cubra | `fila-alarmante` |
| **Ámbar** | Hay **brecha de control** sin cubrir, y ningún residual Alto ni Crítico suelto | `fila-brecha-pendiente` |

**Nunca los dos a la vez.** Cuando ambas condiciones se cumplen gana el rojo: es el problema más
grave y el que manda la acción. Un renglón con dos acentos no es más informativo, es ilegible.

**`fila-alarmante` conserva su nombre y estrecha su significado.** Hoy dice «requiere plan y no lo
tiene» por brecha; pasa a decir «queda riesgo alto sin tratar». Es un cambio de semántica sobre
una clase que ya está en uso, y por eso hay que tocar el comentario de `globals.css:354` que la
describe: dejarlo como está sería documentación que miente.

---

## 4. El criterio vive en un solo sitio

El defecto que este repo ya pagó tres veces es **dos piezas contando lo mismo desde orígenes
distintos**. La grilla y el popup van a hacerse la misma pregunta, así que la pregunta se escribe
una vez.

**Nuevo módulo `lib/sgsi/alto-sin-plan.ts`** — puro, sin Prisma, sin React, sin AG Grid:

```ts
/// Las bandas que no se pueden dejar sin plan. Se muda acá desde `columnas-analisis.ts`,
/// donde era `BANDAS_ALARMANTES`, para que la grilla y el popup lean LA MISMA lista.
export const BANDAS_ALARMANTES: readonly string[] = ['Crítico', 'Alto'];

export function esBandaAlarmante(banda: string | null): boolean;

/// Una amenaza suelta: la que usa el popup, fila por fila.
export function esAmenazaAlarmanteSinPlan(a: { banda: string | null; tienePlan: boolean }): boolean;
```

`columnas-analisis.ts` deja de declarar `BANDAS_ALARMANTES` y lo importa. `esResidualAlarmante`
se queda donde está —opera sobre `NivelRiesgo`, que es un tipo de la grilla— pero pasa a apoyarse
en `esBandaAlarmante`.

---

## 5. La grilla

### 5.1 `FilaAnalisis` gana un campo

```ts
/// REQ-SIG-24 §7 · hay al menos un riesgo vigente en banda Alto o Crítico que ningún plan
/// activo cubre. Es UNA PREGUNTA DISTINTA de `estadoPlan`: ésa mira la brecha del control,
/// ésta el riesgo que queda. Un activo puede tener el control al día y el residual alto.
altoSinPlan: boolean;
```

Se calcula en `filasAnalisis`, al lado de `estadoPlanDe`, con lo que ya está ahí: `r.residual`
clasificado contra `bandas`, y el mismo `resolver: ResolverDeudaPlan` que responde si un plan
activo cubre ese `(activo, amenaza, principal)`. **No se agrega ninguna consulta**: los dos datos
ya viajan a esa función.

Sin `resolver` —el caso en que la pantalla no sabe qué planes hay—, `altoSinPlan` es `false`, por
la misma doctrina que hace que `estadoPlan` sea `sin-determinar` y no `pendiente`: «no miré» no es
«falta».

### 5.2 `claseDeFila`

```ts
if (fila.altoSinPlan) clases.push(CLASE_FILA_ALARMANTE);
else if (fila.estadoPlan === 'pendiente') clases.push(CLASE_FILA_BRECHA);
```

### 5.3 El CSS, fuera de capa

```css
.ag-row.fila-brecha-pendiente,
.ag-row.fila-brecha-pendiente .ag-cell {
  background-color: var(--hf-warn-100);
}
```

**Va junto a `.ag-row.fila-alarmante` y fuera de `@layer`**, por la razón escrita en
`globals.css:338-349`: AG Grid inyecta su tema sin capa, y el CSS sin capa gana a cualquier CSS en
capa sin importar la especificidad. Esa regla vivió dentro de `@layer components` del 21 al 22 de
septiembre y **nunca pintó** — con la clase aplicada, la variable definida y la prueba de clases
en verde. Repetir ese error acá es gratis si no se lee el comentario.

---

## 6. El popup

`PopupPlanesActivo.tsx` ya tiene por fila lo que hace falta: `a.bandaResidual` y
`a.planExistente`. No requiere nada del servidor.

```tsx
const alarmante = esAmenazaAlarmanteSinPlan({
  banda: a.bandaResidual,
  tienePlan: a.planExistente !== null,
});
```

La fila lleva fondo `var(--hf-danger-bg)` y la celda de residual en negrita. **No lleva ámbar**:
el popup no conoce el estado de brecha del activo entero, y el ámbar es una afirmación sobre el
activo, no sobre la amenaza.

**El color no es el único portador.** La banda sigue escrita en palabras en su columna y el plan
en la suya, igual que en la grilla. Es la regla que ya sostiene estas dos pantallas.

---

## 7. Pruebas · Regla 1 del harness

Cada una en rojo antes del código.

| # | Qué prueba | Dónde |
|---|---|---|
| P1 | `esBandaAlarmante` es cierto para «Alto» y «Crítico», falso para «Medio» y para `null` | `alto-sin-plan.test.ts` |
| P2 | `esAmenazaAlarmanteSinPlan`: Alto sin plan sí; Alto con plan no; Medio sin plan no | `alto-sin-plan.test.ts` |
| P3 | `filasAnalisis` marca `altoSinPlan` con un riesgo en Alto sin plan **aunque `estadoPlan` sea `no-requiere`** — el caso que hoy no se ve | `analisis-riesgos.test.ts` |
| P4 | `filasAnalisis` no lo marca cuando ese Alto ya tiene plan | `analisis-riesgos.test.ts` |
| P5 | Sin `resolver`, `altoSinPlan` es `false` | `analisis-riesgos.test.ts` |
| P6 | `claseDeFila` da rojo cuando `altoSinPlan` | `columnas-analisis.test.ts` |
| P7 | `claseDeFila` da ámbar cuando `pendiente` y **no** `altoSinPlan` | `columnas-analisis.test.ts` |
| P8 | Con las dos condiciones, sale rojo y **no** sale ámbar | `columnas-analisis.test.ts` |
| P9 | En el popup, la fila de una amenaza en Alto sin plan lleva el acento; la que tiene plan no | `PopupPlanesActivo.test.tsx` (nuevo) |

P3 es la prueba del pedido. P8 es la que impide el renglón de dos colores.

**Ninguna de estas nueve ve si el color aparece en pantalla.** Es literalmente la cicatriz de
`globals.css`: la prueba de clases seguía verde con las filas en blanco. Por eso la sección 8 no
es opcional.

---

## 8. Recorrido de punta a punta · Regla 3

Aplica. Y la parte de la grilla **va al runner**, no a mano, porque ya existe el sitio:
`e2e/analisis-riesgos.spec.ts` afirma el **color calculado** (`getComputedStyle`), no la clase,
exactamente por esta razón.

```
Paso nuevo en e2e/analisis-riesgos.spec.ts:
  · un activo con residual Alto y plan pendiente -> background rgb del rojo
  · un activo con brecha pendiente y residual Medio -> background rgb del ámbar
  · los dos rgb son DISTINTOS entre sí y distintos del fondo normal

A mano, contra la base real:
  1. Abrir /sgsi/analisis-riesgos      -> conviven filas rojas y ámbar
  2. Abrir el popup de una fila roja   -> la amenaza en Alto sin plan sale marcada
  3. Registrar el plan de esa amenaza  -> al volver, la fila deja de estar roja
  4. Abrir el popup de una fila ámbar  -> ninguna amenaza marcada (no hay Alto suelto)
```

El paso 3 es el que prueba que el acento responde al estado y no es una pintura fija.

---

## 9. Riesgos, y la colisión que hay que resolver antes

**Tres de los cinco archivos tienen trabajo sin commitear de `indicadores-75`** (AG Grid en la
grilla de análisis), a 2026-09-22:

| Archivo | Quién lo tiene |
|---|---|
| `lib/sgsi/columnas-analisis.ts` | indicadores-75, modificado |
| `app/globals.css` | indicadores-75, modificado |
| `e2e/analisis-riesgos.spec.ts` | indicadores-75, sin seguir |

**Esto no se implementa hasta acordarlo con esa sesión.** Se le avisó por el canal de
coordinación. Lo que sí se puede escribir sin tocarla: `lib/sgsi/alto-sin-plan.ts` con P1 y P2, y
el cambio del popup con P9 — ninguno de los dos es archivo suyo.

**`tsc --noEmit` está rojo en el árbol** por esa misma rama a medio hacer
(`analisis-riesgos.query.ts:231-232` y la prop `encabezado` de `GrillaAnalisis`). Mientras siga
así, `npm run verificar` no puede dar verde y la Regla 2 no se puede cumplir. No es un defecto de
este cambio, pero sí lo bloquea.

**El ámbar y el rojo tienen que distinguirse en la práctica**, no sólo en el nombre de la
variable. `--hf-warn-100` y `--hf-danger-bg` son los dos fondos claros de la paleta; hay que
verlos uno junto al otro en la grilla real antes de mergear, y decirlo en el PR.
