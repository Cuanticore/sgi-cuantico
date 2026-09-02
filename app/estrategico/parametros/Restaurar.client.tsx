'use client';

// app/estrategico/parametros/Restaurar.client.tsx
//
// Devuelve los catálogos del método a MAN-CAL-01, de verdad.
//
// El botón anterior escribía «Valores del MAN-CAL-01 restaurados (seed)» y NO tocaba la
// base. Es la peor clase de defecto de los que aparecieron hoy: los otros no hacían nada, y
// se notaba; este afirmaba haber hecho algo. Quien lo pulsaba se quedaba creyendo que el
// método volvió a su línea normativa, y seguía calculando con los valores que quiso corregir.
//
// Pide motivo antes de ejecutar porque cambiar una escala recalcula los 66 registros al
// leer, y una restauración sin razón escrita es indistinguible de un accidente.

import { useState } from 'react';
import { restaurarCatalogosDelMetodo } from '@/app/sig/acciones/estrategico';

export default function Restaurar() {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [corriendo, setCorriendo] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);

  async function restaurar() {
    if (!motivo.trim()) {
      setResultado({ ok: false, mensaje: 'Escribí el motivo: queda en bitácora.' });
      return;
    }
    setCorriendo(true);
    setResultado(null);
    const r = await restaurarCatalogosDelMetodo(motivo.trim());
    setResultado({ ok: r.ok, mensaje: r.mensaje });
    setCorriendo(false);
    if (r.ok) setTimeout(() => window.location.reload(), 1600);
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded-campo border border-border-field bg-surface px-4 py-2 text-12_5 font-medium text-muted"
      >
        Restaurar valores del MAN-CAL-01
      </button>
    );
  }

  return (
    <div
      className="flex w-[26rem] flex-col gap-2 rounded-tarjeta border px-4 py-3"
      style={{ background: 'var(--hf-warn-100)', borderColor: 'var(--hf-warn-border)' }}
    >
      <p className="text-12 font-semibold" style={{ color: 'var(--hf-warn-text)' }}>
        Devolver los catálogos a los valores del manual
      </p>
      <p className="text-11_5 [text-wrap:pretty]" style={{ color: 'var(--hf-warn-text)' }}>
        Sobrescribe las escalas, los tipos de control, las eficacias y los niveles con los de
        MAN-CAL-01. Los riesgos no se tocan: guardan la referencia al nivel, así que su
        residual se recalcula al leer.
      </p>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo — queda en bitácora"
        className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12_5"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={restaurar}
          disabled={corriendo}
          className="rounded-campo px-3.5 py-1.5 text-12_5 font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--hf-danger-text)' }}
        >
          {corriendo ? 'Restaurando…' : 'Restaurar'}
        </button>
        <button
          onClick={() => {
            setAbierto(false);
            setMotivo('');
            setResultado(null);
          }}
          className="rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12_5 text-muted"
        >
          Cancelar
        </button>
      </div>
      {resultado && (
        <p
          className="text-11_5 [text-wrap:pretty]"
          style={{ color: resultado.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)' }}
        >
          {resultado.mensaje}
        </p>
      )}
    </div>
  );
}
