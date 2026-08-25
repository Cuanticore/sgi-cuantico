# Handoff v2 — Herramienta de Gestión de Activos y Riesgos (SGSI Cuántico)

## Overview

> **v2.1 — integración en sig.cuantico.com.** El módulo deja de ser una aplicación aparte: vive dentro del Sistema Integrado de Gestión, comparte su header azul y su sesión, y la autenticación es **integrada con Directorio Activo**. El menú se reorganizó en categorías (SIG · SGSI · Configuración) y se añadió la pantalla **Indicadores** (tablero del SGC) y una zona de **análisis descriptivo filtrable** en el Resumen SGSI.

Módulo de un SGSI para inventariar activos de información, valorarlos en Disponibilidad, Integridad y Confidencialidad, generar el conjunto de riesgos (activo × amenaza) según MAGERIT v3.0, evaluar la madurez de los 93 controles del Anexo A de ISO/IEC 27001:2022, gestionar el plan de tratamiento y reportar riesgo inherente y residual en matrices navegables.

**Once pantallas**: Acceso con Directorio Activo, Indicadores del SGC, Resumen SGSI (tablero + evaluación del SGSI + análisis descriptivo), Inventario de activos, Ficha del activo (modo creación y edición, 3 pestañas), Madurez de los controles, Amenazas y tipos, Matrices de riesgo, Planes de tratamiento, Parámetros, Metodología.

### Qué cambió respecto de v1 (y en las iteraciones posteriores)

| Cambio | Detalle |
|---|---|
| Índice de madurez | Es la **media de la eficacia**, no el promedio del nivel. Se reporta además la mediana del nivel como "nivel típico". |
| Diagrama de araña | Ejes = las **15 capacidades operativas de ISO/IEC 27002:2022**, no dominios inventados. |
| Controles | Los **93 controles reales del Anexo A** (86 aplican, 7 no) con línea base, actual, objetivo, evidencia y amenazas que mitiga. |
| Plan de tratamiento | Pantalla nueva con las 25 acciones del plan; una fila por mejora de control, no por riesgo. |
| Riesgos | Un único conjunto calculado (`riesgosGlobales()`) alimenta matrices, KPIs, informes y drill-down. No hay matrices precocinadas. |
| Matrices | Antes "Informes". Casillas navegables: abren la grilla de riesgos que contienen. |
| Inicio | Absorbió "Evaluación del SGSI". Todo el tablero es cliqueable estilo Power BI. |
| Exportaciones | Inventario y plan a Excel (.xls), informe del SGSI a Word (.doc) editable. |
| Menú | Reordenado, con bloque **Configuración**, y **colapsable a 64px** con abreviaturas. |
| Crear activo | La pantalla separada desapareció: la ficha tiene **modo creación**. |
| Ficha | **Franja inferior fija** con navegación entre activos, estado de sincronización, eliminar y guardar. Franja naranja movida a la pestaña Valoración, de lado a lado. |
| Semáforo CMM | L0–L1 rojo, L2–L3 naranja, L4–L5 verde, en las tres pantallas donde aparece la madurez. |
| Popups nuevos | Administrar catálogo (proveedores / propietarios / custodios), administrar control, editar acción del plan. |
| Bajas lógicas | Activos y acciones del plan se pueden eliminar, con banda de Deshacer. |
| Amenazas | Grilla compacta de 11 columnas; renglón rojo si el inherente es Alto o Crítico. |
| Inicio | Los once indicadores se consolidaron en **dos fichas temáticas**; el radar subió. |
| Integración | **Header azul corporativo** (`#061a3d → #1552a8`) sobre toda la app, con marca CUANTICO/SIG, pestañas Indicadores · SGSI e identidad de AD. El sidebar perdió su bloque de marca. |
| Autenticación | Pantalla de acceso réplica de `sig.cuantico.com/auth/signin` con SSO de Directorio Activo y permisos por grupo de AD. |
| Menú | Tres categorías: **Sistema Integrado de Gestión** (Indicadores, Resumen SGSI) · **SGSI** (Inventario, Matrices, Madurez, Planes) · **Configuración** (Parámetros, Amenazas y tipos, Metodología). |
| Paleta | Navegación y filtros pasaron a **azules** (`#12437f` / `#e9f0fb` / `#d3dceb`); el verde queda reservado para estado bueno (madurez L4–L5, riesgo bajo). |
| Analítica | Zona descriptiva filtrable de activos y riesgos por proceso, responsable, tipo y subtipo. |

## About the Design Files

Los archivos en `design/` son **referencias de diseño hechas en HTML**: un prototipo que muestra la apariencia y el comportamiento previstos, no código de producción para copiar. La tarea es **recrear estos diseños en el entorno del codebase destino** (React, Vue, Angular, Blazor…) usando sus patrones, librerías y componentes ya establecidos.

`design/Gestión de Activos.dc.html` usa un runtime propio de prototipado (`design/support.js`). No lo porten: lean el archivo como especificación de markup, estilos y lógica. La clase `Component` al final contiene el **motor de cálculo completo** — esa lógica sí es la referencia funcional a replicar.

`design/iso-controles.js` y `design/plan-tratamiento.js` son los datos reales extraídos del Excel (`window.ISO_CONTROLES`, `window.ISO_CAPACIDADES`, `window.ISO_DOMINIOS`, `window.PLAN_TRATAMIENTO`). En producción vienen de la base; sirven como semilla y como contrato de campos.

Para abrirlo: servir la carpeta `design/` por HTTP (`python3 -m http.server`) y abrir el `.dc.html`. No funciona con `file://`.

## Fidelity

**Alta fidelidad.** Colores, tipografía, espaciado, estados y copy son finales. Sustituir primitivas por las del design system del codebase cuando haya equivalentes (select, input, chip, tabla, modal).

## Requisitos de negocio incluidos

`requisitos/` es la fuente de verdad funcional. Ante discrepancia con el prototipo, **manda el documento**.

