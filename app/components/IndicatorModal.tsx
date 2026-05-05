'use client';
import { useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import type { Indicator, IndicatorStatus } from '@/app/lib/types';

const STATUS_STYLES: Record<IndicatorStatus, { badge: string; text: string }> = {
  en_meta:   { badge: 'bg-green-100 text-green-700 border-green-200',   text: '🟢 En Meta' },
  alerta:    { badge: 'bg-amber-100 text-amber-700 border-amber-200',   text: '🟡 Alerta' },
  critico:   { badge: 'bg-red-100 text-red-700 border-red-200',         text: '🔴 Crítico' },
  sin_datos: { badge: 'bg-slate-100 text-slate-500 border-slate-200',   text: '⚪ Sin datos' },
};

const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function parseMeta(meta: string): number | null {
  const n = parseFloat(meta.replace('%', '').replace('≥', '').trim());
  return isNaN(n) ? null : n;
}

// Divide >= 1M by 1,000,000 and append " M" — Colombian locale (period = thousands, comma = decimal)
function formatRaw(v: number | null): string {
  if (v === null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) {
    const m = v / 1_000_000;
    return m.toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M';
  }
  if (abs >= 1_000) return v.toLocaleString('es-CO', { maximumFractionDigits: 0 });
  return v.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

function cardClass(v: number | null, metaNum: number | null): string {
  if (v === null) return 'bg-slate-50 text-slate-300 border-slate-100';
  const m = metaNum ?? 90;
  if (v >= m)       return 'bg-green-50 text-green-700 border-green-200';
  if (v >= m * 0.8) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-600 border-red-200';
}

function barColor(v: number | null, metaNum: number | null): string {
  if (v === null) return '#e2e8f0';
  const m = metaNum ?? 90;
  if (v >= m)       return '#22c55e';
  if (v >= m * 0.8) return '#f59e0b';
  return '#ef4444';
}

function resultTextClass(status: IndicatorStatus): string {
  return status === 'en_meta' ? 'text-green-600'
    : status === 'alerta' ? 'text-amber-600'
    : status === 'critico' ? 'text-red-600'
    : 'text-slate-300';
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function getChartData(ind: Indicator): { labels: string[]; values: (number | null)[] } {
  const freq = ind.frecuencia?.toLowerCase() ?? '';
  if (freq.includes('trimestral')) return { labels: ['Q1','Q2','Q3','Q4'], values: ind.datosTrimestrales };
  if (freq.includes('semestral'))  return { labels: ['S1','S2'],            values: ind.datosSemestrales };
  if (freq.includes('anual') && ind.datosTrimestrales.some(v => v !== null))
    return { labels: ['Q1','Q2','Q3','Q4'], values: ind.datosTrimestrales };
  if (freq.includes('anual'))      return { labels: ['Resultado'],           values: [ind.resultado] };
  return { labels: MONTH_LABELS, values: ind.datosMensuales.map(m => m.resultado) };
}

function IndicatorChart({ ind, metaNum }: { ind: Indicator; metaNum: number | null }) {
  const { labels, values } = getChartData(ind);
  const maxVal = Math.max(110, ...(values.filter(v => v !== null) as number[]), metaNum ?? 0);

  const option = {
    animation: true, animationDuration: 600,
    grid: { left: 34, right: 20, top: 18, bottom: 26 },
    xAxis: {
      type: 'category', data: labels,
      axisLabel: { fontSize: 9, color: '#64748b' },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
    },
    yAxis: {
      type: 'value', max: maxVal + 5,
      axisLabel: { fontSize: 8, color: '#94a3b8', formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: { name: string; value: number | null }[]) => {
        const p = params[0];
        return `${p.name}: <b>${p.value !== null ? p.value + '%' : 'Sin datos'}</b>`;
      },
    },
    series: [{
      type: 'bar', barMaxWidth: 36, borderRadius: [3, 3, 0, 0],
      data: values.map(v => ({ value: v, itemStyle: { color: barColor(v, metaNum) } })),
      label: {
        show: true, position: 'top',
        formatter: (p: { value: number | null }) => p.value !== null ? `${p.value}%` : '',
        fontSize: 9, fontWeight: 700, color: '#334155',
      },
      markLine: metaNum !== null ? {
        silent: true,
        lineStyle: { color: '#1B3A8A', type: 'dashed' as const, width: 1.5 },
        data: [{ yAxis: metaNum, label: { formatter: `Meta ${metaNum}%`, color: '#1B3A8A', fontSize: 9, position: 'insideEndTop' as const } }],
      } : undefined,
    }],
  };

  return <ReactECharts option={option} style={{ height: 180 }} />;
}

// ─── Right panel: period grid + V1/V2 table ───────────────────────────────────

function PeriodGrid({ ind, metaNum }: { ind: Indicator; metaNum: number | null }) {
  const freq = ind.frecuencia?.toLowerCase() ?? '';

  if (freq.includes('semestral')) {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {['S1','S2'].map((s, i) => {
          const v = ind.datosSemestrales[i];
          return (
            <div key={s} className={`rounded-lg border p-2 text-center ${cardClass(v, metaNum)}`}>
              <div className="text-[10px] font-semibold opacity-60">{s}</div>
              <div className="text-sm font-black mt-0.5">{v !== null ? `${v}%` : '—'}</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (freq.includes('trimestral') || freq.includes('anual')) {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {['Q1','Q2','Q3','Q4'].map((q, i) => {
          const v = ind.datosTrimestrales[i];
          return (
            <div key={q} className={`rounded-lg border p-2 text-center ${cardClass(v, metaNum)}`}>
              <div className="text-[10px] font-semibold opacity-60">{q}</div>
              <div className="text-sm font-black mt-0.5">{v !== null ? `${v}%` : '—'}</div>
            </div>
          );
        })}
      </div>
    );
  }

  // Monthly: 3-col grid + quarterly totals
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-1">
        {ind.datosMensuales.map((m, i) => (
          <div key={MONTH_LABELS[i]} className={`rounded-md border px-1 py-1.5 text-center ${cardClass(m.resultado, metaNum)}`}>
            <div className="text-[9px] font-medium opacity-60">{MONTH_LABELS[i]}</div>
            <div className="text-[11px] font-bold">{m.resultado !== null ? `${m.resultado}%` : '—'}</div>
          </div>
        ))}
      </div>
      {ind.datosTrimestrales.some(v => v !== null) && (
        <div className="grid grid-cols-4 gap-1">
          {['Q1','Q2','Q3','Q4'].map((q, i) => {
            const v = ind.datosTrimestrales[i];
            return (
              <div key={q} className={`rounded-md border px-1 py-1 text-center ${cardClass(v, metaNum)}`}>
                <div className="text-[9px] font-bold opacity-60">{q}</div>
                <div className="text-[10px] font-bold">{v !== null ? `${v}%` : '—'}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function V1V2Table({ ind, metaNum }: { ind: Indicator; metaNum: number | null }) {
  const freq = ind.frecuencia?.toLowerCase() ?? '';
  const rows: { label: string; v1: number | null; v2: number | null; resultado: number | null; isAgg?: boolean }[] = [];

  if (freq.includes('semestral')) {
    [0, 1].forEach(si => {
      const months = si === 0 ? [0,1,2,3,4,5] : [6,7,8,9,10,11];
      months.forEach(mi => {
        const m = ind.datosMensuales[mi];
        if (m.v1 !== null || m.v2 !== null)
          rows.push({ label: MONTH_LABELS[mi], ...m });
      });
      rows.push({ label: `S${si+1}`, v1: null, v2: null, resultado: ind.datosSemestrales[si], isAgg: true });
    });
  } else if (freq.includes('trimestral') || freq.includes('anual')) {
    [[0,1,2],[3,4,5],[6,7,8],[9,10,11]].forEach((months, qi) => {
      months.forEach(mi => {
        const m = ind.datosMensuales[mi];
        if (m.v1 !== null || m.v2 !== null)
          rows.push({ label: MONTH_LABELS[mi], ...m });
      });
      rows.push({ label: `Q${qi+1}`, v1: null, v2: null, resultado: ind.datosTrimestrales[qi], isAgg: true });
    });
  } else {
    ind.datosMensuales.forEach((m, i) => {
      if (m.v1 !== null || m.v2 !== null)
        rows.push({ label: MONTH_LABELS[i], ...m });
    });
  }

  if (rows.length === 0) return null;

  return (
    <table className="w-full text-[11px] border-collapse">
      <thead>
        <tr className="border-b border-slate-200">
          <th className="text-left text-[9px] font-bold text-slate-400 uppercase pb-1 pr-1">Per.</th>
          <th className="text-right text-[9px] font-bold text-slate-400 uppercase pb-1 px-1">V1</th>
          <th className="text-right text-[9px] font-bold text-slate-400 uppercase pb-1 px-1">V2</th>
          <th className="text-right text-[9px] font-bold text-slate-400 uppercase pb-1 pl-1">Res.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={`border-b border-slate-100 ${r.isAgg ? 'bg-slate-100/70' : ''}`}>
            <td className={`py-0.5 pr-1 ${r.isAgg ? 'font-bold text-slate-700' : 'text-slate-400 pl-1'}`}>
              {r.label}
            </td>
            <td className="text-right py-0.5 px-1 text-slate-500 tabular-nums">{formatRaw(r.v1)}</td>
            <td className="text-right py-0.5 px-1 text-slate-500 tabular-nums">{formatRaw(r.v2)}</td>
            <td className={`text-right py-0.5 pl-1 tabular-nums font-semibold ${
              r.resultado !== null
                ? (metaNum !== null && r.resultado >= metaNum ? 'text-green-600' : metaNum !== null && r.resultado >= metaNum * 0.8 ? 'text-amber-600' : 'text-red-600')
                : 'text-slate-300'
            }`}>
              {r.resultado !== null ? `${r.resultado}%` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  indicator: Indicator | null;
  onClose: () => void;
}

export default function IndicatorModal({ indicator: ind, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  if (!ind) return null;

  const { badge, text: statusText } = STATUS_STYLES[ind.status];
  const metaNum = parseMeta(ind.meta);
  const metaDisplay = metaNum !== null ? `${metaNum}%` : (ind.meta || '—');
  const hasV1V2 = ind.datosMensuales.some(m => m.v1 !== null || m.v2 !== null);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[860px] max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="flex-1 pr-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                #{ind.numero} · {ind.proceso}
              </span>
              {ind.tipo && ind.tipo !== 'undefined' && (
                <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded font-medium">{ind.tipo}</span>
              )}
            </div>
            <h2 className="text-[15px] font-bold text-slate-900 leading-snug">{ind.nombre}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge}`}>
              {statusText}
            </span>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors text-xl leading-none"
            >×</button>
          </div>
        </div>

        {/* Two-column body */}
        <div className="flex divide-x divide-slate-100">

          {/* ── Left: info + chart ── */}
          <div className="flex-1 min-w-0 px-5 py-4 space-y-4">

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <div className={`text-2xl font-black ${resultTextClass(ind.status)}`}>
                  {ind.resultado !== null ? `${ind.resultado}%` : '—'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Resultado</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-black text-[#1B3A8A]">{metaDisplay}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Meta</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                {metaNum !== null && ind.resultado !== null ? (
                  <>
                    <div className={`text-2xl font-black ${ind.resultado - metaNum >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {ind.resultado - metaNum >= 0 ? '+' : ''}{Math.round((ind.resultado - metaNum) * 10) / 10}%
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Brecha</div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-black text-slate-300">—</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Brecha</div>
                  </>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div className="flex gap-2">
                <span className="text-slate-400 w-14 shrink-0">Líder</span>
                <span className="text-slate-700 font-medium">{ind.lider || '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-14 shrink-0">Frecuencia</span>
                <span className="text-slate-700 font-medium">{ind.frecuencia || '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-14 shrink-0">OC</span>
                <span className="text-slate-700 font-medium">{ind.oc || '—'}</span>
              </div>
              {ind.objetivo && ind.objetivo !== 'undefined' && (
                <div className="flex gap-2 col-span-2">
                  <span className="text-slate-400 w-14 shrink-0">Objetivo</span>
                  <span className="text-slate-600 leading-snug">{ind.objetivo}</span>
                </div>
              )}
              {ind.formula && ind.formula !== 'undefined' && (
                <div className="flex gap-2 col-span-2">
                  <span className="text-slate-400 w-14 shrink-0">Fórmula</span>
                  <span className="text-slate-600 font-mono text-[10px] bg-slate-50 px-2 py-0.5 rounded leading-relaxed">{ind.formula}</span>
                </div>
              )}
            </div>

            {/* Niveles */}
            {[ind.nivelEstandar, ind.nivelMedio, ind.nivelCritico].some(v => v && v !== 'undefined') && (
              <div className="flex gap-2">
                {ind.nivelEstandar && ind.nivelEstandar !== 'undefined' && (
                  <div className="flex-1 bg-green-50 border border-green-100 rounded-lg py-1.5 text-center">
                    <div className="text-[11px] font-bold text-green-700">{ind.nivelEstandar}</div>
                    <div className="text-[9px] text-green-500 mt-0.5">Estándar</div>
                  </div>
                )}
                {ind.nivelMedio && ind.nivelMedio !== 'undefined' && (
                  <div className="flex-1 bg-amber-50 border border-amber-100 rounded-lg py-1.5 text-center">
                    <div className="text-[11px] font-bold text-amber-700">{ind.nivelMedio}</div>
                    <div className="text-[9px] text-amber-500 mt-0.5">Medio</div>
                  </div>
                )}
                {ind.nivelCritico && ind.nivelCritico !== 'undefined' && (
                  <div className="flex-1 bg-red-50 border border-red-100 rounded-lg py-1.5 text-center">
                    <div className="text-[11px] font-bold text-red-700">{ind.nivelCritico}</div>
                    <div className="text-[9px] text-red-500 mt-0.5">Crítico</div>
                  </div>
                )}
              </div>
            )}

            {/* Chart */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                Evolución de resultados
              </p>
              <IndicatorChart ind={ind} metaNum={metaNum} />
            </div>
          </div>

          {/* ── Right: measurements ── */}
          <div className="w-[260px] shrink-0 px-4 py-4 space-y-4 bg-slate-50/40">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">
                Mediciones
              </p>
              <PeriodGrid ind={ind} metaNum={metaNum} />
            </div>

            {hasV1V2 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">
                  V1 / V2 detalle
                </p>
                <V1V2Table ind={ind} metaNum={metaNum} />
              </div>
            )}

            {!hasV1V2 && (
              <p className="text-[10px] text-slate-300 text-center py-4">Sin mediciones detalladas</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
