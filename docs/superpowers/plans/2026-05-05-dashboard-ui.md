# Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full React dashboard UI for the Cuantico SGC indicators app, replacing the default Next.js page with the designed mockup.

**Architecture:** `app/page.tsx` is a server component that fetches data from SharePoint via `getIndicatorsData()` and passes typed props to presentational components. ECharts charts and the filterable table are 'use client' components. Everything else is server-rendered HTML + Tailwind.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS v3, `echarts-for-react` v3 (echarts v6), TypeScript 5, next-auth v4

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/layout.tsx` | Modify | Title, lang, body bg |
| `app/page.tsx` | Rewrite | Server page: fetch + compose |
| `app/components/Nav.tsx` | Create | Sticky nav: logo, year toggle, avatar |
| `app/components/HeroBanner.tsx` | Create | Hero gradient + 4 floating KPI cards |
| `app/components/ProcessGrid.tsx` | Create | 3-col grid with SVG ring gauges |
| `app/components/ChartsSection.tsx` | Create | Server wrapper for charts row |
| `app/components/charts/BarChart.tsx` | Create | `'use client'` ECharts horizontal bar |
| `app/components/charts/LineChart.tsx` | Create | `'use client'` ECharts line + area |
| `app/components/IndicatorsTable.tsx` | Create | `'use client'` filterable indicators table |
| `app/components/__tests__/IndicatorsTable.test.tsx` | Create | Filter state unit tests |

---

## Task 1: Update layout.tsx

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace layout.tsx**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Cuadro de Mando de Indicadores · Cuantico",
  description: "Sistema de Gestión de Calidad ISO 9001",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} antialiased bg-slate-100`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

---

## Task 2: Create Nav component

**Files:**
- Create: `app/components/Nav.tsx`

- [ ] **Step 1: Create Nav.tsx**

```tsx
// app/components/Nav.tsx
import Link from 'next/link';

export default function Nav({
  year,
  initials,
  fetchedAt,
}: {
  year: string;
  initials: string;
  fetchedAt: string;
}) {
  const updated = new Date(fetchedAt).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <nav className="bg-white border-b border-slate-200 px-8 h-[60px] flex items-center justify-between sticky top-0 z-[100] shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-gradient-to-br from-[#1B3A8A] to-[#0EA5E9] rounded-lg flex items-center justify-center text-white text-sm font-black tracking-[-1px]">
          Q
        </div>
        <span className="text-base font-bold text-slate-900">
          Cuántico <span className="text-sky-500">·</span> SGC
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="bg-slate-100 rounded-full px-3 py-1.5 text-xs text-slate-500 font-medium border border-slate-200">
          Actualizado {updated}
        </span>
        <div className="flex gap-1">
          {(['2026', '2025'] as const).map(y => (
            <Link
              key={y}
              href={`/?year=${y}`}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                year === y
                  ? 'bg-[#1B3A8A] text-white border-[#1B3A8A]'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
        <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-[#1B3A8A] to-[#0EA5E9] flex items-center justify-center text-white text-xs font-bold">
          {initials}
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

---

## Task 3: Create HeroBanner component

**Files:**
- Create: `app/components/HeroBanner.tsx`

- [ ] **Step 1: Create HeroBanner.tsx**

```tsx
// app/components/HeroBanner.tsx
import type { IndicatorsSummary } from '@/app/lib/types';

type Color = 'blue' | 'green' | 'yellow' | 'red';

const borderColors: Record<Color, string> = {
  blue: 'border-sky-500',
  green: 'border-green-500',
  yellow: 'border-amber-500',
  red: 'border-red-500',
};
const valueColors: Record<Color, string> = {
  blue: 'text-sky-500',
  green: 'text-green-500',
  yellow: 'text-amber-500',
  red: 'text-red-500',
};
const barColors: Record<Color, string> = {
  blue: 'bg-sky-500',
  green: 'bg-green-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
};

