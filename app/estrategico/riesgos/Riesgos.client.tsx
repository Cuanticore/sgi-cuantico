'use client';

// app/estrategico/riesgos/Riesgos.client.tsx
//
// La tabla de la matriz con chips por clase y el panel de cálculo en vivo: cambiar
// P, I o el control recalcula los pasos mostrados (inherente = P×I, P_res, I_res,
// residual) y el nivel. La advertencia de oportunidades (D9) es parte del diseño.

import { useMemo, useState } from 'react';
import { residualDe, nivelDe, EFICACIA } from '@/lib/sig/estrategico';

export interface FilaRiesgo {
  id: number;
  codigo: string;
  clase: string;
  descripcion: string;
  proceso: string;
  factor: string;
  p: number;
  i: number;
  inherente: number;
  residual: number;
  nivel: number;
  nivelEtiqueta: string;
  nivelColor: string;
  control: string | null;
}

export default function RiesgosClient({
  filas,
  tipos,
  eficacias,
  niveles,
}: {
  filas: FilaRiesgo[];
  tipos: { id: number; nombre: string; reduce: string }[];
  eficacias: { id: number; nombre: string; valor: number }[];
  niveles: { minimo: number; etiqueta: string; color: string; accionRiesgo: string; accionOportunidad: string }[];
}) {
  const [clase, setClase] = useState<'todos' | 'RIESGO' | 'OPORTUNIDAD'>('todos');
  const [abierto, setAbierto] = useState<FilaRiesgo | null>(null);
  const [p, setP] = useState(3);
  const [i, setI] = useState(3);
  const [tipoId, setTipoId] = useState(tipos[0]?.id ?? 0);
  const [eficaciaId, setEficaciaId] = useState(eficacias[0]?.id ?? 0);

  const visibles = useMemo(
    () => (clase === 'todos' ? filas : filas.filter((f) => f.clase === clase)),
    [filas, clase],
  );

  const minimos = niveles.map((n) => n.minimo);
  const tipo = tipos.find((t) => t.id === tipoId);
  const eficacia = eficacias.find((e) => e.id === eficaciaId);
  const medicion = eficacia?.nombre === 'Débil' ? 'DEBIL' : eficacia?.nombre === 'Moderado' ? 'MODERADO' : 'FUERTE';
  const calculo = residualDe(p, i, tipoToken(tipo?.nombre ?? ''), medicion);
  const nivel = nivelDe(calculo.residual, minimos);
  const nivelInfo = niveles[nivel];
  const esOportunidad = abierto?.clase === 'OPORTUNIDAD';

  const nivelStyle = (n: number) => {
    const info = niveles[n];
    return {
      background: info?.color === '#a52016' ? '#fdeeeb' : info?.color === '#c25a1e' ? '#faf1d3' : '#e6efe9',
      color: info?.color ?? '#4a544f',
    };
  };

  return (
    <main className="flex flex-1 px-8 pt-7 pb-14">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h1 className="titulo-pagina">Riesgos y oportunidades</h1>
            <p className="text-12_5 text-muted">
              {filas.length} registros · inherente y residual calculados al leer
            </p>
          </div>
          <nav className="flex items-center gap-2">
            {(['todos', 'RIESGO', 'OPORTUNIDAD'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setClase(c)}
                aria-pressed={clase === c}
                className="rounded-chip px-3.5 py-1.5 text-12"
                style={{
                  background: clase === c ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                  color: clase === c ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                  border: '1px solid var(--hf-border-field)',
                  fontWeight: clase === c ? 600 : 500,
                }}
              >
                {c === 'todos' ? 'Todos' : c === 'RIESGO' ? 'Riesgos' : 'Oportunidades'} ·{' '}
                {c === 'todos' ? filas.length : filas.filter((f) => f.clase === c).length}
              </button>
            ))}
          </nav>
        </div>

        {esOportunidad && (
          <p
            className="mt-4 rounded-campo px-4 py-3 text-11_5"
            style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
          >
            En una oportunidad el cálculo <strong>reduce</strong> igual que en un riesgo:
            cuanto mejor gestionada, más bajo su residual. Se reproduce el Excel tal cual
            (paridad verificable), y la decisión de invertir la aritmética es del comité
            de riesgos (D9).
          </p>
        )}

        <div className="mt-4 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
          <table className="w-full text-left text-12_5">
            <thead>
              <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
                <th className="px-4 py-3 font-semibold">Núm</th>
                <th className="px-4 py-3 font-semibold">Riesgo u oportunidad</th>
                <th className="px-4 py-3 font-semibold">Factor</th>
                <th className="px-4 py-3 text-center font-semibold">P</th>
                <th className="px-4 py-3 text-center font-semibold">I</th>
                <th className="px-4 py-3 text-right font-semibold">Inh.</th>
                <th className="px-4 py-3 font-semibold">Control</th>
                <th className="px-4 py-3 text-right font-semibold">Res.</th>
                <th className="px-4 py-3 font-semibold">Nivel res.</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr
                  key={f.id}
                  className="cursor-pointer border-t border-border-default hover:bg-app"
                  onClick={() => {
                    setAbierto(f);
                    setP(f.p);
                    setI(f.i);
                    if (f.control) {
                      const t = tipos.find((x) => f.control?.startsWith(x.nombre));
                      if (t) setTipoId(t.id);
                    }
                  }}
                >
                  <td className="px-4 py-3 font-mono text-11 font-medium" style={{ color: 'var(--hf-brand-nav)' }}>
                    {f.codigo}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-primary">{f.descripcion}</span>
                    <span className="ml-2 font-mono text-10_5 text-muted">
                      {f.proceso} · {f.clase.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{f.factor}</td>
                  <td className="px-4 py-3 text-center font-mono text-11">{f.p}</td>
                  <td className="px-4 py-3 text-center font-mono text-11">{f.i}</td>
                  <td className="px-4 py-3 text-right font-mono text-11">{f.inherente}</td>
                  <td className="px-4 py-3 text-11_5 text-muted">{f.control ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-11 font-semibold" style={{ color: f.nivelColor }}>
                    {f.residual}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                      style={nivelStyle(f.nivel)}
                    >
                      {f.nivelEtiqueta}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {abierto && (
        <aside
          className="sticky top-[calc(var(--hf-header-alto)+16px)] ml-6 flex h-fit w-[340px] shrink-0 flex-col gap-4 rounded-tarjeta border border-border-field bg-surface p-5"
          style={{ top: 'calc(var(--hf-header-alto) + 16px)' }}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-12 font-semibold text-primary">{abierto.codigo}</span>
            <button onClick={() => setAbierto(null)} aria-label="Cerrar panel" className="text-14 text-muted">
              ✕
            </button>
          </div>
          <p className="text-12_5 font-medium text-primary">{abierto.descripcion}</p>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Probabilidad {p}</span>
              <input type="range" min={1} max={5} value={p} onChange={(e) => setP(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Impacto {i}</span>
              <input type="range" min={1} max={5} value={i} onChange={(e) => setI(Number(e.target.value))} />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Tipo de control</span>
            <select
              value={tipoId}
              onChange={(e) => setTipoId(Number(e.target.value))}
              className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
            >
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} · reduce {t.reduce.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Medición</span>
            <select
              value={eficaciaId}
              onChange={(e) => setEficaciaId(Number(e.target.value))}
              className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
            >
              {eficacias.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre} · {e.valor * 100} %
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1 rounded-campo px-3 py-2 font-mono text-10_5" style={{ background: 'var(--hf-bg-app)' }}>
            <span>inherente = {p} × {i} = {calculo.inherente}</span>
            <span>P_res = {calculo.pRes.toFixed(2)}</span>
            <span>I_res = {calculo.iRes.toFixed(2)}</span>
            <span className="font-semibold">residual = {calculo.residual.toFixed(2)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-0.5 rounded-tarjeta bg-surface px-3 py-2" style={{ borderTop: `2px solid ${abierto.nivelColor}` }}>
              <span className="text-10_5 text-muted">Inherente</span>
              <span className="font-mono text-16 font-semibold" style={{ color: abierto.nivelColor }}>
                {abierto.inherente}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 rounded-tarjeta bg-surface px-3 py-2" style={{ borderTop: `2px solid ${nivelInfo?.color ?? '#4a544f'}` }}>
              <span className="text-10_5 text-muted">Residual</span>
              <span className="font-mono text-16 font-semibold" style={{ color: nivelInfo?.color }}>
                {calculo.residual.toFixed(2)}
              </span>
              <span className="text-10_5 font-semibold" style={{ color: nivelInfo?.color }}>
                {nivelInfo?.etiqueta ?? '—'}
              </span>
            </div>
          </div>

          <p className="text-11_5 text-muted">
            Tratamiento sugerido:{' '}
            <strong>{(esOportunidad ? nivelInfo?.accionOportunidad : nivelInfo?.accionRiesgo) ?? '—'}</strong>
          </p>
        </aside>
      )}
    </main>
  );
}

function tipoToken(nombre: string): string {
  switch (nombre) {
    case 'Preventivo':
      return 'PREVENTIVO';
    case 'Correctivo':
      return 'CORRECTIVO';
    case 'Preventivo y correctivo':
      return 'PREVENTIVO_Y_CORRECTIVO';
    case 'Reforzador':
      return 'REFORZADOR';
    case 'Reactivo':
      return 'REACTIVO';
    default:
      return 'PROACTIVO';
  }
}