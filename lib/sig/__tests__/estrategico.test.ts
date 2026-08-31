// lib/sig/__tests__/estrategico.test.ts
//
// Los cinco casos frontera de la spec §4, que son el oráculo de la implementación:
// R1, R32, R36 y los dos controles moderados. Además, cambiar la eficacia de Fuerte
// recalcula sin tocar los datos (D4).

import { inherenteDe, residualDe, nivelDe } from '../estrategico';

describe('casos frontera de MAT-CAL-02 (spec §4)', () => {
  it('R1 · Preventivo · Fuerte: 3×4 → residual 2,4', () => {
    const r = residualDe(3, 4, 'PREVENTIVO', 'FUERTE');
    expect(r.inherente).toBe(12);
    expect(r.pRes).toBeCloseTo(0.6, 5);
    expect(r.iRes).toBeCloseTo(4, 5);
    expect(r.residual).toBeCloseTo(2.4, 5);
  });

  it('Correctivo · Moderado: 3×3 → residual 5,4', () => {
    const r = residualDe(3, 3, 'CORRECTIVO', 'MODERADO');
    expect(r.inherente).toBe(9);
    expect(r.pRes).toBeCloseTo(3, 5);
    expect(r.iRes).toBeCloseTo(1.8, 5);
    expect(r.residual).toBeCloseTo(5.4, 5);
  });

  it('Preventivo y correctivo · Moderado: 3×3 → residual 3,24', () => {
    const r = residualDe(3, 3, 'PREVENTIVO_Y_CORRECTIVO', 'MODERADO');
    expect(r.residual).toBeCloseTo(3.24, 5);
  });

  it('R36 · Proactivo · Débil: 3×4 → residual 9,72', () => {
    const r = residualDe(3, 4, 'PROACTIVO', 'DEBIL');
    expect(r.residual).toBeCloseTo(9.72, 5);
  });

  it('R32 · Reforzador · Débil: 3×4 → residual 10,8', () => {
    const r = residualDe(3, 4, 'REFORZADOR', 'DEBIL');
    expect(r.residual).toBeCloseTo(10.8, 5);
  });
});

describe('el tipo de control declara qué reduce', () => {
  it('PROBABILIDAD deja el impacto intacto', () => {
    const r = residualDe(3, 4, 'PREVENTIVO', 'FUERTE');
    expect(r.iRes).toBeCloseTo(4, 5);
  });

  it('IMPACTO deja la probabilidad intacta', () => {
    const r = residualDe(3, 4, 'CORRECTIVO', 'MODERADO');
    expect(r.pRes).toBeCloseTo(3, 5);
  });
});

describe('nivelDe', () => {
  it('clasifica por rangos parametrizables', () => {
    expect(nivelDe(4, [0, 5, 13])).toBe(0);
    expect(nivelDe(5, [0, 5, 13])).toBe(1);
    expect(nivelDe(12, [0, 5, 13])).toBe(1);
    expect(nivelDe(13, [0, 5, 13])).toBe(2);
  });

  it('sin control, el residual es el inherente', () => {
    expect(inherenteDe(3, 4)).toBe(12);
  });
});