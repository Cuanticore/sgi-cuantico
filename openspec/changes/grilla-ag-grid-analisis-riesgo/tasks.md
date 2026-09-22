# Tasks: AG Grid en «Análisis de riesgos»

TDD estricto (`openspec/config.yaml: strict_tdd`, `HARNESS.md` Regla 1). En cada tarea de código:
prueba primero, **verificada en rojo**, después el módulo. `npm test` verde al cerrar cada fase.

El orden de las fases no es negociable: la fase 2 existe para que la Regla 1 siga costando
milisegundos después de meter una librería que su propia documentación desaconseja probar en jsdom
(design D5). Montar la grilla antes convierte cada iteración en un arranque de navegador.

## Fase 0 · La decisión y la dependencia

- [x] 0.1 Confirmar **Community** (proposal › «Decisiones abiertas»). Si la decisión es Enterprise,
      anotarlo acá con fecha y quién la tomó, y cambiar `AllCommunityModule` → `AllEnterpriseModule`
      más la clave de licencia como variable de entorno del build
- [x] 0.2 `npm i ag-grid-community ag-grid-react`; anotar en el PR las versiones exactas instaladas
- [x] 0.2b Recontar cuántos activos superan hoy el umbral — **30 de 378 vigentes, umbral 4**,
      medido el 21/09/2026 contra la aplicación corriendo (no reinventando la consulta en SQL: se
      leyó el encabezado, que lo calcula `tarjetasAnalisis`, y las filas del `tbody` cuadran). 30
      son decenas, así que el criterio de D1 se sostiene con un número medido. Detalle y las dos
      confusiones que costó llegar ahí, en proposal › «Nota sobre los conteos»
- [x] 0.3 `npx tsc --noEmit` y `npm run lint` limpios sólo con la dependencia agregada, antes de
      escribir una línea. Una dependencia que ya ensucia los checks se discute ahora, no después

## Fase 1 · El comparador puro (sin cambio de comportamiento)

- [x] 1.1 `analisis-riesgos.test.ts`: `compararPorCriticidad(a, b, rtoPorCriticidad)` — RTO
      ascendente, `null` al final, desempate estable por código. **Rojo**: la función no existe
- [x] 1.2 `analisis-riesgos.ts`: extraer `compararPorCriticidad` y hacer que `ordenarPorCriticidad`
      la use. La prueba §14.12 existente **no se toca** y tiene que seguir verde: es la red que
      demuestra que el refactor no cambió nada

## Fase 2 · Las columnas como dato

- [x] 2.1 `columnas-analisis.test.ts`: las trece columnas, en su orden, con sus `headerName`; `D`,
      `I`, `C` bajo el encabezado agrupado con sus nombres completos; `Código` fijada a la izquierda
- [x] 2.2 `columnas-analisis.test.ts`: la afirmación de D2 convertida en prueba. **Se escribió como
      «ninguna columna declara `filter`» y se invirtió el mismo día** (ver Fase 3b): ahora afirma
      que toda columna filtra, con el tipo correcto según lo que contenga. La prueba cambió de
      signo porque la decisión cambió, y el motivo quedó escrito en el propio archivo
- [x] 2.3 `columnas-analisis.test.ts`: `comparadorResidual` — Crítico antes que Alto, `null` al final
- [x] 2.4 `columnas-analisis.test.ts`: `comparadorCriticidad` sobre el fixture de §14.12 da el mismo
      orden que `ordenarPorCriticidad`, usándola como oráculo
- [x] 2.5 `columnas-analisis.test.ts`: `claseDeFila` sobre las tres bandas — `fila-alarmante` en
      Crítico y Alto, ausente en Medio, `fila-banda--sin-calcular` sin pintar cuando el residual es
      `null`, y `fila-plan--*` con los cuatro estados
- [x] 2.6 `lib/sgsi/columnas-analisis.ts`: el módulo que pone las 2.1–2.5 en verde. **Puro**: sin
      React, sin renderizar; de AG Grid sólo los tipos

## Fase 3 · La grilla

- [x] 3.1 CSS de las clases de fila (`fila-alarmante`, `fila-banda--*`, `fila-plan--*`) con los
      mismos tokens que hoy usa `bg-danger-bg`
- [x] 3.2 Tema con la Theming API derivado de `--hf-*` (design D7). **No** importar `ag-grid.css` ni
      `ag-theme-*.css`
- [x] 3.3 `GrillaAnalisis.tsx`: `<AgGridProvider modules={[AllCommunityModule]}>` + `<AgGridReact>`,
      consumiendo `columnasAnalisis`. Cell renderers para Código (el `<Link>` real), Valor, las tres
      dimensiones, Criticidad, las dos bandas y Plan — los mismos nodos que hoy, movidos
