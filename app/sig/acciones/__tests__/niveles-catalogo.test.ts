/**
 * @jest-environment node
 */

// app/sig/acciones/__tests__/niveles-catalogo.test.ts
//
// EL CATÁLOGO DE NIVEL 3 SE AMPLÍA POR UN SOLO SITIO, Y ES ÉSTE.
//
// `catalogo_nivel_3` existe para que el vocabulario del árbol sea una decisión y no el residuo de
// lo que cada rama haya ido acumulando. Eso se sostiene sólo si hay exactamente un camino para
// ampliarlo, y ese camino pide `tecnologia:administrar` y deja bitácora.
//
// De ahí las dos mitades que este archivo ejerce:
//
//   - `crearNivel` de grado 3 con un nombre que el catálogo no tiene **lo agrega**, en la misma
//     transacción. Sin esto, nadie podría ampliar el vocabulario nunca y el catálogo pasaría de
//     ser una decisión a ser una jaula.
//   - Y lo agrega **a la clase de su raíz**, derivada subiendo por `padreId`. Los grados 2 y 3 no
//     guardan clase; leerla de ahí sería leerla de donde no está.
//
// Prisma se mockea por completo, mismo criterio que `colaborador-alta.test.ts` y
// `app/sgsi/acciones/__tests__/riesgos.test.ts`.

jest.mock('server-only', () => ({}));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/sgsi/bitacora', () => ({
  registrar: jest.fn().mockResolvedValue(undefined),
  registrarAlta: jest.fn().mockResolvedValue(undefined),
}));

const nivelFindMany = jest.fn();
const nivelCreate = jest.fn();
const catalogoFindMany = jest.fn();
const catalogoCreate = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    nivelActivo: { findMany: (...a: unknown[]) => nivelFindMany(...a) },
    catalogoNivel3: { findMany: (...a: unknown[]) => catalogoFindMany(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        nivelActivo: { create: (...a: unknown[]) => nivelCreate(...a) },
        catalogoNivel3: { create: (...a: unknown[]) => catalogoCreate(...a) },
        bitacora: { create: jest.fn() },
      }),
  },
}));

jest.mock('@/app/sgsi/acciones/sesion', () => ({
  autorConPermiso: jest.fn().mockResolvedValue('daniel.medina@cuantico.com'),
  exigirId: jest.fn(),
  ejecutar: async (op: () => Promise<unknown>) => {
    try {
      return await op();
    } catch (e) {
      return { ok: false, mensaje: e instanceof Error ? e.message : 'falló' };
    }
  },
}));

import { crearNivel } from '../niveles';

/// PROYECTOS / INC, la rama del caso real: sin código fuente todavía.
const ARBOL = [
  { id: 3, grado: 1, nombre: 'PROYECTOS', padreId: null, clase: 'PROYECTOS', activo: true },
  { id: 135, grado: 2, nombre: 'INC', padreId: 3, clase: null, activo: true },
  { id: 136, grado: 3, nombre: 'DOCUMENTACIÓN PRIVADA', padreId: 135, clase: null, activo: true },
];

const CATALOGO = [
  { id: 1, clase: 'PROYECTOS', nombre: 'DOCUMENTACIÓN PRIVADA', orden: 1, activo: true },
  { id: 2, clase: 'PROYECTOS', nombre: 'CÓDIGO FUENTE', orden: 2, activo: true },
];

beforeEach(() => {
  jest.clearAllMocks();
  nivelFindMany.mockResolvedValue(ARBOL);
  catalogoFindMany.mockResolvedValue(CATALOGO);
  nivelCreate.mockResolvedValue({ id: 500 });
  catalogoCreate.mockResolvedValue({ id: 9 });
});

describe('crearNivel de grado 3 y el catálogo', () => {
  it('un nombre que el catálogo NO tiene se agrega al catálogo, con la clase de su raíz', async () => {
    const r = await crearNivel({ grado: 3, nombre: 'Soporte y servicio', padreId: 135 });

    expect(r.ok).toBe(true);
    expect(catalogoCreate).toHaveBeenCalledTimes(1);
    expect(catalogoCreate.mock.calls[0][0]).toMatchObject({
      data: expect.objectContaining({
        // Normalizado con la misma regla que el nivel, no con una copia.
        nombre: 'SOPORTE Y SERVICIO',
        // PROYECTOS sale de la RAÍZ (#3), no de INC (#135), que no guarda clase.
        clase: 'PROYECTOS',
      }),
    });
  });

  it('un nombre que el catálogo YA tiene no se duplica', async () => {
    const r = await crearNivel({ grado: 3, nombre: 'CÓDIGO FUENTE', padreId: 135 });

    expect(r.ok).toBe(true);
    expect(nivelCreate).toHaveBeenCalledTimes(1);
    expect(catalogoCreate).not.toHaveBeenCalled();
  });

  it('compara con el catálogo por nombre NORMALIZADO', async () => {
    // El catálogo dice «CÓDIGO FUENTE»; llega «código fuente». Es el mismo nombre, y agregarlo
    // otra vez dejaría el vocabulario con dos entradas para una sola cosa — el defecto que este
    // catálogo existe para impedir.
    await crearNivel({ grado: 3, nombre: '  código fuente  ', padreId: 135 });

    expect(catalogoCreate).not.toHaveBeenCalled();
  });

  it('un nivel de grado 2 no toca el catálogo', async () => {
    // El catálogo es del grado 3. Los nombres de grado 2 son productos y áreas: no son
    // vocabulario compartido, son entidades con nombre propio.
    await crearNivel({ grado: 2, nombre: 'PRODUCTO NUEVO', padreId: 3 });

    expect(catalogoCreate).not.toHaveBeenCalled();
  });

  it('una rama sin clase alcanzable crea el nivel y NO inventa una entrada de catálogo', async () => {
    // El padre #900 cuelga de un id que no existe, así que `claseDeNivel` devuelve null. Meterlo
    // en PRODUCTOS «porque suele ser ése» contaminaría el vocabulario con una adivinanza.
    nivelFindMany.mockResolvedValue([
      ...ARBOL,
      { id: 900, grado: 2, nombre: 'HUÉRFANO', padreId: 999, clase: null, activo: true },
    ]);

    const r = await crearNivel({ grado: 3, nombre: 'ALGO NUEVO', padreId: 900 });

    expect(r.ok).toBe(true);
    expect(nivelCreate).toHaveBeenCalledTimes(1);
    expect(catalogoCreate).not.toHaveBeenCalled();
  });
});