| Archivo | Contenido |
|---|---|
| `SPEC-herramienta-riesgos-v2.md` | Especificación funcional actualizada |
| `MET-SIG-01 Metodologia v3.docx` | Metodología aprobada, versión 3 |
| `MATRIZ MAGERIT - Activos y Riesgos (base) v2.xlsx` | Matriz vigente: activos, valoración, matrices, controles y madurez, madurez y progreso, plan de tratamiento, catálogos |
| `REQ-SIG-01-requerimiento.txt` | Requerimiento original |

---

## Modelo de dominio

```
Proceso 1─n Activo
Activo   n─1 Tipo MAGERIT (10) ─ 1─n Subtipo (dependiente del tipo)
Activo   n─1 Activo superior (autorreferencia, opcional)
Activo   1─3 Valoración por dimensión (D, I, C) escala 0–5
Activo   1─n Riesgo  (= Activo × Amenaza preclasificada de su tipo)
Riesgo   1─n ControlImplementado
Riesgo   1─1 Tratamiento (decisión, responsable, observaciones)
Control  n─1 Dominio Anexo A (4) · n─1 Capacidad operativa (15)
Control  1─n Evidencia (enlace, archivo, nota)
Control  1─n AccionPlan (plan de tratamiento)
```

Parametrización: Tipo, Subtipo, Amenaza, `AmenazaPorTipo`, Control, `ControlPorAmenaza`, escalas, umbrales, catálogos de listas.

### Escalas

**Valor por dimensión (0–5)** — desviación declarada (MAGERIT usa 0–10): 5 Muy Alto · 4 Alto · 3 Medio · 2 Bajo · 1 Muy Bajo · 0 Irrelevante.

**Degradación** (atributo de la amenaza): Muy alta 1.00 · Alta 0.80 · Media 0.50 · Baja 0.20 · Muy baja 0.05 · No aplica 0.00.

**Frecuencia esperada (ARO, veces/año)**: Muy alta 100 · Alta 10 · Media 1 · Baja 0.1 · Muy baja 0.01.

**Madurez CMM → eficacia**: L0 0% · L1 10% · L2 50% · L3 90% · L4 95% · L5 100%.

**Nivel de impacto**: Muy alto ≥4.5 · Alto ≥3 · Medio ≥1.5 · Bajo ≥0.5 · Despreciable <0.5.

**Nivel de riesgo**: Crítico ≥25 · Alto ≥5 · Medio ≥0.5 · Bajo <0.5.

### Fórmulas (implementar exactamente así)

```
valor(a)              = max(v_D, v_I, v_C)                    // calculado, no capturado
impacto_d(a,t)        = v_d(a) × degradación_d(t)
impacto(a,t)          = max(impacto_D, impacto_I, impacto_C)
riesgo(a,t)           = impacto(a,t) × aro(t)                  // inherente
eficacia(a,t)         = EFI[ madurezGrupo(a,t) ]
aro_residual(a,t)     = aro(t) × (1 − eficacia(a,t))
riesgo_residual(a,t)  = impacto(a,t) × aro_residual(a,t)
```

**No existe impacto residual.** Solo se modela el efecto preventivo: la eficacia reduce la frecuencia, nunca el impacto. Los controles que limitan el daño se reflejan bajando la degradación de la amenaza.

**Generación de riesgos**: producto cartesiano del activo por las amenazas que la parametrización preclasifica para su tipo. `riesgosGlobales()` en el prototipo. Un activo entra al análisis si `valor(a) ≥ umbral` (hoy 4).

### Métricas de madurez (regla del Excel, hoja «5. Madurez y Progreso»)

```
Índice de madurez = media de la EFICACIA de los controles aplicables   ← métrica principal
Nivel típico      = mediana del nivel L0–L5
Nivel medio       = media del nivel (SOLO referencia; promediar un ordinal no es riguroso)
% en L3 o más     = gestionados / aplicables
Cumplen objetivo  = nivel actual ≥ objetivo
Brechas           = nivel actual ≤ L2
Brecha total      = Σ max(0, objetivo − actual)
Avance medio      = media(actual − línea base)
```

Valores de referencia del Excel: 93 controles, 86 aplicables, 7 no aplicables, índice 86,7 %, nivel típico 3,00, nivel medio 3,23, 75 en L3+, 87,2 %, 26 en objetivo, 11 brechas, avance medio 3,10, brecha total 64.

**Madurez del grupo de controles de una amenaza**: promedio de los niveles CMM de sus controles vigentes, redondeado; sin controles → L0. Es la que fija la eficacia de ese riesgo.

### Zonas de riesgo (MAGERIT Libro I, cap. 3)

| Zona | Regla |
|---|---|
| Zona 1 — Crítica | impacto ≥ 3 y aro ≥ 1 |
| Zona 4 — Catastrófica poco probable | impacto ≥ 3 y aro < 1 |
| Zona 3 — Asumible | impacto < 1.5 y aro < 1 |
| Zona 2 — Atención | resto |

### Código de activo

`AAA-TTT-NNNN`: prefijo de área + abreviatura del tipo MAGERIT + consecutivo de 4 dígitos independiente por combinación área/tipo. Generado por el sistema, **inmutable**, no reutilizable, nunca editable. Se conserva el código heredado del inventario anterior.

Prefijos: `EST` Gestión Estratégica · `COM` Gestión Comercial · `PRY` Gestión de Proyectos · `TEC` Gestión Tecnológica · `TAL` Talento Humano · `FIN` Gestión Financiera · `SIG` Sistema Integrado de Gestión · `SOP` Soporte y Servicio al Cliente

Abreviaturas de tipo: `RED` [COM] · `DAT` [D] · `CLA` [K] · `SER` [S] · `APP` [SW] · `HRW` [HW] · `SOP` [Media] · `AUX` [AUX] · `INS` [L] · `PER` [P]

---

## Design Tokens

### Color