- [x] 3.4 `PantallaAnalisisRiesgos.tsx`: la `<table>` sale, entra `GrillaAnalisis` por
      `next/dynamic({ ssr: false })`. Tarjetas, filtros, franja y encabezado **sin tocar**
- [x] 3.5 El rótulo pasa a «orden personalizado» cuando hay orden por columna (spec › «El orden
      efectivo se nombra como es»)
- [x] 3.6 Disposición de columnas en `localStorage` + botón «Restablecer columnas»; una disposición
      guardada que ya no cuadra se ignora en silencio y no rompe la pantalla
- [x] 3.7 Exportar CSV de lo visible, rotulado de forma que no se confunda con el informe formal
- [ ] 3.8 **Medir** el delta de `npm run build` contra `main` y anotar el número en el PR (design
      D6). Si es intolerable, módulos sueltos en vez de `AllCommunityModule`

## Fase 3b · El rediseño del 21/09/2026

No estaba en el plan: lo pidió quien usa la pantalla después de verla funcionando, que es cuándo
se ven estas cosas. Se anota como fase propia y no disuelto en la 3 para que el diff de la 3 siga
siendo «la migración» y esto siga siendo «lo que cambió al usarla».

- [x] 3b.1 Las seis tarjetas en una sola línea, más angostas. **Dejan de ser botones**: filtraban
      los seis desplegables que se retiraron, y un botón que ya no filtra nada es una promesa falsa
- [x] 3b.2 Fuera los seis desplegables; **filtro por columna** en la grilla, visible y no escondido
      en un menú. Revierte D2 — ver allá por qué era seguro hacerlo
- [x] 3b.3 `tarjetasDeFilas` en `analisis-riesgos.ts`, con seis pruebas: las tarjetas cuentan las
      filas visibles y no un objeto de filtros. **Es la mitad que hace seguro el punto anterior**
- [x] 3b.4 La prueba de la costura en `PantallaAnalisisRiesgos.test.tsx`: un doble de la grilla
      publica cuántas filas recibió, y se compara contra la cifra de la tarjeta. Dos observaciones
      del DOM, **sin literales** — un literal deja pasar la discrepancia cuando el montaje produce
      por casualidad el mismo dígito
- [x] 3b.5 **Excel con estilos**, que en AG Grid es Enterprise: se resolvió con `exceljs`, que ya
      era dependencia, en `lib/sgsi/analisis-libro.ts` + `app/api/sgsi/exportar-analisis/route.ts`.
      Mismo corte que `exportar-activos`. Viajan los códigos, no los datos
- [x] 3b.6 `domLayout="autoHeight"`: sin barra vertical propia. Cuesta el encabezado pegajoso y la
      virtualización de filas — a revisar el día que esta grilla reciba cientos
- [x] 3b.7 Columnas con `flex` en vez de píxeles: sin barra horizontal
- [x] 3b.8 La barra de acciones y el conteo en **una sola línea** encima de la grilla; fuera el
      título «Activos en análisis», que repetía el h1
- [x] 3b.9 La columna **Plan a la tercera posición**, junto a Nombre: es la única con una acción, y
      al final obligaba a recorrer diez columnas para hacer lo único que se hace desde acá

## Fase 4 · Reubicar las pruebas que dependían del `<tr>`

La tabla de destinos está en design D5. Ninguna aserción se borra: cada una se muda o se reescribe.

- [x] 4.1 Quitar `renglonDe()` (usa `closest('tr')`) y reescribir las cuatro pruebas de pintado
      contra `claseDeFila`
- [x] 4.2 Las tres de dimensiones: encabezados contra los `ColDef`, valores por fila al e2e
- [x] 4.3 Las siete de «+ plan» y el popup: intentarlas en jsdom con `domLayout="autoHeight"`. **Si
      la grilla no rinde filas en jsdom, se van al e2e y se anota acá por qué** — no se dan por
      cubiertas ni se borran
- [x] 4.4 Las de tarjetas, franja y «no importa acciones de servidor» siguen sin cambio: verificar
      que efectivamente pasan sin tocarlas

## Fase 5 · Verificación

- [x] 5.1 `e2e/analisis-riesgos.spec.ts`, en la forma de `e2e/grafo.spec.ts`: **sólo lectura** —
      abrir, comprobar las trece columnas, ordenar por una, mover una, fijarla, recargar y ver que
      la disposición sobrevive, y que el código abre el overlay con `activo=` y `tab=amenazas`
