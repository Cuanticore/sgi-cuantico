'use client';

// app/components/sgsi/activos/PopupControlesAmenaza.tsx
//
// The pairing of one threat with the controls that mitigate it — administered here, from
// the asset sheet, instead of by navigating to another screen.
//
// «+ Agregar control implementado» used to be a link to /sgsi/controles. Not because the
// screen was the wrong place, but because the pair COULD NOT BE CREATED: `relevanciaId` was
// NOT NULL, so recording that a control mitigates a threat required a Principal /
// Complementario / De apoyo decision nobody had made yet. It is nullable now, so the pair
// is recorded first and weighted later.
//
// Everything here recalculates risk on the server, and the messages say so: efficacy is
// aggregated from these controls, the residual frequency comes from efficacy, and the
// residual risk comes from the frequency. A pair added or removed moves every residual risk
// this threat touches — the popup never pretends it is a local edit.

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Popup from '@/app/components/sgsi/Popup';
import {
  asociarControl,
  cambiarRelevancia,
  controlesDeAmenaza,
  desasociarControl,
  type ControlesDeAmenaza,
} from '@/app/sgsi/acciones/amenazas';

interface Props {
  codigoAmenaza: string;
  nombreAmenaza: string;
  onCerrar: () => void;
}

const SIN_ASIGNAR = 'sin asignar';

function semaforoNivel(nivel: number | null): { fg: string; bg: string; bd: string } {
  if (nivel === null) {
    return { fg: 'var(--hf-cmm-nulo-fg)', bg: 'var(--hf-cmm-nulo-bg)', bd: 'var(--hf-cmm-nulo-bd)' };
  }
  if (nivel <= 1) {
    return { fg: 'var(--hf-cmm-rojo-fg)', bg: 'var(--hf-cmm-rojo-bg)', bd: 'var(--hf-cmm-rojo-bd)' };
  }
  if (nivel <= 3) {
    return {
      fg: 'var(--hf-cmm-naranja-fg)',
      bg: 'var(--hf-cmm-naranja-bg)',
      bd: 'var(--hf-cmm-naranja-bd)',
    };
  }
  return { fg: 'var(--hf-cmm-verde-fg)', bg: 'var(--hf-cmm-verde-bg)', bd: 'var(--hf-cmm-verde-bd)' };
}

