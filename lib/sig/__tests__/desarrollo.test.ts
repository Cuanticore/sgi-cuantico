// lib/sig/__tests__/desarrollo.test.ts
//
// G4 · toda excepción nace con fecha de cierre. G5 · quien verifica no autoriza.
// G6 y G7 · ni el umbral ni los plazos viven en el código.

import {
  codigoExcepcion,
  diasHastaCierre,
  estadoDeExcepcion,
  faltantesDeHojaDeVida,
  fechaLimiteRemediacion,
  puedeCerrarHojaDeVida,
  resumirPuertas,
  validarExcepcion,
  validarPuerta,
  veredictoDePrueba,
  type HojaDeVida,
  type PlazosRemediacion,
} from '../desarrollo';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const HOY = d('2026-09-04');

describe('estadoDeExcepcion — lo que importa es que se cierre', () => {
  it('vencida cuando la fecha pasó y nadie la cerró', () => {
    // Es un hallazgo automático, no una alerta que se pueda posponer.
    expect(estadoDeExcepcion({ fechaCierre: d('2026-08-01'), cerradaEn: null }, HOY, 15)).toBe('VENCIDA');
  });

  it('por vencer dentro de los días de aviso', () => {
    expect(estadoDeExcepcion({ fechaCierre: d('2026-09-10'), cerradaEn: null }, HOY, 15)).toBe('POR_VENCER');
  });

  it('vigente más allá del aviso', () => {
    expect(estadoDeExcepcion({ fechaCierre: d('2026-12-01'), cerradaEn: null }, HOY, 15)).toBe('VIGENTE');
  });

  it('cerrada TARDE sigue siendo cerrada', () => {
    // Mezclar «se cerró fuera de plazo» en el estado haría que una excepción resuelta
    // siguiera apareciendo como pendiente para siempre.
    expect(
      estadoDeExcepcion({ fechaCierre: d('2026-01-01'), cerradaEn: d('2026-08-30') }, HOY, 15),
    ).toBe('CERRADA');
  });

  it('el día exacto del cierre todavía no está vencida', () => {
    expect(estadoDeExcepcion({ fechaCierre: HOY, cerradaEn: null }, HOY, 15)).toBe('POR_VENCER');
  });
});

describe('diasHastaCierre — un solo número dice las dos cosas', () => {
  it('positivo cuando falta, negativo cuando pasó', () => {
    expect(diasHastaCierre(d('2026-09-16'), HOY)).toBe(12);
    expect(diasHastaCierre(d('2026-07-26'), HOY)).toBe(-40);
  });
});

describe('validarExcepcion — G4, sin fecha de cierre no se guarda', () => {
  const base = {
    justificacion: 'El proveedor no entrega el informe de pruebas antes del corte de fase.',
    evaluacionRiesgo: 'Riesgo medio: el componente no expone datos personales ni internet.',
    fechaAprobacion: d('2026-09-01'),
    fechaCierre: d('2026-10-01'),
  };

  it('una excepción completa pasa', () => {
    expect(validarExcepcion(base)).toEqual([]);
  });

  it('sin fecha de cierre se rechaza, y el mensaje dice por qué', () => {
    const e = validarExcepcion({ ...base, fechaCierre: null });
    expect(e.join(' ')).toContain('exención permanente disfrazada');
  });

  it('exige la evaluación de riesgo', () => {
    // Avanzar sin cumplir exige decir qué se arriesga.
    expect(validarExcepcion({ ...base, evaluacionRiesgo: 'poco' }).join(' ')).toContain(
      'evaluación de riesgo',
    );
  });

  it('rechaza una que cerraría antes de aprobarse', () => {
    const e = validarExcepcion({ ...base, fechaCierre: d('2026-08-01') });
    expect(e.join(' ')).toContain('antes de aprobarse');
  });
});

describe('codigoExcepcion', () => {
  it('rellena a tres cifras', () => {
    expect(codigoExcepcion(2026, 7)).toBe('EXC-2026-007');
  });
});

