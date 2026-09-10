// lib/sig/__tests__/generacion-piso.test.ts
//
// **Ninguna asignación nace vencida** (REQ-SIG-15 §5.2 · D-5).
//
// La tarea es de la persona, así que su reloj empieza cuando la persona la recibe — no
// cuando el calendario abrió el periodo, ni cuando la obligación se escribió.
//
// Es la regla R2 que `generacion.ts:132-133` ya declaraba y que el código NO cumplía:
// `resolverAlcance` resolvía el *quién* hoy, pero los *periodos* los producía `periodosHasta`
// arrancando en `obligacion.fechaInicio` sin piso por persona, y la fecha límite era siempre
// `apertura + plazoDias` sin mirar desde cuándo esa persona estaba sujeta a la obligación.
//
// Los cuatro casos que producían una tarea nacida vencida están cada uno con su prueba, y
// arriba de todo está la aserción que fija la decisión: sobre el plan ENTERO, con el plazo
// corto a propósito, **toda** asignación cumple `fechaLimite >= hoy`.

import {
  planificarGeneracion,
  type ActivoGenerable,
  type ObligacionGenerable,
  type PersonaGenerable,
} from '../generacion';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const HOY = d('2026-09-28');

/// Plazo corto a propósito: con 15 días y una obligación mensual, quien entra el 28 recibiría
/// la tarea del mes con límite el día 16 si el piso no corriera la fecha. Es el caso de P17.
const PLAZO = 15;

const OBLIGACION_ANTIGUA: ObligacionGenerable = {
  id: 1,
  contenidoId: 10,
  alcance: 'TODOS',
  alcancePersonaId: null,
  alcanceCargoId: null,
  alcanceAreaId: null,
  alcanceActivoId: null,
  alcanceTipoActivoId: null,
  alcanceNivelActivoId: null,
  responsableSeguimientoId: 99,
  periodicidad: 'MENSUAL',
  fechaInicio: d('2026-01-01'),
  plazoDias: PLAZO,
  activa: true,
  creadaEn: d('2026-01-01'),
};

/// Quien lleva en la organización desde antes de que la obligación existiera.
const VETERANA: PersonaGenerable = {
  id: 1,
  activa: true,
  areaId: 3,
  cargoId: 7,
  ingreso: d('2024-01-01'),
  areaDesde: d('2024-01-01'),
  cargoDesde: d('2024-01-01'),
};

/// Quien entra HOY, el día 28 del mes.
const RECIEN: PersonaGenerable = {
  id: 2,
  activa: true,
  areaId: 3,
  cargoId: 7,
  ingreso: HOY,
  areaDesde: HOY,
  cargoDesde: HOY,
};

