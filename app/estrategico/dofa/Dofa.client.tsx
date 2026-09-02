'use client';

// app/estrategico/dofa/Dofa.client.tsx
//
// Cuadrícula 2×2: Fortalezas (verde), Oportunidades (azul), Debilidades (naranja) y
// Amenazas (rojo), con el chip de aprobación y acta. Cada entrada con el conteo de
// riesgos que originó; «+ Originar un riesgo desde aquí» guarda la referencia tipada.

import { useState } from 'react';
import { agregarEntradaContexto } from '@/app/sig/acciones/estrategico';
import OriginarRiesgo, { type CatalogosRiesgo } from '@/app/estrategico/OriginarRiesgo.client';
import CrearAnalisis from '@/app/estrategico/CrearAnalisis.client';

export interface EntradaDofa {
  id: number;
  casilla: string;
  texto: string;
  orden: number;
  riesgos: number;
}

const CASILLAS: Record<string, { etiqueta: string; color: string; interno: boolean }> = {
  FORTALEZA: { etiqueta: 'Fortalezas', color: '#0b5c44', interno: true },
  OPORTUNIDAD: { etiqueta: 'Oportunidades', color: '#12437f', interno: false },
  DEBILIDAD: { etiqueta: 'Debilidades', color: '#8a4407', interno: true },
  AMENAZA: { etiqueta: 'Amenazas', color: '#a52016', interno: false },
};

export default function DofaClient({
  analisisId,
  anio,
  acta,
  aprobadoPor,
  entradas,
  catalogos,
}: {
  analisisId: number | null;
  anio: number | null;
  acta: string | null;
  aprobadoPor: string | null;
  entradas: EntradaDofa[];
  catalogos: CatalogosRiesgo;
}) {
  const [nuevas, setNuevas] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="flex-1 px-8 pt-7 pb-14">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="titulo-pagina">DOFA</h1>
          <p className="text-12_5 text-muted">
            {anio ? `Análisis de contexto ${anio}` : 'Sin análisis'} ·{' '}
            {acta ? `acta ${acta} · ${aprobadoPor ?? ''}` : 'sin acta de aprobación'}
          </p>
        </div>
        {acta && (
          <span
            className="rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
            style={{ background: '#e6efe9', color: '#0b5c44' }}
          >
            Aprobado
          </span>
        )}
      </div>

      {analisisId === null && (
        <div className="mt-6">
          <CrearAnalisis tipo="DOFA" />
        </div>
      )}

      {error && (
        <p className="mt-4 text-12_5" style={{ color: 'var(--hf-danger-text)' }}>
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-5">
        {Object.entries(CASILLAS).map(([casilla, meta]) => {
          const deLaCasilla = entradas.filter((e) => e.casilla === casilla);
          return (
            <section
              key={casilla}
              className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface p-5"
              style={{ borderTop: `3px solid ${meta.color}` }}
            >
              <h2 className="text-13 font-semibold" style={{ color: meta.color }}>
                {meta.etiqueta} · {meta.interno ? 'interno' : 'externo'} ·{' '}
                {meta.color === '#0b5c44' || meta.color === '#12437f' ? 'favorable' : 'adverso'}
              </h2>
              {deLaCasilla.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 rounded-campo border border-border-default bg-surface px-3 py-2">
                  <span className="min-w-0 flex-1 text-12_5 text-primary">{e.texto}</span>
                  <span
                    className="flex-none rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold"
                    style={
                      e.riesgos > 0
                        ? { background: '#e9f0fb', color: '#12437f' }
                        : { background: '#fff3e6', color: '#8a4407' }
                    }
                  >
                    {e.riesgos > 0 ? `${e.riesgos} riesgo(s)` : '—'}
                  </span>
                  <OriginarRiesgo
                    fuente="DOFA"
                    entradaId={e.id}
                    entradaTexto={e.texto}
                    favorable={meta.color === '#0b5c44' || meta.color === '#12437f'}
                    catalogos={catalogos}
                    setError={setError}
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={nuevas[casilla] ?? ''}
                  onChange={(e) => setNuevas({ ...nuevas, [casilla]: e.target.value })}
                  placeholder={analisisId === null ? `Creá el ${'DOFA'} primero` : 'Nueva entrada'}
                  disabled={analisisId === null}
                  className="flex-1 rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12_5"
                />
                <button
                  disabled={analisisId === null}
                  onClick={async () => {
                    // Antes acá había un `return` pelado: sin análisis o sin texto, el
                    // clic no hacía nada y la pantalla no lo decía. Un botón que se traga
                    // el clic es peor que uno deshabilitado.
                    if (analisisId === null) {
                      setError('Primero hay que crear el análisis.');
                      return;
                    }
                    if (!nuevas[casilla]?.trim()) {
                      setError('Escribí la entrada antes de agregarla.');
                      return;
                    }
                    setError(null);
                    const r = await agregarEntradaContexto(analisisId, {
                      casilla,
                      texto: nuevas[casilla].trim(),
                      efecto: meta.color === '#0b5c44' || meta.color === '#12437f' ? 'FAVORABLE' : 'ADVERSO',
                    });
                    if (!r.ok) {
                      setError(r.mensaje);
                      return;
                    }
                    window.location.reload();
                  }}
                  className="rounded-campo px-3 py-1.5 text-12 font-semibold text-white disabled:opacity-40"
                  style={{ background: 'var(--hf-brand-nav)' }}
                >
                  +
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}