# Radar Chart por Objetivos de Calidad (OC)

**Fecha:** 2026-05-05  
**Estado:** Aprobado

## Objetivo

Agregar una gráfica de tipo araña (radar) en el panel principal de gráficas del dashboard, mostrando el cumplimiento real vs. la meta por cada Objetivo de Calidad (OC). La gráfica responde al filtro de proceso existente.

---

## Datos

### Nueva interfaz `OcRadarData` (en `app/lib/types.ts`)

```typescript
interface OcRadarData {
  codigo: string;        // "OC1"
  label: string;         // "OC1 - Satisfacción" (abreviado a ~15 chars)
  cumplimiento: number;  // promedio de resultado de los indicadores del OC
  meta: number;          // promedio de meta de los indicadores del OC
}
```

### Función `computeOcRadarData` (en `DashboardShell.tsx`)

- **Input:** `indicadores: Indicator[]`, `processFilter: string | null`
- **Lógica:**
  1. Si `processFilter` está activo: filtrar `indicadores` donde `ind.proceso === processFilter`
  2. Sin filtro: usar todos los indicadores
  3. Agrupar indicadores filtrados por `ind.oc`
  4. Por cada OC: calcular promedio de `resultado` (ignorar nulls) → `cumplimiento`; calcular promedio de `meta` parseada → `meta`
  5. Construir `label` = `codigo + " - " + descripcion_abreviada` usando el array `objetivosCalidad`
  6. Retornar `OcRadarData[]` ordenado OC1…OC5
- **Output:** `OcRadarData[]` — si un OC no tiene indicadores en el proceso seleccionado, se omite del array

### Prop nueva en `ChartsSection`

```typescript
ocData: OcRadarData[]
```

`DashboardShell` calcula `ocData` en cada render (cuando cambia `processFilter` o `indicadores`) y lo pasa a `ChartsSection`.

---

## Componente `RadarChart`

**Archivo:** `app/components/RadarChart.tsx`

### Props

```typescript
interface RadarChartProps {
  ocData: OcRadarData[];
}
```

### Configuración ECharts

- **Tipo:** `radar`
- **Indicadores:** un eje por cada entrada en `ocData`, `max: 100`
- **Label de ejes:** `ocData[i].label` (ej: `"OC1 - Satisfacción"`)
- **Dos series:**
  | Serie | Color | Relleno | Borde |
  |-------|-------|---------|-------|
  | Cumplimiento | `#22c55e` | opacity 0.3 | sólido |
  | Meta | `#6b7280` | ninguno | discontinuo (`dashed`) |
- **Tooltip:** al hover muestra nombre del OC, cumplimiento % y meta %
- **Leyenda:** debajo del título, puntos verde / gris
- **Estado vacío:** si `ocData` está vacío, mostrar mensaje `"Sin datos para el proceso seleccionado"`

### Título

`"Cumplimiento por OC"` — mismo estilo de título que `BarChart` y `LineChart`

---

## Layout de `ChartsSection`

La fila superior pasa de 2 columnas a 3:

```
[ BarChart ] [ LineChart ] [ RadarChart ]
   col-1        col-2         col-3
```

- Grid: `grid-cols-1 md:grid-cols-3` con `gap-4`
- Altura de cada columna: igual a la actual (~320px)
- En mobile (< md): las tres gráficas se apilan verticalmente

---

## Archivos a modificar / crear

| Archivo | Cambio |
|---------|--------|
| `app/lib/types.ts` | Agregar interfaz `OcRadarData` |
| `app/components/DashboardShell.tsx` | Agregar función `computeOcRadarData`, pasar `ocData` a `ChartsSection` |
| `app/components/ChartsSection.tsx` | Agregar prop `ocData`, cambiar grid a 3 columnas, renderizar `<RadarChart>` |
| `app/components/RadarChart.tsx` | Crear componente nuevo |

---

## Fuera de alcance

- Animaciones especiales al cambiar de proceso
- Interactividad de clic en los ejes del radar
- Comparación entre años
