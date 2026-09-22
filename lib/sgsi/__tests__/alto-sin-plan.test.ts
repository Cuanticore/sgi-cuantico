// lib/sgsi/__tests__/alto-sin-plan.test.ts
//
// Qué amenaza, dentro del popup de planes, no se puede dejar pasar: banda alarmante y sin
// plan. El caso de la lista completa existe para que borrar 'Crítico' rompa un test, no sólo
// un comentario — ver la cabecera de `alto-sin-plan.ts` sobre por qué sigue ahí aunque hoy no
// tenga ninguna fila real.

import { BANDAS_ALARMANTES, esAmenazaAlarmanteSinPlan, esBandaAlarmante } from '../alto-sin-plan';

describe('esBandaAlarmante', () => {
  it('es cierto para Alto', () => {
    expect(esBandaAlarmante('Alto')).toBe(true);
  });

  it('es cierto para Crítico', () => {
    expect(esBandaAlarmante('Crítico')).toBe(true);
  });

  it('es falso para Medio', () => {
    expect(esBandaAlarmante('Medio')).toBe(false);
  });

  it('es falso para Bajo', () => {
    expect(esBandaAlarmante('Bajo')).toBe(false);
  });

  it('es falso para null: "sin calcular" no es "alto"', () => {
    expect(esBandaAlarmante(null)).toBe(false);
  });
});

describe('esAmenazaAlarmanteSinPlan', () => {
  it('Alto sin plan: sí', () => {
    expect(esAmenazaAlarmanteSinPlan({ banda: 'Alto', tienePlan: false })).toBe(true);
  });

  it('Alto con plan: no, ya está atendida', () => {
    expect(esAmenazaAlarmanteSinPlan({ banda: 'Alto', tienePlan: true })).toBe(false);
  });

  it('Medio sin plan: no, la banda no es alarmante', () => {
    expect(esAmenazaAlarmanteSinPlan({ banda: 'Medio', tienePlan: false })).toBe(false);
  });

  it('banda null sin plan: no, "sin calcular" no es "alto"', () => {
    expect(esAmenazaAlarmanteSinPlan({ banda: null, tienePlan: false })).toBe(false);
  });
});

describe('BANDAS_ALARMANTES', () => {
  it('fija la lista completa: Crítico y Alto, nada más y nada menos', () => {
    expect(BANDAS_ALARMANTES).toEqual(['Crítico', 'Alto']);
  });
});
