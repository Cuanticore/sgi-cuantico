/**
 * @jest-environment node
 */

// app/sig/acciones/__tests__/desarrollo.test.ts
//
// `actualizarSistema` es la primera acción de actualización de la hoja de vida: hasta acá
// sólo existía `crearSistema`. `registrarPuerta` gana `evidenciaId` — una columna que
// existe desde la migración de septiembre y que ningún código escribía.
//
// Prisma se mockea por completo, mismo criterio que `colaborador-alta.test.ts`.

jest.mock('server-only', () => ({}));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

const registrar = jest.fn().mockResolvedValue(1);
const registrarAlta = jest.fn().mockResolvedValue(undefined);
const registrarBaja = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/sgsi/bitacora', () => ({
  registrar: (...a: unknown[]) => registrar(...a),
  registrarAlta: (...a: unknown[]) => registrarAlta(...a),
  registrarBaja: (...a: unknown[]) => registrarBaja(...a),
}));

const escalaValorFindMany = jest.fn();
const sistemaFindUnique = jest.fn();
const sistemaUpdate = jest.fn();
const puertaSistemaFindUnique = jest.fn();
const puertaSistemaUpdate = jest.fn();
const evidenciaFindUnique = jest.fn();
const puertaSistemaFindFirst = jest.fn();
const pruebaSeguridadFindFirst = jest.fn();
const requisitoFindUnique = jest.fn();
const requisitoCreate = jest.fn();
const requisitoUpdate = jest.fn();
const pruebaCreate = jest.fn();
const liberacionFindUnique = jest.fn();
const liberacionCreate = jest.fn();
const componenteFindUnique = jest.fn();
const componenteCreate = jest.fn();
const tratamientoFindUnique = jest.fn();
const tratamientoCreate = jest.fn();

const tx = {
  sistema: { update: (...a: unknown[]) => sistemaUpdate(...a) },
  puertaSistema: { update: (...a: unknown[]) => puertaSistemaUpdate(...a) },
  requisitoSeguridad: {
    create: (...a: unknown[]) => requisitoCreate(...a),
    update: (...a: unknown[]) => requisitoUpdate(...a),
  },
  pruebaSeguridad: { create: (...a: unknown[]) => pruebaCreate(...a) },
  liberacion: { create: (...a: unknown[]) => liberacionCreate(...a) },
  componenteTercero: { create: (...a: unknown[]) => componenteCreate(...a) },
  tratamientoDatosPersonales: { create: (...a: unknown[]) => tratamientoCreate(...a) },
  bitacora: { create: jest.fn(), createMany: jest.fn() },
};

