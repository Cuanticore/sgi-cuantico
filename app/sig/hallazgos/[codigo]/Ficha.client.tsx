'use client';

// app/sig/hallazgos/[codigo]/Ficha.client.tsx
//
// Cinco pestañas con sus marcas (Obligatorio · Con método · Si aplica · Opcional ·
// No aplica); las que el tipo no exige se atenúan. La franja inferior fija lleva el
// estado y los botones de cierre y anulación. La validación vive en el servidor.

import { useState } from 'react';
import {
  guardarCorreccion,
  guardarCausaRaiz,
  guardarExtension,
  agregarAccionHallazgo,
  verificarEficacia,
  cerrarHallazgo,
  anularHallazgo,
  clasificarHallazgo,
} from '@/app/sig/acciones/hallazgos';

type Pestana = 'identificacion' | 'correccion' | 'causa' | 'acciones' | 'eficacia';

export interface HallazgoFicha {
  id: number;
  codigo: string;
  tipo: string;
  origen: string;
  origenReferencia: string;
  descripcion: string;
  requisitoIncumplido: string;
  evidenciaObjetiva: string;
  area: string;
  detectadoPor: string;
  fechaDeteccion: string;
  responsable: { id: number; nombre: string } | null;
  fechaCompromiso: string | null;
  hallazgoAnterior: { codigo: string; tipo: string } | null;
  estado: string;
  vencido: boolean;
  /// Días que lleva vencido. `null` si no está vencido o no hay fecha de compromiso.
  diasVencido: number | null;
  fechaCierre: string | null;
  cerradoPor: string | null;
  exige: {
    correccion: string;
    causa: string;
    extension: boolean;
    verificacion: string;
  };
  correccion: { descripcion: string; fecha: string } | null;
  analisis: { metodo: string; desarrollo: unknown; causaRaiz: string } | null;
  extension: { existeEnOtraParte: boolean; analisis: string } | null;
  acciones: {
    id: number;
    papel: string;
    titulo: string;
    responsable: string;
    fechaLimite: string;
    estado: string;
  }[];
  verificaciones: { resultado: string; nota: string | null; fecha: string; verificadoPor: string }[];
  huboAccion: boolean;
  verificacionEficaz: boolean;
}

