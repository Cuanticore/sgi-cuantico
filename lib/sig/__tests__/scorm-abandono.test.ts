// lib/sig/__tests__/scorm-abandono.test.ts
//
// P13 · muchos cursos no llaman `Terminate` si se cierra la pestaña. Un intento que queda
// EN_CURSO para siempre bloquearía el siguiente —se reanudaría el colgado en vez de abrir
// uno nuevo—, así que se marca ABANDONADO conservando lo comprometido.

import { estaAbandonado, umbralDeAbandono } from '../scorm-abandono';

const AHORA = new Date('2026-09-08T18:00:00.000Z');

describe('umbralDeAbandono', () => {
  it('usa la variable cuando está', () => {
    expect(umbralDeAbandono('60')).toBe(60 * 60_000);
  });

  it('sin variable son 12 horas', () => {
    expect(umbralDeAbandono(undefined)).toBe(720 * 60_000);
  });

  it('una variable basura cae al valor por omisión en vez de dar NaN', () => {
    expect(umbralDeAbandono('ayer')).toBe(720 * 60_000);
    expect(umbralDeAbandono('0')).toBe(720 * 60_000);
  });
});

describe('estaAbandonado', () => {
  it('sin actividad por más del umbral, sí', () => {
    const hace13h = new Date('2026-09-08T05:00:00.000Z');
    expect(estaAbandonado(hace13h, AHORA, umbralDeAbandono('720'))).toBe(true);
  });

  it('con actividad reciente, no', () => {
    const hace10min = new Date('2026-09-08T17:50:00.000Z');
    expect(estaAbandonado(hace10min, AHORA, umbralDeAbandono('720'))).toBe(false);
  });

  it('justo en el umbral todavía no', () => {
    const hace12h = new Date('2026-09-08T06:00:00.000Z');
    expect(estaAbandonado(hace12h, AHORA, umbralDeAbandono('720'))).toBe(false);
  });
});
