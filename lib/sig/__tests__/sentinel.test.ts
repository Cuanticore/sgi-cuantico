// lib/sig/__tests__/sentinel.test.ts
//
// Dos hechos verificados contra el endpoint real de Log Analytics motivan la mitad de
// estas pruebas, y ninguno de los dos es intuitivo:
//
//   1. `IncidentNumber` llega como NÚMERO (`int`), no como string. El CLI de Azure lo
//      muestra entre comillas — un espejismo del CLI — pero la respuesta REST cruda trae
//      `1`, no `"1"`. Si `claveIncidente` no tolera las dos formas, el trabajo y la acción
//      de promoción normalizan distinto y el upsert se bifurca: el espejo duplica en
//      producción con los tests en verde.
//   2. Las filas son POSICIONALES, no objetos: hay que cruzar `columns[i].name` contra
//      `rows[n][i]`. Indexar por posición hace que un reordenamiento de columnas en Azure
//      corra todos los campos un lugar sin que nada falle en jest ni en producción.

import {
  aFilas,
  aTextoJson,
  claveIncidente,
  clasificarSincronizacion,
  correoDelPropietario,
  descripcionPromovida,
  KQL_INCIDENTES,
  normalizarIncidente,
  sugerirEnCurso,
  ventanaDeSincronizacion,
  type IncidenteEspejo,
  type RespuestaLogAnalytics,
} from '../sentinel';

describe('KQL_INCIDENTES', () => {
  it('deduplica el append-only con arg_max por IncidentNumber', () => {
    expect(KQL_INCIDENTES).toContain('arg_max(TimeGenerated, *) by IncidentNumber');
  });

  // D11: la ventana de tiempo va solo en el `timespan` del cuerpo de la petición. Un
  // `ago()` en el KQL competiría con esa ventana y la más angosta ganaría en silencio.
  it('no lleva ago(): la única ventana es la del cuerpo de la petición', () => {
    expect(KQL_INCIDENTES).not.toContain('ago(');
  });
});

describe('ventanaDeSincronizacion', () => {
  it('sin SENTINEL_TIMESPAN_SINCRONIZACION usa P30D', () => {
    expect(ventanaDeSincronizacion({})).toBe('P30D');
  });

  it('con la variable puesta usa ese valor', () => {
    expect(ventanaDeSincronizacion({ SENTINEL_TIMESPAN_SINCRONIZACION: 'P7D' })).toBe('P7D');
  });

  // La línea existe en el .env y está en blanco: es el mismo defecto de despliegue que
  // `variablesSentinelQueFaltan` trata como ausente en `sentinel-fallo.ts`.
  it('en blanco usa el default, no la cadena vacía', () => {
    expect(ventanaDeSincronizacion({ SENTINEL_TIMESPAN_SINCRONIZACION: '   ' })).toBe('P30D');
  });
});

// La respuesta real de Log Analytics: `IncidentNumber` como número, filas posicionales.
function respuesta(columnas: { name: string; type: string }[], filas: unknown[][]): RespuestaLogAnalytics {
  return { tables: [{ name: 'PrimaryResult', columns: columnas, rows: filas }] };
}

const COLUMNAS_ORDEN_A = [
  { name: 'IncidentNumber', type: 'int' },
  { name: 'Title', type: 'string' },
  { name: 'Severity', type: 'string' },
  { name: 'Status', type: 'string' },
  { name: 'IncidentUrl', type: 'string' },
];

const COLUMNAS_ORDEN_B = [
  { name: 'Status', type: 'string' },
  { name: 'IncidentUrl', type: 'string' },
  { name: 'IncidentNumber', type: 'int' },
  { name: 'Title', type: 'string' },
  { name: 'Severity', type: 'string' },
];