| Token | Hex | Uso |
|---|---|---|
| `bg/app` | `#f5f7f6` | Fondo de la aplicación |
| `bg/surface` | `#ffffff` | Tarjetas, sidebar, filas |
| `bg/subtle` | `#fbfcfb` | Encabezados de tabla, campos, detalle expandido |
| `border/default` | `#e2e6e3` | Bordes de tarjeta y tabla |
| `border/field` | `#d7dcd9` | Bordes de input y select |
| `border/hairline` | `#eceeed` / `#f2f4f3` / `#f5f7f6` | Separadores, de mayor a menor contraste |
| `text/primary` | `#1a211e` | Texto principal |
| `text/secondary` | `#3a443f` / `#4a544f` | Párrafo y celdas |
| `text/muted` | `#6b7570` | Descripciones y ayudas |
| `text/faint` | `#8a938e` | Metadatos |
| `text/label` | `#a3aca7` | Etiquetas mono en mayúsculas |
| `text/placeholder` | `#b6bdb9` / `#c3cac6` | Placeholders, celdas vacías |
| `accent/800` | `#0b3d2e` | Fondo de la tarjeta del índice de madurez |
| `accent/700` | `#0b5c44` | Hover primario, texto de acento |
| `accent/500` | `#0f7a5a` | Acento principal |
| `accent/300` | `#7fd8b4` | Texto y barra sobre `accent/800`; código en bloque oscuro |
| `accent/100` | `#e8f4ef` | Fondo de acento (chips, nav activo) |
| `accent/50` | `#f7fbf9` | Hover de fila, campo destacado |
| `accent/border` | `#c9e3d8` | Borde sobre fondo de acento |
| `brand/900` | `#061a3d` | Extremo oscuro del header y del login |
| `brand/700` | `#0d2f6b` | Azul corporativo medio (marca, botones del login) |
| `brand/500` | `#1552a8` | Extremo claro del degradado del header |
| `brand/nav` | `#12437f` | Texto y borde de navegación y filtros activos |
| `brand/100` | `#e9f0fb` / `#eef2f8` | Fondo de ítem de menú activo y hover |
| `brand/border` | `#d3dceb` | Borde de controles de filtro |
| `brand/300` | `#7fb0f0` / `#9dc0ea` | Texto secundario sobre azul · barra de activos |
| `brand/gold` | `#c8a86a` | Acento de la marca en el login |
| `warn/500` | `#ef8020` | Franja naranja, borde de campo con excepción |
| `warn/100` | `#fff3e6` | Fondo de la franja |
| `warn/border` | `#f2b473` | Borde de la franja |
| `warn/text` | `#8a4407` / `#a05512` / `#7d4a15` | Texto sobre naranja |
| `risk/critico` | bg `#a52016` fg `#ffffff` | Nivel Crítico |
| `risk/alto` | bg `#c25a1e` fg `#ffffff` | Nivel Alto |
| `risk/medio` | bg `#e0b93c` fg `#3a2c05` | Nivel Medio |
| `risk/bajo` | bg `#dfe8e2` fg `#3d5648` | Nivel Bajo |
| `cmm/rojo` | fg `#a52016` bg `#fdeeeb` bd `#f2cdc6` | **Madurez L0 y L1** |
| `cmm/naranja` | fg `#8a4407` bg `#fff3e6` bd `#f2b473` | **Madurez L2 y L3** |
| `cmm/verde` | fg `#0b5c44` bg `#e6efe9` bd `#c9e3d8` | **Madurez L4 y L5** |
| `cmm/nulo` | fg `#a3aca7` bg `#f5f7f6` bd `#e2e6e3` | Sin nivel (no aplica) |
| `level/*` | `#f7dcd9`/`#8a1f16` · `#fbe6d2`/`#8a4407` · `#faf1d3`/`#6b5410` · `#e6efe9`/`#3d5648` · `#eef1ef`/`#5a635e` | Badges Muy Alto → Muy Bajo |
| `row/rojo` | `#fdeeeb` (hover `#fbe2dd`) | Renglón con residual 4–5 |
| `row/verde` | `#eef7f1` (hover `#e3f1e8`) | Renglón con residual o inherente 1–3 |
| `row/blanco` | `#ffffff` (hover `#f7fbf9`) | Renglón con valor 1–3 |
| `danger/*` | text `#a52016` · border `#e6d3d1` · bg `#fdeceb` | Botones de eliminar |
| `code/bg` | `#1a211e` | Bloque de fórmulas |
| `overlay` | `rgba(20,28,24,0.42)` | Fondo de modal |

### Tipografía

- **Sans:** Libre Franklin (400/500/600/700)
- **Mono:** JetBrains Mono (400/500/600) — códigos, cifras, etiquetas en mayúsculas

Escala: 8.5 · 9 · 9.5 · 10 · 10.5 · 11 · 11.5 · 12 · 12.5 · 13 · 13.5 · 14 · 14.5 · 15 · 16 · 17 · 19 · 20 · 22 · 23 · 24 · 26 · 32 · 34 · 46 px

Etiquetas de campo: mono, 8.5–9px, `letter-spacing: 0.06–0.07em`, mayúsculas, color `text/label`. Títulos de página 23px/700 con `letter-spacing: -0.02em`. Cifras grandes mono 600 con `line-height: 1`. Párrafos 12.5–13.5px, `line-height` 1.5–1.65, `text-wrap: pretty`, 62–86ch.

### Espaciado y forma

- Padding de página: `26px 32px 18px` (header) · `20–24px 32px 44–56px` (cuerpo)
- Gaps: 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 32 · 34 px
- Radios: 3 (swatch) · 4 (badge) · 5 · 6 (campo/botón) · 7 · 8 · 9 · 10 (tarjeta) · 12 (modal, tarjeta hero) · 20px (chip) · 50% (avatar)
- Sombra de modal: `0 24px 60px rgba(12,24,18,0.28)`
- Flex/grid con `gap` siempre; nunca márgenes entre hermanos

### Regla de layout que causó defectos repetidos

Toda tabla ancha va en `<div style="overflow-x: auto"><div style="min-width: Npx">` y **el `min-width` debe ser ≥ suma de columnas + padding de fila**. Las tarjetas con `overflow: hidden` no pueden ser las dueñas del desborde horizontal. Las rejillas de dos columnas usan `repeat(auto-fit, minmax(380px, 1fr))` con `min-width: 0` en las tarjetas, no fracciones fijas.

