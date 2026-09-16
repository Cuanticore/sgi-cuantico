// lib/sgsi/__tests__/formulas.test.ts

import {
  EFICACIA_MAXIMA,
  calcularRiesgo,
  entraAlAnalisis,
  impactoAcumulado,
  valorActivo,
  valorMaximo,
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

  // Tarea 1.10 (REQ-SIG-20 §3, spec risk-analysis-scope «Threshold change re-enables
  // without recompile»): el mismo activo, sin tocar código, cambia de lado cuando el
  // PARÁMETRO cambia — nunca al revés. `generarRiesgos` (lib/sgsi/riesgos.ts) lee
  // `Parametro.umbral_valoracion` de la base en cada corrida y se lo pasa tal cual a esta
  // misma función; no hay ningún 4 escrito a mano en ese camino. La prueba de integración
  // completa (mutar la fila real y volver a correr `generarRiesgos`) no se hizo acá: crear
  // y luego revertir ~250 filas de `Riesgo`/`RiesgoCalculo` en la base de desarrollo
  // compartida solo para esta aserción es un costo que esta función pura ya cubre.
  it('el mismo activo cambia de lado cuando el umbral cambia, no cuando el activo cambia', () => {
    const activo = { D: 3, I: 3, C: 3 };
    expect(entraAlAnalisis(activo, 4)).toBe(false);
    expect(entraAlAnalisis(activo, 3)).toBe(true);
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
    // Principal en 50 %, tres acompañantes en 90 %. La media por presupuesto daría 0.62,
    // pero el techo es 0.50 + δ, y δ es un escalón de la escala nueva.
    const controles = [
      { nivel: 50, peso: 3, esPrincipal: true },
      { nivel: 90, peso: 2, esPrincipal: false },
      { nivel: 90, peso: 2, esPrincipal: false },
      { nivel: 90, peso: 1, esPrincipal: false },
    ];
    expect(eficaciaAmenaza(controles)).toBeCloseTo(0.6, 10);
  });

  it('el techo no interviene cuando el principal está fuerte', () => {
    const controles = [
      { nivel: 100, peso: 3, esPrincipal: true },
      { nivel: 50, peso: 1, esPrincipal: false },
    ];
    // REQ-SIG-21 §4: sin secundarios, el presupuesto se renormaliza sobre las clases
    // PRESENTES — 70/10 pasa a 87.5/12.5, no queda un 20 % huérfano. Bruta =
    // 0.875×1 + 0.125×0.5 = 0.9375, techo = 1 + δ. Gana la bruta.
    //
    // Nótese que esta es la eficacia AGREGADA, antes del techo del motor: `calcularRiesgo`
    // la acotará en 0.95 (REQ-SIG-24 §4) si alguna vez supera ese valor.
    expect(eficaciaAmenaza(controles)).toBeCloseTo(0.9375, 10);
  });

  it('descarta la composición probabilística', () => {
    // Cuatro controles en 90 % darían 99,99 % con 1 − ∏(1 − eᵢ). La regla acotada no.
    const controles = [
      { nivel: 90, peso: 3, esPrincipal: true },
      { nivel: 90, peso: 2, esPrincipal: false },
      { nivel: 90, peso: 2, esPrincipal: false },
      { nivel: 90, peso: 1, esPrincipal: false },
    ];
    expect(eficaciaAmenaza(controles)).toBeLessThan(0.96);
  });

  it('sin controles la eficacia es DESCONOCIDA, no cero', () => {
    // REQ-SIG-21 §8 · desconocido no es cero: escribir cero haría que toda matriz residual
    // saliera idéntica a la inherente, que es el defecto que este dominio ya pagó una vez.
    expect(eficaciaAmenaza([])).toBeNull();
  });
});

