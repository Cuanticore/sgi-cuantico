'use client';

// app/sig/auditorias/externas/NuevaExterna.client.tsx
//
// `registrarAuditoriaExterna` existía desde el plan C y ninguna pantalla la invocaba: la
// pantalla listaba externas y no había forma de registrar una. Con la tabla vacía eso
// significa que el listado nunca podía dejar de estar vacío.
//
// C8 exige entidad, fechas, alcance e informe. El informe se adjunta después, en la ficha —
// acá se registra la auditoría para que exista a qué adjuntarlo; el mensaje del formulario
// lo dice para que nadie crea que con guardar ya cumplió C8.

import { useState } from 'react';
import { registrarAuditoriaExterna } from '@/app/sig/acciones/auditorias';

const TIPOS = [
  { valor: 'EXTERNA' as const, etiqueta: 'Externa · ente certificador' },
  { valor: 'PROVEEDOR' as const, etiqueta: 'A proveedor' },
];

export default function NuevaExterna({ personas }: { personas: { id: number; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState({
    entidadAuditora: '',
    tipo: 'EXTERNA' as 'EXTERNA' | 'PROVEEDOR',
    fechaInicio: '',
    fechaFin: '',
    alcance: '',
    objeto: '',
    criterios: '',
    auditorLiderId: '',
  });

  const campo = (k: keyof typeof d) => ({
    value: d[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setD({ ...d, [k]: e.target.value }),
    className: 'rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12_5',
  });

  async function guardar() {
    if (!d.entidadAuditora.trim()) return setError('Falta la entidad auditora.');
    if (!d.fechaInicio) return setError('Falta la fecha de inicio.');
    if (!d.alcance.trim()) return setError('Falta el alcance.');
    if (!d.auditorLiderId) return setError('Elegí quién responde por la auditoría.');

    setGuardando(true);
    setError(null);
    const r = await registrarAuditoriaExterna({
      entidadAuditora: d.entidadAuditora.trim(),
      tipo: d.tipo,
      fechaInicio: new Date(`${d.fechaInicio}T00:00:00.000Z`),
      fechaFin: d.fechaFin ? new Date(`${d.fechaFin}T00:00:00.000Z`) : undefined,
      alcance: d.alcance.trim(),
      objeto: d.objeto.trim(),
      criterios: d.criterios.trim(),
      auditorLiderId: Number(d.auditorLiderId),
    });
    if (r.ok) {
      window.location.reload();
      return;
    }
    setGuardando(false);
    setError(r.mensaje);
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white"
        style={{ background: 'var(--hf-brand-nav)' }}
      >
        Registrar auditoría
      </button>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-15 font-bold text-primary">Registrar auditoría externa</h2>
        <button onClick={() => setAbierto(false)} className="text-12_5 text-muted">
          Cerrar
        </button>
      </div>
      <p className="max-w-[70ch] text-11_5 text-muted [text-wrap:pretty]">
        C8 pide entidad, fechas, alcance e informe. El informe se adjunta desde la ficha, una
        vez registrada: guardar acá crea la auditoría, todavía no cumple C8.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Entidad auditora</span>
          <input {...campo('entidadAuditora')} placeholder="ICONTEC" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Tipo</span>
          <select {...campo('tipo')}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Fecha de inicio</span>
          <input {...campo('fechaInicio')} type="date" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Fecha de cierre</span>
          <input {...campo('fechaFin')} type="date" />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="etiqueta-campo">Alcance</span>
          <input {...campo('alcance')} placeholder="Los nueve procesos del SIG · sede remota" />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="etiqueta-campo">Objeto</span>
          <input {...campo('objeto')} placeholder="Auditoría de certificación ISO/IEC 27001:2022" />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="etiqueta-campo">Criterios</span>
          <input {...campo('criterios')} placeholder="ISO/IEC 27001:2022 y documentación del SIG" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Responsable por Cuántico</span>
          <select {...campo('auditorLiderId')}>
            <option value="">Elegí una persona</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="text-12" style={{ color: 'var(--hf-danger-text)' }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--hf-brand-nav)' }}
        >
          {guardando ? 'Registrando…' : 'Registrar'}
        </button>
        <button
          onClick={() => setAbierto(false)}
          className="rounded-campo border border-border-field bg-surface px-3 py-2 text-12_5 text-muted"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
