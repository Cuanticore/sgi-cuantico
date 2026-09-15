/**
 * @jest-environment node
 */

// app/sgsi/acciones/__tests__/riesgos.test.ts
//
// REQ-SIG-20 §10 (D5, tarea 4.14) · `guardarSesionRiesgo` es la única excepción deliberada
// a D17 en este cambio: sin nota, CERO escrituras — ni de datos ni de `Bitacora`. Con nota,
// un cambio real de N campos produce EXACTAMENTE N filas de `Bitacora`, todas con la misma
// nota como `motivo`, en UNA `$transaction`, y la nota también queda en
// `Riesgo.justificacion`.
//
// Prisma se mockea por completo (mismo criterio que `envio-enlace-firma.test.ts`: cargarlo
// de verdad pediría una base). `server-only` se mockea porque `./sesion` lo importa —mismo
// patrón que `sesion.test.ts`, primer archivo del repositorio en usar `jest.mock`.

jest.mock('server-only', () => ({}));
jest.mock('@/app/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/sgsi/riesgos', () => ({
  generarRiesgos: jest.fn().mockResolvedValue({
    activosEnInventario: 0,
    activosEnAnalisis: 0,
    riesgosGenerados: 0,
    riesgosObsoletos: 0,
    amenazasSinControles: 0,
    residualSinCalcular: 0,
  }),
}));

const bitacoraCreateMany = jest.fn().mockResolvedValue({ count: 0 });
const riesgoDegradacionUpsert = jest.fn().mockResolvedValue({});
const riesgoDegradacionDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
const riesgoUpdateTx = jest.fn().mockResolvedValue({});

const tx = {
  bitacora: { createMany: bitacoraCreateMany },
  riesgoDegradacion: { upsert: riesgoDegradacionUpsert, deleteMany: riesgoDegradacionDeleteMany },
  riesgo: { update: riesgoUpdateTx },
};

