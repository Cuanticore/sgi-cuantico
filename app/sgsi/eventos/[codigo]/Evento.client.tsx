'use client';

// app/sgsi/eventos/[codigo]/Evento.client.tsx
//
// Las cuatro etapas del evento. Tres cosas que esta pantalla tiene que sostener:
//
// **O15 · la descripción original no se edita.** Se muestra en una caja aparte, marcada como
// la versión de quien lo vio. Su valor está en no haber sido corregida por quien evalúa, y
// una pantalla que la dejara editable destruiría eso sin que nadie lo notara.
//
// **O3 · la justificación es obligatoria en los TRES veredictos.** El formulario la pide
// igual si se archiva como falso positivo.
//
// **O5 · la severidad no se captura**: se muestra calculada del mayor de los tres impactos,
// y cambia sola al mover cualquiera de ellos.

import { useState } from 'react';
import { cerrarEvento, evaluarEvento, registrarAccion } from '@/app/sig/acciones/eventos';
import {
  ETIQUETA_DIMENSION,
  ETIQUETA_ESTADO_EVENTO,
  ETIQUETA_NIVEL,
  ETIQUETA_VEREDICTO,
  severidad,
  type DimensionCID,
  type EstadoEvento,
  type Impacto,
  type NivelImpacto,
  type Veredicto,
} from '@/lib/sig/eventos';

const DIMENSIONES: DimensionCID[] = ['CONFIDENCIALIDAD', 'INTEGRIDAD', 'DISPONIBILIDAD'];
const NIVELES: NivelImpacto[] = ['NINGUNO', 'BAJO', 'MEDIO', 'ALTO'];
const FASES = ['DETECCION', 'EVALUACION', 'CONTENCION', 'COMUNICACION', 'ERRADICACION', 'RECUPERACION'];

const COLOR_SEVERIDAD: Record<NivelImpacto, { fondo: string; texto: string }> = {
  NINGUNO: { fondo: 'var(--hf-bg-subtle)', texto: 'var(--hf-text-muted)' },
  BAJO: { fondo: '#e6efe9', texto: '#0b5c44' },
  MEDIO: { fondo: '#faf1d3', texto: '#6b5410' },
  ALTO: { fondo: '#fdeeeb', texto: '#a52016' },
};

export interface EventoFicha {
  codigo: string;
  descripcion: string;
  fechaOcurrencia: string;
  enCurso: boolean;
  donde: string | null;
  otrosEnterados: string | null;
  reportadoPor: string;
  creadoEn: string;
  veredicto: Veredicto | null;
  justificacion: string | null;
  evaluadoPor: string | null;
  fechaEvaluacion: string | null;
  motivacion: string | null;
  causaRaiz: string | null;
  leccionAprendida: string | null;
  costoRecuperacion: number | null;
  costoImpacto: number | null;
  fechaCierre: string | null;
  cerradoPor: string | null;
  estado: EstadoEvento;
  severidad: NivelImpacto | null;
  horasHastaEvaluar: number | null;
  correspondeHallazgo: boolean;
}