describe('la aserción que fija D-5', () => {
  // **Los cuatro casos de la tabla de §5.2, y sólo esos cuatro.** Es importante que sean
  // esos: la regla es «ninguna asignación NACE vencida», no «no existen asignaciones
  // vencidas». Una veterana que debe la tarea de enero desde enero tiene una tarea vencida
  // legítima —nació a tiempo y venció por el paso del tiempo— y el §5.2 lo dice con todas
  // las letras: «el histórico no se toca… lo que cambia es que no se crean nuevas».
  //
  // Los cuatro casos tienen en común que **el piso es reciente**. Por eso se construyen
  // explícitamente en vez de mezclar un censo con una obligación antigua, que produciría
  // periodos pasados legítimos y haría fallar la aserción por la razón equivocada.
  const CASOS: { nombre: string; obligacion: ObligacionGenerable; persona: PersonaGenerable }[] = [
    {
      nombre: '1 · persona nueva en la organización',
      obligacion: OBLIGACION_ANTIGUA,
      persona: RECIEN,
    },
    {
      nombre: '2 · pertenencia nueva (traslado de área)',
      obligacion: { ...OBLIGACION_ANTIGUA, id: 2, alcance: 'AREA', alcanceAreaId: 3 },
      persona: { ...VETERANA, areaDesde: HOY },
    },
    {
      nombre: '2 bis · pertenencia nueva (cambio de cargo)',
      obligacion: { ...OBLIGACION_ANTIGUA, id: 3, alcance: 'CARGO', alcanceCargoId: 7 },
      persona: { ...VETERANA, cargoDesde: HOY },
    },
    {
      nombre: '3 · obligación nueva con fecha de inicio retroactiva',
      obligacion: { ...OBLIGACION_ANTIGUA, id: 4, creadaEn: HOY },
      persona: VETERANA,
    },
    {
      nombre: '4 · anclaje flotante, cuyo primer ciclo abría en fechaInicio',
      obligacion: { ...OBLIGACION_ANTIGUA, id: 5, anclaje: 'FLOTANTE' },
      persona: RECIEN,
    },
  ];

  // Una sola aserción sobre el plan COMPLETO de cada caso, y es la que importa: no comprueba
  // una fecha, comprueba que NINGUNA de las que el plan produce nazca vencida — con el plazo
  // corto a propósito, que es donde la regla se rompía.
  it.each(CASOS.map((c) => [c.nombre, c] as const))(
    'caso %s: ninguna asignación nace vencida',
    (_nombre, caso) => {
      const plan = planificarGeneracion([caso.obligacion], [caso.persona], [], HOY, 90);
      expect(plan.crear.length).toBeGreaterThan(0);
      for (const a of plan.crear) {
        expect(a.fechaLimite.getTime()).toBeGreaterThanOrEqual(HOY.getTime());
      }
    },
  );

  // Y la contraparte, para que la regla no se lea como «nunca hay vencidas»: la veterana que
  // debe enero desde enero SÍ recibe una tarea ya vencida, y eso es correcto.
  it('el histórico legítimo sigue existiendo: la veterana debe enero desde enero', () => {
    const plan = planificarGeneracion([OBLIGACION_ANTIGUA], [VETERANA], [], HOY, 0);
    const enero = plan.crear.find((a) => a.periodo === '2026-01');
    expect(enero).toBeDefined();
    expect(enero!.fechaLimite.getTime()).toBeLessThan(HOY.getTime());
  });
});

describe('§11.4 · los periodos cerrados antes de la pertenencia no existen', () => {
  it('a quien entra hoy, una obligación de enero no le crea los nueve meses pasados', () => {
    const plan = planificarGeneracion([OBLIGACION_ANTIGUA], [RECIEN], [], HOY, 0);
    // Con horizonte 0 el calendario llega hasta el periodo en curso: sin piso serían nueve.
    expect(plan.crear.map((a) => a.periodo)).toEqual(['2026-09']);
  });

  it('y a la veterana sí le crea todo el calendario', () => {
    const plan = planificarGeneracion([OBLIGACION_ANTIGUA], [VETERANA], [], HOY, 0);
    expect(plan.crear.length).toBe(9);
  });

  // Caso 3 de la tabla · una obligación nueva con inicio retroactivo no le crea a NADIE los
  // periodos ya transcurridos, ni siquiera a quien lleva años.
  it('nada anterior a la creación de la obligación, ni para la veterana', () => {
    const nueva = { ...OBLIGACION_ANTIGUA, creadaEn: HOY };
    const plan = planificarGeneracion([nueva], [VETERANA], [], HOY, 0);
    expect(plan.crear.map((a) => a.periodo)).toEqual(['2026-09']);
  });
});

describe('§11.3 · el periodo en curso lleva el plazo completo', () => {
  it('quien entra el 28 tiene sus 15 días, no una tarea vencida el 16', () => {
    const plan = planificarGeneracion([OBLIGACION_ANTIGUA], [RECIEN], [], HOY, 0);
    const septiembre = plan.crear.find((a) => a.periodo === '2026-09');
    expect(septiembre).toBeDefined();
    expect(septiembre!.fechaApertura.toISOString().slice(0, 10)).toBe('2026-09-28');
    expect(septiembre!.fechaLimite.toISOString().slice(0, 10)).toBe('2026-10-13');
  });

  // La consecuencia que hay que aceptar y decir en voz alta (P18): dos personas pueden tener
  // el MISMO periodo de la MISMA obligación con fechas límite distintas. Es correcto — el
  // plazo es de la tarea de cada uno, no del calendario.
  it('dos personas comparten periodo con fechas límite distintas, y está bien', () => {
    const plan = planificarGeneracion([OBLIGACION_ANTIGUA], [VETERANA, RECIEN], [], HOY, 0);
    const septiembre = plan.crear.filter((a) => a.periodo === '2026-09');
    expect(septiembre).toHaveLength(2);
    const limites = new Set(septiembre.map((a) => a.fechaLimite.toISOString().slice(0, 10)));
    expect(limites.size).toBe(2);
    expect(limites).toContain('2026-09-16'); // la veterana: apertura 09-01 + 15
    expect(limites).toContain('2026-10-13'); // la que entró el 28
  });
});

