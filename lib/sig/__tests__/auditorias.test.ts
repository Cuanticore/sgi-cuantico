// lib/sig/__tests__/auditorias.test.ts
//
// El estado se calcula (decisión 3.1.4); C2 independencia; C7 vencimiento contra el
// plazo; C5 solo NC y OM promueven (C9).

import { estadoAuditoria, esIndependiente, vencidoEntrega, promueveHallazgo } from '../auditorias';

describe('estadoAuditoria', () => {
  it('sin notas: planificada', () => {
    expect(
      estadoAuditoria({ emitidoEn: null, cerradaEn: null, notas: 0, preliminar: false }),
    ).toBe('PLANIFICADA');
  });

  it('con notas y sin informe: en ejecución', () => {
    expect(
      estadoAuditoria({ emitidoEn: null, cerradaEn: null, notas: 3, preliminar: false }),
    ).toBe('EN_EJECUCION');
  });

  it('con preliminar: informe preliminar', () => {
    expect(
      estadoAuditoria({ emitidoEn: null, cerradaEn: null, notas: 3, preliminar: true }),
    ).toBe('INFORME_PRELIMINAR');
  });

  it('emitida manda: es un acto de una persona', () => {
    expect(
      estadoAuditoria({ emitidoEn: new Date(), cerradaEn: null, notas: 3, preliminar: true }),
    ).toBe('EMITIDA');
  });
});

describe('esIndependiente (C2)', () => {
  it('un auditor no puede auditar el proceso del que es responsable', () => {
    expect(esIndependiente('Gestión de calidad', 'Gestión de calidad')).toBe(false);
    expect(esIndependiente('Gestión comercial', 'Gestión de calidad')).toBe(true);
  });

  it('un auditor sin proceso asignado es independiente de cualquiera', () => {
    expect(esIndependiente('Gestión de calidad', null)).toBe(true);
  });
});

describe('vencidoEntrega (C7)', () => {
  it('vence cuando pasan los días del plazo desde el cierre', () => {
    expect(vencidoEntrega(new Date('2026-02-20'), 4, new Date('2026-02-24'))).toBe(false);
    expect(vencidoEntrega(new Date('2026-02-20'), 4, new Date('2026-02-25'))).toBe(true);
  });
});

describe('promueveHallazgo (C5, C9)', () => {
  it('NC y OM promueven; OK, RM y Fortaleza no', () => {
    expect(promueveHallazgo('NC')).toBe(true);
    expect(promueveHallazgo('OM')).toBe(true);
    expect(promueveHallazgo('OK')).toBe(false);
    expect(promueveHallazgo('RM')).toBe(false);
    expect(promueveHallazgo('FORTALEZA')).toBe(false);
  });
});