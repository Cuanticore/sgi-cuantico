# Design: REQ-SIG-24

## D1 · `nivel` pasa a ser el porcentaje, no un ordinal

`EscalaMadurez.nivel` es `Int @unique` y hoy vale 0..5. Pasa a valer **0, 10, 20 … 100**.

No se agrega una columna nueva ni se renumera 0..10. Dos razones:

1. **El remapeo queda explícito y auditable.** `UPDATE control SET actual_id = (SELECT id FROM escala_madurez WHERE nivel = 90) WHERE actual_id = (SELECT id FROM escala_madurez WHERE nivel = 3)` dice qué hace. Con una renumeración 0..10, `L3 → 3` seguiría siendo un `3` válido apuntando a otra cosa: el error más caro posible, porque no falla.
2. **`nivel` y `eficacia` dejan de poder discrepar.** `eficacia = nivel / 100`, y la columna se conserva porque es la que el motor lee (D2) y porque una escala futura podría no ser lineal.

El rango 0..5 queda libre de ambigüedad: ningún escalón nuevo cae ahí salvo el 0, que significa lo mismo en las dos escalas.

## D2 · El motor lee el catálogo, no la constante

Hoy la curva está **duplicada**: `EscalaMadurez.eficacia` (que las pantallas muestran) y `EFICACIA_POR_NIVEL` en `lib/sgsi/madurez.ts` (que es lo que multiplica). `riesgos.ts:237` construye un mapa `id → nivel` y llama a `eficaciaDeNivel(nivel)`, es decir: lee la tabla para tirar la eficacia y recalcularla del array. Las dos pueden divergir sin que nada falle.

`eficaciaDeNivel(nivel)` pasa a recibir la **tabla** como argumento. Sigue siendo pura —no hace I/O— y por eso el módulo sigue sirviendo a la pantalla de Controles, que recalcula el tablero entero en el navegador mientras el usuario arrastra los selectores.

```ts
type TablaEficacia = ReadonlyMap<number, number>;   // nivel → eficacia
eficaciaDeNivel(nivel: number | null, tabla: TablaEficacia): number
```

`EFICACIA_POR_NIVEL` **se conserva exportada** como la tabla de la escala vieja, con un nombre que lo diga (`EFICACIA_CMM_HISTORICA`), porque la migración la necesita para traducir y la línea base del GAP del 2 de marzo está expresada en ella.

## D3 · El techo vive en `calcularRiesgo`, no en la interfaz

`MIN(e, 0.95)` se aplica dentro de `lib/sgsi/formulas.ts:calcularRiesgo` — el único camino aritmético por el que pasan `generarRiesgos`, la Ecuación y el derive pass de la ficha.

Ponerlo en el selector dejaría tres puertas abiertas: un `UPDATE` por script, la agregación de REQ-SIG-21 (que compone medias y un techo propio), y `Riesgo.madurezId` (la excepción de madurez por riesgo). El invariante que se quiere sostener —«ningún control elimina un riesgo»— es del modelo, así que vive donde vive el modelo.

Se expone como constante nombrada, `EFICACIA_MAXIMA = 0.95`, y `calcularRiesgo` devuelve además `eficaciaAcotada: boolean` para que la Ecuación pueda decir en el paso 6 que el techo actuó — misma convención que `techoActua` de REQ-SIG-21.

## D4 · La exigencia sigue siendo una constante, no un catálogo

D-1 de REQ-SIG-23 (catálogo `ExigenciaControl` editable con bitácora) **queda abierta**. Esta fase mantiene la tabla en `lib/sgsi/exigencia.ts`, en una sola constante.

Motivo: el catálogo agrega una tabla, una pantalla de edición, su bitácora y su siembra; y los valores de §6 todavía no pasaron un ciclo de uso. Cambiarlos hoy es editar una constante en un módulo puro con sus pruebas al lado. Se recomienda cerrar D-1 a favor del catálogo **después** del primer ciclo, cuando se sepa si los valores se mueven.

## D5 · La verificación vigente entra como **predicado inyectado**, no como consulta

`lib/sgsi/exigencia.ts` es puro y tiene que seguir siéndolo: lo consumen la ficha (cliente) y la página de análisis (cliente), que reescopan sin viaje al servidor.

```ts
type HayVerificacionVigente = (codigoControl: string) => boolean | null;
```

`null` = **no se pudo determinar** (el código no resolvió contra ninguna obligación). Nunca `false` por ausencia: `false` afirma que no hay verificación, y afirmar eso porque un texto no coincidió es exactamente el «tablero que afirma con precisión que no hay brechas» que REQ-SIG-23 §2 advierte. Es la D-3 del requerimiento.

El servidor arma el predicado con `Obligacion.controlAnexoA → Asignacion → EjecucionVerificacion(resultado = CONFORME, fecha ≥ hoy − 12 meses)` y lo pasa como datos planos, igual que `accionesParaDeuda` ya hace para `construirResolverDeuda`.

## D6 · La compuerta cambia de fuente, no de forma

`EstadoPlanActivo` conserva sus cuatro valores —`no-requiere` · `con-plan` · `pendiente` · `sin-determinar`— y `estadoPlanDe` conserva su firma. Lo único que cambia es **qué pregunta**:

```
antes:  peorResidual(a).banda === 'Crítico'        →  requiere plan
ahora:  alguna amenaza de `a` tiene brecha > 0     →  requiere plan
```

`sin-determinar` pasa a cubrir dos causas —no hay resolutor de deuda, o la brecha no es evaluable (sin principal)— y por eso deja de ser un booleano implícito: la función devuelve además el motivo, para que la pantalla pueda decir «pendiente de clasificar → REQ-SIG-21» en vez de un guion.

Que la forma no cambie es lo que mantiene intactas la franja, el envejecimiento por `RiesgoCalculo`, el popup prellenado y el `origen:v1|…` de `origen-plan.ts`. Esta fase mueve la fuente de la señal; no rehace el plan de tratamiento.

## D7 · La traducción no toca `Bitacora`

Un remapeo de clave foránea que preserva el significado (`L3 → 90 %` es el mismo 0.90 de eficacia) **no es un cambio de madurez**, y escribir 93×3 filas de bitácora diciendo que alguien cambió el nivel sería falso: nadie lo cambió. La migración deja constancia en su propio comentario y en `recalificadoEn = null`, que es la marca que sí significa algo.

La recalificación a mano, en cambio, escribe bitácora por control como siempre.

## Secuencia — de la calificación al plan

```
persona recalifica A.8.14: 90 % → 70 %
  │
  ├─ Control.actual → escalon(70) · recalificadoEn = now() · Bitacora(motivo)
  │
  ├─ eficaciaAmenaza(A.24)  ← lee escalones del catálogo, aplica 70/20/10 + techo del principal
  │     └─ e = 0.70
  ├─ calcularRiesgo         ← MIN(0.70, 0.95) = 0.70
  │     └─ residual = 5.0 × (1 − 0.70) = 1.50   (antes 0.45)
  │
  └─ evaluarBrecha(TEC-GEN-0004 × A.24)
        exigido = máx(C1→90, valorD=5→90) = 90
        actual  = 70                → { brecha, 20 puntos }
           │
           └─ estadoPlanDe(activo) = 'pendiente'  → franja «sin plan», tarjeta, escalado
```
