// app/components/HeroBanner.tsx
import type { IndicatorsSummary } from '@/app/lib/types';

type Color = 'blue' | 'green' | 'yellow' | 'red';

const borderColors: Record<Color, string> = {
  blue: 'border-sky-500',
  green: 'border-green-500',
  yellow: 'border-amber-500',
  red: 'border-red-500',
};
const valueColors: Record<Color, string> = {
  blue: 'text-sky-500',
  green: 'text-green-500',
  yellow: 'text-amber-500',
  red: 'text-red-500',
};
const barColors: Record<Color, string> = {
  blue: 'bg-sky-500',
  green: 'bg-green-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
};

function KpiCard({
  label,
  value,
  sub,
  color,
  pct,
}: {
  label: string;
  value: string;
  sub: string;
  color: Color;
  pct: number;
}) {
  return (
    <div className={`bg-white rounded-xl p-5 shadow-lg border-t-[3px] ${borderColors[color]}`}>
      <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-1.5">
        {label}
      </div>
      <div className={`text-[32px] font-extrabold leading-none ${valueColors[color]}`}>
        {value}
      </div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
      <div className="h-1 bg-slate-100 rounded mt-2.5">
        <div
          className={`h-1 rounded ${barColors[color]}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function HeroBanner({
  summary,
  year,
}: {
  summary: IndicatorsSummary;
  year: string;
}) {
  const total = summary.totalIndicadores || 1;
  return (
    <>
      <div className="bg-gradient-to-br from-[#0c2461] via-[#1B3A8A] to-[#0c2461] px-8 pt-10 pb-20 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-[300px] h-[300px] rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.15),transparent_70%)]" />
        <div className="absolute -bottom-20 left-[10%] w-[200px] h-[200px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.12),transparent_70%)]" />
        <div className="relative z-10">
          <p className="text-[11px] text-slate-400 uppercase tracking-[3px] mb-2 font-medium">
            Sistema de Gestión de Calidad
          </p>
          <h1 className="text-white text-[28px] font-extrabold mb-1">
            Cuadro de Mando de Indicadores
          </h1>
          <p className="text-sky-300 text-sm">
            Resultados {year} · Actualizado automáticamente desde SharePoint
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 px-8 -mt-12 relative z-10">
        <KpiCard
          label="Avance Global"
          value={`${summary.avanceGlobal}%`}
          sub={`${summary.medidos} de ${total} indicadores medidos`}
          color="blue"
          pct={summary.avanceGlobal}
        />
        <KpiCard
          label="En Meta 🟢"
          value={String(summary.enMeta)}
          sub="indicadores cumplidos"
          color="green"
          pct={(summary.enMeta / total) * 100}
        />
        <KpiCard
          label="En Alerta 🟡"
          value={String(summary.alerta)}
          sub="requiere atención"
          color="yellow"
          pct={(summary.alerta / total) * 100}
        />
        <KpiCard
          label="Críticos 🔴"
          value={String(summary.critico)}
          sub="fuera de meta"
          color="red"
          pct={(summary.critico / total) * 100}
        />
      </div>
    </>
  );
}
