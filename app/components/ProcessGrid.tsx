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