---

## Screens / Views

Sidebar de 244px, fondo blanco, borde derecho, **sticky con scroll propio y colapsable a 64px** (botón bajo el logo: ⟨ / ⟩). Colapsado muestra solo una abreviatura única en mono por entrada — INI, INV, MTZ, MAD, PLA, PAR, AMZ, MET — con el nombre completo en `title`, y oculta el pie; el área de contenido crece.

Orden del menú: **Inicio · Inventario de activos (n) · Matrices de riesgo · Madurez de los controles (93) · Planes de tratamiento (n)**, separador con encabezado **CONFIGURACIÓN** y tres subentradas indentadas: **Parámetros · Amenazas y tipos (36) · Metodología (MET-SIG-01)**. Ítem activo con fondo `accent/100` y texto `accent/700`. Al pie (solo expandido): línea base vigente, contador de activos y riesgos derivado del dataset, avatar con rol.

No hay entrada de menú para crear o ver un activo: **"Nuevo activo" abre la ficha en modo creación** y el inventario abre la ficha del activo elegido.

---

### 0. Acceso — Directorio Activo

Réplica de `sig.cuantico.com/auth/signin`: dos columnas a sangre completa. Izquierda, panel azul con degradado radial (`brand/500 → brand/900`), retícula tenue y el wordmark **CUANTICO** en 52px/300 con `letter-spacing: 0.28em`. Derecha, tarjeta centrada de 380px: marca cuadrada, **CUANTICO**, subtítulo **SISTEMA INTEGRADO DE GESTIÓN**, botón **Siguiente** de ancho completo (`#1e3a7b`), "Acceso exclusivo para colaboradores de Cuantico" y la nota "autenticación integrada con Directorio Activo".

**Autenticación.** SSO integrado con el Directorio Activo de CUANTICO; la aplicación no almacena contraseñas. Los permisos se derivan de la pertenencia a grupos de AD:

| Grupo de AD | Permiso |
|---|---|
| `SIG-Seguridad` | Lectura y escritura en todo el SGSI, incluida la parametrización |
| `SIG-Propietarios` | Valorar y tratar los activos de su proceso |
| `SIG-Auditoría` | Solo lectura, con acceso a la bitácora y a las evidencias |
| `Domain Users` | Sin acceso: la aplicación no aparece en el portal |

En producción esto es OIDC/SAML contra Entra ID o Kerberos contra el DC on-premise; el prototipo sólo conmuta `auth`.

### 0b. Header corporativo

Barra sticky de 58px sobre sidebar y contenido, degradado `96deg, #061a3d → #0d2f6b 46% → #1552a8`: marca CQ + **CUANTICO / SIG**, pestañas **Indicadores · SGSI** (la activa con `rgba(255,255,255,0.18)`; Metodología vive sólo en el bloque Configuración del menú lateral), y a la derecha la identidad de AD (`Líder del SIG`, `CUANTICO\lsig · AD`) con avatar. El sidebar arranca bajo el header (`top: 58px`, `height: calc(100vh - 58px)`) y ya no repite la marca: sólo conserva el botón de colapsar.

### 0c. Indicadores (SGC)

Tablero vigente de sig.cuantico.com traído como pantalla del módulo: cuatro KPI con borde superior de color (avance global 76,9 %, en meta 11, en alerta 3, críticos 6), **selector de año 2026/2025** en pastilla azul dentro de la cabecera de la página (no en el header), cumplimiento por proceso en barras con semáforo (≥95 verde, ≥85 ámbar, resto rojo) y una tarjeta **Aporte del SGSI al SIG** con cuatro indicadores cliqueables que llevan a Madurez, Matrices, Planes e Inventario.

### 1. Resumen SGSI (Inicio)

Tablero unificado. **Todo elemento con dato es un `<button>` navegable, estilo Power BI**, con hover `accent/50`.

**Zona de eficacia (primera).** Tarjeta hero a doble ancho, fondo `accent/800`, radio 12px: etiqueta `ÍNDICE DE MADUREZ · INDICADOR PRINCIPAL`, cifra 46px en blanco, delta en pill `accent/300`, barra de avance con línea base y objetivo, y la brecha en puntos porcentuales. Junto a ella, **dos fichas que consolidan los indicadores por tema**, cada una con un titular y cuatro filas cliqueables (la fila lleva a Madurez de los controles con su filtro):

- **Alcance y aplicabilidad** — titular 93 controles del Anexo A; filas: aplicables, no aplicables con justificación, gestionados en L3 o superior (n · %), cumplen su objetivo.
- **Nivel y brecha** — titular nivel típico (mediana); filas: nivel medio como referencia, avance medio desde la línea base, brechas prioritarias en L2 o menos, brecha total hasta el objetivo. Las dos últimas en `risk/alto`.

El radar y la tabla de brecha van **inmediatamente después de estas fichas**; las seis tarjetas de resumen bajan a continuación.

**Tarjetas de resumen (6).** Activos inventariados · Riesgos analizados · Riesgos altos sin tratamiento · Controles que aplican · Brechas en L2 o menos · Amenazas parametrizadas. Borde superior de 3px con el color de acento o de alerta, cifra 32px, CTA con flecha.

**Diagrama de araña.** SVG con **15 ejes = capacidades operativas de ISO 27002:2022**. Cinco anillos etiquetados 20–100 %. Polígono sólido `accent/500` con relleno `rgba(15,122,90,0.16)` = madurez actual; polígono punteado = objetivo (`warn/500`) o línea base anterior (`text/label`), conmutable con dos chips. Cada eje rotula la capacidad y su porcentaje. Geometría: centro (250, 236), radio 176, **viewBox `42 28 416 416`** (encuadre simétrico respecto del centro real; un viewBox desalineado empuja el polígono abajo y a la derecha), etiquetas a 1.1× del radio con `text-anchor` según el cuadrante.

**Brecha por capacidad.** 15 filas cliqueables: capacidad, controles en L3+, mediana, barra de eficacia, porcentaje y brecha coloreada. Llevan a Controles filtrado por esa capacidad.

