import type { OcRadarData } from '@/app/lib/types';
import type { IndicatorStatus } from '@/app/lib/types';

function ocStatus(cumplimiento: number, meta: number): IndicatorStatus {
  if (meta === 0) return 'sin_datos';
  const ratio = cumplimiento / meta;
  if (ratio >= 0.95) return 'en_meta';
  if (ratio >= 0.85) return 'alerta';
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

export default function OcCardsRow({ ocData }: { ocData: OcRadarData[] }) {
  if (ocData.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 mb-6">
      {ocData.map(oc => {
        const status = ocStatus(oc.cumplimiento, oc.meta);
        const color = statusColor(status);
        const desc = oc.label.split(' - ').slice(1).join(' - ');
        const barWidth = oc.meta > 0
          ? `${Math.min((oc.cumplimiento / oc.meta) * 100, 100).toFixed(1)}%`
          : '0%';

        return (
          <div
            key={oc.codigo}
            className="min-w-[200px] bg-white rounded-xl shadow-sm border border-slate-50 p-3 flex flex-col gap-1.5"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: color }}
              />
              <span className="text-xs font-bold text-slate-900">{oc.codigo}</span>
              <span className="text-[10px] text-slate-400 ml-auto">{statusLabel(status)}</span>
            </div>
            <p className="text-[11px] text-slate-600 truncate">{desc}</p>
            <div className="bg-slate-100 rounded-full h-1.5 w-full">
              <div
                className="h-1.5 rounded-full"
                style={{ width: barWidth, background: color }}
              />
            </div>
            <p className="text-[10px] text-slate-400">
              {oc.cumplimiento}% / meta {oc.meta}%
            </p>
          </div>
        );
      })}
    </div>
  );
}
