'use client';

// app/estrategico/CrearAnalisis.client.tsx
//
// Sin un análisis vigente no hay a qué colgar las entradas del DOFA o del PESTEL, y hasta
// ahora la pantalla no lo decía: el botón «+» comprobaba `analisisId === null` y hacía
// `return` pelado. Se escribía la entrada, se hacía clic, y no pasaba nada — ni un mensaje,
// ni un campo deshabilitado. La acción para crearlo existía en el servidor desde el primer
// día y ninguna pantalla la invocaba.
//
// `D2` pide que un análisis de contexto tenga año y acta de aprobación, así que esto no es
// un botón: es el formulario mínimo que la regla exige. Quien lo aprueba queda registrado
// como el autor de la sesión, que es lo que pide la acción.

import { useState } from 'react';
import { crearAnalisisContexto } from '@/app/sig/acciones/estrategico';

export default function CrearAnalisis({ tipo }: { tipo: 'DOFA' | 'PESTEL' }) {
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [acta, setActa] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    const anioNumero = Number(anio);
    if (!Number.isInteger(anioNumero) || anioNumero < 2000 || anioNumero > 2100) {
      setError('El año no es válido.');
      return;
    }
    if (!acta.trim()) {
      setError('El acta de aprobación es obligatoria: un análisis sin acta no se puede auditar.');
      return;
    }
    setGuardando(true);
    setError(null);
    const r = await crearAnalisisContexto({ tipo, anio: anioNumero, actaReferencia: acta.trim() });
    if (r.ok) {
      window.location.reload();
      return;
    }
    setGuardando(false);
    setError(r.mensaje);
  }

  return (
    <div
      className="flex max-w-[74ch] flex-col gap-3 rounded-tarjeta border px-5 py-5"
      style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)' }}
    >
      <h2 className="text-15 font-bold" style={{ color: 'var(--hf-warn-text)' }}>
        Todavía no hay un {tipo} vigente
      </h2>
      <p className="text-12_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text)' }}>
        Las entradas cuelgan de un análisis aprobado, así que primero hay que crearlo. Crear el
        de un año nuevo no borra el anterior: el que estaba deja de ser vigente y queda
        consultable.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-11 font-semibold uppercase tracking-[0.06em] text-label">Año</span>
          <input
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            inputMode="numeric"
            className="w-24 rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12_5"
          />
        </label>
        <label className="flex min-w-[18rem] flex-1 flex-col gap-1">
          <span className="text-11 font-semibold uppercase tracking-[0.06em] text-label">
            Acta de aprobación
          </span>
          <input
            value={acta}
            onChange={(e) => setActa(e.target.value)}
            placeholder="ACT-COM-2026-03"
            className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12_5"
          />
        </label>
        <button
          onClick={crear}
          disabled={guardando}
          className="rounded-campo px-3.5 py-2 text-12_5 font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--hf-accent-500)' }}
        >
          {guardando ? 'Creando…' : `Crear ${tipo}`}
        </button>
      </div>

      {error && (
        <p className="text-12" style={{ color: 'var(--hf-danger-text)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
