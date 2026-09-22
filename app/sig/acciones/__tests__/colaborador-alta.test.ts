/**
 * @jest-environment node
 */

// app/sig/acciones/__tests__/colaborador-alta.test.ts
//
// EL ALTA SE EJERCE POR EL CAMINO DEL SERVIDOR, NO POR EL DEL FORMULARIO.
//
// `colaborador-alta.ts` abre con `'use server'`, así que **cada export es un punto de entrada
// invocable desde el navegador** con la carga que sea — es la misma propiedad que su propio
// encabezado documenta como cicatriz, la del `export const` que tumbó un despliegue. El
// `<input type="date">` de la pantalla acota lo que la persona teclea; no acota lo que llega
// acá.
//
// Por eso estas pruebas llaman a `crearColaborador` directamente con lo que un cliente puede
// mandar, y no simulan el formulario: simular el formulario probaría la única ruta que ya
// estaba protegida.
//
// Prisma se mockea por completo, mismo criterio que `app/sgsi/acciones/__tests__/riesgos.test.ts`.

jest.mock('server-only', () => ({}));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/sgsi/bitacora', () => ({ registrarAlta: jest.fn().mockResolvedValue(undefined) }));

const personaFindUnique = jest.fn();
const personaCreate = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    persona: {
      findUnique: (...a: unknown[]) => personaFindUnique(...a),
      create: (...a: unknown[]) => personaCreate(...a),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        persona: { create: (...a: unknown[]) => personaCreate(...a) },
        bitacora: { create: jest.fn() },
      }),
  },
}));

jest.mock('@/app/sgsi/acciones/sesion', () => ({
  autorConPermiso: jest.fn().mockResolvedValue('daniel.medina@cuantico.com'),
  ejecutar: async (op: () => Promise<unknown>) => {
    try {
      return await op();
    } catch (e) {
      return { ok: false, mensaje: e instanceof Error ? e.message : 'falló' };
    }
  },
}));

import { crearColaborador } from '../colaborador-alta';

const BASE = { nombre: 'Ana María Restrepo', correo: 'ana.restrepo@cuantico.com' };

beforeEach(() => {
  jest.clearAllMocks();
  personaFindUnique.mockResolvedValue(null);
  personaCreate.mockResolvedValue({ id: 7 });
});

describe('la fecha de ingreso se valida en el servidor', () => {
  // Hoy `new Date('no-es-fechaT00:00:00.000Z')` produce un `Invalid Date` que viaja hasta
  // Prisma. `ejecutar` atrapa lo que Prisma tire y devuelve su mensaje, así que la persona ve
  // un error de la librería en vez de uno que diga qué pasó — y `console.error('[sgsi] la
  // acción falló')` ensucia el registro que existe «para que el log siga sirviendo para
  // encontrar lo que sí falló».
  it('una fecha que no es fecha se rechaza con un mensaje, y no llega a la base', async () => {
    const r = await crearColaborador({ ...BASE, fechaIngreso: 'no-es-fecha' });

    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/fecha de ingreso/i);
    expect(personaCreate).not.toHaveBeenCalled();
  });

  // El año transpuesto es el error de tecleo real: 2062 por 2026. No revienta nada —es una
  // fecha válida— y se propaga: `fechaIngreso` alimenta `areaDesde` y `cargoDesde` en el
  // cálculo de la edición.
  it('un año imposible se rechaza igual que una cadena rota', async () => {
    const r = await crearColaborador({ ...BASE, fechaIngreso: '2062-09-21' });

    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/fecha de ingreso/i);
    expect(personaCreate).not.toHaveBeenCalled();
  });

  it('sin fecha de ingreso el alta sigue siendo válida: es un campo opcional', async () => {
    const r = await crearColaborador({ ...BASE, fechaIngreso: null });

    expect(r.ok).toBe(true);
    expect(personaCreate).toHaveBeenCalled();
  });

  it('una fecha buena se guarda como el día UTC', async () => {
    const r = await crearColaborador({ ...BASE, fechaIngreso: '2026-10-01' });

    expect(r.ok).toBe(true);
    const datos = personaCreate.mock.calls[0][0].data;
    expect((datos.fechaIngreso as Date).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
