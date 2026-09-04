'use client';

// app/sig/plazos/Plazos.client.tsx
//
// **Cambiar un plazo no es gratis**, y la pantalla lo dice antes de que alguien lo cambie:
// los plazos vigentes al abrir un hallazgo se congelan en él. Bajar el de «NC mayor» de
// treinta a diez días no vuelve vencidos de golpe a los que ya estaban abiertos.
//
// Es el mismo principio que hace verificable un acuse de lectura: el registro conserva la
// regla con la que se cerró, no la que rige hoy.

import { useState } from 'react';
import { guardarPlazoDeHallazgo, guardarPlazoDeVulnerabilidad } from '@/app/sig/acciones/plazos';

type Tipo = 'NC_MAYOR' | 'NC_MENOR' | 'OBSERVACION' | 'OPORTUNIDAD';

const HALLAZGO: Record<Tipo, { nombre: string; detalle: string; color: string }> = {
  NC_MAYOR: {
    nombre: 'No conformidad mayor',
    detalle: 'Falla del sistema de gestión o incumplimiento legal',
    color: '#a52016',
  },
  NC_MENOR: {
    nombre: 'No conformidad menor',
    detalle: 'Desviación puntual que no compromete el sistema',
    color: '#b8791a',
  },
  OBSERVACION: {
    nombre: 'Observación',
    detalle: 'Desviación potencial, sin incumplimiento actual',
    color: '#0f7a5a',
  },
  OPORTUNIDAD: {
    nombre: 'Oportunidad de mejora',
    detalle: 'No hay incumplimiento; se propone una mejora',
    color: '#6b7570',
  },
};

const VULNERABILIDAD: { clave: string; nombre: string; detalle: string; unidad: string; color: string }[] = [
  {
    clave: 'desarrollo_plazo_critica_horas',
    nombre: 'Crítica',
    detalle: 'Explotable de forma remota sin autenticación, o expone datos personales o credenciales',
    unidad: 'horas',
    color: '#a52016',
  },
  {
    clave: 'desarrollo_plazo_alta_dias',
    nombre: 'Alta',
    detalle: 'Explotable, compromete la confidencialidad o la integridad',
    unidad: 'días',
    color: '#b8791a',
  },
  {
    clave: 'desarrollo_plazo_media_dias',
    nombre: 'Media',
    detalle: 'Impacto acotado o requiere condiciones específicas',
    unidad: 'días',
    color: '#0f7a5a',
  },
  {
    clave: 'desarrollo_plazo_baja_dias',
    nombre: 'Baja',
    detalle: 'Debilidad sin impacto directo demostrable',
    unidad: 'días',
    color: '#6b7570',
  },
];

export interface FilaHallazgo {
  tipo: Tipo;
  diasAnalisis: number | null;
  diasEjecucion: number | null;
  diasVerificacion: number | null;
  actualizado: string | null;
}

