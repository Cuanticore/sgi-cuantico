// lib/sig/__tests__/soportes-sharepoint.test.ts
//
// Lo que se prueba acá es lo que decide DÓNDE y CÓMO se llama un soporte publicado, y
// cuándo vale la pena reintentar. Es puro a propósito: la parte que habla con Graph no se
// puede probar sin red, y la parte que decide sí — así que la decisión no vive con la red.

import {
  INTENTOS_MAXIMOS,
  debeDetenerElLote,
  debeReintentar,
  esperaAntesDeReintentar,
  estadoTrasFallo,
  gastaIntento,
  nombreDeArchivo,
  nombreDeCarpeta,
  rutaCompleta,
  sanear,
} from '../soportes-sharepoint';

const BASE =
  '09. SISTEMA INTEGRADO DE GESTION/14. Seguridad de la Informacion/' +
  '11. Automatizaciones y requerimientos SIG/2. Soportes SIG';

describe('nombreDeCarpeta', () => {
  it('es la parte local del correo, en minúsculas', () => {
    expect(nombreDeCarpeta('Daniel.Medina@cuantico.com')).toBe('daniel.medina');
  });

  // D-3 · dos personas que se llaman igual tienen correos distintos, y por eso la carpeta
  // no se puede llamar «Apellido Nombre»: los soportes de una caerían en la de la otra.
  it('distingue homónimos porque el correo es único', () => {
    expect(nombreDeCarpeta('lmedina@cuantico.com')).not.toBe(
      nombreDeCarpeta('lmedina2@cuantico.com'),
    );
  });

  it('sin arroba usa el valor completo', () => {
    expect(nombreDeCarpeta('sistemas')).toBe('sistemas');
  });

  it('un correo sin parte local utilizable es un error, no una carpeta rara', () => {
    expect(() => nombreDeCarpeta('@cuantico.com')).toThrow(/parte local/);
  });
});

describe('sanear', () => {
  // P5 · SharePoint rechaza estos caracteres. Un título con «/» partiría la ruta.
  it('reemplaza los caracteres que SharePoint prohíbe', () => {
    expect(sanear('Política: seguridad/privacidad <v2>')).toBe(
      'Política- seguridad-privacidad -v2-',
    );
  });

  it('recorta espacios de los extremos y colapsa los internos', () => {
    expect(sanear('  Acta   de    firma  ')).toBe('Acta de firma');
  });

  it('quita el prefijo ~$ que SharePoint rechaza', () => {
    expect(sanear('~$temporal')).toBe('temporal');
  });
});

describe('nombreDeArchivo', () => {
  const ACTA = {
    codigo: 'ACT-2026-0014',
    documentoCodigo: 'POL-SIG-02',
    documentoVersion: 3,
    aceptadoEn: new Date('2026-09-08T14:30:00.000Z'),
    extension: 'txt',
  };

  it('lleva el código, el documento con su versión y la fecha', () => {
    expect(nombreDeArchivo(ACTA)).toBe('ACT-2026-0014 — POL-SIG-02 v3 — 2026-09-08.txt');
  });

  it('sin documento se queda con el código y la fecha', () => {
    expect(nombreDeArchivo({ ...ACTA, documentoCodigo: null, documentoVersion: null })).toBe(
      'ACT-2026-0014 — 2026-09-08.txt',
    );
  });

  it('acepta el punto en la extensión y no lo duplica', () => {
    expect(nombreDeArchivo({ ...ACTA, extension: '.pdf' })).toMatch(/\.pdf$/);
  });

  // P5 · el nombre se recorta, pero el CÓDIGO se preserva siempre: es con lo que se
  // reencuentra el soporte desde la base. Un recorte que se coma el código deja un archivo
  // que nadie puede volver a relacionar con su acta.
  it('recorta a 120 caracteres preservando el código y la extensión', () => {
    const largo = nombreDeArchivo({ ...ACTA, documentoCodigo: 'X'.repeat(300) });
    expect(largo.length).toBeLessThanOrEqual(120);
    expect(largo.startsWith('ACT-2026-0014 — ')).toBe(true);
    expect(largo.endsWith('.txt')).toBe(true);
  });
});

describe('rutaCompleta', () => {
  it('une base, carpeta y archivo con una sola barra', () => {
    expect(rutaCompleta(`/${BASE}/`, 'daniel.medina', 'ACT-2026-0014.txt')).toBe(
      `${BASE}/daniel.medina/ACT-2026-0014.txt`,
    );
  });
});

describe('política de reintentos', () => {
  // P9 · un 403 no se arregla reintentando: se arregla en Azure. Reintentarlo un día lo
  // esconde, y el 403 es información que alguien necesita ver hoy.
  it('no reintenta lo que no se arregla solo', () => {
    expect(debeReintentar('SIN_PERMISO', 1)).toBe(false);
    expect(debeReintentar('NO_EXISTE', 1)).toBe(false);
  });

  it('reintenta lo transitorio hasta el techo', () => {
    expect(debeReintentar('DEMASIADAS_CONSULTAS', 1)).toBe(true);
    expect(debeReintentar('SIN_RED', INTENTOS_MAXIMOS - 1)).toBe(true);
    expect(debeReintentar('SIN_RED', INTENTOS_MAXIMOS)).toBe(false);
  });

  // P9 · sin variables no hay nada que reintentar: no se gasta intento, o la cola se
  // quemaría sola mientras alguien termina de configurar el entorno.
  it('la falta de configuración no gasta intento', () => {
    expect(gastaIntento('SIN_CONFIGURAR')).toBe(false);
    expect(gastaIntento('SIN_RED')).toBe(true);
    expect(debeReintentar('SIN_CONFIGURAR', 99)).toBe(true);
  });

  it('las esperas crecen y se estancan en 24 horas', () => {
    expect(esperaAntesDeReintentar(1)).toBe(60_000);
    expect(esperaAntesDeReintentar(3)).toBe(900_000);
    expect(esperaAntesDeReintentar(99)).toBe(86_400_000);
  });

  it('lo que no se reintenta queda BLOQUEADO y visible', () => {
    expect(estadoTrasFallo('SIN_PERMISO', 1)).toBe('BLOQUEADO');
    expect(estadoTrasFallo('DEMASIADAS_CONSULTAS', 1)).toBe('PENDIENTE');
  });

  // Si la causa es del entorno, los 300 soportes siguientes van a fallar igual.
  it('detiene el lote cuando la causa es del entorno', () => {
    expect(debeDetenerElLote('SIN_CONFIGURAR')).toBe(true);
    expect(debeDetenerElLote('CREDENCIAL_RECHAZADA')).toBe(true);
    expect(debeDetenerElLote('SIN_RED')).toBe(true);
    expect(debeDetenerElLote('DEMASIADAS_CONSULTAS')).toBe(false);
  });
});
