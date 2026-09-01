/**
 * @jest-environment node
 */

// app/sgsi/acciones/__tests__/sesion.test.ts
//
// Este módulo es la compuerta de las 82 acciones de servidor del SIG y del SGSI: todas
// piden aquí su autor y su permiso antes de escribir. Hasta ahora no tenía ninguna prueba,
// y las 221 existentes cubren módulos puros que nunca tocan una sesión.
//
// Los casos que importan son los que DEJARÍAN ESCRIBIR a quien no debe. Una prueba del
// camino feliz habría pasado igual con la compuerta abierta.
//
// Primer archivo del repositorio que usa `jest.mock`. El patrón queda establecido acá:
// `server-only` no puede evaluarse fuera de un componente de servidor, y `@/app/lib/auth`
// arrastra Prisma y el proveedor de Azure AD, que no hacen falta para probar la decisión.

jest.mock('server-only', () => ({}));
jest.mock('@/app/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));

import { getServerSession } from 'next-auth';
import { GRUPOS } from '@/lib/sgsi/permisos';
import {
  autorActual,
  autorConPermiso,
  ejecutar,
  rolActual,
  SinPermisoError,
  SinSesionError,
  type Resultado,
} from '../sesion';

const sesion = getServerSession as unknown as jest.Mock;

/// `grupos` viaja en el token; `undefined` es una cuenta del tenant sin ningún grupo
/// reconocido, que es el piso Colaborador.
function conSesion(correo: string | null, grupos?: string[], nombre?: string) {
  sesion.mockResolvedValue({ user: { email: correo, name: nombre, grupos } });
}

beforeEach(() => {
  sesion.mockReset();
});

describe('autorActual', () => {
  it('sin sesión lanza en vez de inventar un autor', async () => {
    sesion.mockResolvedValue(null);
    await expect(autorActual()).rejects.toBeInstanceOf(SinSesionError);
  });

  it('devuelve el correo de la sesión', async () => {
    conSesion('ada@cuantico.com', [GRUPOS.seguridad]);
    await expect(autorActual()).resolves.toBe('ada@cuantico.com');
  });

  // Un token de Azure puede no traer `email`. Antes que perder la atribución, se usa el
  // nombre: una entrada de bitácora sin autor es peor que una con un autor menos preciso.
  it('cae al nombre cuando el token no trae correo', async () => {
    conSesion(null, [GRUPOS.seguridad], 'Ada Lovelace');
    await expect(autorActual()).resolves.toBe('Ada Lovelace');
  });

  it('una sesión sin correo ni nombre no es un autor', async () => {
    sesion.mockResolvedValue({ user: {} });
    await expect(autorActual()).rejects.toBeInstanceOf(SinSesionError);
  });
});

describe('rolActual', () => {
  it('sin sesión el piso es Colaborador, no un rol del SGSI', async () => {
    sesion.mockResolvedValue(null);
    const rol = await rolActual();
    expect(rol.grupos).toEqual([]);
    expect(rol.permisos.has('sgsi:ver')).toBe(false);
    expect(rol.permisos.has('misig:ver')).toBe(true);
  });

  it('deriva el rol del grupo del token', async () => {
    conSesion('ada@cuantico.com', ['Responsables SIG']);
    const rol = await rolActual();
    expect(rol.grupos).toEqual([GRUPOS.seguridad]);
    expect(rol.permisos.has('bitacora:ver')).toBe(true);
    expect(rol.permisos.has('sgsi:escribir')).toBe(true);
  });
});

describe('autorConPermiso', () => {
  // El caso que sostiene todo lo demás: una acción de servidor es alcanzable por cualquiera
  // que sepa formar la petición, sin pasar por ninguna pantalla.
  it('sin sesión rechaza antes de mirar el permiso', async () => {
    sesion.mockResolvedValue(null);
    await expect(autorConPermiso('sgsi:escribir')).rejects.toBeInstanceOf(SinSesionError);
  });

  it('con sesión pero sin el permiso, rechaza', async () => {
    conSesion('ada@cuantico.com', []);
    await expect(autorConPermiso('sgsi:escribir')).rejects.toBeInstanceOf(SinPermisoError);
  });

  it('un Colaborador no alcanza ninguna escritura del SGSI', async () => {
    conSesion('raso@cuantico.com', []);
    await expect(autorConPermiso('sgsi:escribir')).rejects.toBeInstanceOf(SinPermisoError);
    await expect(autorConPermiso('parametrizacion:escribir')).rejects.toBeInstanceOf(
      SinPermisoError,
    );
    await expect(autorConPermiso('personas:administrar')).rejects.toBeInstanceOf(SinPermisoError);
  });

  it('el mensaje nombra el permiso y dice de dónde viene el rol', async () => {
    conSesion('ada@cuantico.com', []);
    const error = await autorConPermiso('sgsi:escribir').catch((e) => e);
    expect(error.message).toContain('sgsi:escribir');
    expect(error.message).toContain('Directorio Activo');
  });

  it('con el permiso devuelve el autor a registrar', async () => {
    conSesion('lider@cuantico.com', ['Responsables SIG']);
    await expect(autorConPermiso('sgsi:escribir')).resolves.toBe('lider@cuantico.com');
  });

  // Los grupos intermedios se retiraron: quedan dos casos y nada en el medio. Una cuenta
  // que presente uno de ellos queda como Colaborador, no como un rol a medias.
  it('los grupos retirados no dejan escribir nada', async () => {
    for (const retirado of ['SIG-Propietarios', 'SIG-Auditoría']) {
      conSesion('duenio@cuantico.com', [retirado]);
      await expect(autorConPermiso('activo:valorar')).rejects.toBeInstanceOf(SinPermisoError);
      await expect(autorConPermiso('sgsi:ver')).rejects.toBeInstanceOf(SinPermisoError);
      await expect(autorConPermiso('parametrizacion:escribir')).rejects.toBeInstanceOf(
        SinPermisoError,
      );
    }
  });
});

describe('ejecutar', () => {
  it('convierte el rechazo por permiso en un mensaje que la pantalla puede mostrar', async () => {
    conSesion('ada@cuantico.com', []);
    const r = await ejecutar(async () => {
      await autorConPermiso('sgsi:escribir');
      return { ok: true, mensaje: 'guardado' };
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('sgsi:escribir');
  });

  it('no deja escapar un error inesperado como excepción', async () => {
    // `ejecutar` registra el error antes de convertirlo, y eso está bien: se silencia solo
    // aquí para que la salida de la corrida no parezca un fallo.
    const registro = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // Anotado a `Resultado`: un callback que sólo lanza se infiere como `Promise<never>`,
      // y entonces `T` es `never` y el resultado no tiene campos que leer.
      const r = await ejecutar<Resultado>(async () => {
        throw new Error('la base no respondió');
      });
      expect(r.ok).toBe(false);
      expect(r.mensaje).toBe('la base no respondió');
      expect(registro).toHaveBeenCalled();
    } finally {
      registro.mockRestore();
    }
  });

  it('devuelve intacto el resultado de una operación que sí corre', async () => {
    const r = await ejecutar(async () => ({ ok: true, mensaje: 'listo', cambios: 3 }));
    expect(r).toEqual({ ok: true, mensaje: 'listo', cambios: 3 });
  });
});
