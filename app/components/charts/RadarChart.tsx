'use client';
import ReactECharts from 'echarts-for-react';
import { useRef, useEffect } from 'react';
import type { OcRadarData } from '@/app/lib/types';

export default function RadarChart({ ocData }: { ocData: OcRadarData[] }) {
  const chartRef = useRef<ReactECharts>(null);

  useEffect(() => {
    const nonCompliant = ocData.filter(oc => oc.cumplimiento < oc.meta);
    if (nonCompliant.length === 0) {
      // Clear any leftover dots from a previous render
      chartRef.current?.getEchartsInstance()?.setOption({ graphic: [] });
      return;
    }

    // Wait for the 600ms animation to finish before placing dots
    const timer = setTimeout(() => {
      const inst = chartRef.current?.getEchartsInstance();
      if (!inst) return;

      const n = ocData.length;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cs: { cx: number; cy: number; r: number } | undefined;
      try {
        cs = (inst.getModel().getComponent('radar', 0) as any)?.coordinateSystem;
      } catch {
        cs = undefined;
      }

      let cx: number, cy: number, maxR: number;
      if (cs && typeof cs.cx === 'number' && typeof cs.r === 'number') {
        cx = cs.cx;
        cy = cs.cy;
        maxR = cs.r;
      } else {
        // Fallback: approximate from container dimensions
        const dom = inst.getDom();
        const { width, height } = dom.getBoundingClientRect();
        cx = width / 2;
        cy = (height - 32) / 2;
        maxR = (Math.min(width, height - 32) / 2) * 0.7;
      }

      // Indicator i is at angle = 90 + i*(360/n) degrees (confirmed from rendered layout).
      // Screen coords: x = cx + r*cos(angle), y = cy - r*sin(angle)
      const graphics = ocData.flatMap((oc, i) => {
        if (oc.cumplimiento >= oc.meta) return [];

        const angleDeg = 90 + i * (360 / n);
        const angleRad = (angleDeg * Math.PI) / 180;
        const r = (oc.cumplimiento / 100) * maxR;

        return [
          {
            type: 'circle',
            shape: { r: 5.5, cx: cx + r * Math.cos(angleRad), cy: cy - r * Math.sin(angleRad) },
            style: { fill: '#ef4444', stroke: '#fff', lineWidth: 2 },
            z: 200,
          },
        ];
      });

      if (graphics.length > 0) {
        inst.setOption({ graphic: graphics });
      }
    }, 680);

    return () => {
      clearTimeout(timer);
      try {
        chartRef.current?.getEchartsInstance()?.setOption({ graphic: [] });
      } catch {
        // chart may be unmounted
      }
    };
  }, [ocData]);

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
      radius: '70%',
      axisName: { fontSize: 9, color: '#64748b' },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: { name: string; value: number[] }) =>
        ocData
          .map(
            (oc, i) =>
              `<b>${oc.codigo}</b>: ${params.name === 'Meta' ? oc.meta : (params.value[i] ?? oc.cumplimiento)}%`,
          )
          .join('<br/>'),
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
            symbol: 'circle',
            symbolSize: 4,
          },
          {
            name: 'Meta',
            value: ocData.map(oc => oc.meta),
            itemStyle: { color: '#6b7280' },
            areaStyle: { opacity: 0 },
            lineStyle: { color: '#6b7280', width: 2, type: 'dashed' },
            symbol: 'none',
          },
        ],
      },
    ],
  };

  return <ReactECharts ref={chartRef} option={option} style={{ height: 280 }} />;
}