**Riesgo inherente frente a residual.** Cuatro filas (Crítico → Bajo) con barra clara = inherente y barra sólida = residual, más ambos conteos. Nota explicando que el residual sube en niveles bajos porque los controles mueven riesgos hacia abajo, no los eliminan.

**Separador + «Evaluación del SGSI»** (h2, con `INF-SIG-04 · LÍNEA BASE 2026-Q3 · COMPARATIVO CONTRA 2026-Q1` y los botones *Comparar otros periodos* y *Generar informe en Word editable*):

- **Resumen ejecutivo comparativo** — indicador, Q1, actual, variación. Todos los deltas usan el mismo signo tipográfico U+2212 y se colorean en verde cuando son mejora.
- **Progreso por periodo** — Q1/Q2/Q3 con barra del índice, L3+, altos y sin tratamiento.
- **Brechas prioritarias L2 o menos** — hasta 12 controles, cliqueables al control.
- **Riesgos altos y críticos sin tratamiento** — derivados del dataset: residual Alto o Crítico **sin decisión de tratamiento registrada**. Filas cliqueables a la ficha del activo en su amenaza.
- **Qué debe contener el informe** — citas de MAGERIT Libro I cap. 4, Libro II, ISO 27001 6.1.2/6.1.3 y 9.1/9.3, ISO 27005.
- **Conclusiones** que se incluirán en el documento generado.
- **Análisis descriptivo filtrable** — dos tarjetas. A la izquierda, *Activos y riesgos por <dimensión>* con chips de dimensión (**Proceso · Responsable · Tipo · Subtipo**), hasta 12 filas ordenadas por número de riesgos, barra clara de activos (`brand/300`) y barra sólida de riesgos (`brand/nav`, o `risk/alto` si el segmento tiene residuales Altos o Críticos) más ambos conteos. Pulsar una fila la selecciona y **cross-filtra** la tarjeta derecha, *Riesgo del segmento*: activos, riesgos, altos+, valor medio del activo y la distribución inherente/residual por nivel, con *Quitar el filtro* y acceso al inventario.
- **Entidades del sistema** — seis contadores cliqueables a su tabla paramétrica.

### 2. Inventario de activos

Header con *Importar del Excel*, **Exportar a Excel** y *Nuevo activo* (abre la ficha en modo creación). Bajo el header, cuando se elimina un activo, aparece una **banda roja con Deshacer**. Tres filas de controles: **Agrupar por** (`Proceso → Tipo` por defecto, `Tipo → Proceso`, `Proceso → Nivel`), buscador y contador; **filtros** de Tipo, Subtipo (dependiente) y Responsable con *Limpiar*; **chips de color de renglón** que además filtran, con su conteo.

Grilla con scroll horizontal, `min-width: 1620px`, doce columnas:

```
150 | minmax(170,0.85fr) | 168 | 168 | 126 | 126 | 126 | 74 | 104 | 124 | 124 | 92
CÓDIGO ACTIVO SUBTIPO PROPIETARIO DISPONIBILIDAD INTEGRIDAD CONFIDENCIALIDAD VALOR NIVEL R.INHERENTE R.RESIDUAL RIESGOS
```

Agrupación en dos niveles colapsables. **D, I y C se editan en la grilla** con selects que muestran la etiqueta completa ("4 — Alto"); al desviarse del valor original el borde se marca en `warn/500`, y valor, nivel y color del renglón se recalculan al instante.

**Color del renglón** (precedencia estricta): residual ≥ 4 → rojo; valor ≤ 3 → blanco; residual ≤ 3 o inherente ≤ 3 → verde; resto → blanco.

**Exportar a Excel** descarga el inventario filtrado con 17 columnas (código, heredado, activo, proceso, tipo, subtipo, propietario, custodio, proveedor, D/I/C con etiqueta, valor, nivel, riesgo inherente y residual con nivel, riesgos generados).

### 3. Ficha del activo — modo creación

No hay pantalla separada de creación: la ficha soporta `nuevo = true`. En ese modo el nombre y la descripción arrancan vacíos, el chip de código muestra la **previsualización `AAA-TTT-NNNN` construida en vivo desde proceso + tipo** con la nota "previsualización — se asigna al crear el activo" y "sin código heredado", la valoración arranca en 0 (no hay franja naranja hasta valorar), una banda verde clara explica el modo, y el botón principal dice **Crear activo**.

### 4. Ficha del activo

Header con chip de código inmutable + código heredado, **nombre y descripción editables en línea** (el nombre envuelto en `h1`) y *Ver bitácora*.

**Franja inferior fija** (`position: sticky; bottom: 0`, borde superior y sombra hacia arriba): código del activo, **Atrás / Siguiente** para recorrer el inventario con el contador "n de N", **indicador de sincronización** (en blanco cuando todo está guardado; "Cambios sin guardar" en ámbar al editar; "Guardando…" y luego "Sincronizado", con punto de color), y los botones **Eliminar activo** (baja lógica + banda con Deshacer en el inventario), *Cancelar* y **Guardar cambios / Crear activo**.

Zona de datos generales: a la izquierda, tarjeta con proceso, propietario, custodio, ubicación, entorno, proveedor o subencargado, activo superior con buscador y contenido sensible — **todos editables**. A la derecha, tarjeta resaltada con borde `accent/500` de 2px y etiqueta flotante `CLASIFICACIÓN MAGERIT` con **Tipo y Subtipo** como selects grandes: es el énfasis visual pedido.

**Tab 1 · Valoración.** La **franja naranja de gestión de riesgo vive aquí**, de lado a lado sobre las tarjetas (aparece cuando `valor(a) ≥ umbral`; texto en línea y botón *Ir a Amenazas* al extremo derecho). Debajo, tres tarjetas (D, I, C) con select de la escala, **el ejemplo del manual correspondiente al nivel elegido** y los otros niveles abreviados. Cierra con el valor calculado con badge, el umbral de entrada y los riesgos generados.