describe('§11.5 · la etiqueta no cambia, y por eso es idempotente', () => {
  it('el periodo sigue siendo el del calendario', () => {
    const plan = planificarGeneracion([OBLIGACION_ANTIGUA], [RECIEN], [], HOY, 0);
    expect(plan.crear[0].periodo).toBe('2026-09');
  });

  it('correr el plan dos veces no produce una segunda fila', () => {
    const primera = planificarGeneracion([OBLIGACION_ANTIGUA], [RECIEN], [], HOY, 0);
    const existentes = primera.crear.map((a) => ({
      obligacionId: a.obligacionId,
      personaId: a.personaId,
      periodo: a.periodo,
      activoId: a.activoId,
      fechaApertura: a.fechaApertura,
      fechaCierre: null,
    }));
    const segunda = planificarGeneracion([OBLIGACION_ANTIGUA], [RECIEN], existentes, HOY, 0);
    expect(segunda.crear).toHaveLength(0);
  });
});

describe('el término de pertenencia lo elige el alcance (Q1)', () => {
  // Alguien que lleva años en la organización pero acaba de entrar al área: la obligación por
  // área no le cobra los meses en que no pertenecía.
  it('AREA usa areaDesde, no el ingreso', () => {
    const trasladada: PersonaGenerable = { ...VETERANA, areaDesde: HOY };
    const porArea = { ...OBLIGACION_ANTIGUA, alcance: 'AREA' as const, alcanceAreaId: 3 };
    const plan = planificarGeneracion([porArea], [trasladada], [], HOY, 0);
    expect(plan.crear.map((a) => a.periodo)).toEqual(['2026-09']);
  });

  it('CARGO usa cargoDesde, no areaDesde', () => {
    const promovida: PersonaGenerable = { ...VETERANA, cargoDesde: HOY };
    const porCargo = { ...OBLIGACION_ANTIGUA, alcance: 'CARGO' as const, alcanceCargoId: 7 };
    const plan = planificarGeneracion([porCargo], [promovida], [], HOY, 0);
    expect(plan.crear.map((a) => a.periodo)).toEqual(['2026-09']);
  });

  // `TODOS` no tiene pertenencia con principio propio: su piso es el ingreso.
  it('TODOS ignora las fechas de pertenencia y usa el ingreso', () => {
    const trasladada: PersonaGenerable = { ...VETERANA, areaDesde: HOY, cargoDesde: HOY };
    const plan = planificarGeneracion([OBLIGACION_ANTIGUA], [trasladada], [], HOY, 0);
    // Nueve periodos: pertenece desde 2024 y la obligación existe desde enero.
    expect(plan.crear.length).toBe(9);
  });

  // Q1 · en los alcances por activo el término es `cargoDesde`: la persona está sujeta a la
  // revisión del activo desde que ocupa el cargo que lo posee.
  it('TIPO_ACTIVO usa cargoDesde de quien ocupa el cargo propietario', () => {
    const activos: ActivoGenerable[] = [{ id: 100, activo: true, tipoId: 5, propietarioId: 7 }];
    const promovida: PersonaGenerable = { ...VETERANA, cargoDesde: HOY };
    const porTipo: ObligacionGenerable = {
      ...OBLIGACION_ANTIGUA,
      alcance: 'TIPO_ACTIVO',
      alcanceTipoActivoId: 5,
    };
    const plan = planificarGeneracion([porTipo], [promovida], [], HOY, 0, activos);
    expect(plan.crear.map((a) => a.periodo)).toEqual(['2026-09']);
    expect(plan.crear[0].activoId).toBe(100);
  });

  // Q1 · y el faltante de propietario NO tiene término de pertenencia: llega por ser el
  // responsable de seguimiento, no por pertenecer a nada.
  it('el faltante de propietario usa sólo su ingreso y la obligación', () => {
    const activos: ActivoGenerable[] = [{ id: 102, activo: true, tipoId: 5, propietarioId: null }];
    const responsable: PersonaGenerable = { ...VETERANA, id: 99, cargoDesde: HOY, areaDesde: HOY };
    const porTipo: ObligacionGenerable = {
      ...OBLIGACION_ANTIGUA,
      alcance: 'TIPO_ACTIVO',
      alcanceTipoActivoId: 5,
    };
    const plan = planificarGeneracion([porTipo], [responsable], [], HOY, 0, activos);
    // Las fechas de pertenencia son de hoy y aun así recibe los nueve: su piso no las mira.
    expect(plan.crear.length).toBe(9);
    expect(plan.crear[0].personaId).toBe(99);
  });
});

