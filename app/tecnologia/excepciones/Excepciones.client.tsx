'use client';

// app/tecnologia/excepciones/Excepciones.client.tsx
//
// **Lo que se vigila no es que existan, sino que se cierren.** Por eso el número grande de
// arriba es el de vencidas, no el total: un tablero que celebra «12 excepciones» no dice
// nada, y uno que dice «3 vencidas» dice todo.
//
// El filtro arranca en «abiertas» y no en «todas»: las cerradas son historia, y ponerlas
// primero enterraría las tres que importan bajo cuarenta que ya se resolvieron.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cerrarExcepcion, crearExcepcion, prorrogarExcepcion } from '@/app/sig/acciones/desarrollo';
import {
  ETIQUETA_ESTADO_EXCEPCION,
  ETIQUETA_PUERTA,
  PUERTAS,
  type EstadoExcepcion,
  type Puerta,
} from '@/lib/sig/desarrollo';

const COLOR: Record<EstadoExcepcion, { fondo: string; texto: string; borde: string }> = {
  VENCIDA: { fondo: '#fdeeeb', texto: '#a52016', borde: '#f2cdc6' },
  POR_VENCER: { fondo: '#fff3e6', texto: '#8a4407', borde: '#f2b473' },
  VIGENTE: { fondo: 'var(--hf-brand-100)', texto: 'var(--hf-brand-nav)', borde: 'var(--hf-brand-200, #d3dceb)' },
  CERRADA: { fondo: 'var(--hf-bg-subtle)', texto: 'var(--hf-text-muted)', borde: 'var(--hf-border-field)' },
};

export interface ExcepcionFila {
  codigo: string;
  sistemaId: number;
  sistema: string;
  puerta: Puerta | null;
  justificacion: string;
  evaluacionRiesgo: string;
  aprobadaPor: string | null;
  fechaAprobacion: string;
  fechaCierre: string;
  cerradaEn: string | null;
  cerradaPor: string | null;
  notaCierre: string | null;
  estado: EstadoExcepcion;
  dias: number;
  cerradaTarde: boolean;
}

/// «faltan 12 días» y «vencida hace 40» son dos conversaciones distintas, y un solo número
/// las dice. Cero se nombra aparte: «vence hoy» no es «faltan 0 días».
function textoDePlazo(f: ExcepcionFila): string {
  if (f.cerradaEn !== null) return `cerrada ${f.cerradaEn}`;
  if (f.dias === 0) return 'vence hoy';
  return f.dias > 0 ? `faltan ${f.dias} d` : `vencida hace ${-f.dias} d`;
}