**Tab 2 · Amenazas.** Cargadas de la parametrización del tipo del activo — el mismo predicado que usa `riesgosGlobales()`, así que la lista, el contador «N de M activas» y el drill-down concuerdan. Botones *+ Agregar amenaza* (popup con el resto del catálogo, se marca como excepción) y *Restaurar parametrización*. Chip **Amenazas sin gestionar** con su conteo. Tabla compacta de 11 columnas, `min-width: 1120px` — pensada para que **el riesgo residual entre sin scroll**:

```
54 | minmax(85px, 0.5fr) | 72 | 72 | 72 | 104 | 112 | 52 | 104 | 104 | 32
CÓD. AMENAZA(+grupo) DEG-D DEG-I DEG-C IMPACTO FRECUENCIA V/AÑO R.INHERENTE R.RESIDUAL ×
```

Impacto, riesgo inherente y residual apilan **cifra + badge de nivel** en una sola columna; el grupo MAGERIT va como línea secundaria bajo el nombre de la amenaza; la zona MAGERIT se movió al detalle expandido. **Degradación D/I/C y frecuencia editables** (marca naranja al desviarse) y botón de eliminar con banda de deshacer.

**Renglón en rojo claro (`row/rojo`) cuando el riesgo inherente es Alto o Crítico.**

Detalle expandido: nota del escenario con la zona MAGERIT; **madurez del grupo de controles (promedio)** con su eficacia y frecuencia residual, en una tarjeta **coloreada con el semáforo CMM**; **grilla de Controles implementados** (`66 | minmax(90px, 0.6fr) | 214 | 228 | 92 | 30`, compacta para que madurez y efecto queden junto al nombre) cuyos dos campos clave son **Madurez CMM** y **Efecto sobre el riesgo** (previene → frecuencia / limita → degradación), con eliminación y alta; y zona de **Riesgo residual y tratamiento** (residual, tratamiento sugerido por nivel y sobrescribible, responsable con su plazo, observaciones).

**Tab 3 · Resumen.** Dos matrices 5×5 del activo (inherente y residual) con distribución por nivel y cuatro KPI.

### 5. Controles y madurez

Header con el índice de madurez y el anterior, filtro y *Exportar declaración de aplicabilidad*.

**Seis tarjetas-filtro cliqueables** (estilo Power BI, toggle con borde `accent/500` cuando están activas): controles del Anexo A, índice de madurez, nivel típico, gestionados en L3+, cumplen su objetivo, brechas prioritarias. Cada una aplica su filtro sobre la grilla; volver a pulsarla lo quita.

Filtro completo: Todos · Solo brechas L2− · Solo gestionados L3+ · Solo en objetivo · Solo en el plan de tratamiento · Solo no aplicables · los 4 dominios · las 15 capacidades.

Dos tarjetas de análisis: **distribución por nivel** (línea base / actual / objetivo con barra) y **madurez por dominio del Anexo A** (mediana, eficacia media, % en L3+), con la nota de por qué se reporta mediana del nivel y media de eficacia.

Tabla de 93 filas, `min-width: 1340px`: código, control, dominio, capacidad operativa, **select de madurez**, base, objetivo, eficacia con barra, y una celda final con el badge de evidencia, el **botón «+» que agrega el control al plan de tratamiento** (pasa a «✓» y navega a la acción si ya existe) y el **botón ✎ que abre el popup de administración del control**.

**Popup de administración del control.** Tres tarjetas coloreadas con el semáforo CMM — **versión inicial (línea base) · madurez actual (borde de 2px) · versión objetivo** — cada una con su etiqueta y eficacia; selector de madurez tintado con el color del nivel; brecha y avance; la acción del plan asociada (código, estado, responsable, fecha) con botón para editarla; las amenazas que mitiga (código y nombre, uno por renglón); y la gestión completa de evidencias. La **eficacia es clicable ("ver fórmula")** y despliega un bloque oscuro con las seis fórmulas (tabla EFI por nivel, madurez del grupo, ARO residual, riesgo residual, índice de madurez) y el cálculo concreto del control abierto.

**Evidencias en lote.** El campo es un `textarea`: cada línea (o separación por `;`) crea una evidencia con el tipo seleccionado. La evidencia base de la evaluación (`c.ev`) **no lleva botón de eliminar** — solo las agregadas (`quitable: i >= nBase`).

Detalle expandido: calificación vigente con eficacia y avance, **amenazas que mitiga con código y nombre en dos líneas**, criterio de calificación (L3 exige procedimiento documentado; sin evidencia el máximo admisible en auditoría es L2), y la lista de **evidencias** (enlace / archivo / nota) con alta en lote y baja.

### 6. Amenazas y tipos

Parametrización por tipo de activo. Selector de tipo, contador y *+ Relacionar amenaza con este tipo*; *Descartar cambios* y *Publicar parametrización*. Tabla en contenedor con scroll, `min-width: 1080px`: código, amenaza con su nota, grupo, **degradación D/I/C y frecuencia editables** (marca naranja al desviarse del valor publicado), número de tipos a los que aplica y baja.

### 7. Matrices de riesgo

Filtros de **proceso, responsable y categoría** que filtran el dataset real; contador `N riesgos en el filtro, de M`. Dos matrices 5×5 (inherente y residual) en rejilla `auto-fit minmax(480px, 1fr)`, casillas de `aspect-ratio: 1.6/1` coloreadas por nivel, con conteo y abreviatura escritos.

**Casilla cliqueable**: abre arriba una banda de detalle con el nivel, los ejes de la casilla y su conteo, y una grilla con scroll (`min-width: 1240px`) de hasta 60 riesgos — código, activo, proceso, propietario, tipo, amenaza, impacto, veces/año, riesgo y nivel. **Clic en una fila abre la ficha del activo en esa amenaza.** La casilla seleccionada queda con `outline` oscuro.

Debajo: diez amenazas con más riesgos altos y críticos (derivadas del filtro) y la leyenda de color con sus rangos.

### 8. Planes de tratamiento

`PLA-SIG-02 · ISO/IEC 27001:2022 cláusulas 6.1.3 y 8.3`. **Una fila por acción, no por riesgo**: la unidad de gestión es la mejora de un control, porque al subir su madurez bajan de golpe todos los riesgos que ese control mitiga.

