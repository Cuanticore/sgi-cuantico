// lib/sig/__tests__/scorm-tiempo.test.ts
//
// SCORM 2004 mide el tiempo en duraciones ISO 8601 (`PT1H23M45S`), no en segundos. Se
// prueba acá porque un error de conversión no se ve: el curso reporta 40 minutos, la base
// guarda 40 segundos, y el informe de capacitación queda mintiendo sin que nada falle.

import { aSegundos, aDuracion, enHorasYMinutos, sumarDuraciones } from '../scorm-tiempo';

describe('aSegundos', () => {
  it('lee horas, minutos y segundos', () => {
    expect(aSegundos('PT1H23M45S')).toBe(5025);
  });

  it('lee una duración con solo minutos', () => {
    expect(aSegundos('PT40M')).toBe(2400);
  });

  it('lee fracciones de segundo', () => {
    expect(aSegundos('PT0.5S')).toBe(0.5);
  });

  it('lee días y años, que el estándar admite', () => {
    expect(aSegundos('P1DT2H')).toBe(93600);
  });

  it('una duración vacía es cero, no NaN', () => {
    expect(aSegundos('PT0H0M0S')).toBe(0);
  });

  // Un valor inválido tiene que ser detectable: es un 406 para el curso, no un 0 silencioso.
  it('devuelve null cuando no es una duración', () => {
    expect(aSegundos('40 minutos')).toBeNull();
    expect(aSegundos('')).toBeNull();
    expect(aSegundos('P')).toBeNull();
  });
});

describe('aDuracion', () => {
  it('vuelve al formato del estándar', () => {
    expect(aDuracion(5025)).toBe('PT1H23M45S');
  });

  it('cero se escribe explícito', () => {
    expect(aDuracion(0)).toBe('PT0H0M0S');
  });

  it('ida y vuelta conserva el valor', () => {
    expect(aSegundos(aDuracion(3661))).toBe(3661);
  });
});

describe('sumarDuraciones', () => {
  // `cmi.total_time` lo acumula el LMS, no el curso: es la suma de las sesiones.
  it('acumula el tiempo total con la sesión nueva', () => {
    expect(sumarDuraciones('PT1H', 'PT30M')).toBe('PT1H30M0S');
  });

  it('una sesión inválida no destruye el total acumulado', () => {
    expect(sumarDuraciones('PT1H', 'basura')).toBe('PT1H0M0S');
  });
});

describe('enHorasYMinutos', () => {
  // El cero se DICE. «0 min» se lee como que la persona entró y no hizo nada, y eso es
  // una afirmación distinta de «el curso no reportó tiempo».
  it('cero no se disfraza de cero minutos', () => {
    expect(enHorasYMinutos(0)).toBe('sin tiempo registrado');
  });

  it('menos de un minuto va en segundos', () => {
    expect(enHorasYMinutos(45)).toBe('45 s');
  });

  it('sin horas sólo los minutos', () => {
    expect(enHorasYMinutos(35 * 60 + 12)).toBe('35 min');
  });

  it('la hora exacta no arrastra un cero de minutos', () => {
    expect(enHorasYMinutos(3600)).toBe('1 h');
  });

  it('horas y minutos juntos', () => {
    expect(enHorasYMinutos(3600 + 23 * 60 + 45)).toBe('1 h 23 min');
  });

  it('un negativo no produce un tiempo negativo', () => {
    expect(enHorasYMinutos(-90)).toBe('sin tiempo registrado');
  });
});
