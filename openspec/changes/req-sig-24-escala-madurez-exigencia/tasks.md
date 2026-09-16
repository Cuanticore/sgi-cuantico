# Tasks: REQ-SIG-24

TDD estricto (`openspec/config.yaml: strict_tdd`). En cada tarea de código: prueba primero, roja, después el módulo. `npm test` verde al cerrar cada fase.

## Fase 1 · El núcleo puro — la escala

- [x] 1.1 `madurez.test.ts`: `eficaciaDeNivel` contra una tabla inyectada; nivel ausente de la tabla → `0` sólo si el nivel es `null`, y **error nombrando el nivel** si el nivel existe pero la tabla no lo trae (un escalón desconocido es un dato roto, no un cero) — *las tres aserciones viven en `formulas.test.ts`, junto al resto de la escala*
- [x] 1.2 `madurez.ts`: `eficaciaDeNivel(nivel, tabla)`; renombrada la constante vieja a `EFICACIA_CMM_HISTORICA` y exportada para la migración
- [x] 1.3 `madurez.test.ts`: `metricasMadurez` con umbrales en **puntos**; «sin evaluar» sigue fuera de toda media
- [x] 1.4 `madurez.ts`: umbrales `UMBRAL_GESTIONADO` (70) y `UMBRAL_BRECHA` (50); `enL3`/`pctL3` → `enGestionado`/`pctGestionado` en los 7 sitios que los leían
- [x] 1.5 `formulas.test.ts`: `EFICACIA_MAXIMA`; `calcularRiesgo` con `eficacia: 1` da `residual = 0.05 × inherente` y `eficaciaAcotada: true`; con `0.90` no acota
- [x] 1.6 `formulas.ts`: `MIN(e, 0.95)` dentro de `calcularRiesgo`, más el flag en `SalidaRiesgo`
- [x] 1.7 `ecuacion.ts`: δ por defecto pasa a `DELTA_TECHO`; el paso 7 sigue llamando a `calcularRiesgo` — **falta** exponer `eficaciaAcotada` en `EcuacionResuelta` para que el paso 6 lo diga en pantalla
- [x] 1.8 Tabla propagada a `desglosarEficaciaAmenaza` / `eficaciaAmenaza`; δ pasa de `0.05` a **`0.10`** (un escalón), como constante nombrada
- [x] 1.9 `RUBRICA` y `ESCALONES_SELECCIONABLES` en `madurez.ts` — una sola copia de la escala, que antes estaba duplicada en tres componentes

## Fase 2 · El núcleo puro — la exigencia

- [x] 2.1 `exigencia.test.ts`: las dos escaleras en % (C1..C5, valor 5/4); los dos casos de REQ-SIG-23 §6
- [x] 2.2 `exigencia.ts`: `EXIGENCIA_POR_CRITICIDAD` y `exigenciaPorValor` en puntos
- [x] 2.3 `exigencia.test.ts`: `brecha-de-verificacion` y `verificacion-sin-determinar`
- [x] 2.4 `exigencia.ts`: `HayVerificacionVigente` inyectado, `REQUIERE_VERIFICACION = ['C1']`
- [x] 2.5 `factorSobreResidual` — la brecha en puntos traducida a «cuántas veces el residual del cumplidor»

## Fase 3 · Persistencia y traducción

- [x] 3.1 La escala sale de `escalas.json` y pasa a `RUBRICA` (una sola fuente); `iso-controles.json` traducido por eficacia — 93 controles × 3 campos
- [x] 3.2 `prisma/seeds/escalas.ts`: siembra desde `RUBRICA`, con la verificación de que son los once escalones (de la que depende la identidad `eficacia = nivel / 100` de las pantallas)
- [ ] 3.3 `schema.prisma`: `Control.recalificadoEn DateTime?`; comentario de por qué `null` no es «nunca recalificado» sino «viene de la traducción»
- [ ] 3.4 Migración: **insertar** los once escalones → **remapear** las seis FK (`control` ×3, `riesgo.madurez_id`, `accion_plan` ×2) por valor explícito → **verificar** `count(*) = 0` apuntando a los viejos → **borrar** los cinco viejos. Todo en una transacción, sin `Bitacora` (D7)
- [ ] 3.5 Script de verificación post-migración: índice declarado entre 84 % y 87 %, 93 controles con `recalificadoEn = null`, ningún `escala_madurez.nivel` fuera de {0,10,…,100}
- [ ] 3.6 `riesgos.ts`: dejar de reconstruir la eficacia del array; leer `EscalaMadurez.eficacia` y pasar la tabla

