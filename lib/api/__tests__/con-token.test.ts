/**
 * @jest-environment node
 */

// lib/api/__tests__/con-token.test.ts
//
// D5 · toda ruta de `/api/v1` pasa por esta envoltura. Sin cabecera `Authorization` → 401 con
// cuerpo JSON, nunca una redirección — es exactamente lo que `middleware.ts` NO puede dar: para
// un cliente máquina, un 302 hacia HTML es una respuesta que no entiende. Token sin el permiso
// pedido → 403. Con permiso → el manejador corre y recibe el `Autor` de clase servicio.

jest.mock('server-only', () => ({}));

const validar = jest.fn();
jest.mock('@/lib/api/token-servicio', () => ({
  validar: (...a: unknown[]) => validar(...a),
}));

import { conToken } from '../con-token';

function peticion(autorizacion?: string): Request {
  const headers = new Headers();
  if (autorizacion !== undefined) headers.set('authorization', autorizacion);
  return new Request('http://x/api/v1/salud', { headers });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sin cabecera Authorization', () => {
  it('responde 401 con cuerpo JSON, y el manejador no corre', async () => {
    const manejador = jest.fn();
    const ruta = conToken('tecnologia:ver', manejador);

    const r = await ruta(peticion(), {});

    expect(r.status).toBe(401);
    expect(r.headers.get('Content-Type')).toContain('application/json');
    const cuerpo = await r.json();
    expect(cuerpo).toBeTruthy();
    expect(manejador).not.toHaveBeenCalled();
    expect(validar).not.toHaveBeenCalled();
  });

  it('una cabecera que no es "Bearer <secreto>" se trata igual que ausente', async () => {
    const manejador = jest.fn();
    const ruta = conToken('tecnologia:ver', manejador);

    const r = await ruta(peticion('Basic algo'), {});

    expect(r.status).toBe(401);
    expect(manejador).not.toHaveBeenCalled();
  });
});

describe('token inválido', () => {
  it('responde 401 y el manejador no corre', async () => {
    validar.mockResolvedValue({ ok: false });
    const manejador = jest.fn();
    const ruta = conToken('tecnologia:ver', manejador);

    const r = await ruta(peticion('Bearer sgi_live_loquesea'), {});

    expect(r.status).toBe(401);
    expect(validar).toHaveBeenCalledWith('sgi_live_loquesea');
    expect(manejador).not.toHaveBeenCalled();
  });
});

describe('token válido sin el permiso pedido', () => {
  it('responde 403 y el manejador no corre', async () => {
    validar.mockResolvedValue({
      ok: true,
      token: { id: 9, nombre: 'robot-mintrace', alcance: ['sgsi:ver'] },
    });
    const manejador = jest.fn();
    const ruta = conToken('tecnologia:escribir', manejador);

    const r = await ruta(peticion('Bearer sgi_live_correcto'), {});

    expect(r.status).toBe(403);
    expect(manejador).not.toHaveBeenCalled();
  });

  it('un alcance vacío no autoriza nada', async () => {
    validar.mockResolvedValue({ ok: true, token: { id: 9, nombre: 'vacio', alcance: [] } });
    const manejador = jest.fn();
    const ruta = conToken('misig:ver', manejador);

    const r = await ruta(peticion('Bearer sgi_live_correcto'), {});
    expect(r.status).toBe(403);
  });
});

describe('token válido con el permiso pedido', () => {
  it('el manejador corre y recibe el Autor de clase servicio', async () => {
    validar.mockResolvedValue({
      ok: true,
      token: { id: 9, nombre: 'robot-mintrace', alcance: ['tecnologia:escribir'] },
    });
    const manejador = jest.fn(async (_request: Request, _autor: unknown, _contexto: unknown) => new Response(null, { status: 204 }));
    const ruta = conToken('tecnologia:escribir', manejador);

    const contexto = { params: Promise.resolve({ codigo: 'SIS-001' }) };
    const r = await ruta(peticion('Bearer sgi_live_correcto'), contexto);

    expect(r.status).toBe(204);
    expect(manejador).toHaveBeenCalledTimes(1);
    const [, autor, ctx] = manejador.mock.calls[0];
    expect(autor).toEqual({
      clase: 'servicio',
      tokenId: 9,
      nombre: 'robot-mintrace',
      alcance: ['tecnologia:escribir'],
    });
    expect(ctx).toBe(contexto);
  });

  it('acepta el esquema Bearer insensible a mayúsculas', async () => {
    validar.mockResolvedValue({
      ok: true,
      token: { id: 1, nombre: 'x', alcance: ['misig:ver'] },
    });
    const manejador = jest.fn(async () => new Response(null, { status: 204 }));
    const ruta = conToken('misig:ver', manejador);

    const r = await ruta(peticion('bearer sgi_live_correcto'), {});
    expect(r.status).toBe(204);
    expect(validar).toHaveBeenCalledWith('sgi_live_correcto');
  });
});
