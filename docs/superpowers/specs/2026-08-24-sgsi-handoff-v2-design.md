# Módulo SGSI — Handoff v2.1 dentro del SIG

**Fecha:** 2026-08-24
**Estado:** Aprobado
**Fuente de verdad funcional:** `docs/handoff_v2/`

## Objetivo

Construir el módulo SGSI (gestión de activos y riesgos, MAGERIT v3.0 + ISO/IEC 27001:2022) **dentro de este repositorio**, de modo que el Sistema Integrado de Gestión quede con dos dominios bajo un mismo shell, una sola sesión y un solo despliegue:

- **Indicadores** — el tablero del SGC que ya existe hoy (matriz de indicadores en SharePoint).
- **SGSI** — once pantallas nuevas según `docs/handoff_v2/README.md` (v2.1).

El resultado debe ser **visualmente fiel al prototipo** y **numéricamente correcto**: los datos se calculan, nunca se precocinan.

---

## Alcance y método

### Construcción nueva, no migración

El repositorio `soar_cuantico` implementó la versión **v2.0** de este handoff. Esta construcción parte de cero en `sgi-cuantico` y **no copia archivos** de ese repositorio. De la implementación anterior se reutiliza únicamente:

- El conocimiento acumulado (decisiones, defectos conocidos, valores de referencia).
- Los datos de semilla, que viven en `docs/handoff_v2/`.

Consecuencia aceptada: no se hereda la historia de commits ni los tests de `soar_cuantico`.

### Qué ya existe en este repositorio y no se reconstruye

| Pieza | Estado | Nota |
|---|---|---|
| Inicio de sesión Azure AD (NextAuth v4) | Funcionando, validado | La v2.1 pide exactamente esto. **No se sustituye por otra librería de auth.** |
| Adaptador SharePoint / Microsoft Graph | Funcionando | Alimenta la pantalla Indicadores |
| Parser de la matriz de indicadores (Excel) | Funcionando, con tests | `app/lib/excel-parser.ts` |
| Despliegue continuo, dominio, Traefik, GHCR | Funcionando | `sig.cuantico.com` |
| ECharts | Instalado | Series de tiempo de indicadores |

---

## Stack objetivo

| Capa | Actual | Objetivo | Motivo del cambio |
|---|---|---|---|
| Next.js | 14.2.35 | **16** | Server actions y paridad con el diseño |
| React | 18 | **19** | Requerido por Next 16 |
| Tailwind CSS | 3.4.1 | **4** | Los tokens del handoff son custom properties de CSS; `@theme` los mapea sin traducción |
| Gestor de paquetes | npm | **npm** | Sin cambio. El pipeline ya usa `npm ci`; cambiar de gestor agrega riesgo sin beneficio |
| Base de datos | ninguna | **Postgres + Prisma** | El dominio MAGERIT es un modelo persistido |
| Tests | Jest | Jest | Sin cambio |

La matriz de indicadores **permanece en SharePoint**. No se migra a Postgres: es un documento vivo que Calidad edita, no un dominio modelado. Las dos fuentes conviven por diseño.

---

## Reglas de fidelidad

### Fidelidad invertida en tres pantallas

`README.md` § «Nota sobre la carpeta Indicadores» declara que el login, el header azul y la pantalla de Indicadores **se reconstruyeron a partir de capturas** de `sig.cuantico.com`, y que los valores de la tabla `brand/*` son aproximaciones.

En consecuencia:

| Pantalla | Autoridad visual |
|---|---|
| Acceso, header corporativo, Indicadores | **El código actual de este repositorio** |
| Las otras ocho pantallas | **El prototipo** |

Los azules reales se extraen de `app/components/Nav.tsx`, `app/components/HeroBanner.tsx` y `app/auth/signin/page.tsx`, y sustituyen los `brand/*` del handoff.

### Método de verificación visual

Para cada pantalla, sin excepción:

1. Servir `docs/handoff_v2/design/` por HTTP (no funciona con `file://`).
2. Navegar el prototipo por su propio menú lateral.
3. Leer el bloque de view-model del `.dc.html` para el contrato exacto de formato — la prosa del README no lo cubre todo.
4. Comparar contra la pantalla implementada y corregir.

### Reglas de layout de cumplimiento obligatorio

- Toda tabla ancha va en `<div overflow-x:auto><div min-width:Npx>`, con `min-width` **≥ suma de columnas + padding de fila**. Las tarjetas con `overflow:hidden` no pueden ser dueñas del desborde horizontal. El README marca esta regla como causa de defectos repetidos.
- Rejillas de dos columnas: `repeat(auto-fit, minmax(380px, 1fr))` con `min-width: 0` en las tarjetas. No fracciones fijas.
- Espaciado con `gap` siempre; nunca márgenes entre hermanos.
- El color nunca es el único portador de significado: cada casilla, badge y renglón lleva su nivel escrito.

---

## Reglas de cálculo

### Una sola fuente de verdad

`riesgosGlobales()` es el **único** origen de riesgos. Matrices, KPI, informes y drill-down se derivan de él.

