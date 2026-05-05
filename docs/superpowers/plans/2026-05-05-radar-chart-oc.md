# Radar Chart por Objetivos de Calidad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una gráfica de araña (radar) en la sección de gráficas del dashboard mostrando cumplimiento real vs. meta por OC, filtrable por proceso.

**Architecture:** `computeOcRadarData` vive en `app/lib/oc-utils.ts` (función pura, testeable). `DashboardShell` recibe `objetivosCalidad` desde `page.tsx`, calcula `ocData` y lo pasa a `ChartsSection`. `ChartsSection` pasa a 3 columnas y renderiza el nuevo `RadarChart`.

**Tech Stack:** Next.js 14 App Router, TypeScript 5, ECharts 6 via echarts-for-react, Tailwind CSS, Jest + React Testing Library.

---

## File Map

| Archivo | Acción |
|---------|--------|
| `app/lib/types.ts` | Modificar — agregar interfaz `OcRadarData` |
| `app/lib/oc-utils.ts` | Crear — función `computeOcRadarData` |
| `app/lib/__tests__/oc-utils.test.ts` | Crear — tests unitarios |
| `app/components/charts/RadarChart.tsx` | Crear — componente ECharts radar |
| `app/components/DashboardShell.tsx` | Modificar — prop `objetivosCalidad`, llamada a `computeOcRadarData`, prop `ocData` a `ChartsSection` |
| `app/components/ChartsSection.tsx` | Modificar — prop `ocData`, grid 3 cols, renderizar `<RadarChart>` |
| `app/page.tsx` | Modificar — pasar `data.objetivosCalidad` a `DashboardShell` |

---

### Task 1: Agregar `OcRadarData` a types.ts

**Files:**
- Modify: `app/lib/types.ts`

- [ ] **Step 1: Agregar interfaz después de `QualityObjective`**

Abrir `app/lib/types.ts`. Después del bloque de `QualityObjective` (línea 39), insertar:

```typescript
export interface OcRadarData {
  codigo: string;        // "OC1"
  label: string;         // "OC1 - Satisfacción del cli…"
  cumplimiento: number;  // promedio de resultado de los indicadores del OC
  meta: number;          // promedio de meta parseada de los indicadores del OC
}
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/lib/types.ts
git commit -m "feat: add OcRadarData interface to types"
```

---

### Task 2: Crear `oc-utils.ts` con `computeOcRadarData` (TDD)

**Files:**
- Create: `app/lib/oc-utils.ts`
- Create: `app/lib/__tests__/oc-utils.test.ts`

- [ ] **Step 1: Escribir el test (debe fallar)**

Crear `app/lib/__tests__/oc-utils.test.ts`:

