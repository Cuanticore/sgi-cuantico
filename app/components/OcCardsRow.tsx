'use client';
import type { OcRadarData, IndicatorStatus } from '@/app/lib/types';

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

export default function OcCardsRow({
  ocData,
  selected,
  onSelect,
}: {
  ocData: OcRadarData[];
  selected?: string | null;
  onSelect?: (codigo: string | null) => void;
}) {
  if (ocData.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {ocData.map(oc => {
        const status = ocStatus(oc.cumplimiento, oc.meta);
        const color = statusColor(status);
        const desc = oc.label.split(' - ').slice(1).join(' - ') || oc.label;
        const barWidth = oc.meta > 0
          ? `${Math.min((oc.cumplimiento / oc.meta) * 100, 100).toFixed(1)}%`
          : '0%';
        const isSelected = selected === oc.codigo;
        const isDimmed = selected !== null && selected !== undefined && !isSelected;

        return (
          <div
            key={oc.codigo}
            onClick={() => onSelect?.(isSelected ? null : oc.codigo)}
            className={`bg-white rounded-xl shadow-sm border p-2 flex flex-col gap-1 cursor-pointer transition-all ${
              isSelected
                ? 'border-[#1B3A8A] ring-2 ring-[#1B3A8A]/20 shadow-md'
                : isDimmed
                ? 'border-slate-50 opacity-40'
                : 'border-slate-50 hover:border-slate-200 hover:shadow-md'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: color }}
              />
              <span className="text-[11px] font-bold text-slate-900">{oc.codigo}</span>
              <span className="text-[9px] text-slate-400 ml-auto">{statusLabel(status)}</span>
            </div>
            <p className="text-[10px] text-slate-600 truncate">{desc}</p>
            <div className="bg-slate-100 rounded-full h-1 w-full">
              <div
                className="h-1 rounded-full"
                style={{ width: barWidth, background: color }}
              />
            </div>
            <p className="text-[9px] text-slate-400">
              {oc.cumplimiento}% / meta {oc.meta}%
            </p>
          </div>
        );
      })}
    </div>
  );
}
