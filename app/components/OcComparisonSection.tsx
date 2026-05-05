import type { OcRadarData, Indicator } from '@/app/lib/types';
import OcComparisonChart from './charts/OcComparisonChart';

function Top5Card({
  title,
  subtitle,
  indicators,
  variant,
}: {
  title: string;
  subtitle: string;
  indicators: Indicator[];
  variant: 'green' | 'red';
}) {
  const rankColor = variant === 'green' ? 'text-green-500' : 'text-red-500';
  const valueColor = variant === 'green' ? 'text-green-600' : 'text-red-600';
  const dotColor = variant === 'green' ? 'bg-green-500' : 'bg-red-500';

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-50 flex flex-col">
      <h3 className="text-sm font-bold text-slate-900 mb-1">{title}</h3>
      <p className="text-xs text-slate-400 mb-4">{subtitle}</p>
      {indicators.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-slate-300 py-4">
          Sin indicadores
        </div>
      ) : (
        <ol className="space-y-3">
          {indicators.map((ind, i) => (
            <li key={ind.numero} className="flex items-start gap-2.5">
              <span className={`text-xs font-bold w-4 shrink-0 pt-px ${rankColor}`}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-slate-800 leading-tight line-clamp-2">
                    {ind.nombre}
                  </p>
                  <span className={`text-xs font-bold shrink-0 ${valueColor}`}>
                    {ind.resultado !== null ? `${ind.resultado}%` : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                  <p className="text-[10px] text-slate-400 truncate">{ind.proceso}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function OcComparisonSection({
  ocData2025,
  ocData2026,
  indicadores,
  year,
}: {
  ocData2025: OcRadarData[];
  ocData2026: OcRadarData[];
  indicadores: Indicator[];
  year: string;
}) {
  if (ocData2025.length === 0 && ocData2026.length === 0) return null;

  const top5EnMeta = indicadores
    .filter(i => i.status === 'en_meta' && i.resultado !== null)
    .sort((a, b) => (b.resultado ?? 0) - (a.resultado ?? 0))
    .slice(0, 5);

  const top5Critico = indicadores
    .filter(i => i.status === 'critico' && i.resultado !== null)
    .sort((a, b) => (a.resultado ?? 0) - (b.resultado ?? 0))
    .slice(0, 5);

  return (
    <div className="mb-6">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
        Comparativo Anual
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-50">
          <h3 className="text-sm font-bold text-slate-900 mb-1">
            Cumplimiento por OC
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            2025 vs. 2026 · promedio por Objetivo de Calidad
          </p>
          <OcComparisonChart ocData2025={ocData2025} ocData2026={ocData2026} />
        </div>

        <Top5Card
          title="Top 5 · En Meta"
          subtitle={`Mayor resultado · ${year}`}
          indicators={top5EnMeta}
          variant="green"
        />

        <Top5Card
          title="Top 5 · Críticos"
          subtitle={`Menor resultado · ${year}`}
          indicators={top5Critico}
          variant="red"
        />
      </div>
    </div>
  );
}
