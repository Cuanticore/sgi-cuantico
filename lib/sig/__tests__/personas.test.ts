// lib/sig/__tests__/personas.test.ts
//
// Este módulo decide quién entra, quién cambia y a quién se le apaga la cuenta en el SIG,
// así que los casos que importan son los que hacen daño: una lectura vacía del Directorio
// que apagaría a toda la organización, y un cambio de correo que duplicaría a una persona
// en vez de renombrarla.

import { normalizarCorreo, planificarSincronizacion } from '../personas';

const ADA = { oid: 'oid-ada', nombre: 'Ada Lovelace', correo: 'ada@cuantico.com' };
const GRACE = { oid: 'oid-grace', nombre: 'Grace Hopper', correo: 'grace@cuantico.com' };

function existente(e: typeof ADA, activa = true) {
  return { ...e, activa };
}

describe('normalizarCorreo', () => {
  it('baja a minúsculas y recorta espacios', () => {
    expect(normalizarCorreo('  Ada@Cuantico.COM ')).toBe('ada@cuantico.com');
  });
});

describe('altas', () => {
  it('quien está en el Directorio y no en la base, entra', () => {
    const plan = planificarSincronizacion([ADA], []);
    expect(plan.altas).toEqual([{ ...ADA, correo: 'ada@cuantico.com' }]);
    expect(plan.cambios).toEqual([]);
    expect(plan.inactivaciones).toEqual([]);
  });

  it('no hay alta cuando ya existe', () => {
    const plan = planificarSincronizacion([ADA], [existente(ADA)]);
    expect(plan.altas).toEqual([]);
    expect(plan.cambios).toEqual([]);
  });
});

describe('cambios', () => {
  it('un nombre distinto produce un cambio de nombre', () => {
    const plan = planificarSincronizacion(
      [{ ...ADA, nombre: 'Ada Byron' }],
      [existente(ADA)],
    );
    expect(plan.cambios).toEqual([
      { oid: 'oid-ada', campo: 'nombre', anterior: 'Ada Lovelace', nuevo: 'Ada Byron' },
    ]);
  });

  // El caso que justifica que la identidad sea el oid y no el correo. Con el correo como
  // clave, esto crearía una persona nueva y dejaría huérfanos sus registros.
  it('un correo distinto con el mismo oid renombra, no duplica', () => {
    const plan = planificarSincronizacion(
      [{ ...ADA, correo: 'ada.byron@cuantico.com' }],
      [existente(ADA)],
    );
    expect(plan.altas).toEqual([]);
    expect(plan.cambios).toEqual([
      {
        oid: 'oid-ada',
        campo: 'correo',
        anterior: 'ada@cuantico.com',
        nuevo: 'ada.byron@cuantico.com',
      },
    ]);
  });

  it('el correo se compara sin distinguir mayúsculas', () => {
    const plan = planificarSincronizacion([{ ...ADA, correo: 'ADA@CUANTICO.COM' }], [existente(ADA)]);
    expect(plan.cambios).toEqual([]);
  });
});

describe('inactivación y reactivación', () => {
  it('quien desaparece del Directorio se inactiva, no se borra', () => {
    const plan = planificarSincronizacion([ADA], [existente(ADA), existente(GRACE)]);
    expect(plan.inactivaciones.map((p) => p.oid)).toEqual(['oid-grace']);
  });

  it('quien ya estaba inactiva no se vuelve a inactivar', () => {
    const plan = planificarSincronizacion([ADA], [existente(ADA), existente(GRACE, false)]);
    expect(plan.inactivaciones).toEqual([]);
  });

  it('quien reaparece se reactiva', () => {
    const plan = planificarSincronizacion([ADA, GRACE], [existente(ADA), existente(GRACE, false)]);
    expect(plan.reactivaciones.map((p) => p.oid)).toEqual(['oid-grace']);
  });
});

describe('la salvaguarda', () => {
  // Graph devolviendo una lista vacía es indistinguible de una organización que se quedó
  // sin gente, y la segunda no ocurre nunca. Sin esta regla, un permiso mal configurado en
  // la app registration apaga a toda la empresa en una sola corrida.
  it('un Directorio vacío no inactiva a nadie', () => {
    const plan = planificarSincronizacion([], [existente(ADA), existente(GRACE)]);
    expect(plan.inactivaciones).toEqual([]);
    expect(plan.altas).toEqual([]);
    expect(plan.abortado).toBe(true);
    expect(plan.motivo).toContain('vacío');
  });

  it('un Directorio con gente no aborta', () => {
    const plan = planificarSincronizacion([ADA], [existente(ADA)]);
    expect(plan.abortado).toBe(false);
    expect(plan.motivo).toBeNull();
  });

  it('ignora entradas sin oid o sin correo', () => {
    const plan = planificarSincronizacion(
      [ADA, { oid: '', nombre: 'Sin oid', correo: 'x@cuantico.com' }],
      [],
    );
    expect(plan.altas.map((a) => a.oid)).toEqual(['oid-ada']);
    expect(plan.ignoradas).toBe(1);
  });
});