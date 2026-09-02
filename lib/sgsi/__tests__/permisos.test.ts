// lib/sgsi/__tests__/permisos.test.ts
//
// This module decides who can read the asset inventory and the risk register of an
// information security management system, so the cases that matter are the ones where a
// mistake GRANTS something. A test that only proves the happy path would have passed
// just as well before object ids were mapped at all — and back then every real token
// produced «Sin acceso al SGSI».

import { GRUPOS, rolDesdeGrupos, puede, nombreDelRol } from '../permisos';

const OBJECT_ID_RESPONSABLES = 'd04a62e7-11ce-4faf-a1b2-7e77fb7ba59b';
/// El que el líder del SIG confirmó el 01/09/2026, tras quedar en Colaborador con la
/// membresía puesta. Ese fue el síntoma: el token traía un id ausente de la tabla.
const OBJECT_ID_CONFIRMADO = 'f51b3ad7-497b-43ea-b646-d1dc482cff5d';

// Dos casos de acceso y nada más: Mi SIG para toda la organización, el resto para
// `Responsables SIG`. Los grupos intermedios se retiraron, así que las pruebas que importan
// ahora son las que verifican que NO quedó un tercer camino abierto.
describe('sólo hay dos casos de acceso', () => {
  it('reconoce el grupo por su nombre canónico', () => {
    expect(rolDesdeGrupos([GRUPOS.seguridad]).grupos).toEqual([GRUPOS.seguridad]);
  });

  it('los grupos intermedios retirados ya no otorgan nada', () => {
    for (const retirado of ['SIG-Propietarios', 'SIG-Auditoría', 'SIG-Auditoria']) {
      const rol = rolDesdeGrupos([retirado]);
      expect(rol.grupos).toEqual([]);
      expect(nombreDelRol(rol)).toBe('Colaborador');
      expect(puede(rol, 'sgsi:ver')).toBe(false);
      expect(puede(rol, 'activo:valorar')).toBe(false);
      expect(puede(rol, 'bitacora:ver')).toBe(false);
    }
  });

  it('el único rol reconocido lo puede todo', () => {
    const rol = rolDesdeGrupos(['Responsables SIG']);
    for (const permiso of [
      'misig:ver',
      'operacion:administrar',
      'mejora:cerrar',
      'estrategico:parametrizar',
      'auditoria:administrar',
      'sgsi:escribir',
      'parametrizacion:escribir',
      'bitacora:ver',
      'personas:administrar',
    ] as const) {
      expect(puede(rol, permiso)).toBe(true);
    }
  });
});

describe('Responsables SIG', () => {
  it('otorga los permisos del líder del SIG por nombre', () => {
    const rol = rolDesdeGrupos(['Responsables SIG']);
    expect(rol.grupos).toEqual([GRUPOS.seguridad]);
    expect(puede(rol, 'sgsi:escribir')).toBe(true);
    expect(puede(rol, 'parametrizacion:escribir')).toBe(true);
    expect(rol.origen).toBe('directorio');
  });

  // El caso que importa: con `groupMembershipClaims: SecurityGroup` el token trae object
  // ids, no nombres. Antes de mapearlos, este era el camino que dejaba a todo el mundo
  // sin acceso mientras el tenant estaba bien configurado.
  it('otorga los mismos permisos por object id', () => {
    const porId = rolDesdeGrupos([OBJECT_ID_RESPONSABLES]);
    const porNombre = rolDesdeGrupos(['Responsables SIG']);
    expect(porId.grupos).toEqual(porNombre.grupos);
    expect([...porId.permisos].sort()).toEqual([...porNombre.permisos].sort());
  });

  it('acepta el object id en mayúsculas: Azure no es consistente con el case', () => {
    const rol = rolDesdeGrupos([OBJECT_ID_RESPONSABLES.toUpperCase()]);
    expect(rol.grupos).toEqual([GRUPOS.seguridad]);
  });

  // La regresión concreta: una cuenta con la membresía puesta quedaba en Colaborador
  // porque su object id no estaba en la tabla. Los dos ids del grupo abren lo mismo.
  it('el object id confirmado por el líder del SIG otorga acceso completo', () => {
    for (const id of [OBJECT_ID_CONFIRMADO, OBJECT_ID_CONFIRMADO.toUpperCase()]) {
      const rol = rolDesdeGrupos([id]);
      expect(rol.grupos).toEqual([GRUPOS.seguridad]);
      expect(puede(rol, 'sgsi:ver')).toBe(true);
      expect(puede(rol, 'sgsi:escribir')).toBe(true);
      expect(puede(rol, 'parametrizacion:escribir')).toBe(true);
      expect(nombreDelRol(rol)).toBe('Responsable SIG');
    }
  });

  it('los dos object ids del grupo dan exactamente los mismos permisos', () => {
    const a = rolDesdeGrupos([OBJECT_ID_RESPONSABLES]);
    const b = rolDesdeGrupos([OBJECT_ID_CONFIRMADO]);
    expect([...a.permisos].sort()).toEqual([...b.permisos].sort());
  });

  it('no duplica el grupo cuando el token trae el nombre y el object id', () => {
    const rol = rolDesdeGrupos(['Responsables SIG', OBJECT_ID_RESPONSABLES]);
    expect(rol.grupos).toEqual([GRUPOS.seguridad]);
    expect(nombreDelRol(rol)).toBe('Responsable SIG');
  });
});

