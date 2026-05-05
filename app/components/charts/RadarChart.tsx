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