jest.mock('@/lib/db', () => ({
  prisma: {
    escalaValor: { findMany: (...a: unknown[]) => escalaValorFindMany(...a) },
    sistema: {
      findUnique: (...a: unknown[]) => sistemaFindUnique(...a),
      update: (...a: unknown[]) => sistemaUpdate(...a),
    },
    puertaSistema: {
      findUnique: (...a: unknown[]) => puertaSistemaFindUnique(...a),
      findFirst: (...a: unknown[]) => puertaSistemaFindFirst(...a),
      update: (...a: unknown[]) => puertaSistemaUpdate(...a),
    },
    evidencia: { findUnique: (...a: unknown[]) => evidenciaFindUnique(...a) },
    requisitoSeguridad: {
      findUnique: (...a: unknown[]) => requisitoFindUnique(...a),
      create: (...a: unknown[]) => requisitoCreate(...a),
      update: (...a: unknown[]) => requisitoUpdate(...a),
    },
    pruebaSeguridad: {
      findFirst: (...a: unknown[]) => pruebaSeguridadFindFirst(...a),
      create: (...a: unknown[]) => pruebaCreate(...a),
    },
    liberacion: {
      findUnique: (...a: unknown[]) => liberacionFindUnique(...a),
      create: (...a: unknown[]) => liberacionCreate(...a),
    },
    componenteTercero: {
      findUnique: (...a: unknown[]) => componenteFindUnique(...a),
      create: (...a: unknown[]) => componenteCreate(...a),
    },
    tratamientoDatosPersonales: {
      findUnique: (...a: unknown[]) => tratamientoFindUnique(...a),
      create: (...a: unknown[]) => tratamientoCreate(...a),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  },
}));

jest.mock('@/app/sgsi/acciones/sesion', () => {
  const real = jest.requireActual('@/app/sgsi/acciones/sesion');
  return {
    ...real,
    autorConPermiso: jest.fn().mockResolvedValue('daniel.medina@cuantico.com'),
  };
});

import {
  actualizarSistema,
  crearComponente,
  crearLiberacion,
  crearPrueba,
  crearRequisito,
  darDeBajaRequisito,
  editarRequisito,
  registrarPuerta,
  registrarTratamiento,
} from '../desarrollo';

const ESCALA = [0, 1, 2, 3, 4, 5].map((valor) => ({ valor }));

beforeEach(() => {
  jest.clearAllMocks();
  escalaValorFindMany.mockResolvedValue(ESCALA);
  sistemaFindUnique.mockResolvedValue({
    id: 1,
    codigo: 'SIS-001',
    criticidad: null,
    clasificacionId: null,
    rtoObjetivo: null,
    rpoObjetivo: null,
    rolTratamiento: null,
    trataDatosPersonales: false,
  });
  sistemaUpdate.mockResolvedValue({});
  puertaSistemaFindFirst.mockResolvedValue(null);
  pruebaSeguridadFindFirst.mockResolvedValue(null);
  requisitoFindUnique.mockResolvedValue(null);
  requisitoCreate.mockResolvedValue({ id: 1 });
  requisitoUpdate.mockResolvedValue({ id: 1 });
  pruebaCreate.mockResolvedValue({ id: 1 });
  liberacionFindUnique.mockResolvedValue(null);
  liberacionCreate.mockResolvedValue({ id: 1 });
  componenteFindUnique.mockResolvedValue(null);
  componenteCreate.mockResolvedValue({ id: 1 });
  tratamientoFindUnique.mockResolvedValue(null);
  tratamientoCreate.mockResolvedValue({ id: 1 });
});

describe('actualizarSistema', () => {
  it('criticidad fuera de la escala del SGSI falla nombrando el valor, y no guarda', async () => {
    const r = await actualizarSistema(1, { criticidad: 9 });

    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('9');
    expect(sistemaUpdate).not.toHaveBeenCalled();
  });

  it('RTO negativo falla y no guarda', async () => {
    const r = await actualizarSistema(1, { rtoObjetivo: -5 });

    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/RTO/);
    expect(sistemaUpdate).not.toHaveBeenCalled();
  });

  it('RPO negativo falla y no guarda', async () => {
    const r = await actualizarSistema(1, { rpoObjetivo: -1 });

    expect(r.ok).toBe(false);
    expect(sistemaUpdate).not.toHaveBeenCalled();
  });

  it('guarda criticidad, clasificación, RTO, RPO y rol de tratamiento', async () => {
    const r = await actualizarSistema(1, {
      criticidad: 4,
      clasificacionId: 2,
      rtoObjetivo: 240,
      rpoObjetivo: 60,
      rolTratamiento: 'RESPONSABLE',
    });

    expect(r.ok).toBe(true);
    expect(sistemaUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        criticidad: 4,
        clasificacionId: 2,
        rtoObjetivo: 240,
        rpoObjetivo: 60,
        rolTratamiento: 'RESPONSABLE',
      },
    });
    expect(registrar).toHaveBeenCalled();
  });

  it('el sistema inexistente se rechaza', async () => {
    sistemaFindUnique.mockResolvedValue(null);
    const r = await actualizarSistema(999, { criticidad: 3 });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/no existe/i);
  });

  it('sin campos para cambiar no llama al update y lo dice', async () => {
    const r = await actualizarSistema(1, {});
    expect(r.ok).toBe(true);
    expect(r.mensaje).toMatch(/no había cambios/i);
  });
});