Filtro (todas · no iniciada · en curso · cerrada · solo mitigar · solo aceptar), *Exportar a Excel* y *Agregar desde controles*. Al eliminar una acción aparece una **banda roja con Deshacer**.

Seis KPI: acciones en el plan, de mitigación, cerradas, sin iniciar, **salto pendiente de madurez** (Σ max(0, objetivo − actual)), riesgos alcanzados.

Tabla `min-width: 1420px`: código, acción, tipo de tratamiento, control (cliqueable al control), **MADUREZ ACTUAL → OBJETIVO** (barra de doble capa: la clara marca el objetivo y la sólida el estado actual, con L actual y L objetivo a los lados), **salto = objetivo − actual** (columnas H/I/J de la hoja), riesgos que mueve y de ellos cuántos son residual medio o superior —rotulado `RIESGOS · MUESTRA` porque se calcula sobre la muestra de activos del prototipo, no sobre el inventario completo—, responsable, fecha objetivo con barra de avance, y select de estado.

Los badges de L actual y L objetivo y la barra de doble capa usan el **semáforo CMM**; el botón ✎ de la fila abre el **popup de edición de la acción**.

Detalle expandido: origen y justificación, control asociado con su capacidad, aprobación y verificación de eficacia, y **tres tarjetas — versión inicial, madurez actual y versión objetivo — cada una con su eficacia y coloreada por su nivel**. Nota de que al cerrar la acción se registra la madurez alcanzada y el residual de los riesgos afectados se recalcula solo.

**Popup de edición de la acción.** Campos: acción, tipo de tratamiento, **control asociado (combo que muestra código + nombre)** con enlace a "administrar el control", estado, responsable, aprueba, fecha objetivo, origen y justificación, verificación de eficacia y observaciones. Pie con **Eliminar la acción del plan**, *Cancelar* y **Guardar acción**.

Las 25 acciones semilla salen de la hoja «6. Plan de Tratamiento»; 18 son de mitigación y 7 son declaraciones de no aplicabilidad ya cerradas (los controles físicos, por operar 100 % en teletrabajo).

### 9. Configuración del modelo

Ocho secciones con índice en fila de enlaces: **1** parámetros globales (umbral, dimensiones activas, escala, línea base, periodicidad, métrica del índice, borrado físico deshabilitado); **2** tipos y subtipos con abreviatura, conteo y amenazas, más acceso a Amenazas y tipos; **3** las cuatro escalas; **4** umbrales de impacto y de riesgo; **5** zonas y criterios de aceptación; **6** procesos y prefijos de codificación; **7** catálogos de listas (ubicaciones, entornos, **proveedores editables**, contenido sensible, tipos de evidencia, opciones de tratamiento, efecto del control, grupos de amenazas); **8** las 15 capacidades operativas con su eficacia y objetivo, y los seis roles.

### 10. Metodología

Documento navegable de ocho secciones: propósito y alcance; dimensiones y **desviaciones declaradas** (tres dimensiones en vez de cinco con las cuatro amenazas reasignadas a Integridad; escala 0–5 en vez de 0–10); inventario y codificación; escalas; fórmulas en bloque oscuro; umbrales y zonas; criterios de aceptación; roles y periodicidad.

---

## Interactions & Behavior

| Disparador | Efecto |
|---|---|
| Cualquier tarjeta o fila con dato en Inicio | Navega a la pantalla y filtro correspondientes |
| Chips del radar | Alternan objetivo / línea base anterior |
| Tarjeta-filtro en Controles | Aplica o quita ese filtro sobre la grilla |
| Cambio de valoración D/I/C (grilla o ficha) | Recalcula valor, nivel, color de renglón, impactos, riesgo inherente y residual, matrices, KPI y franja de alerta |
| Cambio de degradación o frecuencia | Recalcula la fila y las matrices; marca la excepción en naranja |
| Cambio de madurez de un control (ficha) | Recalcula el promedio del grupo, la eficacia, la frecuencia residual y el residual |
| Cambio de madurez de un control (Controles) | Recalcula índice, mediana, distribución, radar y todos los riesgos que ese control mitiga |
| Botón «+» en Controles | Crea la acción PT-nnn en el plan con la acción, el origen y el objetivo del control; si ya existe, navega a ella |
| Clic en casilla de matriz | Abre la grilla de riesgos de esa casilla |
| Clic en fila del drill-down | Abre la ficha del activo en la amenaza |
| Registrar tratamiento en la ficha | El riesgo sale de «altos sin tratamiento» |
| Botón (+) junto a Proveedor, Propietario o Custodio | Abre el popup de administración de ese catálogo: alta, renombrado (se propaga a los activos que lo referencian) y baja, con el conteo de activos que lo usan; el valor protegido («No aplica») no se puede borrar |
| Colapsar el menú | El sidebar pasa a 64px con abreviaturas y el contenido crece |
| Atrás / Siguiente en la franja fija | Carga el activo anterior o siguiente con su valoración y amenazas |
| Editar cualquier campo de la ficha | El indicador pasa a «Cambios sin guardar»; Guardar muestra «Guardando…» y luego «Sincronizado» |
| Eliminar activo | Baja lógica: sale del inventario, de las matrices y de los KPI; banda con Deshacer |
| Eliminar acción del plan | Baja lógica: sale de la grilla y de los KPI; banda con Deshacer |
| Clic en la eficacia del popup de control | Despliega el bloque de fórmulas |
| Botón «Siguiente» del acceso | Simula el SSO de AD y entra al módulo (`auth: true`); «Salir» vuelve al acceso |
| Pestañas del header azul | Indicadores · SGSI (Resumen) |
| Chips de dimensión del análisis descriptivo | Recalculan el gráfico por proceso, responsable, tipo o subtipo |
| Clic en una barra del análisis descriptivo | Cross-filtra la tarjeta de riesgo del segmento; volver a pulsarla lo quita |
| Select de estado en el plan | Actualiza el avance (No iniciada 0 %, En curso 50 %, Cerrada 100 %) y los KPI |
| Exportar a Excel / Word | Descarga `.xls` o `.doc` construido en cliente, editable |

