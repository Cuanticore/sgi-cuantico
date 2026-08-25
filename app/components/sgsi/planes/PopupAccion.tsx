'use client';

// app/components/sgsi/planes/PopupAccion.tsx
//
// Handoff v2.1, the plan-action edit popup on screen 8.
//
// The conditional blocks are the substance here, not decoration. ISO 27001 6.1.3 does
// not accept an acceptance without an expiry date or a transfer without an instrument, so
// those fields appear when the treatment type demands them and the save is refused
// without them — the action enforces the same rule, because a server action is reachable
// without this screen.

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Popup from '@/app/components/sgsi/Popup';
import { darDeBajaAccion, guardarAccion, type DatosAccion } from '@/app/sgsi/acciones/plan';
import type { EstadoAccion, TipoAccion, VerificacionEficacia } from '@prisma/client';
import type { AccionVista, Opcion, OpcionControl, OpcionMadurez } from './PlanesTratamiento';

const TIPOS: { valor: TipoAccion; etiqueta: string }[] = [
  { valor: 'MITIGAR', etiqueta: 'Mitigar' },
  { valor: 'TRANSFERIR', etiqueta: 'Transferir' },
  { valor: 'EVITAR', etiqueta: 'Evitar' },
  { valor: 'ACEPTAR', etiqueta: 'Aceptar' },
];

const ESTADOS: { valor: EstadoAccion; etiqueta: string }[] = [
  { valor: 'NO_INICIADA', etiqueta: 'No iniciada' },
  { valor: 'EN_EJECUCION', etiqueta: 'En ejecución' },
  { valor: 'EN_VERIFICACION', etiqueta: 'En verificación' },
  { valor: 'CERRADA', etiqueta: 'Cerrada' },
  { valor: 'CANCELADA', etiqueta: 'Cancelada' },
];

const VERIFICACIONES: { valor: VerificacionEficacia; etiqueta: string }[] = [
  { valor: 'PENDIENTE', etiqueta: 'Pendiente' },
  { valor: 'VERIFICADA_EFICAZ', etiqueta: 'Verificada — eficaz' },
  { valor: 'VERIFICADA_NO_EFICAZ', etiqueta: 'Verificada — no eficaz' },
  { valor: 'NO_APLICA', etiqueta: 'No aplica' },
];

interface Props {
  accion: AccionVista;
  controles: OpcionControl[];
  cargos: Opcion[];
  madurez: OpcionMadurez[];
  onCerrar: () => void;
}