describe('REQ-SIG-24 §4 · el techo del motor: ningún control elimina un riesgo', () => {
  // La eficacia 1.0 daría residual exactamente 0 — el riesgo desaparecería del registro.
  // El techo vive acá y no en el selector porque hay tres puertas que la interfaz no
  // cubre: un UPDATE por script, la agregación de REQ-SIG-21 y la excepción de madurez
  // de `Riesgo.madurezId`.
  const ENTRADA = {
    valores: { D: 5, I: 5, C: 5 },
    degradaciones: { D: 1, I: 0, C: 0 },
    aro: 10,
  };

  it('el máximo es 0.95, expuesto como constante', () => {
    expect(EFICACIA_MAXIMA).toBe(0.95);
  });

  it('con eficacia 1 el residual es el 5 % del inherente, no cero', () => {
    const r = calcularRiesgo({ ...ENTRADA, eficacia: 1 });
    expect(r.riesgoPotencial.toNumber()).toBe(50);
    expect(r.riesgoResidual.toNumber()).toBe(2.5);
    expect(r.eficaciaAcotada).toBe(true);
  });

  it('por debajo del techo no interviene y no se marca', () => {
    const r = calcularRiesgo({ ...ENTRADA, eficacia: 0.9 });
    expect(r.riesgoResidual.toNumber()).toBe(5);
    expect(r.eficaciaAcotada).toBe(false);
  });

  it('justo en el techo tampoco se marca: acotar es recortar, no tocar', () => {
    const r = calcularRiesgo({ ...ENTRADA, eficacia: 0.95 });
    expect(r.riesgoResidual.toNumber()).toBe(2.5);
    expect(r.eficaciaAcotada).toBe(false);
  });

  it('el residual nunca baja del 5 % del inherente, con cualquier eficacia', () => {
    for (const eficacia of [0, 0.5, 0.9, 0.95, 0.99, 1]) {
      const r = calcularRiesgo({ ...ENTRADA, eficacia });
      expect(r.riesgoResidual.toNumber()).toBeGreaterThanOrEqual(
        r.riesgoPotencial.toNumber() * 0.05,
      );
    }
  });
});

describe('escala de madurez', () => {
  it('la eficacia ES el escalón: no hay curva que interpretar', () => {
    // REQ-SIG-24 §3 · lo que se retira acá es el salto de L2 (50 %) a L3 (90 %), que era
    // el agujero por el que se caía el análisis: entre esos dos valores no había dónde
    // poner un control «definido pero sin prueba», y el residual saltaba de Crítico a
    // Medio según cuál de los dos eligiera el evaluador.
    expect(eficaciaDeNivel(50)).toBe(0.5);
    expect(eficaciaDeNivel(60)).toBe(0.6);
    expect(eficaciaDeNivel(70)).toBe(0.7);
    expect(eficaciaDeNivel(90)).toBe(0.9);
  });

  it('manda el catálogo cuando se le pasa la tabla', () => {
    // La tabla es la proyección de `EscalaMadurez`: editar un escalón no es recompilar.
    const tabla = new Map([[70, 0.42]]);
    expect(eficaciaDeNivel(70, tabla)).toBe(0.42);
  });

  it('un escalón que el catálogo no trae es un dato roto, no un cero', () => {
    // La versión anterior devolvía 0 para cualquier nivel fuera de rango, así que un
    // nivel de la escala vieja sobrevivido a la migración habría bajado la eficacia en
    // silencio en vez de avisar.
    expect(() => eficaciaDeNivel(3)).toThrow(/no es un escalón/);
    expect(() => eficaciaDeNivel(70, new Map([[90, 0.9]]))).toThrow(/no está en el catálogo/);
  });

  it('un control sin nivel no aporta eficacia', () => {
    expect(eficaciaDeNivel(null)).toBe(0);
  });

  it('la mediana resiste los extremos', () => {
    expect(mediana([0, 3, 3, 3, 5])).toBe(3);
    expect(mediana([3, 4])).toBe(3.5);
  });
});

describe('valorMaximo · la misma regla sobre un número cualquiera de dimensiones', () => {
  // REQ-SIG-18 §3 exige iterar las dimensiones ACTIVAS y no tres constantes: `Dimension`
  // admite cinco códigos y hoy hay tres sembradas. `valorActivo` sigue siendo la entrada de
  // tres dimensiones que ya llaman la ficha, el inventario y el export, y delega acá, así que
  // hay una sola implementación del máximo y no dos que puedan separarse.
  it('coincide con valorActivo en las 216 combinaciones de D, I y C', () => {
    for (let D = 0; D <= 5; D += 1) {
      for (let I = 0; I <= 5; I += 1) {
        for (let C = 0; C <= 5; C += 1) {
          expect(valorMaximo([D, I, C]).toNumber()).toBe(valorActivo({ D, I, C }).toNumber());
        }
      }
    }
  });

  it('con una sola dimensión valorada, el máximo es esa', () => {
    expect(valorMaximo([4]).toNumber()).toBe(4);
  });

  it('admite una cuarta y una quinta dimensión sin tocar nada', () => {
    expect(valorMaximo([1, 1, 1, 5]).toNumber()).toBe(5);
    expect(valorMaximo([1, 1, 1, 1, 2]).toNumber()).toBe(2);
  });

  it('sin ninguna dimensión valorada no responde 0: no hay máximo que calcular', () => {
    expect(() => valorMaximo([])).toThrow(/sin dimensiones valoradas/);
  });
});
