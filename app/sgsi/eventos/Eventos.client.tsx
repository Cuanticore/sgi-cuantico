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

/// Sube los adjuntos al evento recién creado. Se hace DESPUÉS de crear el evento y no
/// antes porque la evidencia se ata a un dueño: sin código no hay a quién atarla.
///
/// Si un archivo falla, el evento ya existe y así se dice. Un reporte que se descarta
/// entero porque una captura no subió es un reporte perdido, y el reporte vale más que
/// el adjunto.
async function subirEvidencias(codigo: string, archivos: File[]): Promise<string[]> {
  const fallidos: string[] = [];
  for (const f of archivos) {
    const cuerpo = new FormData();
    cuerpo.append('file', f);
    cuerpo.append('codigoEvento', codigo);
    try {
      const r = await fetch('/api/sgsi/anexo', { method: 'POST', body: cuerpo });
      if (!r.ok) fallidos.push(f.name);
    } catch {
      fallidos.push(f.name);
    }
  }
  return fallidos;
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
  // Ternario a propósito: `null` es «todavía no contestó», y no es lo mismo que «ya
  // terminó». Un checkbox habría contestado que no en silencio.
  const [enCurso, setEnCurso] = useState<boolean | null>(null);
  const [dondeId, setDondeId] = useState<number | null>(null);
  const [otros, setOtros] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-[620px] flex-col gap-4 overflow-y-auto rounded-modal bg-surface p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-center gap-2.5">
              <h2 className="text-15 font-semibold text-primary">Reportar un evento de seguridad</h2>
              <span className="flex-none rounded-[4px] bg-subtle px-2 py-0.5 font-mono text-9 font-medium uppercase tracking-[0.07em] text-muted">
                A.5.25
              </span>
            </span>
            <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
              Algo te pareció raro y lo reportas.{' '}
              <strong className="font-semibold text-secondary">No tienes que saber si es grave</strong>, ni
              si es un incidente: eso lo evalúa el equipo de seguridad. Reportar de más no cuesta
              nada; reportar de menos, sí.
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

        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">¿Qué pasó? · obligatorio</span>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={4}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
            placeholder="Con tus palabras. No se corrige después: es tu versión."
          />
          <span className="text-11 leading-relaxed text-faint [text-wrap:pretty]">
            Cuenta lo que viste, con tus palabras. Si tienes el correo, adjúntalo sin reenviarlo
            a nadie más.
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="etiqueta-campo">¿Cuándo ocurrió?</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="entrada-campo" />
          </label>
          <div className="flex flex-col gap-1.5">
            {/* Pregunta con dos respuestas, no una casilla: lo primero que hay que saber
                para contener, y cambia la urgencia de todo lo demás. */}
            <span className="etiqueta-campo">¿Sigue ocurriendo?</span>
            <div className="flex gap-1.5">
              {[
                { v: true, etiqueta: 'Sí, ahora', fondo: '#fdeeeb', borde: '#a52016', texto: '#a52016' },
                { v: false, etiqueta: 'Ya terminó', fondo: '#e6efe9', borde: '#0b5c44', texto: '#0b5c44' },
              ].map((o) => {
                const activo = enCurso === o.v;
                return (
                  <button
                    key={o.etiqueta}
                    onClick={() => setEnCurso(o.v)}
                    aria-pressed={activo}
                    className="flex-1 rounded-campo px-3 py-2 text-12_5"
                    style={{
                      background: activo ? o.fondo : 'var(--hf-bg-surface)',
                      border: `1px solid ${activo ? o.borde : 'var(--hf-border-field)'}`,
                      color: activo ? o.texto : 'var(--hf-text-secondary-soft)',
                      fontWeight: activo ? 600 : 500,
                    }}
                  >
                    {o.etiqueta}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {/* Los seis lugares a la vista, no dentro de un desplegable: la lista misma le
              dice a quien reporta qué cuenta como «un evento de seguridad». */}
          <span className="etiqueta-campo">¿Dónde lo viste? · ayuda a ubicarlo, no es obligatorio</span>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {lugares.map((l) => {
              const activo = dondeId === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => setDondeId(activo ? null : l.id)}
                  aria-pressed={activo}
                  className="rounded-campo px-3 py-2 text-left text-12"
                  style={{
                    background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    border: `1px solid ${activo ? 'var(--hf-brand-nav)' : 'var(--hf-border-field)'}`,
                    color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                    fontWeight: activo ? 600 : 500,
                  }}
                >
                  {l.nombre}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">¿Alguien más está enterado?</span>
          <input value={otros} onChange={(e) => setOtros(e.target.value)} className="entrada-campo" />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Evidencia · muy recomendable</span>
          <label className="flex cursor-pointer items-center gap-3 rounded-tarjeta border border-dashed border-border-field bg-subtle px-4 py-3.5">
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => setArchivos([...(e.target.files ?? [])])}
            />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-12_5 text-secondary">Captura de pantalla o el correo guardado</span>
              <span className="text-10_5 text-faint">
                Se conserva tal cual: es material de prueba (A.5.28)
              </span>
            </span>
            <span className="flex-none rounded-campo border border-border-field bg-surface px-3 py-1.5 text-11_5 text-secondary">
              Buscar en tu equipo
            </span>
          </label>
          {archivos.length > 0 && (
            <span className="font-mono text-10_5 text-muted">
              {archivos.map((a) => a.name).join(' · ')}
            </span>
          )}
        </div>

        {/* O2 · la lista explícita de lo que NO se pide. Está a la vista para quitarle a
            quien reporta el miedo a equivocarse clasificando — que es la razón más común
            por la que un evento no se reporta. */}
        <div className="flex flex-col gap-2.5 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
          <span className="flex items-center gap-2.5">
            <span className="font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
              Lo que este formulario no te pide
            </span>
            <span className="h-px flex-1 bg-hairline" />
          </span>
          <div className="flex flex-wrap gap-1.5">
            {NO_SE_PIDE_AL_REPORTAR.map((n) => (
              <span
                key={n}
                className="rounded-campo bg-subtle px-2.5 py-1 font-mono text-10 text-faint line-through"
              >
                {n}
              </span>
            ))}
          </div>
          <span className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
            Pedirle a quien reporta que clasifique la gravedad es la forma más eficaz de que no
            reporte. Todo eso lo decide la evaluación, y para eso existe el paso siguiente.
          </span>
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

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
          <span className="min-w-[240px] flex-1 text-11 leading-relaxed text-muted [text-wrap:pretty]">
            Abierto a <strong className="font-semibold text-secondary">cualquier persona autenticada</strong>,
            sin permisos previos. Recibirás aviso cuando el equipo lo evalúe.
          </span>
          <button
            onClick={onCerrar}
            className="flex-none rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 text-muted"
          >
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
                enCurso: enCurso === true,
                dondeId: dondeId ?? undefined,
                otrosEnterados: otros || undefined,
              });
              if (!r.ok || r.codigo === null) {
                setEnviando(false);
                setAviso({ ok: false, texto: r.mensaje });
                return;
              }
              const fallidos = archivos.length > 0 ? await subirEvidencias(r.codigo, archivos) : [];
              setEnviando(false);
              setAviso({
                ok: true,
                texto:
                  fallidos.length === 0
                    ? r.mensaje
                    : `${r.mensaje} No se pudo adjuntar: ${fallidos.join(', ')} — el evento ya quedó reportado; podés volver a adjuntar desde su ficha.`,
              });
              setTimeout(() => window.location.reload(), fallidos.length === 0 ? 1500 : 4000);
            }}
            className="flex-none rounded-campo px-5 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
            style={{ background: '#a52016', border: '1px solid #8a1f16' }}
          >
            {enviando ? 'Reportando…' : 'Reportar ahora'}
          </button>
        </div>
      </div>
    </div>
  );
}
