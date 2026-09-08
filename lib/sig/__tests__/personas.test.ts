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
import { entradaDesdePerfil } from '../personas';

describe('entradaDesdePerfil', () => {
  it('arma la entrada con el oid, el nombre y el UPN del token', () => {
    expect(
      entradaDesdePerfil({
        oid: 'oid-ada',
        name: 'Ada Lovelace',
        preferred_username: 'Ada@Cuantico.com',
      }),
    ).toEqual({ oid: 'oid-ada', nombre: 'Ada Lovelace', correo: 'ada@cuantico.com' });
  });

  it('acepta `email` cuando el token no trae preferred_username', () => {
    expect(
      entradaDesdePerfil({ oid: 'oid-ada', name: 'Ada Lovelace', email: 'ada@cuantico.com' }),
    ).toEqual({ oid: 'oid-ada', nombre: 'Ada Lovelace', correo: 'ada@cuantico.com' });
  });

  // Sin oid no hay identidad, y adivinarla por el correo es justo lo que este m�dulo evita.
  it('devuelve null sin oid, sin correo o sin perfil', () => {
    expect(entradaDesdePerfil({ name: 'Ada', email: 'ada@cuantico.com' })).toBeNull();
    expect(entradaDesdePerfil({ oid: 'oid-ada', name: 'Ada' })).toBeNull();
    expect(entradaDesdePerfil(undefined)).toBeNull();
  });

  it('usa el correo como nombre cuando el token no trae displayName', () => {
    expect(entradaDesdePerfil({ oid: 'oid-ada', email: 'ada@cuantico.com' })).toEqual({
      oid: 'oid-ada',
      nombre: 'ada@cuantico.com',
      correo: 'ada@cuantico.com',
    });
  });
});

import { resumirCorrida } from '../personas';

// La franja de la pantalla se arma con estas cuatro cifras. Los casos que importan son los
// que la harían mentir: inactivar y reactivar escriben el MISMO campo en la bitácora, así
// que confundirlos diría que se dieron de baja personas que acaban de volver.
describe('resumirCorrida', () => {
  it('clasifica el rastro completo de una corrida', () => {
    expect(
      resumirCorrida([
        { campo: 'alta', valorNuevo: 'creado' },
        { campo: 'alta', valorNuevo: 'creado' },
        { campo: 'nombre', valorNuevo: 'Ada Byron' },
        { campo: 'correo', valorNuevo: 'ada.byron@cuantico.com' },
        { campo: 'baja lógica', valorNuevo: 'dado de baja' },
        { campo: 'baja lógica', valorNuevo: 'vigente' },
      ]),
    ).toEqual({ altas: 2, actualizaciones: 2, inactivaciones: 1, reactivaciones: 1 });
  });

  it('separa la inactivación de la reactivación por el valor nuevo', () => {
    const soloBajas = resumirCorrida([
      { campo: 'baja lógica', valorNuevo: 'dado de baja' },
      { campo: 'baja lógica', valorNuevo: 'dado de baja' },
    ]);
    expect(soloBajas.inactivaciones).toBe(2);
    expect(soloBajas.reactivaciones).toBe(0);
  });

  it('un rastro vacío da cuatro ceros, que es distinto de no tener rastro', () => {
    expect(resumirCorrida([])).toEqual({
      altas: 0,
      actualizaciones: 0,
      inactivaciones: 0,
      reactivaciones: 0,
    });
  });

  it('no cuenta una fila que no sabe clasificar', () => {
    expect(resumirCorrida([{ campo: 'area', valorNuevo: 'Talento Humano' }])).toEqual({
      altas: 0,
      actualizaciones: 0,
      inactivaciones: 0,
      reactivaciones: 0,
    });
  });
});