describe('aFilas · mapea por nombre de columna, no por posición', () => {
  it('un reordenamiento de columnas produce el mismo contenido', () => {
    const conA = aFilas(
      respuesta(COLUMNAS_ORDEN_A, [[1, 'Perdida de telemetria', 'Medium', 'Closed', 'https://x/1']]),
    );
    const conB = aFilas(
      respuesta(COLUMNAS_ORDEN_B, [['Closed', 'https://x/1', 1, 'Perdida de telemetria', 'Medium']]),
    );
    expect(conA.ok).toBe(true);
    expect(conB.ok).toBe(true);
    if (!conA.ok || !conB.ok) return;
    expect(conA.datos).toEqual(conB.datos);
    expect(conA.datos[0].IncidentNumber).toBe(1);
  });

  // Criterio del diseño: cero filas es una respuesta legítima, el trabajo termina exitoso
  // con `creados: 0`. No es lo mismo que una respuesta sin forma.
  it('cero filas no es un fallo', () => {
    const r = aFilas(respuesta(COLUMNAS_ORDEN_A, []));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos).toEqual([]);
  });

  it('sin tables en la respuesta es TABLA_AUSENTE', () => {
    const r = aFilas({ tables: [] } as unknown as RespuestaLogAnalytics);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fallo.causa).toBe('TABLA_AUSENTE');
  });

  it('sin la columna IncidentNumber es TABLA_AUSENTE', () => {
    const r = aFilas(respuesta([{ name: 'Title', type: 'string' }], [['solo titulo']]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fallo.causa).toBe('TABLA_AUSENTE');
  });
});

describe('claveIncidente · el hecho verificado contra el workspace real', () => {
  // `IncidentNumber` llega como `int` en la respuesta REST cruda. El CLI de Azure lo
  // muestra entre comillas, pero eso es un espejismo del CLI.
  it('42 (número) y "42" (texto) producen la misma clave', () => {
    expect(claveIncidente(42)).toBe(claveIncidente('42'));
  });

  it('la clave de un número es su representación en texto', () => {
    expect(claveIncidente(19)).toBe('19');
  });
});

describe('aTextoJson', () => {
  it('un arreglo ya parseado y su cadena JSON equivalente producen el mismo texto', () => {
    const comoArreglo = aTextoJson(['SUSPICIOUS_LOGIN', 'HIGH_RISK']);
    const comoCadena = aTextoJson('["SUSPICIOUS_LOGIN","HIGH_RISK"]');
    expect(comoArreglo).toBe(comoCadena);
  });

  it('null y undefined dan null', () => {
    expect(aTextoJson(null)).toBeNull();
    expect(aTextoJson(undefined)).toBeNull();
  });
});

describe('correoDelPropietario', () => {
  it('objeto ya parseado con email da el correo', () => {
    expect(correoDelPropietario({ email: 'ana@cuantico.com', objectId: 'x' })).toBe(
      'ana@cuantico.com',
    );
  });

  it('cadena JSON con email da el mismo correo', () => {
    expect(correoDelPropietario('{"email":"ana@cuantico.com"}')).toBe('ana@cuantico.com');
  });

  it('JSON roto da null, sin lanzar', () => {
    expect(() => correoDelPropietario('{esto no es json')).not.toThrow();
    expect(correoDelPropietario('{esto no es json')).toBeNull();
  });

  it('ausente da null', () => {
    expect(correoDelPropietario(null)).toBeNull();
    expect(correoDelPropietario(undefined)).toBeNull();
  });
});

describe('descripcionPromovida', () => {
  it('compone título y descripción', () => {
    expect(descripcionPromovida('Perdida de telemetria', 'agente caido en 3 hosts')).toBe(
      'Perdida de telemetria — agente caido en 3 hosts',
    );
  });

  it('descripción vacía no deja separador colgando', () => {
    expect(descripcionPromovida('Perdida de telemetria', '')).toBe('Perdida de telemetria');
    expect(descripcionPromovida('Perdida de telemetria', null)).toBe('Perdida de telemetria');
  });
});

describe('sugerirEnCurso', () => {
  it('Closed sugiere que no está en curso', () => {
    expect(sugerirEnCurso('Closed')).toBe(false);
  });

  it('New y Active sugieren que sí está en curso', () => {
    expect(sugerirEnCurso('New')).toBe(true);
    expect(sugerirEnCurso('Active')).toBe(true);
  });
});

