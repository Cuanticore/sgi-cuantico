// lib/sgsi/__tests__/graph-fallo.test.ts
//
// Lo que se prueba acá es que cada causa se distinga de las demas. El defecto original no
// fue que el mensaje estuviera mal redactado: fue que habia UN solo mensaje para cinco
// causas, y afirmaba la que era cierta el dia que se escribio. Una prueba que solo mirara
// «devuelve un string» no habria detectado nada.

import {
  clasificarRecurso,
  clasificarToken,
  explicarFallo,
  variablesQueFaltan,
  type FalloGraph,
} from '../graph-fallo';

const COMPLETO = {
  SHAREPOINT_TENANT_ID: 't',
  SHAREPOINT_CLIENT_ID: 'c',
  SHAREPOINT_CLIENT_SECRET: 's',
};

describe('variablesQueFaltan', () => {
  it('con las tres puestas no falta ninguna', () => {
    expect(variablesQueFaltan(COMPLETO)).toEqual([]);
  });

  it('nombra exactamente la que falta, no las tres', () => {
    expect(variablesQueFaltan({ ...COMPLETO, SHAREPOINT_CLIENT_SECRET: undefined })).toEqual([
      'SHAREPOINT_CLIENT_SECRET',
    ]);
  });

  // Una variable declarada en blanco es un error de despliegue —la linea existe en el .env
  // y esta vacia—, y es el caso mas dificil de ver a ojo.
  it('una variable en blanco cuenta como ausente', () => {
    expect(variablesQueFaltan({ ...COMPLETO, SHAREPOINT_TENANT_ID: '   ' })).toEqual([
      'SHAREPOINT_TENANT_ID',
    ]);
  });

  it('sin ninguna variable las nombra a las tres', () => {
    expect(variablesQueFaltan({})).toHaveLength(3);
  });
});

describe('clasificarRecurso · la distincion que faltaba', () => {
  // El unico codigo que significa «falta el permiso». Es el que manda a alguien a Azure.
  it('403 es falta de permiso, y nombra cual', () => {
    const f = clasificarRecurso(403, '/users', 'User.Read.All');
    expect(f.causa).toBe('SIN_PERMISO');
    expect(explicarFallo(f)).toContain('User.Read.All');
  });

  // Con un token recien emitido, un 401 no es el permiso: es la credencial. Confundirlos
  // manda a conceder un permiso que ya esta concedido.
  it('401 es la credencial, NO el permiso', () => {
    const f = clasificarRecurso(401, '/users', 'User.Read.All');
    expect(f.causa).toBe('CREDENCIAL_RECHAZADA');
    expect(explicarFallo(f)).not.toContain('User.Read.All');
  });

  // El caso que la pantalla vieja no podia expresar: el permiso concedido y el object id
  // del grupo equivocado. Decia «falta GroupMember.Read.All» y era falso.
  it('404 es un identificador equivocado, y lo dice sin hablar de permisos', () => {
    const f = clasificarRecurso(404, 'el grupo Líderes SIG (abc)', 'GroupMember.Read.All');
    expect(f.causa).toBe('NO_EXISTE');
    const texto = explicarFallo(f);
    expect(texto).toContain('no existe');
    expect(texto).not.toContain('GroupMember.Read.All');
  });

  it('429 es transitorio y no manda a nadie a tocar la configuración', () => {
    const f = clasificarRecurso(429, '/users', 'User.Read.All');
    expect(f.causa).toBe('DEMASIADAS_CONSULTAS');
    expect(explicarFallo(f)).toContain('transitorio');
  });

  it('un 500 no se disfraza de ninguna de las anteriores', () => {
    expect(clasificarRecurso(500, '/users', 'User.Read.All').causa).toBe('RESPUESTA_INESPERADA');
  });
});

describe('clasificarToken', () => {
  it('conserva el codigo que devolvio el tenant', () => {
    const f = clasificarToken(401, 'invalid_client');
    expect(explicarFallo(f)).toContain('invalid_client');
  });

  it('sin detalle no deja el mensaje colgando', () => {
    expect(explicarFallo(clasificarToken(400, ''))).toContain('sin detalle');
  });
});

describe('explicarFallo · las cinco causas dicen cosas distintas', () => {
  const CASOS: FalloGraph[] = [
    { causa: 'SIN_CONFIGURAR', faltan: ['SHAREPOINT_TENANT_ID'] },
    { causa: 'CREDENCIAL_RECHAZADA', estado: 401, codigo: 'invalid_client' },
    { causa: 'SIN_PERMISO', permiso: 'GroupMember.Read.All', recurso: 'el grupo' },
    { causa: 'NO_EXISTE', recurso: 'el grupo' },
    { causa: 'DEMASIADAS_CONSULTAS', recurso: '/users' },
    { causa: 'RESPUESTA_INESPERADA', estado: 502, recurso: '/users' },
    { causa: 'SIN_RED', detalle: 'ENOTFOUND' },
  ];

  // El corazon del arreglo: si dos causas produjeran la misma frase, seguiriamos sin poder
  // distinguirlas desde la pantalla, que es exactamente el defecto que se vino a cerrar.
  it('ninguna frase se repite', () => {
    const frases = CASOS.map(explicarFallo);
    expect(new Set(frases).size).toBe(CASOS.length);
  });

  it('ninguna frase queda vacía', () => {
    for (const c of CASOS) expect(explicarFallo(c).length).toBeGreaterThan(20);
  });

  it('enumera varias variables faltantes con «y», no con comas hasta el final', () => {
    const texto = explicarFallo({
      causa: 'SIN_CONFIGURAR',
      faltan: ['SHAREPOINT_TENANT_ID', 'SHAREPOINT_CLIENT_ID', 'SHAREPOINT_CLIENT_SECRET'],
    });
    expect(texto).toContain('SHAREPOINT_CLIENT_ID y SHAREPOINT_CLIENT_SECRET');
  });

  // El permiso hay que agregarlo como de APLICACION. Concederlo como delegado es el error
  // clasico con client_credentials: queda concedido y la llamada sigue dando 403.
  it('el mensaje de permiso aclara que es de aplicación y que hay que consentir', () => {
    const texto = explicarFallo({
      causa: 'SIN_PERMISO',
      permiso: 'GroupMember.Read.All',
      recurso: 'el grupo',
    });
    expect(texto).toContain('APLICACIÓN');
    expect(texto).toContain('consentimiento');
  });
});
