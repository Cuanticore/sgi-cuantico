'use client';

// app/sig/normas/Normas.client.tsx
//
// Selector de norma, cifras y la tabla de numerales con la barra de veces auditado
// (nunca rojo, ≥3 verde, resto ámbar). Marcar un numeral como no auditable lo saca
// de la cobertura y por eso exige motivo.

import { useMemo, useState } from 'react';
import { alternarAuditable } from '@/app/sig/acciones/normas';
import CargarNorma from './CargarNorma.client';

export interface NormaFila {
  id: number;
  codigo: string;
  nombre: string;
  requisitos: {
    id: number;
    numeral: string;
    titulo: string;
    auditable: boolean;
    veces: number;
    /// Fecha de la ultima auditoria que toco este numeral. Calculada al leer.
    ultimaVez: string | null;
    /// Notas de este numeral que se promovieron a un hallazgo.
    hallazgos: number;
  }[];
}

export default function NormasClient({
  filas,
  totalAuditorias,
}: {
  filas: NormaFila[];
  totalAuditorias: number;
}) {
  const [normaId, setNormaId] = useState<number | null>(filas[0]?.id ?? null);
  /// El numeral que se está cambiando y el motivo que se escribe. Uno a la vez: cambiar
  /// varios de una tanda con un solo motivo escondería cuál se apagó por qué razón.
  const [editando, setEditando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  async function alternar(id: number) {
    setEnviando(true);
    const r = await alternarAuditable(id, motivo);
    setEnviando(false);
    setAviso({ ok: r.ok, texto: r.mensaje });
    // Sólo se cierra si funcionó: si el motivo era corto, lo escrito se queda para
    // completarlo, no se pierde.
    if (r.ok) {
      setEditando(null);
      setMotivo('');
    }
  }
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
      {aviso && (
        <p
          className="mb-3 rounded-campo px-3 py-2 text-12"
          style={
            aviso.ok
              ? { background: 'var(--hf-row-verde)', color: 'var(--hf-accent-700)' }
              : { background: '#fdeeeb', color: '#a52016' }
          }
        >
          {aviso.texto}
        </p>
      )}

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
          <CargarNorma normaId={norma?.id ?? null} />
        </div>
      </div>

      <section className="mt-5 grid grid-cols-4 gap-4">
        <Cifra cifra={cifras.cargados} etiqueta="Numerales cargados" nota="en el catálogo" color="#12437f" />
        <Cifra cifra={cifras.auditables} etiqueta="Auditables" nota="cuentan para la cobertura" color="#0b5c44" />
        <Cifra cifra={cifras.auditados} etiqueta="Auditados alguna vez" nota="con al menos una nota" color="#8a4407" />
        <Cifra cifra={cifras.nunca} etiqueta="Nunca auditados" nota="resaltados en la tabla" color="#a52016" />
      </section>

      <div className="mt-5 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Numeral</th>
              <th className="px-4 py-3 font-semibold">Título</th>
              <th className="px-4 py-3 font-semibold">Auditable</th>
              <th className="px-4 py-3 font-semibold">Veces auditado</th>
              <th className="px-4 py-3 text-right font-semibold">Última vez</th>
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
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(editando === r.id ? null : r.id);
                      setMotivo('');
                      setAviso(null);
                    }}
                    aria-expanded={editando === r.id}
                    title={
                      r.auditable
                        ? 'Sacarlo de la cobertura. Exige motivo.'
                        : 'Devolverlo a la cobertura. Exige motivo.'
                    }
                    className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold transition-opacity hover:opacity-80"
                    style={
                      r.auditable
                        ? { background: '#e6efe9', color: '#0b5c44' }
                        : { background: '#f5f7f6', color: '#4a544f' }
                    }
                  >
                    {r.auditable ? 'Auditable' : 'No auditable'}
                  </button>

                  {editando === r.id && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {/* El motivo no es trámite: `auditable` es el denominador de la
                          cobertura, y apagar los numerales que nadie auditó llevaría el
                          indicador al 100 % sin auditar nada más. */}
                      <label className="text-10_5 leading-snug text-muted [text-wrap:pretty]">
                        {r.auditable
                          ? 'Sale de la cobertura. ¿Por qué no aplica?'
                          : 'Vuelve a la cobertura. ¿Por qué aplica ahora?'}
                      </label>
                      <input
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="El motivo queda en la bitácora"
                        className="entrada-campo w-full text-11_5"
                      />
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={enviando || motivo.trim().length < 10}
                          onClick={() => alternar(r.id)}
                          className="rounded-campo px-2.5 py-1 text-11 font-semibold text-white disabled:opacity-50"
                          style={{ background: 'var(--hf-brand-nav)' }}
                        >
                          {enviando ? 'Guardando…' : 'Confirmar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditando(null);
                            setMotivo('');
                          }}
                          className="text-11 text-muted hover:underline"
                        >
                          Cancelar
                        </button>
                      </span>
                    </div>
                  )}
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
                <td className="px-4 py-3 text-right">
                  {r.ultimaVez === null ? (
                    <span
                      className="font-mono text-11"
                      title="Ninguna auditoría tocó este numeral todavía."
                      style={{ color: 'var(--hf-text-label)' }}
                    >
                      nunca
                    </span>
                  ) : (
                    <span className="font-mono text-11 text-secondary-soft">{r.ultimaVez}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {/* Antes era un «—» fijo: un encabezado que promete un dato y siempre
                      muestra un guion. Ahora cuenta las notas de este numeral que se
                      promovieron a un hallazgo. */}
                  {r.hallazgos === 0 ? (
                    <span className="font-mono text-11" style={{ color: 'var(--hf-text-label)' }}>
                      0
                    </span>
                  ) : (
                    <span
                      className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                      style={{ background: '#fdeeeb', color: '#a52016' }}
                    >
                      {r.hallazgos}
                    </span>
                  )}
                </td>
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

/// La NOTA no es adorno. «cuentan para la cobertura» debajo de «Auditables» es lo que hace
/// visible el abuso posible: apagar numerales sube el porcentaje sin auditar nada, y la
/// diferencia contra «Numerales cargados» queda a la vista de quien lea la cifra.
function Cifra({
  cifra,
  etiqueta,
  nota,
  color,
}: {
  cifra: number;
  etiqueta: string;
  nota: string;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-tarjeta bg-surface px-5 py-4" style={{ borderTop: `2px solid ${color}` }}>
      <span className="font-mono text-22 font-semibold tabular-nums" style={{ color }}>
        {cifra}
      </span>
      <span className="text-12 text-muted">{etiqueta}</span>
      <span className="text-10_5 leading-snug text-faint">{nota}</span>
    </div>
  );
}