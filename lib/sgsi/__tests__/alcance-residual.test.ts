// lib/sgsi/__tests__/alcance-residual.test.ts
//
// El alcance del acta de aprobación del riesgo residual: qué activos entran, con qué banda,
// y cuáles quedan fuera y por qué.

import { seleccionarAlcance, type ActivoParaAlcance } from '../alcance-residual';

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
