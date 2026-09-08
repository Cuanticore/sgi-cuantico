// lib/sgsi/__tests__/directorio-colaborador.test.ts
//
// Quién del tenant entra al SIG. El defecto original no fue un rótulo de más: `/users`
// devuelve el tenant COMPLETO y la primera sincronización real trajo 90 personas, de las
// cuales 54 eran invitados B2B de clientes y aliados. Cada uno de esos 54 habría recibido
// obligaciones, el correo semanal y un lugar en el denominador de todos los indicadores.
//
// Una prueba que sólo mirara «devuelve una lista» no habría detectado nada: la lista estaba
// bien formada. Lo que estaba mal era QUIÉN venía en ella.

import { esColaboradorDeLaOrganizacion, type UsuarioDeGraph } from '../graph-usuario';

function usuario(extra: Partial<UsuarioDeGraph> = {}): UsuarioDeGraph {
  return {
    id: 'oid-1',
    displayName: 'Ada Lovelace',
    userPrincipalName: 'ada.lovelace@cuantico.com',
    accountEnabled: true,
    userType: 'Member',
    ...extra,
  };
}

describe('esColaboradorDeLaOrganizacion', () => {
  it('el miembro de la organización entra', () => {
    expect(esColaboradorDeLaOrganizacion(usuario())).toBe(true);
  });

  it('el invitado B2B NO entra, aunque tenga la cuenta habilitada', () => {
    expect(
      esColaboradorDeLaOrganizacion(
        usuario({
          userType: 'Guest',
          displayName: 'Tiindux - Diego Delgado',
          userPrincipalName: 'diegodelgado_tiindux.com#ext#@cuanticore.onmicrosoft.com',
        }),
      ),
    ).toBe(false);
  });

  // El criterio es `userType`, no la forma del UPN: `#ext#` es una convención de formato de
  // Microsoft, no un contrato. Si algún día la cambian, el filtro tiene que seguir
  // filtrando — y si alguien la imita en una cuenta interna, esa persona tiene que entrar.
  it('decide por userType y no por el «#ext#» del correo', () => {
    const conMarcaPeroMiembro = usuario({
      userType: 'Member',
      userPrincipalName: 'raro_dominio.com#ext#@cuanticore.onmicrosoft.com',
    });
    expect(esColaboradorDeLaOrganizacion(conMarcaPeroMiembro)).toBe(true);

    const sinMarcaPeroInvitado = usuario({
      userType: 'Guest',
      userPrincipalName: 'invitado@otraempresa.com',
    });
    expect(esColaboradorDeLaOrganizacion(sinMarcaPeroInvitado)).toBe(false);
  });

  // Un `userType` ausente se acepta: el error caro es dejar afuera a un colaborador real
  // —queda sin obligaciones y nadie lo nota—, no incluir a alguien de más, que se ve en el
  // censo.
  it('sin userType se acepta como miembro', () => {
    expect(esColaboradorDeLaOrganizacion(usuario({ userType: undefined }))).toBe(true);
  });

  it('la cuenta deshabilitada no entra', () => {
    expect(esColaboradorDeLaOrganizacion(usuario({ accountEnabled: false }))).toBe(false);
  });

  // `accountEnabled` ausente NO es lo mismo que `false`: Graph lo omite cuando no se pidió,
  // y tratarlo como bloqueo vaciaría el censo entero.
  it('sin accountEnabled se acepta', () => {
    expect(esColaboradorDeLaOrganizacion(usuario({ accountEnabled: undefined }))).toBe(true);
  });

  it.each([
    ['sin id', { id: undefined }],
    ['sin nombre', { displayName: undefined }],
    ['sin correo', { userPrincipalName: undefined }],
  ])('%s no entra: no se puede identificar', (_nombre, falta) => {
    expect(esColaboradorDeLaOrganizacion(usuario(falta))).toBe(false);
  });
});
