'use client';

// app/components/sgsi/metodologia/IndiceMetodologia.tsx
//
// The document's own table of contents. A thirteen-chapter document navigated by a row of
// chips at the top would spend three lines on the chips; a column at the side stays out of
// the way and keeps the reader's place.
//
// It is a client component only for the highlight. The links are plain anchors.

import { useEffect, useState } from 'react';

export interface EntradaIndice {
  id: string;
  numero: string;
  etiqueta: string;
}

const DESPLAZAMIENTO = 74;

export default function IndiceMetodologia({ entradas }: { entradas: EntradaIndice[] }) {
  const [activa, setActiva] = useState<string>(entradas[0]?.id ?? '');

  useEffect(() => {
    const nodos = entradas
      .map((e) => document.getElementById(e.id))
      .filter((n): n is HTMLElement => n !== null);
    if (nodos.length === 0) return;

    const observador = new IntersectionObserver(
      (registros) => {
        const visibles = registros
          .filter((r) => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visibles.length > 0) setActiva(visibles[0].target.id);
      },
      { rootMargin: `-${DESPLAZAMIENTO}px 0px -60% 0px`, threshold: 0 },
    );

    nodos.forEach((n) => observador.observe(n));
    return () => observador.disconnect();
  }, [entradas]);

  return (
    <nav
      aria-label="Tabla de contenido"
      className="sticky hidden w-[186px] shrink-0 self-start lg:block"
      style={{ top: 'calc(var(--hf-header-alto) + 16px)' }}
    >
      <p className="etiqueta-campo pb-2">Tabla de contenido</p>
      <ul className="flex flex-col">
        {entradas.map((e) => {
          const esActiva = activa === e.id;
          return (
            <li key={e.id}>
              <a
                href={`#${e.id}`}
                aria-current={esActiva ? 'true' : undefined}
                // The left rule is the quiet marker; the weight change is the one that
                // survives a greyscale render.
                className={`flex gap-2 border-l-2 py-1 pl-2.5 text-11_5 leading-snug transition-colors ${
                  esActiva
                    ? 'border-accent-500 font-semibold text-accent-700'
                    : 'border-hairline-strong text-muted hover:border-border-field hover:text-secondary'
                }`}
              >
                <span className="w-4 shrink-0 font-mono text-10 tabular-nums text-faint">
                  {e.numero}
                </span>
                <span className="min-w-0">{e.etiqueta}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
