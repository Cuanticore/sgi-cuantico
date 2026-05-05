'use client';
import type { OcRadarData, IndicatorStatus, QualityObjective } from '@/app/lib/types';

function ocStatus(cumplimiento: number, meta: number): IndicatorStatus {
  if (meta === 0) return 'sin_datos';
  if (cumplimiento >= meta) return 'en_meta';
  if (cumplimiento / meta >= 0.85) return 'alerta';
  return 'critico';
}

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

function TrafficLight({ status }: { status: IndicatorStatus }) {
  return (
    <div className="flex flex-col gap-[3px] items-center">
      <div className={`w-2 h-2 rounded-full ${status === 'en_meta' ? 'bg-green-500' : 'bg-green-100'}`} />
      <div className={`w-2 h-2 rounded-full ${status === 'alerta' ? 'bg-amber-400' : 'bg-amber-100'}`} />
      <div className={`w-2 h-2 rounded-full ${status === 'critico' ? 'bg-red-500' : 'bg-red-100'}`} />
    </div>
  );
}

export default function OcCardsRow({
  ocData,
  objetivosCalidad = [],
  selected,
  onSelect,
}: {
  ocData: OcRadarData[];
  objetivosCalidad?: QualityObjective[];
  selected?: string | null;
  onSelect?: (codigo: string | null) => void;
}) {
  if (ocData.length === 0) return null;

  const descMap = Object.fromEntries(objetivosCalidad.map(o => [o.codigo, o.descripcion]));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-50 overflow-hidden h-full">
      <table className="w-full border-collapse h-full">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-[9px] font-bold text-slate-400 uppercase tracking-wide px-3 py-2 text-left w-6" />
            <th className="text-[9px] font-bold text-slate-400 uppercase tracking-wide px-2 py-2 text-left w-8">OC</th>
            <th className="text-[9px] font-bold text-slate-400 uppercase tracking-wide px-3 py-2 text-left">Objetivo</th>
            <th className="text-[9px] font-bold text-slate-400 uppercase tracking-wide px-3 py-2 text-right w-14">%</th>
            <th className="text-[9px] font-bold text-slate-400 uppercase tracking-wide px-3 py-2 text-left w-24">Progreso</th>
          </tr>
        </thead>
        <tbody>
          {ocData.map(oc => {
            const status = ocStatus(oc.cumplimiento, oc.meta);
            const color = statusColor(status);
            const desc = descMap[oc.codigo] ?? oc.label.split(' - ').slice(1).join(' - ') ?? oc.label;
            const barWidth = oc.meta > 0
              ? `${Math.min((oc.cumplimiento / oc.meta) * 100, 100).toFixed(1)}%`
              : '0%';
            const isSelected = selected === oc.codigo;
            const isDimmed = selected != null && !isSelected;

            return (
              <tr
                key={oc.codigo}
                onClick={() => onSelect?.(isSelected ? null : oc.codigo)}
                className={`cursor-pointer border-b border-slate-50 transition-all last:border-0 ${
                  isSelected
                    ? 'bg-[#1B3A8A]/5'
                    : isDimmed
                    ? 'opacity-35'
                    : 'hover:bg-slate-50'
                }`}
              >
                <td className="px-3 py-2">
                  <TrafficLight status={status} />
                </td>
                <td className="px-2 py-2">
                  <span className="text-[11px] font-bold text-slate-700">{oc.codigo}</span>
                </td>
                <td className="px-3 py-2">
                  <p className="text-[10px] text-slate-700 leading-snug">{desc}</p>
                  <p className="text-[9px] text-slate-400">{statusLabel(status)}</p>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="text-sm font-bold tabular-nums" style={{ color }}>
                    {oc.cumplimiento}%
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="bg-slate-100 rounded-full h-1.5 w-full mb-0.5">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: barWidth, background: color }}
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 tabular-nums">
                    meta {oc.meta}%
                  </p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
