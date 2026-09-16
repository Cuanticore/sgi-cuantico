// lib/sgsi/__tests__/exigencia.test.ts
//
// REQ-SIG-23 · la exigencia y la brecha, en la escala de porcentaje de REQ-SIG-24.
//
// Los casos de abajo son, casi uno a uno, los criterios de aceptación de los dos
// requerimientos — incluido el que más importa: que un activo cuya criticidad exige mucho
// y cuya valoración D no, TENGA brecha. Es el caso que el valor D no detecta solo, y la
// razón entera por la que existe la columna de criticidad.
//
// POR QUÉ LOS CASOS NUMÉRICOS USAN C2 Y NO C1. Desde REQ-SIG-24 §6.1, C1 exige el mismo
// número que C2 **más** una verificación vigente. Un caso de «cubierto» sobre C1 sin
// predicado de verificación no puede dar `cubierto`, y debe dar «no se pudo determinar»:
// afirmar cumplimiento sin haber mirado es precisamente lo que el requerimiento evita. Así
// que la aritmética se prueba sobre C2 y la verificación sobre C1, separadas.

import {
  conductorDeLaExigencia,
  evaluarBrecha,
  exigenciaPorValor,
  factorSobreResidual,
  nivelExigido,
} from '../exigencia';

/// Una amenaza que degrada sólo disponibilidad — A.24 Denegación de servicio.
const SOLO_D = { D: 1, I: 0, C: 0 };
/// Una que degrada sólo confidencialidad — A.19 Divulgación de información.
const SOLO_C = { D: 0, I: 0, C: 1 };

describe('§3.1 · lo que exige el valor de una dimensión', () => {
  it('5 exige 90 %', () => expect(exigenciaPorValor(5)).toBe(90));
  it('4 exige 70 %', () => expect(exigenciaPorValor(4)).toBe(70));
  it('3 no exige nada: ni siquiera alcanza el umbral del análisis', () => {
    expect(exigenciaPorValor(3)).toBeNull();
  });
});

describe('§3.1 · la criticidad gobierna la disponibilidad, y sólo ella', () => {
  it('C1 sobre una amenaza que degrada D exige 90 %', () => {
    expect(
      nivelExigido({ criticidad: 'C1', valores: { D: 1, I: 1, C: 1 }, degradacion: SOLO_D }),
    ).toBe(90);
  });

  it('C2 exige lo mismo que C1: el salto de C1 es la verificación, no el número', () => {
    expect(
      nivelExigido({ criticidad: 'C2', valores: { D: 1, I: 1, C: 1 }, degradacion: SOLO_D }),
    ).toBe(90);
  });

  it('C3 exige 80 % y C4 exige 70 %', () => {
    const base = { valores: { D: 1, I: 1, C: 1 }, degradacion: SOLO_D };
    expect(nivelExigido({ ...base, criticidad: 'C3' })).toBe(80);
    expect(nivelExigido({ ...base, criticidad: 'C4' })).toBe(70);
  });

  it('C5 no exige nada por criticidad: sin compromiso de servicio', () => {
    expect(
      nivelExigido({ criticidad: 'C5', valores: { D: 1, I: 1, C: 1 }, degradacion: SOLO_D }),
    ).toBeNull();
  });

  it('una amenaza que degrada SÓLO C no recibe exigencia de la criticidad (criterio 10)', () => {
    // A.19 sobre un activo C1: la criticidad es un compromiso de tiempo y no dice nada
    // sobre confidencialidad. Exigir cifrado porque el servicio no tolera caídas sería el
    // disparate que §3.1 evita.
    expect(
      nivelExigido({ criticidad: 'C1', valores: { D: 1, I: 1, C: 1 }, degradacion: SOLO_C }),
    ).toBeNull();
  });
});

describe('§3.1 · sobre D manda el MAYOR entre el valor y la criticidad', () => {
  it('D=5 con C4 exige 90 % por el VALOR, no 70 % (criterio 8)', () => {
    const entrada = { criticidad: 'C4', valores: { D: 5, I: 1, C: 1 }, degradacion: SOLO_D };
    expect(nivelExigido(entrada)).toBe(90);
    expect(conductorDeLaExigencia(entrada)).toBe('valor');
  });

  it('bajar la criticidad a C5 NO elimina la exigencia: D=5 sigue pidiendo 90 % (criterio 8)', () => {
    expect(
      nivelExigido({ criticidad: 'C5', valores: { D: 5, I: 1, C: 1 }, degradacion: SOLO_D }),
    ).toBe(90);
  });

  it('D=3 con C1 exige 90 % por la CRITICIDAD — el caso que el valor D no detecta solo', () => {
    const entrada = { criticidad: 'C1', valores: { D: 3, I: 1, C: 1 }, degradacion: SOLO_D };
    expect(nivelExigido(entrada)).toBe(90);
    expect(conductorDeLaExigencia(entrada)).toBe('criticidad');
  });

  it('cuando los dos piden lo mismo, el conductor son los dos', () => {
    const entrada = { criticidad: 'C1', valores: { D: 5, I: 1, C: 1 }, degradacion: SOLO_D };
    expect(conductorDeLaExigencia(entrada)).toBe('ambos');
  });

  it('sin criticidad declarada, manda el valor y nada más', () => {
    expect(
      nivelExigido({ criticidad: null, valores: { D: 4, I: 1, C: 1 }, degradacion: SOLO_D }),
    ).toBe(70);
  });
});