```typescript
import { computeOcRadarData } from '../oc-utils';
import type { Indicator, QualityObjective } from '../types';

const emptyMonthly = Array(12).fill({ v1: null, v2: null, resultado: null });
const emptyQ = [null, null, null, null];
const emptyS = [null, null];

const mockOCs: QualityObjective[] = [
  { codigo: 'OC1', descripcion: 'Satisfacción del cliente', cumplimiento: null },
  { codigo: 'OC2', descripcion: 'Mejora continua', cumplimiento: null },
];

function ind(
  proceso: string,
  oc: string,
  resultado: number | null,
  meta: string,
): Indicator {
  return {
    numero: 1, proceso, nombre: 'X', lider: 'L', frecuencia: 'Anual',
    meta, resultado, status: 'en_meta', oc,
    datosMensuales: emptyMonthly, datosTrimestrales: emptyQ, datosSemestrales: emptyS,
  };
}

test('groups by OC and computes averages without process filter', () => {
  const indicadores = [
    ind('P1', 'OC1', 80, '90%'),
    ind('P2', 'OC1', 100, '90%'),
    ind('P1', 'OC2', 70, '85%'),
  ];
  const result = computeOcRadarData(indicadores, mockOCs, null);
  expect(result).toHaveLength(2);
  expect(result[0].codigo).toBe('OC1');
  expect(result[0].cumplimiento).toBe(90);
  expect(result[0].meta).toBe(90);
  expect(result[1].codigo).toBe('OC2');
  expect(result[1].cumplimiento).toBe(70);
  expect(result[1].meta).toBe(85);
});

test('filters indicators by process when processFilter is set', () => {
  const indicadores = [
    ind('P1', 'OC1', 80, '90%'),
    ind('P2', 'OC1', 100, '90%'),
    ind('P1', 'OC2', 70, '85%'),
  ];
  const result = computeOcRadarData(indicadores, mockOCs, 'P1');
  expect(result).toHaveLength(2);
  const oc1 = result.find(r => r.codigo === 'OC1')!;
  expect(oc1.cumplimiento).toBe(80);
});

test('omits OCs that have no indicators for the selected process', () => {
  const indicadores = [
    ind('P1', 'OC1', 80, '90%'),
    ind('P2', 'OC2', 70, '85%'),
  ];
  const result = computeOcRadarData(indicadores, mockOCs, 'P1');
  expect(result).toHaveLength(1);
  expect(result[0].codigo).toBe('OC1');
});

test('ignores null resultados when computing cumplimiento average', () => {
  const indicadores = [
    ind('P1', 'OC1', null, '90%'),
    ind('P1', 'OC1', 80, '90%'),
  ];
  const result = computeOcRadarData(indicadores, mockOCs, null);
  expect(result[0].cumplimiento).toBe(80);
});

test('builds label with OC code and abbreviated description', () => {
  const indicadores = [ind('P1', 'OC1', 80, '90%')];
  const result = computeOcRadarData(indicadores, mockOCs, null);
  expect(result[0].label).toMatch(/^OC1 - /);
});

test('returns empty array when no indicators match the process', () => {
  const indicadores = [ind('P1', 'OC1', 80, '90%')];
  const result = computeOcRadarData(indicadores, mockOCs, 'P_NONEXISTENT');
  expect(result).toHaveLength(0);
});
```

- [ ] **Step 2: Ejecutar tests para confirmar que fallan**

```bash
npx jest app/lib/__tests__/oc-utils.test.ts --no-coverage
```
Expected: FAIL — "Cannot find module '../oc-utils'"

- [ ] **Step 3: Implementar `oc-utils.ts`**

Crear `app/lib/oc-utils.ts`:

```typescript
import type { Indicator, QualityObjective, OcRadarData } from './types';

function parseMeta(meta: string): number | null {
  const match = meta.match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

function abbreviate(s: string, max = 20): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

export function computeOcRadarData(
  indicadores: Indicator[],
  objetivosCalidad: QualityObjective[],
  processFilter: string | null,
): OcRadarData[] {
  const filtered = processFilter
    ? indicadores.filter(ind => ind.proceso === processFilter)
    : indicadores;

  const ocMap = new Map<string, { resultados: number[]; metas: number[] }>();

  for (const ind of filtered) {
    if (!ind.oc) continue;
    if (!ocMap.has(ind.oc)) ocMap.set(ind.oc, { resultados: [], metas: [] });
    const entry = ocMap.get(ind.oc)!;
    if (ind.resultado !== null) entry.resultados.push(ind.resultado);
    const metaVal = parseMeta(ind.meta);
    if (metaVal !== null) entry.metas.push(metaVal);
  }

  return Array.from(ocMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([codigo, { resultados, metas }]) => {
      const obj = objetivosCalidad.find(o => o.codigo === codigo);
      const desc = obj ? abbreviate(obj.descripcion) : codigo;
      return {
        codigo,
        label: `${codigo} - ${desc}`,
        cumplimiento: avg(resultados),
        meta: avg(metas),
      };
    });
}
```

- [ ] **Step 4: Ejecutar tests para confirmar que pasan**

```bash
npx jest app/lib/__tests__/oc-utils.test.ts --no-coverage
```
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add app/lib/oc-utils.ts app/lib/__tests__/oc-utils.test.ts
git commit -m "feat: add computeOcRadarData utility with tests"
```

---

### Task 3: Crear componente `RadarChart`

**Files:**
- Create: `app/components/charts/RadarChart.tsx`

- [ ] **Step 1: Crear el componente**

Crear `app/components/charts/RadarChart.tsx`:

```typescript
'use client';
import ReactECharts from 'echarts-for-react';
import type { OcRadarData } from '@/app/lib/types';

