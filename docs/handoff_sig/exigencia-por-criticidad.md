# Requerimiento · La exigencia · qué nivel de control pide cada activo

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-23 · exigencia por criticidad |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-11 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo |
| **Secuencia** | **Tercero de tres.** No arranca hasta que REQ-SIG-21 y REQ-SIG-22 hayan corrido |
| **Depende de** | REQ-SIG-20 §11 (la columna de criticidad) · REQ-SIG-21 (el control principal designado) · REQ-SIG-22 (la madurez verificada) |
| **Estado** | D-1 y D-2 abiertas |

---

## 1 · Objetivo

Hoy el sistema sabe **qué tan bien** implementamos cada control. No sabe **qué tan bien lo necesita** cada activo, y por eso no puede decir que algo falta.

Este requerimiento agrega el término que falta: **la exigencia.** Con él, la frase que hoy no se puede escribir queda escrita sola:

```
MINTRACE producción · criticidad C1 (RTO ≤ 10 min)
   exige A.8.14 Redundancia en L4      la organización está en L1
   ▸ brecha de tres niveles  ▸ plan de tratamiento o aceptación firmada
```

Eso es el plan de las dos regiones, dicho por el sistema en vez de por una reunión.

---

## 2 · Por qué va tercero

Los tres términos de la resta tienen que existir y ser verdaderos antes de restar:

| Término | Lo trae | Sin él |
|---|---|---|
| **Qué activo exige cuánto** | REQ-SIG-20 §11 · la columna de criticidad | No hay exigencia que comparar |
| **Cuál es el control que cuenta** | REQ-SIG-21 · el principal designado | La exigencia caería sobre los siete controles por igual y no diría nada |
| **Cuál es el nivel real** | REQ-SIG-22 · la madurez verificada | La brecha se calcularía contra un número que no se sostiene, y daría cero justo donde más duele |

**Arrancar este requerimiento antes produce el peor resultado posible**: un tablero que afirma con precisión que no hay brechas.

---

## 3 · La regla

### 3.1 Cada dimensión tiene su propio conductor

La criticidad es un compromiso de **tiempo** —RTO y RPO— así que gobierna la **disponibilidad**. La confidencialidad y la integridad las gobierna su propia valoración. Mezclarlas produciría el disparate de exigir cifrado de grado militar porque el servicio no tolera caídas.

| Conductor | Exige en el control **principal** de las amenazas que degradan… | Nivel exigido |
|---|---|---|
| Criticidad **C1** · RTO ≤ 10 min | **D** | **L4** |
| Criticidad **C2** · RTO ≤ 4 h | **D** | **L4** |
| Criticidad **C3** · RTO ≤ 24 h | **D** | L3 |
| Criticidad **C4** · RTO ≤ 72 h | **D** | L3 |
| Criticidad **C5** · sin SLA | **D** | — |
| Valor **C = 5** | **C** | L4 |
| Valor **C = 4** | **C** | L3 |
| Valor **I = 5** | **I** | L4 |
| Valor **I = 4** | **I** | L3 |
| Valor **D = 5** | **D** | L4 |
| Valor **D = 4** | **D** | L3 |

**Sobre las amenazas que degradan D, el nivel exigido es el mayor entre lo que pide el valor D y lo que pide la criticidad.** Así los dos aportan y ninguno tapa al otro:

- `D=5` con `C4` → exige L4 por el valor. Perder el activo es catastrófico aunque se pueda esperar tres días.
- `D=3` con `C1` → exige L4 por la criticidad. La pérdida es moderada pero **no se tolera ni diez minutos**, y eso solo lo dice la criticidad.

Ahí está lo que la columna de criticidad agrega y el valor D no podía dar solo.

### 3.2 Una amenaza degrada una dimensión si su degradación no es «No aplica»

No hace falta un catálogo nuevo: `AmenazaDegradacion` ya dice, por amenaza y dimensión, qué fracción destruye. Una amenaza cuenta para la dimensión `d` cuando su degradación en `d` es mayor que cero.

`A.24 Denegación de servicio` degrada D en «Muy alta» y no toca I ni C, así que la criticidad la gobierna entera. `A.11 Acceso no autorizado` degrada I y C y no toca D, así que la criticidad no le aplica y quien manda son los valores I y C.

### 3.3 La exigencia es sobre el principal, y solo sobre él

No sobre los siete controles de la amenaza. El principal es, por definición del catálogo, «sin este control la amenaza no se contiene»: es el único cuyo nivel determina el techo de la eficacia (REQ-SIG-21 §4), y por tanto el único cuya insuficiencia es una brecha real.

**Si la amenaza no tiene principal designado, no hay exigencia que evaluar.** Se lista como «pendiente de clasificar» y remite a REQ-SIG-21 §6. Nunca se inventa un principal por defecto.

