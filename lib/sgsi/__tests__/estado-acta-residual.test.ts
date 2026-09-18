// lib/sgsi/__tests__/estado-acta-residual.test.ts

import { estadoVigente, type ActaParaEstado } from '../estado-acta-residual';

const HOY = new Date('2026-09-16T12:00:00Z');

function acta(p: Partial<ActaParaEstado> = {}): ActaParaEstado {
  return {
    estado: 'EMITIDA',
    alcanceHash: 'aaa',
    generadaEn: new Date('2026-09-01T00:00:00Z'),
    procesos: 3,
    procesosFirmados: 0,
    ...p,
  };
}

describe('estadoVigente', () => {
  it('una acta recién emitida y sin firmas sigue EMITIDA', () => {
    expect(estadoVigente(acta(), 'aaa', HOY, 12)).toBe('EMITIDA');
  });

  it('con todos los procesos firmados pasa a APROBADA', () => {
    expect(estadoVigente(acta({ procesos: 3, procesosFirmados: 3 }), 'aaa', HOY, 12)).toBe(
      'APROBADA',
    );
  });

  it('con firmas parciales NO está aprobada', () => {
    expect(estadoVigente(acta({ procesos: 3, procesosFirmados: 2 }), 'aaa', HOY, 12)).toBe(
      'EMITIDA',
    );
  });

  it('si la huella actual difiere de la firmada, queda DESACTUALIZADA', () => {
    expect(estadoVigente(acta({ procesos: 3, procesosFirmados: 3 }), 'bbb', HOY, 12)).toBe(
      'DESACTUALIZADA',
    );
  });

  it('pasada la vigencia queda VENCIDA', () => {
    const vieja = acta({
      generadaEn: new Date('2025-09-01T00:00:00Z'),
      procesos: 3,
      procesosFirmados: 3,
    });
    expect(estadoVigente(vieja, 'aaa', HOY, 12)).toBe('VENCIDA');
  });

  // Decirle «venció, renuévela» a alguien cuya acta además ya no describe las cifras vigentes
  // lo manda a recoger firmas sobre un documento que hay que rehacer, no renovar.
  it('desactualizada gana a vencida', () => {
    const vieja = acta({
      generadaEn: new Date('2025-09-01T00:00:00Z'),
      procesos: 3,
      procesosFirmados: 3,
    });
    expect(estadoVigente(vieja, 'bbb', HOY, 12)).toBe('DESACTUALIZADA');
  });

  it('una acta ANULADA no vuelve a ningún otro estado', () => {
    expect(estadoVigente(acta({ estado: 'ANULADA' }), 'bbb', HOY, 12)).toBe('ANULADA');
  });

  it('un acta sin procesos que firmar no se declara aprobada sola', () => {
    expect(estadoVigente(acta({ procesos: 0, procesosFirmados: 0 }), 'aaa', HOY, 12)).toBe(
      'EMITIDA',
    );
  });

  // El 31 de agosto más doce meses es el 31 de agosto, no el 1 de septiembre.
  it('la vigencia se cuenta en meses de calendario, no en días', () => {
    const acta31 = acta({ generadaEn: new Date('2025-08-31T00:00:00Z'), procesos: 0 });
    expect(estadoVigente(acta31, 'aaa', new Date('2026-08-31T00:00:00Z'), 12)).toBe('EMITIDA');
    expect(estadoVigente(acta31, 'aaa', new Date('2026-09-01T00:00:00Z'), 12)).toBe('VENCIDA');
  });
});