export default function PopupAccion({ accion, controles, cargos, madurez, onCerrar }: Props) {
  const [d, setD] = useState<DatosAccion>({
    accion: accion.accion,
    tipo: accion.tipo as TipoAccion,
    controlId: accion.controlId,
    origen: accion.origen,
    responsableId: accion.responsableId,
    apruebaId: accion.apruebaId,
    fechaObjetivo: accion.fechaObjetivo,
    recursos: accion.recursos,
    estado: accion.estado as EstadoAccion,
    avance: accion.avance,
    verificacion: accion.verificacion as VerificacionEficacia,
    observacion: accion.observacion,
    madurezAlcanzadaId: accion.madurezAlcanzadaId,
    instrumento: accion.instrumento,
    riesgoRemanente: accion.riesgoRemanente,
    justificacionAceptacion: accion.justificacionAceptacion,
    fechaRevisionAceptacion: accion.fechaRevisionAceptacion,
  });
  const [motivoBaja, setMotivoBaja] = useState('');
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  const set = <K extends keyof DatosAccion>(clave: K, valor: DatosAccion[K]) =>
    setD((previo) => ({ ...previo, [clave]: valor }));

  const vacio = (v: string | null | undefined) => !v || v.trim() === '';

  // The same rules the action applies, surfaced here so a refusal is never a surprise.
  const impedimentos: string[] = [];
  if (vacio(d.accion)) impedimentos.push('La acción necesita una descripción.');
  if (vacio(d.origen)) impedimentos.push('El origen y la justificación son obligatorios.');
  if (d.tipo === 'MITIGAR' && !d.controlId) {
    impedimentos.push('Una acción de mitigación necesita un control asociado.');
  }
  if (d.tipo === 'ACEPTAR') {
    if (vacio(d.justificacionAceptacion)) {
      impedimentos.push('Aceptar un riesgo exige justificación escrita.');
    }
    if (vacio(d.fechaRevisionAceptacion)) {
      impedimentos.push('Una aceptación sin fecha de revisión no se admite: caducaría nunca.');
    }
  }
  if (d.tipo === 'TRANSFERIR') {
    if (vacio(d.instrumento)) impedimentos.push('Transferir exige indicar el instrumento.');
    if (vacio(d.riesgoRemanente)) impedimentos.push('Transferir exige describir el riesgo remanente.');
  }
  if (d.estado === 'CERRADA' && d.verificacion === 'PENDIENTE') {
    impedimentos.push('No se puede cerrar con la verificación de eficacia pendiente.');
  }

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarAccion(accion.codigo, d);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        router.refresh();
        onCerrar();
      }
    });

  const darDeBaja = () =>
    iniciar(async () => {
      const r = await darDeBajaAccion(accion.codigo, motivoBaja);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        router.refresh();
        onCerrar();
      }
    });

  return (
    <Popup
      titulo={`Editar ${accion.codigo}`}
      subtitulo="Una fila por acción sobre un control, no por riesgo."
      ancho={820}
      onCerrar={onCerrar}
      pie={
        <>
          {aviso && (
            <span
              className="mr-auto text-11_5"
              style={{ color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)' }}
            >
              {aviso.texto}
            </span>
          )}
          {!confirmandoBaja && (
            <button
              onClick={() => setConfirmandoBaja(true)}
              className="mr-auto rounded-campo border border-danger-border px-3 py-1.5 font-mono text-10_5 uppercase tracking-[0.1em] text-danger-text hover:bg-danger-bg"
            >
              Dar de baja la acción
            </button>
          )}
          <button
            onClick={onCerrar}
            className="rounded-campo border border-border-field px-3 py-1.5 text-12 text-muted hover:bg-subtle"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={pendiente || impedimentos.length > 0}
            title={impedimentos.length > 0 ? impedimentos.join(' · ') : undefined}
            className="rounded-campo px-3.5 py-1.5 text-12_5 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-accent-500)' }}
          >
            {pendiente ? 'Guardando…' : 'Guardar la acción'}
          </button>
        </>
      }
    >
      {impedimentos.length > 0 && (
        <div className="mb-4 flex flex-col gap-1 rounded-campo border border-warn-border bg-warn-100 px-3 py-2">
          <span className="font-mono text-9 tracking-[0.07em] text-warn-text">
            FALTA ANTES DE GUARDAR
          </span>
          {impedimentos.map((m) => (
            <span key={m} className="text-11_5 leading-snug text-warn-text [text-wrap:pretty]">
              · {m}
            </span>
          ))}
        </div>
      )}

      {confirmandoBaja && (
        <div className="mb-4 rounded-campo border border-danger-border bg-danger-bg p-3">
          <p className="etiqueta-campo" style={{ color: 'var(--hf-danger-text)' }}>
            Motivo de la baja · obligatorio
          </p>
          <p className="mt-1 text-11 text-danger-text">
            La acción no se borra: sale de la grilla y de los KPI, y el motivo queda en la
            bitácora con tu nombre y la fecha.
          </p>
          <textarea
            value={motivoBaja}
            onChange={(e) => setMotivoBaja(e.target.value)}
            rows={2}
            className="mt-2 w-full rounded-campo border border-danger-border bg-surface px-3 py-2 text-12 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setConfirmandoBaja(false);
                setMotivoBaja('');
              }}
              className="rounded-campo border border-border-field px-3 py-1 text-11_5 text-muted hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              onClick={darDeBaja}
              disabled={pendiente || motivoBaja.trim() === ''}
              className="rounded-campo px-3 py-1 font-mono text-10_5 uppercase tracking-[0.1em] text-white disabled:opacity-50"
              style={{ background: 'var(--hf-danger-text)' }}
            >
              Confirmar la baja
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <Campo etiqueta="Acción">
          <textarea
            value={d.accion ?? ''}
            onChange={(e) => set('accion', e.target.value)}
            rows={2}
            className={entrada}
          />
        </Campo>

        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Campo etiqueta="Tipo de tratamiento">
            <select
              value={d.tipo}
              onChange={(e) => set('tipo', e.target.value as TipoAccion)}
              className={entrada}
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            etiqueta="Control asociado"
            pie={
              d.controlId ? (
                <Link
                  href="/sgsi/controles"
                  className="font-mono text-10 text-accent-700 underline decoration-accent-border underline-offset-2"
                >
                  administrar el control ↗
                </Link>
              ) : undefined
            }
          >
            <select
              value={d.controlId ?? ''}
              onChange={(e) => set('controlId', e.target.value === '' ? null : Number(e.target.value))}
              className={entrada}
            >
              <option value="">Sin control</option>
              {controles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} · {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <Campo
          etiqueta="Origen y justificación"
          pie="Por qué existe esta acción. Es la razón que exige ISO 27001 6.1.3."
        >
          <textarea
            value={d.origen ?? ''}
            onChange={(e) => set('origen', e.target.value)}
            rows={3}
            className={entrada}
          />
        </Campo>

        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Campo etiqueta="Responsable de la ejecución">
            <select
              value={d.responsableId}
              onChange={(e) => set('responsableId', Number(e.target.value))}
              className={entrada}
            >
              {cargos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            etiqueta="Propietario del riesgo que aprueba"
            pie="Distinto de quien ejecuta: ISO 27001 6.1.3 pide la aprobación del propietario."
          >
            <select
              value={d.apruebaId}
              onChange={(e) => set('apruebaId', Number(e.target.value))}
              className={entrada}
            >
              {cargos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <Campo etiqueta="Estado">
            <select
              value={d.estado}
              onChange={(e) => set('estado', e.target.value as EstadoAccion)}
              className={entrada}
            >
              {ESTADOS.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.etiqueta}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Fecha objetivo">
            <input
              type="date"
              value={d.fechaObjetivo ?? ''}
              onChange={(e) => set('fechaObjetivo', e.target.value || null)}
              className={entrada}
            />
          </Campo>

          <Campo etiqueta="Avance">
            <input
              type="number"
              min={0}
              max={100}
              value={d.avance ?? 0}
              onChange={(e) => set('avance', Number(e.target.value))}
              className={entrada}
            />
          </Campo>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Campo etiqueta="Verificación de eficacia">
            <select
              value={d.verificacion}
              onChange={(e) => set('verificacion', e.target.value as VerificacionEficacia)}
              className={entrada}
            >
              {VERIFICACIONES.map((v) => (
                <option key={v.valor} value={v.valor}>
                  {v.etiqueta}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Madurez alcanzada">
            <select
              value={d.madurezAlcanzadaId ?? ''}
              onChange={(e) =>
                set('madurezAlcanzadaId', e.target.value === '' ? null : Number(e.target.value))
              }
              className={entrada}
            >
              <option value="">Sin registrar</option>
              {madurez.map((m) => (
                <option key={m.id} value={m.id}>
                  L{m.nivel} — {m.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {/* Conditional block: transferring risk needs to say through what, and what is
            left over after the transfer. */}
        {d.tipo === 'TRANSFERIR' && (
          <div className="grid gap-4 rounded-campo border border-border-default bg-subtle p-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Campo etiqueta="Instrumento de transferencia">
              <input
                value={d.instrumento ?? ''}
                onChange={(e) => set('instrumento', e.target.value || null)}
                placeholder="Póliza, contrato, cláusula…"
                className={entrada}
              />
            </Campo>
            <Campo etiqueta="Riesgo remanente">
              <input
                value={d.riesgoRemanente ?? ''}
                onChange={(e) => set('riesgoRemanente', e.target.value || null)}
                placeholder="Qué queda después de transferir"
                className={entrada}
              />
            </Campo>
          </div>
        )}

        {/* Conditional block: an acceptance with no expiry is an acceptance forever. */}
        {d.tipo === 'ACEPTAR' && (
          <div className="rounded-campo border border-border-default bg-subtle p-3">
            <Campo etiqueta="Justificación de la aceptación">
              <textarea
                value={d.justificacionAceptacion ?? ''}
                onChange={(e) => set('justificacionAceptacion', e.target.value || null)}
                rows={2}
                className={entrada}
              />
            </Campo>
            <div className="mt-3">
              <Campo
                etiqueta="Fecha de revisión"
                pie="Una aceptación sin fecha de revisión no caduca nunca, y eso no se admite."
              >
                <input
                  type="date"
                  value={d.fechaRevisionAceptacion ?? ''}
                  onChange={(e) => set('fechaRevisionAceptacion', e.target.value || null)}
                  className={entrada}
                />
              </Campo>
            </div>
          </div>
        )}

        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Campo etiqueta="Recursos o presupuesto">
            <input
              value={d.recursos ?? ''}
              onChange={(e) => set('recursos', e.target.value || null)}
              className={entrada}
            />
          </Campo>
          <Campo etiqueta="Observaciones">
            <input
              value={d.observacion ?? ''}
              onChange={(e) => set('observacion', e.target.value || null)}
              className={entrada}
            />
          </Campo>
        </div>
      </div>
    </Popup>
  );
}

const entrada =
  'w-full rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-12_5 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300';

function Campo({
  etiqueta,
  pie,
  children,
}: {
  etiqueta: string;
  pie?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="etiqueta-campo">{etiqueta}</span>
      {children}
      {pie && <span className="text-10 leading-snug text-faint [text-wrap:pretty]">{pie}</span>}
    </label>
  );
}
