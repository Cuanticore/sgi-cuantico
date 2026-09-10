// lib/sig/__tests__/scorm-tiempo.test.ts
//
// SCORM 2004 mide el tiempo en duraciones ISO 8601 (`PT1H23M45S`), no en segundos. Se
// prueba acá porque un error de conversión no se ve: el curso reporta 40 minutos, la base
// guarda 40 segundos, y el informe de capacitación queda mintiendo sin que nada falle.

import { aSegundos, aDuracion, sumarDuraciones } from '../scorm-tiempo';

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
