// app/components/sgsi/inicio/radar.ts
//
// Pure radar geometry. Kept separate from the component so it can be reasoned about and
// tested without rendering anything.
//
// The axes are the FIFTEEN operational capabilities of ISO/IEC 27002:2022, not the four
// Annex A domains: four axes show nothing, fifteen give the resolution needed to see
// where the imbalance is (MET-SIG-01 section 8.3).
//
// The viewBox is framed symmetrically around the real centre. An off-centre viewBox
// pushes the polygon down and to the right — subtle enough to survive review and wrong
// on every screen.

export const CENTRO = { x: 250, y: 236 } as const;
export const RADIO = 176;
export const VIEWBOX = '42 28 416 416';
export const ANILLOS = [20, 40, 60, 80, 100] as const;

/// Labels sit slightly outside the outer ring so they never collide with it.
const FACTOR_ETIQUETA = 1.1;

export interface Punto {
  x: number;
  y: number;
}

/// Axis 0 points straight up; the rest are spaced evenly clockwise.
export function angulo(indice: number, total: number): number {
  return (Math.PI * 2 * indice) / total - Math.PI / 2;
}

export function punto(indice: number, total: number, porcentaje: number): Punto {
  const a = angulo(indice, total);
  const r = (RADIO * Math.max(0, Math.min(100, porcentaje))) / 100;
  return { x: CENTRO.x + r * Math.cos(a), y: CENTRO.y + r * Math.sin(a) };
}

export function poligono(valores: readonly number[]): string {
  return valores
    .map((v, i) => {
      const p = punto(i, valores.length, v);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(' ');
}

export function anillo(porcentaje: number, total: number): string {
  return poligono(Array.from({ length: total }, () => porcentaje));
}

export interface EtiquetaEje {
  x: number;
  y: number;
  anclaje: 'start' | 'middle' | 'end';
  alineacion: 'auto' | 'hanging';
}

/// Anchoring follows the quadrant: a label on the left of the wheel reads right-to-left
/// into the chart, and one at the very top or bottom is centred.
export function etiquetaEje(indice: number, total: number): EtiquetaEje {
  const a = angulo(indice, total);
  const x = CENTRO.x + RADIO * FACTOR_ETIQUETA * Math.cos(a);
  const y = CENTRO.y + RADIO * FACTOR_ETIQUETA * Math.sin(a);

  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const casiVertical = Math.abs(cos) < 0.12;

  return {
    x,
    y,
    anclaje: casiVertical ? 'middle' : cos > 0 ? 'start' : 'end',
    alineacion: casiVertical && sin > 0 ? 'hanging' : 'auto',
  };
}
