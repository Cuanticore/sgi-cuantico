'use client';

// app/components/sgsi/inicio/RadarCapacidades.tsx
//
// The spider diagram over the fifteen operational capabilities. Three series, three
// meanings: current maturity (solid green), the GAP baseline of 2 mar 2026 (dashed
// red — ALWAYS visible, it is the reference the progress is read against) and the
// approved target (dashed orange, conmutable with the chips).

import { useState } from 'react';
import { ANILLOS, VIEWBOX, anillo, etiquetaEje, poligono, punto } from './radar';

export interface EjeRadar {
  capacidad: string;
  corto: string;
  actual: number;
  objetivo: number;
  lineaBase: number;
}

const ROJO = '#a52016';
const VERDE = '#0f7a5a';
const NARANJA = '#ef8020';

export default function RadarCapacidades({
  ejes,
  etiquetaLineaBase,
}: {
  ejes: EjeRadar[];
  etiquetaLineaBase: string;
}) {
  const [verObjetivo, setVerObjetivo] = useState(true);
  const total = ejes.length;

  const actual = ejes.map((e) => e.actual);
  const lineaBase = ejes.map((e) => e.lineaBase);
  const objetivo = ejes.map((e) => e.objetivo);

  return (
    <section className="rounded-tarjeta border border-border-default bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="etiqueta-campo">Madurez por capacidad operativa</h2>
        <button
          onClick={() => setVerObjetivo((v) => !v)}
          aria-pressed={verObjetivo}
          className={`rounded-chip border px-2.5 py-1 font-mono text-9_5 uppercase tracking-[0.08em] transition-colors ${
            verObjetivo
              ? 'border-warn-500 bg-warn-100 text-warn-text'
              : 'border-border-field text-muted hover:bg-accent-50'
          }`}
        >
          Objetivo
        </button>
      </div>

      {/* Legend with the three series and their dates. The baseline is the reference:
          it is listed always, with the GAP date that comes from LineaBase. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-9_5">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0.5 w-5"
            style={{ background: VERDE }}
          />
          Madurez actual · agosto de 2026
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0.5 w-5"
            style={{
              background: `repeating-linear-gradient(90deg, ${ROJO} 0 4px, transparent 4px 7px)`,
            }}
          />
          Línea base — GAP {etiquetaLineaBase}
        </span>
        {verObjetivo && (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-0.5 w-5"
              style={{
                background: `repeating-linear-gradient(90deg, ${NARANJA} 0 2px, transparent 2px 5px)`,
              }}
            />
            Objetivo aprobado
          </span>
        )}
      </div>

      <svg
        viewBox={VIEWBOX}
        className="mt-2 w-full"
        role="img"
        aria-label={`Madurez por capacidad operativa: actual, línea base y objetivo`}
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

        {verObjetivo && (
          <polygon
            points={poligono(objetivo)}
            fill="none"
            stroke={NARANJA}
            strokeWidth={1.5}
            strokeDasharray="2 3"
          />
        )}

        <polygon
          points={poligono(lineaBase)}
          fill="rgba(165, 32, 22, 0.06)"
          stroke={ROJO}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        {ejes.map((_, i) => {
          const p = punto(i, total, lineaBase[i]);
          return <circle key={`lb-${i}`} cx={p.x} cy={p.y} r={2.5} fill={ROJO} />;
        })}

        <polygon
          points={poligono(actual)}
          fill="rgba(15, 122, 90, 0.16)"
          stroke={VERDE}
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
        dominios del Anexo A. La línea base roja es el GAP del {etiquetaLineaBase}: el
        punto de partida real — con la mayoría de los controles organizacionales en L0,
        el polígono rojo se lee casi colapsado en el centro.
      </p>
    </section>
  );
}
