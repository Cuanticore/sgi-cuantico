// lib/sgsi/__tests__/bloqueo.test.ts
//
// Lo que se prueba acá son las decisiones de la acción más destructiva que la aplicación tiene
// (REQ-SIG-15 §6). Las verificaciones 15 a 18 del requerimiento necesitan una cuenta de prueba
// en el tenant y los dos permisos de Azure concedidos —que **no lo están**—, así que no se
// pueden correr. Pero ninguna de ellas prueba lo que de verdad puede salir mal:
//
//   · que alguien se autobloquee y pierda el acceso con el que arreglarlo,
//   · que el SIG quede sin ningún administrador un viernes a las 7 p. m.,
//   · que se bloquee la cuenta de un aliado y se le rompa la colaboración a otro,
//   · y sobre todo que el bloqueo se haga **sin revocar las sesiones**, que es un bloqueo que
//     deja a la persona trabajando hasta una hora más y por lo tanto no contiene nada.
//
// Esas cuatro son decisiones y viven en un módulo puro, así que sí se demuestran. Una prueba
// que sólo mirara «devuelve ok» no habría detectado ninguna.

import {
  bloqueoHabilitado,
  confirmacionCoincide,
  decidirBloqueo,
  decidirDesbloqueo,
  fraseDeDesincronizacion,
  fraseDeRedIncompleta,
  laRedQuedoCompleta,
  motivoValido,
  pasosQueFaltan,
  MOTIVO_MINIMO,
  PASOS_DE_RED,
  VARIABLE_DE_BLOQUEO,
  type ContextoDeLaDecision,
  type PersonaDelCenso,
} from '../bloqueo';
import type { UsuarioDeGraph } from '../graph-usuario';

const OID_VICTIMA = '11111111-1111-1111-1111-111111111111';
const OID_OTRO = '22222222-2222-2222-2222-222222222222';

const DANIEL: PersonaDelCenso = {
  oid: OID_VICTIMA,
  correo: 'daniel.medina@cuantico.com',
  activa: true,
};

const CUENTA_PROPIA: UsuarioDeGraph = {
  id: OID_VICTIMA,
  displayName: 'Daniel Medina',
  userPrincipalName: 'daniel.medina@cuantico.com',
  accountEnabled: true,
  userType: 'Member',
};

const CUENTA_INVITADA: UsuarioDeGraph = {
  id: OID_VICTIMA,
  displayName: 'Aliado de Tiindux',
  userPrincipalName: 'aliado_tiindux.com#EXT#@cuantico.onmicrosoft.com',
  accountEnabled: true,
  userType: 'Guest',
};

/// El contexto sano: quien administra es otra persona, la cuenta se leyó y el grupo del SIG
/// tiene dos miembros. Cada prueba rompe UNA cosa.
const CONTEXTO: ContextoDeLaDecision = {
  autor: 'diego.munoz@cuantico.com',
  cuenta: CUENTA_PROPIA,
  miembrosDelGrupoSig: new Set([OID_OTRO, '33333333-3333-3333-3333-333333333333']),
};

const MOTIVO = 'incidente de seguridad reportado por el proveedor';
const CORREO = DANIEL.correo;

