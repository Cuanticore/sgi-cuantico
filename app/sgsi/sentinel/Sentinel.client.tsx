'use client';

// app/sgsi/sentinel/Sentinel.client.tsx
//
// La vista de consulta del espejo de Microsoft Sentinel.
//
// **No hay ningún control de edición acá.** La única acción posible es Promover, y eso es a
// propósito: una pantalla sin dónde editar es la afirmación más clara de quién es el dueño
// del registro — Sentinel, no el SGSI. Cada fila lleva su enlace profundo («Ver en
// Sentinel») y su `sincronizadoEn`, para que nadie lea una copia vieja como si fuera actual.

import { useState } from 'react';
import { promoverIncidenteSentinel } from '@/app/sig/acciones/sentinel';
import { sugerirEnCurso } from '@/lib/sig/sentinel';

export interface IncidenteSentinelFila {
  numeroIncidente: string;
  titulo: string;
  estadoSentinel: string;
  severidadSentinel: string;
  creadoEnSentinel: string;
  sincronizadoEn: string;
  url: string;
  /// El código del `EventoSeguridad` si ya fue promovido, o `null` si no.
  promovidoComo: string | null;
}

export default function SentinelClient({
  filas,
  lugares,
  puedePromover,
}: {
  filas: IncidenteSentinelFila[];
  lugares: { id: number; nombre: string }[];
  puedePromover: boolean;
}) {
  const [promoviendo, setPromoviendo] = useState<IncidenteSentinelFila | null>(null);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-col gap-1.5">
        <h1 className="titulo-pagina">Incidentes de Sentinel</h1>
        <p className="max-w-[92ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
          Copia de solo lectura de <code>SecurityIncident</code>, refrescada cada hora por el
          trabajo de sincronización. Las alertas, entidades y la línea de tiempo completa
          viven en Microsoft Sentinel: acá sólo se lee. La única acción disponible es
          promover un incidente a un evento del SGSI.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr
              className="text-11 uppercase tracking-[0.05em]"
              style={{ color: 'var(--hf-text-label)' }}
            >
              <th className="px-4 py-3 font-semibold">Incidente</th>
              <th className="px-4 py-3 font-semibold">Severidad</th>
              <th className="px-4 py-3 font-semibold">Estado en Sentinel</th>
              <th className="px-4 py-3 font-semibold">Sincronizado</th>
              <th className="px-4 py-3 font-semibold">Promoción</th>
              <th className="px-4 py-3 text-right font-semibold">Sentinel</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.numeroIncidente} className="border-t border-border-default">
                <td className="px-4 py-3">
                  <div className="font-mono text-11 font-semibold text-primary">
                    #{f.numeroIncidente}
                  </div>
                  <div className="max-w-[46ch] truncate text-11_5 text-muted">{f.titulo}</div>
                  <div className="text-10_5 text-faint">{f.creadoEnSentinel}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-[4px] bg-subtle px-2 py-0.5 font-mono text-9 font-semibold uppercase text-muted">
                    {f.severidadSentinel}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-11 text-secondary">{f.estadoSentinel}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-10_5 text-faint">{f.sincronizadoEn}</span>
                </td>
                <td className="px-4 py-3">
                  {f.promovidoComo !== null ? (
                    <a
                      href={`/sgsi/eventos/${f.promovidoComo}`}
                      className="font-mono text-11 font-semibold text-accent hover:underline"
                    >
                      {f.promovidoComo}
                    </a>
                  ) : puedePromover ? (
                    <button
                      onClick={() => setPromoviendo(f)}
                      className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-11_5 font-semibold text-secondary"
                    >
                      Promover
                    </button>
                  ) : (
                    <span className="text-11 text-faint">sin promover</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-11 text-accent hover:underline"
                  >
                    Ver en Sentinel ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && (
          <p className="px-4 py-8 text-center text-12 text-muted">
            El espejo está vacío. El trabajo de sincronización corre cada hora; si ya pasó una
            hora desde el despliegue, revisa que las variables SENTINEL_* estén configuradas.
          </p>
        )}
      </div>

      {promoviendo && (
        <FormularioPromocion
          incidente={promoviendo}
          lugares={lugares}
          onCerrar={() => setPromoviendo(null)}
        />
      )}
    </main>
  );
}

function FormularioPromocion({
  incidente,
  lugares,
  onCerrar,
}: {
  incidente: IncidenteSentinelFila;
  lugares: { id: number; nombre: string }[];
  onCerrar: () => void;
}) {
  // D8 · sugerido, no impuesto: quien promueve confirma o cambia el valor.
  const [enCurso, setEnCurso] = useState(sugerirEnCurso(incidente.estadoSentinel));
  const [dondeId, setDondeId] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6">
      <div className="flex w-full max-w-[520px] flex-col gap-4 rounded-modal bg-surface p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 className="text-15 font-semibold text-primary">
              Promover #{incidente.numeroIncidente}
            </h2>
            <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
              Crea un evento del SGSI a partir de este incidente. La clasificación y la
              severidad de Sentinel no se copian: el evento entra sin veredicto, como
              cualquier otro reportado, y lo evalúa el SIG.
            </p>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex-none rounded-campo border border-border-field bg-surface px-2 py-1 text-12 text-muted"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">¿Sigue ocurriendo?</span>
          <div className="flex gap-1.5">
            {[
              { v: true, etiqueta: 'Sí, ahora' },
              { v: false, etiqueta: 'Ya terminó' },
            ].map((o) => {
              const activo = enCurso === o.v;
              return (
                <button
                  key={o.etiqueta}
                  onClick={() => setEnCurso(o.v)}
                  aria-pressed={activo}
                  className="flex-1 rounded-campo px-3 py-2 text-12_5"
                  style={{
                    background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    border: `1px solid ${activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                    color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                    fontWeight: activo ? 600 : 500,
                  }}
                >
                  {o.etiqueta}
                </button>
              );
            })}
          </div>
          <span className="text-10_5 text-faint">
            Sugerido por el estado en Sentinel ({incidente.estadoSentinel}): confírmalo, no es
            automático.
          </span>
        </div>

        {lugares.length > 0 && (
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">¿Dónde? · opcional</span>
            <select
              value={dondeId ?? ''}
              onChange={(e) => setDondeId(e.target.value ? Number(e.target.value) : null)}
              className="entrada-campo"
            >
              <option value="">Sin especificar</option>
              {lugares.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        {aviso && (
          <p
            className="rounded-campo px-3 py-2 text-12 [text-wrap:pretty]"
            style={{
              background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
              color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
            }}
          >
            {aviso.texto}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-hairline pt-3">
          <span className="flex-1 text-11 text-muted">
            Se registra en la bitácora quién promovió y cuándo.
          </span>
          <button
            onClick={onCerrar}
            className="flex-none rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 text-muted"
          >
            Cancelar
          </button>
          <button
            disabled={enviando}
            onClick={async () => {
              setEnviando(true);
              setAviso(null);
              const r = await promoverIncidenteSentinel(incidente.numeroIncidente, {
                enCurso,
                dondeId: dondeId ?? undefined,
              });
              setEnviando(false);
              setAviso({ ok: r.ok, texto: r.mensaje });
              if (r.ok) setTimeout(() => window.location.reload(), 1200);
            }}
            className="flex-none rounded-campo px-5 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-brand-nav)', border: '1px solid var(--hf-brand-nav)' }}
          >
            {enviando ? 'Promoviendo…' : 'Promover ahora'}
          </button>
        </div>
      </div>
    </div>
  );
}
