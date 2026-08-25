# Módulo SGSI (Handoff v2.1) — Plan maestro

> **For agentic workers:** este es el plan índice. Cada fase tiene su propio plan detallado en `docs/superpowers/plans/2026-08-24-sgsi-f<N>-*.md`, creado al iniciarla. No implementar desde este archivo: usarlo para saber en qué fase estamos y qué falta.

**Goal:** Dejar el SIG con dos dominios bajo un mismo shell — Indicadores (SGC, ya existente) y SGSI (once pantallas nuevas) — visualmente fiel a `docs/handoff_v2` y numéricamente correcto.

**Diseño:** `docs/superpowers/specs/2026-08-24-sgsi-handoff-v2-design.md`

**Tech Stack objetivo:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, Postgres + Prisma, npm, NextAuth v4 + Azure AD (existente), ECharts (indicadores), Jest.

**Regla transversal:** los datos se calculan. `riesgosGlobales()` es la única fuente de riesgos. Ninguna matriz precocinada.

---

## Estado por fase

| Fase | Pasos | Estado |
|---|---|---|
| F1 · Cimientos | 1–4 | **Completada** |
| F2 · Base de datos | 5–9 | **Completa** |
| F3 · Semilla | 10–14 | **Completa** salvo los 272 pares |
| F4 · Motor | 15–20 | **Completa** |
| F5 · Design system | 21–26 | **Completa** |
| F6 · Las once pantallas | 27–37 | **Completa** |
| F7 · Interacción | 38–41 | **Completa** |
| F8 · Accesos y cierre | 42–45 | **Completa** · build de imagen sin verificar |

---

## F1 · Cimientos

Plan detallado: `2026-08-24-sgsi-f1-foundations.md`

- [x] **1.** Subir el stack: Next 16, React 19, Tailwind 4 (npm, sin cambio de gestor)
- [x] **2.** Postgres + Prisma para desarrollo: `docker-compose.dev.yml`, `prisma/schema.prisma`, cliente singleton
- [x] **3.** Fuentes: Libre Franklin + JetBrains Mono desde Google Fonts, retirando Geist
- [x] **4.** **Gate:** `npm run build` verde y el tablero de indicadores actual sigue renderizando con datos reales

## F2 · Base de datos

Plan detallado: `2026-08-24-sgsi-f2-database.md`

- [x] **5.** `schema.prisma` con el dominio de `README.md` § «Modelo de dominio»: Proceso, Activo (autorreferencia), TipoMagerit, Subtipo, ValoracionDimension (D/I/C 0–5), Amenaza, AmenazaPorTipo, Riesgo, ControlImplementado, Tratamiento, Control, DominioAnexoA, CapacidadOperativa, ControlPorAmenaza, Evidencia, AccionPlan
- [x] **6.** Escalas y umbrales como tablas parametrizables, no constantes en código: valor 0–5, degradación, frecuencia ARO, madurez CMM → eficacia
- [x] **7.** Catálogos editables: Proveedor, Propietario, Custodio — con el valor protegido «No aplica» no borrable
- [x] **8.** Bitácora: tabla de auditoría con autor, fecha, valor anterior y motivo. Bajas lógicas en Activo y AccionPlan. Sin borrado físico
- [x] **9.** **Gate:** primera migración aplicada, el modelo cubre las once pantallas sin agujeros, y ninguna columna almacena impacto, riesgo, residual, eficacia ni valor de activo

## F3 · Semilla

- [x] **10.** Resolver el fallo de `exceljs` con los anchors del Excel MAGERIT
- [x] **11.** Catálogos MAGERIT: 10 tipos, 137 subtipos, 57 amenazas, `AmenazaPorTipo`
- [x] **12.** Los 93 controles desde `iso-controles.js` con todos los campos, más 15 capacidades y 4 dominios
- [x] **13.** Las 25 acciones desde `plan-tratamiento.js`
- [x] **14.** **Gate:** activos y valoración D/I/C sembrados desde el Excel, recalculando — nunca leyendo celdas de fórmula

## F4 · Motor