---

## 4 · La brecha y dónde se ve

```
brecha(activo, amenaza) = nivel_exigido − nivel_actual_del_principal
```

Positiva es una brecha; cero o negativa, no hay nada que reportar.

### 4.1 En la ficha del activo

Una franja en la pestaña Amenazas, encima de las filas, cuando alguna tenga brecha:

```
⚠  Este activo exige más de lo que la organización alcanzó · 2 brechas

   A.24 Denegación de servicio     exige L4  ·  A.8.14 está en L1  ·  brecha 3
   E.24 Agotamiento de recursos    exige L4  ·  A.8.14 está en L1  ·  brecha 3
                                            [ Registrar plan o aceptación → ]
```

**Las dos brechas son el mismo control.** La franja lo dice —«2 brechas, 1 control»— porque subir A.8.14 las cierra las dos, y ése es exactamente el argumento que hace comprable la segunda región.

### 4.2 En la lista de activos en análisis

Una columna **Brecha** en la página de REQ-SIG-20 §5.2, y una tarjeta más en la ficha de resumen: **«Con brecha de control · n»**. Filtrable.

### 4.3 En el plan de tratamiento

Un control con brecha aparece con **qué activos la producen y cuál es la mayor exigencia** que recibe:

```
A.8.14 Redundancia de las instalaciones        actual L1  ·  exigido L4
  lo exigen 3 activos:  TEC-GEN-0004 (C1)  TEC-EQU-0003 (C1)  TEC-SER-0051 (C2)
  cierra 7 riesgos
```

Es la vista que convierte la brecha en una decisión de compra: un control, tres activos que lo piden, siete riesgos que se cierran.

---

## 5 · Cómo se guarda

**Nada de esto se almacena.** La exigencia es una función de la criticidad y de la valoración; la brecha es una resta. Las dos se calculan al leer, como todo lo derivable en este sistema.

Lo único que se persiste es **la tabla de la regla** (§3.1), en `Parametro` o en un catálogo propio, para que cambiar «C2 exige L4» no sea recompilar. Es la decisión **D-1**.

---

## 6 · Criterios de aceptación

1. `TEC-GEN-0004` con criticidad `C1` y `A.8.14` en L1 muestra brecha **3** sobre `A.24` y sobre `E.24`, y la franja dice **«2 brechas, 1 control»**.
2. El mismo activo con criticidad `C4` muestra brecha **por el valor D=5**, no por la criticidad. Cambiar la criticidad a `C5` **no** elimina la brecha: `D=5` sigue exigiendo L4.
3. Un activo con `D=3` y criticidad `C1` **tiene brecha** si su principal de disponibilidad está bajo L4. Es el caso que el valor D no detecta solo.
4. Una amenaza que degrada **solo C** no recibe exigencia de la criticidad. Verificable con `A.19 Divulgación de información` sobre un activo `C1`.
5. Una amenaza **sin principal designado** no produce brecha: aparece como «pendiente de clasificar» y remite a REQ-SIG-21.
6. Subir `A.8.14` de L1 a L4 **cierra las brechas de los tres activos en una sola regeneración**, y el plan lo refleja sin tocar nada más.
7. Cambiar la tabla de la regla —que `C2` exija L3 en vez de L4— mueve las brechas **sin recompilar**.
8. `select count(*)` sobre cualquier tabla antes y después de abrir las pantallas de brecha → igual. No se persiste nada.

---

## 7 · Decisiones

- **D-1 · dónde vive la tabla de la regla.** `Parametro` con un JSON, o un catálogo `ExigenciaControl` con sus filas. Recomiendo el catálogo: se edita desde la interfaz y queda con bitácora, igual que los umbrales.
- **D-2 · qué pasa cuando la brecha se acepta.** Una `AccionPlan` de tipo `ACEPTAR` sobre el control, ¿silencia la franja del activo, o la deja visible marcada como «aceptada»? Recomiendo **dejarla visible y marcada**: la brecha sigue existiendo, lo que cambió es que hay una decisión firmada encima. Silenciarla reproduciría el problema que REQ-SIG-22 vino a cerrar.

---

## 8 · Lo que no entra

- **Cambiar la valoración ni la criticidad de ningún activo.** Este requerimiento las lee.
- **Bajar madureces.** Es REQ-SIG-22 y se hace a mano.
- **Exigir sobre controles que no son el principal.** El techo de la eficacia solo depende del principal; extender la exigencia a los complementarios produciría brechas que no mueven ningún riesgo.
- **Una exigencia por activo escrita a mano.** La regla se deriva de criticidad y valoración, que ya son datos del activo. Una tabla de 299 × 93 excepciones es exactamente lo que este diseño evita.