describe('validarPuerta — G5, dos autoridades distintas', () => {
  it('rechaza que la misma persona verifique y autorice', () => {
    const e = validarPuerta({
      resultado: 'SUPERADA',
      verificadoPorId: 5,
      autorizaId: 5,
      excepcionId: null,
    });
    expect(e.join(' ')).toContain('no puede ser quien autoriza');
  });

  it('acepta dos personas distintas', () => {
    expect(
      validarPuerta({ resultado: 'SUPERADA', verificadoPorId: 5, autorizaId: 6, excepcionId: null }),
    ).toEqual([]);
  });

  it('«superada con excepción» exige la excepción', () => {
    // Sin ella es sólo «no superada» con mejor nombre.
    const e = validarPuerta({
      resultado: 'SUPERADA_CON_EXCEPCION',
      verificadoPorId: 5,
      autorizaId: 6,
      excepcionId: null,
    });
    expect(e.join(' ')).toContain('necesita la excepción');
  });

  it('G3 · NO_SUPERADA se acepta sin protestar', () => {
    // Registrar P4 como no superada no impide registrar P5: la aplicación señala y sigue.
    expect(
      validarPuerta({ resultado: 'NO_SUPERADA', verificadoPorId: 5, autorizaId: 6, excepcionId: null }),
    ).toEqual([]);
  });

  it('una puerta pendiente no exige nada todavía', () => {
    expect(
      validarPuerta({ resultado: 'PENDIENTE', verificadoPorId: null, autorizaId: null, excepcionId: null }),
    ).toEqual([]);
  });
});

describe('resumirPuertas — con excepción no es lo mismo que cumpliendo', () => {
  it('cuenta las cuatro categorías', () => {
    const r = resumirPuertas([
      { puerta: 'P1', resultado: 'SUPERADA' },
      { puerta: 'P2', resultado: 'SUPERADA' },
      { puerta: 'P3', resultado: 'SUPERADA_CON_EXCEPCION' },
      { puerta: 'P4', resultado: 'NO_SUPERADA' },
    ]);
    expect(r).toMatchObject({ superadas: 2, conExcepcion: 1, noSuperadas: 1, pendientes: 2 });
  });

  it('el resumen NO suma las que tienen excepción a las superadas', () => {
    // Avanzar con excepción y avanzar cumpliendo no son lo mismo; sumarlas borraría la
    // diferencia justo en el número que alguien mira de reojo.
    const r = resumirPuertas([
      { puerta: 'P1', resultado: 'SUPERADA' },
      { puerta: 'P2', resultado: 'SUPERADA_CON_EXCEPCION' },
    ]);
    expect(r.resumen).toBe('1 de 6 · 1 con excepción');
  });

  it('sin excepciones el resumen es simple', () => {
    expect(resumirPuertas([{ puerta: 'P1', resultado: 'SUPERADA' }]).resumen).toBe('1 de 6');
  });
});

describe('puedeCerrarHojaDeVida — G11', () => {
  it('sin P6 registrada no se cierra', () => {
    const r = puedeCerrarHojaDeVida([{ puerta: 'P5', resultado: 'SUPERADA' }]);
    expect(r.puede).toBe(false);
    if (!r.puede) expect(r.motivo).toContain('P6');
  });

  it('con P6 pendiente tampoco', () => {
    expect(puedeCerrarHojaDeVida([{ puerta: 'P6', resultado: 'PENDIENTE' }]).puede).toBe(false);
  });

  it('con P6 NO SUPERADA sí se puede cerrar', () => {
    // No contradice a G11: lo que se exige es que P6 se haya VERIFICADO, no que haya salido
    // bien. Exigir que saliera bien impediría cerrar la hoja de un sistema que se retiró
    // mal — y ese es justo el que hay que poder registrar.
    expect(puedeCerrarHojaDeVida([{ puerta: 'P6', resultado: 'NO_SUPERADA' }]).puede).toBe(true);
  });
});

