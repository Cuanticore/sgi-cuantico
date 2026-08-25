// app/components/sgsi/CabeceraIndicadores.tsx
//
// Page header for the Indicadores screen. The year selector lives HERE and not in the
// corporate bar: the bar switches between the two domains of the SIG, and mixing a
// per-screen filter into it would make a global control out of a local one.

import Link from 'next/link';

export default function CabeceraIndicadores({
  year,
  matrixUrl,
}: {
  year: string;
  matrixUrl: string | undefined;
}) {
  const otro = year === '2026' ? '2025' : '2026';

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 px-8 pt-6">
      <div>
        <h1 className="titulo-pagina">Indicadores del SGC</h1>
        <p className="mt-1 text-12_5 text-muted">
          Cuadro de mando de la matriz de indicadores · MAT-CAL-03 v1
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <span
          className="flex items-center gap-1 rounded-chip p-1"
          style={{ background: 'var(--hf-brand-100)' }}
        >
          {(['2026', '2025'] as const).map((y) => (
            <Link
              key={y}
              href={`/?year=${y}`}
              aria-current={y === year ? 'page' : undefined}
              className="rounded-chip px-3 py-1 font-mono text-10_5 tracking-[0.08em] transition-colors"
              style={
                y === year
                  ? { background: 'var(--hf-brand-700)', color: '#ffffff' }
                  : { color: 'var(--hf-brand-nav)' }
              }
            >
              {y}
            </Link>
          ))}
        </span>

        {matrixUrl && (
          <a
            href={matrixUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-campo border px-3 py-1.5 font-mono text-10_5 uppercase tracking-[0.1em] transition-colors"
            style={{
              borderColor: 'var(--hf-brand-border)',
              color: 'var(--hf-brand-nav)',
            }}
          >
            Abrir la matriz {otro === '2026' ? year : year} ↗
          </a>
        )}
      </div>
    </header>
  );
}