jest.mock('@/lib/db', () => ({
  prisma: {
    activoValor: { findMany: jest.fn() },
    parametro: { findUnique: jest.fn() },
    riesgo: { findUnique: jest.fn(), update: jest.fn() },
    dimension: { findMany: jest.fn() },
    escalaDegradacion: { findUnique: jest.fn() },
    escalaFrecuencia: { findUnique: jest.fn() },
    escalaMadurez: { findUnique: jest.fn() },
    umbralRiesgo: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { GRUPOS } from '@/lib/sgsi/permisos';
import { guardarSesionRiesgo } from '../riesgos';

const sesion = getServerSession as unknown as jest.Mock;
const pRiesgoFindUnique = prisma.riesgo.findUnique as jest.Mock;
const pTransaction = prisma.$transaction as jest.Mock;
const pActivoValor = prisma.activoValor.findMany as jest.Mock;
const pParametro = prisma.parametro.findUnique as jest.Mock;
const pDimension = prisma.dimension.findMany as jest.Mock;
const pEscalaDegradacion = prisma.escalaDegradacion.findUnique as jest.Mock;
const pEscalaFrecuencia = prisma.escalaFrecuencia.findUnique as jest.Mock;
const pEscalaMadurez = prisma.escalaMadurez.findUnique as jest.Mock;
const pUmbralRiesgo = prisma.umbralRiesgo.findMany as jest.Mock;

const RIESGO_BASE = {
  id: 1,
  codigo: 'R-0123',
  activoId: 10,
  activo: { codigo: 'TEC-GEN-0004' },
  amenaza: {
    codigo: 'A.24',
    frecuencia: { nombre: 'Media — trimestral' },
    degradacion: [
      { dimension: { codigo: 'D' }, degradacion: { nombre: 'Alta' } },
      { dimension: { codigo: 'I' }, degradacion: { nombre: 'Media' } },
      { dimension: { codigo: 'C' }, degradacion: { nombre: 'Baja' } },
    ],
  },
  degradacion: [], // sin excepciones previas
  frecuencia: null, // hereda de la amenaza
  madurez: null, // sin excepción de madurez
};

function conSesionValida() {
  sesion.mockResolvedValue({ user: { email: 'ada@cuantico.com', grupos: [GRUPOS.seguridad] } });
}

/// Umbral 4, sin filas de valor: `activoEnAnalisis` da `false` si no hay D/I/C — así que
/// cada prueba que necesite pasar la guarda arma los tres valores explícitamente.
function conActivoEnAnalisis() {
  pActivoValor.mockResolvedValue([
    { dimension: { codigo: 'D' }, valor: { valor: 5 } },
    { dimension: { codigo: 'I' }, valor: { valor: 5 } },
    { dimension: { codigo: 'C' }, valor: { valor: 5 } },
  ]);
  pParametro.mockResolvedValue({ valor: '4' });
}

beforeEach(() => {
  jest.clearAllMocks();
  pTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  bitacoraCreateMany.mockResolvedValue({ count: 0 });
  riesgoDegradacionUpsert.mockResolvedValue({});
  riesgoDegradacionDeleteMany.mockResolvedValue({ count: 0 });
  riesgoUpdateTx.mockResolvedValue({});
});

describe('guardarSesionRiesgo — nota vacía: CERO escrituras (única excepción deliberada a D17)', () => {
  it('sin nota, rechaza y no toca Prisma en absoluto', async () => {
    conSesionValida();

    const r = await guardarSesionRiesgo('R-0123', { frecuenciaId: 99 }, '');

    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/obligatorias/);
    expect(pRiesgoFindUnique).not.toHaveBeenCalled();
    expect(pTransaction).not.toHaveBeenCalled();
    expect(bitacoraCreateMany).not.toHaveBeenCalled();
    expect(riesgoUpdateTx).not.toHaveBeenCalled();
  });

  it('una nota de solo espacios cuenta como vacía: mismo rechazo, cero escrituras', async () => {
    conSesionValida();
    const r = await guardarSesionRiesgo('R-0123', { frecuenciaId: 99 }, '   ');
    expect(r.ok).toBe(false);
    expect(pTransaction).not.toHaveBeenCalled();
  });
});

describe('guardarSesionRiesgo — un cambio real de 3 campos produce exactamente 3 filas de Bitacora', () => {
  it('degradación D + frecuencia + madurez cambian → 3 entradas, 1 transacción, misma nota', async () => {
    conSesionValida();
    conActivoEnAnalisis();
    pRiesgoFindUnique
      .mockResolvedValueOnce(RIESGO_BASE) // lectura inicial
      .mockResolvedValueOnce({ riesgoResidual: { toString: () => '10' } }); // post-regen
    pDimension.mockResolvedValue([
      { codigo: 'D', id: 100 },
      { codigo: 'I', id: 101 },
      { codigo: 'C', id: 102 },
    ]);
    pEscalaDegradacion.mockResolvedValue({ id: 5, nombre: 'Muy alta' });
    pEscalaFrecuencia.mockResolvedValue({ id: 7, nombre: 'Alta — mensual' });
    pEscalaMadurez.mockResolvedValue({ id: 2, nivel: 2, nombre: 'Repetible' });
    pUmbralRiesgo.mockResolvedValue([{ nombre: 'Bajo', desde: '0', hasta: '100000' }]);

    const r = await guardarSesionRiesgo(
      'R-0123',
      { degradacion: { D: 5 }, frecuenciaId: 7, madurezId: 2 },
      'ajuste tras revisión de servidores',
    );

    expect(r.ok).toBe(true);
    expect(r.cambios).toBe(3);

    expect(pTransaction).toHaveBeenCalledTimes(1);
    expect(bitacoraCreateMany).toHaveBeenCalledTimes(1);
    const filas = bitacoraCreateMany.mock.calls[0][0].data as { motivo: string; campo: string }[];
    expect(filas).toHaveLength(3);
    // Las tres comparten la MISMA nota como motivo.
    for (const f of filas) expect(f.motivo).toBe('ajuste tras revisión de servidores');
    expect(filas.map((f) => f.campo).sort()).toEqual(
      ['degradación en D (excepción)', 'frecuencia (excepción)', 'madurez del riesgo (excepción)'].sort(),
    );

    // La degradación de D se escribe vía upsert; I y C no se tocan porque no estaban en el borrador.
    expect(riesgoDegradacionUpsert).toHaveBeenCalledTimes(1);
    expect(riesgoDegradacionUpsert.mock.calls[0][0]).toMatchObject({
      update: { degradacionId: 5, justificacion: 'ajuste tras revisión de servidores' },
    });

    // La nota también queda en Riesgo.justificacion, y frecuencia/madurez se actualizan.
    expect(riesgoUpdateTx).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        frecuenciaId: 7,
        madurezId: 2,
        justificacion: 'ajuste tras revisión de servidores',
      },
    });
  });

  it('sin ningún cambio real (borrador vacío) no escribe nada y no llama a generarRiesgos', async () => {
    conSesionValida();
    conActivoEnAnalisis();
    pRiesgoFindUnique.mockResolvedValueOnce(RIESGO_BASE);

    const r = await guardarSesionRiesgo('R-0123', {}, 'una nota que no cambia nada');

    expect(r.ok).toBe(true);
    expect(r.cambios).toBe(0);
    expect(bitacoraCreateMany).not.toHaveBeenCalled();
    expect(riesgoUpdateTx).not.toHaveBeenCalled();

    const { generarRiesgos } = jest.requireMock('@/lib/sgsi/riesgos') as { generarRiesgos: jest.Mock };
    expect(generarRiesgos).not.toHaveBeenCalled();
  });

  it('el activo fuera de análisis rechaza sin escribir (D-2, mismo guard que excepcionFrecuencia)', async () => {
    conSesionValida();
    pActivoValor.mockResolvedValue([
      { dimension: { codigo: 'D' }, valor: { valor: 2 } },
      { dimension: { codigo: 'I' }, valor: { valor: 2 } },
      { dimension: { codigo: 'C' }, valor: { valor: 2 } },
    ]);
    pParametro.mockResolvedValue({ valor: '4' });
    pRiesgoFindUnique.mockResolvedValueOnce(RIESGO_BASE);

    const r = await guardarSesionRiesgo('R-0123', { frecuenciaId: 7 }, 'nota');

    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/fuera del análisis/);
    expect(pTransaction).not.toHaveBeenCalled();
  });
});

