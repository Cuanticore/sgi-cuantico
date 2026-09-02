'use client';

// app/sig/tareas/Tareas.client.tsx
//
// Tabla con selección múltiple; la banda azul aparece solo con selección (sc-if del
// lienzo) y cada acción pide su motivo.
//
// El menú `⋯` de cada fila es lo que el lienzo dibuja al final de la fila y no tenía nada
// detrás. Ahí viven las dos acciones que sólo aplican a UNA asignación y no a un lote:
//
//   · «No aplica» sale del alcance sin penalizar el cumplimiento. Anular y no-aplica se
//     confunden fácil y no son lo mismo: NO_APLICA dice que la asignación nunca fue
//     exigible —la persona cambió de cargo, el sistema se dio de baja—, y por eso queda
//     fuera del denominador. Anular dice que se creó por error.
//   · «Reabrir» deshace un cierre. No es masivo a propósito: reabrir un lote de cierres
//     es la clase de operación que nadie quiere explicar después en una auditoría.
//
// Las dos estaban escritas en el servidor sin nadie que las llamara.

import { useMemo, useState } from 'react';
import {
  anularAsignacion,
  noAplicaAsignacion,
  prorrogarAsignacion,
  reabrirAsignacion,
  reasignarAsignacion,
} from '@/app/sig/acciones/tareas';

/// Pliega caja y acentos para que buscar «munoz» encuentre «Muñoz».
function plegar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export interface FilaTarea {
  id: number;
  codigo: string;
  titulo: string;
  tipo: string;
  origen: string | null;
  persona: string;
  periodo: string;
  fechaLimite: string;
  estado: string;
  vencida: boolean;
}

