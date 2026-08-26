// lib/sgsi/__tests__/permisos.test.ts
//
// This module decides who can read the asset inventory and the risk register of an
// information security management system, so the cases that matter are the ones where a
// mistake GRANTS something. A test that only proves the happy path would have passed
// just as well before object ids were mapped at all — and back then every real token
// produced «Sin acceso al SGSI».

import { GRUPOS, rolDesdeGrupos, puede, nombreDelRol } from '../permisos';

const OBJECT_ID_RESPONSABLES = 'd04a62e7-11ce-4faf-a1b2-7e77fb7ba59b';

afterEach(() => {
  delete process.env.SGI_ROL_POR_DEFECTO;
  delete process.env.SGI_ACCESO_SIN_GRUPO;
});

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

describe('lo que NO debe otorgar acceso', () => {
  it('un token con grupos ajenos no recibe nada', () => {
    const rol = rolDesdeGrupos(['Domain Users', 'Todos-Cuantico']);
    expect(rol.grupos).toEqual([]);
    expect(rol.permisos.size).toBe(0);
    expect(nombreDelRol(rol)).toBe('Sin acceso al SGSI');
  });

  it('un object id parecido pero distinto no recibe nada', () => {
    // Un dígito cambiado. Nada acá hace matching por patrón, y este test es el que lo
    // mantiene así.
    const rol = rolDesdeGrupos(['d04a62e7-11ce-4faf-a1b2-7e77fb7ba59c']);
    expect(rol.grupos).toEqual([]);
  });

  it('un prefijo del nombre no recibe nada', () => {
    expect(rolDesdeGrupos(['Responsables']).grupos).toEqual([]);
    expect(rolDesdeGrupos(['Responsables SIG-Lectura']).grupos).toEqual([]);
  });

  it('sin claim y sin variable, no hay acceso', () => {
    // The default, and what production should carry. Every «no access» case above depends
    // on this: none of them holds once SGI_ACCESO_SIN_GRUPO is set.
    expect(rolDesdeGrupos(undefined).grupos).toEqual([]);
    expect(rolDesdeGrupos(null).grupos).toEqual([]);
    expect(rolDesdeGrupos([]).grupos).toEqual([]);
  });
});

describe('SGI_ACCESO_SIN_GRUPO — acceso abierto, por decisión', () => {
  // This test previously asserted the OPPOSITE, and the reason it gave was right: «el
  // respaldo es para el claim ausente, no para el claim que dice no. Si un grupo ajeno
  // pudiera caer al respaldo, la variable otorgaría lo que el Directorio negó.»
  //
  // That is exactly what the variable now does, because the organisation decided the
  // Directory should stop being the gate. The warning is kept rather than deleted: it
  // states the consequence, and the consequence has not changed — only the decision has.
  it('un token con grupos ajenos SÍ recibe el rol configurado', () => {
    process.env.SGI_ACCESO_SIN_GRUPO = GRUPOS.seguridad;
    const rol = rolDesdeGrupos(['Domain Users', 'Todos-Cuantico']);
    expect(rol.grupos).toEqual([GRUPOS.seguridad]);
    expect(puede(rol, 'sgsi:escribir')).toBe(true);
    // Flagged, so the sidebar can say the Directory did not grant this.
    expect(rol.esPorDefecto).toBe(true);
  });

  it('un claim ausente recibe lo mismo', () => {
    process.env.SGI_ACCESO_SIN_GRUPO = GRUPOS.seguridad;
    for (const claim of [undefined, null, []] as const) {
      expect(rolDesdeGrupos(claim).grupos).toEqual([GRUPOS.seguridad]);
    }
  });

  it('un grupo RECONOCIDO gana sobre la variable, y no se marca como respaldo', () => {
    // The Directory still decides for anybody who is actually in a group. Otherwise an
    // auditor could not tell a real membership from the open door.
    process.env.SGI_ACCESO_SIN_GRUPO = GRUPOS.seguridad;
    const rol = rolDesdeGrupos([GRUPOS.auditoria]);
    expect(rol.grupos).toEqual([GRUPOS.auditoria]);
    expect(rol.esPorDefecto).toBe(false);
    expect(puede(rol, 'sgsi:escribir')).toBe(false);
  });

  it('acepta un rol de menor alcance: abrir la puerta no obliga a dar todo', () => {
    process.env.SGI_ACCESO_SIN_GRUPO = GRUPOS.auditoria;
    const rol = rolDesdeGrupos(['Domain Users']);
    expect(puede(rol, 'sgsi:ver')).toBe(true);
    expect(puede(rol, 'sgsi:escribir')).toBe(false);
    expect(puede(rol, 'parametrizacion:escribir')).toBe(false);
  });

  it('un valor que no es un grupo conocido no otorga nada', () => {
    // A typo must fail closed. «administrador» is not a role, so it grants nothing rather
    // than being interpreted generously.
    process.env.SGI_ACCESO_SIN_GRUPO = 'administrador';
    expect(rolDesdeGrupos(['Domain Users']).grupos).toEqual([]);
    expect(rolDesdeGrupos([]).grupos).toEqual([]);
  });

  it('SGI_ROL_POR_DEFECTO sigue funcionando, y el nombre nuevo tiene precedencia', () => {
    // The old name kept working so an existing environment does not silently lose access
    // on deploy.
    process.env.SGI_ROL_POR_DEFECTO = GRUPOS.auditoria;
    expect(rolDesdeGrupos(['Domain Users']).grupos).toEqual([GRUPOS.auditoria]);

    process.env.SGI_ACCESO_SIN_GRUPO = GRUPOS.seguridad;
    expect(rolDesdeGrupos(['Domain Users']).grupos).toEqual([GRUPOS.seguridad]);
  });
});

