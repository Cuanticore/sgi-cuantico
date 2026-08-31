// lib/sgsi/__tests__/permisos.test.ts
//
// This module decides who can read the asset inventory and the risk register of an
// information security management system, so the cases that matter are the ones where a
// mistake GRANTS something. A test that only proves the happy path would have passed
// just as well before object ids were mapped at all — and back then every real token
// produced «Sin acceso al SGSI».

import { GRUPOS, rolDesdeGrupos, puede, nombreDelRol } from '../permisos';

const OBJECT_ID_RESPONSABLES = 'd04a62e7-11ce-4faf-a1b2-7e77fb7ba59b';

describe('grupos por nombre', () => {
  it('reconoce los tres grupos canónicos', () => {
    expect(rolDesdeGrupos([GRUPOS.seguridad]).grupos).toEqual([GRUPOS.seguridad]);
    expect(rolDesdeGrupos([GRUPOS.propietarios]).grupos).toEqual([GRUPOS.propietarios]);
    expect(rolDesdeGrupos([GRUPOS.auditoria]).grupos).toEqual([GRUPOS.auditoria]);
  });

  it('acumula los permisos de varios grupos', () => {
    const rol = rolDesdeGrupos([GRUPOS.propietarios, GRUPOS.auditoria]);
    expect(puede(rol, 'activo:valorar')).toBe(true);
    expect(puede(rol, 'bitacora:ver')).toBe(true);
    // Ninguno de los dos otorga parametrización: es del Comité.
    expect(puede(rol, 'parametrizacion:escribir')).toBe(false);
  });
});

describe('Responsables SIG', () => {
  it('otorga los permisos del líder del SIG por nombre', () => {
    const rol = rolDesdeGrupos(['Responsables SIG']);
    expect(rol.grupos).toEqual([GRUPOS.seguridad]);
    expect(puede(rol, 'sgsi:escribir')).toBe(true);
    expect(puede(rol, 'parametrizacion:escribir')).toBe(true);
    expect(rol.esPorDefecto).toBe(false);
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

  it('no duplica el grupo cuando el token trae el nombre y el object id', () => {
    const rol = rolDesdeGrupos(['Responsables SIG', OBJECT_ID_RESPONSABLES]);
    expect(rol.grupos).toEqual([GRUPOS.seguridad]);
    expect(nombreDelRol(rol)).toBe('Líder del SIG');
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

describe('los tres grupos conservan lo suyo y además ven Mi SIG', () => {
  it('todo rol reconocido tiene misig:ver: nadie deja de tener tareas propias', () => {
    for (const grupo of [GRUPOS.seguridad, GRUPOS.propietarios, GRUPOS.auditoria]) {
      expect(puede(rolDesdeGrupos([grupo]), 'misig:ver')).toBe(true);
    }
  });

  it('solo el líder del SIG administra personas', () => {
    expect(puede(rolDesdeGrupos([GRUPOS.seguridad]), 'personas:administrar')).toBe(true);
    expect(puede(rolDesdeGrupos([GRUPOS.propietarios]), 'personas:administrar')).toBe(false);
    expect(puede(rolDesdeGrupos([GRUPOS.auditoria]), 'personas:administrar')).toBe(false);
  });
});