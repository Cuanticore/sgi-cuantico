'use client';

// app/sig/personas/PendientesPersona.tsx
//
// La pestaña **Pendientes** del popup de una persona: qué tiene abierto, y los tres verbos
// que se ejercen sobre esa lista —asignar, reasignar y exportar—.
//
// ── POR QUÉ LA LISTA SE MUDÓ ACÁ ─────────────────────────────────────────────────────────
//
// Vivía en el pie de la pestaña **Datos base**, dentro de un bloque titulado «Carga abierta
// de …» cuyo verbo era *reasignar*. Quien entraba a mirar qué le faltaba a alguien aterrizaba
// en un formulario de edición y encontraba la respuesta abajo, enmarcada como un problema de
// traspaso. Ahora la pregunta tiene pestaña propia y el traspaso es una de las cosas que se
// pueden hacer desde ahí.
//
// **La lista no se duplica.** Existe una sola, acá, y la pestaña Cuenta la recibe por prop
// desde el popup. Dos listas de lo mismo alimentadas por dos consultas es exactamente la
// cicatriz del `rowCount` que `HARNESS.md` documenta.
//
// ── POR QUÉ LA FORMACIÓN NO SE SUBE AL TOPE ──────────────────────────────────────────────
//
// El orden es por urgencia: vencidas primero, después por fecha límite. Subir la formación
// empujaría hacia abajo una lectura **vencida** y le enseñaría a quien mira que lo de arriba
// es lo que urge, cuando no lo es. La formación se distingue por su marca de tipo, por su
// línea de avance y por un filtro de un clic.

import { useState } from 'react';

import { asignarAPersona, reasignarPendientesDe } from '@/app/sig/acciones/tareas';
import { textoPlazo } from '@/lib/sig/bandeja';
import type { PendienteDePersona } from '@/app/sig/acciones/persona-actividad';
import type { ContenidoAsignable } from './PopupPersona';
import type { PersonaFila } from './Personas.client';

/// Cómo se nombra cada tipo en la marca de la fila. El enum de la base no se muestra crudo:
/// «CURSO_VIRTUAL» es un identificador, no una palabra.
const NOMBRE_TIPO: Record<string, string> = {
  CAPACITACION: 'Capacitación',
  LECTURA: 'Lectura',
  VERIFICACION: 'Verificación',
  TAREA: 'Tarea',
  CURSO_VIRTUAL: 'Curso virtual',
};

type Panel = 'ninguno' | 'asignar' | 'reasignar';

