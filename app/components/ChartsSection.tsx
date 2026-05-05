// app/components/ChartsSection.tsx
import type { Process, MonthlyData, Quarter, IndicatorStatus } from '@/app/lib/types';
import BarChart from './charts/BarChart';
import LineChart from './charts/LineChart';

function quarterBorder(status: IndicatorStatus): string {
  if (status === 'en_meta') return 'border-green-500';
  if (status === 'alerta') return 'border-amber-500';
  return 'border-red-500';
}

export default function ChartsSection({
  procesos,
  mensual,
  trimestres,
  year,
  selectedProcess,
  onProcessSelect,
}: {
  procesos: Process[];
  mensual: MonthlyData[];
  trimestres: Quarter[];
  year: string;
  selectedProcess?: string | null;
  onProcessSelect?: (nombre: string | null) => void;
}) {
  return (
    <div className="mb-6">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
        Análisis de Desempeño
      </p>
      <div className="grid grid-cols-[1.4fr_1fr] gap-5">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-50">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Cumplimiento por Proceso</h3>
          <p className="text-xs text-slate-400 mb-5">
            Comparativo de todos los procesos · {year}
          </p>
          <BarChart
            procesos={procesos}
            selectedProcess={selectedProcess}
            onProcessSelect={onProcessSelect}
          />
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-50">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Evolución Mensual {year}</h3>
          <p className="text-xs text-slate-400 mb-5">Cumplimiento promedio por mes</p>
          <LineChart mensual={mensual} />
          <div className="grid grid-cols-2 gap-2 mt-3">
            {trimestres.map(q => (
              <div
                key={q.label}
                className={`bg-slate-50 rounded-md p-2 border-l-[3px] ${quarterBorder(q.status)}`}
              >
                <div className="text-[10px] text-slate-500">
                  {q.label} {q.months}
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {q.cumplimiento !== null ? `${q.cumplimiento}%` : 'S/D'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
