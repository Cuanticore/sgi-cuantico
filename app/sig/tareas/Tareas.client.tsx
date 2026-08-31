'use client';

// app/sig/tareas/Tareas.client.tsx
//
// Tabla con selección múltiple; la banda azul aparece solo con selección (sc-if del
// lienzo) y cada acción pide su motivo.

import { useState } from 'react';
import {
  anularAsignacion,
  prorrogarAsignacion,
  reasignarAsignacion,
} from '@/app/sig/acciones/tareas';

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
      <div className="flex flex-col gap-0.5">
        <h1 className="titulo-pagina">Tareas</h1>
        <p className="text-12_5 text-muted">{filas.length} asignaciones</p>
      </div>

      <nav className="mt-4 flex items-center gap-2">
        {conteos(filas).map(([etiqueta, n]) => (
          <span
            key={etiqueta}
            className="rounded-chip border border-border-field bg-surface px-3.5 py-1.5 text-12 text-muted"
          >
            {etiqueta} · {n}
          </span>
        ))}
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
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
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