describe('guardarSesionRiesgo — el residual crítico dispara el prellenado del popup (tarea 4.16)', () => {
  it('residual en banda Crítico tras el recálculo → responde con critico {activoCodigo, amenazaCodigo}', async () => {
    conSesionValida();
    conActivoEnAnalisis();
    pRiesgoFindUnique
      .mockResolvedValueOnce(RIESGO_BASE)
      .mockResolvedValueOnce({ riesgoResidual: { toString: () => '30' } });
    pEscalaFrecuencia.mockResolvedValue({ id: 7, nombre: 'Alta — mensual' });
    pUmbralRiesgo.mockResolvedValue([
      { nombre: 'Crítico', desde: '25', hasta: '100000' },
      { nombre: 'Bajo', desde: '0', hasta: '24.999' },
    ]);

    const r = await guardarSesionRiesgo('R-0123', { frecuenciaId: 7 }, 'sube la frecuencia');

    expect(r.ok).toBe(true);
    expect(r.critico).toEqual({ activoCodigo: 'TEC-GEN-0004', amenazaCodigo: 'A.24' });
  });

  it('residual fuera de Crítico tras el recálculo → sin critico, el guardado igual tuvo éxito', async () => {
    conSesionValida();
    conActivoEnAnalisis();
    pRiesgoFindUnique
      .mockResolvedValueOnce(RIESGO_BASE)
      .mockResolvedValueOnce({ riesgoResidual: { toString: () => '10' } });
    pEscalaFrecuencia.mockResolvedValue({ id: 7, nombre: 'Alta — mensual' });
    pUmbralRiesgo.mockResolvedValue([
      { nombre: 'Crítico', desde: '25', hasta: '100000' },
      { nombre: 'Bajo', desde: '0', hasta: '24.999' },
    ]);

    const r = await guardarSesionRiesgo('R-0123', { frecuenciaId: 7 }, 'baja la frecuencia');

    expect(r.ok).toBe(true);
    expect(r.critico).toBeUndefined();
  });
});
