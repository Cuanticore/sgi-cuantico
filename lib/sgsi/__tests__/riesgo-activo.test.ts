// lib/sgsi/__tests__/riesgo-activo.test.ts
//
// Tarea 1.11 (REQ-SIG-20) · `nivelDeRiesgoDelActivo` es el módulo que la ficha, el
// inventario y `app/api/sgsi/exportar-activos/route.ts` comparten para colapsar los
// riesgos de un activo en un nivel. Un activo bajo el umbral no genera `Riesgo` en
// absoluto, así que llega acá con una lista de figuras vacía — y el contrato es null, no
// cero: "no calculado" y "cero" son afirmaciones distintas (invariante «not calculated is
// not zero»).

import { nivelDeRiesgoDelActivo, type UmbralRiesgo } from '../riesgo-activo';

const BANDAS: UmbralRiesgo[] = [
  { nombre: 'Crítico', desde: '25', hasta: '100000', orden: 1 },
  { nombre: 'Alto', desde: '5', hasta: '24.999', orden: 2 },
  { nombre: 'Medio', desde: '0.5', hasta: '4.999', orden: 3 },
  { nombre: 'Bajo', desde: '0', hasta: '0.499', orden: 4 },
];

describe('nivelDeRiesgoDelActivo · null es "no calculado", nunca 0 (tarea 1.11)', () => {
  it('un activo sin ningún Riesgo (bajo el umbral) devuelve null, no 0', () => {
    expect(nivelDeRiesgoDelActivo([], BANDAS)).toBeNull();
  });

  it('figuras todas null (residual sin calcular) también devuelve null', () => {
    expect(nivelDeRiesgoDelActivo([null, null], BANDAS)).toBeNull();
  });

  it('triangulación: con al menos una figura real, sí calcula el mayor nivel', () => {
    const resultado = nivelDeRiesgoDelActivo(['1.2', '30.5', null], BANDAS);
    expect(resultado).not.toBeNull();
    expect(resultado!.banda).toBe('Crítico');
    expect(resultado!.nivel).toBe(5);
    expect(resultado!.figura).toBe('30.5');
  });
});
