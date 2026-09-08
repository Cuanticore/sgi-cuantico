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

/// El resultado de la última corrida de sincronización, ya reconstruido en el servidor.
/// Es `null` —y no cuatro ceros— cuando la bitácora no tiene ninguna: no saber y no haber
/// cambiado nada son dos cosas distintas y la franja las dice distinto.
export interface Corrida {
  /// Instante de la corrida, en ISO.
  cuando: string;
  altas: number;
  actualizaciones: number;
  inactivaciones: number;
  reactivaciones: number;
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
  corrida,
  administra,
  rolesConsultables,
  motivoSinRoles,
}: {
  filas: PersonaFila[];
  corrida: Corrida | null;
  administra: boolean;
  rolesConsultables: boolean;
  /// La causa REAL de que no se pudieran leer los roles, ya redactada. Es `null` cuando
  /// sí se pudieron: no hay nada que explicar.
  motivoSinRoles: string | null;
}) {
  const [filtro, setFiltro] = useState<'activas' | 'inactivas' | 'todas'>('activas');
  const [mensaje, setMensaje] = useState<string | null>(null);
  /// Las colisiones de identidad de la última corrida. Viven en estado propio y NO en el
  /// mensaje porque el mensaje se lo lleva la recarga: hay que poder leerlas y anotarlas.
  const [conflictos, setConflictos] = useState<
    { nombre: string; correo: string; nombreExistente: string; activaExistente: boolean }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  // La persona ABIERTA, que ya no es lo mismo que «la que se está reasignando»: el lienzo
  // hace de cada fila un botón, así que se abre también a quien no tiene nada que mover.
  const [elegida, setElegida] = useState<PersonaFila | null>(null);
  const [destino, setDestino] = useState('');

  const visibles = filas.filter((f) =>
    filtro === 'todas' ? true : filtro === 'activas' ? f.activa : !f.activa,
  );

  const conteos = {
    activas: filas.filter((f) => f.activa).length,
    inactivas: filas.filter((f) => !f.activa).length,
    todas: filas.length,
  };

  async function sincronizar() {
    setSincronizando(true);
    setError(null);
    setMensaje(null);
    const r = await sincronizarDirectorio();
    setSincronizando(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }

    setMensaje(r.mensaje);
    setConflictos(r.conflictos);

    // Con conflictos NO se recarga sola. La corrida se aplicó, pero hay gente del
    // Directorio que quedó afuera y alguien tiene que decidir qué hacer con cada una:
    // recargar a los 900 ms se llevaría por delante la única vez que eso se dice.
    if (r.conflictos.length === 0) setTimeout(() => window.location.reload(), 900);
  }

  async function reasignar() {
    if (!elegida) return;
    setError(null);
    setMensaje(null);
    // `reasignando.id` es el id de la PERSONA, y esta acción es la que espera eso. Antes se
    // llamaba a `reasignarAsignacion`, que recibe el id de una ASIGNACIÓN: con ese número
    // movía la tarea de un tercero sin relación con nadie de este panel.
    const r = await reasignarPendientesDe(
      elegida.id,
      Number(destino),
      elegida.activa
        ? `reasignación de la carga abierta de ${elegida.nombre}`
        : `reasignación por inactivación de ${elegida.nombre}`,
    );
    if (r.ok) {
      setMensaje(r.mensaje);
      setElegida(null);
      setDestino('');
    } else {
      setError(r.mensaje);
    }
  }

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-start justify-between gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="titulo-pagina">Personas</h1>
          {/*
            Es la única frase que explica por qué el Área se edita acá y el Nombre no. Estaba
            en su lugar el recuento de activas, que la tabla ya muestra fila por fila y los
            chips ahora cuentan: repetir un número desplazaba la regla que nadie más dice.
          */}
          <p className="max-w-[78ch] text-12_5 leading-relaxed text-muted [text-wrap:pretty]">
            El Directorio manda sobre el nombre, el correo y la existencia. El SIG manda sobre
            el área y el cargo. Quien sale de la organización se inactiva, nunca se borra.
          </p>
        </div>
        <div className="flex flex-none items-center gap-3">
          <div className="flex flex-col items-end gap-0.5">
            <span className="etiqueta-campo">Última sincronización</span>
            {/* Con la HORA: `slice(0, 10)` la tiraba, y en una sincronización que se corre
                varias veces al día la fecha sola no distingue la corrida de esta mañana de
                la de anoche. Se lee en UTC, igual que el resto de las fechas del sistema. */}
            <span className="font-mono text-11 text-secondary-soft">
              {ultimaSincronizacion(filas) ?? 'sin sincronizar'}
            </span>
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
      </div>

      <FranjaCorrida corrida={corrida} />

      {mensaje && (
        <p
          className="mt-4 rounded-campo px-3 py-2 text-12"
          style={
            conflictos.length > 0
              ? { background: 'var(--hf-row-ambar, #fdf3e3)', color: '#8a4407' }
              : { background: 'var(--hf-row-verde)', color: 'var(--hf-accent-700)' }
          }
        >
          {mensaje}
        </p>
      )}

      {/* Cada colisión, con nombre y nombre: el conteo no le sirve a quien tiene que
          decidir si son la misma persona o dos distintas. */}
      {conflictos.length > 0 && (
        <div
          className="mt-2 flex flex-col gap-1.5 rounded-campo px-3 py-2.5 text-12"
          style={{ background: 'var(--hf-bg-subtle)', border: '1px solid #e6c9a0' }}
        >
          <span className="text-11 font-semibold uppercase tracking-wide" style={{ color: '#8a4407' }}>
            Sin aplicar · el correo ya es de otra persona
          </span>
          {conflictos.map((c) => (
            <span key={c.correo} className="text-11_5 leading-relaxed text-primary">
              <strong className="font-semibold">{c.nombre}</strong>{' '}
              <span className="font-mono text-10_5 text-muted">{c.correo}</span> — ese correo ya
              es de <strong className="font-semibold">{c.nombreExistente}</strong>
              {c.activaExistente ? '' : ' (inactiva)'}. Si son la misma persona recreada en
              Azure, hay que reencadenar su object id; si no, corregir el correo en el
              Directorio.
            </span>
          ))}
          <span className="text-10_5 leading-relaxed text-muted">
            El resto de la corrida sí se aplicó. Nada de lo listado acá se creó ni se modificó.
          </span>
        </div>
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
            className="flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 text-12 capitalize"
            style={{
              background: filtro === f ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: filtro === f ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
              border: '1px solid var(--hf-border-field)',
              fontWeight: filtro === f ? 600 : 500,
            }}
          >
            {f}
            {/* El conteo va en el chip y no dentro de la tabla: es lo que decide si vale la
                pena cambiar de filtro, y ya estaba calculado para el encabezado. */}
            <span className="font-mono text-10 opacity-75">{conteos[f]}</span>
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
              <tr
                key={p.id}
                className="border-t border-border-default"
                // La fila elegida se resalta porque el panel que abre es lateral y no tapa
                // la tabla: sin resalte, dos clics seguidos no dicen de quién es el panel.
                style={{
                  background:
                    elegida?.id === p.id ? 'var(--hf-brand-100-soft)' : 'var(--hf-bg-surface)',
                }}
              >
                <td className="px-4 py-3">
                  {/*
                    La fila entera abre a la persona. El único disparador era el número de
                    Pendientes, así que una desvinculada con cero pendientes —justo la que
                    hay que revisar— no se podía abrir: la celda caía en un `<span>` muerto.
                  */}
                  <button
                    onClick={() => setElegida(p)}
                    className="flex w-full items-center gap-2.5 text-left focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                  >
                    <span
                      className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-10_5 font-bold"
                      style={{
                        background: p.activa ? 'var(--hf-brand-100)' : 'var(--hf-bg-subtle)',
                        color: p.activa ? 'var(--hf-brand-nav)' : 'var(--hf-text-label)',
                      }}
                    >
                      {iniciales(p.nombre)}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      {/*
                        Una inactiva se atenúa entera —nombre, correo, área y cargo— para
                        que se distinga de un barrido de la vista sin leer la columna Estado.
                        Sigue ahí y sigue siendo pulsable: atenuada no es deshabilitada.
                      */}
                      <span
                        className="font-medium"
                        style={{
                          color: p.activa
                            ? 'var(--hf-text-primary)'
                            : 'var(--hf-text-secondary-soft)',
                        }}
                      >
                        {p.nombre}
                      </span>
                      <span className="font-mono text-10_5 text-muted">{p.correo}</span>
                    </span>
                  </button>
                </td>
                <td
                  className="px-4 py-3"
                  style={{
                    color: p.activa ? 'var(--hf-text-secondary-soft)' : 'var(--hf-text-label)',
                  }}
                >
                  {p.area ?? '—'}
                </td>
                <td
                  className="px-4 py-3"
                  style={{
                    color: p.activa ? 'var(--hf-text-secondary-soft)' : 'var(--hf-text-label)',
                  }}
                >
                  {p.cargo ?? '—'}
                </td>
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
                      onClick={() => setElegida(p)}
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

      {elegida && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6"
          onClick={() => setElegida(null)}
        >
          <div
            className="flex w-full max-w-[480px] flex-col gap-4 rounded-modal bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            style={{
              borderTop: `3px solid ${
                elegida.pendientes > 0 ? 'var(--hf-danger-text)' : 'var(--hf-border-field)'
              }`,
            }}
          >
            {/* El eyebrow del lienzo nombra la situación antes que a la persona: quien abre
                este panel necesita saber en un renglón por qué está abierto. */}
            <div className="flex flex-col gap-1">
              <span
                className="etiqueta-campo"
                style={{
                  color: !elegida.activa && elegida.pendientes > 0
                    ? 'var(--hf-danger-text)'
                    : 'var(--hf-text-label)',
                }}
              >
                {eyebrow(elegida)}
              </span>
              <h2 className="text-15 font-semibold text-primary">
                {elegida.activa
                  ? `Carga abierta de ${elegida.nombre}`
                  : `${elegida.nombre} ya no figura en el Directorio`}
              </h2>
            </div>
            <p className="text-12_5 text-muted">
              {elegida.pendientes === 0
                ? // Cero abiertas no es lo mismo que «nada que hacer acá»: se dice que no
                  // hay nada que mover, en vez de ofrecer una reasignación vacía.
                  'No tiene asignaciones abiertas: no hay nada que reasignar.'
                : elegida.activa
                  ? 'Estas asignaciones pasan completas a otra persona, con motivo en bitácora.'
                  : 'Sus pendientes siguen exigibles y hay que reasignarlas. No se cierran solas (R9).'}
              {elegida.vencidas > 0 && (
                <>
                  {' '}
                  <strong style={{ color: 'var(--hf-danger-text)' }}>
                    {elegida.vencidas} vencida(s).
                  </strong>
                </>
              )}
            </p>

            {elegida.pendientes > 0 && (
              <>
              {/* Se listan una por una: mover «3 pendientes» sin decir cuáles obliga a salir
                  de la pantalla para saber qué se está reasignando. */}
              <ul className="flex max-h-[210px] flex-col gap-1 overflow-y-auto rounded-campo border border-border-field p-2">
                {elegida.abiertas.map((a) => (
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
                    .filter((f) => f.activa && f.id !== elegida.id)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nombre}
                      </option>
                    ))}
                </select>
              </label>
              </>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setElegida(null)}
                className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 text-muted"
              >
                {elegida.pendientes === 0 ? 'Cerrar' : 'Cancelar'}
              </button>
              {elegida.pendientes > 0 && (
                <button
                  onClick={reasignar}
                  disabled={!destino}
                  className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--hf-danger-text)' }}
                >
                  {/* Dice cuántas porque las mueve TODAS, en una transacción. Un «Reasignar»
                      suelto al lado de una lista no dice si mueve una o las seis. */}
                  {elegida.pendientes === 1
                    ? 'Reasignar la pendiente'
                    : `Reasignar las ${elegida.pendientes}`}
                </button>
              )}
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

/// El resultado de la última corrida, permanente bajo el encabezado.
///
/// Vivía sólo dentro del mensaje que aparecía al pulsar Sincronizar, así que entrar en frío
/// no dejaba ver qué había hecho la última corrida. Ahora se reconstruye desde la bitácora
/// en el servidor; cuando la bitácora no tiene ninguna, la franja lo DICE en vez de pintar
/// cuatro ceros, que se leerían como «corrió y no cambió nada».
function FranjaCorrida({ corrida }: { corrida: Corrida | null }) {
  const cifras = corrida
    ? [
        { valor: corrida.altas, etiqueta: 'altas', color: 'var(--hf-accent-700)' },
        { valor: corrida.actualizaciones, etiqueta: 'actualizaciones', color: 'var(--hf-brand-nav)' },
        { valor: corrida.inactivaciones, etiqueta: 'inactivaciones', color: 'var(--hf-danger-text)' },
        { valor: corrida.reactivaciones, etiqueta: 'reactivaciones', color: 'var(--hf-text-secondary-soft)' },
      ]
    : [];

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-tarjeta border border-border-field bg-surface px-4 py-3">
      <span className="etiqueta-campo">
        {corrida ? 'Última corrida con cambios' : 'Resultado de la última corrida'}
      </span>
      {corrida ? (
        <>
          <span className="font-mono text-10_5 text-muted">{fechaHora(corrida.cuando)}</span>
          {cifras.map((c) => (
            <span key={c.etiqueta} className="flex items-baseline gap-1.5">
              <span
                className="font-mono text-15 font-semibold tabular-nums"
                style={{ color: c.color }}
              >
                {c.valor}
              </span>
              <span className="text-12 text-secondary-soft">{c.etiqueta}</span>
            </span>
          ))}
        </>
      ) : (
        // No es «cero altas, cero cambios»: es que no hay ninguna corrida registrada. La
        // distinción es la regla más fuerte del sistema y acá se pierde entera si se
        // sustituye por ceros.
        <span className="text-12 text-secondary-soft">
          La bitácora no registra ninguna corrida todavía.
        </span>
      )}
      <span className="ml-auto text-11_5 leading-relaxed text-muted">
        Toda alta, cambio, inactivación y reactivación queda en la bitácora con su motivo.
      </span>
    </div>
  );
}

/// La situación de la persona en un renglón, antes de su nombre.
function eyebrow(p: PersonaFila): string {
  if (!p.activa) {
    return p.pendientes > 0
      ? 'Persona inactiva · pendientes abiertos'
      : 'Persona inactiva · sin pendientes';
  }
  return p.pendientes > 0 ? 'Persona activa · carga abierta' : 'Persona activa · sin pendientes';
}

function ultimaSincronizacion(filas: PersonaFila[]): string | null {
  const fechas = filas.map((f) => f.sincronizadaEn).filter(Boolean) as string[];
  if (fechas.length === 0) return null;
  return fechaHora(fechas.sort().at(-1) as string);
}

/// «31/08/2026 · 07:14» desde el ISO, sin `toLocaleString`.
///
/// El formato se arma leyendo la cadena y no con la zona horaria del navegador a propósito:
/// el servidor y el cliente pintan lo mismo, que es lo que evita que React rehidrate con un
/// texto distinto del que envió. Es UTC, igual que el resto de las fechas del sistema.
function fechaHora(iso: string): string {
  const [fecha, hora] = iso.split('T');
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio} · ${hora?.slice(0, 5) ?? '—'}`;
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