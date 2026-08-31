'use client';

// app/sig/personas/Personas.client.tsx
//
// Tabla del censo con chips Activas/Inactivas/Todas, el botón de sincronizar (A1) y el
// panel de reasignación de una persona inactiva (R9): sus pendientes se listan y se
// reasignan, nunca se cierran solas.

import { useState } from 'react';
import { sincronizarDirectorio } from '@/app/sig/acciones/personas';
import { reasignarAsignacion } from '@/app/sig/acciones/tareas';

export interface PersonaFila {
  id: number;
  nombre: string;
  correo: string;
  area: string | null;
  cargo: string | null;
  activa: boolean;
  sincronizadaEn: string | null;
  pendientes: number;
}

export default function PersonasClient({
  filas,
  administra,
}: {
  filas: PersonaFila[];
  administra: boolean;
}) {
  const [filtro, setFiltro] = useState<'activas' | 'inactivas' | 'todas'>('activas');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [reasignando, setReasignando] = useState<PersonaFila | null>(null);
  const [destino, setDestino] = useState('');

  const visibles = filas.filter((f) =>
    filtro === 'todas' ? true : filtro === 'activas' ? f.activa : !f.activa,
  );

  async function sincronizar() {
    setSincronizando(true);
    setError(null);
    setMensaje(null);
    const r = await sincronizarDirectorio();
    setSincronizando(false);
    if (r.ok) {
      setMensaje(r.mensaje);
      setTimeout(() => window.location.reload(), 900);
    } else {
      setError(r.mensaje);
    }
  }

  async function reasignar() {
    if (!reasignando) return;
    setError(null);
    setMensaje(null);
    const r = await reasignarAsignacion(
      reasignando.id,
      Number(destino),
      `reasignación por inactivación de ${reasignando.nombre}`,
    );
    if (r.ok) setMensaje(r.mensaje);
    else setError(r.mensaje);
  }

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="titulo-pagina">Personas</h1>
          <p className="text-12_5 text-muted">
            {filas.filter((f) => f.activa).length} activas ·{' '}
            {ultimaSincronizacion(filas) ?? 'sin sincronizar'}
          </p>
        </div>
        {administra && (
          <button
            onClick={sincronizar}
            disabled={sincronizando}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-50"
            style={{ background: 'var(--hf-brand-nav)' }}
          >
            {sincronizando ? 'Sincronizando…' : 'Sincronizar con el Directorio'}
          </button>
        )}
      </div>

      {mensaje && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-12"
          style={{ background: 'var(--hf-row-verde)', color: 'var(--hf-accent-700)' }}
        >
          {mensaje}
        </p>
      )}
      {error && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-12"
          style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
        >
          {error}
        </p>
      )}

      <nav className="mt-4 flex items-center gap-2">
        {(['activas', 'inactivas', 'todas'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            aria-pressed={filtro === f}
            className="rounded-chip px-3.5 py-1.5 text-12 capitalize"
            style={{
              background: filtro === f ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: filtro === f ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
              fontWeight: filtro === f ? 600 : 500,
            }}
          >
            {f}
          </button>
        ))}
      </nav>

      <div className="mt-5 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Persona</th>
              <th className="px-4 py-3 font-semibold">Área</th>
              <th className="px-4 py-3 font-semibold">Cargo</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 text-right font-semibold">Pendientes</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.id} className="border-t border-border-default">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-10_5 font-bold"
                      style={{ background: 'var(--hf-brand-100)', color: 'var(--hf-brand-nav)' }}
                    >
                      {iniciales(p.nombre)}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-medium text-primary">{p.nombre}</span>
                      <span className="font-mono text-10_5 text-muted">{p.correo}</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{p.area ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{p.cargo ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 uppercase"
                    style={{
                      background: p.activa ? '#e8f4ef' : '#f5f7f6',
                      color: p.activa ? '#0b5c44' : '#4a544f',
                    }}
                  >
                    {p.activa ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {p.pendientes > 0 ? (
                    <button
                      onClick={() => setReasignando(p)}
                      className="font-mono text-11 font-semibold"
                      style={{ color: 'var(--hf-danger-text)' }}
                      title="Ver pendientes para reasignar"
                    >
                      {p.pendientes}
                    </button>
                  ) : (
                    <span className="font-mono text-11 text-muted">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reasignando && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6"
          onClick={() => setReasignando(null)}
        >
          <div
            className="flex w-full max-w-[480px] flex-col gap-4 rounded-modal bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            style={{ borderTop: '3px solid var(--hf-danger-text)' }}
          >
            <h2 className="text-15 font-semibold text-primary">
              {reasignando.nombre} ya no figura en el Directorio
            </h2>
            <p className="text-12_5 text-muted">
              Sus {reasignando.pendientes} pendiente(s) siguen exigibles y hay que
              reasignarlas. No se cierran solas (R9).
            </p>
            <label className="flex flex-col gap-1">
              <span className="etiqueta-campo">Reasignar a</span>
              <select
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
              >
                <option value="">Seleccionar persona activa</option>
                {filas
                  .filter((f) => f.activa && f.id !== reasignando.id)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nombre}
                    </option>
                  ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReasignando(null)}
                className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 text-muted"
              >
                Cancelar
              </button>
              <button
                onClick={reasignar}
                disabled={!destino}
                className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--hf-danger-text)' }}
              >
                Reasignar
              </button>
            </div>
            {mensaje && (
              <p className="text-12" style={{ color: 'var(--hf-accent-700)' }}>
                {mensaje}
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function ultimaSincronizacion(filas: PersonaFila[]): string | null {
  const fechas = filas.map((f) => f.sincronizadaEn).filter(Boolean) as string[];
  if (fechas.length === 0) return null;
  return `última sincronización ${fechas.sort().at(-1)?.slice(0, 10)}`;
}

function iniciales(nombre: string): string {
  return (
    nombre
      .split(/\s+/)
      .map((p) => p[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U'
  );
}