'use client';
import { useState, useMemo } from 'react';
import type { Indicator, IndicatorStatus } from '@/app/lib/types';
import IndicatorModal from './IndicatorModal';

type StatusFilter = 'all' | IndicatorStatus;

const STATUS_STYLES: Record<IndicatorStatus, { badge: string; text: string }> = {
  en_meta:   { badge: 'bg-green-100 text-green-700',  text: '🟢 En meta' },
  alerta:    { badge: 'bg-amber-100 text-amber-700',  text: '🟡 Alerta' },
  critico:   { badge: 'bg-red-100 text-red-700',      text: '🔴 Crítico' },
  sin_datos: { badge: 'bg-slate-100 text-slate-500',  text: '⚪ Sin datos' },
};

const RESULT_COLOR: Record<IndicatorStatus, string> = {
  en_meta:   'text-green-600',
  alerta:    'text-amber-600',
  critico:   'text-red-600',
  sin_datos: 'text-slate-400',
};

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all',      label: 'Todos' },
  { key: 'en_meta',  label: '🟢 En Meta' },
  { key: 'alerta',   label: '🟡 Alerta' },
  { key: 'critico',  label: '🔴 Crítico' },
];

export default function IndicatorsTable({
  indicadores,
  processFilter,
  onProcessFilterChange,
}: {
  indicadores: Indicator[];
  processFilter?: string | null;
  onProcessFilterChange?: (p: string | null) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Indicator | null>(null);

  const processos = useMemo(
    () => Array.from(new Set(indicadores.map(i => i.proceso))).sort(),
    [indicadores],
  );

  const filtered = useMemo(() => {
    return indicadores.filter(i => {
      const matchStatus = statusFilter === 'all' || i.status === statusFilter;
      const matchProcess = !processFilter || i.proceso === processFilter;
      return matchStatus && matchProcess;
    });
  }, [indicadores, statusFilter, processFilter]);

  return (
    <>
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-50 mb-8">
        <div className="flex justify-between items-center mb-4 gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-bold text-slate-900 whitespace-nowrap">
              Todos los Indicadores
            </h3>
            <select
              value={processFilter ?? ''}
              onChange={e => onProcessFilterChange?.(e.target.value || null)}
              className="text-xs border border-slate-200 rounded-full px-3 py-1 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-[#1B3A8A]/30 max-w-[220px] truncate"
            >
              <option value="">Todos los procesos</option>
              {processos.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {processFilter && (
              <button
                onClick={() => onProcessFilterChange?.(null)}
                className="text-[11px] text-sky-600 hover:text-sky-800 font-semibold whitespace-nowrap flex items-center gap-0.5"
              >
                <span className="text-base leading-none">×</span> Limpiar
              </button>
            )}
          </div>

          <div className="flex gap-1.5 flex-shrink-0">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  statusFilter === tab.key
                    ? 'bg-[#1B3A8A] text-white border-[#1B3A8A]'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {processFilter && (
          <div className="mb-3 px-3 py-1.5 bg-sky-50 border border-sky-100 rounded-lg text-xs text-sky-700 font-medium">
            Filtrando por proceso: <span className="font-bold">{processFilter}</span>
            {' '}· {filtered.length} indicador{filtered.length !== 1 ? 'es' : ''}
          </div>
        )}

        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Indicador', 'Proceso', 'Líder', 'Frecuencia', 'Meta', 'Resultado', 'Estado'].map(h => (
                <th
                  key={h}
                  className="text-[10px] font-bold text-slate-400 uppercase tracking-wide px-3 py-2 text-left border-b border-slate-100"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(ind => {
              const { badge, text } = STATUS_STYLES[ind.status];
              return (
                <tr
                  key={ind.numero}
                  onClick={() => setSelected(ind)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  title="Ver detalle del indicador"
                >
                  <td className="text-xs font-semibold text-slate-700 px-3 py-2.5 border-b border-slate-50">
                    {ind.nombre}
                  </td>
                  <td className="text-xs text-slate-500 px-3 py-2.5 border-b border-slate-50">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onProcessFilterChange?.(
                          processFilter === ind.proceso ? null : ind.proceso,
                        );
                      }}
                      className="hover:text-sky-600 hover:underline transition-colors text-left"
                    >
                      {ind.proceso}
                    </button>
                  </td>
                  <td className="text-xs text-slate-500 px-3 py-2.5 border-b border-slate-50">
                    {ind.lider}
                  </td>
                  <td className="text-xs text-slate-500 px-3 py-2.5 border-b border-slate-50">
                    {ind.frecuencia}
                  </td>
                  <td className="text-xs text-slate-500 px-3 py-2.5 border-b border-slate-50">
                    {ind.meta}
                  </td>
                  <td className={`text-xs font-bold px-3 py-2.5 border-b border-slate-50 ${RESULT_COLOR[ind.status]}`}>
                    {ind.resultado !== null ? `${ind.resultado}%` : '—'}
                  </td>
                  <td className="px-3 py-2.5 border-b border-slate-50">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${badge}`}>
                      {text}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <IndicatorModal indicator={selected} onClose={() => setSelected(null)} />
    </>
  );
}