- [x] **15.** Escalas puras: valor, degradación, frecuencia ARO, `EFICACIA_POR_NIVEL`
- [x] **16.** Fórmulas de `README.md` § «Fórmulas (implementar exactamente así)»
- [x] **17.** `riesgosGlobales()` como única fuente de riesgos
- [x] **18.** Aritmética de madurez: índice = media de la eficacia; nivel típico = mediana del nivel *(depende de la cuestión abierta 2)*
- [x] **19.** Zonas de riesgo (MAGERIT Libro I, cap. 3)
- [x] **20.** **Gate — oráculo:** 93 · 86 aplicables · 86,7 % · típico 3,00 · media 3,23 · 75 en L3+ · 26 en objetivo · 11 brechas · avance 3,10 · brecha total 64

## F5 · Design system

- [x] **21.** Tokens `--hf-*` en `@theme` de Tailwind 4: superficies, bordes, hairlines, texto, `accent/*`, `warn/*`, `risk/*`, `cmm/*`, `level/*`, `row/*`, `danger/*`, `code/bg`, `overlay`
- [x] **22.** Extraer los azules reales de `Nav.tsx`, `HeroBanner.tsx` y `auth/signin` para sustituir los `brand/*` aproximados del handoff
- [x] **23.** Escala tipográfica (26 tamaños), etiquetas mono 8,5–9 px con `letter-spacing` .06–.07em, títulos 23 px/700
- [x] **24.** Espaciado, radios y sombra de modal. `gap` siempre, nunca márgenes entre hermanos
- [x] **25.** Header corporativo de 58 px, degradado `96deg #061a3d → #0d2f6b 46% → #1552a8`, marca CQ, pestañas Indicadores · SGSI, identidad de AD
- [x] **26.** Sidebar de 244 px sticky bajo el header, colapsable a 64 px con abreviaturas (INI, INV, MTZ, MAD, PLA, PAR, AMZ, MET), separador CONFIGURACIÓN, pie con línea base y contadores

## F6 · Las once pantallas

Cada pantalla cierra con el método de verificación visual del spec: servir el prototipo, comparar, corregir.

- [x] **27.** Acceso — Directorio Activo (sobre el `/auth/signin` existente)
- [x] **28.** Indicadores (SGC) — cuatro KPI con borde superior, selector de año en pastilla, cumplimiento por proceso con semáforo, tarjeta «Aporte del SGSI al SIG»
- [x] **29.** Resumen SGSI — hero del índice, dos fichas temáticas, radar, tabla de brecha, seis tarjetas, análisis descriptivo filtrable
- [x] **30.** Inventario de activos *(depende de la cuestión abierta 1)*
- [x] **31.** Ficha del activo — tres pestañas, franja inferior fija, modo creación
- [x] **32.** Controles y madurez
- [x] **33.** Amenazas y tipos — grilla de 11 columnas
- [x] **34.** Matrices de riesgo — casillas navegables
- [x] **35.** Planes de tratamiento
- [x] **36.** Parámetros (configuración del modelo)
- [x] **37.** Metodología

## F7 · Interacción

- [x] **38.** Los seis popups: activo superior, agregar amenaza, administrar catálogo, administrar control, editar acción del plan
- [x] **39.** Cross-filtrado tipo Power BI: toda tarjeta o fila con dato navega a su pantalla y filtro
- [x] **40.** Recálculo en vivo: cambiar D/I/C o madurez repropaga a nivel, colores de renglón, impactos, inherente, residual, matrices y KPI
- [x] **41.** Bajas lógicas con banda de Deshacer; exportación a `.xls` y `.doc` construida en cliente

## F8 · Accesos y cierre

- [x] **42.** RBAC por grupo de AD: `SIG-Seguridad`, `SIG-Propietarios`, `SIG-Auditoría`, `Domain Users` sin acceso
- [x] **43.** Accesibilidad: cada casilla, badge y renglón lleva su nivel escrito, no solo en color
- [x] **44.** Pipeline: Dockerfile con Prisma, compose con Postgres, `migrate deploy` como paso que puede fallar el despliegue, backups
- [x] **45.** Cerrar `/api/debug` — hoy responde sin autenticación y expone el contenido del Excel de indicadores