function incidente(sobrescribe: Partial<IncidenteEspejo> = {}): IncidenteEspejo {
  return {
    numeroIncidente: '4021',
    titulo: 'Perdida de telemetria',
    descripcion: 'agente caido',
    severidadSentinel: 'Medium',
    estadoSentinel: 'New',
    clasificacion: null,
    comentarioClasificacion: null,
    creadoEnSentinel: new Date('2026-09-01T00:00:00Z'),
    primeraActividad: null,
    ultimaActividad: null,
    cerradoEnSentinel: null,
    url: 'https://portal.azure.com/incidente/4021',
    proveedor: 'Microsoft Sentinel',
    propietarioCorreo: null,
    etiquetas: null,
    alertas: null,
    ...sobrescribe,
  };
}

describe('clasificarSincronizacion', () => {
  it('mismos datos → 0 nuevos, 0 actualizados, todas las claves en sinCambios', () => {
    const uno = incidente();
    const r = clasificarSincronizacion([uno], [incidente()]);
    expect(r.nuevos).toHaveLength(0);
    expect(r.actualizados).toHaveLength(0);
    expect(r.sinCambios).toEqual(['4021']);
  });

  // D9: `id` y `sincronizadoEn` no son datos de Sentinel — son metadatos del espejo. Si
  // contaran como cambio, cada corrida reportaría todo como «actualizado» para siempre.
  it('id y sincronizadoEn distintos NO cuentan como cambio', () => {
    const existente = incidente({ id: 1, sincronizadoEn: new Date('2026-09-01T00:00:00Z') });
    const entrante = incidente({ id: 999, sincronizadoEn: new Date('2026-09-15T12:00:00Z') });
    const r = clasificarSincronizacion([existente], [entrante]);
    expect(r.actualizados).toHaveLength(0);
    expect(r.sinCambios).toEqual(['4021']);
  });

  it('un campo de Sentinel distinto cuenta como actualizado', () => {
    const existente = incidente({ estadoSentinel: 'New' });
    const entrante = incidente({ estadoSentinel: 'Closed' });
    const r = clasificarSincronizacion([existente], [entrante]);
    expect(r.actualizados).toHaveLength(1);
    expect(r.sinCambios).toHaveLength(0);
  });

  it('un IncidentNumber que no estaba es nuevo', () => {
    const r = clasificarSincronizacion([], [incidente({ numeroIncidente: '9001' })]);
    expect(r.nuevos).toHaveLength(1);
    expect(r.nuevos[0].numeroIncidente).toBe('9001');
    expect(r.sinCambios).toHaveLength(0);
  });
});

describe('normalizarIncidente', () => {
  it('normaliza una fila cruda de aFilas a IncidenteEspejo', () => {
    const filas = aFilas(
      respuesta(
        [
          { name: 'IncidentNumber', type: 'int' },
          { name: 'Title', type: 'string' },
          { name: 'Description', type: 'string' },
          { name: 'Severity', type: 'string' },
          { name: 'Status', type: 'string' },
          { name: 'CreatedTime', type: 'datetime' },
          { name: 'IncidentUrl', type: 'string' },
          { name: 'Owner', type: 'dynamic' },
          { name: 'Labels', type: 'dynamic' },
        ],
        [
          [
            1,
            'Perdida de telemetria',
            'agente caido en 3 hosts',
            'Medium',
            'Closed',
            '2026-09-01T00:00:00Z',
            'https://portal.azure.com/incidente/1',
            { email: 'ana@cuantico.com' },
            ['SUSPICIOUS_LOGIN'],
          ],
        ],
      ),
    );
    expect(filas.ok).toBe(true);
    if (!filas.ok) return;
    const incidente = normalizarIncidente(filas.datos[0]);
    expect(incidente.numeroIncidente).toBe('1');
    expect(incidente.titulo).toBe('Perdida de telemetria');
    expect(incidente.creadoEnSentinel).toBeInstanceOf(Date);
    expect(incidente.propietarioCorreo).toBe('ana@cuantico.com');
    expect(incidente.etiquetas).toBe('["SUSPICIOUS_LOGIN"]');
  });
});
