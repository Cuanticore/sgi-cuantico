'use client';

// app/components/sgsi/inicio/RadarCapacidades.tsx
//
// The spider diagram over the fifteen operational capabilities. Three series are
// available — current maturity, target and previous baseline — but only two are drawn at
// once: the solid current polygon plus whichever comparison the chips select, so the
// chart never becomes a tangle.

import { useState } from 'react';
import { ANILLOS, VIEWBOX, anillo, etiquetaEje, poligono, punto } from './radar';

export interface EjeRadar {
  capacidad: string;
  corto: string;
  actual: number;
  objetivo: number;
  lineaBase: number;
}

type Comparacion = 'objetivo' | 'lineaBase';

export default function RadarCapacidades({ ejes }: { ejes: EjeRadar[] }) {
  const [comparacion, setComparacion] = useState<Comparacion>('objetivo');
  const total = ejes.length;

  const actual = ejes.map((e) => e.actual);
  const contraste = ejes.map((e) => (comparacion === 'objetivo' ? e.objetivo : e.lineaBase));
  const colorContraste =
    comparacion === 'objetivo' ? 'var(--hf-warn-500)' : 'var(--hf-text-label)';

  return (
    <section className="rounded-tarjeta border border-border-default bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="etiqueta-campo">Madurez por capacidad operativa</h2>
        <div className="flex gap-1.5">
          {(
            [
              ['objetivo', 'Objetivo'],
              ['lineaBase', 'Línea base anterior'],
            ] as const
          ).map(([clave, etiqueta]) => (
            <button
              key={clave}
              onClick={() => setComparacion(clave)}
              className={`rounded-chip border px-2.5 py-1 font-mono text-9_5 uppercase tracking-[0.08em] transition-colors ${
                comparacion === clave
                  ? 'border-accent-500 bg-accent-100 text-accent-700'
                  : 'border-border-field text-muted hover:bg-accent-50'
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={VIEWBOX}
        className="mt-2 w-full"
        role="img"
        aria-label={`Madurez por capacidad operativa, comparada contra ${
          comparacion === 'objetivo' ? 'el objetivo' : 'la línea base anterior'
        }`}
      >
        {ANILLOS.map((r) => (
          <polygon
            key={r}
            points={anillo(r, total)}
            fill="none"
            stroke="var(--hf-hairline-strong)"
            strokeWidth={1}
          />
        ))}

        {ejes.map((_, i) => {
          const extremo = punto(i, total, 100);
          return (
            <line
              key={i}
              x1={250}
              y1={236}
              x2={extremo.x}
              y2={extremo.y}
              stroke="var(--hf-hairline)"
              strokeWidth={1}
            />
          );
        })}

        {/* Ring labels on the vertical axis, so they never sit under a polygon edge. */}
        {ANILLOS.map((r) => {
          const p = punto(0, total, r);
          return (
            <text
              key={r}
              x={p.x + 5}
              y={p.y + 3}
              fontSize={8.5}
              fill="var(--hf-text-placeholder)"
              fontFamily="var(--font-mono)"
            >
              {r}%
            </text>
          );
        })}

        <polygon
          points={poligono(contraste)}
          fill="none"
          stroke={colorContraste}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />

        <polygon
          points={poligono(actual)}
          fill="rgba(15, 122, 90, 0.16)"
          stroke="var(--hf-accent-500)"
          strokeWidth={2}
        />

        {ejes.map((e, i) => {
          const l = etiquetaEje(i, total);
          return (
            <text
              key={e.capacidad}
              x={l.x}
              y={l.y}
              textAnchor={l.anclaje}
              dominantBaseline={l.alineacion}
              fontSize={9}
              fill="var(--hf-text-muted)"
            >
              <tspan>{e.corto}</tspan>
              <tspan
                x={l.x}
                dy={10}
                fontSize={8.5}
                fontFamily="var(--font-mono)"
                fill="var(--hf-text-faint)"
              >
                {e.actual.toFixed(0)}%
              </tspan>
            </text>
          );
        })}
      </svg>

      <p className="mt-1 text-10 leading-relaxed text-faint">
        Quince ejes: las capacidades operativas de ISO/IEC 27002:2022, no los cuatro
        dominios del Anexo A. Cuatro ejes no muestran nada; quince dan la resolución para
        ver dónde está el desequilibrio.
      </p>
    </section>
  );
}