export default function PlazosClient({
  pestana,
  hallazgos,
  vulnerabilidades,
}: {
  pestana: string;
  hallazgos: FilaHallazgo[];
  vulnerabilidades: Record<string, string>;
}) {
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [tab, setTab] = useState(pestana === 'vulnerabilidades' ? 'vulnerabilidades' : 'hallazgos');

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex max-w-[100ch] flex-col gap-1.5">
          <h1 className="titulo-pagina">Plazos</h1>
          <p className="text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Los días que tiene cada cosa para resolverse.{' '}
            <strong className="font-semibold text-secondary">Ninguno está en el código</strong>:
            cambiar un plazo no debe requerir un despliegue.
          </p>
        </div>
        <div className="ml-auto flex flex-none gap-1.5">
          {[
            { id: 'hallazgos', etiqueta: 'Hallazgos' },
            { id: 'vulnerabilidades', etiqueta: 'Vulnerabilidades' },
          ].map((x) => {
            const activo = tab === x.id;
            return (
              <button
                key={x.id}
                onClick={() => setTab(x.id)}
                aria-pressed={activo}
                className="rounded-chip px-3.5 py-1.5 text-11_5"
                style={{
                  background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                  border: `1px solid ${activo ? 'var(--hf-brand-200, #d3dceb)' : 'var(--hf-border-field)'}`,
                  color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                  fontWeight: activo ? 600 : 500,
                }}
              >
                {x.etiqueta}
              </button>
            );
          })}
        </div>
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

      <div className="mt-4 flex flex-col gap-3.5 xl:flex-row">
        <section className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
          {tab === 'hallazgos' ? (
            <>
              <Rotulo
                texto="Por tipo de hallazgo"
                derecha="PlazoPorTipoHallazgo"
              />
              <p className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                Tres plazos por tipo: analizar la causa, ejecutar las acciones y verificar la
                eficacia. Todos corren desde la <strong className="font-semibold">clasificación</strong>,
                no desde la detección — hasta que alguien lo clasifica, el hallazgo no consume
                plazo porque nadie sabe todavía qué es.
              </p>
              {hallazgos.map((h) => (
                <FilaDeHallazgo key={h.tipo} h={h} setAviso={setAviso} />
              ))}
            </>
          ) : (
            <>
              <Rotulo texto="Por severidad de vulnerabilidad" derecha="FOR-LCO-05 · exigible por contrato" />
              <p className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
                Corren desde la <strong className="font-semibold">notificación</strong> al
                proveedor, no desde que la encontró el análisis. Son exigibles a todo tercero que
                desarrolle para la organización, durante el contrato y durante la garantía.
              </p>
              {VULNERABILIDAD.map((v) => (
                <FilaDeVulnerabilidad
                  key={v.clave}
                  v={v}
                  valor={vulnerabilidades[v.clave] ?? ''}
                  setAviso={setAviso}
                />
              ))}
              <FilaDeVulnerabilidad
                v={{
                  clave: 'desarrollo_severidad_bloquea',
                  nombre: 'Severidad que bloquea',
                  detalle:
                    'Desde qué severidad una prueba de seguridad bloquea la liberación. Endurecerlo recalcula los veredictos de todas las pruebas sin desplegar.',
                  unidad: '',
                  color: 'var(--hf-brand-nav)',
                }}
                valor={vulnerabilidades['desarrollo_severidad_bloquea'] ?? ''}
                setAviso={setAviso}
                texto
              />
            </>
          )}
        </section>

        <aside className="flex w-full flex-none flex-col gap-3 xl:w-[358px]">
          <section
            className="flex flex-col gap-2 rounded-tarjeta bg-surface px-4 py-3.5"
            style={{ border: '1px solid #f2b473' }}
          >
            <span className="etiqueta-campo" style={{ color: '#8a4407' }}>
              Cambiar un plazo no es gratis
            </span>
            <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
              Los plazos vigentes al momento de abrir un hallazgo{' '}
              <strong className="font-semibold">se congelan en él</strong>. Bajar el plazo de «NC
              mayor» de treinta a diez días no vuelve vencidos de golpe a los que ya estaban
              abiertos.
            </span>
            <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
              Es el mismo principio que hace verificable un acuse de lectura: el registro conserva
              la regla con la que se cerró, no la que rige hoy.
            </span>
          </section>

          <section className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
            <span className="etiqueta-campo text-accent">Una diferencia que importa</span>
            <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
              El plazo de un hallazgo corre desde que{' '}
              <strong className="font-semibold">se clasifica</strong>, no desde que se detecta.
            </span>
            <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
              El de una vulnerabilidad corre desde que{' '}
              <strong className="font-semibold">se notifica al proveedor</strong>, según
              FOR-LCO-05. No desde que la encontró el análisis.
            </span>
            <span className="text-11_5 leading-relaxed text-secondary [text-wrap:pretty]">
              Son dos relojes distintos y el sistema tiene que saber cuál usa cada cosa, o los
              conteos de vencimiento no cuadran con lo que dice el contrato.
            </span>
          </section>

          {/* Lo que esta pantalla encontró al construirse. Va acá y no en un comentario
              porque es información que quien parametriza necesita. */}
          <section className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3.5">
            <span className="etiqueta-campo text-accent">Dónde estaba antes</span>
            {[
              {
                texto:
                  'Los plazos por tipo de hallazgo estaban en el esquema pero la tabla estaba VACÍA: la tarjeta «Días hasta el cierre» de Mejora se dibujaba en blanco y parecía falta de datos.',
                fuente: 'PlazoPorTipoHallazgo · cargado el 04/09/2026',
                color: '#0f7a5a',
              },
              {
                texto:
                  'Los de vulnerabilidad estaban en un anexo contractual y en la cabeza de quien lo negoció.',
                fuente: 'FOR-LCO-05 · cargados con REQ-SIG-08',
                color: '#0f7a5a',
              },
              {
                texto:
                  'Los días de aviso siguen fijándose obligación por obligación, sin un valor por defecto.',
                fuente: 'Obligacion.diasAviso · sigue así',
                color: '#b8791a',
              },
              {
                texto:
                  'El lienzo da UN plazo por tipo (30/60/90/120 d) y el modelo tiene TRES —análisis, ejecución y verificación—. Rige el plan de la fase B, que es el único que encaja con la tabla.',
                fuente: 'divergencia lienzo ↔ plan · para el especificador',
                color: '#a52016',
              },
            ].map((o) => (
              <div
                key={o.fuente}
                className="flex items-start gap-2.5 rounded-campo border border-border-field bg-subtle px-3 py-2"
              >
                <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" style={{ background: o.color }} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-11 leading-relaxed text-secondary [text-wrap:pretty]">{o.texto}</span>
                  <span className="font-mono text-8_5 text-muted">{o.fuente}</span>
                </span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </main>
  );
}

function FilaDeHallazgo({
  h,
  setAviso,
}: {
  h: FilaHallazgo;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const meta = HALLAZGO[h.tipo];
  const [editando, setEditando] = useState(false);
  const [analisis, setAnalisis] = useState(String(h.diasAnalisis ?? ''));
  const [ejecucion, setEjecucion] = useState(String(h.diasEjecucion ?? ''));
  const [verificacion, setVerificacion] = useState(String(h.diasVerificacion ?? ''));
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const sinCargar = h.diasEjecucion === null;

  return (
    <div
      className="flex flex-col gap-2 rounded-campo border border-border-field bg-subtle px-3.5 py-3"
      style={{ borderLeft: `3px solid ${meta.color}` }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-12_5 font-medium text-primary">{meta.nombre}</span>
          <span className="text-10_5 leading-snug text-muted">{meta.detalle}</span>
        </span>
        {sinCargar ? (
          // Sin fila en la tabla el motor no tiene de dónde sacar el plazo. Se dice, en vez
          // de mostrar un cero que parecería un plazo de cero días.
          <span className="flex-none font-mono text-11 font-semibold" style={{ color: '#a52016' }}>
            sin cargar
          </span>
        ) : (
          <span className="flex flex-none items-center gap-1.5">
            {[
              { n: h.diasAnalisis, t: 'análisis' },
              { n: h.diasEjecucion, t: 'ejecución' },
              { n: h.diasVerificacion, t: 'verificación' },
            ].map((x) => (
              <span
                key={x.t}
                title={`Plazo de ${x.t}`}
                className="rounded-campo border border-border-field bg-surface px-2.5 py-1 font-mono text-12 font-semibold"
                style={{ color: meta.color }}
              >
                {x.n} d
              </span>
            ))}
          </span>
        )}
        <span className="w-[104px] flex-none text-right font-mono text-9_5 text-muted">
          desde clasificación
        </span>
        <button
          onClick={() => setEditando((v) => !v)}
          className="flex-none rounded-campo border border-border-field bg-surface px-2.5 py-1 text-11 text-secondary"
        >
          {editando ? 'Cancelar' : 'Cambiar'}
        </button>
      </div>

      {editando && (
        <div className="flex flex-col gap-2 border-t border-hairline pt-2.5">
          <div className="grid gap-2.5 sm:grid-cols-3">
            {[
              { v: analisis, set: setAnalisis, etiqueta: 'Análisis de causa' },
              { v: ejecucion, set: setEjecucion, etiqueta: 'Ejecución de acciones' },
              { v: verificacion, set: setVerificacion, etiqueta: 'Verificación de eficacia' },
            ].map((c) => (
              <label key={c.etiqueta} className="flex flex-col gap-1">
                <span className="etiqueta-campo">{c.etiqueta} · días</span>
                <input
                  type="number"
                  min={1}
                  value={c.v}
                  onChange={(e) => c.set(e.target.value)}
                  className="entrada-campo"
                />
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Por qué cambia · obligatorio</span>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="entrada-campo" />
          </label>
          <button
            disabled={enviando || motivo.trim().length < 10 || analisis === '' || ejecucion === '' || verificacion === ''}
            onClick={async () => {
              setEnviando(true);
              const r = await guardarPlazoDeHallazgo(h.tipo, {
                diasAnalisis: Number(analisis),
                diasEjecucion: Number(ejecucion),
                diasVerificacion: Number(verificacion),
                motivo,
              });
              setEnviando(false);
              setAviso({ ok: r.ok, texto: r.mensaje });
              if (r.ok) setTimeout(() => window.location.reload(), 1300);
            }}
            className="self-start rounded-campo px-3.5 py-2 text-12 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-brand-nav)' }}
          >
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  );
}

function FilaDeVulnerabilidad({
  v,
  valor,
  setAviso,
  texto,
}: {
  v: { clave: string; nombre: string; detalle: string; unidad: string; color: string };
  valor: string;
  setAviso: (a: { ok: boolean; texto: string }) => void;
  texto?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [nuevo, setNuevo] = useState(valor);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Cero en un plazo de vulnerabilidad NO es un error: en «baja» significa «siguiente
  // entrega planificada», que es lo que dice FOR-LCO-05 y no un número de días.
  const sinPlazo = !texto && Number(valor) === 0;

  return (
    <div
      className="flex flex-col gap-2 rounded-campo border border-border-field bg-subtle px-3.5 py-3"
      style={{ borderLeft: `3px solid ${v.color}` }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-12_5 font-medium text-primary">{v.nombre}</span>
          <span className="text-10_5 leading-snug text-muted [text-wrap:pretty]">{v.detalle}</span>
        </span>
        <span
          className="flex-none rounded-campo border border-border-field bg-surface px-2.5 py-1 font-mono text-12 font-semibold"
          style={{ color: v.color }}
          title={sinPlazo ? 'FOR-LCO-05: «siguiente entrega planificada»' : undefined}
        >
          {texto ? valor.toLowerCase() : sinPlazo ? 'sig. entrega' : `${valor} ${v.unidad}`}
        </span>
        <span className="w-[104px] flex-none text-right font-mono text-9_5 text-muted">
          {texto ? '—' : 'desde notificación'}
        </span>
        <button
          onClick={() => setEditando((x) => !x)}
          className="flex-none rounded-campo border border-border-field bg-surface px-2.5 py-1 text-11 text-secondary"
        >
          {editando ? 'Cancelar' : 'Cambiar'}
        </button>
      </div>

      {editando && (
        <div className="flex flex-col gap-2 border-t border-hairline pt-2.5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">{texto ? 'Severidad' : `Plazo en ${v.unidad}`}</span>
              {texto ? (
                <select value={nuevo} onChange={(e) => setNuevo(e.target.value)} className="entrada-campo">
                  {['CRITICOS', 'ALTOS', 'MEDIOS', 'BAJOS'].map((s) => (
                    <option key={s} value={s}>
                      {s.toLowerCase()}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min={0}
                  value={nuevo}
                  onChange={(e) => setNuevo(e.target.value)}
                  className="entrada-campo"
                />
              )}
            </label>
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Por qué cambia · obligatorio</span>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="entrada-campo" />
            </label>
          </div>
          {!texto && (
            <span className="text-10_5 leading-relaxed text-muted [text-wrap:pretty]">
              Cero significa «sin plazo en días»: es lo que FOR-LCO-05 dice de la severidad baja
              —«siguiente entrega planificada»— y no un plazo vencido.
            </span>
          )}
          <button
            disabled={enviando || motivo.trim().length < 10 || nuevo === ''}
            onClick={async () => {
              setEnviando(true);
              const r = await guardarPlazoDeVulnerabilidad(v.clave, nuevo, motivo);
              setEnviando(false);
              setAviso({ ok: r.ok, texto: r.mensaje });
              if (r.ok) setTimeout(() => window.location.reload(), 1300);
            }}
            className="self-start rounded-campo px-3.5 py-2 text-12 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-brand-nav)' }}
          >
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  );
}

function Rotulo({ texto, derecha }: { texto: string; derecha?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex-none font-mono text-9 font-semibold uppercase tracking-[0.07em] text-accent">
        {texto}
      </span>
      <span className="h-px flex-1 bg-hairline" />
      {derecha !== undefined && <span className="flex-none font-mono text-9 text-faint">{derecha}</span>}
    </span>
  );
}
