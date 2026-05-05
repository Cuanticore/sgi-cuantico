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