describe('§6.2 · la brecha, en puntos', () => {
  const C2_SOBRE_D = { criticidad: 'C2', valores: { D: 3, I: 1, C: 1 }, degradacion: SOLO_D };

  it('exige 90 % y el principal está en 10 %: brecha de 80 puntos', () => {
    expect(evaluarBrecha({ ...C2_SOBRE_D, nivelPrincipal: 10 })).toEqual({
      tipo: 'brecha',
      exigido: 90,
      actual: 10,
      brecha: 80,
    });
  });

  it('el caso de MINTRACE: A.8.14 recalificado a 70 % abre 20 puntos (criterio 7)', () => {
    expect(evaluarBrecha({ ...C2_SOBRE_D, nivelPrincipal: 70 })).toEqual({
      tipo: 'brecha',
      exigido: 90,
      actual: 70,
      brecha: 20,
    });
  });

  it('el principal que alcanza lo exigido no reporta nada', () => {
    expect(evaluarBrecha({ ...C2_SOBRE_D, nivelPrincipal: 90 })).toEqual({
      tipo: 'cubierto',
      exigido: 90,
      actual: 90,
    });
  });

  it('un principal que SUPERA lo exigido tampoco: la brecha negativa no existe', () => {
    expect(evaluarBrecha({ ...C2_SOBRE_D, nivelPrincipal: 100 }).tipo).toBe('cubierto');
  });

  it('sin principal designado NO hay brecha cero: hay brecha no evaluable (criterio 12)', () => {
    // Es la diferencia entre «no falta nada» y «no se sabe». Confundirlas produce el
    // tablero que afirma con precisión que no hay brechas, que es el peor resultado
    // posible. Hoy es el estado de las 57 amenazas: las 272 relevancias siguen en null.
    expect(evaluarBrecha(C2_SOBRE_D)).toEqual({ tipo: 'sin-principal' });
  });

  it('un principal sin evaluar tampoco es un 0 %: es un juicio pendiente', () => {
    expect(evaluarBrecha({ ...C2_SOBRE_D, nivelPrincipal: null })).toEqual({
      tipo: 'principal-sin-evaluar',
      exigido: 90,
    });
  });

  it('sin exigencia no se evalúa nada, aunque el principal esté en 0 %', () => {
    expect(
      evaluarBrecha({
        criticidad: 'C5',
        valores: { D: 2, I: 2, C: 2 },
        degradacion: SOLO_D,
        nivelPrincipal: 0,
      }),
    ).toEqual({ tipo: 'sin-exigencia' });
  });
});

describe('§6.1 · C1 exige el mismo número, verificado', () => {
  const C1 = {
    criticidad: 'C1',
    valores: { D: 3, I: 1, C: 1 },
    degradacion: SOLO_D,
    nivelPrincipal: 90,
    codigoPrincipal: 'A.8.14',
  };

  it('nivel alcanzado y verificación vigente: cubierto (criterio 11)', () => {
    expect(evaluarBrecha({ ...C1, hayVerificacionVigente: () => true })).toEqual({
      tipo: 'cubierto',
      exigido: 90,
      actual: 90,
    });
  });

  it('nivel alcanzado sin verificación vigente: NO es cubierto (criterio 11)', () => {
    expect(evaluarBrecha({ ...C1, hayVerificacionVigente: () => false })).toEqual({
      tipo: 'brecha-de-verificacion',
      exigido: 90,
      actual: 90,
      codigoPrincipal: 'A.8.14',
    });
  });

  it('el mismo control y el mismo nivel sobre un C2 cumple (criterio 11)', () => {
    expect(
      evaluarBrecha({ ...C1, criticidad: 'C2', hayVerificacionVigente: () => false }).tipo,
    ).toBe('cubierto');
  });

  it('un vínculo que no resuelve no afirma que no hay verificación (D-3)', () => {
    // `Obligacion.controlAnexoA` es texto. Un código mal escrito no puede convertirse en
    // «este control no está verificado»: eso sería afirmar con precisión algo que nadie
    // comprobó.
    expect(evaluarBrecha({ ...C1, hayVerificacionVigente: () => null })).toEqual({
      tipo: 'verificacion-sin-determinar',
      exigido: 90,
      actual: 90,
      codigoPrincipal: 'A.8.14',
    });
  });

  it('sin predicado tampoco se afirma cumplimiento', () => {
    expect(evaluarBrecha(C1).tipo).toBe('verificacion-sin-determinar');
  });

  it('si el NIVEL ya no alcanza, la brecha de nivel manda sobre la de verificación', () => {
    // No tiene sentido reclamar la prueba de conmutación de un control que además está
    // tres escalones por debajo: primero se sube, después se verifica.
    expect(
      evaluarBrecha({ ...C1, nivelPrincipal: 60, hayVerificacionVigente: () => false }).tipo,
    ).toBe('brecha');
  });
});

describe('§6.2 · el factor que la brecha mete en el residual', () => {
  it('20 puntos desde 90 % son tres veces el residual del cumplidor', () => {
    expect(factorSobreResidual(90, 70)).toBeCloseTo(3, 10);
  });

  it('10 puntos desde 90 % son el doble', () => {
    expect(factorSobreResidual(90, 80)).toBeCloseTo(2, 10);
  });

  it('cubierto es factor 1', () => {
    expect(factorSobreResidual(90, 90)).toBeCloseTo(1, 10);
  });

  it('una exigencia del 100 % no tiene factor que calcular, y no divide por cero', () => {
    expect(factorSobreResidual(100, 90)).toBeNull();
  });
});
