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

function mensual(
  over: Partial<{
    id: number;
    tipo: string;
    codigo: string;
    titulo: string;
    fechaLimite: Date;
    estado: string;
    correo: string;
    obligacionTitulo: string | null;
    areaId: number | null;
    fechaCierre: Date | null;
    cerradaPor: number | null;
  }> = {},
) {
  return {
    ...tarea(over),
    areaId: 3,
    fechaCierre: null,
    cerradaPor: null,
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
  // El fixture cruza DOS áreas a propósito. Con una sola, un resumen sin filtrar pasa la
  // prueba: los datos ajenos que tendría que excluir no existen. Ahí vivió la fuga.
  const dosAreas = [
    { id: 1, nombre: 'Talento Humano', liderCorreo: 'albeiro@cuantico.com' },
    { id: 2, nombre: 'Gestión Comercial', liderCorreo: 'carla@cuantico.com' },
  ];

  /// Área 1: una a tiempo y una pendiente (50 %). Área 2: una a tiempo (100 %).
  /// Y una sin área, que no cuelga de ninguna.
  const cruzadas = [
    mensual({
      id: 1,
      areaId: 1,
      codigo: 'LEC-001',
      estado: 'REALIZADA',
      fechaLimite: d('2026-08-31'),
      fechaCierre: d('2026-08-30'),
    }),
    mensual({ id: 2, areaId: 1, codigo: 'LEC-001', estado: 'PENDIENTE', fechaLimite: d('2026-08-31') }),
    mensual({
      id: 3,
      areaId: 2,
      codigo: 'CAP-999',
      estado: 'REALIZADA',
      fechaLimite: d('2026-08-31'),
      fechaCierre: d('2026-08-30'),
    }),
    mensual({ id: 4, areaId: null, codigo: 'SIN-AREA', estado: 'PENDIENTE', fechaLimite: d('2026-08-31') }),
  ];

  it('el líder de proceso recibe solo su área; el líder del SIG todas (decisión 3)', () => {
    const plan = planificarMensuales(cruzadas, dosAreas, 'lider@cuantico.com', {
      anio: 2026,
      mes: 7,
    });

    const albeiro = plan.get('albeiro@cuantico.com')!;
    expect(albeiro.areaNombre).toBe('Talento Humano');
    // Las dos del área 1, NO las cuatro. Sin filtro esto daba 4.
    expect(albeiro.cumplimiento.asignadas).toBe(2);
    expect(albeiro.cumplimiento.porciento).toBe(50);

    const carla = plan.get('carla@cuantico.com')!;
    expect(carla.cumplimiento.asignadas).toBe(1);
    expect(carla.cumplimiento.porciento).toBe(100);

    // El líder del SIG sí ve todo, incluida la que no tiene área.
    const lider = plan.get('lider@cuantico.com')!;
    expect(lider.areaNombre).toBe('Todas las áreas');
    expect(lider.cumplimiento.asignadas).toBe(4);
  });

  it('las peores obligaciones de un área no nombran las de otra', () => {
    const plan = planificarMensuales(cruzadas, dosAreas, 'lider@cuantico.com', {
      anio: 2026,
      mes: 7,
    });

    // El correo lista «peor cumplimiento» por código. Es el otro camino por el que se
    // filtraban datos ajenos: el número podía cuadrar y la lista delatar al vecino.
    const codigosDe = (correo: string) =>
      plan.get(correo)!.peorCumplimiento.map((p) => p.codigo);

    expect(codigosDe('albeiro@cuantico.com')).toEqual(['LEC-001']);
    expect(codigosDe('carla@cuantico.com')).toEqual(['CAP-999']);
    expect(codigosDe('lider@cuantico.com')).toContain('SIN-AREA');
  });

  it('un área sin asignaciones del mes recibe resumen, sin porcentaje inventado', () => {
    const plan = planificarMensuales(
      [mensual({ id: 1, areaId: 1, fechaLimite: d('2026-08-31') })],
      dosAreas,
      'lider@cuantico.com',
      { anio: 2026, mes: 7 },
    );

    // El mensual se envía aunque no haya pendientes, al contrario del semanal. Pero cero
    // asignaciones no es cero por ciento: mostrar 0 % diría que el área no cumplió nada.
    const carla = plan.get('carla@cuantico.com')!;
    expect(carla).toBeDefined();
    expect(carla.cumplimiento.asignadas).toBe(0);
    expect(carla.cumplimiento.porciento).toBeNull();
    expect(carla.deuda.cantidad).toBe(0);
  });

  it('calcula el cumplimiento del mes con las mismas reglas que la barra (decisión 7 del plan A4)', () => {
    const plan = planificarMensuales(
      [
        mensual({ estado: 'REALIZADA', fechaCierre: d('2026-08-30') }),
        mensual({ id: 2, estado: 'PENDIENTE' }),
      ],
      [],
      'lider@cuantico.com',
      { anio: 2026, mes: 7 },
    );
    const r = plan.get('lider@cuantico.com')!;
    expect(r.cumplimiento.asignadas).toBe(2);
    expect(r.cumplimiento.realizadasATiempo).toBe(1);
    expect(r.cumplimiento.porciento).toBe(50);
  });

  it('la deuda se calcula contra el cierre del mes', () => {
    const plan = planificarMensuales(
      [mensual({ fechaLimite: d('2026-08-25') })],
      [],
      'lider@cuantico.com',
      { anio: 2026, mes: 7 },
    );
    expect(plan.get('lider@cuantico.com')!.deuda.cantidad).toBe(1);
  });
});