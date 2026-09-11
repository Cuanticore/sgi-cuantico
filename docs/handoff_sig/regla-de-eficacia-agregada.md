# Requerimiento · La eficacia agregada se calcula con la regla aprobada

| Campo | Contenido |
|---|---|
| **Código** | REQ-SIG-21 · regla de eficacia agregada |
| **Versión** | 1.0 |
| **Fecha** | 2026-09-11 |
| **Solicitante** | Líder del Sistema Integrado de Gestión |
| **Destinatario** | Equipo de desarrollo + líder del SIG (el grueso es criterio, no código) |
| **Gobierna** | `MET-SIG-01 Metodología v3 §7.4` |
| **Toca** | `lib/sgsi/madurez.ts` · `lib/sgsi/riesgos.ts` · `ControlAmenaza.relevanciaId` · el detalle del riesgo |
| **Secuencia** | **Primero de tres.** REQ-SIG-22 y REQ-SIG-23 se apoyan en éste |
| **Estado** | D-1 a D-4 abiertas · **ninguna bloquea el arranque** |

---

## 1 · Objetivo

**No cambiar el método: ejecutarlo.**

MET-SIG-01 v3 §7.4 define cómo se combina la eficacia cuando varios controles mitigan una misma amenaza. La herramienta implementa esa regla y **la tiene apagada**, así que los riesgos residuales que alimentan el plan de tratamiento y la revisión por la dirección salen de la regla v2 que la v3 reemplazó.

No es una mejora. Es una **brecha de conformidad**: se calcula por un método distinto del aprobado.

---

## 2 · El hallazgo

### 2.1 Lo que la metodología manda

> «La media simple **esconde el eslabón débil**. Cuántico usa una media ponderada por la relevancia de cada control, **acotada por el control principal**.»
>
> «**El techo es lo esencial de la regla**: los controles secundarios acompañan al principal, no lo sustituyen. Si el control principal de una fuga de información es la prevención de fuga de datos y está en L2, la eficacia de esa amenaza no puede superar el 55 %, por muy maduras que estén las políticas, la concienciación y la red. El techo solo actúa cuando el principal está débil; cuando está fuerte no interviene.»

El documento habla **en presente** —«Cuántico usa»— describiendo algo que la herramienta no hace.

### 2.2 Lo que el código hace

`lib/sgsi/madurez.ts:163` implementa la regla **completa y correcta**:

```ts
e(t) = MIN( Σ(wᵢ · eᵢ) / Σwᵢ , e_principal + δ )
```

Y `riesgos.ts:59-63` la alimenta con el peso y la marca de principal de cada par. El problema no es el algoritmo.

### 2.3 El dato que la apaga

**Los 272 pares de `ControlAmenaza` tienen `relevanciaId` en null.** Verificado sobre `prisma/data/relevancia-pendiente.csv`: **272 filas, 272 con la columna RELEVANCIA vacía.**

Sin relevancia: `peso = 1` para todos y `controles.find(c => c.esPrincipal)` devuelve `undefined`, así que `eficaciaAmenaza` retorna la media ponderada **sin aplicar el techo**. Es decir, una media simple — exactamente lo que §7.4 descarta.

La nota de diseño de `prisma/seeds/iso.ts:216` lo explica y era razonable: la relevancia fue obligatoria primero, la tabla quedó vacía, toda amenaza leyó «sin controles», y los 2.256 residuales salieron «sin calcular». El null se introdujo como interino explícito. **Este requerimiento cierra ese interino.**

---

## 3 · La evidencia

### 3.1 El modelo no reacciona cuando el control clave se degrada

Caso `A.11 Acceso no autorizado` sobre un activo de inherente 32, moviendo **solo** el nivel del control principal:

| Principal | Media plana (hoy) | Con techo |
|---|---|---|
| L4 | 93.6 % → 2.06 Medio | 93.5 % → 2.09 Medio |
| L3 | 92.9 % → 2.29 Medio | 92.3 % → 2.46 Medio |
| **L2** | 87.1 % → **4.11 Medio** | 55.0 % → **14.40 Alto** |
| **L1** | 81.4 % → **5.94 Alto** | 15.0 % → **27.20 Crítico** |
| **L0** | 80.0 % → **6.40 Alto** | 5.0 % → **30.40 Crítico** |

Si el control de acceso colapsara a L0 —no existe— el modelo de hoy diría que el riesgo pasó de 2.06 a 6.40. La verdad es que vuelve a **30.40, prácticamente el inherente de 32**.

### 3.2 Y es peor mientras mejor documentada esté la amenaza

Con media plana sobre *n* controles, que uno caiga de L4 a L0 mueve la eficacia como mucho `0.95 / n`:

| Controles mapeados | Caída máxima | Residual máximo alcanzable |
|---:|---:|---:|
| 3 | 31.7 pp | 40 % del inherente |
| 5 | 19.0 pp | 28 % |
| 7 | 13.6 pp | 22 % |
| 8 | 11.9 pp | 20 % |

**La amenaza mejor mapeada es la que más cuesta marcar como descontrolada.** El promedio diluye el eslabón roto.

### 3.3 Dónde estamos hoy

| | |
|---|---:|
| Amenazas con controles mapeados | 57 de 57 |
| Amenazas con relevancia asignada | **0** |
| Rango de eficacia resultante | 12.5 % a 94.4 % |
| Amenazas con eficacia ≥ 50 % | 50 de 57 |
| Amenazas cuyo control más débil está en L2 | 27 de 57 |

---

## 4 · Los pesos pasan a 70 / 20 / 10, **sobre** el techo

Los pesos actuales `3 / 2 / 1` se normalizan por la **cantidad** de controles de cada clase, así que agregar controles de apoyo diluye al principal. Con un presupuesto fijo por clase el principal aporta siempre 70 %, tenga la amenaza tres controles o nueve.

```
e_bruta(t) = 0.70 · media(principal) + 0.20 · media(secundarios) + 0.10 · media(complementarios)
e(t)       = MIN( e_bruta , e_principal + δ )
```

**El techo no es opcional y hay que decir por qué.** Sin él, 70/20/10 introduce un **piso incondicional del 30 %**: con el principal en L0 —el control no existe— la eficacia todavía lee 28 %, porque las otras dos clases aportan su presupuesto pase lo que pase. Reintroduce el enmascaramiento por otra puerta.

Medido sobre el mismo caso de §3.1:

| Principal | 70/20/10 **sin** techo | 70/20/10 **con** techo |
|---|---|---|
| L4 | 94.5 % → 1.76 Medio | 94.5 % → 1.76 Medio |
| L2 | 63.0 % → 11.84 Alto | 55.0 % → 14.40 Alto |
| L1 | 35.0 % → 20.80 Alto | 15.0 % → **27.20 Crítico** |
| **L0** | **28.0 % → 23.04 Alto** | 5.0 % → **30.40 Crítico** |

**Reglas de borde:**

- **Una clase vacía no reparte su presupuesto.** Si la amenaza no tiene complementarios, se renormaliza sobre las clases presentes (70/20 → 77.8/22.2). Repartir el 10 % huérfano entre las otras premiaría no clasificar.
- **Sin principal designado, no hay regla v3.** La amenaza cae al camino v2 —media simple, sin techo— y la pantalla lo dice (§7). Un principal es obligatorio para subir a v3; el catálogo ya lo exige: «cada amenaza tiene exactamente uno».
- **Dos principales es un error de datos**, no un caso a promediar. Se rechaza al guardar.

**Esto sí es cambio de código**, no solo dato: hoy `eficaciaAmenaza` promedia por control y hay que promediar **dentro de cada clase** y luego combinar por presupuesto. Es la única función que cambia.

Y como cambia §7.4, **la metodología se actualiza por `PRO-CAL-01`** con su solicitud, aprobación y acta. Es la decisión **D-1**: sin ese trámite el software quedaría calculando por una regla que el documento no respalda, que es justo el problema que este requerimiento cierra.

---

## 5 · El δ se queda en 0.05

`delta_techo_eficacia` ya es `Parametro` y hoy vale `0.05`. «Que mande solo el principal» sería `δ = 0`.

**No cambia ninguna banda.** Entre 0.05 y 0 la diferencia es de un punto porcentual y en el caso de §3.1 las dos columnas dan la misma banda en los cinco escenarios. **Se deja en 0.05, que es el valor aprobado**, y no se abre una discusión que no mueve el resultado. Es la decisión **D-2**.

---

## 6 · Asignar la relevancia · el grueso del trabajo

272 pares, columna `RELEVANCIA` de `prisma/data/relevancia-pendiente.csv`. **No es desarrollo: es criterio.** El archivo ya trae amenaza, control, nombre del control, aplicabilidad, madurez actual y cuántos controles tiene esa amenaza.

Los tres valores, con el criterio que el catálogo ya declara:

| Valor | Presupuesto | Criterio (de `RelevanciaControl.criterio`) |
|---|---:|---|
| **Principal** | 70 % | «Sin este control la amenaza no se contiene. Cada amenaza tiene exactamente uno» |
| **Complementario** | 20 % | «Reduce la amenaza de forma sustantiva, pero no sustituye al principal» |
| **De apoyo** | 10 % | «Ayuda por vía administrativa o cultural» |

**Por etapas, no las 272 de una.** El orden sale del riesgo que cada amenaza genera:

| Etapa | Qué | Pares | Para qué |
|---|---|---:|---|
| 1 | Las amenazas que producen inherentes **Crítico y Alto** sobre los activos de valor 4 y 5 | ~30 | Cambia el tablero de los 37 activos que importan |
| 2 | El resto de las amenazas con inherente **Medio** | ~110 | Completa las matrices |
| 3 | Las demás | ~130 | Cierra el ciclo |

Cada amenaza es **todo o nada**: se sube a v3 cuando tiene su principal designado y todos sus pares clasificados. Media clasificación es peor que ninguna, porque la media ponderada sobre pesos incompletos no significa nada.

---

## 7 · La pantalla dice con qué regla se calculó

Hoy no se distingue una amenaza v2 de una v3, y **por eso el problema es invisible**. En el detalle del riesgo:

**Amenaza sin relevancia (las 57 de hoy):**

```
┌─ E.19 Fugas de información ───────────────────────── eficacia 76.7 % ──┐
│  ⚠  Sin relevancia asignada · media simple (MET-SIG-01 v2)             │
│     Los 6 controles pesan igual y el techo del principal no opera.     │
│     El método aprobado es la media ponderada acotada (v3 §7.4).        │
│                                        [ Asignar relevancia → ]        │
└────────────────────────────────────────────────────────────────────────┘
```

**Amenaza con relevancia:** el desglose por grupos, rampa ordinal de un solo tono —los tres pasos `#93b4e0`, `#4874c2`, `#1b3a8a` pasan el validador contra el blanco— con el techo dibujado siempre, actúe o no:

```
┌─ A.24 Denegación de servicio · TEC-GEN-0004 ──────── eficacia 91.0 % ──┐
│  0%                    50%                      techo 95%        100%  │
│  ├──────────────────────┼────────────────────────────┃─────────────┤   │
│  ███████████████████████████████████▊▊▊▊▊▊▊▊▊░░░░░                     │
│  └──── principal 63.0 ────┘└ secund. 18.5 ┘└ comp. 9.5 ┘               │
│                                                                        │
│  ███ PRINCIPAL · 70 %                                  aporta 63.0 pp  │
│      A.8.14  Redundancia de las instalaciones                    [L3]  │
│              Sin este control la amenaza no se contiene                │
│  ▊▊▊ SECUNDARIO · 20 %                                 aporta 18.5 pp  │
│      A.8.6   Gestión de la capacidad                             [L3]  │
│      A.8.20  Seguridad de las redes                              [L4]  │
│  ░░░ COMPLEMENTARIO · 10 %                             aporta  9.5 pp  │
│      A.5.26  Respuesta a los incidentes de seguridad             [L4]  │
└────────────────────────────────────────────────────────────────────────┘
```

**Cuando el techo actúa, la barra se corta y lo dice** — es el momento en que la pantalla gana su sueldo:

```
│  0%     techo 15%                                                100%  │
│  ├────────┃─────────────────────────────────────────────────────────┤  │
│  ████████▌╎· · · · · · · · · · · ·                                     │
│           └── la media ponderada llegaba a 35.0 %; el principal en L1  │
│               la corta a 15.0 %. Subirlo es lo único que mueve este    │
│               riesgo: los otros tres ya están en L3/L4.                │
```

Ese último renglón convierte el tablero en un plan: dice **cuál control comprar**.

Cuatro reglas de diseño: la rampa es **ordinal de un solo tono** porque los grupos están ordenados y tres hues dirían que son categorías independientes; el techo es **regla sólida, nunca punteada**, y se dibuja aunque no actúe —ver que está lejos también informa—; la barra **suma la eficacia, no el 100 %**, y el resto queda en gris neutro porque es el riesgo que queda, no un cuarto grupo; y **el criterio de cada clase va en pantalla**, para poder discutir una clasificación sin abrir el `.docx`.

---

## 8 · «Sin evaluar» no es L0 · el arreglo de una línea

El código enuncia la regla y la viola a una función de distancia.

`metricasMadurez` **excluye** los controles sin evaluar (`madurez.ts:113`), y lo argumenta:

> ««Sin evaluar» y «Por evaluar» are pending judgments, not L0s. Feeding zero would write a decision that was never made into every mean.»

Pero `eficaciaPorAmenaza` (`riesgos.ts:59-63`) los mete con `nivel: null`, y `eficaciaDeNivel(null)` devuelve **0**.

**Alcance medido:** los 7 sin evaluar son `A.7.1, A.7.2, A.7.3, A.7.4, A.7.6, A.7.11, A.7.12` — los físicos. **Ninguno está mapeado a amenazas de `[D]`**, pero **todos lo están a amenazas de los tipos físicos** `[HW] [Media] [AUX] [L]`, donde hunden la eficacia y **sobrestiman** el residual. Empuja en dirección contraria al resto de este requerimiento.

