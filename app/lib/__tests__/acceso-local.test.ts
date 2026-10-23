// app/lib/__tests__/acceso-local.test.ts
//
// Entrar sin Directorio Activo cuando se trabaja en la propia máquina, sin abrir una puerta
// en producción y sin repetir el error que ya se corrigió una vez.
//
// `SGI_ROL_DEV` existió y se retiró el 08/09/2026. Otorgaba el ROL directamente, saltándose
// el camino grupo -> rol -> permiso, así que el entorno local no ejercitaba lo mismo que
// producción: un acceso que funciona en la máquina de quien programa y falla en el servidor
// oculta exactamente el defecto que hay que encontrar.
//
// Esto emite GRUPOS, no rol. El camino se recorre entero; lo único que no se hace es el
// viaje a Azure.

import { accesoLocalHabilitado, gruposDeCredenciales, gruposDelToken } from '../acceso-local';

describe('accesoLocalHabilitado', () => {
  it('exige las DOS condiciones, no una', () => {
    expect(accesoLocalHabilitado({ NODE_ENV: 'development', SGI_LOGIN_LOCAL: 'true' })).toBe(true);
  });

  it('NUNCA en producción, aunque la variable esté puesta', () => {
    // La guarda importante. Una variable de entorno se copia de un `.env` a otro sin querer;
    // `NODE_ENV` no. Si alcanzara con la variable, un descuido abriría el acceso en el
    // servidor y ahí no hay Directorio que valga.
    expect(accesoLocalHabilitado({ NODE_ENV: 'production', SGI_LOGIN_LOCAL: 'true' })).toBe(false);
  });

  it('no se activa sola fuera de producción: hay que pedirlo', () => {
    expect(accesoLocalHabilitado({ NODE_ENV: 'development' })).toBe(false);
    expect(accesoLocalHabilitado({ NODE_ENV: 'development', SGI_LOGIN_LOCAL: 'false' })).toBe(false);
    expect(accesoLocalHabilitado({ NODE_ENV: 'test', SGI_LOGIN_LOCAL: '1' })).toBe(false);
  });

  it('un entorno vacío no habilita nada', () => {
    expect(accesoLocalHabilitado({})).toBe(false);
  });
});

describe('gruposDeCredenciales', () => {
  it('parte por comas y limpia los espacios', () => {
    expect(gruposDeCredenciales('Líderes SIG, Otro Grupo')).toEqual(['Líderes SIG', 'Otro Grupo']);
  });

  it('sin grupos entra como Colaborador, que es el piso real', () => {
    // No es un caso raro: es el camino de cualquiera que no está en un grupo reconocido, y
    // el que hay que poder probar en local sin inventar nada.
    expect(gruposDeCredenciales('')).toEqual([]);
    expect(gruposDeCredenciales(undefined)).toEqual([]);
    expect(gruposDeCredenciales('  ,  ,')).toEqual([]);
  });
});

describe('gruposDelToken', () => {
  it('toma los grupos del perfil de Azure, que es el camino de producción', () => {
    expect(gruposDelToken({ groups: ['Líderes SIG'] }, undefined)).toEqual(['Líderes SIG']);
  });

  it('toma los del acceso local cuando no hay perfil', () => {
    expect(gruposDelToken(undefined, { grupos: ['Líderes SIG'] })).toEqual(['Líderes SIG']);
  });

  it('el perfil de Azure manda sobre el acceso local', () => {
    // Si alguna vez llegaran los dos, gana el Directorio. El acceso local no puede escalar
    // los permisos de una sesión real.
    expect(gruposDelToken({ groups: ['Colaboradores'] }, { grupos: ['Líderes SIG'] })).toEqual([
      'Colaboradores',
    ]);
  });

  it('descarta lo que no sea texto', () => {
    expect(gruposDelToken({ groups: ['Líderes SIG', 42, null] }, undefined)).toEqual(['Líderes SIG']);
  });

  it('devuelve undefined cuando no hay nada que decir, para no pisar el token', () => {
    // El token se reutiliza entre peticiones y `profile` sólo llega al iniciar sesión.
    // Devolver `[]` acá borraría los grupos de una sesión ya establecida.
    expect(gruposDelToken(undefined, undefined)).toBeUndefined();
    expect(gruposDelToken({}, {})).toBeUndefined();
  });
});
