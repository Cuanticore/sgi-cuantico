'use client';

// app/estrategico/partes/Partes.client.tsx
//
// Chips por tipo, el mapa poder×interés con sus cuadrantes, la grilla de partes y la ficha
// de la necesidad con el seguimiento por año.
//
// La pantalla era un visor. Ahora se puede crear una parte, agregarle necesidades y editar
// el seguimiento del año — las tres acciones existían en el servidor sin nadie que las
// llamara, y `guardarSeguimientoParte` incluso estaba importada acá sin invocarse nunca.
//
// El seguimiento por año es la decisión que el lienzo subraya: en el Excel MAT-EST-02, el
// plan, el seguimiento y la evidencia son TRES COLUMNAS NUEVAS cada año. Acá son un
// registro por año, así que agregar 2027 no obliga a rediseñar nada.

import { useMemo, useState } from 'react';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_RESULTADO,
  ETIQUETA_TIPO_ORGANIZACION,
  type EstadoEvaluacion,
  type ResultadoEvaluacion,
} from '@/lib/sig/organizaciones';
import {
  agregarNecesidad,
  crearParteInteresada,
  guardarSeguimientoParte,
} from '@/app/sig/acciones/estrategico';

type Nivel = 'ALTO' | 'MEDIO' | 'BAJO';

export interface NecesidadFila {
  id: number;
  texto: string;
  clase: string;
  poder: string;
  interes: string;
  riesgoOportunidadTexto: string;
  esRiesgo: boolean;
  esOportunidad: boolean;
  banderas: { sgsi: boolean; clima: boolean; alcance: boolean };
  responsable: string | null;
  seguimiento: { anio: number; planAccion: string; seguimiento: string; evidencia: string }[];
}

export interface ParteFila {
  id: number;
  tipo: 'INTERNA' | 'EXTERNA';
  descripcion: string;
  necesidades: NecesidadFila[];
  organizaciones: OrganizacionFila[];
}

export interface OrganizacionFila {
  id: number;
  nombre: string;
  tipo: string;
  /// Cuantos activos vigentes soporta. Es lo que POL-TEC-02 necesita para saber a cuantos
  /// afecta una reevaluacion que sale mal.
  activos: number;
  /// Los tres se derivan de las evaluaciones registradas, no se guardan.
  estado: EstadoEvaluacion;
  resultado: ResultadoEvaluacion | null;
  proxima: string | null;
}

const TIPO_CHIP: Record<string, { fondo: string; texto: string; etiqueta: string }> = {
  INTERNA: { fondo: '#e9f0fb', texto: '#12437f', etiqueta: 'Interna' },
  EXTERNA: { fondo: '#e8f4ef', texto: '#0b5c44', etiqueta: 'Externa' },
};

/// Las tres banderas de MAT-EST-02, con el color que el lienzo les da. No son adornos:
/// cada una dispara una obligación distinta en otro módulo.
const BANDERAS = [
  {
    clave: 'sgsi' as const,
    etiqueta: 'Requisitos SGSI',
    fondo: '#e9f0fb',
    borde: '#d3dceb',
    texto: '#12437f',
  },
  {
    clave: 'clima' as const,
    etiqueta: 'Cambio climático',
    fondo: '#e8f4ef',
    borde: '#c9e2d6',
    texto: '#0b5c44',
  },
  {
    clave: 'alcance' as const,
    etiqueta: 'Cambia el alcance',
    fondo: '#fff3e6',
    borde: '#f2b473',
    texto: '#8a4407',
  },
];

const NIVELES: Nivel[] = ['ALTO', 'MEDIO', 'BAJO'];

