// lib/sgsi/__tests__/formulas.test.ts

import {
  calcularRiesgo,
  entraAlAnalisis,
  impactoAcumulado,
  valorActivo,
} from '../formulas';
import { clasificar, clasificarZona } from '../clasificar';
import { eficaciaAmenaza, eficaciaDeNivel, mediana } from '../madurez';

const UMBRAL_IMPACTO = [
  { nombre: 'Muy alto', desde: 4.5, hasta: 5 },
  { nombre: 'Alto', desde: 3, hasta: 4.499 },
  { nombre: 'Medio', desde: 1.5, hasta: 2.999 },
  { nombre: 'Bajo', desde: 0.5, hasta: 1.499 },
  { nombre: 'Despreciable', desde: 0, hasta: 0.499 },
];

const UMBRAL_RIESGO = [
  { nombre: 'Crítico', desde: 25, hasta: 100000 },
  { nombre: 'Alto', desde: 5, hasta: 24.999 },
  { nombre: 'Medio', desde: 0.5, hasta: 4.999 },
  { nombre: 'Bajo', desde: 0, hasta: 0.499 },
];

describe('ejemplo resuelto de MET-SIG-01 §7.5', () => {
  // Un servidor de base de datos productiva se valora en 5 en Disponibilidad, 5 en
  // Integridad y 4 en Confidencialidad, frente a la amenaza A.24 Denegación de
  // servicio: degradación Muy alta en Disponibilidad (100 %) y frecuencia Media
  // (una vez al año). Controles A.8.20 y A.8.6 en L3, eficacia 90 %.
  const valores = { D: 5, I: 5, C: 4 };
  const degradaciones = { D: 1.0, I: 0, C: 0 };
  const aro = 1;
  const eficacia = 0.9;

  it('el valor del activo es el mayor de sus dimensiones', () => {
    expect(valorActivo(valores).toNumber()).toBe(5);
  });

  it('el impacto en Disponibilidad es 5,00', () => {
    expect(impactoAcumulado(valores, degradaciones).toNumber()).toBe(5.0);
  });

  it('reproduce los cuatro resultados de la tabla', () => {
    const r = calcularRiesgo({ valores, degradaciones, aro, eficacia });

    expect(r.impacto.toNumber()).toBe(5.0);
    expect(r.riesgoPotencial.toNumber()).toBe(5.0);
    expect(r.frecuenciaResidual.toNumber()).toBe(0.1);
    expect(r.riesgoResidual.toNumber()).toBe(0.5);
  });

  it('clasifica en las bandas que declara el documento', () => {
    const r = calcularRiesgo({ valores, degradaciones, aro, eficacia });

    expect(clasificar(r.impacto, UMBRAL_IMPACTO)).toBe('Muy alto');
    expect(clasificar(r.riesgoPotencial, UMBRAL_RIESGO)).toBe('Alto');
    expect(clasificar(r.riesgoResidual, UMBRAL_RIESGO)).toBe('Medio');
  });

  it('el riesgo residual no cae en Bajo por un artefacto de coma flotante', () => {
    // 5 × (1 − 0.9) es 0.4999999999999999 en binario, que clasificaría Bajo.
    const r = calcularRiesgo({ valores, degradaciones, aro, eficacia });
    expect(r.riesgoResidual.toNumber()).not.toBeLessThan(0.5);
  });
});

describe('no existe impacto residual', () => {
  it('la eficacia baja la frecuencia y deja el impacto intacto', () => {
    const entrada = {
      valores: { D: 4, I: 2, C: 1 },
      degradaciones: { D: 0.8, I: 0.5, C: 0.2 },
      aro: 10,
    };

    const sinControles = calcularRiesgo({ ...entrada, eficacia: 0 });
    const conControles = calcularRiesgo({ ...entrada, eficacia: 0.9 });

    expect(conControles.impacto.toNumber()).toBe(sinControles.impacto.toNumber());
    expect(conControles.frecuenciaResidual.lt(sinControles.frecuenciaResidual)).toBe(true);
  });
});

describe('umbral de entrada al análisis', () => {
  it('deja fuera al activo que no lo alcanza', () => {
    expect(entraAlAnalisis({ D: 3, I: 3, C: 2 }, 4)).toBe(false);
    expect(entraAlAnalisis({ D: 3, I: 4, C: 2 }, 4)).toBe(true);
  });
});

describe('zonas de riesgo, MAGERIT Libro I cap. 3', () => {
  it('impacto alto y al menos una vez al año es crítica', () => {
    expect(clasificarZona(5, 1)).toBe('Zona 1 — Crítica');
    expect(clasificarZona(3, 10)).toBe('Zona 1 — Crítica');
  });

  it('impacto alto pero excepcional es catastrófica poco probable', () => {
    expect(clasificarZona(5, 0.1)).toBe('Zona 4 — Catastrófica poco probable');
  });

  it('impacto bajo y poco frecuente es asumible', () => {
    expect(clasificarZona(1, 0.1)).toBe('Zona 3 — Asumible');
  });

  it('el resto es atención', () => {
    expect(clasificarZona(2, 10)).toBe('Zona 2 — Atención');
    expect(clasificarZona(1, 10)).toBe('Zona 2 — Atención');
  });
});

describe('eficacia agregada de una amenaza, MET-SIG-01 §7.4', () => {
  it('el techo impide que los secundarios sustituyan al principal', () => {
    // Principal en L2 (50 %), tres acompañantes en L3 (90 %). La media ponderada
    // daría 0.7, pero el techo es 0.50 + 0.05.
    const controles = [
      { nivel: 2, peso: 3, esPrincipal: true },
      { nivel: 3, peso: 2, esPrincipal: false },
      { nivel: 3, peso: 2, esPrincipal: false },
      { nivel: 3, peso: 1, esPrincipal: false },
    ];
    expect(eficaciaAmenaza(controles)).toBeCloseTo(0.55, 10);
  });

  it('el techo no interviene cuando el principal está fuerte', () => {
    const controles = [
      { nivel: 5, peso: 3, esPrincipal: true },
      { nivel: 2, peso: 1, esPrincipal: false },
    ];
    // Ponderada = (3×1 + 1×0.5) / 4 = 0.875, techo = 1 + 0.05. Gana la ponderada.
    expect(eficaciaAmenaza(controles)).toBeCloseTo(0.875, 10);
  });

  it('descarta la composición probabilística', () => {
    // Cuatro controles en L3 darían 99,995 % con 1 − ∏(1 − eᵢ). La regla acotada no.
    const controles = [
      { nivel: 3, peso: 3, esPrincipal: true },
      { nivel: 3, peso: 2, esPrincipal: false },
      { nivel: 3, peso: 2, esPrincipal: false },
      { nivel: 3, peso: 1, esPrincipal: false },
    ];
    expect(eficaciaAmenaza(controles)).toBeLessThan(0.96);
  });

  it('sin controles la eficacia es cero', () => {
    expect(eficaciaAmenaza([])).toBe(0);
  });
});

describe('escala de madurez', () => {
  it('el salto grande está entre L2 y L3', () => {
    expect(eficaciaDeNivel(2)).toBe(0.5);
    expect(eficaciaDeNivel(3)).toBe(0.9);
  });

  it('un control sin nivel no aporta eficacia', () => {
    expect(eficaciaDeNivel(null)).toBe(0);
  });

  it('la mediana resiste los extremos', () => {
    expect(mediana([0, 3, 3, 3, 5])).toBe(3);
    expect(mediana([3, 4])).toBe(3.5);
  });
});