export default function ExcepcionesClient({
  filas,
  filtro,
  elegidoCodigo,
  diasAviso,
  sistemas,
  personas,
}: {
  filas: ExcepcionFila[];
  filtro: string;
  elegidoCodigo: string | null;
  diasAviso: number;
  sistemas: { id: number; etiqueta: string }[];
  personas: { id: number; nombre: string }[];
}) {
  const router = useRouter();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [creando, setCreando] = useState(false);

  const cuenta = useMemo(
    () => ({
      abiertas: filas.filter((f) => f.cerradaEn === null).length,
      vencidas: filas.filter((f) => f.estado === 'VENCIDA').length,
      porVencer: filas.filter((f) => f.estado === 'POR_VENCER').length,
      cerradas: filas.filter((f) => f.cerradaEn !== null).length,
      todas: filas.length,
    }),
    [filas],
  );

  const visibles = useMemo(() => {
    if (filtro === 'vencidas') return filas.filter((f) => f.estado === 'VENCIDA');
    if (filtro === 'cerradas') return filas.filter((f) => f.cerradaEn !== null);
    if (filtro === 'todas') return filas;
    return filas.filter((f) => f.cerradaEn === null);
  }, [filas, filtro]);

  const elegida = filas.find((f) => f.codigo === elegidoCodigo) ?? visibles[0] ?? null;

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex max-w-[104ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Excepciones de seguridad</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            La única forma documentada de avanzar sin cumplir una puerta. Por eso lo que hay que
            vigilar no es que existan, sino{' '}
            <strong className="font-semibold text-secondary">que se cierren</strong>.
          </p>
        </div>
        <button
          onClick={() => setCreando((v) => !v)}
          className="ml-auto flex-none rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {creando ? 'Cerrar' : 'Nueva excepción'}
        </button>
      </div>

      {aviso && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-12 leading-relaxed [text-wrap:pretty]"
          style={{
            background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
            color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
          }}
        >
          {aviso.texto}
        </p>
      )}

      {creando && <FormularioExcepcion sistemas={sistemas} personas={personas} setAviso={setAviso} />}

      {/* El número grande es el de vencidas. Un tablero que celebra «12 excepciones» no
          dice nada; uno que dice «3 vencidas» dice todo. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { n: cuenta.vencidas, etiqueta: 'vencidas y sin cerrar · hallazgo', estado: 'VENCIDA' as const },
          { n: cuenta.porVencer, etiqueta: `vencen dentro de ${diasAviso} días`, estado: 'POR_VENCER' as const },
          { n: cuenta.abiertas, etiqueta: 'abiertas en total', estado: 'VIGENTE' as const },
        ].map((t) => {
          const c = COLOR[t.estado];
          return (
            <span
              key={t.etiqueta}
              className="flex flex-col gap-1.5 rounded-tarjeta px-4 py-3.5"
              style={{ background: c.fondo, border: `1px solid ${c.borde}` }}
            >
              <span className="font-mono text-24 font-semibold leading-none tabular-nums" style={{ color: c.texto }}>
                {t.n}
              </span>
              <span className="text-11_5" style={{ color: c.texto }}>
                {t.etiqueta}
              </span>
            </span>
          );
        })}
      </div>

      <nav className="mt-4 flex flex-wrap items-center gap-2">
        {[
          { id: 'abiertas', etiqueta: 'Abiertas', n: cuenta.abiertas },
          { id: 'vencidas', etiqueta: 'Vencidas', n: cuenta.vencidas },
          { id: 'cerradas', etiqueta: 'Cerradas', n: cuenta.cerradas },
          { id: 'todas', etiqueta: 'Todas', n: cuenta.todas },
        ].map((x) => {
          const activo = filtro === x.id;
          return (
            <button
              key={x.id}
              onClick={() =>
                router.push(x.id === 'abiertas' ? '/tecnologia/excepciones' : `/tecnologia/excepciones?f=${x.id}`)
              }
              aria-pressed={activo}
              className="inline-flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-11_5"
              style={{
                background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                border: `1px solid ${activo ? 'var(--hf-brand-200, #d3dceb)' : 'var(--hf-border-field)'}`,
                color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                fontWeight: activo ? 600 : 500,
              }}
            >
              {x.etiqueta}
              <span className="font-mono text-10 opacity-60">{x.n}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-4 flex flex-col gap-4 xl:flex-row">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {visibles.map((f) => {
              const c = COLOR[f.estado];
              const activa = elegida?.codigo === f.codigo;
              return (
                <button
                  key={f.codigo}
                  onClick={() =>
                    router.push(
                      `/tecnologia/excepciones?e=${f.codigo}${filtro !== 'abiertas' ? `&f=${filtro}` : ''}`,
                    )
                  }
                  aria-pressed={activa}
                  className="mb-1 flex w-full items-stretch gap-3 rounded-campo px-3 py-2.5 text-left"
                  style={{
                    background: activa ? 'var(--hf-brand-100)' : 'transparent',
                    border: `1px solid ${activa ? 'var(--hf-brand-200, #d3dceb)' : 'transparent'}`,
                  }}
                >
                  <span className="w-1 flex-none rounded-full" style={{ background: c.texto }} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-9_5 font-semibold text-accent">{f.codigo}</span>
                      {f.puerta !== null && (
                        <span className="rounded-[4px] bg-subtle px-1.5 py-0.5 font-mono text-8 font-semibold text-muted">
                          {f.puerta}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-10_5 text-muted">{f.sistema}</span>
                    </span>
                    <span className="line-clamp-2 text-12 leading-snug text-primary">{f.justificacion}</span>
                  </span>
                  <span className="flex flex-none flex-col items-end gap-0.5">
                    <span className="font-mono text-10_5 font-semibold" style={{ color: c.texto }}>
                      {textoDePlazo(f)}
                    </span>
                    <span className="font-mono text-8_5 text-faint">cierre {f.fechaCierre}</span>
                  </span>
                </button>
              );
            })}
            {visibles.length === 0 && (
              <p className="px-3 py-10 text-center text-12 text-muted [text-wrap:pretty]">
                {filas.length === 0
                  ? 'Ninguna excepción registrada. Que no haya excepciones es la mejor noticia posible de esta pantalla.'
                  : 'Ninguna con este filtro.'}
              </p>
            )}
          </div>
          <p className="border-t border-hairline bg-subtle px-4 py-3 text-10_5 leading-relaxed text-secondary [text-wrap:pretty]">
            <strong className="font-semibold">
              Toda excepción nace con fecha de cierre; sin ella no se guarda.
            </strong>{' '}
            Una excepción sin fecha es una exención permanente disfrazada, y es exactamente lo
            que un auditor busca cuando pregunta cómo se autorizó saltarse un control.
          </p>
        </section>

        {elegida !== null && <Ficha f={elegida} setAviso={setAviso} />}
      </div>
    </main>
  );
}

function Ficha({
  f,
  setAviso,
}: {
  f: ExcepcionFila;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [cerrando, setCerrando] = useState(false);
  const [prorrogando, setProrrogando] = useState(false);
  const [nota, setNota] = useState('');
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const c = COLOR[f.estado];

  return (
    <aside className="flex w-full flex-none flex-col gap-3 xl:w-[400px]">
      <section
        className="flex flex-col gap-2.5 rounded-tarjeta bg-surface px-4 py-3.5"
        style={{ border: `1px solid ${c.borde}` }}
      >
        <span className="flex items-center gap-2.5">
          <span className="font-mono text-11 font-semibold text-accent">{f.codigo}</span>
          <span
            className="ml-auto rounded-[4px] px-2 py-0.5 font-mono text-8_5 font-semibold uppercase tracking-[0.06em]"
            style={{ background: c.fondo, color: c.texto }}
          >
            {ETIQUETA_ESTADO_EXCEPCION[f.estado]}
          </span>
        </span>
        <span className="text-13 font-semibold leading-snug text-primary">{f.justificacion}</span>
        <span className="font-mono text-9_5 text-muted">
          {f.sistema}
          {f.puerta !== null && ` · ${ETIQUETA_PUERTA[f.puerta]}`}
        </span>
      </section>

      <section className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
        <Rotulo texto="Evaluación del riesgo" />
        <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
          {f.evaluacionRiesgo}
        </span>
      </section>

      <section className="flex flex-col gap-2.5 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
        <Rotulo texto="Autorización y plazo" />
        <div className="grid grid-cols-2 gap-2.5">
          <Dato etiqueta="Aprobada por" valor={f.aprobadaPor ?? 'sin registrar'} />
          <Dato etiqueta="Fecha de aprobación" valor={f.fechaAprobacion} />
          <Dato etiqueta="Cierre comprometido" valor={f.fechaCierre} color={c.texto} />
          <Dato etiqueta="Plazo" valor={textoDePlazo(f)} color={c.texto} />
        </div>

        {f.cerradaEn !== null ? (
          <p
            className="rounded-campo px-3 py-2.5 text-10_5 leading-relaxed [text-wrap:pretty]"
            style={
              f.cerradaTarde
                ? { background: '#fff3e6', border: '1px solid #f2b473', color: '#8a4407' }
                : { background: '#e6efe9', border: '1px solid #c9e3d8', color: '#0b5c44' }
            }
          >
            Cerrada el {f.cerradaEn} por {f.cerradaPor ?? 'sin autor'}
            {/* Cerrada tarde no cambia el estado —cerrada es cerrada— pero se dice: es el
                dato que un auditor busca cuando pregunta si el compromiso se cumplió. */}
            {f.cerradaTarde && ', después de la fecha comprometida'}.{' '}
            {f.notaCierre !== null && f.notaCierre}
          </p>
        ) : (
          <p
            className="rounded-campo px-3 py-2.5 text-10_5 leading-relaxed [text-wrap:pretty]"
            style={{ background: c.fondo, border: `1px solid ${c.borde}`, color: c.texto }}
          >
            {f.estado === 'VENCIDA'
              ? 'La fecha comprometida pasó y la excepción sigue abierta. Es un hallazgo: el control se saltó y el compromiso de volver a cumplirlo no se honró.'
              : f.estado === 'POR_VENCER'
                ? 'Se acerca la fecha comprometida. Cerrarla o prorrogarla con motivo son las dos salidas; dejarla vencer no es una de ellas.'
                : 'Dentro del plazo comprometido.'}
          </p>
        )}
      </section>

      {f.cerradaEn === null && (
        <section className="flex flex-col gap-2.5 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
          {!cerrando && !prorrogando && (
            <div className="flex gap-2">
              <button
                onClick={() => setCerrando(true)}
                className="flex-1 rounded-campo px-3 py-2 text-12 font-semibold text-white"
                style={{ background: 'var(--hf-brand-nav)' }}
              >
                Cerrar la excepción
              </button>
              <button
                onClick={() => setProrrogando(true)}
                className="flex-none rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12 text-muted"
              >
                Prorrogar
              </button>
            </div>
          )}

          {cerrando && (
            <>
              <label className="flex flex-col gap-1">
                <span className="etiqueta-campo">Cómo se resolvió · obligatorio</span>
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  rows={2}
                  className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
                  placeholder="Una excepción cerrada sin nota no explica nada."
                />
              </label>
              <div className="flex gap-2">
                <button
                  disabled={enviando || nota.trim().length < 10}
                  onClick={async () => {
                    setEnviando(true);
                    const r = await cerrarExcepcion(f.codigo, nota);
                    setEnviando(false);
                    setAviso({ ok: r.ok, texto: r.mensaje });
                    if (r.ok) setTimeout(() => window.location.reload(), 1200);
                  }}
                  className="rounded-campo px-3.5 py-2 text-12 font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--hf-brand-nav)' }}
                >
                  {enviando ? 'Cerrando…' : 'Cerrar'}
                </button>
                <button onClick={() => setCerrando(false)} className="px-2 py-2 text-12 text-muted">
                  Cancelar
                </button>
              </div>
              {f.estado === 'VENCIDA' && (
                <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                  Se puede cerrar aunque esté vencida: el hecho es que ya no está abierta.
                  Impedirlo la dejaría abierta para siempre, que es lo contrario de lo que se
                  busca — y que se cerró tarde queda a la vista.
                </span>
              )}
            </>
          )}

          {prorrogando && (
            <>
              <label className="flex flex-col gap-1">
                <span className="etiqueta-campo">Nueva fecha de cierre</span>
                <input
                  type="date"
                  value={nuevaFecha}
                  onChange={(e) => setNuevaFecha(e.target.value)}
                  className="entrada-campo"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="etiqueta-campo">Motivo · obligatorio</span>
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  rows={2}
                  className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
                  placeholder="Una prórroga sin motivo es una exención a plazos."
                />
              </label>
              <div className="flex gap-2">
                <button
                  disabled={enviando || nuevaFecha === '' || nota.trim().length < 10}
                  onClick={async () => {
                    setEnviando(true);
                    const r = await prorrogarExcepcion(
                      f.codigo,
                      new Date(`${nuevaFecha}T00:00:00.000Z`),
                      nota,
                    );
                    setEnviando(false);
                    setAviso({ ok: r.ok, texto: r.mensaje });
                    if (r.ok) setTimeout(() => window.location.reload(), 1200);
                  }}
                  className="rounded-campo px-3.5 py-2 text-12 font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--hf-brand-nav)' }}
                >
                  {enviando ? 'Guardando…' : 'Prorrogar'}
                </button>
                <button onClick={() => setProrrogando(false)} className="px-2 py-2 text-12 text-muted">
                  Cancelar
                </button>
              </div>
              <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                Las dos fechas quedan en bitácora. Una prórroga silenciosa convierte la
                excepción en la exención permanente que la fecha de cierre existe para
                impedir, sólo que a plazos.
              </span>
            </>
          )}
        </section>
      )}
    </aside>
  );
}

