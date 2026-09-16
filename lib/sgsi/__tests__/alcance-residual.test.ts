// lib/sgsi/__tests__/alcance-residual.test.ts
//
// El alcance del acta de aprobación del riesgo residual: qué activos entran, con qué banda,
// y cuáles quedan fuera y por qué.

import {
  huellaDeAlcance,
  resolverFirmantes,
  seleccionarAlcance,
  type ActivoParaAlcance,
  type FilaAlcance,
  type ProcesoParaFirma,
} from '../alcance-residual';

const BANDAS = [
  { nombre: 'Crítico', desde: 6, hasta: 999 },
  { nombre: 'Alto', desde: 4, hasta: 5.9999 },
  { nombre: 'Medio', desde: 2, hasta: 3.9999 },
  { nombre: 'Bajo', desde: 0, hasta: 1.9999 },
];

function activo(p: Partial<ActivoParaAlcance> & { id: number }): ActivoParaAlcance {
  return {
    codigo: `TEC-SRV-000${p.id}`,
    nombre: `Activo ${p.id}`,
    areaId: 1,
    proceso: 'Tecnología',
    residuales: [],
    ...p,
  };
}

describe('seleccionarAlcance', () => {
  it('admite Crítico y Alto, y deja fuera Medio y Bajo', () => {
    const r = seleccionarAlcance(
      [
        activo({ id: 1, residuales: ['7.5'] }),
        activo({ id: 2, residuales: ['4.2'] }),
        activo({ id: 3, residuales: ['2.5'] }),
        activo({ id: 4, residuales: ['0.5'] }),
      ],
      BANDAS,
    );
    expect(r.filas.map((f) => f.codigo)).toEqual(['TEC-SRV-0001', 'TEC-SRV-0002']);
    expect(r.fueraDeBanda).toBe(2);
    expect(r.sinCalcular).toBe(0);
  });

  it('toma el PEOR riesgo del activo, no el primero', () => {
    const r = seleccionarAlcance([activo({ id: 1, residuales: ['1.0', '7.5', '2.0'] })], BANDAS);
    expect(r.filas[0].banda).toBe('Crítico');
    expect(r.filas[0].cifra).toBe('7.5');
  });

  // La regla que sostiene todo lo demás, y la razón por la que este módulo existe: si a un
  // activo con doce riesgos se le calculó el residual de once, la respuesta no es la peor de
  // esas once. El que falta puede ser el peor de todos.
  it('un solo riesgo sin calcular saca al activo entero, y lo cuenta aparte', () => {
    const r = seleccionarAlcance([activo({ id: 1, residuales: ['7.5', null] })], BANDAS);
    expect(r.filas).toHaveLength(0);
    expect(r.sinCalcular).toBe(1);
  });

  it('un activo sin riesgos no es «sin calcular»: no entra al análisis', () => {
    const r = seleccionarAlcance([activo({ id: 1, residuales: [] })], BANDAS);
    expect(r.filas).toHaveLength(0);
    expect(r.sinCalcular).toBe(0);
    expect(r.fueraDeBanda).toBe(0);
  });

  it('ordena por cifra descendente: el que más expone, primero', () => {
    const r = seleccionarAlcance(
      [
        activo({ id: 1, residuales: ['4.5'] }),
        activo({ id: 2, residuales: ['9.0'] }),
        activo({ id: 3, residuales: ['6.1'] }),
      ],
      BANDAS,
    );
    expect(r.filas.map((f) => f.cifra)).toEqual(['9', '6.1', '4.5']);
  });
});

function fila(p: Partial<FilaAlcance> & { codigo: string }): FilaAlcance {
  return {
    activoId: 1,
    nombre: 'Servidor',
    areaId: 1,
    proceso: 'Tecnología',
    banda: 'Alto',
    cifra: '4.5',
    ...p,
  };
}

