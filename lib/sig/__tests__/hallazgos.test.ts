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
  motivoQueImpideCerrar,
  estaClasificado,
  etiquetaDeTipo,
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
// B5 y B7 — por qué NO se puede cerrar. La regla estaba escrita dentro de
// `cerrarHallazgo` y por eso nunca se ejercitó: los casos que importan son los que
// DEJARÍAN cerrar a quien no debe.
describe('motivoQueImpideCerrar', () => {
  const base = {
    anuladoEn: null,
    fechaCierre: null,
    tipo: 'OBSERVACION',
    responsableId: 7,
    cierraId: 9,
    accionesNoVerificacion: 0,
    tieneVerificacionEficaz: false,
  };

  it('deja cerrar cuando no hay impedimento', () => {
    expect(motivoQueImpideCerrar(base)).toBeNull();
  });

  // Separación de funciones: no depende del rol. Un administrador tampoco cierra el suyo.
  it('el responsable no cierra su propio hallazgo', () => {
    const m = motivoQueImpideCerrar({ ...base, cierraId: 7 });
    expect(m).toContain('separación de funciones');
  });

  it('sin responsable asignado, la separación de funciones no bloquea', () => {
    expect(motivoQueImpideCerrar({ ...base, responsableId: null, cierraId: null })).toBeNull();
  });

  it('un hallazgo anulado no se cierra', () => {
    expect(motivoQueImpideCerrar({ ...base, anuladoEn: new Date() })).toContain('anulado');
  });

  it('un hallazgo ya cerrado no se cierra de nuevo', () => {
    expect(motivoQueImpideCerrar({ ...base, fechaCierre: new Date() })).toContain('ya está cerrado');
  });

  // NC mayor y NC menor exigen verificación SIEMPRE, haya habido acción o no.
  it('las no conformidades no se cierran sin verificación eficaz', () => {
    for (const tipo of ['NC_MAYOR', 'NC_MENOR']) {
      expect(motivoQueImpideCerrar({ ...base, tipo })).toContain('verificación eficaz');
      expect(
        motivoQueImpideCerrar({ ...base, tipo, tieneVerificacionEficaz: true }),
      ).toBeNull();
    }
  });

  // Observación y oportunidad la exigen sólo si hubo acción: sin acción no hay eficacia
  // que verificar.
  it('observación y oportunidad exigen verificación sólo cuando hubo acción', () => {
    for (const tipo of ['OBSERVACION', 'OPORTUNIDAD']) {
      expect(motivoQueImpideCerrar({ ...base, tipo, accionesNoVerificacion: 0 })).toBeNull();
      expect(
        motivoQueImpideCerrar({ ...base, tipo, accionesNoVerificacion: 2 }),
      ).toContain('verificación eficaz');
      expect(
        motivoQueImpideCerrar({
          ...base,
          tipo,
          accionesNoVerificacion: 2,
          tieneVerificacionEficaz: true,
        }),
      ).toBeNull();
    }
  });

  // El orden importa: anulado gana sobre todo lo demás, para que el mensaje diga la causa
  // real y no la primera regla que casualmente se evalúe.
  it('el anulado se reporta antes que la falta de verificación', () => {
    expect(
      motivoQueImpideCerrar({ ...base, tipo: 'NC_MAYOR', anuladoEn: new Date() }),
    ).toContain('anulado');
  });
});

// Un hallazgo recien reportado tiene un tipo guardado que NADIE eligio: la columna no
// admite nulo. Mostrar ese tipo como si fuera una clasificacion rompe B3 —quien reporta no
// clasifica— en la primera pantalla donde el lider del SIG lo ve.
describe('estaClasificado y etiquetaDeTipo', () => {
  it('sin fecha de clasificacion, no esta clasificado', () => {
    expect(estaClasificado(null)).toBe(false);
  });

  it('con fecha, si', () => {
    expect(estaClasificado(new Date('2026-09-01T00:00:00.000Z'))).toBe(true);
  });

  it('la etiqueta ignora el tipo guardado mientras no haya clasificacion', () => {
    for (const tipo of ['NC_MAYOR', 'NC_MENOR', 'OBSERVACION', 'OPORTUNIDAD']) {
      expect(etiquetaDeTipo(tipo, null)).toBe('Sin clasificar');
    }
  });

  it('clasificado, muestra el tipo en palabras', () => {
    const fecha = new Date('2026-09-01T00:00:00.000Z');
    expect(etiquetaDeTipo('NC_MAYOR', fecha)).toBe('NC mayor');
    expect(etiquetaDeTipo('OPORTUNIDAD', fecha)).toBe('Oportunidad');
  });

  it('un tipo desconocido se muestra tal cual en vez de desaparecer', () => {
    expect(etiquetaDeTipo('LO_QUE_SEA', new Date())).toBe('LO_QUE_SEA');
  });
});
