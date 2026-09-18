'use client';

// app/mi-sig/mis-datos/CampoFecha.tsx
//
// Un campo de fecha en `dd/mm/aaaa`, el orden de Colombia, IGUAL en cualquier equipo.
//
// Reemplaza al `<input type="date">` nativo, cuyo formato lo fija el idioma del navegador y no
// el del documento: en un equipo en inglés mostraba `mm/dd/yyyy`, y quien escribía el día
// primero formaba una fecha inválida que el navegador descartaba sin avisar —el campo quedaba
// vacío y «no guardaba»—. Guarda y recibe ISO `yyyy-mm-dd`; sólo cambia lo que se ve y escribe.
//
// La validación —qué es una fecha real— vive en `lib/sig/fecha-dma.ts`, con sus pruebas.

import { useState } from 'react';
import { isoAdma, dmaAiso } from '@/lib/sig/fecha-dma';

/// Va reagrupando los dígitos como `dd/mm/aaaa` a medida que se escribe, así las barras
/// aparecen solas. Se rederiva de los dígitos —no del texto con barras— para que borrar una
/// barra con retroceso no deje el campo trabado.
function formatearMientrasEscribe(bruto: string): string {
  const d = bruto.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter((p) => p !== '').join('/');
}

export function CampoFecha({
  value,
  onChange,
  className,
  ariaLabel,
}: {
  /// ISO `yyyy-mm-dd`, o `''`.
  value: string;
  /// Recibe ISO `yyyy-mm-dd` cuando la fecha es completa y real; `''` mientras está vacía,
  /// incompleta o es imposible —así nunca se guarda una fecha a medio escribir—.
  onChange: (iso: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [texto, setTexto] = useState(() => isoAdma(value));

  function alEscribir(bruto: string): void {
    const formateado = formatearMientrasEscribe(bruto);
    setTexto(formateado);
    const iso = dmaAiso(formateado);
    onChange(iso === null ? '' : iso);
  }

  // Sólo cuando hay algo escrito Y no es una fecha válida: un campo vacío no está «mal».
  const invalido = texto !== '' && dmaAiso(texto) === null;

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      value={texto}
      aria-label={ariaLabel}
      aria-invalid={invalido || undefined}
      onChange={(e) => alEscribir(e.target.value)}
      className={className}
      style={invalido ? { borderColor: 'var(--hf-danger-text)' } : undefined}
    />
  );
}