describe('P19 · el bloqueo son dos pasos de red y el segundo no es opcional', () => {
  // Es la prueba central del requerimiento. Deshabilitar la cuenta NO invalida el token de
  // acceso que la persona ya tiene: sigue siendo válido hasta una hora. Un bloqueo por
  // incidente que deja a alguien dentro una hora más no contiene nada.
  it('la lista de pasos del bloqueo incluye la revocación de sesiones', () => {
    expect(PASOS_DE_RED.BLOQUEO).toEqual(['DESHABILITAR', 'REVOCAR_SESIONES']);
  });

  it('deshabilitar sin revocar NO cuenta como red completa', () => {
    expect(laRedQuedoCompleta('BLOQUEO', ['DESHABILITAR'])).toBe(false);
    expect(pasosQueFaltan('BLOQUEO', ['DESHABILITAR'])).toEqual(['REVOCAR_SESIONES']);
  });

  it('revocar sin deshabilitar tampoco: el orden no salva un paso faltante', () => {
    expect(laRedQuedoCompleta('BLOQUEO', ['REVOCAR_SESIONES'])).toBe(false);
    expect(pasosQueFaltan('BLOQUEO', ['REVOCAR_SESIONES'])).toEqual(['DESHABILITAR']);
  });

  it('con los dos pasos, la red está completa y recién ahí se puede escribir la base', () => {
    expect(laRedQuedoCompleta('BLOQUEO', ['DESHABILITAR', 'REVOCAR_SESIONES'])).toBe(true);
  });

  it('el desbloqueo tiene un solo paso y no arrastra la revocación', () => {
    // Revocarle las sesiones a quien se acaba de habilitar sería cerrarle la sesión que
    // todavía no abrió: el paso existe para cortar un acceso, no para devolverlo.
    expect(PASOS_DE_RED.DESBLOQUEO).toEqual(['HABILITAR']);
    expect(laRedQuedoCompleta('DESBLOQUEO', ['HABILITAR'])).toBe(true);
    expect(laRedQuedoCompleta('DESBLOQUEO', [])).toBe(false);
  });

  it('la frase del bloqueo a medias dice que la persona puede seguir trabajando', () => {
    const frase = fraseDeRedIncompleta('BLOQUEO', ['DESHABILITAR']);
    expect(frase).toContain('A MEDIAS');
    expect(frase).toContain('hasta una hora');
    expect(frase).toContain('No se escribió nada en el censo');
  });

  it('sin ningún paso hecho, la frase dice que no se cambió nada', () => {
    expect(fraseDeRedIncompleta('BLOQUEO', [])).toContain('No se cambió nada');
    // Y no arrastra el aviso del token, que acá sería ruido: la cuenta nunca se deshabilitó.
    expect(fraseDeRedIncompleta('BLOQUEO', [])).not.toContain('hasta una hora');
  });
});

describe('P21.1 · la propia cuenta', () => {
  it('quien administra no se puede autobloquear', () => {
    const r = decidirBloqueo(DANIEL, { ...CONTEXTO, autor: DANIEL.correo }, MOTIVO, CORREO);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.mensaje).toContain('la propia cuenta');
  });

  it('la comparación pliega la caja: el correo del token no siempre viene igual', () => {
    const r = decidirBloqueo(
      DANIEL,
      { ...CONTEXTO, autor: 'Daniel.Medina@Cuantico.com' },
      MOTIVO,
      CORREO,
    );
    expect(r.ok).toBe(false);
  });

  it('y se decide ANTES que el motivo: corregir el motivo no lo iba a habilitar nunca', () => {
    const r = decidirBloqueo(DANIEL, { ...CONTEXTO, autor: DANIEL.correo }, 'no', CORREO);
    expect(r.ok === false && r.mensaje).toContain('la propia cuenta');
  });
});