export default function PendientesPersona({
  persona,
  pendientes,
  error,
  administra,
  contenidos,
  destinos,
  onCambio,
}: {
  persona: PersonaFila;
  /// `null` mientras no llegó. Vacío es «no tiene nada abierto», que es otra cosa.
  pendientes: PendienteDePersona[] | null;
  error: string | null;
  administra: boolean;
  contenidos: ContenidoAsignable[];
  /// Las personas activas a las que se puede traspasar. No incluye a la que está abierta.
  destinos: { id: number; nombre: string }[];
  /// Se llama después de asignar o reasignar: la lista y los contadores acaban de cambiar.
  onCambio: () => void;
}) {
  const [panel, setPanel] = useState<Panel>('ninguno');
  const [soloFormacion, setSoloFormacion] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  // P2 · sin el permiso la lista NO se pide, así que tampoco se puede quedar «cargando» para
  // siempre: se dice qué falta y quién lo da. Un spinner eterno se lee como una aplicación
  // rota, y quien lo mira va a recargar tres veces antes de sospechar que es un permiso.
  if (!administra) {
    return (
      <p className="text-12 text-muted [text-wrap:pretty]">
        No se muestran: ver los pendientes de otra persona exige{' '}
        <code>personas:administrar</code>, que da el grupo Líderes SIG del Directorio. El
        número de la columna sí es visible para todo el SIG.
      </p>
    );
  }
  if (error !== null) {
    return <p className="text-12 text-danger-text [text-wrap:pretty]">{error}</p>;
  }
  if (pendientes === null) {
    return <p className="text-12_5 text-faint">Cargando lo que tiene abierto…</p>;
  }

  const vencidas = pendientes.filter((p) => p.vencida).length;
  const deFormacion = pendientes.filter((p) => p.esFormacion).length;
  const visibles = soloFormacion ? pendientes.filter((p) => p.esFormacion) : pendientes;

  const avisar = (r: { ok: boolean; mensaje: string }) => {
    if (r.ok) {
      setMensaje(r.mensaje);
      setFallo(null);
      setPanel('ninguno');
      onCambio();
    } else {
      setFallo(r.mensaje);
      setMensaje(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-12_5 text-primary">
          {pendientes.length === 0 ? (
            'No tiene nada abierto.'
          ) : (
            <>
              <strong className="font-semibold">{pendientes.length}</strong>{' '}
              {pendientes.length === 1 ? 'abierta' : 'abiertas'}
              {vencidas > 0 && (
                <>
                  {' · '}
                  <strong className="font-semibold" style={{ color: 'var(--hf-danger-text)' }}>
                    {vencidas} {vencidas === 1 ? 'vencida' : 'vencidas'}
                  </strong>
                </>
              )}
              {/* La formación se cuenta aparte en vez de reordenarse. Es la forma de
                  destacarla sin mentir sobre qué urge. */}
              {deFormacion > 0 && ` · ${deFormacion} de formación`}
            </>
          )}
        </p>
        {deFormacion > 0 && (
          <button
            type="button"
            onClick={() => setSoloFormacion((v) => !v)}
            aria-pressed={soloFormacion}
            className="rounded-chip border border-border-field px-3 py-1 text-11_5"
            style={{
              background: soloFormacion ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
              color: soloFormacion ? 'var(--hf-brand-nav)' : 'var(--hf-text-secondary-soft)',
            }}
          >
            Sólo formación
          </button>
        )}
      </div>

      {administra && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPanel(panel === 'asignar' ? 'ninguno' : 'asignar')}
            aria-expanded={panel === 'asignar'}
            className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-11_5 text-secondary"
          >
            + Asignar
          </button>
          {/* Sin nada abierto no se ofrece mover nada, pero SÍ se ofrece asignar: es
              justamente la persona a la que hay que ponerle algo. */}
          {pendientes.length > 0 && (
            <button
              type="button"
              onClick={() => setPanel(panel === 'reasignar' ? 'ninguno' : 'reasignar')}
              aria-expanded={panel === 'reasignar'}
              className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-11_5 text-secondary"
            >
              Reasignar todas
            </button>
          )}
          {pendientes.length > 0 && (
            <a
              href={`/api/sig/exportar-pendientes?persona=${persona.id}`}
              className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-11_5 text-secondary"
            >
              Exportar
            </a>
          )}
        </div>
      )}

      {panel === 'asignar' && administra && (
        <PanelAsignar
          persona={persona}
          contenidos={contenidos}
          abiertas={pendientes}
          onHecho={avisar}
          onCancelar={() => setPanel('ninguno')}
        />
      )}

      {panel === 'reasignar' && administra && (
        <PanelReasignar
          persona={persona}
          cuantas={pendientes.length}
          destinos={destinos}
          onHecho={avisar}
          onCancelar={() => setPanel('ninguno')}
        />
      )}

      {mensaje !== null && (
        <p
          className="rounded-campo border px-3 py-2 text-12"
          style={{ background: '#e6efe9', borderColor: '#0b5c44', color: '#0b5c44' }}
        >
          {mensaje}
        </p>
      )}
      {fallo !== null && (
        <p className="text-12 [text-wrap:pretty]" style={{ color: 'var(--hf-danger-text)' }}>
          {fallo}
        </p>
      )}

      {pendientes.length === 0 ? (
        <p className="text-11_5 text-muted [text-wrap:pretty]">
          No tiene asignaciones abiertas: no hay nada que reasignar. Que no tenga nada abierto
          no significa que esté al día con todo — lo cumplido está en su expediente.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visibles.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-0.5 rounded-campo border border-border-default bg-subtle px-3 py-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0 text-12_5 text-primary">
                  <span className="font-mono text-10_5 text-accent-700">{p.codigo}</span>{' '}
                  {p.titulo}
                </span>
                <span
                  className="shrink-0 rounded-[4px] px-1.5 py-0.5 font-mono text-9 uppercase"
                  style={{
                    background: p.esFormacion ? 'var(--hf-brand-100)' : 'var(--hf-bg-app)',
                    color: p.esFormacion ? 'var(--hf-brand-nav)' : 'var(--hf-text-label)',
                  }}
                >
                  {NOMBRE_TIPO[p.tipo] ?? p.tipo}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {/* El plazo lo redacta `textoPlazo`, que es la misma función que usa la
                    bandeja de la persona. Dos redacciones del mismo plazo son dos que
                    mañana dicen cosas distintas del mismo día. */}
                <span
                  className="text-11 font-semibold"
                  style={{
                    color: p.vencida ? 'var(--hf-danger-text)' : 'var(--hf-text-secondary)',
                  }}
                >
                  {textoPlazo({ vencida: p.vencida, dias: p.dias })}
                </span>
                {p.progreso !== null && (
                  <span className="text-11 text-muted">
                    · {p.progreso.etiqueta}
                    {p.progreso.intentos > 1 &&
                      ` (intento ${p.progreso.numero} de ${p.progreso.intentos})`}
                  </span>
                )}
                {/* Cuando NO hay avance, se dice por qué. Son tres motivos distintos y cada
                    uno pide una acción distinta de quien lee. */}
                {p.progreso === null && p.sinProgresoPorque !== null && (
                  <span className="text-11 text-faint">· {p.sinProgresoPorque}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {soloFormacion && visibles.length === 0 && (
        <p className="text-11_5 text-muted">Ninguna de sus pendientes es de formación.</p>
      )}
    </div>
  );
}

/// El panel de asignar. Dos orígenes —un contenido del catálogo o una tarea puntual— y una
/// sola decisión.
function PanelAsignar({
  persona,
  contenidos,
  abiertas,
  onHecho,
  onCancelar,
}: {
  persona: PersonaFila;
  contenidos: ContenidoAsignable[];
  abiertas: PendienteDePersona[];
  onHecho: (r: { ok: boolean; mensaje: string }) => void;
  onCancelar: () => void;
}) {
  const [origen, setOrigen] = useState<'contenido' | 'puntual'>('contenido');
  const [contenidoId, setContenidoId] = useState('');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const elegido = contenidos.find((c) => String(c.id) === contenidoId) ?? null;
  // **Lo que ya tiene abierto se MARCA, no se esconde.** Esconderlo haría imposible el caso
  // legítimo —volver a asignar un curso que la persona reprobó y debe repetir— y, peor,
  // dejaría a quien mira sin saber por qué el contenido que busca no está en la lista.
  const yaAbierto = elegido === null ? null : abiertas.find((a) => a.codigo === elegido.codigo);

  async function asignar() {
    setEnviando(true);
    const r = await asignarAPersona(persona.id, {
      contenidoId: origen === 'contenido' && contenidoId !== '' ? Number(contenidoId) : null,
      titulo: origen === 'puntual' ? titulo : null,
      descripcion: origen === 'puntual' ? descripcion : null,
      fechaLimite,
      motivo,
    });
    setEnviando(false);
    onHecho(r);
  }

  return (
    <div className="flex flex-col gap-3 rounded-campo border border-border-field bg-app px-3 py-3">
      <p className="text-12_5 font-semibold text-primary">Asignarle algo a {persona.nombre}</p>

      <div className="flex gap-4">
        {(
          [
            ['contenido', 'Un contenido del catálogo'],
            ['puntual', 'Una tarea puntual'],
          ] as const
        ).map(([valor, etiqueta]) => (
          <label key={valor} className="flex items-center gap-1.5 text-12 text-secondary">
            <input
              type="radio"
              name="origen-asignacion"
              checked={origen === valor}
              onChange={() => setOrigen(valor)}
            />
            {etiqueta}
          </label>
        ))}
      </div>

      {origen === 'contenido' ? (
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Contenido</span>
          <select
            value={contenidoId}
            onChange={(e) => setContenidoId(e.target.value)}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
          >
            <option value="">Seleccionar contenido</option>
            {contenidos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.titulo}
              </option>
            ))}
          </select>
          {elegido !== null && (
            <span className="text-10_5 text-faint">
              {NOMBRE_TIPO[elegido.tipo] ?? elegido.tipo}
              {elegido.claseCurso !== null && ` · ${elegido.claseCurso.toLowerCase()}`}
              {elegido.notaMinima !== null && ` · mínimo ${elegido.notaMinima}`}
            </span>
          )}
          {yaAbierto !== null && yaAbierto !== undefined && (
            <span className="text-11" style={{ color: 'var(--hf-warn-text)' }}>
              Ya tiene {yaAbierto.codigo} abierta, con vencimiento el{' '}
              {yaAbierto.fechaLimite.slice(0, 10)}. Asignarla de nuevo le deja dos.
            </span>
          )}
        </label>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Título</span>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="etiqueta-campo">Descripción</span>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
            />
            <span className="text-10_5 text-faint [text-wrap:pretty]">
              El título solo no dice qué hay que hacer: llega a su bandeja como un renglón.
            </span>
          </label>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Vence el</span>
          <input
            type="date"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
          />
          {/* **No se propone un plazo por omisión.** Un «+30 días» sugerido sería un número
              inventado, y acá el número decide cuándo esta persona queda en rojo. */}
          <span className="text-10_5 text-faint [text-wrap:pretty]">
            No hay plazo sugerido: el número decide desde cuándo queda vencida.
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Motivo (obligatorio)</span>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
          />
          <span className="text-10_5 text-faint [text-wrap:pretty]">
            Queda en la bitácora. Es lo que responde «¿por qué tengo esto?» dentro de seis
            meses.
          </span>
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12 text-muted"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={asignar}
          disabled={enviando}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {enviando ? 'Asignando…' : 'Asignar'}
        </button>
      </div>
    </div>
  );
}

/// El traspaso completo. Baja tal cual estaba en el pie de Datos base, con sus textos: lo que
/// cambia es dónde vive, no lo que hace ni lo que advierte.
function PanelReasignar({
  persona,
  cuantas,
  destinos,
  onHecho,
  onCancelar,
}: {
  persona: PersonaFila;
  cuantas: number;
  destinos: { id: number; nombre: string }[];
  onHecho: (r: { ok: boolean; mensaje: string }) => void;
  onCancelar: () => void;
}) {
  const [destino, setDestino] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function reasignar() {
    setEnviando(true);
    const r = await reasignarPendientesDe(
      persona.id,
      Number(destino),
      persona.activa
        ? `reasignación de la carga abierta de ${persona.nombre}`
        : `reasignación por inactivación de ${persona.nombre}`,
    );
    setEnviando(false);
    onHecho(r);
  }

  return (
    <div className="flex flex-col gap-3 rounded-campo border border-border-field bg-app px-3 py-3">
      <p className="text-12_5 text-muted [text-wrap:pretty]">
        {persona.activa
          ? 'Estas asignaciones pasan completas a otra persona, con motivo en bitácora.'
          : 'Sus pendientes siguen exigibles y hay que reasignarlas. No se cierran solas (R9).'}
      </p>

      <label className="flex flex-col gap-1">
        <span className="etiqueta-campo">Reasignar a</span>
        <select
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13"
        >
          <option value="">Seleccionar persona activa</option>
          {destinos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
      </label>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12 text-muted"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={reasignar}
          disabled={!destino || enviando}
          className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--hf-danger-text)' }}
        >
          {/* Dice cuántas porque las mueve TODAS, en una transacción. Un «Reasignar» suelto
              al lado de una lista no dice si mueve una o las seis. */}
          {enviando
            ? 'Reasignando…'
            : cuantas === 1
              ? 'Reasignar la pendiente'
              : `Reasignar las ${cuantas}`}
        </button>
      </div>
    </div>
  );
}
