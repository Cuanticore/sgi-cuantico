// lib/sig/__tests__/resumen.test.ts
//
// N1 sin nada que decir no se envía; N2 un correo por persona agrupado; el semanal es
// por persona con sus pendientes, el mensual por área con la acotación del líder.

import { planificarSemanales, planificarMensuales } from '../resumen';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const HOY = d('2026-09-07');

function tarea(
  over: Partial<{
    id: number;
    tipo: string;
    codigo: string;
    titulo: string;
    fechaLimite: Date;
    estado: string;
    correo: string;
    obligacionTitulo: string | null;
  }> = {},
) {
  return {
    id: 1,
    tipo: 'LECTURA',
    codigo: 'LEC-001',
    titulo: 'Política de seguridad',
    fechaLimite: d('2026-09-01'),
    estado: 'PENDIENTE',
    correo: 'lina@cuantico.com',
    obligacionTitulo: null,
    ...over,
  };
}

describe('planificarSemanales', () => {
  it('agrupa las tareas de cada persona en un solo correo (N2)', () => {
    const plan = planificarSemanales(
      [
        tarea({ fechaLimite: d('2026-09-01') }),
        tarea({ id: 2, fechaLimite: d('2026-09-08') }),
        tarea({ id: 3, correo: 'ada@cuantico.com', fechaLimite: d('2026-09-01') }),
      ],
      HOY,
    );
    expect([...plan.paraPersona.keys()].sort()).toEqual(['ada@cuantico.com', 'lina@cuantico.com']);
    expect(plan.paraPersona.get('lina@cuantico.com')!.vencidas).toHaveLength(1);
    expect(plan.paraPersona.get('lina@cuantico.com')!.porVencer).toHaveLength(1);
  });

  it('N1: quien no tiene pendientes ni vencidas no recibe correo', () => {
    const plan = planificarSemanales([tarea({ id: 9, estado: 'REALIZADA' })], HOY);
    expect(plan.paraPersona.size).toBe(0);
  });

  it('la antigüedad de la vencida se calcula en días', () => {
    const plan = planificarSemanales([tarea({ fechaLimite: d('2026-09-01') })], HOY);
    const vencida = plan.paraPersona.get('lina@cuantico.com')!.vencidas[0];
    expect(vencida.dias).toBe(-6);
  });

  it('por vencer es lo que vence dentro de los próximos 7 días', () => {
    const plan = planificarSemanales(
      [tarea({ fechaLimite: d('2026-09-14') }), tarea({ id: 2, fechaLimite: d('2026-09-20') })],
      HOY,
    );
    expect(plan.paraPersona.get('lina@cuantico.com')!.porVencer.map((t) => t.id)).toEqual([1]);
  });

  it('el responsable de seguimiento recibe el estado de sus obligaciones', () => {
    const plan = planificarSemanales(
      [tarea({ correo: 'lina@cuantico.com', obligacionTitulo: 'Leyendo política' })],
      HOY,
      'jefe@cuantico.com',
    );
    const jefe = plan.paraResponsable.get('jefe@cuantico.com');
    expect(jefe).toBeDefined();
    expect(jefe!.obligaciones[0].titulo).toBe('Leyendo política');
    expect(jefe!.obligaciones[0].abiertas).toBe(1);
  });
});

describe('planificarMensuales', () => {
  it('el líder de proceso recibe solo su área; el líder del SIG todas (decisión 3)', () => {
    const areas = [{ id: 1, nombre: 'Talento Humano', liderCorreo: 'albeiro@cuantico.com' }];
    const plan = planificarMensuales(
      [tarea({ correo: 'lina@cuantico.com', fechaLimite: d('2026-08-31') })],
      areas,
      'lider@cuantico.com',
      { anio: 2026, mes: 7 },
    );
    expect(plan.get('albeiro@cuantico.com')).toBeDefined();
    expect(plan.get('lider@cuantico.com')).toBeDefined();
    expect(plan.get('albeiro@cuantico.com')!.areaNombre).toBe('Talento Humano');
  });
});