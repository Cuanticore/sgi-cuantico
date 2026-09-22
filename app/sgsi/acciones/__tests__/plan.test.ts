/**
 * @jest-environment node
 */

// app/sgsi/acciones/__tests__/plan.test.ts
//
// `crearAccionLibre` · la cuarta vía de creación de un PT, y la única que no cuelga de nada.
//
// Los otros tres caminos nacen colgados: `crearAccionDesdeControl` de un control con brecha,
// `registrarPlanCritico` de un riesgo residual, `registrarPlanesActivo` de las amenazas de un
// activo. «Adquirir una póliza de ciberriesgo» no cuelga de ninguno, y hasta ahora la única
// forma de registrarla era importar un FOR-SIG-13 o escribir en la base a mano.
//
// LO QUE ESTAS PRUEBAS VIGILAN NO ES QUE CREE UNA FILA. Es que la cuarta vía no se convierta
// en una puerta lateral: que aplique las MISMAS reglas de 6.1.3 que `guardarAccion` —con el
// mismo texto, porque las dos invocan la misma función—, que numere igual sin reutilizar un
// PT dado de baja, y que nazca sin seguimiento diga lo que diga el formulario.
//
// Prisma se mockea por completo, mismo criterio que `riesgos.test.ts`: cargarlo de verdad
// pediría una base. `server-only` se mockea porque `./sesion` y `lib/sgsi/bitacora` lo importan.

jest.mock('server-only', () => ({}));
jest.mock('@/app/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

const accionPlanFindManyTx = jest.fn();
const accionPlanCreateTx = jest.fn().mockResolvedValue({});
const bitacoraCreateTx = jest.fn().mockResolvedValue({});
const bitacoraCreateManyTx = jest.fn().mockResolvedValue({ count: 1 });

const tx = {
  accionPlan: { findMany: accionPlanFindManyTx, create: accionPlanCreateTx },
  bitacora: { create: bitacoraCreateTx, createMany: bitacoraCreateManyTx },
};

jest.mock('@/lib/db', () => ({
  prisma: {
    accionPlan: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    control: { findUnique: jest.fn() },
    cargoResponsable: { findUnique: jest.fn() },
    escalaMadurez: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/db';
import { GRUPOS } from '@/lib/sgsi/permisos';
import { crearAccionLibre, guardarAccion, type DatosAccion } from '../plan';

const sesion = getServerSession as unknown as jest.Mock;
const pTransaction = prisma.$transaction as jest.Mock;
const pControl = prisma.control.findUnique as jest.Mock;
const pCargo = prisma.cargoResponsable.findUnique as jest.Mock;
const pMadurez = prisma.escalaMadurez.findUnique as jest.Mock;
const pAccionFindUnique = prisma.accionPlan.findUnique as jest.Mock;

/// Lo mínimo que una acción libre necesita para ser válida: `TRANSFERIR` con su instrumento y
/// su riesgo remanente, sin control. Es el caso «póliza cyber».
const POLIZA: DatosAccion = {
  accion: 'Adquirir póliza de ciberriesgo para el ejercicio 2027',
  tipo: 'TRANSFERIR',
  controlId: null,
  origen: 'Decisión del Comité del SIG del 12/03: el riesgo agregado excede el apetito.',
  responsableId: 3,
  apruebaId: 5,
  fechaObjetivo: '2027-06-30',
  instrumento: 'Póliza de ciberriesgo, aseguradora por definir',
  riesgoRemanente: 'El deducible y la indisponibilidad durante el siniestro',
};

function conSesionValida() {
  sesion.mockResolvedValue({ user: { email: 'ada@cuantico.com', grupos: [GRUPOS.seguridad] } });
}

/// Los códigos que la transacción ve. Incluye los dados de baja a propósito: la lectura no
/// filtra por `activa`, y ahí está la garantía de que un PT no se reutiliza.
function conCodigos(...codigos: string[]) {
  accionPlanFindManyTx.mockResolvedValue(codigos.map((codigo) => ({ codigo })));
}

/// Lo que crearía la fila: la creación sólo devuelve el código.
function filaCreada(): Record<string, unknown> {
  return accionPlanCreateTx.mock.calls[0][0].data as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  pTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
  accionPlanCreateTx.mockResolvedValue({});
  bitacoraCreateTx.mockResolvedValue({});
  bitacoraCreateManyTx.mockResolvedValue({ count: 1 });
  conCodigos('PT-001', 'PT-019', 'PT-020');
  pCargo.mockImplementation(({ where }: { where: { id: number } }) =>
    Promise.resolve({ id: where.id, nombre: `Cargo ${where.id}` }),
  );
  pControl.mockResolvedValue({ id: 7, codigo: 'A.8.2', nombre: 'Acceso privilegiado' });
  pMadurez.mockResolvedValue({ id: 30, nivel: 90, nombre: 'Definido' });
});

describe('crearAccionLibre — el código sigue contando, no rellena huecos', () => {
  it('toma el siguiente PT y no reutiliza el de una acción dada de baja', async () => {
    conSesionValida();
    // PT-020 está dado de baja: sigue ocupando su número, así que el nuevo es PT-021 y no
    // PT-020 ni PT-002 (el hueco que dejó la numeración entre PT-001 y PT-019).
    const r = await crearAccionLibre(POLIZA);

    expect(r.ok).toBe(true);
    expect(r.codigo).toBe('PT-021');
    expect(filaCreada().codigo).toBe('PT-021');
    // Los códigos se leen DENTRO de la transacción: leerlos fuera dejaría una ventana en la
    // que dos creaciones simultáneas eligen el mismo número.
    expect(accionPlanFindManyTx).toHaveBeenCalledTimes(1);
    expect(pTransaction).toHaveBeenCalledTimes(1);
  });

  it('deja el alta y el asiento de origen en la bitácora', async () => {
    conSesionValida();
    await crearAccionLibre(POLIZA, 'lo pidió el Comité del SIG');

    expect(bitacoraCreateTx).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ campo: 'alta', registroId: 'PT-021' }),
      }),
    );
    const asientos = bitacoraCreateManyTx.mock.calls[0][0].data as {
      campo: string;
      valorNuevo: string;
      motivo: string;
    }[];
    expect(asientos).toHaveLength(1);
    expect(asientos[0].campo).toBe('origen');
    expect(asientos[0].valorNuevo).toBe(POLIZA.origen);
    expect(asientos[0].motivo).toBe('lo pidió el Comité del SIG');
  });
});