export default function FichaClient({
  hallazgo,
  personas,
}: {
  hallazgo: HallazgoFicha;
  personas: { id: number; nombre: string }[];
}) {
  const [pestana, setPestana] = useState<Pestana>('identificacion');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reclasificando, setReclasificando] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);

  const marcas: Record<Pestana, string> = {
    identificacion: 'Obligatorio',
    correccion:
      hallazgo.exige.correccion === 'SI'
        ? 'Obligatorio'
        : hallazgo.exige.correccion === 'SI_APLICA'
          ? 'Si aplica'
          : 'No aplica',
    causa:
      hallazgo.exige.causa === 'METODO'
        ? 'Con método'
        : hallazgo.exige.causa === 'LIBRE'
          ? 'Obligatorio'
          : hallazgo.exige.causa === 'OPCIONAL'
            ? 'Opcional'
            : 'No aplica',
    acciones: 'Obligatorio',
    eficacia:
      hallazgo.exige.verificacion === 'SI'
        ? 'Obligatorio'
        : hallazgo.exige.verificacion === 'CONDICIONAL' && hallazgo.huboAccion
          ? 'Obligatorio'
          : 'Si aplica',
  };

  const atenuada = (p: Pestana) =>
    (p === 'correccion' && hallazgo.exige.correccion === 'NO') ||
    (p === 'causa' && hallazgo.exige.causa === 'NO') ||
    (p === 'eficacia' && hallazgo.exige.verificacion === 'CONDICIONAL' && !hallazgo.huboAccion);

  return (
    <main className="flex flex-1 flex-col px-8 pt-7 pb-24">
      <header className="flex items-center gap-3">
        <span className="font-mono text-14 font-semibold text-primary">{hallazgo.codigo}</span>
        <span
          className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold uppercase"
          style={TIPO[hallazgo.tipo as keyof typeof TIPO]?.estilo ?? TIPO.OPORTUNIDAD.estilo}
        >
          {TIPO[hallazgo.tipo as keyof typeof TIPO]?.etiqueta ?? hallazgo.tipo}
        </span>
        <span
          className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold uppercase"
          style={{ background: '#eef2f8', color: '#12437f' }}
        >
          {hallazgo.estado.replaceAll('_', ' ')}
        </span>
        {hallazgo.vencido && (
          <span
            className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold uppercase"
            style={{ background: '#fdeeeb', color: '#a52016' }}
          >
            {hallazgo.diasVencido === null
              ? 'Vencido'
              : `Vencido · ${hallazgo.diasVencido} ${hallazgo.diasVencido === 1 ? 'día' : 'días'}`}
          </span>
        )}
      </header>

      <div className="mt-2 flex items-start gap-4">
        <h1 className="max-w-[84ch] text-19 font-semibold leading-snug text-primary [text-wrap:pretty]">
          {hallazgo.descripcion}
        </h1>
        <span className="ml-auto flex flex-none flex-col items-end gap-1.5">
          <span className="etiqueta-campo">Reclasificar</span>
          <span className="flex gap-1 rounded-campo border border-border-field bg-surface p-[3px]">
            {(Object.keys(TIPO) as (keyof typeof TIPO)[]).map((t) => {
              const activo = hallazgo.tipo === t;
              return (
                <button
                  key={t}
                  onClick={() => setReclasificando(t)}
                  aria-pressed={activo}
                  disabled={hallazgo.estado === 'CERRADO' || hallazgo.estado === 'ANULADO'}
                  className="rounded-[4px] px-2.5 py-1 text-11 disabled:opacity-40"
                  style={{
                    background: activo ? 'var(--hf-brand-100)' : 'transparent',
                    color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-muted)',
                    fontWeight: activo ? 600 : 500,
                  }}
                >
                  {TIPO[t].etiqueta}
                </button>
              );
            })}
          </span>
        </span>
      </div>

      {reclasificando && (
        <PanelReclasificar
          hallazgo={hallazgo}
          personas={personas}
          tipoNuevo={reclasificando}
          onCerrar={() => setReclasificando(null)}
          setError={setError}
        />
      )}

      {anulando && (
        <PanelAnular
          codigo={hallazgo.codigo}
          onCerrar={() => setAnulando(false)}
          setError={setError}
        />
      )}

      <nav className="mt-5 flex border-b border-border-default">
        {(['identificacion', 'correccion', 'causa', 'acciones', 'eficacia'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPestana(p)}
            aria-current={pestana === p ? 'page' : undefined}
            className="flex items-center gap-2 px-4 py-2.5 text-12_5"
            style={{
              fontWeight: pestana === p ? 600 : 500,
              color: atenuada(p)
                ? '#c3cac6'
                : pestana === p
                  ? 'var(--hf-brand-nav)'
                  : 'var(--hf-text-secondary-soft)',
              borderBottom: pestana === p ? '2px solid var(--hf-brand-nav)' : '2px solid transparent',
            }}
          >
            {PESTANAS[p]}
            <span
              className="rounded-[4px] px-1.5 py-0.5 font-mono text-8_5"
              style={{
                background: atenuada(p)
                  ? '#b6bdb9'
                  : marcas[p] === 'Obligatorio' || marcas[p] === 'Con método'
                    ? '#e9f0fb'
                    : marcas[p] === 'Si aplica'
                      ? '#fff3e6'
                      : '#f5f7f6',
                color: atenuada(p) ? '#ffffff' : '#12437f',
              }}
            >
              {marcas[p]}
            </span>
          </button>
        ))}
      </nav>

      <div className="mt-5 flex-1">
        {pestana === 'identificacion' && <Identificacion hallazgo={hallazgo} />}
        {pestana === 'correccion' && (
          <Correccion hallazgo={hallazgo} setMensaje={setMensaje} setError={setError} />
        )}
        {pestana === 'causa' && (
          <CausaRaiz hallazgo={hallazgo} setMensaje={setMensaje} setError={setError} />
        )}
        {pestana === 'acciones' && (
          <Acciones hallazgo={hallazgo} setMensaje={setMensaje} setError={setError} />
        )}
        {pestana === 'eficacia' && (
          <Eficacia hallazgo={hallazgo} setMensaje={setMensaje} setError={setError} />
        )}
        {mensaje && (
          <p className="mt-4 rounded-campo px-3 py-2 text-12" style={{ background: 'var(--hf-row-verde)', color: 'var(--hf-accent-700)' }}>
            {mensaje}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-campo px-3 py-2 text-12" style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}>
            {error}
          </p>
        )}
      </div>

      <footer
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between bg-surface px-8 py-3"
        style={{ borderTop: '1px solid var(--hf-hairline-strong)' }}
      >
        <p className="text-11_5 text-muted">
          No se cierra sin verificación eficaz · nadie cierra su propio hallazgo
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setAnulando(true)}
            className="rounded-campo border px-4 py-2 text-12_5 font-medium"
            style={{ borderColor: 'var(--hf-danger-border)', color: 'var(--hf-danger-text)' }}
          >
            Anular
          </button>
          <a
            href={`/api/sig/hallazgos/${hallazgo.codigo}/acta`}
            className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 font-medium text-muted"
          >
            Acta (Excel)
          </a>
          <button
            onClick={async () => {
              const r = await cerrarHallazgo(hallazgo.codigo);
              if (r.ok) window.location.reload();
              else setError(r.mensaje);
            }}
            disabled={!hallazgo.verificacionEficaz}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-40"
            style={{
              background: hallazgo.verificacionEficaz ? 'var(--hf-accent-500)' : '#b6bdb9',
            }}
          >
            Cerrar el hallazgo
          </button>
        </div>
      </footer>
    </main>
  );
}

