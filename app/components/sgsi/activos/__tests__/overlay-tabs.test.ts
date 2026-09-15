// app/components/sgsi/activos/__tests__/overlay-tabs.test.ts
//
// REQ-SIG-20 §6 (P3, D1) — tarea 3.4: el contrato de URL del overlay escribe dos de las
// cuatro pestañas distinto de como `FichaActivo` las nombra puertas adentro
// (`general`→`valoracion`, `matrices`→`resumen`); Amenazas y Ecuación se escriben igual en
// los dos lados. La tarea 3.5 además pide que la página completa entienda las DOS grafías,
// así que la función acepta la interna como alias de sí misma.

import { pestanaInternaDesdeUrl } from '../overlay-tabs';

describe('REQ-SIG-20 §6 (D1) · alias de pestaña del overlay (tarea 3.4)', () => {
  it.each([
    ['general', 'valoracion'],
    ['amenazas', 'amenazas'],
    ['matrices', 'resumen'],
    ['ecuacion', 'ecuacion'],
  ])('mapea la grafía de URL del overlay "%s" a la interna "%s"', (url, interna) => {
    expect(pestanaInternaDesdeUrl(url)).toBe(interna);
  });

  it.each([
    ['valoracion', 'valoracion'],
    ['resumen', 'resumen'],
  ])(
    'acepta también la grafía interna "%s" (tarea 3.5 — la página completa entiende las dos)',
    (url, interna) => {
      expect(pestanaInternaDesdeUrl(url)).toBe(interna);
    },
  );

  it('un tab ausente cae en valoracion, la pestaña que nunca está bloqueada', () => {
    expect(pestanaInternaDesdeUrl(null)).toBe('valoracion');
    expect(pestanaInternaDesdeUrl(undefined)).toBe('valoracion');
  });

  it('un tab desconocido cae en valoracion en vez de reventar', () => {
    expect(pestanaInternaDesdeUrl('lo-que-sea')).toBe('valoracion');
  });
});