describe('crearAccionLibre — las mismas reglas de 6.1.3 que la edición, no unas propias', () => {
  it('MITIGAR sin control se rechaza, y con el MISMO mensaje que guardarAccion', async () => {
    conSesionValida();

    const libre = await crearAccionLibre({
      ...POLIZA,
      tipo: 'MITIGAR',
      controlId: null,
      instrumento: null,
      riesgoRemanente: null,
    });

    // La misma negativa desde el otro camino. Si un día las dos dejaran de compartir la
    // función que valida, esta comparación es lo que lo muestra.
    pAccionFindUnique.mockResolvedValue({
      id: 1,
      codigo: 'PT-013',
      accion: 'Una acción que ya existe',
      tipo: 'TRANSFERIR',
      controlId: 7,
      origen: 'Un origen cualquiera',
      responsableId: 3,
      apruebaId: 5,
      fechaObjetivo: null,
      recursos: null,
      estado: 'NO_INICIADA',
      avance: 0,
      verificacion: 'PENDIENTE',
      observacion: null,
      madurezAlcanzadaId: null,
      instrumento: 'Una póliza',
      riesgoRemanente: 'El deducible',
      justificacionAceptacion: null,
      fechaRevisionAceptacion: null,
      control: { id: 7, codigo: 'A.8.2' },
      responsable: { id: 3, nombre: 'Gestión Tecnológica' },
      aprueba: { id: 5, nombre: 'Líder del SIG' },
      madurezAlcanzada: null,
    });
    const editada = await guardarAccion('PT-013', { tipo: 'MITIGAR', controlId: null });

    expect(libre.ok).toBe(false);
    expect(editada.ok).toBe(false);
    expect(libre.mensaje).toBe('Una acción de mitigación necesita el control que mejora.');
    expect(editada.mensaje).toBe(libre.mensaje);
    expect(accionPlanCreateTx).not.toHaveBeenCalled();
  });

  it('TRANSFERIR sin control, con instrumento y remanente, se acepta — el caso póliza cyber', async () => {
    conSesionValida();
    const r = await crearAccionLibre(POLIZA);

    expect(r.ok).toBe(true);
    expect(filaCreada()).toMatchObject({
      tipo: 'TRANSFERIR',
      controlId: null,
      instrumento: 'Póliza de ciberriesgo, aseguradora por definir',
      riesgoRemanente: 'El deducible y la indisponibilidad durante el siniestro',
    });
  });

  it('sin origen se rechaza: es la justificación que pide 6.1.3', async () => {
    conSesionValida();
    const r = await crearAccionLibre({ ...POLIZA, origen: '   ' });

    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('El origen necesita texto');
    expect(accionPlanCreateTx).not.toHaveBeenCalled();
  });
});

describe('crearAccionLibre — nace sin seguimiento, diga lo que diga el formulario', () => {
  it('estado NO_INICIADA, avance 0 y verificación PENDIENTE aunque los datos pidan otra cosa', async () => {
    conSesionValida();
    // El popup de creación no ofrece estos campos, pero una acción de servidor es alcanzable
    // por cualquiera que sepa formar la petición: nacer «Cerrada al 100 % y verificada» sin
    // que nada haya ocurrido es precisamente lo que no puede poder hacerse.
    const r = await crearAccionLibre({
      ...POLIZA,
      estado: 'CERRADA',
      avance: 100,
      verificacion: 'VERIFICADA_EFICAZ',
    });

    expect(r.ok).toBe(true);
    expect(filaCreada()).toMatchObject({
      estado: 'NO_INICIADA',
      avance: 0,
      verificacion: 'PENDIENTE',
    });
  });
});
