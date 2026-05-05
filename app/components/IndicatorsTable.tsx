// app/components/IndicatorsTable.tsx
'use client';
import { useState } from 'react';
import type { Indicator, IndicatorStatus } from '@/app/lib/types';

type Filter = 'all' | IndicatorStatus;

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

const TABS: { key: Filter; label: string }[] = [
  { key: 'all',      label: 'Todos' },
  { key: 'en_meta',  label: '🟢 En Meta' },
  { key: 'alerta',   label: '🟡 Alerta' },
  { key: 'critico',  label: '🔴 Crítico' },
];

export default function IndicatorsTable({ indicadores }: { indicadores: Indicator[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const filtered = filter === 'all' ? indicadores : indicadores.filter(i => i.status === filter);

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-50 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-slate-900">Todos los Indicadores</h3>
        <div className="flex gap-1.5">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                filter === tab.key
                  ? 'bg-[#1B3A8A] text-white border-[#1B3A8A]'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

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
              <tr key={ind.numero} className="hover:bg-slate-50">
                <td className="text-xs font-semibold text-slate-700 px-3 py-2.5 border-b border-slate-50">
                  {ind.nombre}
                </td>
                <td className="text-xs text-slate-500 px-3 py-2.5 border-b border-slate-50">
                  {ind.proceso}
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
                <td
                  className={`text-xs font-bold px-3 py-2.5 border-b border-slate-50 ${RESULT_COLOR[ind.status]}`}
                >
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
  );
}
