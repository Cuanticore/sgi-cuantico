'use client';

// app/estrategico/partes/Partes.client.tsx
//
// Chips por tipo, el mapa poder×interés 2×2 con sus cuadrantes, la grilla con las
// tres banderas y la ficha de la necesidad con el seguimiento por año (tabs).

import { useMemo, useState } from 'react';
import { guardarSeguimientoParte } from '@/app/sig/acciones/estrategico';

export interface ParteFila {
  id: number;
  tipo: 'INTERNA' | 'EXTERNA';
  descripcion: string;
  necesidades: {
    id: number;
    texto: string;
    clase: string;
    poder: string;
    interes: string;
    banderas: string[];
    responsable: string | null;
    seguimiento: { anio: number; planAccion: string; seguimiento: string; evidencia: string }[];
  }[];
}

const TIPO_CHIP: Record<string, { fondo: string; texto: string }> = {
  INTERNA: { fondo: '#e9f0fb', texto: '#12437f' },
  EXTERNA: { fondo: '#e8f4ef', texto: '#0b5c44' },
};

export default function PartesClient({ filas }: { filas: ParteFila[] }) {
  const [filtro, setFiltro] = useState<'todas' | 'INTERNA' | 'EXTERNA'>('todas');
  const [seleccion, setSeleccion] = useState<ParteFila['necesidades'][number] | null>(null);

  const visibles = useMemo(
    () => (filtro === 'todas' ? filas : filas.filter((f) => f.tipo === filtro)),
    [filas, filtro],
  );

  const cuadrantes = useMemo(() => {
    const todos = filas.flatMap((f) => f.necesidades);
    const contar = (p: string, i: string) => todos.filter((n) => n.poder === p && n.interes === i).length;
    return [
      { etiqueta: 'Gestionar de cerca', n: contar('ALTO', 'ALTO'), color: '#a52016', bg: '#fdeeeb' },
      { etiqueta: 'Mantener satisfecho', n: contar('ALTO', 'BAJO'), color: '#8a4407', bg: '#fff3e6' },
      { etiqueta: 'Mantener informado', n: contar('BAJO', 'ALTO'), color: '#12437f', bg: '#e9f0fb' },
      { etiqueta: 'Monitorear', n: contar('BAJO', 'BAJO'), color: '#4a544f', bg: '#f5f7f6' },
    ];
  }, [filas]);

  return (
    <main className="flex flex-1 px-8 pt-7 pb-14">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <h1 className="titulo-pagina">Partes interesadas</h1>
          <nav className="flex items-center gap-2">
            {(['todas', 'INTERNA', 'EXTERNA'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFiltro(t)}
                aria-pressed={filtro === t}
                className="rounded-chip px-3.5 py-1.5 text-12 capitalize"
                style={{
                  background: filtro === t ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                  color: filtro === t ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                  border: '1px solid var(--hf-border-field)',
                }}
              >
                {t === 'todas' ? 'Todas' : t.toLowerCase()} ·{' '}
                {t === 'todas' ? filas.length : filas.filter((f) => f.tipo === t).length}
              </button>
            ))}
          </nav>
        </div>

        <section className="mt-5 grid grid-cols-2 gap-3">
          {cuadrantes.map((c) => (
            <div
              key={c.etiqueta}
              className="flex items-center justify-between rounded-campo border px-4 py-3"
              style={{ background: c.bg, borderColor: c.color }}
            >
              <span className="text-12_5 font-semibold" style={{ color: c.color }}>
                {c.etiqueta}
              </span>
              <span className="font-mono text-18 font-semibold" style={{ color: c.color }}>
                {c.n}
              </span>
            </div>
          ))}
        </section>

        <div className="mt-5 flex flex-col gap-2">
          {visibles.map((p) => (
            <div key={p.id} className="rounded-tarjeta border border-border-field bg-surface px-4 py-3">
              <div className="flex items-center gap-2">
                <span
                  className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                  style={{ background: TIPO_CHIP[p.tipo].fondo, color: TIPO_CHIP[p.tipo].texto }}
                >
                  {p.tipo === 'INTERNA' ? 'Internas' : 'Externas'}
                </span>
                <span className="text-13 font-medium text-primary">{p.descripcion}</span>
              </div>
              {p.necesidades.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setSeleccion(n)}
                  className="mt-1.5 flex w-full items-center justify-between gap-3 rounded-campo px-2.5 py-1.5 text-left hover:bg-app"
                >
                  <span className="text-12_5 text-primary">{n.texto}</span>
                  <span className="flex-none text-11_5 text-muted">
                    Poder {n.poder} · interés {n.interes} · {n.banderas.length} bandera(s)
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {seleccion && (
        <aside className="ml-6 flex h-fit w-[340px] shrink-0 flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-12_5 font-semibold text-primary">{seleccion.texto}</span>
            <button onClick={() => setSeleccion(null)} aria-label="Cerrar" className="text-14 text-muted">
              ✕
            </button>
          </div>
          <div className="flex gap-1.5">
            {['SGSI', 'CLIMA', 'ALC'].map((b) => (
              <span
                key={b}
                className="rounded-[4px] px-1.5 py-0.5 font-mono text-9_5 font-semibold"
                style={
                  seleccion.banderas.includes(b)
                    ? b === 'SGSI'
                      ? { background: '#e9f0fb', color: '#12437f' }
                      : b === 'CLIMA'
                        ? { background: '#e8f4ef', color: '#0b5c44' }
                        : { background: '#fff3e6', color: '#8a4407' }
                    : { background: '#f5f7f6', color: '#b6bdb9' }
                }
              >
                {b}
              </span>
            ))}
          </div>
          <p className="text-11_5 text-muted">Responsable: {seleccion.responsable ?? '—'}</p>

          <div className="flex flex-col gap-2">
            <span className="etiqueta-campo">Seguimiento por año</span>
            {seleccion.seguimiento.map((s) => (
              <div key={s.anio} className="flex flex-col gap-1 rounded-campo border border-border-default p-3">
                <span className="text-11 font-semibold text-primary">Año {s.anio}</span>
                <span className="text-11_5 text-muted">Plan: {s.planAccion || '—'}</span>
                <span className="text-11_5 text-muted">Seguimiento: {s.seguimiento || '—'}</span>
                <span
                  className="w-fit rounded-[4px] px-1.5 py-0.5 font-mono text-9_5"
                  style={
                    s.evidencia
                      ? { background: '#e9f0fb', color: '#12437f' }
                      : { background: '#fff3e6', color: '#8a4407' }
                  }
                >
                  {s.evidencia || 'Sin evidencia'}
                </span>
              </div>
            ))}
            {seleccion.seguimiento.length === 0 && <p className="text-11_5 text-muted">Sin seguimiento.</p>}
          </div>
        </aside>
      )}
    </main>
  );
}