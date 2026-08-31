// lib/sig/__tests__/hallazgos.test.ts
//
// El estado se calcula (B3, B8): abierto, en análisis, en ejecución y en verificación
// se deducen de lo que el hallazgo tiene. Lo único almacenado son las marcas de
// cerrado y anulado. También: el flujo escalonado por tipo y el consecutivo anual.

import {
  estadoCalculado,
  vencidoContra,
  exigeTabla,
  codigoHallazgo,
} from '../hallazgos';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function hallazgo(
  over: Partial<{
    anuladoEn: Date | null;
    fechaCierre: Date | null;
    tieneAnalisis: boolean;
    accionesAbiertas: number;
    verificacionEficaz: boolean;
    verificacionPendiente: boolean;
  }> = {},
) {
  return {
    anuladoEn: null,
    fechaCierre: null,
    tieneAnalisis: false,
    accionesAbiertas: 0,
    verificacionEficaz: false,
    verificacionPendiente: false,
    ...over,
  };
}

describe('estadoCalculado', () => {
  it('anulado manda: es una marca, no un cálculo', () => {
    expect(estadoCalculado(hallazgo({ anuladoEn: d('2026-09-01') }))).toBe('ANULADO');
  });

  it('cerrado es una marca de una persona', () => {
    expect(estadoCalculado(hallazgo({ fechaCierre: d('2026-09-01') }))).toBe('CERRADO');
  });

  it('sin clasificar nada consume plazos: abierto', () => {
    expect(estadoCalculado(hallazgo())).toBe('ABIERTO');
  });

  it('con análisis y sin acciones abiertas: en análisis', () => {
    expect(estadoCalculado(hallazgo({ tieneAnalisis: true }))).toBe('EN_ANALISIS');
  });

  it('con acciones abiertas: en ejecución', () => {
    expect(estadoCalculado(hallazgo({ tieneAnalisis: true, accionesAbiertas: 2 }))).toBe(
      'EN_EJECUCION',
    );
  });

  it('con verificación pendiente: en verificación', () => {
    expect(estadoCalculado(hallazgo({ verificacionPendiente: true }))).toBe('EN_VERIFICACION');
  });
});

describe('vencidoContra', () => {
  it('vence al día siguiente de la fecha compromiso', () => {
    expect(vencidoContra(d('2026-09-10'), d('2026-09-10'))).toBe(false);
    expect(vencidoContra(d('2026-09-10'), d('2026-09-11'))).toBe(true);
  });

  it('sin fecha compromiso no está vencido', () => {
    expect(vencidoContra(null, d('2026-09-11'))).toBe(false);
  });
});

describe('exigeTabla (flujo escalonado de la spec §4)', () => {
  it('NC mayor: corrección obligatoria, causa con método, extensión y verificación', () => {
    const e = exigeTabla('NC_MAYOR');
    expect(e.correccion).toBe('SI');
    expect(e.causa).toBe('METODO');
    expect(e.extension).toBe(true);
    expect(e.verificacion).toBe('SI');
  });

  it('NC menor: corrección solo si el efecto ocurrió, causa libre', () => {
    const e = exigeTabla('NC_MENOR');
    expect(e.correccion).toBe('SI_APLICA');
    expect(e.causa).toBe('LIBRE');
    expect(e.extension).toBe(true);
  });

  it('observación: causa opcional, sin extensión, verificación solo si hubo acción', () => {
    const e = exigeTabla('OBSERVACION');
    expect(e.correccion).toBe('NO');
    expect(e.causa).toBe('OPCIONAL');
    expect(e.extension).toBe(false);
    expect(e.verificacion).toBe('CONDICIONAL');
  });

  it('oportunidad: requiere al menos una acción de mejora', () => {
    const e = exigeTabla('OPORTUNIDAD');
    expect(e.causa).toBe('NO');
    expect(e.verificacion).toBe('CONDICIONAL');
  });
});

describe('codigoHallazgo', () => {
  it('formatea el consecutivo anual', () => {
    expect(codigoHallazgo(2026, 1)).toBe('HAL-2026-0001');
    expect(codigoHallazgo(2026, 21)).toBe('HAL-2026-0021');
  });
});