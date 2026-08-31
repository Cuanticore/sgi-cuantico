// lib/sig/__tests__/generacion.test.ts
//
// R1 la generación es idempotente; R2 el alcance se resuelve al generar, no al definir;
// R11 desactivar una obligación no genera nada nuevo y no toca lo generado.

import { planificarGeneracion } from '../generacion';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const HOY = d('2026-09-15');

const contenido = { id: 10, tipo: 'LECTURA' as const };

const obligacionBase = {
  id: 1,
  contenidoId: contenido.id,
  alcance: 'TODOS' as const,
  alcancePersonaId: null,
  alcanceCargoId: null,
  alcanceAreaId: null,
  periodicidad: 'MENSUAL' as const,
  fechaInicio: d('2026-09-01'),
  plazoDias: 10,
  activa: true,
};

const ADA = { id: 1, activa: true, areaId: 3, cargoId: 7 };
const GRACE = { id: 2, activa: true, areaId: 3, cargoId: 8 };
const LINUS = { id: 3, activa: false, areaId: 4, cargoId: 7 };

// Cada persona recibe TODOS los periodos del horizonte (sep–dic desde el 15/09:
// 15/09 + 90 días = 14/12). Los casos de alcance comparan sobre el periodo actual.
function delPeriodo(plan: ReturnType<typeof planificarGeneracion>, etiqueta: string) {
  return plan.crear.filter((c) => c.periodo === etiqueta);
}

describe('planificarGeneracion — alcance TODOS', () => {
  it('alcanza a todas las personas activas', () => {
    const plan = planificarGeneracion([obligacionBase], [ADA, GRACE, LINUS], [], HOY);
    expect(delPeriodo(plan, '2026-09').map((c) => c.personaId).sort()).toEqual([1, 2]);
  });

  it('no alcanza a quien no está activa', () => {
    const plan = planificarGeneracion([obligacionBase], [ADA, LINUS], [], HOY);
    expect(delPeriodo(plan, '2026-09').map((c) => c.personaId)).toEqual([1]);
  });

  it('una corrida segunda con las existentes no duplica nada', () => {
    const primera = planificarGeneracion([obligacionBase], [ADA, GRACE], [], HOY);
    const segunda = planificarGeneracion(
      [obligacionBase],
      [ADA, GRACE],
      primera.crear.map((c) => ({ obligacionId: 1, personaId: c.personaId, periodo: c.periodo })),
      HOY,
    );
    expect(segunda.crear).toEqual([]);
  });
});

describe('planificarGeneracion — alcance por cargo, área y persona', () => {
  it('CARGO alcanza a quienes ocupan el cargo hoy (R2)', () => {
    const plan = planificarGeneracion(
      [{ ...obligacionBase, alcance: 'CARGO', alcanceCargoId: 7 }],
      [ADA, GRACE, LINUS],
      [],
      HOY,
    );
    // Linus está inactiva: no ocupa nada.
    expect(delPeriodo(plan, '2026-09').map((c) => c.personaId).sort()).toEqual([1]);
  });

  it('AREA alcanza a las personas activas del área', () => {
    const plan = planificarGeneracion(
      [{ ...obligacionBase, alcance: 'AREA', alcanceAreaId: 3 }],
      [ADA, GRACE, LINUS],
      [],
      HOY,
    );
    expect(delPeriodo(plan, '2026-09').map((c) => c.personaId).sort()).toEqual([1, 2]);
  });

  it('PERSONA alcanza solo a esa persona, y solo si está activa', () => {
    const plan = planificarGeneracion(
      [{ ...obligacionBase, alcance: 'PERSONA', alcancePersonaId: 3 }],
      [ADA, GRACE, LINUS],
      [],
      HOY,
    );
    expect(plan.crear).toEqual([]);
  });
});

describe('planificarGeneracion — periodos y estado', () => {
  it('genera todos los periodos del horizonte con sus fechas', () => {
    const plan = planificarGeneracion([obligacionBase], [ADA], [], HOY);
    expect(plan.crear).toEqual([
      {
        obligacionId: 1,
        contenidoId: 10,
        personaId: 1,
        periodo: '2026-09',
        fechaApertura: d('2026-09-01'),
        fechaLimite: d('2026-09-11'),
      },
      {
        obligacionId: 1,
        contenidoId: 10,
        personaId: 1,
        periodo: '2026-10',
        fechaApertura: d('2026-10-01'),
        fechaLimite: d('2026-10-11'),
      },
      {
        obligacionId: 1,
        contenidoId: 10,
        personaId: 1,
        periodo: '2026-11',
        fechaApertura: d('2026-11-01'),
        fechaLimite: d('2026-11-11'),
      },
      {
        obligacionId: 1,
        contenidoId: 10,
        personaId: 1,
        periodo: '2026-12',
        fechaApertura: d('2026-12-01'),
        fechaLimite: d('2026-12-11'),
      },
    ]);
  });

  it('una obligación UNICA genera un solo periodo por persona', () => {
    const plan = planificarGeneracion(
      [{ ...obligacionBase, periodicidad: 'UNICA' }],
      [ADA, GRACE],
      [],
      HOY,
    );
    expect(plan.crear).toHaveLength(2);
    expect(plan.crear[0].periodo).toBe('2026-09-01');
  });

  it('una obligación inactiva no genera nada (R11)', () => {
    const plan = planificarGeneracion([{ ...obligacionBase, activa: false }], [ADA], [], HOY);
    expect(plan.crear).toEqual([]);
  });

  it('una persona que ingresa después recibe solo los periodos no generados (R2)', () => {
    const plan = planificarGeneracion(
      [obligacionBase],
      [ADA],
      [{ obligacionId: 1, personaId: 1, periodo: '2026-09' }],
      HOY,
    );
    // ADA ya tiene septiembre; quedan octubre a diciembre dentro del horizonte.
    expect(plan.crear.map((c) => c.periodo)).toEqual(['2026-10', '2026-11', '2026-12']);
  });
});