// ─── Colisión de identidad ─────────────────────────────────────────────────────────────
//
// El caso que faltaba, y que rompió en la primera corrida real contra el Directorio:
// `Persona` tiene DOS columnas únicas —`oid` y `correo`— y este módulo sólo cruzaba por la
// primera. Una entrada con oid nuevo y correo ocupado se clasificaba como alta, el
// `create` moría contra el único de correo, y como el alta corre dentro de una transacción
// la corrida ENTERA se revertía. Un solo registro dejaba la sincronización inservible.
//
// Lo que estas pruebas fijan no es el mensaje: es que la colisión NO se cuele como alta.
describe('colisión de identidad · oid nuevo con correo ocupado', () => {
  const ADA_RECREADA = { ...ADA, oid: 'oid-ada-nuevo' };

  it('no la propone como alta: la reporta como conflicto', () => {
    const plan = planificarSincronizacion([ADA_RECREADA], [existente(ADA)]);

    expect(plan.altas).toEqual([]);
    expect(plan.conflictos).toEqual([
      {
        oid: 'oid-ada-nuevo',
        nombre: ADA.nombre,
        correo: ADA.correo,
        oidExistente: ADA.oid,
        nombreExistente: ADA.nombre,
        activaExistente: true,
      },
    ]);
  });

  // El único de la base no distingue activas de inactivas: la fila sigue ahí. Éste es el
  // caso que se volvió probable al inactivar 54 invitados —sus correos quedaron ocupados—.
  it('también choca contra una persona INACTIVA', () => {
    const plan = planificarSincronizacion([ADA_RECREADA], [existente(ADA, false)]);

    expect(plan.altas).toEqual([]);
    expect(plan.conflictos).toHaveLength(1);
    expect(plan.conflictos[0].activaExistente).toBe(false);
  });

  it('el conflicto de una no frena a las demás', () => {
    const plan = planificarSincronizacion([ADA_RECREADA, GRACE], [existente(ADA)]);

    expect(plan.altas).toEqual([{ ...GRACE, correo: 'grace@cuantico.com' }]);
    expect(plan.conflictos).toHaveLength(1);
  });

  // Compara por correo NORMALIZADO. Si comparara crudo, `ADA@CUANTICO.COM` pasaría el
  // filtro y volvería a morir contra el único, que sí normaliza.
  it('detecta la colisión aunque cambie la caja del correo', () => {
    const plan = planificarSincronizacion(
      [{ ...ADA_RECREADA, correo: 'ADA@Cuantico.COM' }],
      [existente(ADA)],
    );

    expect(plan.altas).toEqual([]);
    expect(plan.conflictos).toHaveLength(1);
  });

  // Un cambio de correo HACIA uno ocupado choca contra el mismo único y con el mismo
  // efecto: dos personas que intercambian alias.
  it('un cambio de correo hacia uno ajeno es conflicto, no cambio', () => {
    const plan = planificarSincronizacion(
      [{ ...ADA, correo: GRACE.correo }],
      [existente(ADA), existente(GRACE)],
    );

    expect(plan.cambios).toEqual([]);
    expect(plan.conflictos).toHaveLength(1);
    expect(plan.conflictos[0].nombreExistente).toBe(GRACE.nombre);
  });

  // Y el caso normal no se rompe: cambiar el correo a uno LIBRE sigue siendo un cambio.
  it('cambiar el correo a uno libre sigue siendo un cambio', () => {
    const plan = planificarSincronizacion(
      [{ ...ADA, correo: 'ada.lovelace@cuantico.com' }],
      [existente(ADA)],
    );

    expect(plan.conflictos).toEqual([]);
    expect(plan.cambios).toEqual([
      { oid: ADA.oid, campo: 'correo', anterior: ADA.correo, nuevo: 'ada.lovelace@cuantico.com' },
    ]);
  });

  it('sin colisiones, la lista de conflictos viene vacía', () => {
    const plan = planificarSincronizacion([ADA, GRACE], [existente(ADA)]);
    expect(plan.conflictos).toEqual([]);
    expect(plan.altas).toHaveLength(1);
  });
});