describe('§11.4 variante flotante (Q3)', () => {
  it('el primer ciclo abre en el piso, no en la fecha de inicio de la obligación', () => {
    const flotante: ObligacionGenerable = { ...OBLIGACION_ANTIGUA, anclaje: 'FLOTANTE' };
    const plan = planificarGeneracion([flotante], [RECIEN], [], HOY, 0);
    expect(plan.crear).toHaveLength(1);
    expect(plan.crear[0].fechaApertura.toISOString().slice(0, 10)).toBe('2026-09-28');
    expect(plan.crear[0].fechaLimite.toISOString().slice(0, 10)).toBe('2026-10-13');
  });

  it('y para la veterana sigue abriendo en la fecha de inicio', () => {
    const flotante: ObligacionGenerable = { ...OBLIGACION_ANTIGUA, anclaje: 'FLOTANTE' };
    const plan = planificarGeneracion([flotante], [VETERANA], [], HOY, 0);
    expect(plan.crear[0].fechaApertura.toISOString().slice(0, 10)).toBe('2026-01-01');
  });
});

describe('UNICA se corre y nunca se descarta (Q2)', () => {
  // El acuerdo de confidencialidad es de una sola vez y PRO-TAL-01 lo exige antes de
  // habilitar cualquier acceso. Descartarlo por «su ventana ya pasó» dejaría a quien entra
  // hoy sin firmarlo, que es peor que cualquier fecha corrida.
  it('quien entra tres años después igual la recibe, con su plazo completo', () => {
    const unica: ObligacionGenerable = {
      ...OBLIGACION_ANTIGUA,
      periodicidad: 'UNICA',
      fechaInicio: d('2023-01-01'),
      creadaEn: d('2023-01-01'),
      plazoDias: 10,
    };
    const plan = planificarGeneracion([unica], [RECIEN], [], HOY, 0);
    expect(plan.crear).toHaveLength(1);
    expect(plan.crear[0].fechaApertura.toISOString().slice(0, 10)).toBe('2026-09-28');
    expect(plan.crear[0].fechaLimite.toISOString().slice(0, 10)).toBe('2026-10-08');
  });
});

describe('el destinatario que el censo no tiene', () => {
  // `resolverAlcance` puede producir el `responsableSeguimientoId` de una obligación cuya
  // persona no está en el censo pasado. Adivinarle un piso sería devolverle los periodos
  // vencidos; no generar es lo correcto, y el vencimiento de lo que sí existe avisa.
  it('no se genera, en vez de generar sin piso', () => {
    const activos: ActivoGenerable[] = [{ id: 102, activo: true, tipoId: 5, propietarioId: null }];
    const porTipo: ObligacionGenerable = {
      ...OBLIGACION_ANTIGUA,
      alcance: 'TIPO_ACTIVO',
      alcanceTipoActivoId: 5,
      responsableSeguimientoId: 12345,
    };
    const plan = planificarGeneracion([porTipo], [VETERANA], [], HOY, 0, activos);
    expect(plan.crear).toHaveLength(0);
  });
});
