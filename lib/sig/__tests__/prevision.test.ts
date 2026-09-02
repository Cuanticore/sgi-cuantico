// lib/sig/__tests__/prevision.test.ts
//
// La prevision existe para que nadie descubra DESPUES que creo 408 asignaciones. Las
// pruebas que importan son las que confirman las cuentas grandes y los avisos, porque un
// aviso que no salta es peor que no tenerlo: da confianza sin sostenerla.

import { preverGeneracion, personasAlcanzadas, type PersonaDelCenso } from '../prevision';

const p = (id: number, areaId: number | null, cargoId: number | null, activa = true): PersonaDelCenso => ({
  id,
  activa,
  areaId,
  cargoId,
});

/// Nueve personas, como el censo de la siembra: tres del area 1, dos del area 2, y una
/// inactiva que NUNCA debe contarse.
const CENSO = [
  p(1, 1, 10),
  p(2, 1, 10),
  p(3, 1, 20),
  p(4, 2, 20),
  p(5, 2, 30),
  p(6, 3, 30),
  p(7, 3, 30),
  p(8, 3, 40),
  p(9, 1, 10, false),
];

const HOY = new Date('2026-09-02T00:00:00.000Z');
const base = {
  periodicidad: 'MENSUAL' as const,
  fechaInicio: new Date('2026-09-01T00:00:00.000Z'),
  plazoDias: 15,
};

describe('personasAlcanzadas', () => {
  it('TODOS toma las activas y descarta la inactiva', () => {
    const r = personasAlcanzadas({ ...base, alcance: 'TODOS' }, CENSO);
    expect(r).toHaveLength(8);
    expect(r.some((x) => x.id === 9)).toBe(false);
  });

  it('AREA toma solo esa area', () => {
    // El area 1 tiene 1, 2, 3 activas y la 9 inactiva.
    const r = personasAlcanzadas({ ...base, alcance: 'AREA', alcanceAreaId: 1 }, CENSO);
    expect(r.map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it('CARGO toma solo ese cargo, cruzando areas', () => {
    const r = personasAlcanzadas({ ...base, alcance: 'CARGO', alcanceCargoId: 30 }, CENSO);
    expect(r.map((x) => x.id)).toEqual([5, 6, 7]);
  });

  it('PERSONA toma una, y ninguna si esta inactiva', () => {
    expect(personasAlcanzadas({ ...base, alcance: 'PERSONA', alcancePersonaId: 4 }, CENSO)).toHaveLength(1);
    // La 9 existe pero esta inactiva: una obligacion no le genera tareas a quien se fue.
    expect(personasAlcanzadas({ ...base, alcance: 'PERSONA', alcancePersonaId: 9 }, CENSO)).toHaveLength(0);
  });
});

describe('preverGeneracion · las cuentas', () => {
  it('mensual para todos: 8 personas × 12 periodos', () => {
    const r = preverGeneracion({ ...base, alcance: 'TODOS' }, CENSO, HOY);
    expect(r.problemas).toEqual([]);
    expect(r.personas).toBe(8);
    expect(r.periodosAlAnio).toBe(12);
    expect(r.asignacionesAlAnio).toBe(96);
  });

  it('anual para una persona: una sola asignacion al año', () => {
    const r = preverGeneracion(
      { ...base, periodicidad: 'ANUAL', alcance: 'PERSONA', alcancePersonaId: 1 },
      CENSO,
      HOY,
    );
    expect(r.asignacionesAlAnio).toBe(1);
  });

  it('los primeros vencimientos salen del mismo modulo que la generacion', () => {
    const r = preverGeneracion({ ...base, alcance: 'TODOS' }, CENSO, HOY);
    // Mensual desde el 1 de septiembre con 15 dias de plazo.
    expect(r.primerosVencimientos[0]).toBe('2026-09-16');
    expect(r.primerosVencimientos.length).toBeGreaterThan(0);
  });
});

describe('preverGeneracion · los problemas', () => {
  it('un alcance sin destino no se puede calcular', () => {
    const r = preverGeneracion({ ...base, alcance: 'AREA' }, CENSO, HOY);
    expect(r.problemas[0]).toContain('falta elegir a quién alcanza');
    expect(r.asignacionesAlAnio).toBe(0);
  });

  it('un plazo de cero se rechaza', () => {
    const r = preverGeneracion({ ...base, alcance: 'TODOS', plazoDias: 0 }, CENSO, HOY);
    expect(r.problemas.some((x) => x.includes('al menos un día'))).toBe(true);
  });
});

describe('preverGeneracion · los avisos', () => {
  // El caso que justifica la pantalla: 408 asignaciones sin que nadie lo haya pedido.
  it('avisa cuando pasa de 500 asignaciones al año', () => {
    const censoGrande = Array.from({ length: 50 }, (_, i) => p(i + 1, 1, 10));
    const r = preverGeneracion({ ...base, alcance: 'TODOS' }, censoGrande, HOY);
    expect(r.asignacionesAlAnio).toBe(600);
    expect(r.avisos.some((a) => a.includes('600 asignaciones'))).toBe(true);
  });

  it('avisa de una obligacion diaria', () => {
    const r = preverGeneracion({ ...base, periodicidad: 'DIARIA', alcance: 'TODOS' }, CENSO, HOY);
    expect(r.avisos.some((a) => a.includes('diaria'))).toBe(true);
  });

  // Dos asignaciones abiertas a la vez, para siempre: el plazo se come el periodo.
  it('avisa si el plazo es mas largo que el periodo', () => {
    const r = preverGeneracion({ ...base, periodicidad: 'MENSUAL', plazoDias: 45, alcance: 'TODOS' }, CENSO, HOY);
    expect(r.avisos.some((a) => a.includes('dos asignaciones abiertas'))).toBe(true);
  });

  it('avisa si el alcance no resuelve a nadie', () => {
    const r = preverGeneracion({ ...base, alcance: 'AREA', alcanceAreaId: 99 }, CENSO, HOY);
    expect(r.problemas).toEqual([]);
    expect(r.personas).toBe(0);
    expect(r.avisos.some((a) => a.includes('ninguna persona activa'))).toBe(true);
  });

  it('un caso normal no genera avisos: el aviso que salta siempre no se lee', () => {
    const r = preverGeneracion(
      { ...base, periodicidad: 'TRIMESTRAL', plazoDias: 15, alcance: 'AREA', alcanceAreaId: 1 },
      CENSO,
      HOY,
    );
    expect(r.avisos).toEqual([]);
  });
});
