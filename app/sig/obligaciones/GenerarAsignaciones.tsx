'use client';

// app/sig/obligaciones/GenerarAsignaciones.tsx
//
// El arranque del motor de tareas, que no tenía ninguno.
//
// `generarAsignaciones()` existía en el servidor desde el plan A2 y NINGUNA pantalla la
// invocaba. Sin ella no se crea una sola asignación; sin asignaciones Mi SIG está vacío para
// siempre, y con Mi SIG vacío el módulo A entero es inalcanzable — las obligaciones se
// pueden capturar y no producen nada. El motor estaba completo y sin llave de encendido.
//
// Vive en Obligaciones porque es donde se define QUÉ hay que generar, y porque el resultado
// —cuántas asignaciones nacieron— sólo tiene sentido junto a la lista que las origina.
//
// La acción es idempotente por diseño (`@@unique([obligacionId, personaId, periodo])`), así
// que el botón se puede pulsar dos veces sin duplicar nada. Eso es deliberado: un motor que
// hay que correr con miedo no se corre.

import { useState } from 'react';
import { generarAsignaciones } from '@/app/sig/acciones/tareas';

export default function GenerarAsignaciones() {
  const [corriendo, setCorriendo] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);

  async function correr() {
    setCorriendo(true);
    setResultado(null);
    const r = await generarAsignaciones();
    setResultado({ ok: r.ok, mensaje: r.mensaje });
    setCorriendo(false);
    // Sólo se recarga cuando algo cambió: recargar tras un «no hay nada nuevo» borraría el
    // mensaje antes de que alcance a leerse.
    if (r.ok && r.creadas > 0) setTimeout(() => window.location.reload(), 1400);
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={correr}
        disabled={corriendo}
        className="rounded-campo border px-3.5 py-2 text-12_5 font-semibold disabled:opacity-60"
        style={{
          borderColor: 'var(--hf-accent-border)',
          background: 'var(--hf-accent-100)',
          color: 'var(--hf-accent-700)',
        }}
      >
        {corriendo ? 'Generando…' : 'Generar asignaciones'}
      </button>
      {resultado && (
        <p
          className="max-w-[34ch] text-11_5 [text-wrap:pretty]"
          style={{
            color: resultado.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
            textAlign: 'right',
          }}
        >
          {resultado.mensaje}
        </p>
      )}
    </div>
  );
}
