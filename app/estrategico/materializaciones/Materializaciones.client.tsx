'use client';

// app/estrategico/materializaciones/Materializaciones.client.tsx
//
// Cifras, tabla con badge «N×» para reincidentes y el enlace al hallazgo con su
// estado. «Reportar incidente» llama a materializarRiesgo (D6: abre el hallazgo).

import { useMemo, useState } from 'react';
import { materializarRiesgo } from '@/app/sig/acciones/estrategico';

export interface MaterializacionFila {
  id: number;
  riesgoCodigo: string;
  riesgoDescripcion: string;
  proceso: string;
  fecha: string;
  evento: string;
  impacto: string;
  causaRaiz: string;
  reportante: string;
  hallazgo: { codigo: string; cerrado: boolean } | null;
}

export default function MaterializacionesClient({
  filas,
  totalRiesgos,
  conHallazgoAbierto,
  reincidentes,
}: {
  filas: MaterializacionFila[];
  totalRiesgos: number;
  conHallazgoAbierto: number;
  reincidentes: string[];
}) {
  const [filtro, setFiltro] = useState<'todas' | 'abiertas' | 'reincidentes'>('todas');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({ riesgoCodigo: '', fecha: '', evento: '', impacto: '', causaRaiz: '' });

  const visibles = useMemo(() => {
    if (filtro === 'abiertas') return filas.filter((f) => f.hallazgo && !f.hallazgo.cerrado);
    if (filtro === 'reincidentes') return filas.filter((f) => reincidentes.includes(f.riesgoCodigo));
    return filas;
  }, [filas, filtro, reincidentes]);

  const conteoRepeticion = (codigo: string) => filas.filter((f) => f.riesgoCodigo === codigo).length;

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="titulo-pagina">Materializaciones</h1>
          <p className="text-12_5 text-muted">
            Riesgos que dejaron de ser hipótesis. Cada registro es un FOR-CAL-08 y cada uno abrió su hallazgo en Mejora.
          </p>
        </div>
        <button
          onClick={() => setAbierto(true)}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          Reportar incidente
        </button>
      </div>

      <section className="mt-5 grid grid-cols-4 gap-4">
        <Cifra cifra={filas.length} etiqueta="materializaciones" color="#12437f" />
        <Cifra cifra={conHallazgoAbierto} etiqueta="con hallazgo abierto" color="#8a4407" />
        <Cifra cifra={reincidentes.length} etiqueta="riesgos reincidentes" color="#a52016" />
        <Cifra cifra={Math.round((filas.length / Math.max(totalRiesgos, 1)) * 100)} etiqueta="% del universo" color="#0b5c44" sufijo="%" />
      </section>

      <nav className="mt-4 flex items-center gap-2">
        {(['todas', 'abiertas', 'reincidentes'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            aria-pressed={filtro === f}
            className="rounded-chip px-3.5 py-1.5 text-12 capitalize"
            style={{
              background: filtro === f ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: filtro === f ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
            }}
          >
            {f === 'todas' ? 'Todas' : f === 'abiertas' ? 'Con hallazgo abierto' : 'Riesgos reincidentes'}
          </button>
        ))}
      </nav>

      <div className="mt-4 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Riesgo</th>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 font-semibold">Proceso</th>
              <th className="px-4 py-3 font-semibold">Evento e impacto</th>
              <th className="px-4 py-3 font-semibold">Reportante</th>
              <th className="px-4 py-3 font-semibold">Hallazgo</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const veces = conteoRepeticion(f.riesgoCodigo);
              const reincidente = veces > 1;
              return (
                <tr key={f.id} className="border-t border-border-default" style={reincidente ? { background: '#fdeeeb' } : undefined}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-11 font-medium" style={{ color: 'var(--hf-brand-nav)' }}>
                      {f.riesgoCodigo}
                    </span>
                    {reincidente && (
                      <span className="ml-1.5 rounded-[3px] px-1 font-mono text-9 font-semibold" style={{ background: '#fdeeeb', color: '#a52016' }}>
                        {veces}×
                      </span>
                    )}
                    <div className="text-11_5 text-muted">{f.riesgoDescripcion}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-11 text-muted">{f.fecha}</td>
                  <td className="px-4 py-3 text-muted">{f.proceso}</td>
                  <td className="px-4 py-3">
                    <div className="text-11_5 text-primary">{f.evento}</div>
                    <div className="text-11_5 text-muted">{f.impacto}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{f.reportante}</td>
                  <td className="px-4 py-3">
                    {f.hallazgo ? (
                      <a
                        href={`/sig/hallazgos/${f.hallazgo.codigo}`}
                        className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                        style={
                          f.hallazgo.cerrado
                            ? { background: '#e6efe9', color: '#0b5c44' }
                            : { background: '#fff3e6', color: '#8a4407' }
                        }
                      >
                        {f.hallazgo.codigo} · {f.hallazgo.cerrado ? 'Cerrado' : 'Hallazgo abierto'}
                      </a>
                    ) : (
                      <span className="text-11_5 text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {abierto && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6" onClick={() => setAbierto(false)}>
          <div className="flex w-full max-w-[520px] flex-col gap-3 rounded-modal bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-15 font-semibold text-primary">Reportar incidente (FOR-CAL-08)</h2>
            <Campo etiqueta="Código del riesgo" valor={form.riesgoCodigo} set={(v) => setForm({ ...form, riesgoCodigo: v })} />
            <Campo etiqueta="Fecha" valor={form.fecha} set={(v) => setForm({ ...form, fecha: v })} tipo="date" />
            <Campo etiqueta="Descripción del evento" valor={form.evento} set={(v) => setForm({ ...form, evento: v })} />
            <Campo etiqueta="Impacto generado" valor={form.impacto} set={(v) => setForm({ ...form, impacto: v })} />
            <Campo etiqueta="Causa raíz" valor={form.causaRaiz} set={(v) => setForm({ ...form, causaRaiz: v })} />
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setAbierto(false)} className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 text-muted">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const riesgo = filas.find((f) => f.riesgoCodigo === form.riesgoCodigo);
                  if (!riesgo) {
                    setMensaje('Código de riesgo no reconocido.');
                    return;
                  }
                  const r = await materializarRiesgo({
                    riesgoId: riesgo.id,
                    fecha: new Date(`${form.fecha}T00:00:00.000Z`),
                    descripcionEvento: form.evento,
                    impactoGenerado: form.impacto,
                    causaRaiz: form.causaRaiz,
                  });
                  setMensaje(r.mensaje);
                  if (r.ok) setTimeout(() => window.location.reload(), 900);
                }}
                className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
                style={{ background: 'var(--hf-accent-500)' }}
              >
                Reportar
              </button>
            </div>
            {mensaje && <p className="text-12" style={{ color: 'var(--hf-accent-700)' }}>{mensaje}</p>}
          </div>
        </div>
      )}
    </main>
  );
}

function Cifra({ cifra, etiqueta, color, sufijo }: { cifra: number; etiqueta: string; color: string; sufijo?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-tarjeta bg-surface px-5 py-4" style={{ borderTop: `2px solid ${color}` }}>
      <span className="font-mono text-22 font-semibold tabular-nums" style={{ color }}>
        {cifra}
        {sufijo ?? ''}
      </span>
      <span className="text-12 text-muted">{etiqueta}</span>
    </div>
  );
}

function Campo({ etiqueta, valor, set, tipo = 'text' }: { etiqueta: string; valor: string; set: (v: string) => void; tipo?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="etiqueta-campo">{etiqueta}</span>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => set(e.target.value)}
        className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
      />
    </label>
  );
}