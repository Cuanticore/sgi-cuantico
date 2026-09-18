/**
 * @jest-environment node
 */

// app/scorm/archivo/[paqueteId]/[...ruta]/__tests__/route.test.ts
//
// Tres caminos —200, 206 y 416— y una invariante que los cruza: **la CSP va en los tres**.
// Una respuesta parcial sin política es un hueco por el que se sirve contenido de un
// paquete sin las restricciones que ese paquete declaró.
//
// Prisma se mockea por completo: cargarlo de verdad pediría una base.

jest.mock('server-only', () => ({}));

const findUnique = jest.fn();
const queryRaw = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    archivoScorm: { findUnique: (...a: unknown[]) => findUnique(...a) },
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
  },
}));

const cabeceras = new Map<string, string>();
jest.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => cabeceras.get(k.toLowerCase()) ?? null }),
}));

import { GET } from '../route';

const CONTENIDO = 'https://cursos.sig.example.com';
const APP = 'https://sig.example.com';

const params = Promise.resolve({ paqueteId: '7', ruta: ['video', 'clase.mp4'] });

beforeEach(() => {
  jest.clearAllMocks();
  cabeceras.clear();
  cabeceras.set('host', 'cursos.sig.example.com');
  process.env.SCORM_ORIGEN_CONTENIDO = CONTENIDO;
  process.env.SCORM_ORIGEN_APP = APP;

  findUnique.mockResolvedValue({
    id: 42,
    mime: 'video/mp4',
    sha256: 'abc123',
    tamano: 1000,
    paquete: { dominiosExternos: [] },
  });
  // `prisma.$queryRaw` se invoca como plantilla etiquetada, así que llega
  // `(templateStringsArray, ...valores)` con los valores EN EL ORDEN DEL TEXTO:
  // `(desde + 1, largo, id)`.
  //
  // El mock devuelve un trozo del largo que se le pidió, para poder comprobar que la ruta
  // pide EXACTAMENTE el tramo y no el archivo entero.
  queryRaw.mockImplementation(async (_sql: unknown, ...valores: number[]) => {
    const [, largo] = valores;
    return [{ trozo: Buffer.alloc(largo, 1) }];
  });
});

describe('sin cabecera Range', () => {
  it('responde 200, con Accept-Ranges y la CSP', async () => {
    const r = await GET(new Request('http://x/'), { params });

    expect(r.status).toBe(200);
    // Sin esta cabecera el navegador NI SIQUIERA INTENTA pedir un rango, y el video no se
    // puede adelantar aunque el 206 esté implementado.
    expect(r.headers.get('Accept-Ranges')).toBe('bytes');
    expect(r.headers.get('Content-Length')).toBe('1000');
    expect(r.headers.get('Content-Type')).toBe('video/mp4');
    expect(r.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(r.headers.get('ETag')).toBe('"abc123"');
  });

  it('no trae el blob completo en la consulta de metadatos', async () => {
    await GET(new Request('http://x/'), { params });

    // La primera consulta NO pide `bytes`: traer 200 MB a memoria para leer el mime es la
    // forma del `rowCount` inflado que HARNESS.md documenta.
    const seleccion = findUnique.mock.calls[0][0].select;
    expect(seleccion.bytes).toBeUndefined();
    expect(seleccion.tamano).toBe(true);
  });
});

describe('con un rango válido', () => {
  it('responde 206 con Content-Range y sólo el tramo', async () => {
    cabeceras.set('range', 'bytes=100-199');
    const r = await GET(new Request('http://x/'), { params });

    expect(r.status).toBe(206);
    expect(r.headers.get('Content-Range')).toBe('bytes 100-199/1000');
    expect(r.headers.get('Content-Length')).toBe('100');
    expect(r.headers.get('Accept-Ranges')).toBe('bytes');
    // La CSP también acá: una respuesta parcial sin política sirve contenido sin las
    // restricciones que el paquete declaró.
    expect(r.headers.get('Content-Security-Policy')).toContain("default-src 'none'");

    const cuerpo = Buffer.from(await r.arrayBuffer());
    expect(cuerpo.length).toBe(100);
  });

  it('le pide a Postgres el tramo, no el archivo', async () => {
    cabeceras.set('range', 'bytes=100-199');
    await GET(new Request('http://x/'), { params });

    // `substring` en Postgres es 1-indexado: el byte 100 es la posición 101.
    // Los valores van en el orden del texto de la consulta: (desde + 1, largo, id).
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const valores = queryRaw.mock.calls[0].slice(1);
    expect(valores).toEqual([101, 100, 42]);
  });
});

describe('con un rango inatendible', () => {
  it('responde 416 con Content-Range y sin leer bytes', async () => {
    cabeceras.set('range', 'bytes=5000-6000');
    const r = await GET(new Request('http://x/'), { params });

    expect(r.status).toBe(416);
    expect(r.headers.get('Content-Range')).toBe('bytes */1000');
    expect(r.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    // No se lee ningún byte para contestar que el rango no sirve.
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe('las guardas que ya existían', () => {
  it('404 fuera del origen de contenido', async () => {
    cabeceras.set('host', 'sig.example.com');
    const r = await GET(new Request('http://x/'), { params });
    expect(r.status).toBe(404);
  });

  it('404 cuando el archivo no está en el paquete', async () => {
    findUnique.mockResolvedValue(null);
    const r = await GET(new Request('http://x/'), { params });
    expect(r.status).toBe(404);
  });
});
