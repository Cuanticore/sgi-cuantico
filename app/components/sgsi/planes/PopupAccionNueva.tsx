'use client';

// app/components/sgsi/planes/PopupAccionNueva.tsx
//
// Una acción del plan que NO nace de un activo. «Adquirir póliza de ciberriesgo», por ejemplo.
//
// Las otras tres vías de creación nacen todas colgadas de algo: el `+` de Controles y madurez
// cuelga de un control con brecha, el popup de residual cuelga de un riesgo, y el de la grilla
// de análisis cuelga de las amenazas de un activo. Una póliza no cuelga de ninguno: es una
// decisión del comité sobre el riesgo agregado, y hasta hoy la única forma de registrarla era
// importar un FOR-SIG-13 o escribir en la base a mano.
//
// ── QUÉ NO HAY ACÁ, Y POR QUÉ ───────────────────────────────────────────────────────────
//
// Estado, Avance, Verificación de eficacia y Madurez alcanzada. Son el SEGUIMIENTO de una
// acción, y una acción que todavía no existe no ha avanzado nada: `crearAccionLibre` los
// escribe NO_INICIADA / 0 / PENDIENTE pase lo que pase, así que ofrecerlos sería ofrecer
// cuatro campos cuya respuesta ya está decidida. Un campo que no se respeta es peor que un
// campo ausente: quien lo llenó se va creyendo que eligió algo.
//
// Tampoco hay baja: no se da de baja algo que todavía no está.
//
// La lista de impedimentos es la misma de `PopupAccion`, y por la misma razón: la acción de
// servidor va a aplicar esas reglas igual, así que decirlas antes convierte un rechazo en una
// indicación. Lo que no hace es reemplazarlas — el servidor las vuelve a comprobar porque una
// acción de servidor es alcanzable sin pasar por esta pantalla.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Popup from '@/app/components/sgsi/Popup';
import { crearAccionLibre, type DatosAccion } from '@/app/sgsi/acciones/plan';
import CamposAccion from './CamposAccion';
import type { Opcion, OpcionControl, OpcionMadurez } from './PlanesTratamiento';

interface Props {
  controles: OpcionControl[];
  cargos: Opcion[];
  madurez: OpcionMadurez[];
  onCerrar: () => void;
}

export default function PopupAccionNueva({ controles, cargos, madurez, onCerrar }: Props) {
  const [d, setD] = useState<DatosAccion>({
    accion: '',
    // Mitigar es el tipo de la inmensa mayoría del plan, y es el que EXIGE control: partir de
    // él hace que el requisito se vea desde el primer renglón en vez de aparecer al final.
    tipo: 'MITIGAR',
    controlId: null,
    origen: '',
    responsableId: cargos[0]?.id,
    apruebaId: cargos[0]?.id,
    fechaObjetivo: null,
    recursos: null,
    observacion: null,
    madurezAlcanzadaId: null,
    instrumento: null,
    riesgoRemanente: null,
    justificacionAceptacion: null,
    fechaRevisionAceptacion: null,
  });
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();

  const set = <K extends keyof DatosAccion>(clave: K, valor: DatosAccion[K]) =>
    setD((previo) => ({ ...previo, [clave]: valor }));

  const vacio = (v: string | null | undefined) => !v || v.trim() === '';

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
  // Sin catálogo de cargos no hay a quién asignarla. Se dice acá y no se deja que el servidor
  // responda «Falta el responsable»: el problema no es del formulario, es que falta un catálogo.
  if (!d.responsableId || !d.apruebaId) {
    impedimentos.push('Falta el catálogo de cargos: una acción no puede quedar sin responsable ni sin quien la apruebe.');
  }

  const crear = () =>
    iniciar(async () => {
      const r = await crearAccionLibre(d);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        router.refresh();
        onCerrar();
      }
    });

  return (
    <Popup
      titulo="Acción nueva"
      // Lo mismo que dice el subtítulo de la pantalla, porque es la duda que trae a alguien
      // acá: no hace falta un riesgo ni un activo para registrar una acción.
      subtitulo="Una fila por acción. No hace falta que nazca de un activo: una póliza o una decisión del comité también son tratamiento."
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
          <button
            onClick={onCerrar}
            className="rounded-campo border border-border-field px-3 py-1.5 text-12 text-muted hover:bg-subtle"
          >
            Cancelar
          </button>
          <button
            onClick={crear}
            disabled={pendiente || impedimentos.length > 0}
            title={impedimentos.length > 0 ? impedimentos.join(' · ') : undefined}
            className="rounded-campo px-3.5 py-1.5 text-12_5 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-accent-500)' }}
          >
            {pendiente ? 'Creando…' : 'Crear la acción'}
          </button>
        </>
      }
    >
      {impedimentos.length > 0 && (
        <div className="mb-4 flex flex-col gap-1 rounded-campo border border-warn-border bg-warn-100 px-3 py-2">
          <span className="font-mono text-9 tracking-[0.07em] text-warn-text">
            FALTA ANTES DE CREAR
          </span>
          {impedimentos.map((m) => (
            <span key={m} className="text-11_5 leading-snug text-warn-text [text-wrap:pretty]">
              · {m}
            </span>
          ))}
        </div>
      )}

      <CamposAccion
        d={d}
        set={set}
        controles={controles}
        cargos={cargos}
        madurez={madurez}
        seguimiento={false}
      />
    </Popup>
  );
}
