'use client';

// app/estrategico/parametros/CongelarLineaBase.client.tsx
//
// D10: congelar la matriz para poder comparar entre años.
//
// `congelarLineaBase` estaba escrita en el servidor sin nadie que la llamara, así que la
// barra lateral decía «sin congelar» y no había forma de dejar de decirlo. Sin línea base
// no hay con qué comparar: la pregunta «¿bajamos el riesgo este año?» no tiene respuesta
// verificable, sólo una impresión.
//
// Congelar guarda un `snapshot` de los códigos con su probabilidad, impacto y controles al
// momento. No borra ni bloquea nada: la matriz sigue editándose, y lo que queda fijo es la
// foto contra la cual se compara.

import { useState } from 'react';
import { congelarLineaBase } from '@/app/sig/acciones/estrategico';

export default function CongelarLineaBase({ vigente }: { vigente: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(`Línea base ${new Date().getUTCFullYear()}`);
  const [acta, setActa] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12_5 font-medium text-secondary"
      >
        Congelar la línea base
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="flex w-full max-w-lg flex-col gap-3 rounded-tarjeta border border-border-field bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-15 font-bold text-primary">Congelar la línea base</h2>
          <button onClick={() => setAbierto(false)} className="text-12_5 text-muted">
            Cancelar
          </button>
        </div>

        <p className="max-w-[76ch] text-11_5 leading-relaxed text-muted [text-wrap:pretty]">
          Guarda una foto de cada riesgo con su probabilidad, su impacto y sus controles tal
          como están hoy. <strong className="font-semibold">No bloquea la matriz</strong>: se
          sigue editando, y lo que queda fijo es aquello contra lo que se compara el año que
          viene.
        </p>

        {vigente && (
          <p
            className="rounded-campo px-3 py-2 text-11_5 [text-wrap:pretty]"
            style={{ background: 'var(--hf-warn-100)', color: 'var(--hf-warn-text)' }}
          >
            Ya existe «{vigente}». Congelar otra no la reemplaza: se agrega, y la barra
            lateral muestra la más reciente.
          </p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Nombre</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="entrada-campo"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="etiqueta-campo">Acta del comité (obligatoria)</span>
          <input
            value={acta}
            onChange={(e) => setActa(e.target.value)}
            placeholder="ACT-COM-2026-03"
            className="entrada-campo font-mono"
          />
          <span className="text-11 text-muted [text-wrap:pretty]">
            Queda junto al autor en el registro. Congelar una línea base es una decisión del
            comité de riesgos, y sin el acta no se puede decir quién la tomó.
          </span>
        </label>

        {aviso && (
          <p
            className="rounded-campo px-3 py-2 text-12 [text-wrap:pretty]"
            style={{
              background: aviso.ok ? 'var(--hf-accent-100)' : 'var(--hf-danger-bg)',
              color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)',
            }}
          >
            {aviso.texto}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setAbierto(false)}
            className="rounded-campo px-3 py-1.5 text-12 text-muted"
          >
            Cancelar
          </button>
          <button
            onClick={async () => {
              setOcupado(true);
              setAviso(null);
              const r = await congelarLineaBase(nombre, acta);
              setOcupado(false);
              setAviso({ ok: r.ok, texto: r.mensaje });
              if (r.ok) setTimeout(() => window.location.reload(), 1200);
            }}
            disabled={nombre.trim() === '' || acta.trim() === '' || ocupado}
            className="rounded-campo px-4 py-2 text-12_5 font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--hf-brand-nav)' }}
          >
            {ocupado ? 'Congelando…' : 'Congelar'}
          </button>
        </div>
      </div>
    </div>
  );
}