describe('veredictoDePrueba — G6, el umbral es un parámetro', () => {
  const sin = { criticos: 0, altos: 0, medios: 2, bajos: 9 };
  const conAltos = { criticos: 0, altos: 3, medios: 0, bajos: 0 };

  it('«bloquea desde ALTOS» incluye los críticos', () => {
    expect(veredictoDePrueba({ criticos: 1, altos: 0, medios: 0, bajos: 0 }, 'ALTOS', false)).toBe(
      'BLOQUEA',
    );
  });

  it('medios y bajos no bloquean con el umbral en ALTOS', () => {
    expect(veredictoDePrueba(sin, 'ALTOS', false)).toBe('NO_BLOQUEA');
  });

  it('el MISMO conteo bloquea si el umbral se endurece', () => {
    // Es la prueba de que el número no está en el código: cambiar el parámetro cambia el
    // veredicto sin tocar una línea.
    expect(veredictoDePrueba(sin, 'MEDIOS', false)).toBe('BLOQUEA');
  });

  it('con excepción aprobada el veredicto lo dice, no lo esconde', () => {
    expect(veredictoDePrueba(conAltos, 'ALTOS', true)).toBe('BLOQUEA_SALVO_EXCEPCION');
  });

  it('sin hallazgos no bloquea, con o sin excepción', () => {
    const cero = { criticos: 0, altos: 0, medios: 0, bajos: 0 };
    expect(veredictoDePrueba(cero, 'CRITICOS', false)).toBe('NO_BLOQUEA');
    expect(veredictoDePrueba(cero, 'CRITICOS', true)).toBe('NO_BLOQUEA');
  });
});

describe('fechaLimiteRemediacion — G7, desde la notificación', () => {
  const plazos: PlazosRemediacion = { criticaHoras: 72, altaDias: 15, mediaDias: 60, bajaDias: 0 };

  it('la crítica cuenta en HORAS, no en días', () => {
    const r = fechaLimiteRemediacion('CRITICOS', d('2026-09-01'), plazos);
    expect(r?.toISOString().slice(0, 13)).toBe('2026-09-04T00');
  });

  it('la alta suma sus días', () => {
    expect(fechaLimiteRemediacion('ALTOS', d('2026-09-01'), plazos)?.toISOString().slice(0, 10)).toBe(
      '2026-09-16',
    );
  });

  it('la baja sin plazo devuelve null, y null NO es «vencida»', () => {
    // FOR-LCO-05 dice «siguiente entrega planificada», que no es un número de días. Poner
    // 90 o 180 sería inventar un plazo que el formato no fijó.
    expect(fechaLimiteRemediacion('BAJOS', d('2026-09-01'), plazos)).toBeNull();
  });

  it('si la organización fija un plazo para bajas, se usa', () => {
    const conBaja = { ...plazos, bajaDias: 90 };
    expect(fechaLimiteRemediacion('BAJOS', d('2026-09-01'), conBaja)?.toISOString().slice(0, 10)).toBe(
      '2026-11-30',
    );
  });
});

describe('faltantesDeHojaDeVida — señala, no impide', () => {
  const completa: HojaDeVida = {
    trataDatosPersonales: false,
    tratamientos: 0,
    requisitos: 3,
    pruebas: 2,
    componentes: 5,
    rtoObjetivo: 240,
    rpoObjetivo: 60,
    criticidad: 4,
    activoId: 12,
  };

  it('una hoja completa no reporta nada', () => {
    expect(faltantesDeHojaDeVida(completa)).toEqual([]);
  });

  it('el faltante de datos personales va PRIMERO', () => {
    // Es el bloque con mayor exposición legal del paquete incumplido en silencio.
    const f = faltantesDeHojaDeVida({ ...completa, trataDatosPersonales: true });
    expect(f[0]).toContain('Ley 1581');
  });

  it('no reclama tratamiento si el sistema no trata datos personales', () => {
    expect(faltantesDeHojaDeVida(completa).join(' ')).not.toContain('1581');
  });

  it('reclama el enlace al inventario', () => {
    const f = faltantesDeHojaDeVida({ ...completa, activoId: null });
    expect(f.join(' ')).toContain('ítem 50');
  });

  it('reclama el RTO y el RPO por el BIA', () => {
    const f = faltantesDeHojaDeVida({ ...completa, rtoObjetivo: null });
    expect(f.join(' ')).toContain('BIA');
  });
});