export default function RadarChart({ ocData }: { ocData: OcRadarData[] }) {
  if (ocData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-xs text-slate-400">
        Sin datos para el proceso seleccionado
      </div>
    );
  }

  const option = {
    animation: true,
    animationDuration: 600,
    animationEasing: 'cubicOut',
    legend: {
      data: ['Cumplimiento', 'Meta'],
      bottom: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 10, color: '#64748b' },
    },
    radar: {
      indicator: ocData.map(oc => ({ name: oc.label, max: 100 })),
      shape: 'polygon',
      splitNumber: 4,
      radius: '62%',
      axisName: {
        fontSize: 9,
        color: '#64748b',
        rich: {},
      },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: { name: string; value: number[] }) => {
        return ocData
          .map(
            (oc, i) =>
              `<b>${oc.codigo}</b>: ${params.name === 'Meta' ? oc.meta : oc.cumplimiento}%`,
          )
          .join('<br/>');
      },
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            name: 'Cumplimiento',
            value: ocData.map(oc => oc.cumplimiento),
            itemStyle: { color: '#22c55e' },
            areaStyle: { color: '#22c55e', opacity: 0.25 },
            lineStyle: { color: '#22c55e', width: 2 },
          },
          {
            name: 'Meta',
            value: ocData.map(oc => oc.meta),
            itemStyle: { color: '#6b7280' },
            areaStyle: { opacity: 0 },
            lineStyle: { color: '#6b7280', width: 2, type: 'dashed' },
          },
        ],
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 280 }} />;
}
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/components/charts/RadarChart.tsx
git commit -m "feat: add RadarChart component using ECharts radar"
```

---

### Task 4: Actualizar `DashboardShell` para calcular y pasar `ocData`

**Files:**
- Modify: `app/components/DashboardShell.tsx`

- [ ] **Step 1: Actualizar el componente**

Reemplazar el contenido completo de `app/components/DashboardShell.tsx`:

```typescript
'use client';
import { useState } from 'react';
import ChartsSection from './ChartsSection';
import ProcessGrid from './ProcessGrid';
import IndicatorsTable from './IndicatorsTable';
import { computeOcRadarData } from '@/app/lib/oc-utils';
import type { Process, MonthlyData, Quarter, Indicator, QualityObjective } from '@/app/lib/types';

