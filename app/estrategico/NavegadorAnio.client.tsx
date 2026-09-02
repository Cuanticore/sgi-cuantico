'use client';

// app/estrategico/NavegadorAnio.client.tsx
//
// El `‹ 2026 ›` de la cabecera de DOFA y PESTEL.
//
// Faltaba en las dos pantallas, y el hueco era peor que un botón ausente: la página ya
// consultaba TODOS los años con `findMany` ordenado por año descendente, y después
// descartaba todo menos el vigente. El DOFA del año pasado estaba en la base, viajaba
// hasta el servidor, y no había forma de verlo. El acta de aprobación de un análisis de
// contexto es evidencia de auditoría: no poder abrir la del año anterior es un problema
// real, no una comodidad.
//
// Va aparte porque DOFA y PESTEL son el mismo control sobre la misma tabla. Dos copias se
// habrían separado en el primer arreglo.

import { useRouter } from 'next/navigation';

export default function NavegadorAnio({
  anio,
  aniosConAnalisis,
  ruta,
  etiqueta,
}: {
  anio: number;
  /// Los años que SÍ tienen análisis. Se muestran como pista: sin ella, moverse entre años
  /// vacíos con las flechas es adivinar.
  aniosConAnalisis: number[];
  /// `/estrategico/dofa` o `/estrategico/pestel`.
  ruta: string;
  /// «DOFA» o «PESTEL», para que el aviso nombre lo que se está buscando.
  etiqueta: string;
}) {
  const router = useRouter();
  const otros = aniosConAnalisis.filter((a) => a !== anio);

  return (
    <span className="flex flex-none flex-col items-end gap-1">
      <span className="flex items-center gap-2 rounded-campo border border-border-field bg-surface px-3 py-1.5">
        <button
          onClick={() => router.push(`${ruta}?anio=${anio - 1}`)}
          aria-label="Año anterior"
          className="text-12 text-muted focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        >
          ‹
        </button>
        <span className="min-w-[38px] text-center font-mono text-12_5 font-semibold text-primary">
          {anio}
        </span>
        <button
          onClick={() => router.push(`${ruta}?anio=${anio + 1}`)}
          aria-label="Año siguiente"
          className="text-12 text-muted focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        >
          ›
        </button>
      </span>

      {/* Sólo cuando el año que se está mirando no tiene nada. Un aviso que aparece siempre
          deja de leerse, y acá el caso normal es estar parado sobre el año vigente. */}
      {!aniosConAnalisis.includes(anio) && otros.length > 0 && (
        <span className="text-11 text-muted">
          Hay {etiqueta} en{' '}
          {otros.map((a, i) => (
            <span key={a}>
              {i > 0 && ', '}
              <button
                onClick={() => router.push(`${ruta}?anio=${a}`)}
                className="font-mono underline underline-offset-2"
              >
                {a}
              </button>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
