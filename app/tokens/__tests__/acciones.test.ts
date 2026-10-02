/**
 * @jest-environment node
 */

// app/tecnologia/tokens/__tests__/acciones.test.ts
//
// Las Server Actions de la pantalla de administración de tokens. Exigen
// `tokenServicio:administrar` —detrás de `autorConPermiso`, que además resuelve el autor que
// queda como `creadoPor`— y delegan toda la regla de negocio en `lib/api/token-servicio.ts`:
// acá no se reimplementa nada, sólo se traduce sesión -> sesión fallida -> mensaje de pantalla.

jest.mock('server-only', () => ({}));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

const emitir = jest.fn();
const revocar = jest.fn();
jest.mock('@/lib/api/token-servicio', () => ({
  emitir: (...a: unknown[]) => emitir(...a),
  revocar: (...a: unknown[]) => revocar(...a),
}));

const autorConPermiso = jest.fn();
jest.mock('@/app/sgsi/acciones/sesion', () => ({
  autorConPermiso: (...a: unknown[]) => autorConPermiso(...a),
  ejecutar: async (op: () => Promise<unknown>) => {
    try {
      return await op();
    } catch (e) {
      return { ok: false, mensaje: e instanceof Error ? e.message : 'falló' };
    }
  },
}));

import { emitirToken, revocarToken } from '../acciones';

beforeEach(() => {
  jest.clearAllMocks();
  autorConPermiso.mockResolvedValue('ana@cuantico.com');
});

describe('emitirToken', () => {
  it('exige tokenServicio:administrar y pasa el autor como creadoPor', async () => {
    emitir.mockResolvedValue({
      id: 1,
      nombre: 'robot-mintrace',
      secreto: 'sgi_live_abc123',
      prefijo: 'sgi_live_abc12345',
      alcance: ['tecnologia:escribir'],
      expiraEn: new Date(),
    });

    const r = await emitirToken({ nombre: 'robot-mintrace', alcance: ['tecnologia:escribir'] });

    expect(autorConPermiso).toHaveBeenCalledWith('tokenServicio:administrar');
    expect(emitir).toHaveBeenCalledWith({
      nombre: 'robot-mintrace',
      alcance: ['tecnologia:escribir'],
      creadoPor: 'ana@cuantico.com',
    });
    expect(r.ok).toBe(true);
    expect(r.secreto).toBe('sgi_live_abc123');
  });

  it('sin el permiso, no llega a emitir nada', async () => {
    autorConPermiso.mockRejectedValue(new Error('Tu rol no permite esta operación.'));

    const r = await emitirToken({ nombre: 'robot-mintrace', alcance: [] });

    expect(r.ok).toBe(false);
    expect(emitir).not.toHaveBeenCalled();
  });
});

describe('revocarToken', () => {
  it('exige el permiso y delega el motivo en revocar()', async () => {
    revocar.mockResolvedValue(undefined);

    const r = await revocarToken(7, 'rotación de credenciales');

    expect(autorConPermiso).toHaveBeenCalledWith('tokenServicio:administrar');
    expect(revocar).toHaveBeenCalledWith(7, 'rotación de credenciales');
    expect(r.ok).toBe(true);
  });

  it('sin el permiso, no revoca nada', async () => {
    autorConPermiso.mockRejectedValue(new Error('Tu rol no permite esta operación.'));

    const r = await revocarToken(7, 'rotación de credenciales');

    expect(r.ok).toBe(false);
    expect(revocar).not.toHaveBeenCalled();
  });
});
