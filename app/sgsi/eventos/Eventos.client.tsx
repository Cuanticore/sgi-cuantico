'use client';

// app/sgsi/eventos/Eventos.client.tsx
//
// La lista y el formulario de reporte.
//
// **El botón va en rojo, y es el único de la aplicación que lo lleva.** El lienzo lo explica
// y vale la pena repetirlo acá: es el único que se usa con prisa. Alguien que acaba de hacer
// clic en un enlace de phishing no debería tener que buscar dónde avisar.
//
// **O2 · el formulario NO pide gravedad, categoría, activos, impacto ni causa raíz**, y lo
// dice EN PANTALLA. Que la lista de lo que no se pide esté a la vista no es un adorno: es lo
// que le quita a quien reporta el miedo a equivocarse clasificando, que es la razón más
// común por la que un evento no se reporta.

import { useMemo, useState } from 'react';
import { reportarEvento } from '@/app/sig/acciones/eventos';
import {
  ETIQUETA_ESTADO_EVENTO,
  ETIQUETA_NIVEL,
  ETIQUETA_VEREDICTO,
  NO_SE_PIDE_AL_REPORTAR,
  type EstadoEvento,
  type NivelImpacto,
  type Veredicto,
} from '@/lib/sig/eventos';

export interface EventoFila {
  codigo: string;
  descripcion: string;
  fechaOcurrencia: string;
  enCurso: boolean;
  donde: string | null;
  reportadoPor: string;
  creadoEn: string;
  veredicto: Veredicto | null;
  estado: EstadoEvento;
  severidad: NivelImpacto | null;
  horasHastaEvaluar: number | null;
  categorias: string[];
  activosAfectados: number;
}

const COLOR_ESTADO: Record<EstadoEvento, { fondo: string; texto: string }> = {
  POR_EVALUAR: { fondo: '#faf1d3', texto: '#6b5410' },
  EN_TRATAMIENTO: { fondo: '#fff3e6', texto: '#8a4407' },
  CERRADO: { fondo: '#e6efe9', texto: '#0b5c44' },
  ARCHIVADO: { fondo: 'var(--hf-bg-subtle)', texto: 'var(--hf-text-muted)' },
};

const COLOR_SEVERIDAD: Record<NivelImpacto, { fondo: string; texto: string }> = {
  NINGUNO: { fondo: 'var(--hf-bg-subtle)', texto: 'var(--hf-text-muted)' },
  BAJO: { fondo: '#e6efe9', texto: '#0b5c44' },
  MEDIO: { fondo: '#faf1d3', texto: '#6b5410' },
  ALTO: { fondo: '#fdeeeb', texto: '#a52016' },
};