const PESTANAS: Record<Pestana, string> = {
  identificacion: 'Identificación',
  correccion: 'Corrección',
  causa: 'Causa raíz',
  acciones: 'Acciones',
  eficacia: 'Eficacia y cierre',
};

const TIPO: Record<string, { etiqueta: string; estilo: { background: string; color: string } }> = {
  NC_MAYOR: { etiqueta: 'NC mayor', estilo: { background: '#fdeeeb', color: '#a52016' } },
  NC_MENOR: { etiqueta: 'NC menor', estilo: { background: '#fff3e6', color: '#8a4407' } },
  OBSERVACION: { etiqueta: 'Observación', estilo: { background: '#faf1d3', color: '#6b5410' } },
  OPORTUNIDAD: { etiqueta: 'Oportunidad', estilo: { background: '#e8f4ef', color: '#0b5c44' } },
};

/// «Reclasificar» del lienzo. El lienzo dibuja sólo los botones de tipo, pero
/// `clasificarHallazgo` exige responsable y fecha de compromiso: reclasificar de
/// observación a NC mayor cambia qué pasos son obligatorios, y dejar eso sin dueño ni
/// plazo es crear una obligación que nadie debe. Los campos vienen precargados con lo que
/// el hallazgo ya tiene, así que en el caso normal es confirmar y listo.
function PanelReclasificar({
  hallazgo,
  personas,
  tipoNuevo,
  onCerrar,
  setError,
}: {
  hallazgo: HallazgoFicha;
  personas: { id: number; nombre: string }[];
  tipoNuevo: string;
  onCerrar: () => void;
  setError: (e: string) => void;
}) {
  const [responsableId, setResponsableId] = useState(hallazgo.responsable?.id.toString() ?? '');
  const [fechaCompromiso, setFechaCompromiso] = useState(hallazgo.fechaCompromiso ?? '');
  const [ocupado, setOcupado] = useState(false);

  const mismoTipo = tipoNuevo === hallazgo.tipo;
  const listo = responsableId !== '' && fechaCompromiso !== '';

  async function aplicar() {
    setOcupado(true);
    setError('');
    const r = await clasificarHallazgo(hallazgo.codigo, {
      tipo: tipoNuevo as 'NC_MAYOR' | 'NC_MENOR' | 'OBSERVACION' | 'OPORTUNIDAD',
      responsableId: Number(responsableId),
      fechaCompromiso: new Date(`${fechaCompromiso}T00:00:00.000Z`),
    });
    setOcupado(false);
    if (r.ok) {
      window.location.reload();
      return;
    }
    setError(r.mensaje);
    onCerrar();
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-14 font-bold text-primary">
          {mismoTipo
            ? `Clasificar como ${TIPO[tipoNuevo].etiqueta}`
            : `Reclasificar de ${TIPO[hallazgo.tipo]?.etiqueta ?? hallazgo.tipo} a ${TIPO[tipoNuevo].etiqueta}`}
        </h2>
        <button onClick={onCerrar} className="text-12_5 text-muted">
          Cancelar
        </button>
      </div>
      <p className="max-w-[84ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
        El tipo decide qué pasos exige el flujo: las pestañas que el tipo nuevo no exige se
        atenúan, y las que sí exige quedan pendientes. El cambio queda en la bitácora con el
        tipo anterior.
      </p>
      <div className="grid max-w-[620px] grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Responsable</span>
          <select
            value={responsableId}
            onChange={(e) => setResponsableId(e.target.value)}
            className="entrada-campo"
          >
            <option value="">Elegir persona…</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Fecha de compromiso</span>
          <input
            type="date"
            value={fechaCompromiso}
            onChange={(e) => setFechaCompromiso(e.target.value)}
            className="entrada-campo font-mono"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={aplicar}
          disabled={!listo || ocupado}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {ocupado ? 'Aplicando…' : mismoTipo ? 'Clasificar' : 'Reclasificar'}
        </button>
        {!listo && (
          <span className="text-11_5 text-muted">
            Falta el responsable o la fecha: sin ellos el tipo nuevo no tendría dueño ni plazo.
          </span>
        )}
      </div>
    </div>
  );
}