function fechaMas30(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

export default function TareasClient({
  filas,
  personas,
}: {
  filas: FilaTarea[];
  personas: { id: number; nombre: string }[];
}) {
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [modo, setModo] = useState<'ninguno' | 'prorrogar' | 'anular' | 'reasignar'>('ninguno');
  const [motivo, setMotivo] = useState('');
  const [destino, setDestino] = useState('');
  const [nuevaFechaLimite, setNuevaFechaLimite] = useState(fechaMas30());
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<string>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [fila, setFila] = useState<{ id: number; accion: 'no-aplica' | 'reabrir' } | null>(null);

  const porEstado = useMemo(() => conteos(filas), [filas]);

  const visibles = useMemo(() => {
    const aguja = plegar(busqueda.trim());
    return filas.filter((f) => {
      if (estado !== 'TODOS' && f.estado !== estado) return false;
      if (aguja === '') return true;
      return (
        plegar(f.persona).includes(aguja) ||
        plegar(f.titulo).includes(aguja) ||
        plegar(f.codigo).includes(aguja)
      );
    });
  }, [filas, estado, busqueda]);

  /// «No aplica» y «Reabrir» son de UNA fila y exigen motivo igual que las masivas.
  async function unaSola(motivoFila: string) {
    if (!fila) return;
    setError(null);
    setMensaje(null);
    const r =
      fila.accion === 'no-aplica'
        ? await noAplicaAsignacion(fila.id, motivoFila)
        : await reabrirAsignacion(fila.id, motivoFila);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    setFila(null);
    setMensaje(r.mensaje);
    setTimeout(() => window.location.reload(), 900);
  }

  const alternar = (id: number) => {
    const s = new Set(seleccion);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSeleccion(s);
  };

  async function ejecutar() {
    setError(null);
    setMensaje(null);
    const ids = [...seleccion];
    for (const id of ids) {
      const r =
        modo === 'anular'
          ? await anularAsignacion(id, motivo)
          : modo === 'prorrogar'
            ? await prorrogarAsignacion(id, new Date(`${nuevaFechaLimite}T00:00:00.000Z`), motivo)
            : await reasignarAsignacion(id, Number(destino), motivo);
      if (!r.ok) {
        setError(r.mensaje);
        return;
      }
    }
    setMensaje(`${ids.length} asignación(es) ${accionPasada(modo)}.`);
    setSeleccion(new Set());
    setModo('ninguno');
    setMotivo('');
    setTimeout(() => window.location.reload(), 900);
  }

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-start gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="titulo-pagina">Tareas</h1>
          <p className="max-w-[76ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            Quién debe qué y para cuándo. Reasignar, prorrogar y anular exigen motivo y quedan
            en la bitácora.
          </p>
        </div>
        <label className="ml-auto flex min-w-[248px] flex-none items-center gap-2 rounded-campo border border-border-field bg-surface px-3 py-1.5">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--hf-text-muted)"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por persona, contenido o código"
            aria-label="Buscar por persona, contenido o código"
            className="w-full bg-transparent text-12 outline-none"
          />
        </label>
      </div>

      <nav className="mt-4 flex flex-wrap items-center gap-1.5">
        {([['TODOS', filas.length], ...porEstado] as [string, number][]).map(([etiqueta, n]) => {
          const activo = estado === etiqueta;
          return (
            <button
              key={etiqueta}
              onClick={() => setEstado(etiqueta)}
              aria-pressed={activo}
              className="inline-flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 text-12"
              style={{
                background: activo ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                color: activo ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
                border: `1px solid ${activo ? 'var(--hf-brand-border)' : 'var(--hf-border-field)'}`,
                fontWeight: activo ? 600 : 500,
              }}
            >
              {etiqueta === 'TODOS' ? 'Todas' : etiqueta.replace('_', ' ').toLowerCase()}
              <span className="font-mono text-10 opacity-75">{n}</span>
            </button>
          );
        })}
      </nav>

      {seleccion.size > 0 && (
        <div
          className="mt-4 flex items-center gap-3 rounded-campo px-4 py-3"
          style={{ background: 'var(--hf-brand-100)' }}
        >
          <span className="text-12_5 font-semibold" style={{ color: 'var(--hf-brand-nav)' }}>
            {seleccion.size} asignación(es) seleccionada(s)
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setModo('reasignar')}
              className="rounded-campo px-3 py-1.5 text-12 font-semibold text-white"
              style={{ background: 'var(--hf-brand-nav)' }}
            >
              Reasignar
            </button>
            <button
              onClick={() => setModo('prorrogar')}
              className="rounded-campo px-3 py-1.5 text-12 font-semibold text-white"
              style={{ background: 'var(--hf-brand-nav)' }}
            >
              Prorrogar
            </button>
            <button
              onClick={() => setModo('anular')}
              className="rounded-campo px-3 py-1.5 text-12 font-semibold"
              style={{ background: 'var(--hf-danger-text)', color: '#ffffff' }}
            >
              Anular
            </button>
            <button
              onClick={() => setSeleccion(new Set())}
              className="rounded-campo px-3 py-1.5 text-12 text-muted"
            >
              Quitar la selección
            </button>
          </div>
        </div>
      )}

      {modo !== 'ninguno' && (
        <div className="mt-4 flex flex-col gap-2 rounded-campo border border-border-field bg-surface p-4">
          {modo === 'prorrogar' && (
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Nueva fecha límite</span>
              <input
                type="date"
                value={nuevaFechaLimite}
                onChange={(e) => setNuevaFechaLimite(e.target.value)}
                className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
              />
            </label>
          )}
          {modo === 'reasignar' && (
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Destino</span>
              <select
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
              >
                <option value="">Seleccionar persona</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Motivo (obligatorio)</span>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setModo('ninguno')}
              className="rounded-campo px-3 py-1.5 text-12 text-muted"
            >
              Cancelar
            </button>
            <button
              onClick={ejecutar}
              className="rounded-campo px-3 py-1.5 text-12 font-semibold text-white"
              style={{ background: 'var(--hf-accent-500)' }}
            >
              Aplicar
            </button>
          </div>
          {error && <p className="text-12" style={{ color: 'var(--hf-danger-text)' }}>{error}</p>}
          {mensaje && <p className="text-12" style={{ color: 'var(--hf-accent-700)' }}>{mensaje}</p>}
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="w-10 px-4 py-3" />
              <th className="px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Contenido</th>
              <th className="px-4 py-3 font-semibold">Responsable</th>
              <th className="px-4 py-3 font-semibold">Periodo</th>
              <th className="px-4 py-3 font-semibold">Fecha límite</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.id} className="border-t border-border-default">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={seleccion.has(f.id)}
                    onChange={() => alternar(f.id)}
                    className="h-[15px] w-[15px]"
                  />
                </td>
                <td className="px-4 py-3 font-mono text-11 text-muted">{f.codigo}</td>
                <td className="px-4 py-3">
                  <span className="font-medium text-primary">{f.titulo}</span>
                  {f.origen && <span className="ml-2 font-mono text-10_5 text-muted">{f.origen}</span>}
                </td>
                <td className="px-4 py-3 text-muted">{f.persona}</td>
                <td className="px-4 py-3 font-mono text-11 text-muted">{f.periodo}</td>
                <td
                  className="px-4 py-3 font-mono text-11"
                  style={{
                    color: f.vencida ? 'var(--hf-danger-text)' : 'var(--hf-text-secondary-soft)',
                    fontWeight: f.vencida ? 600 : 400,
                  }}
                >
                  {f.fechaLimite}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 uppercase"
                    style={badgeEstado(f.estado)}
                  >
                    {f.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <MenuFila
                    estado={f.estado}
                    onNoAplica={() => setFila({ id: f.id, accion: 'no-aplica' })}
                    onReabrir={() => setFila({ id: f.id, accion: 'reabrir' })}
                  />
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr className="border-t border-border-default">
                <td colSpan={8} className="px-4 py-8 text-center text-12 text-muted">
                  {filas.length === 0
                    ? 'Todavía no hay asignaciones. Se generan desde Obligaciones.'
                    : 'Ninguna asignación coincide con el filtro.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span className="text-11_5 text-muted">
          Se muestran {visibles.length} de {filas.length} asignaciones.
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span className="etiqueta-campo">Vencida se calcula</span>
          <span className="text-11_5 text-secondary-soft">
            pendiente y fecha límite anterior a hoy. No es una marca que alguien deba poner.
          </span>
        </span>
      </div>

      {fila && (
        <MotivoDeUnaFila
          accion={fila.accion}
          error={error}
          onCancelar={() => {
            setFila(null);
            setError(null);
          }}
          onAplicar={unaSola}
        />
      )}
    </main>
  );
}

/// El `⋯` del lienzo. Sólo ofrece lo que el estado admite: no-aplica sobre una pendiente,
/// reabrir sobre una realizada. Un menú que ofrece lo imposible obliga a probar para
/// enterarse.
function MenuFila({
  estado,
  onNoAplica,
  onReabrir,
}: {
  estado: string;
  onNoAplica: () => void;
  onReabrir: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const puedeNoAplicar = estado === 'PENDIENTE';
  const puedeReabrir = estado === 'REALIZADA';

  if (!puedeNoAplicar && !puedeReabrir) {
    return <span className="text-14 text-label">⋯</span>;
  }

  return (
    <span className="relative inline-block">
      <button
        onClick={() => setAbierto(!abierto)}
        aria-label="Más acciones"
        aria-expanded={abierto}
        className="px-1 text-14 text-muted"
      >
        ⋯
      </button>
      {abierto && (
        <>
          {/* Cierra al hacer clic afuera sin atrapar el teclado. */}
          <button
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setAbierto(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <span className="absolute right-0 z-40 mt-1 flex w-44 flex-col overflow-hidden rounded-campo border border-border-field bg-surface text-left shadow-lg">
            {puedeNoAplicar && (
              <button
                onClick={() => {
                  setAbierto(false);
                  onNoAplica();
                }}
                className="px-3 py-2 text-left text-12 text-secondary hover:bg-subtle"
              >
                No aplica
              </button>
            )}
            {puedeReabrir && (
              <button
                onClick={() => {
                  setAbierto(false);
                  onReabrir();
                }}
                className="px-3 py-2 text-left text-12 text-secondary hover:bg-subtle"
              >
                Reabrir
              </button>
            )}
          </span>
        </>
      )}
    </span>
  );
}

function MotivoDeUnaFila({
  accion,
  error,
  onCancelar,
  onAplicar,
}: {
  accion: 'no-aplica' | 'reabrir';
  error: string | null;
  onCancelar: () => void;
  onAplicar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const esNoAplica = accion === 'no-aplica';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
        <h2 className="text-15 font-bold text-primary">
          {esNoAplica ? 'Marcar como no aplica' : 'Reabrir la asignación'}
        </h2>
        <p className="text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
          {esNoAplica
            ? 'Sale del alcance sin penalizar el cumplimiento: queda fuera del denominador porque nunca fue exigible. No es lo mismo que anular, que dice que se creó por error.'
            : 'Deshace el cierre y la vuelve pendiente. El registro anterior no se borra: queda en la bitácora con su motivo.'}
        </p>
        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Motivo (obligatorio)</span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            autoFocus
            placeholder={esNoAplica ? 'Cambió de cargo en agosto' : 'Se cerró con la evidencia equivocada'}
            className="entrada-campo"
          />
        </label>
        {error && (
          <p className="text-12" style={{ color: 'var(--hf-danger-text)' }}>
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onCancelar} className="rounded-campo px-3 py-1.5 text-12 text-muted">
            Cancelar
          </button>
          <button
            onClick={() => onAplicar(motivo)}
            disabled={motivo.trim() === ''}
            className="rounded-campo px-3.5 py-1.5 text-12 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-accent-500)' }}
          >
            {esNoAplica ? 'Marcar' : 'Reabrir'}
          </button>
        </div>
      </div>
    </div>
  );
}

function conteos(filas: FilaTarea[]): [string, number][] {
  const por: Record<string, number> = {};
  for (const f of filas) por[f.estado] = (por[f.estado] ?? 0) + 1;
  return Object.entries(por).sort();
}

function badgeEstado(estado: string): { background: string; color: string } {
  if (estado === 'REALIZADA') return { background: '#e8f4ef', color: '#0b5c44' };
  if (estado === 'ANULADA' || estado === 'NO_APLICA') return { background: '#f5f7f6', color: '#4a544f' };
  return { background: '#e9f0fb', color: '#12437f' };
}

function accionPasada(modo: string): string {
  return (
    { prorrogar: 'prorrogada(s)', anular: 'anulada(s)', reasignar: 'reasignada(s)' }[modo] ??
    'actualizada(s)'
  );
}