export default function EventosClient({
  filas,
  lugares,
}: {
  filas: EventoFila[];
  lugares: { id: number; nombre: string }[];
}) {
  const [reportando, setReportando] = useState(false);
  const [filtro, setFiltro] = useState<'todos' | EstadoEvento>('todos');

  const conteos = useMemo(() => {
    const c: Record<string, number> = { todos: filas.length };
    for (const f of filas) c[f.estado] = (c[f.estado] ?? 0) + 1;
    return c;
  }, [filas]);

  const visibles = filtro === 'todos' ? filas : filas.filter((f) => f.estado === filtro);
  const porEvaluar = filas.filter((f) => f.estado === 'POR_EVALUAR');
  const enCurso = filas.filter((f) => f.enCurso && f.estado !== 'CERRADO' && f.estado !== 'ARCHIVADO');

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-start gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="titulo-pagina">Eventos e incidentes</h1>
          <p className="max-w-[92ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Reportar está abierto a toda la organización, sin permiso previo. La gravedad, la
            categoría y la causa las decide la evaluación — no quien reporta.
          </p>
        </div>
        {/* El único botón rojo de la aplicación. Es el único que se usa con prisa. */}
        <button
          onClick={() => setReportando(true)}
          className="ml-auto flex-none rounded-campo px-5 py-2.5 text-13 font-semibold text-white"
          style={{ background: '#a52016', border: '1px solid #8a1a12' }}
        >
          Reportar un evento
        </button>
      </div>

      {/* Lo que sigue ocurriendo va primero: es lo único de esta pantalla que exige una
          acción ahora mismo. */}
      {enCurso.length > 0 && (
        <section
          className="mt-4 rounded-tarjeta px-4 py-3"
          style={{ background: '#fdeeeb', border: '1px solid #f2cdc6' }}
        >
          <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em]" style={{ color: '#a52016' }}>
            {enCurso.length} sigue(n) ocurriendo
          </span>
          <p className="mt-1 text-11_5 leading-relaxed" style={{ color: '#a52016' }}>
            {enCurso.map((e) => e.codigo).join(' · ')} — la contención va antes que la
            clasificación.
          </p>
        </section>
      )}

      <nav className="mt-4 flex flex-wrap items-center gap-1.5">
        {(['todos', 'POR_EVALUAR', 'EN_TRATAMIENTO', 'CERRADO', 'ARCHIVADO'] as const).map((f) => {
          const activo = filtro === f;
          return (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              aria-pressed={activo}
              className="inline-flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 text-12"
              style={{
                background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                border: '1px solid var(--hf-border-field)',
                fontWeight: activo ? 600 : 500,
              }}
            >
              {f === 'todos' ? 'Todos' : ETIQUETA_ESTADO_EVENTO[f]}
              <span className="font-mono text-10 opacity-70">{conteos[f] ?? 0}</span>
            </button>
          );
        })}
        {porEvaluar.length > 0 && (
          <span className="ml-2 text-11_5 text-muted">
            {porEvaluar.length} sin evaluar — el tiempo hasta evaluar es el indicador de la 9.1
          </span>
        )}
      </nav>

      <div className="mt-4 overflow-x-auto rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Evento</th>
              <th className="px-4 py-3 font-semibold">Qué pasó</th>
              <th className="px-4 py-3 font-semibold">Severidad</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 text-right font-semibold">Hasta evaluar</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const e = COLOR_ESTADO[f.estado];
              return (
                <tr key={f.codigo} className="border-t border-border-default">
                  <td className="px-4 py-3">
                    <a href={`/sgsi/eventos/${f.codigo}`} className="font-mono text-11 font-semibold text-accent hover:underline">
                      {f.codigo}
                    </a>
                    <div className="text-10_5 text-muted">
                      {f.fechaOcurrencia} · {f.donde ?? 'sin lugar'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[46ch] truncate text-11_5 text-primary">{f.descripcion}</div>
                    <div className="text-10 text-muted">
                      {f.reportadoPor}
                      {f.categorias.length > 0 && ` · ${f.categorias.join(', ')}`}
                      {f.activosAfectados > 0 && ` · ${f.activosAfectados} activo(s)`}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {/* Sin impactos no hay severidad, y eso NO es «ninguno»: es que nadie
                        evaluó. Pintarlo como bajo diría que es inofensivo. */}
                    {f.severidad === null ? (
                      <span className="font-mono text-10 text-faint">sin evaluar</span>
                    ) : (
                      <span
                        className="rounded-[4px] px-2 py-0.5 font-mono text-9 font-semibold uppercase"
                        style={{
                          background: COLOR_SEVERIDAD[f.severidad].fondo,
                          color: COLOR_SEVERIDAD[f.severidad].texto,
                        }}
                      >
                        {ETIQUETA_NIVEL[f.severidad]}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-[4px] px-2 py-0.5 font-mono text-9 font-semibold uppercase"
                      style={{ background: e.fondo, color: e.texto }}
                    >
                      {ETIQUETA_ESTADO_EVENTO[f.estado]}
                    </span>
                    {f.veredicto !== null && f.estado === 'ARCHIVADO' && (
                      <div className="mt-0.5 text-10 text-muted">{ETIQUETA_VEREDICTO[f.veredicto]}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-11 tabular-nums">
                    {f.horasHastaEvaluar === null ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <span className="text-primary">{f.horasHastaEvaluar} h</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <p className="px-4 py-8 text-center text-12 text-muted">
            {filas.length === 0
              ? 'Ningún evento reportado todavía. Que no haya eventos no es lo mismo que que nadie los reporte.'
              : 'Ninguno en este filtro.'}
          </p>
        )}
      </div>

      {reportando && <FormularioReporte lugares={lugares} onCerrar={() => setReportando(false)} />}
    </main>
  );
}

function FormularioReporte({
  lugares,
  onCerrar,
}: {
  lugares: { id: number; nombre: string }[];
  onCerrar: () => void;
}) {
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [enCurso, setEnCurso] = useState(false);
  const [dondeId, setDondeId] = useState('');
  const [otros, setOtros] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-[560px] flex-col gap-3 overflow-y-auto rounded-modal bg-surface p-6 shadow-xl">
        <h2 className="text-15 font-semibold text-primary">Reportar un evento de seguridad</h2>
        <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
          Contá qué viste. Es lo único que se te pide.
        </p>

        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">¿Qué pasó?</span>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={4}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
            placeholder="Con tus palabras. No se corrige después: es tu versión."
          />
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">¿Cuándo?</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="entrada-campo" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">¿Dónde?</span>
            <select value={dondeId} onChange={(e) => setDondeId(e.target.value)} className="entrada-campo">
              <option value="">Sin especificar</option>
              {lugares.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Lo primero que hay que saber para contener. Va con su propio destaque porque
            cambia la urgencia de todo lo demás. */}
        <label
          className="flex cursor-pointer items-start gap-2 rounded-campo px-3 py-2.5 text-12_5"
          style={enCurso ? { background: '#fdeeeb', border: '1px solid #f2cdc6' } : { border: '1px solid var(--hf-border-field)' }}
        >
          <input type="checkbox" checked={enCurso} onChange={(e) => setEnCurso(e.target.checked)} className="mt-0.5" />
          <span style={enCurso ? { color: '#a52016' } : undefined}>
            <strong className="font-semibold">Sigue ocurriendo ahora.</strong> Marcalo si el
            problema no ha parado: la contención va antes que cualquier otra cosa.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">¿Alguien más lo sabe? · opcional</span>
          <input value={otros} onChange={(e) => setOtros(e.target.value)} className="entrada-campo" />
        </label>

        {/* O2 · la lista explícita de lo que NO se pide. Está a la vista para quitarle a
            quien reporta el miedo a equivocarse clasificando — que es la razón más común
            por la que un evento no se reporta. */}
        <div className="rounded-campo border border-border-field bg-subtle px-3 py-2.5">
          <span className="font-mono text-9 font-medium uppercase tracking-[0.07em] text-accent">
            Lo que NO se te pide
          </span>
          <p className="mt-1 text-11 leading-relaxed text-muted [text-wrap:pretty]">
            {NO_SE_PIDE_AL_REPORTAR.join(', ')}. Todo eso lo decide quien evalúa. Si no estás
            seguro de qué tan grave es, reportalo igual.
          </p>
        </div>

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

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCerrar} className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 text-muted">
            Cancelar
          </button>
          <button
            disabled={enviando || descripcion.trim().length < 15}
            onClick={async () => {
              setEnviando(true);
              setAviso(null);
              const r = await reportarEvento({
                descripcion,
                fechaOcurrencia: new Date(`${fecha}T00:00:00.000Z`),
                enCurso,
                dondeId: dondeId === '' ? undefined : Number(dondeId),
                otrosEnterados: otros || undefined,
              });
              setEnviando(false);
              setAviso({ ok: r.ok, texto: r.mensaje });
              if (r.ok) setTimeout(() => window.location.reload(), 1500);
            }}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
            style={{ background: '#a52016' }}
          >
            {enviando ? 'Reportando…' : 'Reportar'}
          </button>
        </div>
      </div>
    </div>
  );
}