describe('P21.2 · la última cuenta con rol RESPONSABLE', () => {
  it('se rechaza si bloquear deja el grupo del SIG en cero', () => {
    const r = decidirBloqueo(
      DANIEL,
      { ...CONTEXTO, miembrosDelGrupoSig: new Set([OID_VICTIMA]) },
      MOTIVO,
      CORREO,
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.mensaje).toContain('última cuenta con rol RESPONSABLE');
  });

  it('los object ids se comparan plegados: Azure no es consistente con la caja', () => {
    const r = decidirBloqueo(
      { ...DANIEL, oid: OID_VICTIMA.toUpperCase() },
      { ...CONTEXTO, miembrosDelGrupoSig: new Set([OID_VICTIMA]) },
      MOTIVO,
      CORREO,
    );
    expect(r.ok).toBe(false);
  });

  it('con otro responsable en el grupo, sí se puede', () => {
    const r = decidirBloqueo(
      DANIEL,
      { ...CONTEXTO, miembrosDelGrupoSig: new Set([OID_VICTIMA, OID_OTRO]) },
      MOTIVO,
      CORREO,
    );
    expect(r.ok).toBe(true);
  });

  it('quien no está en el grupo no es responsable y el tamaño no importa', () => {
    const r = decidirBloqueo(
      DANIEL,
      { ...CONTEXTO, miembrosDelGrupoSig: new Set([OID_OTRO]) },
      MOTIVO,
      CORREO,
    );
    expect(r.ok).toBe(true);
  });

  it('si no se pudo consultar el grupo, NO se bloquea: no saber no es saber que no', () => {
    // Es la misma regla que hace que `rolDeLaPersona` devuelva DESCONOCIDO en vez de
    // COLABORADOR. Acá el costo de equivocarse es dejar al SIG sin ningún administrador.
    const r = decidirBloqueo(DANIEL, { ...CONTEXTO, miembrosDelGrupoSig: null }, MOTIVO, CORREO);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.mensaje).toContain('No se pudo consultar el grupo');
  });
});

describe('P21.3 · una persona ya inactiva, y las cuentas invitadas', () => {
  it('no hay nada que bloquear en alguien que ya figura inactivo', () => {
    const r = decidirBloqueo({ ...DANIEL, activa: false }, CONTEXTO, MOTIVO, CORREO);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.mensaje).toContain('no hay nada que bloquear');
  });

  it('una cuenta invitada no se bloquea desde la herramienta del SIG', () => {
    // Las 54 invitadas de este tenant son de Tiindux, la UNAD, Unimilitar y Webxcite.
    // Bloquear una desde acá sería salirse del alcance de la organización y romperle la
    // colaboración a otro.
    const r = decidirBloqueo(DANIEL, { ...CONTEXTO, cuenta: CUENTA_INVITADA }, MOTIVO, CORREO);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.mensaje).toContain('INVITADA');
  });

  it('un userType ausente no se lee como invitada', () => {
    // Graph lo omite en varios escenarios. Acá el falso positivo impediría bloquear a alguien
    // de la organización, y ése es el error que se ve; el otro no.
    const r = decidirBloqueo(
      DANIEL,
      { ...CONTEXTO, cuenta: { id: OID_VICTIMA, displayName: 'Daniel Medina' } },
      MOTIVO,
      CORREO,
    );
    expect(r.ok).toBe(true);
  });

  it('si no se pudo leer la cuenta, no se bloquea a ciegas', () => {
    const r = decidirBloqueo(DANIEL, { ...CONTEXTO, cuenta: null }, MOTIVO, CORREO);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.mensaje).toContain('No se cambió nada');
  });
});

describe('P19.1 · el motivo, con piso de diez caracteres', () => {
  it('el mínimo es diez', () => {
    expect(MOTIVO_MINIMO).toBe(10);
    expect(motivoValido('123456789')).toBe(false);
    expect(motivoValido('1234567890')).toBe(true);
  });

  it('los espacios no cuentan: «   ok   » no es un motivo', () => {
    expect(motivoValido('          ')).toBe(false);
    expect(motivoValido('   ok     ')).toBe(false);
  });

  it('el bloqueo con motivo corto se rechaza aunque todo lo demás esté bien', () => {
    const r = decidirBloqueo(DANIEL, CONTEXTO, 'se fue', CORREO);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.mensaje).toContain('bitácora');
  });

  it('el desbloqueo exige el mismo motivo (P24)', () => {
    const inactiva = { ...DANIEL, activa: false };
    expect(decidirDesbloqueo(inactiva, CONTEXTO, 'error', CORREO).ok).toBe(false);
    expect(decidirDesbloqueo(inactiva, CONTEXTO, MOTIVO, CORREO).ok).toBe(true);
  });
});

