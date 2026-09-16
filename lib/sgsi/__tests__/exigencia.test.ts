// lib/sgsi/__tests__/exigencia.test.ts
//
// REQ-SIG-23 · la exigencia y la brecha. Los casos de abajo son, casi uno a uno, los
// criterios de aceptación del §6 del requerimiento — incluido el que más importa: que un
// activo cuya criticidad exige mucho y cuya valoración D no, TENGA brecha. Es el caso que
// el valor D no detecta solo, y la razón entera por la que existe la columna de criticidad.

import {
  conductorDeLaExigencia,
  evaluarBrecha,
  exigenciaPorValor,
  nivelExigido,
} from '../exigencia';

/// Una amenaza que degrada sólo disponibilidad — A.24 Denegación de servicio.
const SOLO_D = { D: 1, I: 0, C: 0 };
/// Una que degrada sólo confidencialidad — A.19 Divulgación de información.
const SOLO_C = { D: 0, I: 0, C: 1 };

describe('§3.1 · lo que exige el valor de una dimensión', () => {
  it('5 exige L4', () => expect(exigenciaPorValor(5)).toBe(4));
  it('4 exige L3', () => expect(exigenciaPorValor(4)).toBe(3));
  it('3 no exige nada: ni siquiera alcanza el umbral del análisis', () => {
    expect(exigenciaPorValor(3)).toBeNull();
  });
});

describe('§3.1 · la criticidad gobierna la disponibilidad, y sólo ella', () => {
  it('C1 sobre una amenaza que degrada D exige L4', () => {
    expect(nivelExigido({ criticidad: 'C1', valores: { D: 1, I: 1, C: 1 }, degradacion: SOLO_D }))
      .toBe(4);
  });

  it('C3 exige L3', () => {
    expect(nivelExigido({ criticidad: 'C3', valores: { D: 1, I: 1, C: 1 }, degradacion: SOLO_D }))
      .toBe(3);
  });

  it('C5 no exige nada por criticidad: sin compromiso de servicio', () => {
    expect(nivelExigido({ criticidad: 'C5', valores: { D: 1, I: 1, C: 1 }, degradacion: SOLO_D }))
      .toBeNull();
  });

  it('una amenaza que degrada SÓLO C no recibe exigencia de la criticidad (criterio 4)', () => {
    // A.19 sobre un activo C1: la criticidad es un compromiso de tiempo y no dice nada
    // sobre confidencialidad. Exigir cifrado porque el servicio no tolera caídas sería el
    // disparate que §3.1 evita.
    expect(nivelExigido({ criticidad: 'C1', valores: { D: 1, I: 1, C: 1 }, degradacion: SOLO_C }))
      .toBeNull();
  });
});

describe('§3.1 · sobre D manda el MAYOR entre el valor y la criticidad', () => {
  it('D=5 con C4 exige L4 por el VALOR (criterio 2)', () => {
    const entrada = { criticidad: 'C4', valores: { D: 5, I: 1, C: 1 }, degradacion: SOLO_D };
    expect(nivelExigido(entrada)).toBe(4);
    expect(conductorDeLaExigencia(entrada)).toBe('valor');
  });

  it('bajar la criticidad a C5 NO elimina la exigencia: D=5 sigue pidiendo L4 (criterio 2)', () => {
    expect(nivelExigido({ criticidad: 'C5', valores: { D: 5, I: 1, C: 1 }, degradacion: SOLO_D }))
      .toBe(4);
  });

  it('D=3 con C1 exige L4 por la CRITICIDAD — el caso que el valor D no detecta solo', () => {
    const entrada = { criticidad: 'C1', valores: { D: 3, I: 1, C: 1 }, degradacion: SOLO_D };
    expect(nivelExigido(entrada)).toBe(4);
    expect(conductorDeLaExigencia(entrada)).toBe('criticidad');
  });

  it('cuando los dos piden lo mismo, el conductor son los dos', () => {
    const entrada = { criticidad: 'C1', valores: { D: 5, I: 1, C: 1 }, degradacion: SOLO_D };
    expect(conductorDeLaExigencia(entrada)).toBe('ambos');
  });

  it('sin criticidad declarada, manda el valor y nada más', () => {
    expect(nivelExigido({ criticidad: null, valores: { D: 4, I: 1, C: 1 }, degradacion: SOLO_D }))
      .toBe(3);
  });
});

describe('§4 · la brecha', () => {
  const C1_SOBRE_D = { criticidad: 'C1', valores: { D: 3, I: 1, C: 1 }, degradacion: SOLO_D };

  it('exige L4 y el principal está en L1: brecha de tres (criterio 1)', () => {
    expect(evaluarBrecha({ ...C1_SOBRE_D, nivelPrincipal: 1 })).toEqual({
      tipo: 'brecha',
      exigido: 4,
      actual: 1,
      brecha: 3,
    });
  });

  it('el principal que alcanza lo exigido no reporta nada', () => {
    expect(evaluarBrecha({ ...C1_SOBRE_D, nivelPrincipal: 4 })).toEqual({
      tipo: 'cubierto',
      exigido: 4,
      actual: 4,
    });
  });

  it('un principal que SUPERA lo exigido tampoco: la brecha negativa no existe', () => {
    expect(evaluarBrecha({ ...C1_SOBRE_D, nivelPrincipal: 5 }).tipo).toBe('cubierto');
  });

  it('sin principal designado NO hay brecha cero: hay brecha no evaluable (criterio 5)', () => {
    // Es la diferencia entre «no falta nada» y «no se sabe». Confundirlas produce el
    // tablero que afirma con precisión que no hay brechas, que es el peor resultado
    // posible (§2).
    expect(evaluarBrecha(C1_SOBRE_D)).toEqual({ tipo: 'sin-principal' });
  });

  it('un principal sin evaluar tampoco es un L0: es un juicio pendiente', () => {
    expect(evaluarBrecha({ ...C1_SOBRE_D, nivelPrincipal: null })).toEqual({
      tipo: 'principal-sin-evaluar',
      exigido: 4,
    });
  });

  it('sin exigencia no se evalúa nada, aunque el principal esté en L0', () => {
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
