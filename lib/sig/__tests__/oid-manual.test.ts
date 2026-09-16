// lib/sig/__tests__/oid-manual.test.ts
//
// Lo que se prueba acá es que las dos poblaciones —quien tiene cuenta en Azure y quien
// todavía no— no se puedan confundir nunca.

import { esOidManual, PREFIJO_OID_MANUAL } from '../oid-manual';

describe('esOidManual', () => {
  it('reconoce el oid que inventamos', () => {
    expect(esOidManual(`${PREFIJO_OID_MANUAL}0c9d0d24-1f7a-4b2e-9a3e-77b1c2f9e001`)).toBe(true);
  });

  it('un oid de Azure NUNCA se confunde con uno manual', () => {
    // Es la garantía que sostiene todo: un UUID no lleva dos puntos, así que el prefijo es
    // imposible de producir por accidente desde el Directorio.
    expect(esOidManual('0c9d0d24-1f7a-4b2e-9a3e-77b1c2f9e001')).toBe(false);
  });

  it('sin oid no hay nada que reconocer, y no revienta', () => {
    // La persona puede venir de una consulta que no seleccionó el campo.
    expect(esOidManual(null)).toBe(false);
    expect(esOidManual(undefined)).toBe(false);
    expect(esOidManual('')).toBe(false);
  });

  it('el prefijo tiene que estar al PRINCIPIO, no en cualquier parte', () => {
    expect(esOidManual(`algo-${PREFIJO_OID_MANUAL}x`)).toBe(false);
  });
});
