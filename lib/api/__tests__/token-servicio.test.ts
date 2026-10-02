/**
 * @jest-environment node
 */

// lib/api/__tests__/token-servicio.test.ts
//
// D3 · TokenServicio es EnlaceFirma con alcance. Se copia lo que ya está probado:
// generación con `randomBytes(32)`, sólo el hash en reposo, validación por BÚSQUEDA del hash
// —nunca comparación de secretos—, caducidad obligatoria y una respuesta idéntica para los
// cuatro fallos de autenticación. Prisma se mockea por completo: no hace falta Postgres para
// probar estas reglas.

jest.mock('server-only', () => ({}));

const create = jest.fn();
const findUnique = jest.fn();
const update = jest.fn();
const findMany = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    tokenServicio: {
      create: (...a: unknown[]) => create(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
  },
}));

import {
  DIAS_DE_VALIDEZ_POR_DEFECTO,
  PREFIJO_LITERAL,
  diasDeValidez,
  emitir,
  generarSecreto,
  hashDeSecreto,
  listar,
  prefijoVisible,
  registrarUso,
  revocar,
  validar,
  venceEn,
} from '../token-servicio';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('2.1 · el secreto generado', () => {
  it('trae el prefijo sgi_live_', () => {
    expect(generarSecreto().startsWith(PREFIJO_LITERAL)).toBe(true);
  });

  it('trae 32 bytes de entropía en base64url, además del prefijo', () => {
    const aleatorio = generarSecreto().slice(PREFIJO_LITERAL.length);
    // base64url de 32 bytes: 43 caracteres, sin '+', '/' ni '='.
    expect(aleatorio).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('dos emisiones nunca coinciden — mil secretos seguidos, sin colisión', () => {
    const secretos = new Set(Array.from({ length: 1000 }, () => generarSecreto()));
    expect(secretos.size).toBe(1000);
  });

  it('el hash de mil secretos distintos nunca coincide', () => {
    const hashes = new Set(Array.from({ length: 1000 }, () => hashDeSecreto(generarSecreto())));
    expect(hashes.size).toBe(1000);
  });
});

describe('diasDeValidez — la caducidad es obligatoria (D4)', () => {
  it('por defecto son noventa días', () => {
    expect(diasDeValidez({})).toBe(DIAS_DE_VALIDEZ_POR_DEFECTO);
    expect(DIAS_DE_VALIDEZ_POR_DEFECTO).toBe(90);
  });

  it('un valor mal escrito cae al valor por defecto, nunca a un token eterno', () => {
    expect(diasDeValidez({ TOKEN_SERVICIO_DIAS: 'noventa' })).toBe(DIAS_DE_VALIDEZ_POR_DEFECTO);
    expect(diasDeValidez({ TOKEN_SERVICIO_DIAS: '-5' })).toBe(DIAS_DE_VALIDEZ_POR_DEFECTO);
    expect(diasDeValidez({ TOKEN_SERVICIO_DIAS: '0' })).toBe(DIAS_DE_VALIDEZ_POR_DEFECTO);
  });

  it('un valor válido se respeta', () => {
    expect(diasDeValidez({ TOKEN_SERVICIO_DIAS: '30' })).toBe(30);
  });
});

describe('venceEn', () => {
  it('suma los días en milisegundos', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    expect(venceEn(base, 1).toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('emitir', () => {
  beforeEach(() => {
    create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 1, ...data }),
    );
  });

  it('no hay token eterno: expiraEn siempre queda fijado, por defecto a 90 días', async () => {
    const ahora = Date.now();
    const emitido = await emitir(
      { nombre: 'robot-mintrace', alcance: ['tecnologia:escribir'], creadoPor: 'ana@cuantico.com' },
      {},
    );
    const dias = (emitido.expiraEn.getTime() - ahora) / (24 * 60 * 60 * 1000);
    expect(dias).toBeGreaterThan(89.9);
    expect(dias).toBeLessThan(90.1);
  });

  it('el secreto se devuelve, pero lo que se persiste es el hash y el prefijo, nunca el secreto', async () => {
    const emitido = await emitir(
      { nombre: 'robot-mintrace', alcance: ['tecnologia:escribir'], creadoPor: 'ana@cuantico.com' },
      {},
    );

    expect(emitido.secreto.startsWith(PREFIJO_LITERAL)).toBe(true);

    const datosGuardados = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(datosGuardados.tokenHash).toBe(hashDeSecreto(emitido.secreto));
    expect(datosGuardados.prefijo).toBe(prefijoVisible(emitido.secreto));
    // Ni el secreto completo, ni ningún fragmento más largo que el prefijo visible, viaja a
    // la fila que se persiste.
    expect(JSON.stringify(datosGuardados)).not.toContain(emitido.secreto);
  });

  it('exige un nombre', async () => {
    await expect(
      emitir({ nombre: '  ', alcance: [], creadoPor: 'ana@cuantico.com' }, {}),
    ).rejects.toThrow(/nombre/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('persiste el alcance recibido tal cual', async () => {
    const emitido = await emitir(
      { nombre: 'robot', alcance: ['tecnologia:escribir', 'sgsi:ver'], creadoPor: 'ana@cuantico.com' },
      {},
    );
    expect(emitido.alcance).toEqual(['tecnologia:escribir', 'sgsi:ver']);
    expect(create.mock.calls[0][0].data.alcance).toEqual(['tecnologia:escribir', 'sgsi:ver']);
  });
});

describe('2.3 · la validación busca por hash, nunca compara secretos', () => {
  it('busca por el hash del secreto recibido', async () => {
    findUnique.mockResolvedValue(null);
    await validar('sgi_live_loquesea');
    expect(findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashDeSecreto('sgi_live_loquesea') },
    });
  });

  it('un token inexistente, uno expirado, uno revocado y uno bloqueado responden EXACTAMENTE igual', async () => {
    const ahora = new Date();
    const inexistente = null;
    const expirado = {
      id: 1,
      nombre: 'x',
      alcance: [],
      revocadoEn: null,
      bloqueadoEn: null,
      expiraEn: new Date(ahora.getTime() - 1000),
    };
    const revocado = {
      id: 2,
      nombre: 'x',
      alcance: [],
      revocadoEn: ahora,
      bloqueadoEn: null,
      expiraEn: new Date(ahora.getTime() + 999_999),
    };
    const bloqueado = {
      id: 3,
      nombre: 'x',
      alcance: [],
      revocadoEn: null,
      bloqueadoEn: ahora,
      expiraEn: new Date(ahora.getTime() + 999_999),
    };

    const resultados = [];
    for (const fila of [inexistente, expirado, revocado, bloqueado]) {
      findUnique.mockResolvedValueOnce(fila);
      resultados.push(await validar('sgi_live_cualquiera'));
    }

    expect(resultados).toEqual([{ ok: false }, { ok: false }, { ok: false }, { ok: false }]);
    // No sólo tienen el mismo valor: ninguna rama construyó un objeto con un campo de más
    // (una razón, un código) — las cuatro devuelven la MISMA constante.
    expect(resultados[0]).toBe(resultados[1]);
    expect(resultados[1]).toBe(resultados[2]);
    expect(resultados[2]).toBe(resultados[3]);
    // Ninguno de los cuatro casos malos actualiza ultimoUsoEn.
    expect(update).not.toHaveBeenCalled();
  });

  it('el bloqueo por intentos no se anuncia: el secreto correcto de un token bloqueado falla igual', async () => {
    findUnique.mockResolvedValue({
      id: 4,
      nombre: 'x',
      alcance: [],
      revocadoEn: null,
      bloqueadoEn: new Date(),
      expiraEn: new Date(Date.now() + 999_999),
    });
    const r = await validar('sgi_live_elcorrecto');
    expect(r).toEqual({ ok: false });
  });

  it('un token vigente valida, devuelve su alcance y registra el uso', async () => {
    findUnique.mockResolvedValue({
      id: 9,
      nombre: 'robot-mintrace',
      alcance: ['tecnologia:escribir'],
      revocadoEn: null,
      bloqueadoEn: null,
      expiraEn: new Date(Date.now() + 999_999),
    });
    update.mockResolvedValue({});

    const r = await validar('sgi_live_correcto');

    expect(r).toEqual({
      ok: true,
      token: { id: 9, nombre: 'robot-mintrace', alcance: ['tecnologia:escribir'] },
    });
    expect(update).toHaveBeenCalledWith({ where: { id: 9 }, data: { ultimoUsoEn: expect.any(Date) } });
  });
});

describe('registrarUso', () => {
  it('actualiza ultimoUsoEn', async () => {
    update.mockResolvedValue({});
    await registrarUso(5);
    expect(update).toHaveBeenCalledWith({ where: { id: 5 }, data: { ultimoUsoEn: expect.any(Date) } });
  });
});

describe('revocar', () => {
  it('exige un motivo', async () => {
    await expect(revocar(1, '')).rejects.toThrow(/motivo/i);
    expect(update).not.toHaveBeenCalled();
  });

  it('marca revocadoEn y guarda el motivo', async () => {
    update.mockResolvedValue({});
    await revocar(1, 'rotación de credenciales');
    expect(update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { revocadoEn: expect.any(Date), motivoRevocacion: 'rotación de credenciales' },
    });
  });
});

describe('listar', () => {
  it('nunca incluye el secreto porque la fila nunca lo tuvo, y expone el prefijo', async () => {
    findMany.mockResolvedValue([
      {
        id: 1,
        nombre: 'robot-mintrace',
        prefijo: 'sgi_live_7Kq2abc1',
        alcance: ['tecnologia:escribir'],
        expiraEn: new Date(),
        creadoEn: new Date(),
        creadoPor: 'ana@cuantico.com',
        ultimoUsoEn: null,
        revocadoEn: null,
        motivoRevocacion: null,
      },
    ]);
    const filas = await listar();
    expect(filas).toHaveLength(1);
    expect(filas[0].prefijo).toBe('sgi_live_7Kq2abc1');
    expect(Object.keys(filas[0])).not.toContain('tokenHash');
    expect(JSON.stringify(filas)).not.toMatch(/secreto/i);
  });
});