describe('el piso es Colaborador, no el SGSI', () => {
  it('un token con grupos ajenos es Colaborador y solo ve lo suyo', () => {
    const rol = rolDesdeGrupos(['Domain Users', 'Todos-Cuantico']);
    expect(rol.grupos).toEqual([]);
    expect(puede(rol, 'misig:ver')).toBe(true);
    expect(nombreDelRol(rol)).toBe('Colaborador');
  });

  // La razón de ser de este plan: antes, con SGI_ACCESO_SIN_GRUPO puesto, esta misma
  // cuenta recibía el inventario de activos, el registro de riesgos y la parametrización.
  it('un Colaborador NO alcanza nada del SGSI', () => {
    const rol = rolDesdeGrupos(['Domain Users']);
    for (const permiso of [
      'sgsi:ver',
      'sgsi:escribir',
      'activo:valorar',
      'riesgo:tratar',
      'parametrizacion:escribir',
      'bitacora:ver',
      'evidencia:ver',
      'evidencia:escribir',
      'personas:administrar',
    ] as const) {
      expect(puede(rol, permiso)).toBe(false);
    }
  });

  it('sin claim, también es Colaborador', () => {
    for (const claim of [undefined, null, []] as const) {
      expect(nombreDelRol(rolDesdeGrupos(claim))).toBe('Colaborador');
      expect(puede(rolDesdeGrupos(claim), 'misig:ver')).toBe(true);
      expect(puede(rolDesdeGrupos(claim), 'sgsi:ver')).toBe(false);
    }
  });

  it('un object id parecido pero distinto no recibe más que Colaborador', () => {
    // Un dígito cambiado. Nada acá hace matching por patrón.
    const rol = rolDesdeGrupos(['d04a62e7-11ce-4faf-a1b2-7e77fb7ba59c']);
    expect(rol.grupos).toEqual([]);
    expect(puede(rol, 'sgsi:ver')).toBe(false);
  });

  it('un prefijo del nombre no recibe más que Colaborador', () => {
    expect(rolDesdeGrupos(['Responsables']).grupos).toEqual([]);
    expect(rolDesdeGrupos(['Responsables SIG-Lectura']).grupos).toEqual([]);
  });

  // La variable se retiró. Si alguien la deja puesta en un .env viejo, no debe hacer nada.
  it('SGI_ACCESO_SIN_GRUPO ya no otorga nada', () => {
    process.env.SGI_ACCESO_SIN_GRUPO = GRUPOS.seguridad;
    process.env.SGI_ROL_POR_DEFECTO = GRUPOS.seguridad;
    try {
      const rol = rolDesdeGrupos(['Domain Users']);
      expect(rol.grupos).toEqual([]);
      expect(puede(rol, 'sgsi:escribir')).toBe(false);
    } finally {
      delete process.env.SGI_ACCESO_SIN_GRUPO;
      delete process.env.SGI_ROL_POR_DEFECTO;
    }
  });
});