## Fase 4 · La compuerta

- [x] 4.1 `analisis-riesgos.test.ts`: `estadoPlanDe` por brecha; `sin-determinar` cuando no hay principal y cuando el principal está sin evaluar; la columna Brecha en puntos; el orden por peor residual **no cambia**
- [x] 4.2 `analisis-riesgos.ts`: `estadoPlanDe` lee la brecha; `brechaDelRiesgo` y `peorBrecha` exportadas; `residualCritico` → **`conBrecha`** (brechas medidas) **+ `sinDeterminar`** (las que no se pudieron evaluar), separadas a propósito
- [x] 4.4 `analisis-riesgos.query.ts`: trae `valores` por dimensión, la degradación de cada amenaza y su control principal (`relevancia.esPrincipal`)
- [x] 4.5 `PantallaAnalisisRiesgos.tsx`: tarjetas CON BRECHA y SIN DETERMINAR
- [ ] 4.3 `deuda-planes.ts`: **PENDIENTE y bloqueada por una decisión.** La cola (`activosSinPlan`), el envejecimiento (`antiguedadEnCritico`) y el escalado siguen leyendo la banda residual, así que la **franja nombrada sigue vacía** aunque las tarjetas ya cuenten bien. El problema no es mecánico: la antigüedad camina la racha de `RiesgoCalculo`, y `RiesgoCalculo.entrada` guarda la eficacia AGREGADA, no el nivel del principal — no hay forma de reconstruir «desde cuándo existe esta brecha» con lo que hoy se persiste. Ver la nota al pie
- [ ] 4.6 `HayVerificacionVigente`: el predicado está definido, inyectado y probado, pero **nadie lo construye todavía** — falta la lectura `Obligacion.controlAnexoA → Asignacion → EjecucionVerificacion(CONFORME, ≤ 12 meses)`. Sin él, todo activo C1 cuyo principal alcance el nivel sale `verificacion-sin-determinar`, que es el estado honesto

### Nota al pie · la antigüedad de la brecha (bloquea 4.3)

Tres caminos, y hay que elegir uno antes de tocar `deuda-planes.ts`:

1. **Extender el snapshot.** Agregar `nivelPrincipal` a `RiesgoCalculo.entrada` (es JSON, no hay migración). La antigüedad se vuelve derivable desde la primera corrida que lo registre; las filas viejas no la tienen y la franja dice «desde que se empieza a registrar». Es el que recomiendo: `RiesgoCalculo` existe justamente para «congelar las entradas exactas de cada cálculo», y el nivel del principal *es* una entrada.
2. **Mostrar la brecha sin antigüedad.** `FilaSinPlan.desde` pasa a `Date | null` y la fila aparece igual. Hoy una antigüedad nula DESCARTA la fila (`continue`), que bajo la compuerta nueva sería el peor default posible.
3. **Dejar la antigüedad sobre la banda residual.** Coherente con lo que ya existe y sin valor: esa banda es inalcanzable.

Lo mínimo para que la franja funcione es **2**; lo correcto es **1 + 2**.

## Fase 5 · Pantallas

- [x] 5.1 `PantallaControl.tsx` · `PopupControl.tsx`: selector desde `ESCALONES_SELECCIONABLES` (**sin 100 %**), etiquetas en % con su descriptor, `L{n}` fuera, semáforo y escalera por puntos. **Falta** `ControlesMadurez.tsx`, que todavía dice «Gestionados en L3+» y rotula con `nivelTexto`
- [ ] 5.2 Doble índice traducido/recalificado en la pantalla de Madurez, con la marca por control
- [ ] 5.3 `FichaActivo.tsx`: franja de brechas en la pestaña Amenazas — «n brechas, m controles»; el paso 6 de la Ecuación dice si el techo actuó
- [ ] 5.4 `PantallaAnalisisRiesgos.tsx`: columna Brecha, tarjeta recontada, filtro por estado de brecha
- [ ] 5.5 `DocumentoMetodologia.tsx` · `ParametrosModelo.tsx`: la escala nueva y la rúbrica; MET-SIG-01 pasa a v4

## Fase 6 · Verificación

- [ ] 6.1 `npm test` · `npx tsc --noEmit` · `npm run lint` · `npm run build`
- [ ] 6.2 Los quince criterios de aceptación del §8, uno por uno, con evidencia
- [ ] 6.3 Recalcular contra la base de desarrollo: el residual de `A.24 × TEC-GEN-0004` y la brecha de C1
- [ ] 6.4 `verify-report.md`