describe('registrarPuerta — evidenciaId deja de ser columna muerta', () => {
  const base = {
    id: 10,
    sistemaId: 1,
    puerta: 'P2' as const,
    resultado: 'PENDIENTE' as const,
    sistema: { codigo: 'SIS-001' },
  };

  beforeEach(() => {
    puertaSistemaFindUnique.mockResolvedValue(base);
    evidenciaFindUnique.mockResolvedValue({ id: 50 });
  });

  it('persiste evidenciaId cuando la evidencia no está citada por otro sistema', async () => {
    const r = await registrarPuerta(1, 'P2', {
      resultado: 'SUPERADA',
      verificadoPorId: 5,
      autorizaId: 6,
      evidenciaId: 50,
    });

    expect(r.ok).toBe(true);
    expect(puertaSistemaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ evidenciaId: 50 }) }),
    );
  });

  it('rechaza una evidencia que ya pertenece a la puerta de otro sistema', async () => {
    puertaSistemaFindFirst.mockResolvedValue({
      id: 99,
      sistemaId: 2,
      sistema: { codigo: 'SIS-002' },
    });

    const r = await registrarPuerta(1, 'P2', {
      resultado: 'SUPERADA',
      verificadoPorId: 5,
      autorizaId: 6,
      evidenciaId: 50,
    });

    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('SIS-002');
    expect(puertaSistemaUpdate).not.toHaveBeenCalled();
  });

  it('rechaza una evidencia que no existe', async () => {
    evidenciaFindUnique.mockResolvedValue(null);

    const r = await registrarPuerta(1, 'P2', {
      resultado: 'SUPERADA',
      verificadoPorId: 5,
      autorizaId: 6,
      evidenciaId: 999,
    });

    expect(r.ok).toBe(false);
    expect(puertaSistemaUpdate).not.toHaveBeenCalled();
  });

  it('sin evidenciaId sigue funcionando como antes', async () => {
    const r = await registrarPuerta(1, 'P2', {
      resultado: 'SUPERADA',
      verificadoPorId: 5,
      autorizaId: 6,
    });

    expect(r.ok).toBe(true);
    expect(evidenciaFindUnique).not.toHaveBeenCalled();
    expect(puertaSistemaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ evidenciaId: null }) }),
    );
  });
});

describe('crearRequisito — alta de RequisitoSeguridad, sin camino de carga hasta acá', () => {
  const datos = {
    sistemaId: 1,
    codigo: 'REQ-001',
    categoria: 'Autenticación',
    texto: 'El sistema exige MFA para roles administrativos.',
  };

  it('crea el requisito cuando el código es único en el sistema', async () => {
    const r = await crearRequisito(datos);
    expect(r.ok).toBe(true);
    expect(requisitoCreate).toHaveBeenCalled();
  });

  it('rechaza un código ya usado por ese sistema', async () => {
    requisitoFindUnique.mockResolvedValue({ id: 5 });
    const r = await crearRequisito(datos);
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/REQ-001/);
    expect(requisitoCreate).not.toHaveBeenCalled();
  });

  it('exige el texto del requisito', async () => {
    const r = await crearRequisito({ ...datos, texto: '' });
    expect(r.ok).toBe(false);
    expect(requisitoCreate).not.toHaveBeenCalled();
  });
});

describe('editarRequisito y darDeBajaRequisito', () => {
  beforeEach(() => {
    requisitoFindUnique.mockResolvedValue({
      id: 7,
      sistemaId: 1,
      codigo: 'REQ-001',
      categoria: 'Autenticación',
      texto: 'texto viejo',
      estado: 'PROPUESTO',
      prioridad: null,
      origen: null,
      observacion: null,
      sistema: { codigo: 'SIS-001' },
    });
  });

  it('edita los campos presentes', async () => {
    const r = await editarRequisito(1, 'REQ-001', { texto: 'texto nuevo' });
    expect(r.ok).toBe(true);
    expect(requisitoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ texto: 'texto nuevo' }) }),
    );
  });

  it('la baja lógica exige motivo', async () => {
    const r = await darDeBajaRequisito(1, 'REQ-001', '');
    expect(r.ok).toBe(false);
    expect(requisitoUpdate).not.toHaveBeenCalled();
  });

  it('la baja lógica marca el estado como RETIRADO y deja rastro', async () => {
    const r = await darDeBajaRequisito(1, 'REQ-001', 'Requisito reemplazado por REQ-002.');
    expect(r.ok).toBe(true);
    expect(requisitoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'RETIRADO' }) }),
    );
  });

  it('un requisito que no existe se rechaza', async () => {
    requisitoFindUnique.mockResolvedValue(null);
    const r = await editarRequisito(1, 'REQ-999', { texto: 'x' });
    expect(r.ok).toBe(false);
  });
});

