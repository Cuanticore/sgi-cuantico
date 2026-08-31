// lib/sig/__tests__/cumplimiento.test.ts
//
// Los indicadores se calculan, nunca se almacenan (regla transversal 01): esta es la
// única copia de las reglas de cumplimiento, y es la que la barra de Obligaciones y el
// correo mensual comparten («nunca puede contradecir a la bandeja»).

import { cumplimientoDePeriodo, deudaVencida, cierresAdministrativos } from '../cumplimiento';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function asignacion(
  over: Partial<{
    id: number;
    estado: string;
    fechaLimite: Date;
    fechaCierre: Date | null;
    personaId: number;
    cerradaPor: number | null;
  }> = {},
) {
  return {
    id: 1,
    estado: 'PENDIENTE',
    fechaLimite: d('2026-08-31'),
    fechaCierre: null,
    personaId: 1,
    cerradaPor: null,
    ...over,
  };
}

describe('cumplimientoDePeriodo', () => {
  it('realizada a tiempo cuenta; pendiente no', () => {
    const r = cumplimientoDePeriodo([
      asignacion({ estado: 'REALIZADA', fechaCierre: d('2026-08-30') }),
      asignacion({ id: 2, estado: 'PENDIENTE' }),
    ]);
    expect(r.asignadas).toBe(2);
    expect(r.realizadasATiempo).toBe(1);
    expect(r.realizadasTarde).toBe(0);
    expect(r.porciento).toBe(50);
  });

  it('cerrar después de la fecha límite es tarde, no a tiempo', () => {
    const r = cumplimientoDePeriodo([
      asignacion({ estado: 'REALIZADA', fechaCierre: d('2026-09-02') }),
    ]);
    expect(r.realizadasATiempo).toBe(0);
    expect(r.realizadasTarde).toBe(1);
    expect(r.porciento).toBe(0);
  });

  it('NO_APLICA y ANULADA no penalizan: no eran exigibles', () => {
    const r = cumplimientoDePeriodo([
      asignacion({ estado: 'REALIZADA', fechaCierre: d('2026-08-30') }),
      asignacion({ id: 2, estado: 'NO_APLICA' }),
      asignacion({ id: 3, estado: 'ANULADA' }),
    ]);
    expect(r.asignadas).toBe(1);
    expect(r.realizadasATiempo).toBe(1);
    expect(r.porciento).toBe(100);
  });

  it('sin asignaciones el periodo está vacío, no en cero por ciento', () => {
    const r = cumplimientoDePeriodo([]);
    expect(r.asignadas).toBe(0);
    expect(r.porciento).toBeNull();
  });
});

describe('deudaVencida', () => {
  it('cuenta las pendientes vencidas y la antigüedad de la más vieja', () => {
    const hoy = d('2026-09-10');
    const r = deudaVencida(
      [
        asignacion({ fechaLimite: d('2026-09-01') }),
        asignacion({ id: 2, fechaLimite: d('2026-09-08') }),
        asignacion({
          id: 3,
          estado: 'REALIZADA',
          fechaCierre: d('2026-09-05'),
          fechaLimite: d('2026-09-01'),
        }),
      ],
      hoy,
    );
    expect(r.cantidad).toBe(2);
    expect(r.masAntiguaDias).toBe(9);
  });

  it('sin deuda devuelve cero y sin antigüedad', () => {
    const r = deudaVencida([asignacion({ fechaLimite: d('2026-09-15') })], d('2026-09-10'));
    expect(r.cantidad).toBe(0);
    expect(r.masAntiguaDias).toBeNull();
  });
});

describe('cierresAdministrativos', () => {
  it('cuenta solo los cierres con cerradaPor distinto de la persona', () => {
    const r = cierresAdministrativos([
      asignacion({ estado: 'REALIZADA', cerradaPor: 2 }),
      asignacion({ id: 2, estado: 'REALIZADA', cerradaPor: 1 }),
    ]);
    expect(r).toBe(1);
  });
});