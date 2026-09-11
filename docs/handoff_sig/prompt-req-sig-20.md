# Prompt para el desarrollador · REQ-SIG-20

Copia todo lo que está debajo de la línea y pégalo como primer mensaje en la sesión del agente, con el repositorio clonado en `main` y la base de desarrollo levantada (`npm run db:up`).

---

Vas a construir **REQ-SIG-20 · el proceso de valoración de riesgos**, que son nueve peticiones del líder del SIG sobre la ficha del activo, el inventario, una página nueva y el plan de tratamiento. Está estimado en **19,5 días**.

## 1 · Antes de escribir nada

1. **`docs/handoff_sig/proceso-valoracion-de-riesgos.md`** — el requerimiento, 509 líneas. Es la fuente de verdad. **Está listo para ejecutar**: D-2, D-3 y D-5 están cerradas y las tres abiertas no bloquean.
2. Ojea **`docs/handoff_sig/regla-de-eficacia-agregada.md`** (REQ-SIG-21) y **`madurez-declarada-contra-evidencia.md`** (REQ-SIG-22). **No los construyas**, pero léelos: explican por qué los residuales que vas a mostrar son hoy sistemáticamente optimistas, y hay avisos en pantalla que REQ-SIG-20 tiene que dejar preparados.
3. `docs/handoff_sig/pagina-valoracion-de-activos.md` (REQ-SIG-18) — ya está construido, y su §4.4 trae la rampa de color validada que vas a reusar.

## 2 · Paso 0 · la consulta que valida todas las cifras de este prompt

**Antes de escribir una línea:**

```sql
select count(*) from activo where activo;
```

- **299** → el Consolidado V19 está cargado. **Todas las cifras de este prompt son válidas.** Seguí.
- **234** → V19 **no** está cargado; la base tiene la migración anterior. **Ninguna cifra de §4 ni de §7 va a cuadrar.** Pará y avisá: hay que correr REQ-SIG-12 primero, y su prompt está en `docs/handoff_sig/prompt-carga-req-sig-17.md` §2.
- **Otro número** → avisá antes de seguir.

Esto no es burocracia: las cifras de aceptación de §7 están calculadas sobre V19. Si la base tiene otra carga y no lo verificás, vas a pasar medio día buscando un defecto en tu código que en realidad es un dato distinto.

## 3 · El dato que dimensiona el trabajo

Con V19 cargado: de los **299 activos**, solo **37 alcanzan el umbral** —34 en valor 4 y 3 en valor 5— y generan **725 riesgos**. Eso es lo que hace viable una ecuación paso a paso y un plan por residual crítico.

Pero **244 activos están en valor 3, a un punto de entrar**. Nada de lo que construyas puede asumir «son 37»: si la próxima revisión sube treinta, el alcance crece un 80 %.

**Un archivo que no está en el repositorio y vas a necesitar.** La columna 26 de criticidad (P9 del requerimiento) se agrega a `FOR-SIG-12 Consolidado de Activos de Información V19.xlsx`, que vive en el repositorio documental del SIG, en `14. Seguridad de la Informacion/2. Gestión de Activos y Protección de Información/0. Formato de Inventario por procesos/`. Pedilo antes de llegar al bloque 4.

## 4 · El orden, que no es el de la lista

| # | Bloque | Peticiones | Días |
|---|---|---|---:|
| 1 | Base | P1 guardas de umbral · P5 grilla · recálculo | 1.5 |
| 2 | Trazabilidad | P7 fórmulas visibles · P8 pestaña Ecuación | 3.0 |
| 3 | El camino | P3 URL del popup · P4 página nueva | 5.0 |
| 4 | El cierre | P2 plan por residual crítico · P6 notas · P9 criticidad | 8.0 |
| | Pruebas y ajuste | | 2.0 |

## 5 · Las cuatro cosas que se hacen mal si no se avisan

**5.1 · No basta con deshabilitar la pestaña: hay que dejar de calcular.** `FichaActivo.tsx` conoce el umbral (`entraAlAnalisis`, línea 530) pero la pasada de derivación de la línea 592 **corre para todos los activos**. Para uno de valor 3, la línea 2446 dice «no genera riesgos» y la 2505 lista las amenazas con su inherente y residual calculados. **Retira la previsualización por completo** — no detrás de un botón, no plegada. §3.1 del requerimiento.