describe('P20 · la confirmación escribiendo el correo, también en el servidor', () => {
  it('coincide plegando la caja y recortando espacios', () => {
    expect(confirmacionCoincide(CORREO, ' Daniel.Medina@Cuantico.com ')).toBe(true);
  });

  it('no coincide con el correo de otra persona del censo', () => {
    expect(confirmacionCoincide(CORREO, 'daniela.medina@cuantico.com')).toBe(false);
  });

  it('sin la confirmación, la acción se niega aunque el motivo esté bien', () => {
    // La validación del popup protege a quien usa el popup. La acción es invocable
    // directamente con el id puesto, así que se vuelve a comprobar acá.
    const r = decidirBloqueo(DANIEL, CONTEXTO, MOTIVO, '');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.mensaje).toContain('correo exacto');
  });

  it('con todo en orden, el bloqueo se autoriza', () => {
    expect(decidirBloqueo(DANIEL, CONTEXTO, MOTIVO, CORREO)).toEqual({ ok: true });
  });
});

describe('P24 · desbloquear', () => {
  const INACTIVA: PersonaDelCenso = { ...DANIEL, activa: false };

  it('no hay nada que desbloquear en alguien que ya figura activo', () => {
    const r = decidirDesbloqueo(DANIEL, CONTEXTO, MOTIVO, CORREO);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.mensaje).toContain('no hay nada que desbloquear');
  });

  it('habilitar una cuenta invitada tampoco es del SIG', () => {
    const r = decidirDesbloqueo(INACTIVA, { ...CONTEXTO, cuenta: CUENTA_INVITADA }, MOTIVO, CORREO);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.mensaje).toContain('INVITADA');
  });

  it('no exige consultar el grupo del SIG: habilitar nunca lo deja en cero', () => {
    const r = decidirDesbloqueo(
      INACTIVA,
      { ...CONTEXTO, miembrosDelGrupoSig: null },
      MOTIVO,
      CORREO,
    );
    expect(r.ok).toBe(true);
  });
});

describe('P25 · sin la variable, la operación no existe', () => {
  it('arranca apagada: ausente es false', () => {
    expect(bloqueoHabilitado({})).toBe(false);
    expect(VARIABLE_DE_BLOQUEO).toBe('GRAPH_BLOQUEO_HABILITADO');
  });

  it('sólo el «true» exacto la habilita', () => {
    expect(bloqueoHabilitado({ GRAPH_BLOQUEO_HABILITADO: 'true' })).toBe(true);
    expect(bloqueoHabilitado({ GRAPH_BLOQUEO_HABILITADO: ' true ' })).toBe(true);
  });

  it('cualquier otra cosa la deja apagada, incluido lo que parece un sí', () => {
    for (const valor of ['', '  ', 'TRUE', 'True', '1', 'sí', 'yes', 'false']) {
      expect(bloqueoHabilitado({ GRAPH_BLOQUEO_HABILITADO: valor })).toBe(false);
    }
  });
});

describe('Graph respondió bien y la transacción falló después', () => {
  // El estado existe porque ninguna llamada a Graph puede ir dentro de una transacción de
  // Prisma. No se puede deshacer, así que lo único honesto es decirlo entero.
  it('la frase dice que la persona YA no puede entrar, y que el censo miente', () => {
    const frase = fraseDeDesincronizacion('BLOQUEO', CORREO);
    expect(frase).toContain('QUEDÓ BLOQUEADA');
    expect(frase).toContain('ya no puede entrar');
    expect(frase).toContain('como activa');
    expect(frase).toContain('SIN el motivo');
  });

  it('y en el desbloqueo, al revés: la persona YA puede entrar', () => {
    const frase = fraseDeDesincronizacion('DESBLOQUEO', CORREO);
    expect(frase).toContain('QUEDÓ HABILITADA');
    expect(frase).toContain('ya puede entrar');
    expect(frase).toContain('como inactiva');
  });
});