**No reintroducir matrices precocinadas.** En la implementación v1 fueron la causa de varios defectos de cifras contradictorias. Las matrices del prototipo son referencia visual, no datos.

### Métricas de madurez

- Índice de madurez = **media de la eficacia** de los controles aplicables (no promedio del nivel).
- Nivel típico = **mediana del nivel**.
- `EFICACIA_POR_NIVEL`: L0 0 % · L1 10 % · L2 50 % · L3 90 % · L4 95 % · L5 100 %.
- La eficacia reduce la **frecuencia** (ARO), nunca el impacto. No existe impacto residual en el modelo.

### Oráculo numérico

El motor se desarrolla contra estos valores, extraídos del Excel vigente. Son criterio de aceptación, no orientación:

| Métrica | Valor |
|---|---|
| Controles | 93 |
| Aplicables | 86 |
| Índice de madurez | 86,7 % |
| Nivel típico (mediana) | 3,00 |
| Nivel medio | 3,23 |
| En L3 o superior | 75 |
| En objetivo | 26 |
| Brechas | 11 |
| Avance medio desde la línea base | 3,10 |
| Brecha total hasta el objetivo | 64 |

### Trazabilidad

- Sin borrado físico. Toda baja es lógica.
- Cada cambio registra autor, fecha, valor anterior y motivo.
- Las excepciones (degradación o frecuencia distintas de la parametrización, amenazas agregadas o eliminadas, tratamiento sobrescrito) exigen justificación.

---

## Datos de semilla

Verificados presentes y parseables en `docs/handoff_v2/`:

| Origen | Contenido |
|---|---|
| `design/iso-controles.js` | 93 controles (`c, n, dom, cap, ap, base, act, obj, ev, am`), 15 capacidades, 4 dominios |
| `design/plan-tratamiento.js` | 25 acciones (`cod, accion, tipo, ctl, origen, resp, aprueba, fecha, estado, avance, verif, obs`) |
| `requisitos/MATRIZ MAGERIT - Activos y Riesgos (base) v2.xlsx` | Activos, valoración, matrices, controles y madurez, plan, catálogos |
| `requisitos/SPEC-herramienta-riesgos-v2.md` | Especificación funcional |
| `requisitos/MET-SIG-01 Metodologia v3.docx` | Metodología aprobada v3 |

**Riesgos conocidos de la semilla:**

1. El libro Excel **no tiene valores de fórmula cacheados**. Todo lo calculado se recalcula; nunca se lee la celda.
2. Leer ese `.xlsx` con `exceljs ^4.4.0` (la versión de este repo) falla con `Cannot read properties of undefined (reading 'anchors')`. Se resuelve antes de sembrar.
3. Ante discrepancia entre el prototipo y `requisitos/`, **manda el documento** (el README lo declara explícitamente).

---

## Control de accesos

Los permisos se derivan de la pertenencia a grupos del Directorio Activo:

| Grupo de AD | Permiso |
|---|---|
| `SIG-Seguridad` | Lectura y escritura en todo el SGSI, incluida la parametrización |
| `SIG-Propietarios` | Valorar y tratar los activos de su proceso |
| `SIG-Auditoría` | Solo lectura, con acceso a la bitácora y a las evidencias |
| `Domain Users` | Sin acceso |

---

## Cuestiones abiertas

Heredadas de `README.md` § «Preguntas abiertas para el cliente». Las dos primeras bloquean pasos concretos del plan; el resto se implementa según el prototipo y queda marcado.

| # | Cuestión | Paso afectado |
|---|---|---|
| 1 | Cómo derivar el nivel 1–5 de riesgo inherente y residual **por activo** para las columnas del inventario (máximo, promedio o percentil). Hoy es un mapa fijo en el prototipo. | 30 |
| 2 | Si la madurez del grupo de controles de una amenaza sigue siendo promedio de niveles o pasa a media de eficacia. | 18 |
| 3 | Plazos de la tabla de criterios de aceptación — pendientes del Comité del SIG. | 36 |
| 4 | Si «Agregar control implementado» abre búsqueda sobre el catálogo ISO completo o se limita a los controles de la amenaza. | 31 |
| 5 | Si «Limita el daño» puede bajar la degradación por riesgo individual o solo por amenaza (el SPEC indica lo segundo). | 33 |
| 6 | Los conteos de «riesgos que mueve» de cada acción del plan deben recalcularse sobre el inventario real, no sobre la muestra del prototipo. | 35 |

---

## Organización de artefactos

```
docs/superpowers/
  specs/
    2026-08-24-sgsi-handoff-v2-design.md      Este documento — contrato global
  plans/
    2026-08-24-sgsi-handoff-v2.md             Plan maestro — 8 fases, 45 pasos
    2026-08-24-sgsi-f1-foundations.md         Plan detallado de la fase 1
    2026-08-24-sgsi-f2-...                    Un plan por fase, al iniciarla
```

Un `spec` por decisión de diseño de alcance global; un `plan` por fase, creado al comenzarla y cerrado con sus casillas marcadas.
