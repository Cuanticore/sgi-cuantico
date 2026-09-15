// lib/sgsi/__tests__/criticidad-sla.test.ts
//
// REQ-SIG-20 §11 (P9) · el minuto es el dato y la hora es presentación. `CriticidadNegocio`
// guarda `rtoMinutos`/`rpoMinutos` en minutos porque es lo que permite ordenar y comparar;
// nadie debería leer «≤ 4 h» de vuelta para volver a convertirlo. Esta función hace ese
// último tramo —minuto → texto— en un solo lugar, para que las pantallas no lo improvisen
// cada una a su manera.

import { formatearSla } from '../criticidad-sla';

describe('por debajo de la hora se lee en minutos', () => {
  it('el RPO de C1, 5 minutos', () => {
    expect(formatearSla(5)).toBe('≤ 5 min');
  });

  it('el RTO de C1, 10 minutos', () => {
    expect(formatearSla(10)).toBe('≤ 10 min');
  });

  it('59 minutos todavía no es una hora', () => {
    expect(formatearSla(59)).toBe('≤ 59 min');
  });
});

describe('de la hora en adelante se lee en horas', () => {
  it('60 minutos es una hora, no «60 min»', () => {
    expect(formatearSla(60)).toBe('≤ 1 h');
  });

  it('el RTO de C2, 240 minutos', () => {
    expect(formatearSla(240)).toBe('≤ 4 h');
  });

  it('el RPO de C3, 480 minutos', () => {
    expect(formatearSla(480)).toBe('≤ 8 h');
  });

  it('el RTO de C3, un día entero, se dice en horas', () => {
    expect(formatearSla(1440)).toBe('≤ 24 h');
  });

  it('el RTO de C4, tres días, sigue en horas: «72 h» es como se escribe un SLA', () => {
    expect(formatearSla(4320)).toBe('≤ 72 h');
  });

  it('una hora incompleta conserva los minutos, no se redondea a la baja', () => {
    expect(formatearSla(90)).toBe('≤ 1 h 30 min');
  });
});

describe('los dos valores que no son una duración', () => {
  it('C5 —`null`— es «sin compromiso», un valor declarado y no una ausencia', () => {
    expect(formatearSla(null)).toBe('sin compromiso');
  });

  it('cero no tolera pérdida alguna, y decir «≤ 0 min» lo escondería', () => {
    expect(formatearSla(0)).toBe('sin pérdida tolerada');
  });
});

describe('un valor corrupto no se imprime como si fuera un compromiso', () => {
  it('un negativo no dice «≤ -5 min»', () => {
    expect(formatearSla(-5)).toBe('sin compromiso');
  });

  it('un no-número tampoco', () => {
    expect(formatearSla(Number.NaN)).toBe('sin compromiso');
  });
});