export default function PopupControlesAmenaza({ codigoAmenaza, nombreAmenaza, onCerrar }: Props) {
  const router = useRouter();
  const [datos, setDatos] = useState<ControlesDeAmenaza | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const [nuevo, setNuevo] = useState('');
  const [nuevaRelevancia, setNuevaRelevancia] = useState('');
  const [quitando, setQuitando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');

  const cargar = useCallback(() => {
    void controlesDeAmenaza(codigoAmenaza).then((r) => {
      setDatos(r);
      if (!r.ok) setAviso({ ok: false, texto: r.mensaje });
    });
  }, [codigoAmenaza]);

  useEffect(cargar, [cargar]);

  const correr = (op: () => Promise<{ ok: boolean; mensaje: string }>): void => {
    iniciar(async () => {
      const r = await op();
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        cargar();
        // The sheet behind holds the threat's efficacy and every figure derived from it.
        router.refresh();
      }
    });
  };

  const asociados = datos?.asociados ?? [];
  const disponibles = datos?.disponibles ?? [];
  const relevancias = datos?.relevancias ?? [];
  const sinRelevancia = asociados.filter((c) => c.relevancia === null).length;

  return (
    <Popup
      titulo={`Controles de ${codigoAmenaza}`}
      subtitulo={`${nombreAmenaza} · la eficacia de esta amenaza se agrega desde la madurez actual de estos controles, y de ahí sale el riesgo residual.`}
      ancho={900}
      onCerrar={onCerrar}
      pie={
        <>
          {aviso && (
            <span
              className="mr-auto max-w-[62ch] text-11_5 [text-wrap:pretty]"
              style={{ color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)' }}
            >
              {aviso.texto}
            </span>
          )}
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white"
            style={{ background: 'var(--hf-accent-500)' }}
          >
            Listo
          </button>
        </>
      }
    >
      {datos === null ? (
        <p className="py-6 text-center text-12_5 text-faint">Cargando los controles…</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* How this threat is being aggregated, said before the list. Without it the
              «sin asignar» chips look like an error rather than a documented interim. */}
          <div
            className="rounded-campo border px-3.5 py-3 text-11_5 [text-wrap:pretty]"
            style={
              sinRelevancia === asociados.length && asociados.length > 0
                ? {
                    background: 'var(--hf-warn-100)',
                    borderColor: 'var(--hf-warn-border)',
                    color: 'var(--hf-warn-text)',
                  }
                : {
                    background: 'var(--hf-accent-50)',
                    borderColor: 'var(--hf-accent-border)',
                    color: 'var(--hf-accent-800)',
                  }
            }
          >
            {asociados.length === 0 ? (
              <>
                Esta amenaza no tiene ningún control asociado, así que su eficacia es{' '}
                <strong>desconocida</strong> y sus riesgos residuales figuran como «sin
                calcular». Desconocido no es cero: escribir cero dejaría la matriz residual
                idéntica a la inherente.
              </>
            ) : sinRelevancia === asociados.length ? (
              <>
                Ninguno de los {asociados.length} controles tiene relevancia asignada, así que
                la eficacia se agrega con la <strong>media plana</strong> — es lo que hace el
                AVERAGE del libro (MET-SIG-01 v2). Asignando Principal, Complementario y De
                apoyo, esta amenaza pasa a la media ponderada con techo en el principal
                (v3 §7.4).
              </>
            ) : sinRelevancia > 0 ? (
              <>
                {sinRelevancia} de {asociados.length} controles siguen sin relevancia. Mientras
                la asignación esté a medias, pesar unos en 3 y otros en 1 se lee como decisión
                y es un olvido: completala o dejala toda sin asignar.
              </>
            ) : (
              <>
                Los {asociados.length} controles tienen relevancia: la eficacia es la media
                ponderada por peso, con techo en el control Principal más δ (v3 §7.4).
              </>
            )}
          </div>

          {/* Associated controls */}
          <div className="overflow-x-auto rounded-campo border border-hairline-strong">
            <table className="w-full border-collapse text-11_5" style={{ minWidth: 700 }}>
              <thead>
                <tr className="bg-subtle text-left">
                  <th className="border-b border-hairline-strong px-2.5 py-2 font-mono text-10 tracking-[0.06em] text-label">
                    CONTROL
                  </th>
                  <th className="border-b border-hairline-strong px-2.5 py-2 font-semibold text-secondary">
                    Nombre
                  </th>
                  <th className="border-b border-hairline-strong px-2.5 py-2 font-semibold text-secondary whitespace-nowrap">
                    Madurez
                  </th>
                  <th className="border-b border-hairline-strong px-2.5 py-2 font-semibold text-secondary whitespace-nowrap">
                    Relevancia
                  </th>
                  <th className="border-b border-hairline-strong px-2.5 py-2" />
                </tr>
              </thead>
              <tbody>
                {asociados.map((c) => {
                  const s = semaforoNivel(c.nivel);
                  return (
                    <tr key={c.codigo}>
                      <td className="border-b border-hairline-faint px-2.5 py-2 align-top font-mono text-11 text-primary">
                        {c.codigo}
                      </td>
                      <td className="border-b border-hairline-faint px-2.5 py-2 align-top text-secondary">
                        {c.nombre}
                      </td>
                      <td className="border-b border-hairline-faint px-2.5 py-2 align-top">
                        <span
                          className="rounded-badge border px-1.5 py-0.5 font-mono text-10 font-bold"
                          style={{ color: s.fg, background: s.bg, borderColor: s.bd }}
                        >
                          {c.nivel === null ? 'sin evaluar' : `L${c.nivel}`}
                        </span>
                      </td>
                      <td className="border-b border-hairline-faint px-2.5 py-2 align-top">
                        <select
                          value={c.relevancia ?? ''}
                          disabled={pendiente}
                          onChange={(e) =>
                            correr(() =>
                              cambiarRelevancia(
                                codigoAmenaza,
                                c.codigo,
                                e.target.value === '' ? null : e.target.value,
                              ),
                            )
                          }
                          className="w-[168px] rounded-campo border border-border-field bg-surface px-2 py-1 text-11 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-50"
                        >
                          <option value="">— {SIN_ASIGNAR} —</option>
                          {relevancias.map((r) => (
                            <option key={r.nombre} value={r.nombre}>
                              {r.nombre} · peso {r.peso}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="border-b border-hairline-faint px-2.5 py-2 align-top text-right">
                        {quitando === c.codigo ? (
                          <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            <input
                              autoFocus
                              value={motivo}
                              onChange={(e) => setMotivo(e.target.value)}
                              placeholder="Motivo de la baja…"
                              aria-label={`Motivo para quitar ${c.codigo}`}
                              className="w-[190px] rounded-campo border border-border-field bg-surface px-2 py-1 text-11 text-primary placeholder:text-placeholder focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                            />
                            <button
                              type="button"
                              disabled={pendiente || motivo.trim() === ''}
                              onClick={() =>
                                correr(async () => {
                                  const r = await desasociarControl(
                                    codigoAmenaza,
                                    c.codigo,
                                    motivo,
                                  );
                                  if (r.ok) {
                                    setQuitando(null);
                                    setMotivo('');
                                  }
                                  return r;
                                })
                              }
                              className="rounded-badge border px-1.5 py-0.5 font-mono text-9 uppercase tracking-[0.06em] disabled:opacity-40"
                              style={{
                                borderColor: 'var(--hf-danger-border)',
                                color: 'var(--hf-danger-text)',
                              }}
                            >
                              quitar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setQuitando(null);
                                setMotivo('');
                              }}
                              className="rounded-badge border border-border-default px-1.5 py-0.5 font-mono text-9 uppercase tracking-[0.06em] text-muted"
                            >
                              cancelar
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={pendiente}
                            onClick={() => {
                              setQuitando(c.codigo);
                              setMotivo('');
                            }}
                            aria-label={`Quitar ${c.codigo} de ${codigoAmenaza}`}
                            className="rounded-badge border px-1.5 py-0.5 font-mono text-9 uppercase tracking-[0.06em] disabled:opacity-40"
                            style={{
                              borderColor: 'var(--hf-danger-border)',
                              color: 'var(--hf-danger-text)',
                            }}
                          >
                            quitar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {asociados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2.5 py-5 text-center text-11_5 text-faint">
                      Sin controles asociados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Add. Relevance is optional here on purpose: requiring it is what turned this
              button into a link to another screen in the first place. */}
          <div className="rounded-campo border border-hairline-strong bg-app px-3.5 py-3">
            <p className="etiqueta-campo text-9">ASOCIAR UN CONTROL</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={nuevo}
                onChange={(e) => setNuevo(e.target.value)}
                disabled={pendiente || disponibles.length === 0}
                className="min-w-[280px] flex-1 rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-11_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-50"
              >
                <option value="">
                  {disponibles.length === 0
                    ? '— ya están todos los controles aplicables —'
                    : '— elegí un control —'}
                </option>
                {disponibles.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.codigo} · {c.nombre} {c.nivel === null ? '(sin evaluar)' : `(L${c.nivel})`}
                  </option>
                ))}
              </select>

              <select
                value={nuevaRelevancia}
                onChange={(e) => setNuevaRelevancia(e.target.value)}
                disabled={pendiente}
                title="Opcional. Sin relevancia, esta amenaza agrega con la media plana de sus controles."
                className="w-[190px] rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-11_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-50"
              >
                <option value="">relevancia: {SIN_ASIGNAR}</option>
                {relevancias.map((r) => (
                  <option key={r.nombre} value={r.nombre}>
                    {r.nombre} · peso {r.peso}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={pendiente || nuevo === ''}
                onClick={() =>
                  correr(async () => {
                    const r = await asociarControl(
                      codigoAmenaza,
                      nuevo,
                      nuevaRelevancia === '' ? null : nuevaRelevancia,
                    );
                    if (r.ok) {
                      setNuevo('');
                      setNuevaRelevancia('');
                    }
                    return r;
                  })
                }
                className="rounded-campo border border-accent-500 bg-accent-100 px-3 py-1.5 text-11_5 font-semibold text-accent-700 disabled:opacity-40"
              >
                {pendiente ? 'Guardando…' : 'Asociar'}
              </button>
            </div>

            {relevancias.length > 0 && (
              <ul className="mt-2.5 flex flex-col gap-1">
                {relevancias.map((r) => (
                  <li key={r.nombre} className="text-10_5 text-faint [text-wrap:pretty]">
                    <span className="font-semibold text-muted">{r.nombre}</span> · peso {r.peso}
                    {r.esPrincipal ? ' · uno por amenaza' : ''} — {r.criterio}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Popup>
  );
}
