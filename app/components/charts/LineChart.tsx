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
      max: 110,
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