**Popups.** Overlay `overlay`, tarjeta blanca radio 12px con sombra, alineada arriba (`padding: 56–78px 20px` según el alto), cabecera con × de 28px, cuerpo con scroll (`max-height: 60–62vh`) y estado vacío centrado. Seis popups: activo superior (buscador), agregar amenaza, **administrar catálogo** (proveedores / propietarios / custodios), **administrar control**, **editar acción del plan**.

**Accesibilidad.** El color nunca es el único portador de significado: cada casilla, badge y renglón lleva su nivel escrito. Mantener esa regla al portar.

## State Management

```
screen            indicadores | inicio | inventario | activo | controles | param | informes | plan | config | metodologia
auth              sesión de Directorio Activo simulada (false muestra la pantalla de acceso)
dimA / selA       dimensión del análisis descriptivo y segmento seleccionado
agrupar           'proceso|tipo' | 'tipo|proceso' | 'proceso|nivel'
colapsados        { claveDeGrupo: bool }
finv              { tipo, subtipo, responsable, color }
valInv            { codigoActivo: { D, I, C } }      valoración editada en la grilla
activoId / tab    activo abierto y pestaña
val / edit        valoración y campos generales en edición
degOv / frecOv    excepciones de degradación y frecuencia por amenaza
eliminadas / agregadas / ctlEliminados / madurezCtl
trat              { codigoAmenaza: { decision, responsable, obs } }
soloSinGestionar  bool
isoMad            { codigoControl: nivel 0..5 }
isoEv             { codigoControl: [ { tipo, texto, meta } ] }
isoDom            filtro de la grilla de controles (incluye «solo gestionados L3+», «solo en objetivo», «solo en el plan»)
ctlSel / cpNota   control abierto en el popup · bloque de fórmulas desplegado
menu              sidebar expandido o colapsado
nuevo / sync      ficha en modo creación · estado de sincronización (null | pendiente | guardando | ok)
cats / cat / catNuevo      catálogos editables, catálogo abierto y valor en captura
actEliminados / actUltimoBorrado   bajas lógicas de activos y aviso de deshacer
planOv / planEdit          overrides de acciones del plan y acción en edición
planEliminados / planUltimoBorrado bajas lógicas de acciones y aviso de deshacer
isoAbierto        control expandido
evNueva           { tipo, texto }
paramTipo / paramOv   parametrización de amenazas por tipo
radarVista        'objetivo' | 'anterior'
planExtra         acciones agregadas desde Controles
planEstado        { codigoAccion: estado }
planFiltro / planAbierta
filtro            { proceso, responsable, categoria }  matrices
celda             { matriz, key, i, j }  casilla seleccionada
popup             null | 'superior' | 'superiorFicha' | 'amenaza'
nf                formulario de creación
```

Parámetros expuestos como props: `umbralValoracion` (int 0–5, por defecto 4) y `agrupacionInicial`. En producción son parámetros administrables.

**Una sola fuente de verdad.** `activos()` filtra las bajas lógicas y `riesgosGlobales()` es el único origen de riesgos; matrices, KPI, informes y drill-down se derivan de él. No reintroducir matrices precocinadas: fue la causa de varios defectos de cifras contradictorias.

**Bitácora.** No hay borrado físico; toda baja es lógica. Cada cambio registra autor, fecha, valor anterior y motivo. Las excepciones (degradación o frecuencia distintas de la parametrización, amenazas agregadas o eliminadas, tratamiento sobrescrito) exigen justificación.

## Assets

Ninguna imagen ni icono de terceros. Glifos usados como texto: `←` `→` `▾` `▸` `×` `!` `◆` `↓` `↗` `▤` `✎` `✓` `+`. Sustituir por la librería de iconos del codebase si existe.

Fuentes: Libre Franklin y JetBrains Mono desde Google Fonts.

## Nota sobre la carpeta «Indicadores»

El usuario adjuntó el código del tablero actual de indicadores, pero las herramientas de lectura de carpeta local no estuvieron disponibles en la sesión: el header azul, el login y la pantalla de Indicadores se reconstruyeron **a partir de capturas** de sig.cuantico.com. Al integrar, tomar los tokens reales (azules, tipografía, logo) del código existente y sustituir los valores aproximados de la tabla `brand/*`. El wordmark y la imagen de fondo del login son placeholders.

## Files

```
design/Gestión de Activos.dc.html   Prototipo completo: markup, estilos inline y clase Component con el motor de cálculo
design/support.js                   Runtime del prototipo — no portar
design/iso-controles.js             93 controles del Anexo A con dominio, capacidad, aplicabilidad, base/actual/objetivo, evidencia y amenazas
design/plan-tratamiento.js          25 acciones del plan de tratamiento
requisitos/SPEC-herramienta-riesgos-v2.md
requisitos/MET-SIG-01 Metodologia v3.docx
requisitos/MATRIZ MAGERIT - Activos y Riesgos (base) v2.xlsx
requisitos/REQ-SIG-01-requerimiento.txt
```

## Preguntas abiertas para el cliente

1. Plazos de la tabla de criterios de aceptación: pendientes de ratificación del Comité del SIG.
2. Cómo derivar el nivel 1–5 de riesgo inherente y residual **por activo** para las columnas del inventario (máximo, promedio, percentil). Hoy es un mapa fijo en el prototipo.
3. Si «Agregar control implementado» en la ficha debe abrir un popup de búsqueda sobre el catálogo ISO completo o limitarse a los controles asociados a la amenaza en la parametrización.
4. Si el efecto «Limita el daño» debe poder bajar la degradación a nivel del riesgo individual o solo a nivel de la amenaza en la parametrización (el SPEC indica lo segundo).
5. Si la madurez del grupo de controles de una amenaza debe seguir siendo promedio de niveles o pasar a media de eficacia, para alinearse con la métrica de reporte.
6. Los conteos de «riesgos que mueve» de cada acción del plan están calculados sobre la muestra de activos del prototipo; los del Excel corresponden al inventario completo. Al portar, recalcular sobre el inventario real.
