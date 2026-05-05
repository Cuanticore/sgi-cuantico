# Design: ProcessGrid compacto + fila de OC cards

**Date:** 2026-05-05

## Objetivo

Mejorar la sección "Indicadores por Proceso" con dos cambios:
1. Gauge del proceso más grande y legible (de 50px a 64px)
2. Nueva fila horizontal de tarjetas de calificación por Objetivo de Calidad (OC) debajo del grid de procesos

## Cambios en ProcessGrid

### Gauge (`SvgGauge`)

- `className` del `<svg>`: `w-[50px] h-[50px]` → `w-[64px] h-[64px]`
- El `viewBox="0 0 50 50"` permanece igual; el escalado del navegador amplifica texto y trazo proporcionalmente
- El texto del porcentaje pasa de ~7.5px efectivos a ~9.6px efectivos — legible sin rediseño interno

### Tarjeta de proceso

- Padding: `p-4` → `p-3`
- Gap entre gauge y texto: `gap-3.5` → `gap-2.5`

No se cambia la estructura del grid (sigue siendo `grid-cols-3`).

## Nuevo componente `OcCardsRow`

**Archivo:** `app/components/OcCardsRow.tsx`

**Props:**
```typescript
{ ocData: OcRadarData[] }
```

**Layout:** `'use client'` no necesario (sin interactividad). Contenedor `flex gap-3 overflow-x-auto pb-2 mb-6`.

### Estructura de cada tarjeta

Ancho fijo `min-w-[200px]`, fondo blanco, `rounded-xl`, `shadow-sm`, `border border-slate-50`, `p-3`.

```
[dot] OC1                    ← código bold + dot de color de estado
Satisfacción del cliente     ← descripción truncada a 1 línea (clase Tailwind `truncate`)
━━━━━━━━━━━━━━━━━━━━         ← barra horizontal coloreada
83% / meta 90%               ← texto pequeño
```

**Barra de progreso:**
- Contenedor `bg-slate-100 rounded-full h-1.5 w-full`
- Fill `rounded-full h-1.5` con `style={{ width: \`${Math.min((cumplimiento / meta) * 100, 100).toFixed(1)}%\` }}` y color de fondo según estado

### Lógica de estado (derivada en componente)

```typescript
function ocStatus(cumplimiento: number, meta: number): IndicatorStatus {
  if (meta === 0) return 'sin_datos';
  const ratio = cumplimiento / meta;
  if (ratio >= 0.95) return 'en_meta';
  if (ratio >= 0.85) return 'alerta';
  return 'critico';
}
```

Colores reutilizados del mismo mapa que `ProcessGrid`: verde `#22c55e`, amarillo `#f59e0b`, rojo `#ef4444`, gris `#94a3b8`.

**Datos:** usa `OcRadarData` (campos `codigo`, `label`, `cumplimiento`, `meta`). La descripción se extrae del `label` después del ` - `.

## Actualización de `DashboardShell`

Importar `OcCardsRow` y añadirlo entre `ProcessGrid` e `IndicatorsTable`:

```tsx
<ProcessGrid ... />
<OcCardsRow ocData={ocData} />
<IndicatorsTable ... />
```

`ocData` ya está computado en `DashboardShell` para el `ChartsSection` (RadarChart) — no se necesita nuevo cálculo.

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `app/components/ProcessGrid.tsx` | Gauge 50→64px, padding/gap reducido |
| `app/components/OcCardsRow.tsx` | Nuevo componente |
| `app/components/DashboardShell.tsx` | Importar y renderizar `OcCardsRow` |

## Fuera de alcance

- Cambios al RadarChart o ChartsSection
- Interactividad en OC cards (click / filtro)
- Cambios a IndicatorsTable
