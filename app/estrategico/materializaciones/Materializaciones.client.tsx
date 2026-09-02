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

export interface RiesgoDelCatalogo {
  id: number;
  codigo: string;
  descripcion: string;
  proceso: string;
  factor: string;
  inherente: number;
  residual: number;
  nivelEtiqueta: string;
  nivelColor: string;
}

export default function MaterializacionesClient({
  filas,
  catalogo,
  totalRiesgos,
  conHallazgoAbierto,
  reincidentes,
}: {
  filas: MaterializacionFila[];
  /// Los riesgos ACTIVOS con lo que dice la matriz. Es el catalogo del formulario: el
  /// riesgo se elige de acá, no se teclea su codigo.
  catalogo: RiesgoDelCatalogo[];
  totalRiesgos: number;
  conHallazgoAbierto: number;
  reincidentes: string[];
}) {
  const [filtro, setFiltro] = useState<'todas' | 'abiertas' | 'reincidentes'>('todas');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({ riesgoId: '', fecha: '', evento: '', impacto: '', causaRaiz: '' });
  const elegido = catalogo.find((r) => String(r.id) === form.riesgoId) ?? null;

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
          <div className="flex max-h-full w-full max-w-[560px] flex-col gap-3 overflow-y-auto rounded-modal bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <span className="flex items-center gap-2.5">
              <h2 className="text-15 font-semibold text-primary">Reporte de incidente de riesgo</h2>
              <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold" style={{ background: 'var(--hf-bg-subtle)', color: 'var(--hf-text-secondary)' }}>
                FOR-CAL-08
              </span>
            </span>
            <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
              Un riesgo se materializó. Este registro deja constancia y abre el hallazgo para
              tratarlo.
            </p>

            <label className="flex flex-col gap-1">
              <span className="text-11 font-medium text-secondary">Riesgo que se materializó</span>
              <select
                value={form.riesgoId}
                onChange={(e) => setForm({ ...form, riesgoId: e.target.value })}
                className="entrada-campo"
              >
                <option value="">Elegí el riesgo…</option>
                {catalogo.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.codigo} · {r.descripcion}
                  </option>
                ))}
              </select>
            </label>

            <Campo etiqueta="Fecha del evento" valor={form.fecha} set={(v) => setForm({ ...form, fecha: v })} tipo="date" />

            {/* «Lo que dice la matriz · no se captura, se lee». El reportante NO reescribe
                el nivel del riesgo: si pudiera, el incidente y la matriz podrían discrepar
                y nadie sabría cuál de los dos vale. */}
            {elegido && (
              <div className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-subtle px-4 py-3">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-9 font-medium uppercase tracking-[0.07em] text-accent">
                    Lo que dice la matriz
                  </span>
                  <span className="h-px flex-1 bg-hairline" />
                  <span className="font-mono text-9 text-muted">no se captura, se lee</span>
                </span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-11_5">
                  <Dato etiqueta="Proceso" valor={elegido.proceso} />
                  <Dato etiqueta="Factor" valor={elegido.factor} />
                  <Dato etiqueta="Inherente" valor={String(elegido.inherente)} />
                  <Dato etiqueta="Residual" valor={String(elegido.residual)} />
                </div>
                <span className="flex items-center gap-2">
                  <span className="text-11 text-muted">Nivel residual</span>
                  <span
                    className="rounded-[4px] px-2 py-0.5 font-mono text-9 font-semibold uppercase"
                    style={{ background: `${elegido.nivelColor}22`, color: elegido.nivelColor }}
                  >
                    {elegido.nivelEtiqueta}
                  </span>
                </span>
              </div>
            )}

            <Campo etiqueta="Descripción del evento · obligatorio" valor={form.evento} set={(v) => setForm({ ...form, evento: v })} />
            <label className="flex flex-col gap-1">
              <Campo etiqueta="Impacto generado · obligatorio" valor={form.impacto} set={(v) => setForm({ ...form, impacto: v })} />
              <span className="text-10_5 text-muted">
                Qué se perdió o dejó de pasar, en términos concretos. Si hay cifra, ponla.
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <Campo etiqueta="Causa raíz · como la ves hoy" valor={form.causaRaiz} set={(v) => setForm({ ...form, causaRaiz: v })} />
              <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                Tu primera lectura de por qué ocurrió. El análisis formal se hace después, en el
                hallazgo, con método declarado.
              </span>
            </label>

            <p className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
              El reporte y el hallazgo en Mejora se crean en la misma transacción: no puede
              quedar un incidente registrado sin nada que lo trate.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setAbierto(false)} className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 text-muted">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  // Antes acá se buscaba el código dentro de `filas`, que son las
                  // MATERIALIZACIONES ya registradas. Dos defectos en una línea: un riesgo
                  // que nunca se había materializado daba «código no reconocido» —o sea, la
                  // pantalla no servía para su único caso de uso—, y uno que sí, mandaba el
                  // id de la materialización como `riesgoId`, apuntando a otro riesgo.
                  if (!elegido) {
                    setMensaje('Elegí el riesgo que se materializó.');
                    return;
                  }
                  if (!form.fecha || !form.evento.trim() || !form.impacto.trim()) {
                    setMensaje('La fecha, el evento y el impacto son obligatorios.');
                    return;
                  }
                  const r = await materializarRiesgo({
                    riesgoId: elegido.id,
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
                Registrar y abrir el hallazgo
              </button>
            </div>
            {mensaje && <p className="text-12" style={{ color: 'var(--hf-accent-700)' }}>{mensaje}</p>}
          </div>
        </div>
      )}
    </main>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-10 text-muted">{etiqueta}</span>
      <span className="text-11_5 text-primary">{valor}</span>
    </span>
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