'use client';

// app/estrategico/pestel/Pestel.client.tsx
//
// Seis dimensiones en grilla 3×2 (Ambiental destacada: enmienda ISO 2024), entradas
// con la barra lateral de efecto FAVORABLE/ADVERSO y la dimensión sin riesgos
// señalada. «+ Originar un riesgo desde aquí» guarda la referencia tipada.

import { useState } from 'react';
import { agregarEntradaContexto } from '@/app/sig/acciones/estrategico';
import OriginarRiesgo, { type CatalogosRiesgo } from '@/app/estrategico/OriginarRiesgo.client';
import PanelTrazabilidad from '@/app/estrategico/PanelTrazabilidad.client';
import type { RiesgoOriginado } from '@/app/estrategico/trazabilidad';
import CrearAnalisis from '@/app/estrategico/CrearAnalisis.client';
import NavegadorAnio from '@/app/estrategico/NavegadorAnio.client';

export interface EntradaPestel {
  id: number;
  casilla: string;
  texto: string;
  efecto: 'FAVORABLE' | 'ADVERSO';
  riesgos: number;
  /// Los riesgos que salieron de esta entrada, con su nivel calculado al leer.
  originados: RiesgoOriginado[];
}

const DIMENSIONES: Record<string, { etiqueta: string; inicial: string }> = {
  POLITICO: { etiqueta: 'Político', inicial: 'P' },
  ECONOMICO: { etiqueta: 'Económico', inicial: 'E' },
  SOCIAL: { etiqueta: 'Social', inicial: 'S' },
  TECNOLOGICO: { etiqueta: 'Tecnológico', inicial: 'T' },
  AMBIENTAL: { etiqueta: 'Ambiental', inicial: 'A' },
  LEGAL: { etiqueta: 'Legal', inicial: 'L' },
};

