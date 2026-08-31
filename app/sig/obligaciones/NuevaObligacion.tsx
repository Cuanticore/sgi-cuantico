'use client';

// app/sig/obligaciones/NuevaObligacion.tsx
//
// Abre el formulario de la lista maestra: contenido, alcance con su destino, periodicidad,
// fechas y responsable de seguimiento. La validación (exactamente un destino) está en el
// servidor (R4) — acá solo se arma la petición.

import { useState } from 'react';
import { crearObligacion } from '@/app/sig/acciones/tareas';

export default function NuevaObligacion() {
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState({
    contenidoId: '',
    alcance: 'TODOS',
    alcancePersonaId: '',
    alcanceCargoId: '',
    alcanceAreaId: '',
    periodicidad: 'MENSUAL',
    fechaInicio: '',
    plazoDias: '15',
    diasAviso: '7',
    responsableSeguimientoId: '',
  });

  async function guardar() {
    setError(null);
    setMensaje(null);
    const r = await crearObligacion({
      contenidoId: Number(datos.contenidoId),
      alcance: datos.alcance as 'PERSONA' | 'CARGO' | 'AREA' | 'TODOS',
      alcancePersonaId: datos.alcancePersonaId ? Number(datos.alcancePersonaId) : undefined,
      alcanceCargoId: datos.alcanceCargoId ? Number(datos.alcanceCargoId) : undefined,
      alcanceAreaId: datos.alcanceAreaId ? Number(datos.alcanceAreaId) : undefined,
      periodicidad: datos.periodicidad as
        | 'UNICA'
        | 'DIARIA'
        | 'SEMANAL'
        | 'MENSUAL'
        | 'TRIMESTRAL'
        | 'SEMESTRAL'
        | 'ANUAL',
      fechaInicio: new Date(`${datos.fechaInicio}T00:00:00.000Z`),
      plazoDias: Number(datos.plazoDias),
      diasAviso: Number(datos.diasAviso),
      responsableSeguimientoId: Number(datos.responsableSeguimientoId),
    });
    if (r.ok) {
      setMensaje(r.mensaje);
      setTimeout(() => window.location.reload(), 900);
    } else {
      setError(r.mensaje);
    }
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white transition-colors focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        Nueva obligación
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6"
          onClick={() => setAbierto(false)}
        >
          <div
            className="flex max-h-full w-full max-w-[560px] flex-col gap-4 overflow-y-auto rounded-modal bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-16 font-semibold text-primary">Nueva obligación</h2>
            <Campo
              etiqueta="Contenido"
              valor={datos.contenidoId}
              set={(v) => setDatos({ ...datos, contenidoId: v })}
              placeholder="Id del contenido (Contenidos)"
            />
            <Campo
              etiqueta="Alcance"
              valor={datos.alcance}
              set={(v) => setDatos({ ...datos, alcance: v })}
              select={['TODOS', 'PERSONA', 'CARGO', 'AREA']}
            />
            {datos.alcance === 'PERSONA' && (
              <Campo etiqueta="Persona (id)" valor={datos.alcancePersonaId} set={(v) => setDatos({ ...datos, alcancePersonaId: v })} />
            )}
            {datos.alcance === 'CARGO' && (
              <Campo etiqueta="Cargo (id)" valor={datos.alcanceCargoId} set={(v) => setDatos({ ...datos, alcanceCargoId: v })} />
            )}
            {datos.alcance === 'AREA' && (
              <Campo etiqueta="Área (id)" valor={datos.alcanceAreaId} set={(v) => setDatos({ ...datos, alcanceAreaId: v })} />
            )}
            <Campo
              etiqueta="Periodicidad"
              valor={datos.periodicidad}
              set={(v) => setDatos({ ...datos, periodicidad: v })}
              select={['UNICA', 'DIARIA', 'SEMANAL', 'MENSUAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL']}
            />
            <Campo
              etiqueta="Fecha de inicio"
              valor={datos.fechaInicio}
              set={(v) => setDatos({ ...datos, fechaInicio: v })}
              tipo="date"
            />
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Plazo (días)" valor={datos.plazoDias} set={(v) => setDatos({ ...datos, plazoDias: v })} tipo="number" />
              <Campo etiqueta="Días de aviso" valor={datos.diasAviso} set={(v) => setDatos({ ...datos, diasAviso: v })} tipo="number" />
            </div>
            <Campo
              etiqueta="Responsable de seguimiento (id)"
              valor={datos.responsableSeguimientoId}
              set={(v) => setDatos({ ...datos, responsableSeguimientoId: v })}
            />

            {error && <p className="text-12" style={{ color: 'var(--hf-danger-text)' }}>{error}</p>}
            {mensaje && <p className="text-12" style={{ color: 'var(--hf-accent-700)' }}>{mensaje}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAbierto(false)}
                className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 text-muted"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white"
                style={{ background: 'var(--hf-accent-500)' }}
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Campo({
  etiqueta,
  valor,
  set,
  tipo = 'text',
  select,
  placeholder,
}: {
  etiqueta: string;
  valor: string;
  set: (v: string) => void;
  tipo?: string;
  select?: string[];
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="etiqueta-campo">{etiqueta}</span>
      {select ? (
        <select
          value={valor}
          onChange={(e) => set(e.target.value)}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        >
          {select.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={tipo}
          value={valor}
          onChange={(e) => set(e.target.value)}
          placeholder={placeholder}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-13 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        />
      )}
    </label>
  );
}