export default function PartesClient({
  filas,
  personas,
  anioActual,
}: {
  filas: ParteFila[];
  personas: { id: number; nombre: string }[];
  anioActual: number;
}) {
  const [filtro, setFiltro] = useState<'todas' | 'INTERNA' | 'EXTERNA'>('todas');
  const [seleccion, setSeleccion] = useState<NecesidadFila | null>(null);
  const [creandoParte, setCreandoParte] = useState(false);
  const [agregandoA, setAgregandoA] = useState<ParteFila | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const visibles = useMemo(
    () => (filtro === 'todas' ? filas : filas.filter((f) => f.tipo === filtro)),
    [filas, filtro],
  );

  const cuadrantes = useMemo(() => {
    const todos = filas.flatMap((f) => f.necesidades);
    // MEDIO cuenta con ALTO: el Excel sólo distingue alto de bajo, y dejar a los medios
    // fuera de los cuatro cuadrantes los desaparecería del mapa.
    const alto = (v: string) => v === 'ALTO' || v === 'MEDIO';
    const contar = (p: boolean, i: boolean) =>
      todos.filter((n) => alto(n.poder) === p && alto(n.interes) === i).length;
    return [
      { etiqueta: 'Gestionar de cerca', n: contar(true, true), color: '#a52016', bg: '#fdeeeb' },
      { etiqueta: 'Mantener satisfecho', n: contar(true, false), color: '#8a4407', bg: '#fff3e6' },
      { etiqueta: 'Mantener informado', n: contar(false, true), color: '#12437f', bg: '#e9f0fb' },
      { etiqueta: 'Monitorear', n: contar(false, false), color: '#4a544f', bg: '#f5f7f6' },
    ];
  }, [filas]);

  return (
    <main className="flex flex-1 px-8 pt-7 pb-14">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="titulo-pagina">Partes interesadas</h1>
            <p className="max-w-[80ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
              MAT-EST-02. Cada necesidad declara qué poder e interés tiene la parte, qué riesgo
              u oportunidad genera, y se sigue año por año.
            </p>
          </div>
          <button
            onClick={() => setCreandoParte(true)}
            className="ml-auto flex-none rounded-campo px-4 py-2.5 text-12_5 font-semibold text-white"
            style={{ background: 'var(--hf-brand-nav)' }}
          >
            Nueva parte interesada
          </button>
        </div>

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

        {creandoParte && (
          <NuevaParte onCerrar={() => setCreandoParte(false)} setAviso={setAviso} />
        )}

        {agregandoA && (
          <NuevaNecesidad
            parte={agregandoA}
            personas={personas}
            onCerrar={() => setAgregandoA(null)}
            setAviso={setAviso}
          />
        )}

        <nav className="mt-4 flex flex-wrap items-center gap-1.5">
          {(['todas', 'INTERNA', 'EXTERNA'] as const).map((t) => {
            const activo = filtro === t;
            const n = t === 'todas' ? filas.length : filas.filter((f) => f.tipo === t).length;
            return (
              <button
                key={t}
                onClick={() => setFiltro(t)}
                aria-pressed={activo}
                className="inline-flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 text-12"
                style={{
                  background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                  color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                  border: `1px solid ${activo ? 'var(--hf-brand-border)' : 'var(--hf-border-field)'}`,
                  fontWeight: activo ? 600 : 500,
                }}
              >
                {t === 'todas' ? 'Todas' : TIPO_CHIP[t].etiqueta + 's'}
                <span className="font-mono text-10 opacity-75">{n}</span>
              </button>
            );
          })}
          <span className="etiqueta-campo ml-3" style={{ color: 'var(--hf-brand-nav)' }}>
            Poder e interés
          </span>
        </nav>

        <section className="mt-3 grid grid-cols-2 gap-3">
          {cuadrantes.map((c) => (
            <div
              key={c.etiqueta}
              className="flex items-center justify-between rounded-campo border px-4 py-3"
              style={{ background: c.bg, borderColor: c.color }}
            >
              <span className="text-12_5 font-semibold" style={{ color: c.color }}>
                {c.etiqueta}
              </span>
              <span className="font-mono text-18 font-semibold" style={{ color: c.color }}>
                {c.n}
              </span>
            </div>
          ))}
        </section>

        <div className="mt-5 flex flex-col gap-2">
          {visibles.map((p) => (
            <div key={p.id} className="rounded-tarjeta border border-border-field bg-surface px-4 py-3">
              <div className="flex items-center gap-2">
                <span
                  className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold uppercase"
                  style={{ background: TIPO_CHIP[p.tipo].fondo, color: TIPO_CHIP[p.tipo].texto }}
                >
                  {TIPO_CHIP[p.tipo].etiqueta}
                </span>
                <span className="text-13 font-medium text-primary">{p.descripcion}</span>
                <button
                  onClick={() => setAgregandoA(p)}
                  className="ml-auto rounded-campo px-2.5 py-1 text-11_5 font-medium"
                  style={{
                    color: 'var(--hf-brand-nav)',
                    border: '1px dashed var(--hf-brand-border)',
                  }}
                >
                  + Necesidad
                </button>
              </div>
              {p.necesidades.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setSeleccion(n)}
                  aria-pressed={seleccion?.id === n.id}
                  className="mt-1.5 flex w-full items-center justify-between gap-3 rounded-campo px-2.5 py-1.5 text-left"
                  style={{
                    background: seleccion?.id === n.id ? 'var(--hf-brand-100)' : 'transparent',
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-12_5 text-primary">{n.texto}</span>
                  <span className="flex-none text-11_5 text-muted">
                    Poder {n.poder.toLowerCase()} · interés {n.interes.toLowerCase()}
                  </span>
                  <span className="flex flex-none gap-1">
                    {BANDERAS.filter((b) => n.banderas[b.clave]).map((b) => (
                      <span
                        key={b.clave}
                        title={b.etiqueta}
                        className="h-[7px] w-[7px] rounded-full"
                        style={{ background: b.texto }}
                      />
                    ))}
                  </span>
                </button>
              ))}
              {p.necesidades.length === 0 && (
                <p className="mt-1.5 px-2.5 text-11_5 text-muted">
                  Sin necesidades declaradas. Una parte sin necesidades no genera nada.
                </p>
              )}

              {/* D4 · «Organizaciones · las mismas del inventario de activos».
                  Sólo cuando hay: una sección vacía en cada tarjeta ocuparía media pantalla
                  para no decir nada. */}
              {p.organizaciones.length > 0 && <Organizaciones lista={p.organizaciones} />}
            </div>
          ))}
          {visibles.length === 0 && (
            <p className="py-8 text-center text-12 text-muted">
              {filas.length === 0
                ? 'Todavía no hay partes interesadas. Creá la primera.'
                : 'Ninguna parte de ese tipo.'}
            </p>
          )}
        </div>
      </div>

      {seleccion && (
        <Ficha
          key={seleccion.id}
          necesidad={seleccion}
          anioActual={anioActual}
          onCerrar={() => setSeleccion(null)}
          setAviso={setAviso}
        />
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Ficha de la necesidad
// ──────────────────────────────────────────────────────────────────────────────

function Ficha({
  necesidad,
  anioActual,
  onCerrar,
  setAviso,
}: {
  necesidad: NecesidadFila;
  anioActual: number;
  onCerrar: () => void;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  // Los años que ya tienen registro, más el actual: el lienzo lo dibuja como pestañas, y
  // sin el año actual no habría dónde escribir el seguimiento de este año.
  const anios = useMemo(() => {
    const set = new Set(necesidad.seguimiento.map((s) => s.anio));
    set.add(anioActual);
    return [...set].sort((a, b) => b - a);
  }, [necesidad.seguimiento, anioActual]);

  const [anio, setAnio] = useState(anios[0]);
  const guardado = necesidad.seguimiento.find((s) => s.anio === anio);
  const [plan, setPlan] = useState(guardado?.planAccion ?? '');
  const [seguimiento, setSeguimiento] = useState(guardado?.seguimiento ?? '');
  const [evidencia, setEvidencia] = useState(guardado?.evidencia ?? '');
  const [ocupado, setOcupado] = useState(false);

  function cambiarAnio(nuevo: number) {
    const s = necesidad.seguimiento.find((x) => x.anio === nuevo);
    setAnio(nuevo);
    setPlan(s?.planAccion ?? '');
    setSeguimiento(s?.seguimiento ?? '');
    setEvidencia(s?.evidencia ?? '');
  }

  async function guardar() {
    setOcupado(true);
    const r = await guardarSeguimientoParte(necesidad.id, {
      anio,
      planAccion: plan,
      seguimiento,
      evidencia,
    });
    setOcupado(false);
    setAviso({ ok: r.ok, texto: r.mensaje });
    if (r.ok) setTimeout(() => window.location.reload(), 1000);
  }

  return (
    <aside className="ml-6 flex h-fit w-[364px] shrink-0 flex-col overflow-hidden rounded-tarjeta border border-border-field bg-surface">
      <div className="flex flex-col gap-1.5 border-b border-hairline px-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-13 font-semibold leading-snug text-primary">{necesidad.texto}</span>
          <button onClick={onCerrar} aria-label="Cerrar la ficha" className="flex-none text-14 text-muted">
            ✕
          </button>
        </div>
        <span className="flex items-center gap-2">
          <span
            className="rounded-[4px] px-2 py-0.5 font-mono text-8_5 uppercase"
            style={{ background: 'var(--hf-bg-app)', color: 'var(--hf-text-secondary-soft)' }}
          >
            {necesidad.clase === 'NECESIDAD' ? 'Necesidad' : 'Expectativa'}
          </span>
          <span className="text-11_5 text-muted">Responsable: {necesidad.responsable ?? '—'}</span>
        </span>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Necesidad o expectativa</span>
          <span className="entrada-campo">{necesidad.texto}</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Riesgo u oportunidad que genera</span>
          <span className="entrada-campo" style={necesidad.riesgoOportunidadTexto === '' ? { color: 'var(--hf-text-label)' } : undefined}>
            {necesidad.riesgoOportunidadTexto ||
              'Sin declarar · es la columna que explica por qué la necesidad importa'}
          </span>
        </label>

        <div className="grid grid-cols-3 gap-2.5">
          {BANDERAS.map((b) => {
            const puesta = necesidad.banderas[b.clave];
            return (
              <span
                key={b.clave}
                className="flex flex-col gap-1.5 rounded-tarjeta px-3 py-2.5"
                style={{
                  background: puesta ? b.fondo : 'var(--hf-bg-app)',
                  border: `1px solid ${puesta ? b.borde : 'var(--hf-border-field)'}`,
                }}
              >
                <span
                  className="etiqueta-campo"
                  style={{ color: puesta ? b.texto : 'var(--hf-text-label)' }}
                >
                  {b.etiqueta}
                </span>
                <span
                  className="text-13 font-semibold"
                  style={{ color: puesta ? b.texto : 'var(--hf-text-label)' }}
                >
                  {puesta ? 'Sí' : 'No'}
                </span>
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <span className="etiqueta-campo" style={{ color: 'var(--hf-brand-nav)' }}>
            Seguimiento por año
          </span>
          <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
          <span className="flex gap-0.5 rounded-campo border border-border-field bg-app p-[3px]">
            {anios.map((a) => (
              <button
                key={a}
                onClick={() => cambiarAnio(a)}
                aria-pressed={anio === a}
                className="rounded-[4px] px-2 py-0.5 font-mono text-11"
                style={{
                  background: anio === a ? 'var(--hf-bg-surface)' : 'transparent',
                  color: anio === a ? 'var(--hf-brand-nav)' : 'var(--hf-text-muted)',
                  fontWeight: anio === a ? 600 : 400,
                }}
              >
                {a}
              </button>
            ))}
          </span>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Plan de acción {anio}</span>
          <textarea
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            rows={2}
            className="entrada-campo min-h-[56px] leading-relaxed"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Seguimiento</span>
          <textarea
            value={seguimiento}
            onChange={(e) => setSeguimiento(e.target.value)}
            rows={2}
            className="entrada-campo min-h-[56px] leading-relaxed"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Evidencia</span>
          <input
            value={evidencia}
            onChange={(e) => setEvidencia(e.target.value)}
            placeholder="ACT-COM-2026-03, o dónde está"
            className="entrada-campo"
          />
        </label>

        <button
          onClick={guardar}
          disabled={ocupado}
          className="w-fit rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {ocupado ? 'Guardando…' : `Guardar el seguimiento ${anio}`}
        </button>

        <p
          className="rounded-tarjeta px-3.5 py-3 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{
            background: 'var(--hf-brand-100)',
            border: '1px solid var(--hf-brand-border)',
            color: 'var(--hf-brand-nav)',
          }}
        >
          En el Excel el plan, el seguimiento y la evidencia son{' '}
          <strong className="font-semibold">tres columnas nuevas cada año</strong>. Acá son un
          registro por año: agregar 2027 no obliga a rediseñar la pantalla.
        </p>
      </div>
    </aside>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Altas
// ──────────────────────────────────────────────────────────────────────────────

function NuevaParte({
  onCerrar,
  setAviso,
}: {
  onCerrar: () => void;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [tipo, setTipo] = useState<'INTERNA' | 'EXTERNA'>('EXTERNA');
  const [descripcion, setDescripcion] = useState('');
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-14 font-bold text-primary">Nueva parte interesada</h2>
        <button onClick={onCerrar} className="text-12_5 text-muted">
          Cancelar
        </button>
      </div>
      <p className="max-w-[80ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
        Interna o externa según de qué lado del alcance del SIG está. La distinción decide
        cómo se la gestiona, no sólo cómo se la agrupa.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Tipo</span>
          <span className="flex gap-1.5">
            {(['INTERNA', 'EXTERNA'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTipo(t)}
                aria-pressed={tipo === t}
                className="rounded-chip px-3.5 py-1.5 text-12"
                style={{
                  background: tipo === t ? TIPO_CHIP[t].fondo : 'var(--hf-bg-surface)',
                  color: tipo === t ? TIPO_CHIP[t].texto : 'var(--hf-text-secondary-soft)',
                  border: `1px solid ${tipo === t ? TIPO_CHIP[t].texto : 'var(--hf-border-field)'}`,
                  fontWeight: tipo === t ? 600 : 500,
                }}
              >
                {TIPO_CHIP[t].etiqueta}
              </button>
            ))}
          </span>
        </label>
        <label className="flex min-w-[280px] flex-1 flex-col gap-1.5">
          <span className="etiqueta-campo">Descripción</span>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Clientes corporativos del sector financiero"
            className="entrada-campo"
          />
        </label>
        <button
          onClick={async () => {
            setOcupado(true);
            const r = await crearParteInteresada({ tipo, descripcion });
            setOcupado(false);
            setAviso({ ok: r.ok, texto: r.mensaje });
            if (r.ok) window.location.reload();
            else onCerrar();
          }}
          disabled={descripcion.trim() === '' || ocupado}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {ocupado ? 'Creando…' : 'Crear'}
        </button>
      </div>
    </div>
  );
}

function NuevaNecesidad({
  parte,
  personas,
  onCerrar,
  setAviso,
}: {
  parte: ParteFila;
  personas: { id: number; nombre: string }[];
  onCerrar: () => void;
  setAviso: (a: { ok: boolean; texto: string }) => void;
}) {
  const [texto, setTexto] = useState('');
  const [clase, setClase] = useState<'NECESIDAD' | 'EXPECTATIVA'>('NECESIDAD');
  const [poder, setPoder] = useState<Nivel>('ALTO');
  const [interes, setInteres] = useState<Nivel>('ALTO');
  const [riesgo, setRiesgo] = useState('');
  const [esRiesgo, setEsRiesgo] = useState(true);
  const [esOportunidad, setEsOportunidad] = useState(false);
  const [sgsi, setSgsi] = useState(false);
  const [clima, setClima] = useState(false);
  const [alcance, setAlcance] = useState(false);
  const [responsableId, setResponsableId] = useState('');
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="mt-4 flex flex-col gap-4 rounded-tarjeta border border-border-field bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-14 font-bold text-primary">
          Nueva necesidad · {parte.descripcion}
        </h2>
        <button onClick={onCerrar} className="flex-none text-12_5 text-muted">
          Cancelar
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="etiqueta-campo">Necesidad o expectativa</span>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          placeholder="Continuidad del servicio ante una interrupción del proveedor de nube"
          className="entrada-campo leading-relaxed"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="etiqueta-campo">Riesgo u oportunidad que genera</span>
        <textarea
          value={riesgo}
          onChange={(e) => setRiesgo(e.target.value)}
          rows={2}
          placeholder="Qué puede pasar si no se atiende, o qué se gana si se atiende"
          className="entrada-campo leading-relaxed"
        />
        <span className="flex gap-3 pt-0.5">
          <label className="flex items-center gap-1.5 text-11_5 text-secondary-soft">
            <input type="checkbox" checked={esRiesgo} onChange={(e) => setEsRiesgo(e.target.checked)} />
            Es riesgo
          </label>
          <label className="flex items-center gap-1.5 text-11_5 text-secondary-soft">
            <input
              type="checkbox"
              checked={esOportunidad}
              onChange={(e) => setEsOportunidad(e.target.checked)}
            />
            Es oportunidad
          </label>
        </span>
      </label>

      <div className="grid grid-cols-4 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Clase</span>
          <select
            value={clase}
            onChange={(e) => setClase(e.target.value as 'NECESIDAD' | 'EXPECTATIVA')}
            className="entrada-campo"
          >
            <option value="NECESIDAD">Necesidad</option>
            <option value="EXPECTATIVA">Expectativa</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Poder</span>
          <select
            value={poder}
            onChange={(e) => setPoder(e.target.value as Nivel)}
            className="entrada-campo"
          >
            {NIVELES.map((n) => (
              <option key={n} value={n}>
                {n.charAt(0) + n.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Interés</span>
          <select
            value={interes}
            onChange={(e) => setInteres(e.target.value as Nivel)}
            className="entrada-campo"
          >
            {NIVELES.map((n) => (
              <option key={n} value={n}>
                {n.charAt(0) + n.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Responsable · opcional</span>
          <select
            value={responsableId}
            onChange={(e) => setResponsableId(e.target.value)}
            className="entrada-campo"
          >
            <option value="">Sin asignar</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="etiqueta-campo">Banderas · cada una dispara una obligación en otro módulo</span>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['Requisitos SGSI', sgsi, setSgsi],
              ['Cambio climático', clima, setClima],
              ['Cambia el alcance', alcance, setAlcance],
            ] as const
          ).map(([etiqueta, valor, poner], i) => (
            <button
              key={etiqueta}
              onClick={() => poner(!valor)}
              aria-pressed={valor}
              className="rounded-chip px-3 py-1.5 text-11_5"
              style={{
                background: valor ? BANDERAS[i].fondo : 'var(--hf-bg-surface)',
                color: valor ? BANDERAS[i].texto : 'var(--hf-text-secondary-soft)',
                border: `1px solid ${valor ? BANDERAS[i].borde : 'var(--hf-border-field)'}`,
                fontWeight: valor ? 600 : 500,
              }}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={async () => {
            setOcupado(true);
            const r = await agregarNecesidad(parte.id, {
              texto,
              clase,
              poder,
              interes,
              riesgoOportunidadTexto: riesgo.trim() || undefined,
              esRiesgo,
              esOportunidad,
              generaRequisitosSgsi: sgsi,
              requisitoCambioClimatico: clima,
              requiereCambioAlcanceSig: alcance,
              responsableId: responsableId === '' ? undefined : Number(responsableId),
            });
            setOcupado(false);
            setAviso({ ok: r.ok, texto: r.mensaje });
            if (r.ok) window.location.reload();
            else onCerrar();
          }}
          disabled={texto.trim() === '' || ocupado}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {ocupado ? 'Registrando…' : 'Registrar la necesidad'}
        </button>
        <span className="text-11_5 text-muted">
          El seguimiento anual se escribe después, en la ficha.
        </span>
      </div>
    </div>
  );
}

/// «Organizaciones · las mismas del inventario de activos» (D4).
///
/// El lienzo lo dibuja en la ficha de la parte, no en una pantalla aparte, y la nota explica
/// por qué: «antes, el proveedor de nube existía dos veces sin relación: como parte
/// interesada acá y como proveedor en el inventario. Ahora es una sola organización, y por
/// eso la reevaluación anual que exige POL-TEC-02 puede colgarse de ella y saber a cuántos
/// activos afecta».
///
/// El estado y el resultado se muestran SEPARADOS a propósito: una organización al día con
/// «no cumple» está peor que una vencida con «cumple», y un solo semáforo no distingue las
/// dos.
function Organizaciones({ lista }: { lista: OrganizacionFila[] }) {
  return (
    <section className="mt-3 flex flex-col gap-2 border-t border-hairline pt-3">
      <span className="flex items-center gap-2.5">
        <span className="font-mono text-9 font-medium uppercase tracking-[0.07em] text-accent">
          Organizaciones · las mismas del inventario de activos
        </span>
        <span className="h-px flex-1 bg-hairline" />
        <span className="font-mono text-9_5 text-muted">{lista.length}</span>
      </span>

      {lista.map((o) => {
        const e = COLOR_ESTADO[o.estado];
        return (
          <div
            key={o.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-campo border border-border-default px-2.5 py-2"
          >
            <span className="text-12_5 font-medium text-primary">{o.nombre}</span>
            <span className="font-mono text-9 uppercase tracking-[0.06em] text-muted">
              {ETIQUETA_TIPO_ORGANIZACION[o.tipo] ?? o.tipo}
            </span>
            {/* El conteo de activos es el dato que convierte una evaluación en una
                decisión: reevaluar mal a quien soporta cuatro activos no es lo mismo que
                a quien no soporta ninguno. */}
            <span className="font-mono text-10_5 text-muted">
              {o.activos === 0 ? 'no soporta activos' : `soporta ${o.activos} activo(s)`}
            </span>
            <span className="ml-auto flex flex-none items-center gap-2">
              {o.resultado !== null && (
                <span className="text-11 text-secondary">{ETIQUETA_RESULTADO[o.resultado]}</span>
              )}
              <span
                className="rounded-[4px] px-2 py-0.5 font-mono text-9 font-semibold uppercase"
                style={{ background: e.fondo, color: e.texto }}
              >
                {ETIQUETA_ESTADO[o.estado]}
              </span>
              <span className="font-mono text-10 text-muted">
                {o.proxima !== null ? `próxima ${o.proxima}` : 'nunca evaluada'}
              </span>
            </span>
          </div>
        );
      })}

      <p className="text-11 leading-relaxed text-muted [text-wrap:pretty]">
        La reevaluación anual que exige POL-TEC-02 se cuelga de la organización, y el conteo
        de activos dice a cuántos afecta. «Sin evaluar» no es lo mismo que «vencida»: dar de
        alta una organización no genera un incumplimiento el mismo día.
      </p>
    </section>
  );
}

/// «Sin evaluar» va en gris y no en rojo: informa que falta el dato, no que se incumplió.
const COLOR_ESTADO: Record<EstadoEvaluacion, { fondo: string; texto: string }> = {
  AL_DIA: { fondo: '#e6efe9', texto: '#0b5c44' },
  POR_VENCER: { fondo: '#faf1d3', texto: '#6b5410' },
  VENCIDA: { fondo: '#fdeeeb', texto: '#a52016' },
  SIN_EVALUAR: { fondo: 'var(--hf-bg-subtle)', texto: 'var(--hf-text-muted)' },
};
