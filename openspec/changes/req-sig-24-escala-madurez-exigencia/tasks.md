# Tasks: REQ-SIG-24

TDD estricto (`openspec/config.yaml: strict_tdd`). En cada tarea de código: prueba primero, roja, después el módulo. `npm test` verde al cerrar cada fase.

## Fase 1 · El núcleo puro — la escala

- [ ] 1.1 `madurez.test.ts`: `eficaciaDeNivel` contra una tabla inyectada; nivel ausente de la tabla → `0` sólo si el nivel es `null`, y **error nombrando el nivel** si el nivel existe pero la tabla no lo trae (un escalón desconocido es un dato roto, no un cero)
- [ ] 1.2 `madurez.ts`: `eficaciaDeNivel(nivel, tabla)`; renombrar la constante vieja a `EFICACIA_CMM_HISTORICA` y dejarla exportada para la migración
- [ ] 1.3 `madurez.test.ts`: `metricasMadurez` con umbrales en **puntos** (`enL3`/`pctL3` → `enObjetivo`/`brechas` sobre el porcentaje); «sin evaluar» sigue fuera de toda media
- [ ] 1.4 `madurez.ts`: reemplazar los umbrales por nivel (`>= 3`, `<= 2`, `>= 4`) por umbrales en puntos, nombrados
- [ ] 1.5 `formulas.test.ts`: `EFICACIA_MAXIMA`; `calcularRiesgo` con `eficacia: 1` da `residual = 0.05 × inherente` y `eficaciaAcotada: true`; con `0.90` no acota
- [ ] 1.6 `formulas.ts`: `MIN(e, 0.95)` dentro de `calcularRiesgo`, más el flag en `SalidaRiesgo`
- [ ] 1.7 `ecuacion.test.ts` + `ecuacion.ts`: el paso 6 dice que el techo actuó; el paso 7 sigue llamando a `calcularRiesgo` (una sola aritmética)
- [ ] 1.8 Propagar la tabla a `desglosarEficaciaAmenaza` / `eficaciaAmenaza`; δ del techo del principal pasa de `0.05` a **`0.10`** (un escalón), constante nombrada

## Fase 2 · El núcleo puro — la exigencia

- [ ] 2.1 `exigencia.test.ts`: las dos escaleras en % (C1..C5, valor 5/4); los dos casos de REQ-SIG-23 §6 (`D=5 con C4` → 90 por valor; `D=3 con C1` → 90 por criticidad)
- [ ] 2.2 `exigencia.ts`: `EXIGENCIA_POR_CRITICIDAD` y `exigenciaPorValor` en puntos
- [ ] 2.3 `exigencia.test.ts`: `brecha-de-verificacion` — C1 en 90 % sin verificación vigente no es `cubierto`; el mismo caso en C2 sí lo es; predicado que devuelve `null` → `sin-determinar`, nunca brecha
- [ ] 2.4 `exigencia.ts`: `HayVerificacionVigente` inyectado, estado `brecha-de-verificacion`, `REQUIERE_VERIFICACION = ['C1']`
- [ ] 2.5 `exigencia.test.ts` + `exigencia.ts`: `brecha` en puntos y el factor sobre el residual `(1−actual)/(1−exigido)`, para que la franja pueda decir «tres veces mayor»

## Fase 3 · Persistencia y traducción

- [ ] 3.1 `prisma/data/escalas.json`: los once escalones con su descriptor (§3 del requerimiento)
- [ ] 3.2 `prisma/seeds/escalas.ts`: siembra por `nivel` = porcentaje; idempotente
- [ ] 3.3 `schema.prisma`: `Control.recalificadoEn DateTime?`; comentario de por qué `null` no es «nunca recalificado» sino «viene de la traducción»
- [ ] 3.4 Migración: **insertar** los once escalones → **remapear** las seis FK (`control` ×3, `riesgo.madurez_id`, `accion_plan` ×2) por valor explícito → **verificar** `count(*) = 0` apuntando a los viejos → **borrar** los cinco viejos. Todo en una transacción, sin `Bitacora` (D7)
- [ ] 3.5 Script de verificación post-migración: índice declarado entre 84 % y 87 %, 93 controles con `recalificadoEn = null`, ningún `escala_madurez.nivel` fuera de {0,10,…,100}
- [ ] 3.6 `riesgos.ts`: dejar de reconstruir la eficacia del array; leer `EscalaMadurez.eficacia` y pasar la tabla

## Fase 4 · La compuerta

- [ ] 4.1 `analisis-riesgos.test.ts`: `estadoPlanDe` por brecha; `sin-determinar` cuando no hay principal; el orden por peor residual **no cambia**
- [ ] 4.2 `analisis-riesgos.ts`: `estadoPlanDe` y la tarjeta `residualCritico` (renombrada `conBrecha`) leen la brecha
- [ ] 4.3 `deuda-planes.test.ts` + `deuda-planes.ts`: la cola, el envejecimiento y el escalado se disparan por brecha; `BANDA_CRITICA` sale
- [ ] 4.4 `analisis-riesgos.query.ts`: traer la degradación por amenaza, el principal de cada amenaza y el predicado de verificación como datos planos

## Fase 5 · Pantallas

- [ ] 5.1 `ControlesMadurez.tsx` · `PantallaControl.tsx` · `PopupControl.tsx`: selector de once escalones **sin 100 %**, etiquetas en % con su descriptor, `L{n}` fuera
- [ ] 5.2 Doble índice traducido/recalificado en la pantalla de Madurez, con la marca por control
- [ ] 5.3 `FichaActivo.tsx`: franja de brechas en la pestaña Amenazas — «n brechas, m controles»; el paso 6 de la Ecuación dice si el techo actuó
- [ ] 5.4 `PantallaAnalisisRiesgos.tsx`: columna Brecha, tarjeta recontada, filtro por estado de brecha
- [ ] 5.5 `DocumentoMetodologia.tsx` · `ParametrosModelo.tsx`: la escala nueva y la rúbrica; MET-SIG-01 pasa a v4

## Fase 6 · Verificación

- [ ] 6.1 `npm test` · `npx tsc --noEmit` · `npm run lint` · `npm run build`
- [ ] 6.2 Los quince criterios de aceptación del §8, uno por uno, con evidencia
- [ ] 6.3 Recalcular contra la base de desarrollo: el residual de `A.24 × TEC-GEN-0004` y la brecha de C1
- [ ] 6.4 `verify-report.md`