function KpiCard({
  label,
  value,
  sub,
  color,
  pct,
}: {
  label: string;
  value: string;
  sub: string;
  color: Color;
  pct: number;
}) {
  return (
    <div className={`bg-white rounded-xl p-5 shadow-lg border-t-[3px] ${borderColors[color]}`}>
      <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-1.5">
        {label}
      </div>
      <div className={`text-[32px] font-extrabold leading-none ${valueColors[color]}`}>
        {value}
      </div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
      <div className="h-1 bg-slate-100 rounded mt-2.5">
        <div
          className={`h-1 rounded ${barColors[color]}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function HeroBanner({
  summary,
  year,
}: {
  summary: IndicatorsSummary;
  year: string;
}) {
  const total = summary.totalIndicadores || 1;
  return (
    <>
      <div className="bg-gradient-to-br from-slate-900 via-[#1B3A8A] to-[#0c2461] px-8 pt-10 pb-20 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-[300px] h-[300px] rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.15),transparent_70%)]" />
        <div className="absolute -bottom-20 left-[10%] w-[200px] h-[200px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.12),transparent_70%)]" />
        <div className="relative z-10">
          <p className="text-[11px] text-slate-400 uppercase tracking-[3px] mb-2 font-medium">
            Sistema de Gestión de Calidad
          </p>
          <h1 className="text-white text-[28px] font-extrabold mb-1">
            Cuadro de Mando de Indicadores
          </h1>
          <p className="text-sky-300 text-sm">
            Resultados {year} · Actualizado automáticamente desde SharePoint
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 px-8 -mt-12 relative z-10">
        <KpiCard
          label="Avance Global"
          value={`${summary.avanceGlobal}%`}
          sub={`${summary.medidos} de ${total} indicadores medidos`}
          color="blue"
          pct={summary.avanceGlobal}
        />
        <KpiCard
          label="En Meta 🟢"
          value={String(summary.enMeta)}
          sub="indicadores cumplidos"
          color="green"
          pct={(summary.enMeta / total) * 100}
        />
        <KpiCard
          label="En Alerta 🟡"
          value={String(summary.alerta)}
          sub="requiere atención"
          color="yellow"
          pct={(summary.alerta / total) * 100}
        />
        <KpiCard
          label="Críticos 🔴"
          value={String(summary.critico)}
          sub="fuera de meta"
          color="red"
          pct={(summary.critico / total) * 100}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

---

## Task 4: Create ProcessGrid component

**Files:**
- Create: `app/components/ProcessGrid.tsx`

- [ ] **Step 1: Create ProcessGrid.tsx**

```tsx
// app/components/ProcessGrid.tsx
import type { Process, IndicatorStatus } from '@/app/lib/types';

function statusColor(status: IndicatorStatus): string {
  if (status === 'en_meta') return '#22c55e';
  if (status === 'alerta') return '#f59e0b';
  if (status === 'critico') return '#ef4444';
  return '#94a3b8';
}

function statusLabel(status: IndicatorStatus): string {
  if (status === 'en_meta') return 'En meta';
  if (status === 'alerta') return 'Alerta';
  if (status === 'critico') return 'Crítico';
  return 'Sin datos';
}

function SvgGauge({ pct, color }: { pct: number | null; color: string }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = pct === null ? 0 : Math.min((pct / 100) * circ, circ);
  const label = pct === null ? 'S/D' : `${pct}%`;
  return (
    <svg viewBox="0 0 50 50" className="w-[50px] h-[50px] flex-shrink-0">
      <circle cx="25" cy="25" r={r} fill="none" stroke="#f1f5f9" strokeWidth="5" />
      <circle
        cx="25" cy="25" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 25 25)"
      />
      <text x="25" y="29" textAnchor="middle" fontSize="7.5" fontWeight="800" fill={color}>
        {label}
      </text>
    </svg>
  );
}

export default function ProcessGrid({ procesos }: { procesos: Process[] }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
        Indicadores por Proceso
      </p>
      <div className="grid grid-cols-3 gap-3.5">
        {procesos.map(p => {
          const color = statusColor(p.status);
          return (
            <div
              key={p.nombre}
              className="bg-white rounded-xl p-4 shadow-sm border border-slate-50 flex items-center gap-3.5"
            >
              <SvgGauge pct={p.cumplimiento} color={color} />
              <div>
                <h4 className="text-xs font-bold text-slate-900 mb-0.5">{p.nombre}</h4>
                <div className="text-[10px] text-slate-400">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                    style={{ background: color }}
                  />
                  {p.numIndicadores} indicadores · {statusLabel(p.status)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

---

## Task 5: Create ECharts chart components

**Files:**
- Create: `app/components/charts/BarChart.tsx`
- Create: `app/components/charts/LineChart.tsx`

- [ ] **Step 1: Create BarChart.tsx**

```tsx
// app/components/charts/BarChart.tsx
'use client';
import ReactECharts from 'echarts-for-react';
import type { Process } from '@/app/lib/types';

function barColor(v: number | null): string {
  if (v === null) return '#94a3b8';
  if (v >= 90) return '#22c55e';
  if (v >= 70) return '#f59e0b';
  return '#ef4444';
}

export default function BarChart({ procesos }: { procesos: Process[] }) {
  const names = procesos.map(p =>
    p.nombre
      .replace('Gestión de ', 'Gest. ')
      .replace('Gestión ', 'Gest. ')
      .replace('Servicio al Cliente', 'Serv. Cliente')
  );

  const option = {
    animation: true,
    animationDuration: 1200,
    animationEasing: 'cubicOut',
    grid: { left: 110, right: 55, top: 8, bottom: 8, containLabel: false },
    xAxis: { type: 'value', max: 130, show: false },
    yAxis: {
      type: 'category',
      data: names,
      axisLabel: { fontSize: 10, color: '#64748b' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 10,
        borderRadius: 5,
        data: procesos.map(p => ({
          value: p.cumplimiento ?? 0,
          itemStyle: { color: barColor(p.cumplimiento) },
        })),
        label: {
          show: true,
          position: 'right',
          formatter: (p: { value: number }) =>
            p.value === 0 ? 'S/D' : `${p.value}%`,
          fontSize: 10,
          fontWeight: 700,
          color: '#334155',
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 280 }} />;
}
```

- [ ] **Step 2: Create LineChart.tsx**

```tsx
// app/components/charts/LineChart.tsx
'use client';
import ReactECharts from 'echarts-for-react';
import type { MonthlyData } from '@/app/lib/types';

export default function LineChart({ mensual }: { mensual: MonthlyData[] }) {
  const option = {
    animation: true,
    animationDuration: 1800,
    animationEasing: 'cubicOut',
    grid: { left: 36, right: 16, top: 16, bottom: 40 },
    xAxis: {
      type: 'category',
      data: mensual.map(m => m.mes),
      axisLabel: { fontSize: 9, color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#f1f5f9' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { formatter: '{value}%', fontSize: 9, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#f8fafc' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: 'Cumplimiento',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: mensual.map(m => m.cumplimiento),
        connectNulls: false,
        lineStyle: { color: '#0EA5E9', width: 2.5 },
        itemStyle: { color: '#fff', borderColor: '#0EA5E9', borderWidth: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(14,165,233,0.25)' },
              { offset: 1, color: 'rgba(14,165,233,0)' },
            ],
          },
        },
      },
      {
        name: 'Meta',
        type: 'line',
        data: mensual.map(() => 90),
        lineStyle: { color: '#22c55e', width: 1.5, type: 'dashed' },
        symbol: 'none',
        itemStyle: { color: '#22c55e' },
      },
    ],
    legend: {
      data: ['Cumplimiento', 'Meta'],
      bottom: 0,
      textStyle: { fontSize: 10, color: '#94a3b8' },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ seriesName: string; value: number | null }>) =>
        params.map(p => `${p.seriesName}: ${p.value ?? '—'}%`).join('<br/>'),
    },
  };

  return <ReactECharts option={option} style={{ height: 220 }} />;
}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

---

## Task 6: Create ChartsSection component

**Files:**
- Create: `app/components/ChartsSection.tsx`

- [ ] **Step 1: Create ChartsSection.tsx**

```tsx
// app/components/ChartsSection.tsx
import type { Process, MonthlyData, Quarter, IndicatorStatus } from '@/app/lib/types';
import BarChart from './charts/BarChart';
import LineChart from './charts/LineChart';

function quarterBorder(status: IndicatorStatus): string {
  if (status === 'en_meta') return 'border-green-500';
  if (status === 'alerta') return 'border-amber-500';
  return 'border-red-500';
}

export default function ChartsSection({
  procesos,
  mensual,
  trimestres,
  year,
}: {
  procesos: Process[];
  mensual: MonthlyData[];
  trimestres: Quarter[];
  year: string;
}) {
  return (
    <div className="mb-6">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
        Análisis de Desempeño
      </p>
      <div className="grid grid-cols-[1.4fr_1fr] gap-5">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-50">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Cumplimiento por Proceso</h3>
          <p className="text-xs text-slate-400 mb-5">
            Comparativo de todos los procesos · {year}
          </p>
          <BarChart procesos={procesos} />
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
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

---

## Task 7: Create IndicatorsTable (test-first)

**Files:**
- Create: `app/components/__tests__/IndicatorsTable.test.tsx`
- Create: `app/components/IndicatorsTable.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// app/components/__tests__/IndicatorsTable.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import IndicatorsTable from '../IndicatorsTable';
import type { Indicator } from '@/app/lib/types';

const mockIndicators: Indicator[] = [
  {
    numero: 1, proceso: 'P1', nombre: 'Ind A', lider: 'L1',
    frecuencia: 'Anual', meta: '90%', resultado: 95,
    status: 'en_meta', oc: 'OC1',
  },
  {
    numero: 2, proceso: 'P2', nombre: 'Ind B', lider: 'L2',
    frecuencia: 'Trimestral', meta: '90%', resultado: 50,
    status: 'critico', oc: 'OC2',
  },
  {
    numero: 3, proceso: 'P3', nombre: 'Ind C', lider: 'L3',
    frecuencia: 'Mensual', meta: '90%', resultado: null,
    status: 'sin_datos', oc: 'OC3',
  },
];

test('shows all indicators by default', () => {
  render(<IndicatorsTable indicadores={mockIndicators} />);
  expect(screen.getByText('Ind A')).toBeInTheDocument();
  expect(screen.getByText('Ind B')).toBeInTheDocument();
  expect(screen.getByText('Ind C')).toBeInTheDocument();
});

test('filters to en_meta when clicking En Meta tab', () => {
  render(<IndicatorsTable indicadores={mockIndicators} />);
  fireEvent.click(screen.getByRole('button', { name: /En Meta/i }));
  expect(screen.getByText('Ind A')).toBeInTheDocument();
  expect(screen.queryByText('Ind B')).not.toBeInTheDocument();
  expect(screen.queryByText('Ind C')).not.toBeInTheDocument();
});

test('filters to critico when clicking Crítico tab', () => {
  render(<IndicatorsTable indicadores={mockIndicators} />);
  fireEvent.click(screen.getByRole('button', { name: /Crítico/i }));
  expect(screen.queryByText('Ind A')).not.toBeInTheDocument();
  expect(screen.getByText('Ind B')).toBeInTheDocument();
  expect(screen.queryByText('Ind C')).not.toBeInTheDocument();
});

test('returns to all indicators when clicking Todos tab', () => {
  render(<IndicatorsTable indicadores={mockIndicators} />);
  fireEvent.click(screen.getByRole('button', { name: /En Meta/i }));
  fireEvent.click(screen.getByRole('button', { name: /^Todos$/i }));
  expect(screen.getByText('Ind A')).toBeInTheDocument();
  expect(screen.getByText('Ind B')).toBeInTheDocument();
  expect(screen.getByText('Ind C')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest app/components/__tests__/IndicatorsTable.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module '../IndicatorsTable'`

- [ ] **Step 3: Create IndicatorsTable.tsx**

```tsx
// app/components/IndicatorsTable.tsx
'use client';
import { useState } from 'react';
import type { Indicator, IndicatorStatus } from '@/app/lib/types';

type Filter = 'all' | IndicatorStatus;

const STATUS_STYLES: Record<IndicatorStatus, { badge: string; text: string }> = {
  en_meta:   { badge: 'bg-green-100 text-green-700',  text: '🟢 En meta' },
  alerta:    { badge: 'bg-amber-100 text-amber-700',  text: '🟡 Alerta' },
  critico:   { badge: 'bg-red-100 text-red-700',      text: '🔴 Crítico' },
  sin_datos: { badge: 'bg-slate-100 text-slate-500',  text: '⚪ Sin datos' },
};

const RESULT_COLOR: Record<IndicatorStatus, string> = {
  en_meta:   'text-green-600',
  alerta:    'text-amber-600',
  critico:   'text-red-600',
  sin_datos: 'text-slate-400',
};

const TABS: { key: Filter; label: string }[] = [
  { key: 'all',      label: 'Todos' },
  { key: 'en_meta',  label: '🟢 En Meta' },
  { key: 'alerta',   label: '🟡 Alerta' },
  { key: 'critico',  label: '🔴 Crítico' },
];

export default function IndicatorsTable({ indicadores }: { indicadores: Indicator[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const filtered = filter === 'all' ? indicadores : indicadores.filter(i => i.status === filter);

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-50 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-slate-900">Todos los Indicadores</h3>
        <div className="flex gap-1.5">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                filter === tab.key
                  ? 'bg-[#1B3A8A] text-white border-[#1B3A8A]'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            {['Indicador', 'Proceso', 'Líder', 'Frecuencia', 'Meta', 'Resultado', 'Estado'].map(h => (
              <th
                key={h}
                className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-3 py-2 text-left border-b border-slate-100"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(ind => {
            const { badge, text } = STATUS_STYLES[ind.status];
            return (
              <tr key={ind.numero} className="hover:bg-slate-50">
                <td className="text-xs font-semibold text-slate-700 px-3 py-2.5 border-b border-slate-50">
                  {ind.nombre}
                </td>
                <td className="text-xs text-slate-500 px-3 py-2.5 border-b border-slate-50">
                  {ind.proceso}
                </td>
                <td className="text-xs text-slate-500 px-3 py-2.5 border-b border-slate-50">
                  {ind.lider}
                </td>
                <td className="text-xs text-slate-500 px-3 py-2.5 border-b border-slate-50">
                  {ind.frecuencia}
                </td>
                <td className="text-xs text-slate-500 px-3 py-2.5 border-b border-slate-50">
                  {ind.meta}
                </td>
                <td
                  className={`text-xs font-bold px-3 py-2.5 border-b border-slate-50 ${RESULT_COLOR[ind.status]}`}
                >
                  {ind.resultado !== null ? `${ind.resultado}%` : '—'}
                </td>
                <td className="px-3 py-2.5 border-b border-slate-50">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${badge}`}>
                    {text}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `npx jest app/components/__tests__/IndicatorsTable.test.tsx --no-coverage`
Expected: PASS — 4 tests pass

- [ ] **Step 5: Commit**

```
git add app/components/__tests__/IndicatorsTable.test.tsx app/components/IndicatorsTable.tsx
git commit -m "feat: add filterable IndicatorsTable component with tests"
```

---

## Task 8: Update page.tsx and final wiring

**Files:**
- Rewrite: `app/page.tsx`

- [ ] **Step 1: Replace page.tsx**

```tsx
// app/page.tsx
import { getServerSession } from 'next-auth';
import { authOptions } from './api/auth/[...nextauth]/route';
import { getIndicatorsData } from '@/app/lib/data';
import type { IndicatorYear } from '@/app/lib/sharepoint';
import Nav from './components/Nav';
import HeroBanner from './components/HeroBanner';
import ChartsSection from './components/ChartsSection';
import ProcessGrid from './components/ProcessGrid';
import IndicatorsTable from './components/IndicatorsTable';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const year: IndicatorYear = searchParams.year === '2025' ? '2025' : '2026';
  const session = await getServerSession(authOptions);
  const userName = session?.user?.name ?? session?.user?.email ?? 'Usuario';
  const initials = userName
    .split(' ')
    .map((n: string) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  let data;
  try {
    data = await getIndicatorsData(year);
  } catch {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 shadow text-center max-w-sm">
          <p className="text-red-600 font-semibold mb-2">Error al cargar indicadores</p>
          <p className="text-slate-500 text-sm">
            No se pudo conectar a SharePoint. Verifica la configuración e intenta de nuevo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <Nav year={year} initials={initials} fetchedAt={data.fetchedAt} />
      <HeroBanner summary={data.summary} year={year} />
      <div className="px-8 mt-6">
        <ChartsSection
          procesos={data.procesos}
          mensual={data.mensual}
          trimestres={data.trimestres}
          year={year}
        />
        <ProcessGrid procesos={data.procesos} />
        <IndicatorsTable indicadores={data.indicadores} />
      </div>
      <footer className="bg-slate-50 border-t border-slate-200 px-8 py-4 flex justify-between items-center">
        <span className="text-xs text-slate-400">
          Cuantico · Sistema de Gestión de Calidad ISO 9001 · {year}
        </span>
        <span className="text-xs text-slate-400">
          Datos sincronizados desde SharePoint · MAT-CAL-03 v1
        </span>
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run all tests**

Run: `npx jest --no-coverage`
Expected: all tests pass (excel-parser + IndicatorsTable)

- [ ] **Step 4: Commit all remaining files**

```
git add app/layout.tsx app/page.tsx app/components/Nav.tsx app/components/HeroBanner.tsx \
  app/components/ProcessGrid.tsx app/components/ChartsSection.tsx \
  app/components/charts/BarChart.tsx app/components/charts/LineChart.tsx
git commit -m "feat: build dashboard UI — nav, hero, charts, process grid, page wiring"
```

---

## Self-Review

**Spec coverage:**
- [x] Nav with logo, year toggle, user avatar/initials
- [x] Hero gradient banner with title
- [x] 4 KPI cards floating over hero (Avance Global, En Meta, Alerta, Crítico)
- [x] Horizontal bar chart by process (ECharts, color-coded by status)
- [x] Monthly line chart with area + meta dashed line (ECharts)
- [x] Quarterly summary mini-cards below line chart
- [x] Process grid with SVG ring gauges
- [x] Filterable indicators table (Todos / En Meta / Alerta / Crítico)
- [x] Footer
- [x] Error state for SharePoint failure
- [x] Year switcher (2025/2026) in nav

**No placeholders:** All steps have complete code.

**Type consistency:** `IndicatorYear`, `IndicatorsSummary`, `Process`, `MonthlyData`, `Quarter`, `Indicator`, `IndicatorStatus` — all imported from existing `app/lib/types.ts` and `app/lib/sharepoint.ts`. No invented types.
