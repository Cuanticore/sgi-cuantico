'use client';

// app/components/sgsi/parametros/IndiceSecciones.tsx
//
// The row of section links at the top of screen 9. It is a client component only because
// of the highlight: the links themselves are plain anchors and work with JavaScript off.
//
// The active entry is marked by its accent border and a filled number chip, never by
// colour alone — the number chip changes shape and weight too, so the state survives a
// greyscale print and a colour-blind reader.

import { useEffect, useState } from 'react';

export interface Seccion {
  id: string;
  numero: number;
  etiqueta: string;
}

/// The sticky corporate header is 58px tall, so a section scrolled to the top of the
/// viewport would sit underneath it.
const DESPLAZAMIENTO = 74;

export default function IndiceSecciones({ secciones }: { secciones: Seccion[] }) {
  const [activa, setActiva] = useState<string>(secciones[0]?.id ?? '');

  useEffect(() => {
    const nodos = secciones
      .map((s) => document.getElementById(s.id))
      .filter((n): n is HTMLElement => n !== null);
    if (nodos.length === 0) return;

    // The bottom margin keeps the highlight on the section the reader is actually in:
    // without it the entry would jump to the next heading as soon as it peeked in.
    const observador = new IntersectionObserver(
      (entradas) => {
        const visibles = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visibles.length > 0) setActiva(visibles[0].target.id);
      },
      { rootMargin: `-${DESPLAZAMIENTO}px 0px -55% 0px`, threshold: 0 },
    );

    nodos.forEach((n) => observador.observe(n));
    return () => observador.disconnect();
  }, [secciones]);

  return (
    <nav
      aria-label="Secciones de la configuración"
      className="sticky z-20 flex flex-wrap gap-2 rounded-tarjeta border border-border-default bg-surface px-3 py-2.5"
      style={{ top: 'var(--hf-header-alto)' }}
    >
      {secciones.map((s) => {
        const esActiva = activa === s.id;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={esActiva ? 'true' : undefined}
            className={`flex items-center gap-1.5 rounded-campo border px-2.5 py-1 text-11_5 transition-colors ${
              esActiva
                ? 'border-accent-500 bg-accent-50 text-accent-700'
                : 'border-border-default text-secondary hover:bg-accent-50'
            }`}
          >
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-badge font-mono text-9 ${
                esActiva
                  ? 'bg-accent-700 font-semibold text-surface'
                  : 'bg-subtle text-faint'
              }`}
            >
              {s.numero}
            </span>
            {s.etiqueta}
          </a>
        );
      })}
    </nav>
  );
}
