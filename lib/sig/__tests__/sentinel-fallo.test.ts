// lib/sig/__tests__/sentinel-fallo.test.ts
//
// Lo que se prueba acá es que cada causa apunte al arreglo correcto y a ninguno otro.
// El defecto que este módulo existe para evitar es reusar `graph-fallo.ts`: un 403 de Log
// Analytics es «al service principal le falta el ROL Log Analytics Reader sobre el
// workspace» (una asignación RBAC en el portal), y NO tiene nada que ver con «agregar un
// permiso de APLICACIÓN y conceder consentimiento», que es lo que un 403 significa en
// Graph. Una prueba que solo comprobara «devuelve un string» no detectaría que las dos
// causas mandan a arreglar cosas distintas.

import {
  clasificarConsultaSentinel,
  clasificarTokenSentinel,
  explicarFalloSentinel,
  variablesSentinelQueFaltan,
  type FalloSentinel,
} from '../sentinel-fallo';

const COMPLETO = {
  SENTINEL_TENANT_ID: 't',
  SENTINEL_CLIENT_ID: 'c',
  SENTINEL_CLIENT_SECRET: 's',
  SENTINEL_WORKSPACE_ID: 'w',
};

describe('variablesSentinelQueFaltan', () => {
  it('con las cuatro puestas no falta ninguna', () => {
    expect(variablesSentinelQueFaltan(COMPLETO)).toEqual([]);
  });

  it('nombra exactamente la que falta, no las cuatro', () => {
    expect(
      variablesSentinelQueFaltan({ ...COMPLETO, SENTINEL_CLIENT_SECRET: undefined }),
    ).toEqual(['SENTINEL_CLIENT_SECRET']);
  });

  // El caso más difícil de ver a ojo: la línea existe en el .env y está vacía.
  it('una variable en blanco cuenta como ausente', () => {
    expect(variablesSentinelQueFaltan({ ...COMPLETO, SENTINEL_WORKSPACE_ID: '   ' })).toEqual([
      'SENTINEL_WORKSPACE_ID',
    ]);
  });

  it('sin ninguna variable las nombra a las cuatro', () => {
    expect(variablesSentinelQueFaltan({})).toHaveLength(4);
  });
});

describe('clasificarConsultaSentinel · la distinción que graph-fallo.ts no puede compartir', () => {
  // El único 403 que existe en este cliente es de RBAC de Azure sobre el workspace, no de
  // permisos de aplicación en el registro de Graph.
  it('403 es falta del rol Log Analytics Reader, no un permiso de aplicación', () => {
    const f = clasificarConsultaSentinel(403, '');
    expect(f.causa).toBe('SIN_ROL');
    const texto = explicarFalloSentinel(f);
    expect(texto).toContain('Log Analytics Reader');
    expect(texto).toContain('rol');
    expect(texto).not.toContain('permiso de aplicación');
    expect(texto).not.toContain('consentimiento');
  });

  it('404 es el workspace id equivocado, y lo dice sin hablar de roles', () => {
    const f = clasificarConsultaSentinel(404, '');
    expect(f.causa).toBe('WORKSPACE_NO_EXISTE');
    const texto = explicarFalloSentinel(f);
    expect(texto).toContain('SENTINEL_WORKSPACE_ID');
    expect(texto).not.toContain('rol');
  });

  // Con token válido, un 400 es la consulta KQL o la petición — no una credencial ni un
  // rol. Compartir la clasificación con el token mandaría a rotar un secreto bueno.
  it('400 con token válido es la consulta, no la credencial', () => {
    const f = clasificarConsultaSentinel(400, 'Semantic error: sintaxis KQL inválida');
    expect(f.causa).toBe('CONSULTA_INVALIDA');
    const texto = explicarFalloSentinel(f);
    expect(texto).toContain('KQL');
    expect(texto).not.toContain('secreto');
    expect(texto).not.toContain('SENTINEL_CLIENT_SECRET');
  });

  it('429 es transitorio', () => {
    expect(clasificarConsultaSentinel(429, '').causa).toBe('DEMASIADAS_CONSULTAS');
  });

  it('un 500 no se disfraza de ninguna de las anteriores', () => {
    expect(clasificarConsultaSentinel(500, '').causa).toBe('RESPUESTA_INESPERADA');
  });
});

describe('clasificarTokenSentinel', () => {
  it('conserva el código que devolvió el tenant', () => {
    const f = clasificarTokenSentinel(401, 'invalid_client');
    expect(explicarFalloSentinel(f)).toContain('invalid_client');
  });

  it('sin detalle no deja el mensaje colgando', () => {
    expect(explicarFalloSentinel(clasificarTokenSentinel(400, ''))).toContain('sin detalle');
  });
});

describe('explicarFalloSentinel · ninguna frase se repite entre las nueve causas', () => {
  const CASOS: FalloSentinel[] = [
    { causa: 'SIN_CONFIGURAR', faltan: ['SENTINEL_TENANT_ID'] },
    { causa: 'CREDENCIAL_RECHAZADA', estado: 401, codigo: 'invalid_client' },
    { causa: 'SIN_ROL', estado: 403 },
    { causa: 'WORKSPACE_NO_EXISTE', estado: 404 },
    { causa: 'CONSULTA_INVALIDA', estado: 400, detalle: 'sintaxis inválida' },
    { causa: 'TABLA_AUSENTE', detalle: 'sin tables en la respuesta' },
    { causa: 'DEMASIADAS_CONSULTAS' },
    { causa: 'RESPUESTA_INESPERADA', estado: 502 },
    { causa: 'SIN_RED', detalle: 'ENOTFOUND' },
  ];

  it('ninguna frase se repite', () => {
    const frases = CASOS.map(explicarFalloSentinel);
    expect(new Set(frases).size).toBe(CASOS.length);
  });

  it('ninguna frase queda vacía', () => {
    for (const c of CASOS) expect(explicarFalloSentinel(c).length).toBeGreaterThan(20);
  });

  // TABLA_AUSENTE es la única causa que no depende de un código HTTP: Sentinel respondió
  // 200 pero sin la forma que `aFilas` espera, típicamente porque el workspace nunca
  // recibió el conector de Sentinel.
  it('TABLA_AUSENTE habla de la forma de la respuesta, no de un código HTTP', () => {
    const texto = explicarFalloSentinel({
      causa: 'TABLA_AUSENTE',
      detalle: 'sin tables en la respuesta',
    });
    expect(texto).toContain('onboarde');
  });
});
