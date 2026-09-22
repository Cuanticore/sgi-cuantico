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
//
// Los campos viven en `CamposAccion.tsx`, porque los comparte con el popup de creación. Acá
// queda lo que es PROPIO de editar: el estado del formulario, la lista de impedimentos, la
// baja con su motivo y el guardado contra `guardarAccion`.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Popup from '@/app/components/sgsi/Popup';
import { darDeBajaAccion, guardarAccion, type DatosAccion } from '@/app/sgsi/acciones/plan';
import type { EstadoAccion, TipoAccion, VerificacionEficacia } from '@prisma/client';
import CamposAccion from './CamposAccion';
import type { AccionVista, Opcion, OpcionControl, OpcionMadurez } from './PlanesTratamiento';

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
      ancho={1040}
      alto="80vh"
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

      <CamposAccion d={d} set={set} controles={controles} cargos={cargos} madurez={madurez} />
    </Popup>
  );
}
