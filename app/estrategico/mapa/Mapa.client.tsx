'use client';

// app/estrategico/mapa/Mapa.client.tsx
//
// La grilla 5×5 con el toggle inherente/residual, el conteo y el nivel escrito en
// cada casilla (regla 09), y el panel de la casilla seleccionada con su lista.

import { useMemo, useState } from 'react';

interface Celdas {
  [clave: string]: { n: number; ids: number[] };
}

const COLOR_CASILLA: Record<string, { bg: string; fg: string }> = {
  Aceptable: { bg: '#eef7f1', fg: '#0b5c44' },
  Moderado: { bg: '#faf1d3', fg: '#6b5410' },
  Inaceptable: { bg: '#f7dcd9', fg: '#8a1f16' },
};

export default function MapaClient({
  inherente,
  residual,
  niveles,
  total,
  detalle,
}: {
  inherente: Celdas;
  residual: Celdas;
  niveles: { minimo: number; etiqueta: string; color: string }[];
  total: number;
  detalle: { id: number; codigo: string; descripcion: string; proceso: string; factor: number; p: number; i: number }[];
}) {
  const [vista, setVista] = useState<'inherente' | 'residual'>('inherente');
  const [seleccion, setSeleccion] = useState<string | null>(null);

  const celdas = vista === 'inherente' ? inherente : residual;

  const nivelDeValor = (v: number) => {
    let idx = niveles.length - 1;
    for (let k = 0; k < niveles.length; k++) {
      if (v < niveles[k].minimo) {
        idx = k - 1;
        break;
      }
    }
    return niveles[idx] ?? niveles[niveles.length - 1];
  };

  const seleccionados = useMemo(() => {
    if (!seleccion) return [];
    const ids = new Set(celdas[seleccion]?.ids ?? []);
    return detalle.filter((d) => ids.has(d.id));
  }, [seleccion, celdas, detalle]);

  const [sp, si] = seleccion ? seleccion.split('-').map(Number) : [0, 0];
  const valor = sp * si;
  const nivel = nivelDeValor(valor);

  return (
    <main className="flex flex-1 px-8 pt-7 pb-14">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h1 className="titulo-pagina">Mapa de calor</h1>
            <p className="text-12_5 text-muted">{total} registros · conteos calculados al leer</p>
          </div>
          <div className="flex overflow-hidden rounded-campo border border-border-field">
            {(['inherente', 'residual'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                aria-pressed={vista === v}
                className="px-3.5 py-1.5 text-12 font-medium capitalize"
                style={{
                  background: vista === v ? 'var(--hf-brand-100)' : 'transparent',
                  color: vista === v ? 'var(--hf-brand-nav)' : 'var(--hf-text-muted)',
                }}
              >
                {v === 'inherente' ? 'Inherente · sin controles' : 'Residual · con los controles aplicados'}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex gap-4">
          <div className="flex flex-col justify-center gap-1">
            <span className="rotate-180 font-mono text-10_5 text-muted" style={{ writingMode: 'vertical-rl' }}>
              Probabilidad
            </span>
            {[5, 4, 3, 2, 1].map((p) => (
              <span key={p} className="flex h-16 w-6 items-center justify-center font-mono text-11 text-muted">
                {p}
              </span>
            ))}
          </div>
          <div className="flex-1">
            <div className="grid grid-cols-5 gap-px overflow-hidden rounded-tarjeta border border-border-field bg-border-default">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-surface py-1 text-center font-mono text-10_5 text-muted">
                  I {i}
                </div>
              ))}
              {[5, 4, 3, 2, 1].flatMap((p) =>
                [1, 2, 3, 4, 5].map((i) => {
                  const clave = `${p}-${i}`;
                  const dato = celdas[clave];
                  const n = dato?.n ?? 0;
                  const nv = nivelDeValor(p * i);
                  const estilos = COLOR_CASILLA[nv.etiqueta] ?? COLOR_CASILLA.Aceptable;
                  return (
                    <button
                      key={clave}
                      onClick={() => setSeleccion(seleccion === clave ? null : clave)}
                      className="flex h-16 flex-col items-center justify-center gap-0.5 transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                      style={{
                        background: seleccion === clave ? 'var(--hf-brand-100)' : estilos.bg,
                        border: seleccion === clave ? '1px solid var(--hf-brand-nav)' : undefined,
                      }}
                    >
                      <span className="font-mono text-14 font-semibold" style={{ color: estilos.fg }}>
                        {n > 0 ? n : '·'}
                      </span>
                      <span className="text-8_5 font-semibold uppercase tracking-wide" style={{ color: estilos.fg }}>
                        {nv.etiqueta}
                      </span>
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </div>

      {seleccion && (
        <aside className="ml-6 flex h-fit w-[300px] shrink-0 flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
          <h2 className="text-13 font-semibold text-primary">
            Probabilidad {sp} · impacto {si}
          </h2>
          <span
            className="w-fit rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold uppercase"
            style={{ background: COLOR_CASILLA[nivel.etiqueta]?.bg, color: COLOR_CASILLA[nivel.etiqueta]?.fg }}
          >
            {nivel.etiqueta}
          </span>
          <p className="font-mono text-11_5 text-muted">
            P {sp} × I {si} = {valor} · {seleccionados.length} registro(s)
          </p>
          <div className="flex flex-col gap-1.5">
            {seleccionados.map((r) => (
              <div key={r.id} className="flex flex-col rounded-campo border border-border-default bg-surface px-3 py-2">
                <span className="font-mono text-10_5 font-medium" style={{ color: 'var(--hf-brand-nav)' }}>
                  {r.codigo}
                </span>
                <span className="text-11_5 text-primary">{r.descripcion}</span>
                <span className="text-10_5 text-muted">{r.proceso}</span>
              </div>
            ))}
            {seleccionados.length === 0 && <p className="text-11_5 text-muted">Casilla vacía.</p>}
          </div>
        </aside>
      )}
    </main>
  );
}