describe('crearPrueba — los cuatro conteos se capturan, el veredicto se calcula aparte', () => {
  const datos = {
    sistemaId: 1,
    codigo: 'PEN-001',
    tipo: 'Pentest externo',
    fecha: new Date('2026-09-01'),
    criticos: 0,
    altos: 1,
    medios: 2,
    bajos: 3,
  };

  it('crea la prueba con sus cuatro conteos', async () => {
    const r = await crearPrueba(datos);
    expect(r.ok).toBe(true);
    expect(pruebaCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ criticos: 0, altos: 1, medios: 2, bajos: 3 }),
      }),
    );
  });

  it('rechaza un código de prueba repetido en el mismo sistema', async () => {
    pruebaSeguridadFindFirst.mockResolvedValueOnce({ id: 3 });
    const r = await crearPrueba(datos);
    expect(r.ok).toBe(false);
    expect(pruebaCreate).not.toHaveBeenCalled();
  });

  it('rechaza una evidencia citada por otro sistema', async () => {
    evidenciaFindUnique.mockResolvedValue({ id: 50 });
    puertaSistemaFindFirst.mockResolvedValue(null);
    pruebaSeguridadFindFirst
      .mockResolvedValueOnce(null) // chequeo de código duplicado
      .mockResolvedValueOnce({ id: 9, sistemaId: 2, sistema: { codigo: 'SIS-002' } }); // chequeo de evidencia

    const r = await crearPrueba({ ...datos, evidenciaId: 50 });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('SIS-002');
    expect(pruebaCreate).not.toHaveBeenCalled();
  });

  it('un conteo negativo se rechaza', async () => {
    const r = await crearPrueba({ ...datos, criticos: -1 });
    expect(r.ok).toBe(false);
    expect(pruebaCreate).not.toHaveBeenCalled();
  });
});

describe('crearLiberacion', () => {
  const datos = {
    sistemaId: 1,
    version: 'v1.4.0',
    fecha: new Date('2026-09-10'),
    tipo: 'Menor',
  };

  it('crea la liberación', async () => {
    const r = await crearLiberacion(datos);
    expect(r.ok).toBe(true);
    expect(liberacionCreate).toHaveBeenCalled();
  });

  it('rechaza una versión repetida en el mismo sistema', async () => {
    liberacionFindUnique.mockResolvedValue({ id: 4 });
    const r = await crearLiberacion(datos);
    expect(r.ok).toBe(false);
    expect(liberacionCreate).not.toHaveBeenCalled();
  });
});

describe('crearComponente — SBOM', () => {
  const datos = {
    sistemaId: 1,
    codigo: 'CMP-001',
    nombre: 'next.js',
    version: '15.0.0',
    licencia: 'MIT',
  };

  it('crea el componente', async () => {
    const r = await crearComponente(datos);
    expect(r.ok).toBe(true);
    expect(componenteCreate).toHaveBeenCalled();
  });

  it('rechaza un código repetido en el mismo sistema', async () => {
    componenteFindUnique.mockResolvedValue({ id: 2 });
    const r = await crearComponente(datos);
    expect(r.ok).toBe(false);
    expect(componenteCreate).not.toHaveBeenCalled();
  });

  it('exige el nombre del componente', async () => {
    const r = await crearComponente({ ...datos, nombre: '' });
    expect(r.ok).toBe(false);
    expect(componenteCreate).not.toHaveBeenCalled();
  });
});

describe('registrarTratamiento — ahora exige código (D6, clave natural)', () => {
  const datos = {
    sistemaId: 1,
    codigo: 'TDP-001',
    categoria: 'Identificación',
    sensibles: false,
    finalidad: 'Gestionar la relación contractual con el cliente.',
    baseLegitimacion: 'Ejecución contractual',
    transferenciaInternacional: false,
  };

  it('registra el tratamiento cuando el código es nuevo', async () => {
    const r = await registrarTratamiento(datos);
    expect(r.ok).toBe(true);
    expect(tratamientoCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ codigo: 'TDP-001' }) }),
    );
  });

  it('rechaza un código de tratamiento repetido en el mismo sistema', async () => {
    tratamientoFindUnique.mockResolvedValue({ id: 8 });
    const r = await registrarTratamiento(datos);
    expect(r.ok).toBe(false);
    expect(tratamientoCreate).not.toHaveBeenCalled();
  });

  it('exige el código', async () => {
    const r = await registrarTratamiento({ ...datos, codigo: '' });
    expect(r.ok).toBe(false);
    expect(tratamientoCreate).not.toHaveBeenCalled();
  });
});
