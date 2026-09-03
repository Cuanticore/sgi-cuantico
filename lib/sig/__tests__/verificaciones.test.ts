// lib/sig/__tests__/verificaciones.test.ts

import {
  avisoDeAnclaje,
  estadoDeVerificacion,
  validarEjecucion,
  type CicloDeVerificacion,
} from '../verificaciones';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const HOY = d('2026-09-03');

const ciclo = (limite: string, cierre: string | null = null): CicloDeVerificacion => ({
  fechaLimite: d(limite),
  fechaCierre: cierre === null ? null : d(cierre),
});

describe('estadoDeVerificacion', () => {
  it('una vencida se reporta vencida AUNQUE haya otra próxima', () => {
    // Mirar sólo la más cercana escondería la deuda, que es justo lo que el anclaje
    // anclado existe para no hacer.
    expect(estadoDeVerificacion([ciclo('2026-06-30'), ciclo('2026-09-05')], HOY, 7)).toBe('VENCIDA');
  });

  it('un ciclo cerrado no vence', () => {
    expect(estadoDeVerificacion([ciclo('2026-06-30', '2026-06-28')], HOY, 7)).toBe('AL_DIA');
  });

  it('próxima cuando cae dentro de los días de aviso', () => {
    expect(estadoDeVerificacion([ciclo('2026-09-08')], HOY, 7)).toBe('PROXIMA');
    expect(estadoDeVerificacion([ciclo('2026-09-30')], HOY, 7)).toBe('AL_DIA');
  });

  it('el día del vencimiento todavía no está vencido', () => {
    expect(estadoDeVerificacion([ciclo('2026-09-03')], HOY, 7)).toBe('PROXIMA');
  });

  it('sin ciclos NO es al día', () => {
    // Una verificación que nunca generó nada no está cumplida: está sin arrancar. Con
    // anclaje flotante es además el síntoma de que nadie cerró el ciclo previo.
    expect(estadoDeVerificacion([], HOY, 7)).toBe('SIN_CICLOS');
  });
});

describe('avisoDeAnclaje — los dos lados tienen consecuencia', () => {
  it('el flotante advierte que deja de generar', () => {
    const a = avisoDeAnclaje('FLOTANTE');
    expect(a.tono).toBe('cuidado');
    expect(a.texto).toContain('deja de generar');
  });

  it('el anclado también dice lo suyo, no queda mudo', () => {
    // Mostrar sólo la advertencia del flotante haría parecer que el anclado no cuesta nada.
    const a = avisoDeAnclaje('ANCLADA');
    expect(a.tono).toBe('bien');
    expect(a.texto).toContain('el trimestre existió aunque nadie lo mirara');
  });
});

describe('validarEjecucion', () => {
  it('exige la nota incluso en una conforme', () => {
    const e = validarEjecucion({ resultado: 'CONFORME', nota: 'ok', hallazgoId: null });
    expect(e.join(' ')).toContain('sin nota');
  });

  it('una conforme con nota pasa sin hallazgo', () => {
    expect(
      validarEjecucion({
        resultado: 'CONFORME',
        nota: 'Los cuatro puntos verificados sin observaciones.',
        hallazgoId: null,
      }),
    ).toEqual([]);
  });

  it('con hallazgo o no conforme, exige el hallazgo levantado', () => {
    for (const resultado of ['HALLAZGO', 'NO_CONFORME'] as const) {
      const e = validarEjecucion({
        resultado,
        nota: 'La política de tratamiento está desactualizada.',
        hallazgoId: null,
      });
      expect(e.join(' ')).toContain('hallazgo en Mejora');
    }
  });

  it('con el hallazgo puesto, no protesta', () => {
    expect(
      validarEjecucion({
        resultado: 'NO_CONFORME',
        nota: 'La política de tratamiento está desactualizada.',
        hallazgoId: 42,
      }),
    ).toEqual([]);
  });
});
