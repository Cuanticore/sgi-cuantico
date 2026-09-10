// lib/sig/__tests__/periodos.test.ts
//
// Las etiquetas y aperturas de periodo son la identidad de una asignación: la unique
// tripla (obligación, persona, periodo) depende de que dos corridas etiqueten igual.

import {
  aperturaDePeriodo,
  aplicarPiso,
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
// ─── El piso de la pertenencia (REQ-SIG-15 §5.2 · D-5) ────────────────────────────────────
//
// «Ninguna asignación nace vencida.» La tarea es de la persona, así que su reloj empieza
// cuando la persona la recibe — no cuando el calendario abrió el periodo, ni cuando la
// obligación se escribió.
//
// Es la regla R2 que `generacion.ts:132-133` YA DECLARA y que el código no cumplía:
// `periodosHasta` arranca en `obligacion.fechaInicio` y camina hasta el horizonte sin piso
// por persona, y la fecha límite es siempre `apertura + plazoDias` sin mirar desde cuándo esa
// persona está sujeta a la obligación.

describe('aplicarPiso', () => {
  const MENSUAL = {
    periodicidad: 'MENSUAL' as const,
    fechaInicio: d('2026-01-01'),
    plazoDias: 15,
  };

  // §11.4 · una obligación mensual iniciada en enero, a alguien que entra hoy, no le crea
  // los nueve meses que ya pasaron. `horizonteDias = 0` acota el calendario al periodo en
  // curso para que la cuenta sea determinista y no dependa de la fecha en que se corra.
  it('descarta los periodos cuya ventana entera terminó antes del piso', () => {
    const calendario = periodosHasta(MENSUAL, d('2026-09-10'), 0);
    expect(calendario.length).toBeGreaterThan(1);
    const r = aplicarPiso(calendario, d('2026-09-10'), 15);
    expect(r.map((x) => x.etiqueta)).toEqual(['2026-09']);
  });

  // §11.3 · el periodo EN CURSO se genera con el plazo COMPLETO contado desde el piso.
  //
  // Sin esto la regla queda a medias y de la peor manera: una obligación mensual con plazo
  // de 15 días, a alguien que entra el día 28, le crearía la tarea del mes con fecha límite
  // el día 16 — vencida el mismo instante en que se crea.
  it('corre la apertura, y con ella la fecha límite', () => {
    const calendario = periodosHasta(MENSUAL, d('2026-09-28'), 0);
    const r = aplicarPiso(calendario, d('2026-09-28'), 15);
    const ultimo = r[r.length - 1];
    expect(ultimo.apertura.toISOString().slice(0, 10)).toBe('2026-09-28');
    expect(ultimo.fechaLimite.toISOString().slice(0, 10)).toBe('2026-10-13');
  });

  // §11.5 · la etiqueta NO cambia, y es lo que sostiene la idempotencia. La unique es
  // `(obligacionId, personaId, periodo, activoId)`: si la etiqueta llevara la fecha de
  // ingreso, el cron crearía una SEGUNDA fila para el mismo periodo.
  it('no toca la etiqueta del calendario', () => {
    const calendario = periodosHasta(MENSUAL, d('2026-09-28'), 0);
    const r = aplicarPiso(calendario, d('2026-09-28'), 15);
    expect(r[r.length - 1].etiqueta).toBe('2026-09');
  });

  // Q2 · `UNICA` no tiene ventana que cierre. Se corre y NUNCA se descarta: descartarla
  // dejaría a quien entra hoy sin el acuerdo de confidencialidad que PRO-TAL-01 exige antes
  // de habilitar cualquier acceso.
  it('UNICA se corre y nunca se descarta', () => {
    const unica = periodosHasta(
      { periodicidad: 'UNICA', fechaInicio: d('2023-01-01'), plazoDias: 10 },
      d('2026-09-10'),
      0,
    );
    const r = aplicarPiso(unica, d('2026-09-10'), 10);
    expect(r).toHaveLength(1);
    expect(r[0].apertura.toISOString().slice(0, 10)).toBe('2026-09-10');
    expect(r[0].fechaLimite.toISOString().slice(0, 10)).toBe('2026-09-20');
  });

  it('un piso anterior a todo el calendario no cambia nada', () => {
    const calendario = periodosHasta(MENSUAL, d('2026-09-10'), 0);
    expect(aplicarPiso(calendario, d('2025-01-01'), 15)).toEqual(calendario);
  });

  // El piso que cae exactamente en la apertura no corre nada: ya está donde debe.
  it('un piso igual a la apertura deja el periodo intacto', () => {
    const calendario = periodosHasta(MENSUAL, d('2026-09-10'), 0);
    const septiembre = calendario.find((x) => x.etiqueta === '2026-09');
    const r = aplicarPiso(calendario, d('2026-09-01'), 15);
    expect(r.find((x) => x.etiqueta === '2026-09')).toEqual(septiembre);
  });

  // El fin de ventana NO se puede derivar de la fecha límite: con plazo 15 en una obligación
  // mensual, la ventana dura 30 y el plazo 15. Confundirlos descartaría el periodo en curso
  // de quien entra el día 20.
  it('la ventana es el periodo, no el plazo', () => {
    const calendario = periodosHasta(MENSUAL, d('2026-09-20'), 0);
    const r = aplicarPiso(calendario, d('2026-09-20'), 15);
    expect(r.map((x) => x.etiqueta)).toContain('2026-09');
  });
});
