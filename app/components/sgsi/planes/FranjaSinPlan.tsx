'use client';

// app/components/sgsi/planes/FranjaSinPlan.tsx
//
// REQ-SIG-20 §7.3 (P2, D4, tarea 4.17) · la alerta nombra los activos, no cuenta un número.
// Va en DOS contextos —el módulo de planes de tratamiento y la lista de activos (inventario
// y la página de análisis)— con el MISMO componente: dos lugares leyendo una franja es una
// decisión; dos franjas distintas es el defecto que este cambio persigue en cada corte.
//
// CUATRO REGLAS (spec `critical-risk-treatment-plan`, "Named alert band in two lists"):
//   · Nombra los códigos, nunca un conteo pelado.
//   · Máximo cinco más un «+n más» que enlaza a la página de análisis filtrada.
//   · Muestra la antigüedad del pendiente.
//   · Se colapsa a una línea pero NUNCA se descarta para siempre — el colapso es estado
//     local de este render, no una preferencia persistida: vuelve entera la próxima vez
//     que la pantalla se monte.
//
// Los datos ya vienen resueltos por `lib/sgsi/deuda-planes.ts` (`activosSinPlan`), ordenados
// por antigüedad descendente — este componente no deriva nada, solo los presenta.

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export interface FilaFranjaSinPlan {
  activoCodigo: string;
  activoNombre: string;
  amenazaCodigo: string;
  amenazaNombre: string;
  diasPendiente: number;
  /// `null` cuando el `plazoPlan` de la banda Crítico es irreconocible (ver
  /// `lib/sgsi/deuda-planes.ts`) — no se muestra «escalado» ni «al día», la franja calla
  /// sobre eso en vez de adivinar.
  escalado: boolean | null;
}

const MAX_VISIBLE = 5;

export default function FranjaSinPlan({ filas }: { filas: readonly FilaFranjaSinPlan[] }) {
  // Estado LOCAL, nunca persistido — es la garantía de "nunca se descarta para siempre".
  const [colapsada, setColapsada] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (filas.length === 0) return null;

  const visibles = filas.slice(0, MAX_VISIBLE);
  const restantes = filas.length - visibles.length;
  const plural = filas.length === 1 ? 'activo' : 'activos';

  // El contrato de URL de la tarea 3.2, sobre la ruta ACTUAL — la franja vive en tres
  // pantallas distintas y en cada una "cada uno abre su ficha" significa abrir el overlay
  // desde donde ya se está, preservando los filtros que esa pantalla trajera.
  const hrefFicha = (codigo: string): string => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('activo', codigo);
    params.set('tab', 'amenazas');
    return `${pathname}?${params.toString()}`;
  };

  if (colapsada) {
    return (
      <button
        type="button"
        onClick={() => setColapsada(false)}
        className="mb-4 flex w-full items-center gap-2 rounded-campo border border-warn-border bg-warn-100 px-3 py-2 text-left text-11_5 text-warn-text transition-colors hover:brightness-95"
      >
        <span aria-hidden>⚠</span>
        <span>
          {filas.length} {plural} con riesgo residual Crítico y sin plan de tratamiento — clic
          para ver
        </span>
      </button>
    );
  }

  return (
    <div className="mb-4 rounded-campo border border-warn-border bg-warn-100 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-11_5 font-semibold text-warn-text">
          <span aria-hidden>⚠</span> {filas.length} {plural} con riesgo residual Crítico y sin
          plan de tratamiento
        </p>
        <button
          type="button"
          onClick={() => setColapsada(true)}
          className="shrink-0 text-10_5 text-warn-text underline decoration-from-font underline-offset-2 hover:no-underline"
        >
          Colapsar
        </button>
      </div>

      <ul className="mt-1.5 flex flex-col gap-1">
        {visibles.map((f) => (
          <li
            key={`${f.activoCodigo}·${f.amenazaCodigo}`}
            className="flex flex-wrap items-baseline gap-x-2 text-11_5"
          >
            <Link
              href={hrefFicha(f.activoCodigo)}
              className="font-mono font-semibold text-warn-text underline decoration-from-font underline-offset-2"
            >
              {f.activoCodigo}
            </Link>
            <span className="text-warn-text">{f.activoNombre}</span>
            <span className="text-warn-text">·</span>
            <span className="text-warn-text">{f.amenazaNombre}</span>
            <span className="ml-auto font-mono text-10_5 text-warn-text">
              {textoAntiguedad(f.diasPendiente)}
              {f.escalado === true ? ' · escalado' : ''}
            </span>
          </li>
        ))}
      </ul>

      {restantes > 0 && (
        <Link
          href="/sgsi/valoracion-riesgos?estadoPlan=pendiente"
          className="mt-1.5 inline-block text-10_5 font-semibold text-warn-text underline decoration-from-font underline-offset-2"
        >
          +{restantes} más →
        </Link>
      )}
    </div>
  );
}

function textoAntiguedad(dias: number): string {
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'hace 1 día';
  return `hace ${dias} días`;
}

/// El punto ámbar de fila (`InventarioActivos.tsx`, `PantallaAnalisisRiesgos.tsx`): la
/// misma marca en las dos grillas, con «sin plan» al pasar por encima — spec "the row also
/// carries an amber dot with «sin plan» on hover".
export function PuntoSinPlan() {
  return (
    <span
      aria-label="sin plan"
      title="Residual Crítico sin plan de tratamiento"
      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
      style={{ background: 'var(--hf-warn-text, #b45309)' }}
    />
  );
}
