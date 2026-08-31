'use client';

// app/sig/auditorias/externas/Externas.client.tsx
//
// Lista con filtros y la ficha: entidad, fechas, alcance, el aviso de que el informe
// adjunto es obligatorio (C8) y los hallazgos capturados.

import { useMemo, useState } from 'react';

export interface ExternaFila {
  id: number;
  entidad: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string | null;
  alcance: string;
  objeto: string;
  lider: string;
  cerrada: boolean;
  hallazgos: number;
}

const TIPO_BADGE: Record<string, { fondo: string; texto: string; etiqueta: string }> = {
  EXTERNA: { fondo: '#fdeeeb', texto: '#a52016', etiqueta: 'Certificación' },
  PROVEEDOR: { fondo: '#e8f4ef', texto: '#0b5c44', etiqueta: 'Proveedor' },
};

export default function ExternasClient({ filas }: { filas: ExternaFila[] }) {
  const [filtro, setFiltro] = useState<'todas' | 'EXTERNA' | 'PROVEEDOR'>('todas');
  const [seleccion, setSeleccion] = useState<ExternaFila | null>(null);

  const visibles = useMemo(
    () => (filtro === 'todas' ? filas : filas.filter((f) => f.tipo === filtro)),
    [filas, filtro],
  );

  return (
    <main className="flex flex-1 px-8 pt-7 pb-14">
      <div className="min-w-0 flex-1">
        <h1 className="titulo-pagina">Auditorías externas y a proveedores</h1>
        <nav className="mt-4 flex items-center gap-2">
          {(['todas', 'EXTERNA', 'PROVEEDOR'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFiltro(t)}
              aria-pressed={filtro === t}
              className="rounded-chip px-3.5 py-1.5 text-12"
              style={{
                background: filtro === t ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                color: filtro === t ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                border: '1px solid var(--hf-border-field)',
              }}
            >
              {t === 'todas' ? 'Todas' : t === 'EXTERNA' ? 'Certificadora' : 'Segunda parte'} ·{' '}
              {t === 'todas' ? filas.length : filas.filter((f) => f.tipo === t).length}
            </button>
          ))}
        </nav>

        <div className="mt-4 flex flex-col gap-2">
          {visibles.map((f) => (
            <button
              key={f.id}
              onClick={() => setSeleccion(f)}
              className="flex items-center justify-between gap-3 rounded-tarjeta border border-border-field bg-surface px-4 py-3 text-left"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                  style={(() => {
                    const b = TIPO_BADGE[f.tipo] ?? TIPO_BADGE.EXTERNA;
                    return { background: b.fondo, color: b.texto };
                  })()}
                >
                  {(TIPO_BADGE[f.tipo] ?? TIPO_BADGE.EXTERNA).etiqueta}
                </span>
                <div className="min-w-0">
                  <span className="block truncate text-13 font-medium text-primary">{f.entidad}</span>
                  <span className="block font-mono text-10_5 text-muted">
                    {f.fechaInicio}
                    {f.fechaFin ? ` · ${f.fechaFin}` : ''} · {f.alcance}
                  </span>
                </div>
              </div>
              <div className="flex flex-none items-center gap-3">
                <span
                  className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                  style={
                    f.cerrada
                      ? { background: '#e6efe9', color: '#0b5c44' }
                      : { background: '#eef2f8', color: '#12437f' }
                  }
                >
                  {f.cerrada ? 'Cerrada' : 'En curso'}
                </span>
                <span className="font-mono text-11 text-muted">{f.hallazgos} hallazgo(s)</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {seleccion && (
        <aside className="ml-6 flex h-fit w-[340px] shrink-0 flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-13 font-semibold text-primary">{seleccion.entidad}</span>
            <button onClick={() => setSeleccion(null)} aria-label="Cerrar" className="text-14 text-muted">
              ✕
            </button>
          </div>
          <p className="text-11_5 text-muted">
            {seleccion.objeto} · {seleccion.fechaInicio}
            {seleccion.fechaFin ? ` · ${seleccion.fechaFin}` : ''} · líder: {seleccion.lider}
          </p>
          <p className="text-12_5 text-primary">{seleccion.alcance}</p>
          <p className="rounded-campo px-3 py-2 text-11_5" style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}>
            El adjunto del informe es obligatorio: una auditoría externa registrada sin su
            informe no es evidencia de nada (C8).
          </p>
          <p className="text-11_5 text-muted">
            Hallazgos capturados: {seleccion.hallazgos} — cada NC/OM se promueve a Mejora.
          </p>
        </aside>
      )}
    </main>
  );
}