/// Anular pedía el motivo con un `prompt()` del navegador. Un motivo obligatorio que se
/// escribe en un cuadro del sistema operativo no se puede revisar antes de enviarlo, no se
/// puede pegar cómodo y no dice qué se está anulando.
function PanelAnular({
  codigo,
  onCerrar,
  setError,
}: {
  codigo: string;
  onCerrar: () => void;
  setError: (e: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
        <h2 className="text-15 font-bold text-primary">Anular {codigo}</h2>
        <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
          Anular dice que el hallazgo no debió existir. No se borra: queda con su motivo en la
          bitácora, y sigue contando en el histórico como hallazgo anulado.
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Motivo (obligatorio)</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Se registró dos veces el mismo hallazgo de la auditoría de agosto."
            className="entrada-campo leading-relaxed"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-campo px-3 py-1.5 text-12 text-muted">
            Cancelar
          </button>
          <button
            onClick={async () => {
              setOcupado(true);
              const r = await anularHallazgo(codigo, motivo);
              setOcupado(false);
              if (r.ok) {
                window.location.reload();
                return;
              }
              setError(r.mensaje);
              onCerrar();
            }}
            disabled={motivo.trim() === '' || ocupado}
            className="rounded-campo px-3.5 py-1.5 text-12 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-danger-text)' }}
          >
            {ocupado ? 'Anulando…' : 'Anular'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Identificacion({ hallazgo }: { hallazgo: HallazgoFicha }) {
  return (
    <section className="grid max-w-[860px] grid-cols-3 gap-x-6 gap-y-4">
      <Campo etiqueta="Origen" valor={`${hallazgo.origen.replaceAll('_', ' ')} · ${hallazgo.origenReferencia}`} />
      <Campo etiqueta="Detectado por" valor={hallazgo.detectadoPor} />
      <Campo etiqueta="Fecha de detección" valor={hallazgo.fechaDeteccion} />
      <Campo etiqueta="Área" valor={hallazgo.area} />
      <Campo etiqueta="Responsable" valor={hallazgo.responsable?.nombre ?? 'Sin asignar'} />
      <Campo
        etiqueta="Fecha compromiso"
        valor={hallazgo.fechaCompromiso ?? 'Sin clasificar'}
        rojo={hallazgo.vencido}
      />
      <Campo etiqueta="Requisito incumplido" valor={hallazgo.requisitoIncumplido} ancho="col-span-3" />
      <Campo etiqueta="Evidencia objetiva" valor={hallazgo.evidenciaObjetiva} ancho="col-span-3" />
      <Campo
        etiqueta="Hallazgo anterior"
        valor={hallazgo.hallazgoAnterior ? `${hallazgo.hallazgoAnterior.codigo} (${hallazgo.hallazgoAnterior.tipo})` : 'Ninguno · sin antecesor'}
        ancho="col-span-3"
      />
    </section>
  );
}

function Correccion({
  hallazgo,
  setMensaje,
  setError,
}: {
  hallazgo: HallazgoFicha;
  setMensaje: (m: string) => void;
  setError: (e: string) => void;
}) {
  const [descripcion, setDescripcion] = useState(hallazgo.correccion?.descripcion ?? '');
  const [fecha, setFecha] = useState(hallazgo.correccion?.fecha ?? new Date().toISOString().slice(0, 10));

  return (
    <section className="flex max-w-[860px] flex-col gap-3">
      <p className="text-12_5 font-semibold text-primary">Acción inmediata</p>
      <textarea
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        rows={3}
        placeholder="Qué se hizo para contener el efecto"
        className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
      />
      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Fecha</span>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
        />
      </label>
      <button
        onClick={async () => {
          const r = await guardarCorreccion(hallazgo.codigo, {
            descripcion,
            responsableId: hallazgo.responsable?.id ?? 0,
            fecha: new Date(`${fecha}T00:00:00.000Z`),
          });
          if (r.ok) {
            setMensaje(r.mensaje);
            setTimeout(() => window.location.reload(), 800);
          } else setError(r.mensaje);
        }}
        className="w-fit rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        Guardar corrección
      </button>
      <p className="rounded-campo px-3 py-2 text-11_5" style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}>
        La corrección contiene el efecto; no cierra el hallazgo.
      </p>
    </section>
  );
}

function CausaRaiz({
  hallazgo,
  setMensaje,
  setError,
}: {
  hallazgo: HallazgoFicha;
  setMensaje: (m: string) => void;
  setError: (e: string) => void;
}) {
  const [metodo, setMetodo] = useState(hallazgo.analisis?.metodo ?? 'CINCO_PORQUES');
  const [desarrollo, setDesarrollo] = useState(
    JSON.stringify(hallazgo.analisis?.desarrollo ?? { porques: ['', '', '', '', ''] }, null, 2),
  );
  const [causaRaiz, setCausaRaiz] = useState(hallazgo.analisis?.causaRaiz ?? '');
  const [existeEnOtraParte, setExisteEnOtraParte] = useState<boolean | null>(
    hallazgo.extension?.existeEnOtraParte ?? null,
  );
  const [analisisExtension, setAnalisisExtension] = useState(hallazgo.extension?.analisis ?? '');

  return (
    <section className="flex max-w-[860px] flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="etiqueta-campo">Método declarado</span>
        {['CINCO_PORQUES', 'ISHIKAWA', 'LIBRE'].map((m) => (
          <button
            key={m}
            onClick={() => setMetodo(m)}
            aria-pressed={metodo === m}
            className="rounded-chip px-3 py-1.5 text-12"
            style={{
              background: metodo === m ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: metodo === m ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
              fontWeight: metodo === m ? 600 : 500,
            }}
          >
            {m === 'CINCO_PORQUES' ? '5 porqués' : m === 'ISHIKAWA' ? 'Ishikawa' : 'Libre'}
          </button>
        ))}
      </div>
      <textarea
        value={desarrollo}
        onChange={(e) => setDesarrollo(e.target.value)}
        rows={6}
        className="rounded-campo border border-border-field bg-surface px-3 py-2 font-mono text-11_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
      />
      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Causa raíz · conclusión</span>
        <textarea
          value={causaRaiz}
          onChange={(e) => setCausaRaiz(e.target.value)}
          rows={2}
          className="rounded-campo px-3 py-2 text-13 text-primary"
          style={{ background: '#f7fbf9', border: '1px solid #c9e3d8' }}
        />
      </label>
      <div className="flex items-center gap-3">
        <span className="etiqueta-campo">¿Existe en otra parte?</span>
        {[true, false].map((v) => (
          <button
            key={String(v)}
            onClick={() => setExisteEnOtraParte(v)}
            aria-pressed={existeEnOtraParte === v}
            className="rounded-chip px-3 py-1.5 text-12"
            style={{
              background: existeEnOtraParte === v ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: existeEnOtraParte === v ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
            }}
          >
            {v ? 'Sí' : 'No'}
          </button>
        ))}
      </div>
      <textarea
        value={analisisExtension}
        onChange={(e) => setAnalisisExtension(e.target.value)}
        rows={3}
        placeholder="Análisis de la extensión (ISO 9001 §10.2.1 d)"
        className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
      />
      <button
        onClick={async () => {
          const r = await guardarCausaRaiz(hallazgo.codigo, {
            metodo: metodo as 'CINCO_PORQUES' | 'ISHIKAWA' | 'LIBRE',
            desarrollo: JSON.parse(desarrollo),
            causaRaiz,
          });
          if (r.ok) {
            setMensaje(r.mensaje);
            if (existeEnOtraParte !== null) {
              const re = await guardarExtension(hallazgo.codigo, {
                existeEnOtraParte,
                analisis: analisisExtension,
              });
              if (re.ok) setMensaje(re.mensaje);
              else setError(re.mensaje);
            }
            setTimeout(() => window.location.reload(), 800);
          } else setError(r.mensaje);
        }}
        className="w-fit rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        Guardar causa raíz y extensión
      </button>
    </section>
  );
}

function Acciones({
  hallazgo,
  setMensaje,
  setError,
}: {
  hallazgo: HallazgoFicha;
  setMensaje: (m: string) => void;
  setError: (e: string) => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [papel, setPapel] = useState<'CORRECCION' | 'CORRECTIVA' | 'MEJORA'>('CORRECTIVA');
  const [fechaLimite, setFechaLimite] = useState(new Date().toISOString().slice(0, 10));

  return (
    <section className="flex max-w-[860px] flex-col gap-3">
      <p className="text-12_5 text-muted">Son asignaciones del motor de tareas: aparecen en Mi SIG del responsable.</p>
      {hallazgo.acciones.map((a) => (
        <div
          key={a.id}
          className="flex items-center justify-between gap-3 rounded-campo border border-border-field bg-surface px-4 py-2.5"
        >
          <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold" style={PAPEL[a.papel]}>
            {a.papel}
          </span>
          <span className="min-w-0 flex-1 truncate text-12_5 text-primary">{a.titulo}</span>
          <span className="text-11_5 text-muted">{a.responsable}</span>
          <span className="font-mono text-11" style={{ color: a.estado === 'REALIZADA' ? '#0b5c44' : a.estado === 'PENDIENTE' ? 'var(--hf-text-secondary-soft)' : '#a52016' }}>
            {a.fechaLimite}
          </span>
          <span className="rounded-[4px] px-1.5 py-0.5 font-mono text-9_5 uppercase" style={{ background: a.estado === 'REALIZADA' ? '#e6efe9' : a.estado === 'PENDIENTE' ? '#eef2f8' : '#fdeeeb', color: a.estado === 'REALIZADA' ? '#0b5c44' : a.estado === 'PENDIENTE' ? '#12437f' : '#a52016' }}>
            {a.estado === 'PENDIENTE' && a.fechaLimite < new Date().toISOString().slice(0, 10) ? 'Vencida' : a.estado}
          </span>
        </div>
      ))}
      <div className="mt-2 flex flex-col gap-2 rounded-campo border border-dashed border-border-field p-4">
        <div className="flex gap-2">
          {(['CORRECCION', 'CORRECTIVA', 'MEJORA'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPapel(p)}
              aria-pressed={papel === p}
              className="rounded-chip px-3 py-1 text-11"
              style={{ background: papel === p ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)', border: '1px solid var(--hf-border-field)', color: papel === p ? 'var(--hf-brand-nav)' : 'var(--hf-text-muted)' }}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título de la acción"
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        />
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Descripción"
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        />
        <input
          type="date"
          value={fechaLimite}
          onChange={(e) => setFechaLimite(e.target.value)}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
        />
        <button
          onClick={async () => {
            const r = await agregarAccionHallazgo(hallazgo.codigo, {
              papel,
              titulo,
              descripcion,
              responsableId: hallazgo.responsable?.id ?? 0,
              fechaLimite: new Date(`${fechaLimite}T00:00:00.000Z`),
            });
            if (r.ok) {
              setMensaje(r.mensaje);
              setTimeout(() => window.location.reload(), 800);
            } else setError(r.mensaje);
          }}
          className="w-fit rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          + Agregar acción
        </button>
      </div>
    </section>
  );
}

function Eficacia({
  hallazgo,
  setMensaje,
  setError,
}: {
  hallazgo: HallazgoFicha;
  setMensaje: (m: string) => void;
  setError: (e: string) => void;
}) {
  const [resultado, setResultado] = useState<'EFICAZ' | 'NO_EFICAZ'>('EFICAZ');
  const [nota, setNota] = useState('');

  return (
    <section className="flex max-w-[860px] flex-col gap-3">
      <Regla etiqueta="Historial de verificaciones" />
      {hallazgo.verificaciones.length === 0 && (
        <p className="text-12 text-muted">
          Todavía no se verificó la eficacia. Verificar es comprobar que la causa dejó de
          producir el efecto, no que la acción se hizo.
        </p>
      )}
      {hallazgo.verificaciones.map((v, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 rounded-campo border border-border-field bg-surface px-4 py-2.5"
        >
          <span className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold" style={{ background: v.resultado === 'EFICAZ' ? '#e6efe9' : '#fdeeeb', color: v.resultado === 'EFICAZ' ? '#0b5c44' : '#a52016' }}>
            {v.resultado === 'EFICAZ' ? 'Eficaz' : 'No eficaz'}
          </span>
          <span className="min-w-0 flex-1 truncate text-12_5 text-primary">{v.nota ?? '—'}</span>
          <span className="text-11_5 text-muted">{v.fecha} · {v.verificadoPor}</span>
        </div>
      ))}
      {hallazgo.verificaciones.some((v) => v.resultado === 'NO_EFICAZ') && (
        <p className="rounded-campo px-3 py-2 text-11_5" style={{ background: '#fdeeeb', color: '#a52016' }}>
          La verificación resultó no eficaz: el hallazgo no se cerró ni se anuló, y la causa raíz
          probablemente no era la causa. Queda en el historial.
        </p>
      )}
      <div className="flex items-center gap-2">
        {(['EFICAZ', 'NO_EFICAZ'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setResultado(r)}
            aria-pressed={resultado === r}
            className="rounded-chip px-3 py-1.5 text-12"
            style={{ background: resultado === r ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)', border: '1px solid var(--hf-border-field)', color: resultado === r ? 'var(--hf-brand-nav)' : 'var(--hf-text-muted)' }}
          >
            {r === 'EFICAZ' ? 'Eficaz' : 'No eficaz'}
          </button>
        ))}
      </div>
      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        rows={2}
        placeholder="Nota de la verificación"
        className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
      />
      <button
        onClick={async () => {
          const r = await verificarEficacia(hallazgo.codigo, { resultado, nota });
          if (r.ok) {
            setMensaje(r.mensaje);
            setTimeout(() => window.location.reload(), 800);
          } else setError(r.mensaje);
        }}
        className="w-fit rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        Registrar verificación
      </button>

      <div className="mt-3 flex flex-col gap-2.5">
        <Regla etiqueta="Cierre" />
        <div className="grid grid-cols-3 gap-3.5">
          <Campo
            etiqueta="Cierra"
            valor={
              hallazgo.cerradoPor ??
              (hallazgo.verificacionEficaz
                ? 'Listo para cerrar · alguien distinto del responsable'
                : 'Pendiente · requiere verificación eficaz')
            }
            tenue={hallazgo.cerradoPor === null}
          />
          <Campo etiqueta="Fecha de cierre" valor={hallazgo.fechaCierre ?? '—'} tenue={hallazgo.fechaCierre === null} />
          <Campo etiqueta="Regla" valor="Nadie cierra su propio hallazgo" />
        </div>
      </div>
    </section>
  );
}

/// La regla del lienzo: rótulo, luego una línea que ocupa el resto del ancho.
function Regla({ etiqueta }: { etiqueta: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="etiqueta-campo">{etiqueta}</span>
      <span className="h-px flex-1" style={{ background: 'var(--hf-hairline-strong)' }} />
    </span>
  );
}

const PAPEL: Record<string, { background: string; color: string }> = {
  CORRECCION: { background: '#fff3e6', color: '#8a4407' },
  CORRECTIVA: { background: '#e9f0fb', color: '#12437f' },
  MEJORA: { background: '#e8f4ef', color: '#0b5c44' },
  VERIFICACION: { background: '#faf1d3', color: '#6b5410' },
};

function Campo({
  etiqueta,
  valor,
  rojo,
  /// Para un valor que todavía no existe: se lee como dato pendiente, no como dato.
  tenue,
  ancho,
}: {
  etiqueta: string;
  valor: string;
  rojo?: boolean;
  tenue?: boolean;
  ancho?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${ancho ?? ''}`}>
      <span className="etiqueta-campo">{etiqueta}</span>
      <span
        className="text-12_5 text-primary"
        style={
          rojo
            ? { color: 'var(--hf-danger-text)' }
            : tenue
              ? { color: 'var(--hf-text-label)' }
              : undefined
        }
      >
        {valor}
      </span>
    </div>
  );
}