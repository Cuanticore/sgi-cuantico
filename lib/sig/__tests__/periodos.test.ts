// lib/sig/__tests__/periodos.test.ts
//
// Las etiquetas y aperturas de periodo son la identidad de una asignación: la unique
// tripla (obligación, persona, periodo) depende de que dos corridas etiqueten igual.

import {
  aperturaDePeriodo,
  etiquetaDePeriodo,
  periodosHasta,
  PeriodoGenerable,
} from '../periodos';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('etiquetaDePeriodo', () => {
  it('etiqueta un día con su fecha ISO', () => {
    expect(etiquetaDePeriodo('DIARIA', d('2026-09-01'))).toBe('2026-09-01');
  });

  it('etiqueta una semana con su número ISO', () => {
    expect(etiquetaDePeriodo('SEMANAL', d('2026-08-31'))).toBe('2026-S36');
  });

  it('etiqueta un mes con año y mes', () => {
    expect(etiquetaDePeriodo('MENSUAL', d('2026-09-15'))).toBe('2026-09');
  });

  it('etiqueta un trimestre', () => {
    expect(etiquetaDePeriodo('TRIMESTRAL', d('2026-10-01'))).toBe('2026-T4');
  });

  it('etiqueta un semestre', () => {
    expect(etiquetaDePeriodo('SEMESTRAL', d('2026-07-01'))).toBe('2026-S2');
  });

  it('etiqueta un año', () => {
    expect(etiquetaDePeriodo('ANUAL', d('2026-03-01'))).toBe('2026');
  });

  it('etiqueta UNICA con la fecha de inicio', () => {
    expect(etiquetaDePeriodo('UNICA', d('2026-11-30'))).toBe('2026-11-30');
  });
});

describe('aperturaDePeriodo', () => {
  it('una semana abre en su lunes, aunque la fecha caiga en domingo', () => {
    expect(aperturaDePeriodo('SEMANAL', d('2026-09-06'))).toEqual(d('2026-08-31'));
  });

  it('un mes abre el día 1', () => {
    expect(aperturaDePeriodo('MENSUAL', d('2026-09-30'))).toEqual(d('2026-09-01'));
  });

  it('un trimestre abre el primer día del trimestre', () => {
    expect(aperturaDePeriodo('TRIMESTRAL', d('2026-08-15'))).toEqual(d('2026-07-01'));
  });

  it('un semestre abre el primer día del semestre', () => {
    expect(aperturaDePeriodo('SEMESTRAL', d('2026-12-01'))).toEqual(d('2026-07-01'));
  });

  it('UNICA abre en la propia fecha', () => {
    expect(aperturaDePeriodo('UNICA', d('2026-11-30'))).toEqual(d('2026-11-30'));
  });
});

describe('periodosHasta', () => {
  const base = {
    id: 1,
    periodicidad: 'MENSUAL' as const,
    fechaInicio: d('2026-01-05'),
    plazoDias: 10,
  };

  it('genera todos los periodos desde el inicio hasta el horizonte', () => {
    const hoy = d('2026-03-15');
    const periodos = periodosHasta(base, hoy, 90);
    // Horizonte: 15/03 + 90 días = 13/06. Entran enero a junio; julio abre el 1 y no alcanza.
    expect(periodos.map((p) => p.etiqueta)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
    expect(periodos[2].apertura).toEqual(d('2026-03-01'));
    expect(periodos[2].fechaLimite).toEqual(d('2026-03-11'));
  });

  it('el horizonte suma días a la fecha de hoy, no a la de inicio', () => {
    const hoy = d('2026-06-30');
    const periodos = periodosHasta(base, hoy, 90);
    expect(periodos.at(-1)!.etiqueta).toBe('2026-09');
  });

  it('UNICA produce exactamente un periodo, etiquetado con su fecha de inicio', () => {
    const periodos = periodosHasta({ ...base, periodicidad: 'UNICA' }, d('2026-09-01'), 90);
    expect(periodos).toHaveLength(1);
    expect(periodos[0].etiqueta).toBe('2026-01-05');
    expect(periodos[0].fechaLimite).toEqual(d('2026-01-15'));
  });

  it('una periodicidad ANUAL abre el 1 de enero', () => {
    const periodos = periodosHasta({ ...base, periodicidad: 'ANUAL' }, d('2026-06-01'), 90);
    expect(periodos[0].etiqueta).toBe('2026');
    expect(periodos[0].apertura).toEqual(d('2026-01-01'));
  });

  it('no genera nada cuando la fecha de inicio está después del horizonte', () => {
    // 01/09 + 90 días = 30/11, y el primer periodo abre el 01/01: fuera de alcance.
    const periodos = periodosHasta(base, d('2025-09-01'), 90);
    expect(periodos).toEqual([]);
  });
});