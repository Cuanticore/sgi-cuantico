'use client';

// app/sig/auditorias/[id]/Auditoria.client.tsx
//
// Cuatro pestañas: Plan, Ejecución, Actas e Informe. El informe preliminar es el
// borrador del auditor; emitir el final congela y promueve NC/OM a Mejora (C5).

import { useState } from 'react';
import {
  registrarNota,
  registrarActa,
  guardarInforme,
  emitirInformeFinal,
} from '@/app/sig/acciones/auditorias';

type Pestana = 'plan' | 'ejecucion' | 'actas' | 'informe';

const TIPO_CHIP: Record<string, { fondo: string; texto: string }> = {
  OK: { fondo: '#e6efe9', texto: '#0b5c44' },
  NC: { fondo: '#fdeeeb', texto: '#a52016' },
  OM: { fondo: '#fff3e6', texto: '#8a4407' },
  RM: { fondo: '#faf1d3', texto: '#6b5410' },
  FORTALEZA: { fondo: '#e8f4ef', texto: '#0b5c44' },
};

export default function AuditoriaClient({
  auditoria,
}: {
  auditoria: {
    id: number;
    objeto: string;
    alcance: string;
    sitio: string;
    fechaInicio: string;
    fechaFin: string | null;
    lider: string;
    equipo: string[];
    estado: string;
    emitido: boolean;
    conteos: { notas: number; NC: number; OM: number; RM: number; FORTALEZA: number };
    notas: { id: number; tipo: string; texto: string; numeral: string; proceso: string; auditor: string; hallazgo: boolean }[];
    celdas: { id: number; proceso: string; numeral: string; hora: string | null; planificada: boolean }[];
    actas: { tipo: string; fecha: string; asistentes: string; contenido: string }[];
    informes: { version: string; conclusiones: string; recomendaciones: string; emitido: boolean }[];
  };
}) {
  const [pestana, setPestana] = useState<Pestana>('plan');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | string>('todos');
  const [notaNueva, setNotaNueva] = useState('');
  const [tipoNueva, setTipoNueva] = useState<'OK' | 'NC' | 'OM' | 'RM' | 'FORTALEZA'>('OK');
  const [celdaId, setCeldaId] = useState(auditoria.celdas[0]?.id ?? 0);
  const [conclusiones, setConclusiones] = useState(auditoria.informes[0]?.conclusiones ?? '');
  const [recomendaciones, setRecomendaciones] = useState(auditoria.informes[0]?.recomendaciones ?? '');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preliminar = auditoria.informes.some((i) => i.version === 'PRELIMINAR' && !i.emitido);

  const pestañas: Record<Pestana, string> = {
    plan: 'Plan',
    ejecucion: 'Ejecución',
    actas: 'Actas',
    informe: 'Informe',
  };

  const proces = [...new Set(auditoria.celdas.map((c) => c.proceso))];
  const numerales = [...new Set(auditoria.celdas.map((c) => c.numeral))];

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <header className="flex items-center gap-3">
        <span
          className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold uppercase"
          style={{ background: '#e9f0fb', color: '#12437f' }}
        >
          Interna
        </span>
        <span
          className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold uppercase"
          style={
            auditoria.emitido
              ? { background: '#e6efe9', color: '#0b5c44' }
              : { background: '#faf1d3', color: '#6b5410' }
          }
        >
          {auditoria.estado.replaceAll('_', ' ')}
        </span>
        <h1 className="truncate text-16 font-semibold text-primary">{auditoria.objeto}</h1>
      </header>
      <p className="mt-1 text-12_5 text-muted">
        {auditoria.fechaInicio}
        {auditoria.fechaFin ? ` y ${auditoria.fechaFin}` : ''} · {auditoria.sitio} · líder: {auditoria.lider} · {auditoria.equipo.join(', ')}
      </p>

      <section className="mt-3 flex gap-2">
        <span className="rounded-[4px] px-2 py-0.5 font-mono text-10 font-semibold" style={{ background: '#e9f0fb', color: '#12437f' }}>
          Notas {auditoria.conteos.notas}
        </span>
        <span className="rounded-[4px] px-2 py-0.5 font-mono text-10 font-semibold" style={{ background: '#fdeeeb', color: '#a52016' }}>
          NC {auditoria.conteos.NC}
        </span>
        <span className="rounded-[4px] px-2 py-0.5 font-mono text-10 font-semibold" style={{ background: '#fff3e6', color: '#8a4407' }}>
          OM {auditoria.conteos.OM}
        </span>
        <span className="rounded-[4px] px-2 py-0.5 font-mono text-10 font-semibold" style={{ background: '#faf1d3', color: '#6b5410' }}>
          RM {auditoria.conteos.RM}
        </span>
        <span className="rounded-[4px] px-2 py-0.5 font-mono text-10 font-semibold" style={{ background: '#e8f4ef', color: '#0b5c44' }}>
          Fortalezas {auditoria.conteos.FORTALEZA}
        </span>
      </section>

      <nav className="mt-5 flex border-b border-border-default">
        {Object.entries(pestañas).map(([key, etiqueta]) => (
          <button
            key={key}
            onClick={() => setPestana(key as Pestana)}
            aria-current={pestana === key ? 'page' : undefined}
            className="px-4 py-2.5 text-12_5"
            style={{
              fontWeight: pestana === key ? 600 : 500,
              color: pestana === key ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              borderBottom: pestana === key ? '2px solid var(--hf-brand-nav)' : '2px solid transparent',
            }}
          >
            {etiqueta}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {pestana === 'plan' && (
          <div className="overflow-hidden rounded-tarjeta border border-border-field bg-surface">
            <table className="w-full text-left text-12">
              <thead>
                <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
                  <th className="px-3 py-2.5 font-semibold">Proceso</th>
                  {numerales.map((n) => (
                    <th key={n} className="px-2 py-2.5 text-center font-semibold">{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {proces.map((p) => (
                  <tr key={p} className="border-t border-border-default">
                    <td className="px-3 py-2 font-medium text-primary">{p}</td>
                    {numerales.map((n) => {
                      const celda = auditoria.celdas.find((c) => c.proceso === p && c.numeral === n);
                      return (
                        <td key={n} className="px-2 py-2 text-center">
                          {celda ? (
                            <span
                              className="inline-flex h-6 w-6 items-center justify-center rounded-[4px] text-11 font-bold"
                              style={
                                celda.planificada
                                  ? { background: '#e9f0fb', color: '#12437f' }
                                  : { background: '#fff3e6', color: '#8a4407', border: '1px dashed #8a4407' }
                              }
                              title={celda.planificada ? `${celda.hora ?? ''} · planificada` : 'Agregada durante la ejecución (C4)'}
                            >
                              {celda.planificada ? '✗' : '+'}
                            </span>
                          ) : (
                            <span className="text-muted">·</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-border-default px-3 py-2 text-11_5 text-muted">
              Cobertura: {numerales.length} de {numerales.length + 4} numerales · las celdas «+» se agregaron durante la ejecución.
            </p>
          </div>
        )}

        {pestana === 'ejecucion' && (
          <div className="flex flex-col gap-3">
            <nav className="flex items-center gap-2">
              {['todos', 'OK', 'NC', 'OM', 'RM', 'FORTALEZA'].map((t) => (
                <button
                  key={t}
                  onClick={() => setFiltroTipo(t)}
                  aria-pressed={filtroTipo === t}
                  className="rounded-chip px-3 py-1.5 text-12"
                  style={{
                    background: filtroTipo === t ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    color: filtroTipo === t ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                    border: '1px solid var(--hf-border-field)',
                  }}
                >
                  {t === 'todos' ? 'Todas' : t} ·{' '}
                  {t === 'todos' ? auditoria.notas.length : auditoria.conteos[t as keyof typeof auditoria.conteos]}
                </button>
              ))}
            </nav>

            <div className="flex flex-col gap-2">
              {auditoria.notas
                .filter((n) => filtroTipo === 'todos' || n.tipo === filtroTipo)
                .map((n) => (
                  <div key={n.id} className="flex items-center gap-3 rounded-campo border border-border-default bg-surface px-4 py-2.5">
                    <span
                      className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                      style={{ background: TIPO_CHIP[n.tipo].fondo, color: TIPO_CHIP[n.tipo].texto }}
                    >
                      {n.tipo}
                    </span>
                    <span className="font-mono text-10_5 text-muted">
                      {n.numeral} · {n.proceso}
                    </span>
                    <span className="min-w-0 flex-1 text-12_5 text-primary">{n.texto}</span>
                    {n.hallazgo && (
                      <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold" style={{ background: '#fff3e6', color: '#8a4407' }}>
                        Va a Mejora
                      </span>
                    )}
                  </div>
                ))}
            </div>

            {!auditoria.emitido && (
              <div className="mt-2 flex flex-col gap-2 rounded-campo border border-dashed border-border-field p-4">
                <select
                  value={celdaId}
                  onChange={(e) => setCeldaId(Number(e.target.value))}
                  className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
                >
                  {auditoria.celdas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.proceso} · {c.numeral}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  {(['OK', 'NC', 'OM', 'RM', 'FORTALEZA'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTipoNueva(t)}
                      aria-pressed={tipoNueva === t}
                      className="rounded-chip px-3 py-1 text-11"
                      style={{
                        background: tipoNueva === t ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                        border: '1px solid var(--hf-border-field)',
                        color: tipoNueva === t ? 'var(--hf-brand-nav)' : 'var(--hf-text-muted)',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <textarea
                  value={notaNueva}
                  onChange={(e) => setNotaNueva(e.target.value)}
                  rows={2}
                  placeholder="Nota / evidencia"
                  className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
                />
                <button
                  onClick={async () => {
                    const r = await registrarNota(celdaId, { notaEvidencia: notaNueva, tipo: tipoNueva });
                    if (r.ok) window.location.reload();
                    else setError(r.mensaje);
                  }}
                  className="w-fit rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
                  style={{ background: 'var(--hf-brand-nav)' }}
                >
                  Registrar nota
                </button>
              </div>
            )}
          </div>
        )}

        {pestana === 'actas' && (
          <div className="flex flex-col gap-3">
            {auditoria.actas.map((x) => (
              <div key={x.tipo} className="rounded-campo border border-border-field bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="text-13 font-semibold text-primary">
                    {x.tipo === 'APERTURA' ? 'Acta de apertura' : 'Acta de cierre'}
                  </span>
                  <span className="font-mono text-11 text-muted">{x.fecha}</span>
                </div>
                <p className="mt-1 text-11_5 text-muted">Asistentes: {x.asistentes}</p>
                <p className="mt-1 text-12_5 text-primary">{x.contenido}</p>
              </div>
            ))}
            <p className="rounded-campo px-3 py-2 text-11_5" style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}>
              No se emite el informe final sin acta de cierre. La validación va en el servidor (C6).
            </p>
          </div>
        )}

        {pestana === 'informe' && (
          <div className="flex max-w-[760px] flex-col gap-3">
            <div className="flex items-center gap-2">
              <span
                className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                style={preliminar ? { background: '#faf1d3', color: '#6b5410' } : { background: '#e6efe9', color: '#0b5c44' }}
              >
                {preliminar ? 'PRELIMINAR · borrador del auditor' : 'FINAL'}
              </span>
            </div>
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Conclusiones</span>
              <textarea
                value={conclusiones}
                onChange={(e) => setConclusiones(e.target.value)}
                rows={4}
                className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Recomendaciones</span>
              <textarea
                value={recomendaciones}
                onChange={(e) => setRecomendaciones(e.target.value)}
                rows={3}
                className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
              />
            </label>
            <p className="text-11_5 text-muted">
              Fortalezas ({auditoria.conteos.FORTALEZA}) y oportunidades ({auditoria.conteos.OM}) se
              derivan de las notas: no se capturan dos veces (C9).
            </p>
            {!auditoria.emitido ? (
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const r = await guardarInforme(auditoria.id, {
                      version: 'PRELIMINAR',
                      fechaInforme: new Date(),
                      conclusiones,
                      recomendaciones,
                    });
                    setMensaje(r.mensaje);
                  }}
                  className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
                  style={{ background: 'var(--hf-brand-nav)' }}
                >
                  Guardar preliminar
                </button>
                <button
                  onClick={async () => {
                    const r = await emitirInformeFinal(auditoria.id);
                    if (r.ok) window.location.reload();
                    else setError(r.mensaje);
                  }}
                  className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
                  style={{ background: 'var(--hf-accent-500)' }}
                >
                  Emitir el informe final
                </button>
              </div>
            ) : (
              <p className="rounded-campo px-3 py-2 text-12" style={{ background: 'var(--hf-row-verde)', color: 'var(--hf-accent-700)' }}>
                Informe final emitido: notas congeladas y NC/OM promovidos a Mejora. Reabrir exige motivo y queda en bitácora (C5).
              </p>
            )}
            {mensaje && <p className="text-12" style={{ color: 'var(--hf-accent-700)' }}>{mensaje}</p>}
            {error && <p className="text-12" style={{ color: 'var(--hf-danger-text)' }}>{error}</p>}
          </div>
        )}
      </div>
    </main>
  );
}