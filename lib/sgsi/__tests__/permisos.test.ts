// lib/sgsi/__tests__/permisos.test.ts
//
// This module decides who can read the asset inventory and the risk register of an
// information security management system, so the cases that matter are the ones where a
// mistake GRANTS something. A test that only proves the happy path would have passed
// just as well before object ids were mapped at all — and back then every real token
// produced «Sin acceso al SGSI».

import {
  GRUPOS,
  grupoDeIdentificador,
  nombreDelRol,
  OBJECT_ID_GRUPO_SIG,
  puede,
  rolDeLaPersona,
  rolDesdeGrupos,
} from '../permisos';


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
    const rol = rolDesdeGrupos(['Líderes SIG']);
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

// El grupo de Microsoft 365 dejó de otorgar el 01/09/2026. Sigue existiendo en el
// Directorio para colaborar, y por eso mismo no debe abrir nada: a un grupo de chat se
// agrega gente sin que nadie piense en el registro de activos.
describe('el grupo de Microsoft 365 retirado', () => {
  it('ni su nombre ni sus object ids otorgan ya nada', () => {
    for (const retirado of [
      'Responsables SIG',
      'd04a62e7-11ce-4faf-a1b2-7e77fb7ba59b',
      'f51b3ad7-497b-43ea-b646-d1dc482cff5d',
    ]) {
      const rol = rolDesdeGrupos([retirado]);
      expect(rol.grupos).toEqual([]);
      expect(nombreDelRol(rol)).toBe('Colaborador');
      expect(puede(rol, 'sgsi:ver')).toBe(false);
    }
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

// ─── El respaldo retirado ──────────────────────────────────────────────────────────────
//
// `SGI_ROL_DEV` otorgaba el rol en desarrollo sin mirar ningun grupo del Directorio. Se
// retiro el 08/09/2026, y estas pruebas fijan que NO otorgue nada — que es la garantia que
// importa ahora. Antes fijaban lo contrario: que si otorgara.
//
// **Por que se retiro.** Hacia que el entorno local no ejercitara el camino real: el acceso
// funcionaba en la maquina de quien programa y fallaba en produccion. Es el peor resultado
// posible de una herramienta de pruebas, porque oculta justo el defecto que hay que
// encontrar — y lo oculto durante semanas.
//
// La variable puede seguir puesta en un `.env` viejo. No hace nada, y eso se prueba.
describe('SGI_ROL_DEV · retirado', () => {
  const entorno = process.env as Record<string, string | undefined>;

  function conEntorno(vars: Record<string, string | undefined>, fn: () => void) {
    const previos = Object.fromEntries(Object.keys(vars).map((k) => [k, entorno[k]]));
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete entorno[k];
      else entorno[k] = v;
    }
    try {
      fn();
    } finally {
      for (const [k, v] of Object.entries(previos)) {
        if (v === undefined) delete entorno[k];
        else entorno[k] = v;
      }
    }
  }

  it.each(['development', 'test', 'production'])(
    'en NODE_ENV=%s no otorga nada',
    (nodeEnv) => {
      conEntorno({ NODE_ENV: nodeEnv, SGI_ROL_DEV: 'Líderes SIG' }, () => {
        const rol = rolDesdeGrupos(['Domain Users']);
        expect(rol.grupos).toEqual([]);
        expect(puede(rol, 'sgsi:ver')).toBe(false);
        expect(puede(rol, 'sgsi:escribir')).toBe(false);
        expect(nombreDelRol(rol)).toBe('Colaborador');
      });
    },
  );

  // Con la variable puesta al nombre del grupo, una cuenta sin grupo real sigue siendo
  // Colaborador. Es exactamente el caso que hacia pasar el local por bueno.
  it('con la variable puesta, una cuenta sin grupo real sigue en el piso', () => {
    conEntorno({ NODE_ENV: 'development', SGI_ROL_DEV: GRUPOS.seguridad }, () => {
      const rol = rolDesdeGrupos([]);
      expect(rol.grupos).toEqual([]);
      expect(puede(rol, 'misig:ver')).toBe(true);
      expect(puede(rol, 'sgsi:ver')).toBe(false);
    });
  });

  // Y el grupo REAL del token sigue otorgando, con la variable puesta o no: lo que se
  // retiro es el atajo, no el camino.
  it('el grupo real del token otorga igual, con la variable o sin ella', () => {
    for (const valor of [undefined, GRUPOS.seguridad]) {
      conEntorno({ NODE_ENV: 'development', SGI_ROL_DEV: valor }, () => {
        const rol = rolDesdeGrupos([OBJECT_ID_GRUPO_SIG]);
        expect(rol.grupos).toEqual([GRUPOS.seguridad]);
        expect(puede(rol, 'sgsi:escribir')).toBe(true);
      });
    }
  });
});

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

// El rol de OTRA persona. Lo que se prueba acá es la distinción que la pantalla tiene que
// sostener: NO SABER si alguien es responsable no es lo mismo que saber que no lo es. Si
// esa diferencia se pierde, la tabla de personas afirma un reparto de permisos falso con
// la misma cara con la que afirmaría el verdadero.
describe('rolDeLaPersona', () => {
  const MIEMBRO = 'A1B2C3D4-0000-0000-0000-000000000001';
  const AJENO = 'f51b3ad7-497b-43ea-b646-d1dc482cff5d';

  it('reconoce al miembro del grupo, sin importar la caja del object id', () => {
    const miembros = new Set([MIEMBRO.toLowerCase()]);
    expect(rolDeLaPersona(MIEMBRO, miembros)).toBe('RESPONSABLE');
    expect(rolDeLaPersona(MIEMBRO.toUpperCase(), miembros)).toBe('RESPONSABLE');
    expect(rolDeLaPersona(`  ${MIEMBRO}  `, miembros)).toBe('RESPONSABLE');
  });

  it('a quien no está en el grupo lo deja en Colaborador', () => {
    expect(rolDeLaPersona(AJENO, new Set([MIEMBRO.toLowerCase()]))).toBe('COLABORADOR');
  });

  it('sin respuesta del Directorio devuelve DESCONOCIDO, nunca COLABORADOR', () => {
    expect(rolDeLaPersona(MIEMBRO, null)).toBe('DESCONOCIDO');
    expect(rolDeLaPersona(AJENO, null)).toBe('DESCONOCIDO');
  });

  it('un conjunto vacío sí es una respuesta: nadie es responsable', () => {
    expect(rolDeLaPersona(MIEMBRO, new Set())).toBe('COLABORADOR');
  });
});

// ─── grupoDeIdentificador · el object id que la pantalla decia ignorar ─────────────────
//
// La pantalla de diagnostico comparaba el valor CRUDO del token contra `Rol.grupos`, que
// trae el NOMBRE ya resuelto. Como Azure emite object ids y no nombres, todo id salia
// «ignorado» — incluido el que estaba otorgando el rol en ese mismo render, junto al aviso
// de que habia que registrarlo. La herramienta hecha para responder «por que no tengo
// acceso» daba una falsa alarma justo cuando el acceso funcionaba.
//
// Estas pruebas fijan que la resolucion se pregunte por el valor crudo, que es lo que el
// token trae.
describe('grupoDeIdentificador', () => {
  it('reconoce el object id del grupo, que es lo que Azure emite', () => {
    expect(grupoDeIdentificador(OBJECT_ID_GRUPO_SIG)).toBe(GRUPOS.seguridad);
  });

  // Los object ids son insensibles a la caja y Azure no es consistente con la que emite.
  it('reconoce el object id sin importar la caja', () => {
    expect(grupoDeIdentificador(OBJECT_ID_GRUPO_SIG.toUpperCase())).toBe(GRUPOS.seguridad);
  });

  it('reconoce el nombre vigente del grupo', () => {
    expect(grupoDeIdentificador('Líderes SIG')).toBe(GRUPOS.seguridad);
  });

  it('reconoce el nombre canonico', () => {
    expect(grupoDeIdentificador(GRUPOS.seguridad)).toBe(GRUPOS.seguridad);
  });

  it('un identificador ajeno no otorga nada', () => {
    expect(grupoDeIdentificador('43228c97-493e-442e-8937-2f9828479094')).toBeNull();
  });

  it('el acento importa: «Lideres SIG» sin tilde no es el grupo', () => {
    expect(grupoDeIdentificador('Lideres SIG')).toBeNull();
  });

  // El defecto exacto: lo que la pantalla comparaba antes. `rol.grupos` trae nombres, el
  // token trae ids, y `Set.has` sobre nombres nunca acierta un id.
  it('el object id que otorga el rol NO puede salir como ignorado', () => {
    const rol = rolDesdeGrupos([OBJECT_ID_GRUPO_SIG]);
    // Lo que hacia la pantalla vieja: comparar el crudo contra el nombre resuelto.
    // `Set<string>` a proposito: es exactamente como lo escribia la pantalla, y ese
    // ensanchamiento es lo que dejaba compilar la comparacion imposible. Con `Set<Grupo>`
    // TypeScript la rechaza — el tipo sabia que el GUID no es un nombre de grupo.
    expect(new Set<string>(rol.grupos).has(OBJECT_ID_GRUPO_SIG)).toBe(false);
    // Lo que hay que preguntar.
    expect(grupoDeIdentificador(OBJECT_ID_GRUPO_SIG)).not.toBeNull();
  });
});
