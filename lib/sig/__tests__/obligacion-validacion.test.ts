// lib/sig/__tests__/obligacion-validacion.test.ts
//
// Las guardas de una obligación, probadas de verdad por primera vez.
//
// Vivían dentro de `app/sig/acciones/tareas.ts`, que es un archivo `'use server'`: la
// función no se exportaba —y no podía, porque en un archivo así toda exportación se vuelve
// una server action invocable desde el navegador— así que **ninguna prueba la tocaba**.
//
// REQ-SIG-17 §3 necesita las mismas guardas desde una semilla, y copiarlas habría producido
// dos reglas que se desincronizan en el primer cambio. Movidas acá, las llaman los dos lados
// y por fin se pueden probar.

import {
  validarDatosObligacion,
  type DatosObligacion,
} from '../obligacion-validacion';

const BASE: DatosObligacion = {
  contenidoId: 1,
  alcance: 'CARGO',
  alcanceCargoId: 10,
  periodicidad: 'MENSUAL',
  fechaInicio: new Date('2026-09-01T00:00:00.000Z'),
  plazoDias: 15,
  diasAviso: 5,
  responsableSeguimientoId: 7,
};

describe('lo que no puede faltar', () => {
  it('una obligación bien formada no tiene errores', () => {
    expect(validarDatosObligacion(BASE)).toEqual([]);
  });

  // El tipo dice que son obligatorios, pero eso solo vale en compilación: los datos llegan
  // de un formulario, y un `<select>` sin opciones —porque el catálogo está vacío— manda
  // `undefined`. Sin esta comprobación ese `undefined` viajaba hasta Prisma, que respondía
  // «Argument `id` is missing» con el nombre del módulo empaquetado a cuestas.
  it('pide el contenido cuando no llega', () => {
    const r = validarDatosObligacion({ ...BASE, contenidoId: undefined as never });
    expect(r).toContain('elegí el contenido de la obligación');
  });

  it('pide el responsable de seguimiento', () => {
    const r = validarDatosObligacion({ ...BASE, responsableSeguimientoId: 0 });
    expect(r).toContain('elegí quién responde por el seguimiento');
  });

  it('rechaza una fecha de inicio inválida', () => {
    const r = validarDatosObligacion({ ...BASE, fechaInicio: new Date('no es fecha') });
    expect(r).toContain('la fecha de inicio no es válida');
  });

  it('el plazo tiene que ser positivo', () => {
    expect(validarDatosObligacion({ ...BASE, plazoDias: 0 })).toContain(
      'el plazo debe ser positivo',
    );
    expect(validarDatosObligacion({ ...BASE, plazoDias: -1 })).toContain(
      'el plazo debe ser positivo',
    );
  });

  // Cero días de aviso es legítimo —«avisame el mismo día»—; negativo no significa nada.
  it('los días de aviso admiten cero pero no negativos', () => {
    expect(validarDatosObligacion({ ...BASE, diasAviso: 0 })).toEqual([]);
    expect(validarDatosObligacion({ ...BASE, diasAviso: -1 })).toContain(
      'los días de aviso no pueden ser negativos',
    );
  });

  it('devuelve TODOS los errores, no el primero', () => {
    const r = validarDatosObligacion({
      ...BASE,
      contenidoId: 0,
      plazoDias: 0,
      diasAviso: -3,
    });
    expect(r.length).toBeGreaterThanOrEqual(3);
  });
});

describe('R4 · exactamente un destino', () => {
  it('dos destinos se rechazan', () => {
    const r = validarDatosObligacion({ ...BASE, alcanceAreaId: 3 });
    expect(r).toContain('el alcance exige exactamente un destino');
  });

  it('ningún destino se rechaza', () => {
    const r = validarDatosObligacion({ ...BASE, alcanceCargoId: undefined });
    expect(r).toContain('el alcance exige exactamente un destino');
  });

  it('TODOS no lleva destino', () => {
    expect(
      validarDatosObligacion({ ...BASE, alcance: 'TODOS', alcanceCargoId: undefined }),
    ).toEqual([]);
    expect(validarDatosObligacion({ ...BASE, alcance: 'TODOS' })).toContain(
      'el alcance TODOS no lleva destino',
    );
  });

  // Sin esto, un alcance `TIPO_ACTIVO` con `alcanceAreaId` puesto pasaba la cuenta de arriba
  // y la generación no encontraba ningún activo: la obligación quedaba creada y sin generar
  // nada, en silencio.
  it('el destino tiene que estar en SU columna', () => {
    const r = validarDatosObligacion({
      ...BASE,
      alcance: 'TIPO_ACTIVO',
      alcanceCargoId: 10,
    });
    expect(r).toContain(
      'el alcance TIPO_ACTIVO exige su propio destino, no el de otro alcance',
    );
  });

  it('AREA con su área pasa', () => {
    expect(
      validarDatosObligacion({
        ...BASE,
        alcance: 'AREA',
        alcanceCargoId: undefined,
        alcanceAreaId: 3,
      }),
    ).toEqual([]);
  });
});

describe('NIVEL_ACTIVO se rechaza al crear, no al generar', () => {
  // Una obligación que nunca va a producir nada no debería poder guardarse.
  it('nombra el requerimiento que falta', () => {
    const r = validarDatosObligacion({
      ...BASE,
      alcance: 'NIVEL_ACTIVO',
      alcanceCargoId: undefined,
      alcanceNivelActivoId: 4,
    });
    expect(r.some((e) => e.includes('REQ-SIG-06'))).toBe(true);
  });
});

describe('las 27 de REQ-SIG-17 pasan las guardas', () => {
  // Criterio 6 del §8: «cada Obligacion respeta las guardas de crearObligacion». Se prueba
  // acá con las cuatro formas que el libro produce, no sólo con una.
  it.each([
    ['MENSUAL por área', { alcance: 'AREA' as const, alcanceAreaId: 8, plazoDias: 15, diasAviso: 5 }],
    ['MENSUAL por cargo', { alcance: 'CARGO' as const, alcanceCargoId: 9, plazoDias: 15, diasAviso: 5 }],
    ['TRIMESTRAL', { alcance: 'CARGO' as const, alcanceCargoId: 9, plazoDias: 30, diasAviso: 10 }],
    ['SEMESTRAL', { alcance: 'CARGO' as const, alcanceCargoId: 2, plazoDias: 45, diasAviso: 10 }],
    ['ANUAL', { alcance: 'CARGO' as const, alcanceCargoId: 2, plazoDias: 60, diasAviso: 15 }],
  ])('%s', (_nombre, parche) => {
    expect(
      validarDatosObligacion({ ...BASE, alcanceCargoId: undefined, ...parche }),
    ).toEqual([]);
  });
});