export default function DashboardShell({
  procesos,
  mensual,
  trimestres,
  indicadores,
  objetivosCalidad,
  year,
}: {
  procesos: Process[];
  mensual: MonthlyData[];
  trimestres: Quarter[];
  indicadores: Indicator[];
  objetivosCalidad: QualityObjective[];
  year: string;
}) {
  const [processFilter, setProcessFilter] = useState<string | null>(null);

  function handleProcessSelect(nombre: string | null) {
    setProcessFilter(prev => (prev === nombre ? null : nombre));
  }

  const ocData = computeOcRadarData(indicadores, objetivosCalidad, processFilter);

  return (
    <div className="px-8 mt-6">
      <ChartsSection
        procesos={procesos}
        mensual={mensual}
        trimestres={trimestres}
        ocData={ocData}
        year={year}
        selectedProcess={processFilter}
        onProcessSelect={handleProcessSelect}
      />
      <ProcessGrid
        procesos={procesos}
        selected={processFilter}
        onSelect={handleProcessSelect}
      />
      <IndicatorsTable
        indicadores={indicadores}
        processFilter={processFilter}
        onProcessFilterChange={setProcessFilter}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
npx tsc --noEmit
```
Expected: errores de tipo en `ChartsSection` (prop `ocData` aún no declarada) — normal, se resuelve en Task 5.

- [ ] **Step 3: Commit**

```bash
git add app/components/DashboardShell.tsx
git commit -m "feat: wire computeOcRadarData into DashboardShell"
```

---

### Task 5: Actualizar `ChartsSection` a 3 columnas con `RadarChart`

**Files:**
- Modify: `app/components/ChartsSection.tsx`

- [ ] **Step 1: Reemplazar el componente**

Reemplazar el contenido completo de `app/components/ChartsSection.tsx`:

```typescript
import type { Process, MonthlyData, Quarter, OcRadarData, IndicatorStatus } from '@/app/lib/types';
import BarChart from './charts/BarChart';
import LineChart from './charts/LineChart';
import RadarChart from './charts/RadarChart';

function quarterBorder(status: IndicatorStatus): string {
  if (status === 'en_meta') return 'border-green-500';
  if (status === 'alerta') return 'border-amber-500';
  return 'border-red-500';
}

export default function ChartsSection({
  procesos,
  mensual,
  trimestres,
  ocData,
  year,
  selectedProcess,
  onProcessSelect,
}: {
  procesos: Process[];
  mensual: MonthlyData[];
  trimestres: Quarter[];
  ocData: OcRadarData[];
  year: string;
  selectedProcess?: string | null;
  onProcessSelect?: (nombre: string | null) => void;
}) {
  return (
    <div className="mb-6">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
        Análisis de Desempeño
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-50">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Cumplimiento por Proceso</h3>
          <p className="text-xs text-slate-400 mb-5">
            Comparativo de todos los procesos · {year}
          </p>
          <BarChart
            procesos={procesos}
            selectedProcess={selectedProcess}
            onProcessSelect={onProcessSelect}
          />
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-50">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Evolución Mensual {year}</h3>
          <p className="text-xs text-slate-400 mb-5">Cumplimiento promedio por mes</p>
          <LineChart mensual={mensual} />
          <div className="grid grid-cols-2 gap-2 mt-3">
            {trimestres.map(q => (
              <div
                key={q.label}
                className={`bg-slate-50 rounded-md p-2 border-l-[3px] ${quarterBorder(q.status)}`}
              >
                <div className="text-[10px] text-slate-500">
                  {q.label} {q.months}
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {q.cumplimiento !== null ? `${q.cumplimiento}%` : 'S/D'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-50">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Cumplimiento por OC</h3>
          <p className="text-xs text-slate-400 mb-5">
            Real vs. meta por Objetivo de Calidad · {year}
          </p>
          <RadarChart ocData={ocData} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Ejecutar todos los tests**

```bash
npx jest --no-coverage
```
Expected: PASS — todos los tests existentes siguen pasando.

- [ ] **Step 4: Commit**

```bash
git add app/components/ChartsSection.tsx
git commit -m "feat: add RadarChart as third column in ChartsSection"
```

---

### Task 6: Pasar `objetivosCalidad` desde `page.tsx`

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Agregar la prop en el JSX**

En `app/page.tsx`, encontrar el bloque `<DashboardShell` (línea ~54) y agregar `objetivosCalidad={data.objetivosCalidad}`:

```typescript
      <DashboardShell
        procesos={data.procesos}
        mensual={data.mensual}
        trimestres={data.trimestres}
        indicadores={data.indicadores}
        objetivosCalidad={data.objetivosCalidad}
        year={year}
      />
```

- [ ] **Step 2: Verificar TypeScript final**

```bash
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Ejecutar todos los tests**

```bash
npx jest --no-coverage
```
Expected: PASS — todos los tests pasan.

- [ ] **Step 4: Commit final**

```bash
git add app/page.tsx
git commit -m "feat: pass objetivosCalidad to DashboardShell from page"
```

---

## Verificación manual

Arrancar el servidor de desarrollo:

```bash
npm run dev
```

Abrir http://localhost:3004 y verificar:
1. El panel de gráficas muestra 3 columnas: Barras | Línea | Araña
2. La gráfica de araña muestra polígono verde (cumplimiento) y contorno gris discontinuo (meta)
3. Al seleccionar un proceso desde la gráfica de barras, la araña se actualiza mostrando solo los OCs de ese proceso
4. Si el proceso seleccionado no tiene indicadores para algún OC, ese eje desaparece de la araña
5. En mobile la vista se apila verticalmente
