'use client';

// app/sig/personas/Personas.client.tsx
//
// Tabla del censo con chips Activas/Inactivas/Todas, el botón de sincronizar (A1) y el
// panel de reasignación de una persona inactiva (R9): sus pendientes se listan y se
// reasignan, nunca se cierran solas.

import { useState } from 'react';
import { sincronizarDirectorio } from '@/app/sig/acciones/personas';
import { reasignarPendientesDe } from '@/app/sig/acciones/tareas';
import type { RolDeclarado } from '@/lib/sgsi/permisos';

/// Una asignación abierta de la persona, para listarla antes de moverla.
export interface AsignacionAbierta {
  id: number;
  codigo: string;
  titulo: string;
  fechaLimite: string;
  vencida: boolean;
}

export interface PersonaFila {
  id: number;
  nombre: string;
  correo: string;
  area: string | null;
  cargo: string | null;
  activa: boolean;
  sincronizadaEn: string | null;
  /// Pendientes ABIERTOS. Las vencidas son un subconjunto, no el total.
  pendientes: number;
  vencidas: number;
  abiertas: AsignacionAbierta[];
  /// Derivado del Directorio al leer, nunca guardado. `DESCONOCIDO` no es Colaborador.
  rol: RolDeclarado;
}

/// Cómo se ve cada rol. `DESCONOCIDO` no se pinta como un rol más: lleva los tokens de
/// aviso, porque lo que informa es que el dato falta.
const CHIP_ROL: Record<RolDeclarado, { fondo: string; texto: string; etiqueta: string }> = {
  RESPONSABLE: {
    fondo: 'var(--hf-brand-100)',
    texto: 'var(--hf-brand-nav)',
    etiqueta: 'Responsable SIG',
  },
  COLABORADOR: {
    fondo: 'var(--hf-bg-subtle)',
    texto: 'var(--hf-text-secondary)',
    etiqueta: 'Colaborador',
  },
  DESCONOCIDO: {
    fondo: 'var(--hf-warn-100)',
    texto: 'var(--hf-warn-text)',
    etiqueta: 'Sin consultar',
  },
};

export default function PersonasClient({
  filas,
  administra,
  rolesConsultables,
  motivoSinRoles,
}: {
  filas: PersonaFila[];
  administra: boolean;
  rolesConsultables: boolean;
  /// La causa REAL de que no se pudieran leer los roles, ya redactada. Es `null` cuando
  /// sí se pudieron: no hay nada que explicar.
  motivoSinRoles: string | null;
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
    // `reasignando.id` es el id de la PERSONA, y esta acción es la que espera eso. Antes se
    // llamaba a `reasignarAsignacion`, que recibe el id de una ASIGNACIÓN: con ese número
    // movía la tarea de un tercero sin relación con nadie de este panel.
    const r = await reasignarPendientesDe(
      reasignando.id,
      Number(destino),
      reasignando.activa
        ? `reasignación de la carga abierta de ${reasignando.nombre}`
        : `reasignación por inactivación de ${reasignando.nombre}`,
    );
    if (r.ok) {
      setMensaje(r.mensaje);
      setReasignando(null);
      setDestino('');
    } else {
      setError(r.mensaje);
    }
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

      {!rolesConsultables && (
        <p
          className="mt-4 max-w-[86ch] rounded-campo px-3 py-2 text-11_5 leading-relaxed [text-wrap:pretty]"
          style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
        >
          <strong className="font-semibold">El rol no se pudo consultar.</strong> Lo dan los
          grupos del Directorio y la aplicación no guarda roles, así que se pregunta a
          Microsoft Graph al abrir la pantalla. {motivoSinRoles ?? 'Esa consulta no respondió.'}{' '}
          La columna queda en «sin consultar» a propósito — pintar a todos como Colaborador
          sería una tabla de permisos que miente.
        </p>
      )}

      <div className="mt-5 overflow-hidden rounded-tarjeta border border-border-field bg-surface">
        <table className="w-full text-left text-12_5">
          <thead>
            <tr className="text-11 uppercase tracking-[0.05em]" style={{ color: 'var(--hf-text-label)' }}>
              <th className="px-4 py-3 font-semibold">Persona</th>
              <th className="px-4 py-3 font-semibold">Área</th>
              <th className="px-4 py-3 font-semibold">Cargo</th>
              <th className="px-4 py-3 font-semibold">Rol en el SIG</th>
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
                    style={{ background: CHIP_ROL[p.rol].fondo, color: CHIP_ROL[p.rol].texto }}
                  >
                    {CHIP_ROL[p.rol].etiqueta}
                  </span>
                </td>
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
                      // Rojo solo si hay vencidas. Antes la columna contaba únicamente
                      // vencidas, así que todo número era rojo por construcción; ahora
                      // cuenta lo abierto y pintarlo todo de rojo diría que todo urge.
                      style={{
                        color:
                          p.vencidas > 0 ? 'var(--hf-danger-text)' : 'var(--hf-text-secondary)',
                      }}
                      title={
                        p.vencidas > 0
                          ? `${p.pendientes} abierta(s), ${p.vencidas} vencida(s) — reasignar`
                          : `${p.pendientes} abierta(s) en plazo — reasignar`
                      }
                    >
                      {p.pendientes}
                      {p.vencidas > 0 && (
                        <span className="text-9_5"> ({p.vencidas} venc.)</span>
                      )}
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
              {reasignando.activa
                ? `Carga abierta de ${reasignando.nombre}`
                : `${reasignando.nombre} ya no figura en el Directorio`}
            </h2>
            <p className="text-12_5 text-muted">
              {reasignando.activa
                ? 'Estas asignaciones pasan completas a otra persona, con motivo en bitácora.'
                : 'Sus pendientes siguen exigibles y hay que reasignarlas. No se cierran solas (R9).'}
              {reasignando.vencidas > 0 && (
                <>
                  {' '}
                  <strong style={{ color: 'var(--hf-danger-text)' }}>
                    {reasignando.vencidas} vencida(s).
                  </strong>
                </>
              )}
            </p>

            {/* Se listan una por una: mover «3 pendientes» sin decir cuáles obliga a salir
                de la pantalla para saber qué se está reasignando. */}
            <ul className="flex max-h-[210px] flex-col gap-1 overflow-y-auto rounded-campo border border-border-field p-2">
              {reasignando.abiertas.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 px-1 py-1">
                  <span className="min-w-0 text-12_5 text-primary">
                    <span className="font-mono text-11 text-muted">{a.codigo}</span>{' '}
                    {a.titulo}
                  </span>
                  <span
                    className="shrink-0 font-mono text-10_5"
                    style={{
                      color: a.vencida ? 'var(--hf-danger-text)' : 'var(--hf-text-secondary)',
                    }}
                  >
                    {a.fechaLimite.slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
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
                {/* Dice cuántas porque las mueve TODAS, en una transacción. Un «Reasignar»
                    suelto al lado de una lista no dice si mueve una o las seis. */}
                {reasignando.pendientes === 1
                  ? 'Reasignar la pendiente'
                  : `Reasignar las ${reasignando.pendientes}`}
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