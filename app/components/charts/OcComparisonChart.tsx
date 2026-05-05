'use client';
import ReactECharts from 'echarts-for-react';
import type { OcRadarData } from '@/app/lib/types';

export default function OcComparisonChart({
  ocData2025,
  ocData2026,
}: {
  ocData2025: OcRadarData[];
  ocData2026: OcRadarData[];
}) {
  const allCodes = Array.from(
    new Set([...ocData2025.map(d => d.codigo), ...ocData2026.map(d => d.codigo)])
  ).sort((a, b) => a.localeCompare(b));

  const map2025 = new Map(ocData2025.map(d => [d.codigo, d]));
  const map2026 = new Map(ocData2026.map(d => [d.codigo, d]));

  const yLabels = allCodes.map(c => {
    const d = map2026.get(c) ?? map2025.get(c);
    return d?.label ?? c;
  });

  const values2025 = allCodes.map(c => map2025.get(c)?.cumplimiento ?? null);
  const values2026 = allCodes.map(c => map2026.get(c)?.cumplimiento ?? null);

  const labelStyle = {
    show: true,
    position: 'right' as const,
    formatter: (params: { value: number | null }) =>
      params.value !== null && params.value !== undefined ? `${params.value}%` : '',
    fontSize: 9,
    color: '#64748b',
  };

  const option = {
    animation: true,
    animationDuration: 1400,
    animationEasing: 'cubicOut',
    grid: { left: 150, right: 52, top: 16, bottom: 48 },
    xAxis: {
      type: 'value',
      min: 0,
      max: 110,
      axisLabel: { formatter: '{value}%', fontSize: 9, color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category',
      data: yLabels,
      inverse: true,
      axisLabel: { fontSize: 9, color: '#64748b', width: 140, overflow: 'truncate' },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: '2025',
        type: 'bar',
        barMaxWidth: 14,
        data: values2025,
        label: labelStyle,
        itemStyle: { color: '#3b82f6', borderRadius: [0, 3, 3, 0] },
        markLine: {
          symbol: 'none',
          label: { show: false },
          data: [{ xAxis: 90 }],
          lineStyle: { color: '#94a3b8', type: 'dashed', width: 1.5 },
        },
      },
      {
        name: '2026',
        type: 'bar',
        barMaxWidth: 14,
        data: values2026,
        label: labelStyle,
        itemStyle: { color: '#10b981', borderRadius: [0, 3, 3, 0] },
      },
    ],
    legend: {
      data: ['2025', '2026'],
      bottom: 4,
      textStyle: { fontSize: 10, color: '#94a3b8' },
      itemWidth: 14,
      itemHeight: 8,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ seriesName: string; value: number | null; name: string }>) => {
        const label = params[0]?.name ?? '';
        const lines = params.map(
          p => `${p.seriesName}: ${p.value !== null && p.value !== undefined ? `${p.value}%` : '—'}`
        );
        return `<b>${label}</b><br/>${lines.join('<br/>')}`;
      },
    },
  };

  const chartHeight = Math.max(200, allCodes.length * 52 + 80);

  return <ReactECharts option={option} style={{ height: chartHeight }} />;
}