El criterio de aceptación no es «no se ve»: es **«no se ejecuta»**. Pon una traza en ese `useMemo`, abre un activo de valor 3 y otro de valor 5, y verifica que corre una sola vez.

**5.2 · «Obligar» a registrar el plan NO significa bloquear.** La regla de la casa es «la aplicación registra y señala; no impide» (decisión D17). El guardado ocurre siempre; lo que pasa es que se abre el popup prellenado y, si se cierra, el riesgo queda en «plan pendiente» y **aparece nombrado** en una franja de alerta en `/sgsi/planes` **y** en la lista de activos. §7.

Un plan de tipo `ACEPTAR` saca al activo de la franja: aceptar es planificar. Lo que la alerta persigue es el silencio.

**5.3 · El plan es sobre el CONTROL, aunque nazca del activo.** La metodología es explícita: «lo único que mueve la aguja es elevar la madurez de un control». La `AccionPlan` guarda de qué activo y qué amenaza nació, pero su unidad sigue siendo el control. No crees una lista paralela de planes por activo. §7.2.

**5.4 · Las notas al final no pueden costar el rastro de auditoría.** Se separa el registro de la narrativa: los cambios se acumulan, al guardar se escribe **una nota** en un solo cuadro, y se emite **una fila de `Bitacora` por campo cambiado** con esa misma nota como motivo, todo en una transacción. Guardar sin nota falla. §10.

## 6 · Lo que no debes decidir tú

- **El umbral** sale de `Parametro.umbral_valoracion`. Cambiarlo a 3 tiene que mover todo sin recompilar.
- **La aritmética** sale de `lib/sgsi/formulas.ts`. No la reimplementes en el cliente: la pestaña Ecuación tiene que coincidir hasta el cuarto decimal con `Riesgo.riesgoResidual`, y si hay dos implementaciones no va a coincidir.
- **La rampa de color** ya está validada en REQ-SIG-18 §4.4. Si cambias un paso, vuelve a correr `scripts/validate_palette.js`.
- **La criticidad** es una columna que declara el negocio en `FOR-SIG-12` (columna 26), no un cálculo. Cinco niveles sobre RTO y RPO, **guardados en minutos, no en texto**. §11.
- **La regla de exigencia** que usa esa criticidad **no entra acá**: es REQ-SIG-23. Aquí se crea la columna, el catálogo, la carga y la visualización.

## 7 · Las cifras que tienen que cuadrar

| | |
|---|---:|
| `activo where activo` | 299 |
| activos con riesgo no obsoleto | **37** |
| riesgos no obsoletos | **725** |
| filtro por valor en la grilla | 3 · 34 · 37 · 244 · 18 |
| `CriticidadNegocio` | **5 filas**, con `rtoMinutos` y `rpoMinutos` numéricos |

Y las de comportamiento: cambiar `umbral_valoracion` a 3 sube el conteo sin tocar código; tres cambios en una sesión producen tres filas de `Bitacora` con la misma nota; la pestaña Ecuación coincide al cuarto decimal; las pantallas nuevas no escriben nada.

## 8 · Lo que NO debes hacer

- No agregues librería de gráficos: el repo ya tiene `echarts` y `echarts-for-react`.
- No crees tablas ni columnas fuera de la criticidad.
- No bloquees ningún guardado.
- No dejes la previsualización de riesgos bajo el umbral ni siquiera detrás de un botón.
- No toques la fórmula, la curva de eficacia ni el catálogo de amenazas.
- No inventes datos que falten: si un cargo o una criticidad no resuelve, falla con el código del activo.

## 9 · Cómo reportar

Si algo no se puede construir como está escrito, **anótalo y sigue con lo que no dependa de eso.** No cambies el requerimiento por tu cuenta.

Al terminar cada bloque de §4, dime qué quedó construido, qué no, y las cifras de §7 contra las reales. Si alguna no coincide, esa es la conversación.