describe('huellaDeAlcance', () => {
  it('no cambia si sólo cambia el orden de la lista', () => {
    const a = [fila({ codigo: 'A-1' }), fila({ codigo: 'B-2' })];
    const b = [fila({ codigo: 'B-2' }), fila({ codigo: 'A-1' })];
    expect(huellaDeAlcance(a)).toBe(huellaDeAlcance(b));
  });

  it('cambia si cambia una cifra', () => {
    expect(huellaDeAlcance([fila({ codigo: 'A-1', cifra: '4.5' })])).not.toBe(
      huellaDeAlcance([fila({ codigo: 'A-1', cifra: '4.6' })]),
    );
  });

  it('cambia si cambia una banda', () => {
    expect(huellaDeAlcance([fila({ codigo: 'A-1', banda: 'Alto' })])).not.toBe(
      huellaDeAlcance([fila({ codigo: 'A-1', banda: 'Crítico' })]),
    );
  });

  it('cambia si entra un activo nuevo', () => {
    expect(huellaDeAlcance([fila({ codigo: 'A-1' })])).not.toBe(
      huellaDeAlcance([fila({ codigo: 'A-1' }), fila({ codigo: 'A-2' })]),
    );
  });

  // Se aprobó el riesgo de un activo, no su nombre. Hacer que una corrección ortográfica
  // invalide un acta firmada obligaría a recoger las firmas otra vez.
  it('no cambia si sólo cambia el nombre del activo', () => {
    expect(huellaDeAlcance([fila({ codigo: 'A-1', nombre: 'Servidor' })])).toBe(
      huellaDeAlcance([fila({ codigo: 'A-1', nombre: 'Servidor de aplicaciones' })]),
    );
  });

  it('la lista vacía tiene huella, y es estable', () => {
    expect(huellaDeAlcance([])).toBe(huellaDeAlcance([]));
    expect(huellaDeAlcance([])).toHaveLength(64);
  });
});

describe('resolverFirmantes', () => {
  const tecnologia: ProcesoParaFirma = {
    areaId: 1,
    proceso: 'Tecnología',
    cargoId: 10,
    cargoNombre: 'Líder de Tecnología',
    candidatos: [{ id: 100, nombre: 'Ana Ruiz' }],
  };

  it('resuelve el proceso cuyo cargo líder tiene una persona', () => {
    const [f] = resolverFirmantes([tecnologia], [fila({ codigo: 'A-1', areaId: 1 })]);
    expect(f.resoluble).toBe(true);
    expect(f.candidatos).toHaveLength(1);
    expect(f.activos).toBe(1);
  });

  it('con varias personas en el cargo, todas son candidatas', () => {
    const [f] = resolverFirmantes(
      [
        {
          ...tecnologia,
          candidatos: [
            { id: 100, nombre: 'Ana Ruiz' },
            { id: 101, nombre: 'Luis Paz' },
          ],
        },
      ],
      [fila({ codigo: 'A-1', areaId: 1 })],
    );
    expect(f.resoluble).toBe(true);
    expect(f.candidatos.map((c) => c.nombre)).toEqual(['Ana Ruiz', 'Luis Paz']);
  });

  // Los dos estados que la pantalla NO puede confundir: uno es deuda del catálogo de cargos y
  // no se arregla insistiéndole a nadie; el otro es una persona a la que hay que buscar.
  it('un cargo líder sin persona activa NO es resoluble', () => {
    const [f] = resolverFirmantes(
      [{ ...tecnologia, candidatos: [] }],
      [fila({ codigo: 'A-1', areaId: 1 })],
    );
    expect(f.resoluble).toBe(false);
    expect(f.candidatos).toHaveLength(0);
  });

  it('un área sin cargo líder tampoco es resoluble, y lo dice distinto', () => {
    const [f] = resolverFirmantes(
      [{ ...tecnologia, cargoId: null, cargoNombre: null, candidatos: [] }],
      [fila({ codigo: 'A-1', areaId: 1 })],
    );
    expect(f.resoluble).toBe(false);
    expect(f.cargoId).toBeNull();
  });

  it('omite los procesos que no ponen ningún activo en el acta', () => {
    const contabilidad: ProcesoParaFirma = { ...tecnologia, areaId: 2, proceso: 'Contabilidad' };
    const firmantes = resolverFirmantes(
      [tecnologia, contabilidad],
      [fila({ codigo: 'A-1', areaId: 1 })],
    );
    expect(firmantes.map((f) => f.proceso)).toEqual(['Tecnología']);
  });

  it('ordena por cantidad de activos, de mayor a menor', () => {
    const contabilidad: ProcesoParaFirma = { ...tecnologia, areaId: 2, proceso: 'Contabilidad' };
    const firmantes = resolverFirmantes(
      [tecnologia, contabilidad],
      [
        fila({ codigo: 'A-1', areaId: 1 }),
        fila({ codigo: 'A-2', areaId: 2 }),
        fila({ codigo: 'A-3', areaId: 2 }),
      ],
    );
    expect(firmantes.map((f) => f.proceso)).toEqual(['Contabilidad', 'Tecnología']);
  });
});