export default function EventoClient({
  evento,
  impactos,
  categoriasElegidas,
  activosAfectados,
  acciones,
  catalogos,
}: {
  evento: EventoFicha;
  impactos: Impacto[];
  categoriasElegidas: number[];
  activosAfectados: { id: number; etiqueta: string }[];
  acciones: { id: number; fase: string; momento: string; texto: string; autor: string | null }[];
  catalogos: {
    categorias: { id: number; nombre: string }[];
    motivaciones: { id: number; nombre: string }[];
    activos: { id: number; etiqueta: string }[];
  };
}) {
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const yaEvaluado = evento.veredicto !== null;
  const esIncidente = evento.veredicto === 'INCIDENTE';
  const cerrado = evento.fechaCierre !== null;

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2.5">
            <h1 className="titulo-pagina">{evento.codigo}</h1>
            <Chip texto={ETIQUETA_ESTADO_EVENTO[evento.estado]} />
            {evento.severidad !== null && (
              <Chip
                texto={`Severidad ${ETIQUETA_NIVEL[evento.severidad]}`}
                fondo={COLOR_SEVERIDAD[evento.severidad].fondo}
                color={COLOR_SEVERIDAD[evento.severidad].texto}
              />
            )}
            {evento.enCurso && !cerrado && (
              <Chip texto="sigue ocurriendo" fondo="#fdeeeb" color="#a52016" />
            )}
          </span>
          <p className="text-12_5 text-muted">
            Ocurrió el {evento.fechaOcurrencia} · {evento.donde ?? 'sin lugar'} · reportado por{' '}
            {evento.reportadoPor} el {evento.creadoEn}
            {evento.horasHastaEvaluar !== null && ` · evaluado en ${evento.horasHastaEvaluar} h`}
          </p>
        </div>
      </header>

      {aviso && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-12 [text-wrap:pretty]"
          style={{
            background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
            color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
          }}
        >
          {aviso.texto}
        </p>
      )}

      {/* O15 · la descripción original, en su propia caja y marcada como tal. */}
      <section className="mt-4 rounded-tarjeta border border-border-field bg-subtle px-4 py-3">
        <span className="flex items-center gap-2.5">
          <span className="font-mono text-9 font-medium uppercase tracking-[0.07em] text-accent">
            Lo que reportó quien lo vio
          </span>
          <span className="h-px flex-1 bg-hairline" />
          <span className="font-mono text-9 text-muted">no se edita</span>
        </span>
        <p className="mt-1.5 text-12_5 leading-relaxed text-primary [text-wrap:pretty]">
          {evento.descripcion}
        </p>
        {evento.otrosEnterados !== null && (
          <p className="mt-1 text-11 text-muted">También lo sabe: {evento.otrosEnterados}</p>
        )}
        <p className="mt-1.5 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
          Es la versión de quien lo vio, y su valor está en no haber sido corregida por quien
          evalúa.
        </p>
      </section>

      <div className="mt-5 flex flex-col gap-4">
        <Etapa n={1} titulo="Evaluación" hecha={yaEvaluado}>
          {yaEvaluado ? (
            <div className="flex flex-col gap-1">
              <span className="text-12_5 text-primary">
                {ETIQUETA_VEREDICTO[evento.veredicto as Veredicto]} · {evento.evaluadoPor ?? 'sin autor'} ·{' '}
                {evento.fechaEvaluacion}
              </span>
              <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
                {evento.justificacion}
              </span>
            </div>
          ) : (
            <FormularioEvaluacion
              codigo={evento.codigo}
              catalogos={catalogos}
              setAviso={setAviso}
            />
          )}
        </Etapa>

        <Etapa
          n={2}
          titulo="Clasificación"
          hecha={impactos.length > 0}
          atenuada={yaEvaluado && !esIncidente}
          nota={
            yaEvaluado && !esIncidente
              ? 'No aplica: el evento se archivó en la evaluación. Sólo un incidente abre el ciclo completo (O4).'
              : null
          }
        >
          {impactos.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-3">
                {DIMENSIONES.map((d) => {
                  const i = impactos.find((x) => x.dimension === d);
                  const nivel = i?.nivel ?? 'NINGUNO';
                  return (
                    <span key={d} className="flex items-center gap-1.5">
                      <span className="text-11 text-muted">{ETIQUETA_DIMENSION[d]}</span>
                      <Chip
                        texto={ETIQUETA_NIVEL[nivel]}
                        fondo={COLOR_SEVERIDAD[nivel].fondo}
                        color={COLOR_SEVERIDAD[nivel].texto}
                      />
                    </span>
                  );
                })}
              </div>
              {/* La severidad no se captura: se muestra calculada, con la regla a la vista. */}
              <p className="text-10_5 text-muted">
                La severidad es el mayor de los tres: {ETIQUETA_NIVEL[severidad(impactos) ?? 'NINGUNO']}.
                Una sola dimensión en alto basta.
              </p>
              {activosAfectados.length > 0 && (
                <p className="text-11_5 text-secondary">
                  Activos afectados: {activosAfectados.map((a) => a.etiqueta).join(' · ')}
                </p>
              )}
              {evento.motivacion !== null && (
                <p className="text-11_5 text-secondary">Motivación: {evento.motivacion}</p>
              )}
              {catalogos.motivaciones.length === 0 && (
                <p className="text-10_5 text-muted [text-wrap:pretty]">
                  El catálogo de motivaciones está vacío: la spec lo declara y ninguna fuente
                  dice cuáles son sus valores, así que no se inventaron.
                </p>
              )}
            </div>
          ) : (
            <p className="text-11_5 text-muted">
              {yaEvaluado && !esIncidente ? '—' : 'Sin clasificar todavía.'}
            </p>
          )}
        </Etapa>

        <Etapa
          n={3}
          titulo="Tratamiento"
          hecha={acciones.length > 0}
          atenuada={yaEvaluado && !esIncidente}
        >
          {acciones.length === 0 ? (
            <p className="text-11_5 text-muted">Sin acciones registradas.</p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {acciones.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-2 border-t border-hairline pt-1.5 first:border-t-0 first:pt-0">
                  <span className="font-mono text-9 font-semibold uppercase tracking-[0.06em] text-accent">
                    {a.fase}
                  </span>
                  <span className="font-mono text-10 text-muted">{a.momento}</span>
                  <span className="min-w-0 flex-1 text-11_5 text-secondary [text-wrap:pretty]">{a.texto}</span>
                  {a.autor !== null && <span className="text-10 text-faint">{a.autor}</span>}
                </li>
              ))}
            </ol>
          )}
          {esIncidente && !cerrado && (
            <FormularioAccion codigo={evento.codigo} setAviso={setAviso} />
          )}
        </Etapa>

        <Etapa n={4} titulo="Cierre y lección" hecha={cerrado} atenuada={yaEvaluado && !esIncidente}>
          {cerrado ? (
            <div className="flex flex-col gap-1">
              <span className="text-11_5 text-muted">
                Cerrado el {evento.fechaCierre} por {evento.cerradoPor ?? 'sin autor'}
              </span>
              <span className="text-12_5 leading-relaxed text-primary [text-wrap:pretty]">
                {evento.leccionAprendida}
              </span>
              {evento.causaRaiz !== null && (
                <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
                  Causa raíz: {evento.causaRaiz}
                </span>
              )}
              {/* Cero es un dato: dice que se contuvo. Por eso se distingue de «sin calcular». */}
              <span className="font-mono text-10_5 text-muted">
                Recuperación:{' '}
                {evento.costoRecuperacion === null ? 'sin calcular' : `$${evento.costoRecuperacion}`} ·
                Impacto: {evento.costoImpacto === null ? 'sin calcular' : `$${evento.costoImpacto}`}
              </span>
            </div>
          ) : esIncidente ? (
            <FormularioCierre
              codigo={evento.codigo}
              exigeCausaRaiz={evento.severidad === 'ALTO'}
              correspondeHallazgo={evento.correspondeHallazgo}
              setAviso={setAviso}
            />
          ) : (
            <p className="text-11_5 text-muted">
              {yaEvaluado
                ? 'Un archivado no se cierra: ya quedó archivado al evaluar.'
                : 'Primero hay que evaluar.'}
            </p>
          )}
        </Etapa>
      </div>
    </main>
  );
}