function FormularioExcepcion({
  sistemas,
  personas,
  setAviso,
}: {
  sistemas: { id: number; etiqueta: string }[];
  personas: { id: number; nombre: string }[];
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [sistemaId, setSistemaId] = useState('');
  const [puerta, setPuerta] = useState<string>('');
  const [justificacion, setJustificacion] = useState('');
  const [riesgo, setRiesgo] = useState('');
  const [aprobacion, setAprobacion] = useState(new Date().toISOString().slice(0, 10));
  const [cierre, setCierre] = useState('');
  const [aprobadaPorId, setAprobadaPorId] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (sistemas.length === 0) {
    return (
      <p
        className="mt-4 rounded-tarjeta px-4 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
        style={{ background: 'var(--hf-bg-subtle)', border: '1px solid var(--hf-border-field)', color: 'var(--hf-text-muted)' }}
      >
        No hay sistemas registrados todavía. Una excepción es siempre de un sistema y de una
        puerta, así que primero hay que abrir la hoja de vida.
      </p>
    );
  }

  return (
    <section className="mt-4 flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
      <Rotulo texto="Nueva excepción" />
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Sistema</span>
          <select value={sistemaId} onChange={(e) => setSistemaId(e.target.value)} className="entrada-campo">
            <option value="">Elegir</option>
            {sistemas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Puerta · opcional</span>
          <select value={puerta} onChange={(e) => setPuerta(e.target.value)} className="entrada-campo">
            <option value="">Sin puerta específica</option>
            {PUERTAS.map((p) => (
              <option key={p} value={p}>
                {ETIQUETA_PUERTA[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Justificación · obligatoria</span>
        <textarea
          value={justificacion}
          onChange={(e) => setJustificacion(e.target.value)}
          rows={2}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
          placeholder="Es lo que un auditor va a leer primero."
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Evaluación del riesgo · obligatoria</span>
        <textarea
          value={riesgo}
          onChange={(e) => setRiesgo(e.target.value)}
          rows={2}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
          placeholder="Avanzar sin cumplir exige decir qué se arriesga."
        />
      </label>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Fecha de aprobación</span>
          <input type="date" value={aprobacion} onChange={(e) => setAprobacion(e.target.value)} className="entrada-campo" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Fecha de cierre · OBLIGATORIA</span>
          <input type="date" value={cierre} onChange={(e) => setCierre(e.target.value)} className="entrada-campo" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Aprobada por</span>
          <select
            value={aprobadaPorId}
            onChange={(e) => setAprobadaPorId(e.target.value)}
            className="entrada-campo"
          >
            <option value="">Elegir</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
        Sin fecha de cierre no se guarda. Una excepción sin ella es una exención permanente
        disfrazada.
      </span>
      <button
        disabled={
          enviando ||
          sistemaId === '' ||
          cierre === '' ||
          justificacion.trim().length < 15 ||
          riesgo.trim().length < 15
        }
        onClick={async () => {
          setEnviando(true);
          const r = await crearExcepcion({
            sistemaId: Number(sistemaId),
            puerta: puerta === '' ? undefined : (puerta as Puerta),
            justificacion,
            evaluacionRiesgo: riesgo,
            fechaAprobacion: new Date(`${aprobacion}T00:00:00.000Z`),
            fechaCierre: new Date(`${cierre}T00:00:00.000Z`),
            aprobadaPorId: aprobadaPorId === '' ? undefined : Number(aprobadaPorId),
          });
          setEnviando(false);
          setAviso({ ok: r.ok, texto: r.mensaje });
          if (r.ok) setTimeout(() => window.location.reload(), 1300);
        }}
        className="self-start rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        {enviando ? 'Abriendo…' : 'Abrir la excepción'}
      </button>
    </section>
  );
}

function Dato({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="etiqueta-campo">{etiqueta}</span>
      <span className="text-11_5" style={{ color: color ?? 'var(--hf-text-primary)' }}>
        {valor}
      </span>
    </span>
  );
}

function Rotulo({ texto }: { texto: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex-none font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
        {texto}
      </span>
      <span className="h-px flex-1 bg-hairline" />
    </span>
  );
}