describe('SGI_ROL_DEV', () => {
  // `process.env.NODE_ENV` is typed read-only, so it is written through the index
  // signature. The cases below need to observe production behaviour, and there is no
  // point testing the guard without being able to stand on the other side of it.
  const entorno = process.env as Record<string, string | undefined>;
  const nodeEnvOriginal = entorno.NODE_ENV;

  function conEntorno(valores: Record<string, string | undefined>, prueba: () => void) {
    const previos: Record<string, string | undefined> = {};
    for (const [clave, valor] of Object.entries(valores)) {
      previos[clave] = entorno[clave];
      if (valor === undefined) delete entorno[clave];
      else entorno[clave] = valor;
    }
    try {
      prueba();
    } finally {
      for (const [clave, valor] of Object.entries(previos)) {
        if (valor === undefined) delete entorno[clave];
        else entorno[clave] = valor;
      }
    }
  }

  afterEach(() => {
    if (nodeEnvOriginal === undefined) delete entorno.NODE_ENV;
    else entorno.NODE_ENV = nodeEnvOriginal;
  });

  it('fuera de producción otorga el rol declarado y lo marca como simulado', () => {
    conEntorno({ NODE_ENV: 'development', SGI_ROL_DEV: 'Responsables SIG' }, () => {
      const rol = rolDesdeGrupos(['Domain Users']);
      expect(rol.grupos).toEqual([GRUPOS.seguridad]);
      expect(puede(rol, 'sgsi:escribir')).toBe(true);
      // Sin esta marca la pantalla no puede decir que el rol no vino del Directorio.
      expect(rol.origen).toBe('simulado');
    });
  });

  it('un grupo retirado en la variable tampoco otorga nada', () => {
    conEntorno({ NODE_ENV: 'development', SGI_ROL_DEV: 'SIG-Propietarios' }, () => {
      const rol = rolDesdeGrupos(['Domain Users']);
      expect(rol.grupos).toEqual([]);
      expect(puede(rol, 'sgsi:ver')).toBe(false);
    });
  });

  // El caso por el que se retiró SGI_ACCESO_SIN_GRUPO: en producción daba el SGSI entero a
  // cualquier cuenta autenticada. Puesta en el servidor de producción, esta no hace nada.
  it('en producción se ignora por completo', () => {
    conEntorno({ NODE_ENV: 'production', SGI_ROL_DEV: GRUPOS.seguridad }, () => {
      const rol = rolDesdeGrupos(['Domain Users']);
      expect(rol.grupos).toEqual([]);
      expect(puede(rol, 'sgsi:ver')).toBe(false);
      expect(puede(rol, 'sgsi:escribir')).toBe(false);
      expect(puede(rol, 'parametrizacion:escribir')).toBe(false);
      expect(nombreDelRol(rol)).toBe('Colaborador');
    });
  });

  it('un grupo real del token gana sobre la variable', () => {
    conEntorno({ NODE_ENV: 'development', SGI_ROL_DEV: GRUPOS.seguridad }, () => {
      const rol = rolDesdeGrupos(['Responsables SIG']);
      expect(rol.grupos).toEqual([GRUPOS.seguridad]);
      // Vino del token, no de la variable: la marca de simulado no se enciende.
      expect(rol.origen).toBe('directorio');
    });
  });

  it('un valor que no nombra un grupo conocido no otorga nada', () => {
    conEntorno({ NODE_ENV: 'development', SGI_ROL_DEV: 'Administradores' }, () => {
      const rol = rolDesdeGrupos(['Domain Users']);
      expect(rol.grupos).toEqual([]);
      expect(puede(rol, 'sgsi:ver')).toBe(false);
    });
  });

  it('sin la variable el piso sigue siendo Colaborador', () => {
    conEntorno({ NODE_ENV: 'development', SGI_ROL_DEV: undefined }, () => {
      const rol = rolDesdeGrupos(['Domain Users']);
      expect(rol.grupos).toEqual([]);
      expect(puede(rol, 'misig:ver')).toBe(true);
      expect(puede(rol, 'sgsi:ver')).toBe(false);
    });
  });

  // Sigue admitiendo varios valores separados por coma aunque hoy solo uno otorgue algo:
  // el día que vuelva a haber más de un grupo, el formato no cambia.
  it('acepta varios valores separados por coma y toma el que reconoce', () => {
    conEntorno(
      { NODE_ENV: 'development', SGI_ROL_DEV: 'SIG-Propietarios, Responsables SIG' },
      () => {
        const rol = rolDesdeGrupos([]);
        expect(rol.grupos).toEqual([GRUPOS.seguridad]);
        expect(puede(rol, 'bitacora:ver')).toBe(true);
        expect(puede(rol, 'parametrizacion:escribir')).toBe(true);
      },
    );
  });
});
// `Líderes SIG` es el grupo de seguridad que reemplaza al de Microsoft 365. Es el que el
// token va a traer de verdad, así que es el que más importa que esté bien escrito.
describe('Líderes SIG', () => {
  const OBJECT_ID_LIDERES = '2e0f4290-e91c-4f45-a663-77ece2d2a50e';

  it('otorga acceso completo por nombre y por object id', () => {
    for (const identificador of [
      'Líderes SIG',
      OBJECT_ID_LIDERES,
      OBJECT_ID_LIDERES.toUpperCase(),
      '  líderes sig  ',
    ]) {
      const rol = rolDesdeGrupos([identificador]);
      expect(rol.grupos).toEqual([GRUPOS.seguridad]);
      expect(rol.origen).toBe('directorio');
      expect(puede(rol, 'sgsi:escribir')).toBe(true);
      expect(puede(rol, 'parametrizacion:escribir')).toBe(true);
    }
  });

  // La comparación pliega mayúsculas pero NO pliega acentos: sin la tilde es otro nombre.
  // Queda escrito porque es el error que costaría una tarde encontrar otra vez.
  it('sin la tilde NO coincide, y eso es deliberado', () => {
    expect(rolDesdeGrupos(['Lideres SIG']).grupos).toEqual([]);
  });

});