**Cambio:** excluirlos de la agregación, igual que hace `metricasMadurez`. Si tras excluirlos la amenaza se queda sin controles evaluados, su eficacia es **null** y el residual queda «sin calcular» — que es el estado honesto y ya está soportado.

**Y una trampa latente que se vuelve viva con la relevancia:** si el control **principal** queda sin evaluar, el techo pasa a ser `0 + δ = 5 %` y aplasta la eficacia de esa amenaza entera. Hoy no muerde porque no hay principales. Tras el §6, sí. **Un principal sin evaluar tiene que rechazarse al designarlo**, no producir un 5 % silencioso.

---

## 9 · Depurar el mapeo, no solo pesarlo

La relevancia no resuelve todo. Marcar `A.5.26 Respuesta a los incidentes` como «De apoyo» en `A.24 Denegación de servicio` baja su peso, pero **sigue sumando eficacia a una amenaza que no previene**: la respuesta a incidentes actúa *después* de que el servicio ya se cayó.

Ahí la pregunta no es qué peso darle sino **si el par debe existir**. Un control puramente reactivo mapeado a una amenaza preventiva infla el promedio por construcción.

Al clasificar cada amenaza (§6) se revisa también su lista, y **desmapear es una salida válida** —queda registrado con su razón, no se borra en silencio—. El CSV trae la columna `controles_de_la_amenaza` justamente para ver cuándo una amenaza acumuló demasiados.

---

## 10 · Criterios de aceptación

1. `select count(*) from control_amenaza where relevancia_id is null` → **0** al terminar la etapa 3. Tras la etapa 1, ≤ 242.
2. **Exactamente un principal por amenaza** entre las clasificadas: `select amenaza_id, count(*) from control_amenaza ca join relevancia_control r on r.id = ca.relevancia_id where r.es_principal group by 1 having count(*) <> 1` → **cero filas**.
3. **Prueba de sensibilidad**, la que prueba que la regla opera: tomar una amenaza clasificada, bajar su control principal un nivel, regenerar, y verificar que **su residual se mueve**. Con media plana el movimiento es marginal; con el techo, cuando el principal cae a L2 o menos, salta de banda.
4. El reparto 70/20/10 **renormaliza** sobre las clases presentes: una amenaza sin complementarios reparte 77.8/22.2, no 70/20 dejando un 10 % perdido.
5. Designar como principal un control **sin nivel actual** es rechazado con mensaje explícito.
6. Una amenaza con todos sus controles sin evaluar devuelve eficacia **null** y su residual queda «sin calcular», no en cero.
7. Los riesgos de activos de tipo físico **bajan su residual** respecto de hoy, al dejar de contar los 7 controles sin evaluar como L0. Es el signo contrario al resto y hay que verlo.
8. El detalle del riesgo distingue **v2 de v3** en las dos direcciones: una amenaza sin relevancia muestra el aviso; una con relevancia muestra el desglose por grupos.
9. `node scripts/validate_palette.js "#93b4e0,#4874c2,#1b3a8a" --mode light --surface "#ffffff" --ordinal` → **ALL CHECKS PASS**.
10. La metodología actualizada está aprobada y con acta **antes** de que el software calcule por la regla nueva (D-1).

---

## 11 · Decisiones

- **D-1 · actualizar MET-SIG-01 §7.4 · BLOQUEA el despliegue, no el trabajo.** Pasar de `3/2/1` a `70/20/10` cambia la fórmula publicada. Va por `PRO-CAL-01`. La asignación de relevancia (§6) puede arrancar en paralelo: no depende de los pesos.
- **D-2 · δ = 0.05.** Se queda en el valor aprobado. Entre 0.05 y 0 no cambia ninguna banda.
- **D-3 · quién asigna la relevancia.** Es el juicio central de este requerimiento y no lo puede hacer el desarrollo. Propuesta: líder del SIG con el líder de cada proceso, sobre el CSV, empezando por las ~30 filas de la etapa 1.
- **D-4 · qué hacer con los pares reactivos** (§9): desmapear, o dejar como «De apoyo» aceptando que suman. Se decide amenaza por amenaza al clasificar.

---

## 12 · Lo que no entra

- **La curva `[0, 0.1, 0.5, 0.9, 0.95, 1]`** no se toca. Es PILAR/CCN-CERT y la metodología la adopta explícitamente.
- **La composición probabilística** sigue descartada: la propia metodología la rechaza —«con cuatro controles en L3 arrojaría 99,995 %»— y la razón es buena: controles operados por la misma organización comparten modos de fallo.
- **No se crea impacto residual.** La eficacia reduce la frecuencia y nada más.
- **Corregir las madureces declaradas** es REQ-SIG-22. Este requerimiento hace que el modelo **reaccione** a la madurez; el siguiente hace que la madurez sea **verdadera**. Sin los dos, ninguno sirve solo.