export default function PestelClient({
  analisisId,
  anio,
  anioMostrado,
  aniosConAnalisis,
  acta,
  entradas,
  catalogos,
}: {
  analisisId: number | null;
  /// El año del análisis mostrado, o `null` si ese año no tiene ninguno.
  anio: number | null;
  /// El año sobre el que están paradas las flechas. Siempre hay uno.
  anioMostrado: number;
  aniosConAnalisis: number[];
  acta: string | null;
  entradas: EntradaPestel[];
  catalogos: CatalogosRiesgo;
}) {
  const [nuevas, setNuevas] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<EntradaPestel | null>(null);

  return (
    <main className="flex flex-1 gap-5 px-8 pt-7 pb-14">
      <div className="min-w-0 flex-1">
      {/* El chip va pegado al título, como en el lienzo: califica al análisis que se está
          mirando, y al otro extremo de la barra deja de leerse junto a él. */}
      <div className="flex items-start gap-5">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2.5">
            <h1 className="titulo-pagina">{anioMostrado ? `PESTEL ${anioMostrado}` : 'PESTEL'}</h1>
            {acta && (
              <span
                className="flex-none rounded-[4px] px-2 py-0.5 font-mono text-9_5 font-semibold uppercase"
                style={{ background: '#e6efe9', color: '#0b5c44' }}
              >
                Aprobado
              </span>
            )}
          </span>
          <p className="text-12_5 text-muted">
            {anio ? `Análisis de contexto ${anio}` : 'Sin análisis en este año'} ·{' '}
            {acta ? `acta ${acta}` : 'sin acta de aprobación'}
          </p>
        </div>
        <span className="ml-auto">
          <NavegadorAnio
            anio={anioMostrado}
            aniosConAnalisis={aniosConAnalisis}
            ruta="/estrategico/pestel"
            etiqueta="PESTEL"
          />
        </span>
      </div>

      <div className="mt-4 flex items-center gap-4 text-11_5 text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-1.5 rounded-sm" style={{ background: '#0f7a5a' }} /> Favorable
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-1.5 rounded-sm" style={{ background: '#a52016' }} /> Adverso
        </span>
      </div>

      {analisisId === null && (
        <div className="mt-6">
          <CrearAnalisis tipo="PESTEL" />
        </div>
      )}

      {error && (
        <p className="mt-4 text-12_5" style={{ color: 'var(--hf-danger-text)' }}>
          {error}
        </p>
      )}

      <div className="mt-5 grid grid-cols-3 gap-5">
        {Object.entries(DIMENSIONES).map(([casilla, meta]) => {
          const deLaCasilla = entradas.filter((e) => e.casilla === casilla);
          const sinRiesgos = deLaCasilla.every((e) => e.riesgos === 0) && deLaCasilla.length > 0;
          return (
            <section
              key={casilla}
              className="flex flex-col gap-2 rounded-tarjeta border border-border-field bg-surface p-5"
              style={casilla === 'AMBIENTAL' ? { borderTop: '3px solid #8a4407' } : undefined}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-[6px] font-mono text-12 font-bold text-white"
                  style={{ background: 'var(--hf-brand-nav)' }}
                >
                  {meta.inicial}
                </span>
                <h2 className="text-13 font-semibold text-primary">{meta.etiqueta}</h2>
                {casilla === 'AMBIENTAL' && (
                  <span className="rounded-[4px] px-1.5 py-0.5 font-mono text-8_5" style={{ background: '#fff3e6', color: '#8a4407' }}>
                    enmienda ISO 2024
                  </span>
                )}
              </div>
              {deLaCasilla.map((e) => (
                <div
                  key={e.id}
                  className="flex items-stretch gap-2 rounded-campo"
                  style={{
                    background: elegida?.id === e.id ? 'var(--hf-brand-100)' : 'var(--hf-bg-surface)',
                    border: `1px solid ${elegida?.id === e.id ? 'var(--hf-brand-nav)' : 'var(--hf-border-default)'}`,
                  }}
                >
                  <span className="w-1.5 flex-none rounded-l-campo" style={{ background: e.efecto === 'FAVORABLE' ? '#0f7a5a' : '#a52016' }} />
                  <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 py-2 pr-3">
                    {/* La entrada es el botón: hacer clic muestra qué salió de ella. */}
                    <button
                      onClick={() => setElegida(elegida?.id === e.id ? null : e)}
                      aria-pressed={elegida?.id === e.id}
                      className="min-w-0 flex-1 text-left text-12_5 text-primary"
                    >
                      {e.texto}
                    </button>
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
                      fuente="PESTEL"
                      entradaId={e.id}
                      entradaTexto={e.texto}
                      favorable={e.efecto === 'FAVORABLE'}
                      catalogos={catalogos}
                      setError={setError}
                    />
                  </div>
                </div>
              ))}
              {sinRiesgos && (
                <p className="text-10_5" style={{ color: '#8a4407' }}>
                  Esta dimensión no originó riesgos: suele significar que se llenó por cumplir.
                </p>
              )}
              <div className="flex gap-2">
                <input
                  value={nuevas[casilla] ?? ''}
                  onChange={(e) => setNuevas({ ...nuevas, [casilla]: e.target.value })}
                  placeholder={analisisId === null ? 'Creá el PESTEL primero' : 'Nueva entrada'}
                  disabled={analisisId === null}
                  className="flex-1 rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12_5"
                />
                <button
                  disabled={analisisId === null}
                  onClick={async () => {
                    // Antes acá había un `return` pelado: sin análisis o sin texto, el
                    // clic no hacía nada y la pantalla no lo decía.
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
                      efecto: 'FAVORABLE',
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
      </div>

      <PanelTrazabilidad
        entradaTexto={elegida?.texto ?? null}
        riesgos={elegida?.originados ?? []}
        vacioTexto="Ninguna entrada de esta dimensión originó un riesgo."
        climatico
      />
    </main>
  );
}