- [x] 5.2 Una pasada por teclado en el e2e: llegar a la grilla, recorrer celdas y activar el enlace
      del código sin ratón
- [x] 5.3 `npm run verificar:build` en limpio (Regla 2). `verificar:migraciones` no aplica: no hay
      migración, decirlo en el PR en una línea
### Recorrido ejecutado · Regla 3 (21/09/2026, base local 5432, quinta corrida)

Va tal cual al PR. El paso 5b es el que vale por las cinco corridas: lleva la medida en píxeles
del defecto que 2701 pruebas en verde no vieron, y el 9b es la costura tarjeta↔lista sin literal.

```
  1 · abrir la pantalla            -> 30 filas pintadas
  2 · tarjetas vs. lista           -> el rótulo dice 30 y hay 30 filas
  3 · las columnas                 -> Código · Nombre · Plan · Valor · D · I · C ·
                                      Criticidad · Proceso · Propietario · Peor residual
  4 · grupo de dimensiones         -> visible
  5 · sin barras de desplazamiento -> ni horizontal ni vertical en la grilla
  5b · sin barra horizontal en 1280-> contenido 930 ≤ disponible 930
  6 · Código fijada                -> la grilla declara columnas fijadas a la izquierda
  7 · ordenar por Nombre           -> el rótulo pasa a «orden personalizado»
  8 · ordenar no filtra            -> siguen 30 filas; arriba COM-APP-0001 → PRO-DAT-0014
  9 · mover Proceso                -> Código · Proceso · Nombre · Plan · Valor · D
  9b · filtrar por Nombre          -> la tarjeta EN ANÁLISIS cuadra con las filas visibles
  9c · limpiar filtros             -> vuelven las 30 filas
  10 · recargar                    -> Proceso sigue en la posición 1
  11 · restablecer                 -> Código · Nombre · Plan · Valor · D · I
  12 · clic en el código           -> abre el overlay de COM-APP-0001
  13 · con teclado                 -> Enter sobre el código abre el mismo overlay
```

Las once columnas del paso 3 son las trece menos «Amenazas» y «Peor inherente», que arrancan
escondidas para que no haya barra horizontal en 1280. Se encienden desde «Columnas».

- [ ] 5.4 **Lo único que el recorrido de arriba NO cubre: «+ plan».** El spec de `e2e/` sólo
      lee, por la regla que lo hace tolerable contra producción, y ese botón escribe.

      **Conducido hasta el borde del envío el 21/09/2026, sin enviar.** Lo que sí quedó visto,
      en navegador y sin un solo error de JS:

      - los 30 botones «+ plan», uno por fila;
      - el clic en el de `COM-APP-0001` abre el overlay sin cambiar la URL, y **no se queda en
        «Cargando»** — el patrón de efectos que mordió en otra pantalla no muerde acá;
      - el diálogo prellena bien: «5 amenazas marcadas · 4 planes a registrar», con el desglose
        por control principal, los tres filtros, la tabla con las amenazas que ya tienen plan
        enlazadas (A.6 → PT-013, E.1 → PT-012) y los campos de tratamiento;
      - botón «Registrar 4 planes» presente y habilitado.

      **Falta el envío, y sólo el envío.** No se pulsó a propósito: registrar planes de prueba
      ensuciaría la base local justo antes de que se creen los reales. Queda entonces sin
      ejercerse en navegador el camino que ESCRIBE — que en esta pantalla es el que más importa,
      porque es donde una persona toma una decisión.

      Para cerrarla: registrar un plan sobre un activo desechable en la base local (5432) y ver
      la columna Plan cambiar tras `router.refresh()`.
- [ ] 5.5 Anotar en el PR: versiones instaladas, delta del bundle, y qué pruebas quedaron en jsdom y
      cuáles se fueron al e2e

## Fase 6 · El piloto se evalúa

- [ ] 6.1 A las dos semanas de uso: ¿alguien cambió la disposición de columnas? Es la premisa
      entera del cambio. Si nadie la cambió, el criterio de reversión del proposal aplica
- [ ] 6.2 Con el resultado, decidir si se extiende al inventario completo (378 vigentes) — y ahí sí volver a
      mirar Enterprise, donde agrupar por proceso deja de ser comodidad
- [ ] 6.3 Decidir si el tablero de planes con arrastre
      (`docs/handoff_sig/tablero-planes-propuesta.html`) se construye sobre AG Grid o sigue propio.
      El arrastre de filas es Community, así que la pregunta no es de licencia sino de si conviene
      una segunda grilla de la misma librería antes de que el piloto haya rendido cuentas
