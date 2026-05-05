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

function StatusIcon({ status }: { status: IndicatorStatus }) {
  const color = statusColor(status);
  if (status === 'en_meta') {
    return (
      <svg viewBox="0 0 20 20" className="w-5 h-5 flex-shrink-0" fill={color}>
        <circle cx="10" cy="10" r="10" />
        <path d="M6 10.5l3 3 5-5.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }
  if (status === 'alerta') {
    return (
      <svg viewBox="0 0 20 20" className="w-5 h-5 flex-shrink-0" fill={color}>
        <circle cx="10" cy="10" r="10" />
        <path d="M10 6v5" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="10" cy="14" r="1" fill="white" />
      </svg>
    );
  }
  if (status === 'critico') {
    return (
      <svg viewBox="0 0 20 20" className="w-5 h-5 flex-shrink-0" fill={color}>
        <circle cx="10" cy="10" r="10" />
        <path d="M7 7l6 6M13 7l-6 6" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 flex-shrink-0" fill={color}>
      <circle cx="10" cy="10" r="10" />
      <path d="M7 10h6" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
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
            <th className="text-[9px] font-bold text-slate-400 uppercase tracking-wide px-3 py-2 text-left w-8">OC</th>
            <th className="text-[9px] font-bold text-slate-400 uppercase tracking-wide px-3 py-2 text-left">Objetivo</th>
            <th className="text-[9px] font-bold text-slate-400 uppercase tracking-wide px-3 py-2 text-right w-14">%</th>
            <th className="text-[9px] font-bold text-slate-400 uppercase tracking-wide px-3 py-2 text-center w-16">Estado</th>
          </tr>
        </thead>
        <tbody>
          {ocData.map(oc => {
            const status = ocStatus(oc.cumplimiento, oc.meta);
            const desc = descMap[oc.codigo] ?? oc.label.split(' - ').slice(1).join(' - ') ?? oc.label;
            const color = statusColor(status);
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
                  <p className="text-[9px] text-slate-400 tabular-nums">meta {oc.meta}%</p>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-center">
                    <StatusIcon status={status} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
