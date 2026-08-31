'use client';

// app/sig/normas/Normas.client.tsx
//
// Selector de norma, cifras y la tabla de numerales con la barra de veces auditado
// (nunca rojo, ≥3 verde, resto ámbar). Marcar un numeral como no auditable lo saca
// de la cobertura y por eso exige motivo.

import { useMemo, useState } from 'react';

export interface NormaFila {
  id: number;
  codigo: string;
  nombre: string;
  requisitos: { id: number; numeral: string; titulo: string; auditable: boolean; veces: number }[];
}

export default function NormasClient({
  filas,
  totalAuditorias,
}: {
  filas: NormaFila[];
  totalAuditorias: number;
}) {
  const [normaId, setNormaId] = useState<number | null>(filas[0]?.id ?? null);
  const norma = filas.find((f) => f.id === normaId) ?? filas[0];

  const cifras = useMemo(() => {
    if (!norma) return { cargados: 0, auditables: 0, auditados: 0, nunca: 0 };
    const cargados = norma.requisitos.length;
    const auditables = norma.requisitos.filter((r) => r.auditable).length;
    const auditados = norma.requisitos.filter((r) => r.veces > 0).length;
    return { cargados, auditables, auditados, nunca: auditables - auditados };
  }, [norma]);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-center justify-between">
        <h1 className="titulo-pagina">Normas y requisitos</h1>
        <div className="flex items-center gap-2">
          <select
            value={norma?.id ?? ''}
            onChange={(e) => setNormaId(Number(e.target.value))}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
          >
            {filas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo}
              </option>
            ))}
          </select>
          <button
            onClick={() => alert('Cargar norma: los numerales son un catálogo, no una constante del código.')}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
            style={{ background: 'var(--hf-brand-nav)' }}
          >
            Cargar norma
          </button>
        </div>
      </div>

      <section className="mt-5 grid grid-cols-4 gap-4">
        <Cifra cifra={cifras.cargados} etiqueta="Numerales cargados" color="#12437f" />
        <Cifra cifra={cifras.auditables} etiqueta="Auditables" color="#0b5c44" />
        <Cifra cifra={cifras.auditados} etiqueta="Auditados alguna vez" color="#8a4407" />
        <Cifra cifra={cifras.nunca} etiqueta="Nunca auditados" color="#a52016" />
      </section>

      <div className="mt-5 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Numeral</th>
              <th className="px-4 py-3 font-semibold">Título</th>
              <th className="px-4 py-3 font-semibold">Auditable</th>
              <th className="px-4 py-3 font-semibold">Veces auditado</th>
              <th className="px-4 py-3 font-semibold">Hallazgos</th>
            </tr>
          </thead>
          <tbody>
            {(norma?.requisitos ?? []).map((r) => (
              <tr
                key={r.id}
                className="border-t border-border-default"
                style={r.auditable && r.veces === 0 ? { background: '#fdeeeb' } : undefined}
              >
                <td className="px-4 py-3 font-mono text-11 text-muted">{r.numeral}</td>
                <td className="px-4 py-3 text-primary">{r.titulo}</td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                    style={
                      r.auditable
                        ? { background: '#e6efe9', color: '#0b5c44' }
                        : { background: '#f5f7f6', color: '#4a544f' }
                    }
                  >
                    {r.auditable ? 'Auditable' : 'No auditable'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-[5px] w-16 overflow-hidden rounded-full" style={{ background: 'var(--hf-hairline-strong)' }}>
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (r.veces / Math.max(totalAuditorias, 1)) * 100)}%`,
                          background: r.veces === 0 ? '#a52016' : r.veces >= 3 ? '#0f7a5a' : '#b8791a',
                        }}
                      />
                    </span>
                    <span className="font-mono text-11 text-muted">{r.veces}</span>
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-11 text-muted">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-11_5 text-muted">
        Marcar un numeral como no auditable lo saca de la cobertura, y por eso exige
        motivo. Los encabezados de capítulo vienen no auditables de fábrica.
      </p>
    </main>
  );
}

function Cifra({ cifra, etiqueta, color }: { cifra: number; etiqueta: string; color: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-tarjeta bg-surface px-5 py-4" style={{ borderTop: `2px solid ${color}` }}>
      <span className="font-mono text-22 font-semibold tabular-nums" style={{ color }}>
        {cifra}
      </span>
      <span className="text-12 text-muted">{etiqueta}</span>
    </div>
  );
}