function FormularioEvaluacion({
  codigo,
  catalogos,
  setAviso,
}: {
  codigo: string;
  catalogos: { categorias: { id: number; nombre: string }[]; motivaciones: { id: number; nombre: string }[]; activos: { id: number; etiqueta: string }[] };
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [veredicto, setVeredicto] = useState<Veredicto | ''>('');
  const [justificacion, setJustificacion] = useState('');
  const [cats, setCats] = useState<number[]>([]);
  const [niveles, setNiveles] = useState<Record<DimensionCID, NivelImpacto>>({
    CONFIDENCIALIDAD: 'NINGUNO',
    INTEGRIDAD: 'NINGUNO',
    DISPONIBILIDAD: 'NINGUNO',
  });
  const [activos, setActivos] = useState<number[]>([]);
  const [enviando, setEnviando] = useState(false);

  const esIncidente = veredicto === 'INCIDENTE';
  const impactos: Impacto[] = DIMENSIONES.map((d) => ({ dimension: d, nivel: niveles[d] }));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {(['INCIDENTE', 'OBSERVACION', 'FALSO_POSITIVO'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVeredicto(v)}
            aria-pressed={veredicto === v}
            className="rounded-chip px-3.5 py-1.5 text-12"
            style={{
              background: veredicto === v ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: veredicto === v ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
              fontWeight: veredicto === v ? 600 : 500,
            }}
          >
            {ETIQUETA_VEREDICTO[v]}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Justificación · obligatoria en los tres</span>
        <textarea
          value={justificacion}
          onChange={(e) => setJustificacion(e.target.value)}
          rows={2}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
          placeholder="Archivar como falso positivo sin decir por qué es peor que no evaluar."
        />
      </label>

      {esIncidente && (
        <>
          <div className="flex flex-col gap-1">
            <span className="etiqueta-campo">Categorías</span>
            <div className="flex flex-wrap gap-1.5">
              {catalogos.categorias.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCats((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                  className="rounded-chip px-2.5 py-1 text-11"
                  style={{
                    background: cats.includes(c.id) ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    color: cats.includes(c.id) ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                    border: '1px solid var(--hf-border-field)',
                  }}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="etiqueta-campo">Impacto en C · I · D</span>
            {DIMENSIONES.map((d) => (
              <div key={d} className="flex items-center gap-2">
                <span className="w-[130px] flex-none text-11 text-muted">{ETIQUETA_DIMENSION[d]}</span>
                {NIVELES.map((n) => (
                  <button
                    key={n}
                    onClick={() => setNiveles((s) => ({ ...s, [d]: n }))}
                    className="rounded-chip px-2 py-0.5 text-10_5"
                    style={{
                      background: niveles[d] === n ? COLOR_SEVERIDAD[n].fondo : 'transparent',
                      color: niveles[d] === n ? COLOR_SEVERIDAD[n].texto : 'var(--hf-text-secondary-soft)',
                      border: '1px solid var(--hf-border-field)',
                      fontWeight: niveles[d] === n ? 600 : 500,
                    }}
                  >
                    {ETIQUETA_NIVEL[n]}
                  </button>
                ))}
              </div>
            ))}
            {/* La severidad se recalcula sola: no hay campo que capturarla. */}
            <span className="text-10_5 text-muted">
              Severidad resultante: <strong>{ETIQUETA_NIVEL[severidad(impactos) ?? 'NINGUNO']}</strong> —
              el mayor de los tres, nunca se captura.
            </span>
          </div>

          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Activos afectados · opcional</span>
            <select
              multiple
              value={activos.map(String)}
              onChange={(e) => setActivos([...e.target.selectedOptions].map((o) => Number(o.value)))}
              className="entrada-campo h-[92px]"
            >
              {catalogos.activos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <button
        disabled={veredicto === '' || justificacion.trim().length < 10 || enviando}
        onClick={async () => {
          setEnviando(true);
          const r = await evaluarEvento(codigo, {
            veredicto: veredicto as Veredicto,
            justificacion,
            categorias: esIncidente ? cats : undefined,
            impactos: esIncidente ? impactos : undefined,
            activos: esIncidente ? activos : undefined,
          });
          setEnviando(false);
          setAviso({ ok: r.ok, texto: r.mensaje });
          if (r.ok) setTimeout(() => window.location.reload(), 1200);
        }}
        className="self-start rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        {enviando ? 'Guardando…' : 'Guardar la evaluación'}
      </button>
    </div>
  );
}

function FormularioAccion({
  codigo,
  setAviso,
}: {
  codigo: string;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [fase, setFase] = useState('CONTENCION');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-hairline pt-2.5">
      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Fase</span>
        <select value={fase} onChange={(e) => setFase(e.target.value)} className="entrada-campo">
          {FASES.map((f) => (
            <option key={f} value={f}>
              {f.charAt(0) + f.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[240px] flex-1 flex-col gap-1">
        <span className="etiqueta-campo">Qué se hizo</span>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} className="entrada-campo" />
      </label>
      <button
        disabled={texto.trim().length < 5 || enviando}
        onClick={async () => {
          setEnviando(true);
          const r = await registrarAccion(codigo, { fase, momento: new Date(), texto });
          setEnviando(false);
          setAviso({ ok: r.ok, texto: r.mensaje });
          if (r.ok) setTimeout(() => window.location.reload(), 900);
        }}
        className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12 font-medium text-secondary disabled:opacity-50"
      >
        Agregar
      </button>
    </div>
  );
}

function FormularioCierre({
  codigo,
  exigeCausaRaiz,
  correspondeHallazgo,
  setAviso,
}: {
  codigo: string;
  exigeCausaRaiz: boolean;
  correspondeHallazgo: boolean;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [leccion, setLeccion] = useState('');
  const [causa, setCausa] = useState('');
  const [recuperacion, setRecuperacion] = useState('');
  const [impacto, setImpacto] = useState('');
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Lección aprendida · obligatoria (A.5.27)</span>
        <textarea
          value={leccion}
          onChange={(e) => setLeccion(e.target.value)}
          rows={2}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
          placeholder="Es la única forma de que el mecanismo produzca aprendizaje en vez de archivo."
        />
      </label>

      {exigeCausaRaiz && (
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Análisis de causa raíz · obligatorio con impacto alto</span>
          <textarea
            value={causa}
            onChange={(e) => setCausa(e.target.value)}
            rows={2}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5"
          />
        </label>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Costo de recuperación · opcional</span>
          <input
            type="number"
            value={recuperacion}
            onChange={(e) => setRecuperacion(e.target.value)}
            className="entrada-campo"
            placeholder="cero también es un dato"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Costo del impacto · opcional</span>
          <input
            type="number"
            value={impacto}
            onChange={(e) => setImpacto(e.target.value)}
            className="entrada-campo"
            placeholder="cero dice que se contuvo"
          />
        </label>
      </div>

      {correspondeHallazgo && (
        <p
          className="rounded-campo px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
        >
          Con impacto alto, el análisis de causa raíz se levanta como{' '}
          <strong className="font-semibold">hallazgo en Mejora</strong> con método declarado. El
          hallazgo no vive en el incidente: vive allá, con su origen apuntando acá (O8).
        </p>
      )}

      <button
        disabled={leccion.trim().length < 10 || (exigeCausaRaiz && causa.trim().length < 10) || enviando}
        onClick={async () => {
          setEnviando(true);
          const r = await cerrarEvento(codigo, {
            leccionAprendida: leccion,
            causaRaiz: causa || undefined,
            // Cero se manda como cero; vacío se manda como `undefined`, que deja el nulo.
            costoRecuperacion: recuperacion === '' ? undefined : Number(recuperacion),
            costoImpacto: impacto === '' ? undefined : Number(impacto),
          });
          setEnviando(false);
          setAviso({ ok: r.ok, texto: r.mensaje });
          if (r.ok) setTimeout(() => window.location.reload(), 1200);
        }}
        className="self-start rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        {enviando ? 'Cerrando…' : 'Cerrar el incidente'}
      </button>
    </div>
  );
}

function Etapa({
  n,
  titulo,
  hecha,
  atenuada,
  nota,
  children,
}: {
  n: number;
  titulo: string;
  hecha: boolean;
  atenuada?: boolean;
  nota?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-tarjeta border bg-surface px-4 py-3"
      style={{
        borderColor: hecha ? 'var(--hf-accent-500)' : 'var(--hf-border-field)',
        opacity: atenuada ? 0.55 : 1,
      }}
    >
      <span className="flex items-center gap-2">
        <span
          className="flex h-[19px] w-[19px] flex-none items-center justify-center rounded-full font-mono text-9_5 font-bold"
          style={
            hecha
              ? { background: 'var(--hf-accent-500)', color: '#ffffff' }
              : { background: 'var(--hf-bg-subtle)', color: 'var(--hf-text-muted)' }
          }
        >
          {hecha ? '✓' : n}
        </span>
        <span className="text-12_5 font-semibold text-primary">{titulo}</span>
      </span>
      {nota != null && (
        <p className="mt-1 text-10_5 leading-relaxed text-muted [text-wrap:pretty]">{nota}</p>
      )}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Chip({ texto, fondo, color }: { texto: string; fondo?: string; color?: string }) {
  return (
    <span
      className="flex-none rounded-[4px] px-2 py-0.5 font-mono text-9 font-semibold uppercase"
      style={{
        background: fondo ?? 'var(--hf-bg-subtle)',
        color: color ?? 'var(--hf-text-muted)',
      }}
    >
      {texto}
    </span>
  );
}
