// lib/sgsi/__tests__/deuda-planes.test.ts
//
// REQ-SIG-20 §7 (P2, D4, tarea 4.10) · «sin plan» se DERIVA — nunca se guarda — de un
// residual Crítico sin `AccionPlan` activo que lo cubra por origen, y su antigüedad camina
// la racha de `RiesgoCalculo` (tarea 1.8) contra `CriterioAceptacion.plazoPlan`.

import { formatearOrigen } from '../origen-plan';
import {
  activosSinPlan,
  antiguedadEnCritico,
  construirResolverDeuda,
  edadEnDias,
  elegirControlParaPlan,
  estaEscalado,
  fechaObjetivoPlan,
  parsearPlazo,
  sumarPlazo,
  type CalculoParaAntiguedad,
  type RiesgoParaDeuda,
} from '../deuda-planes';
import type { UmbralRiesgo } from '../riesgo-activo';

const BANDAS: UmbralRiesgo[] = [
  { nombre: 'Crítico', desde: '25', hasta: '100000', orden: 1 },
  { nombre: 'Alto', desde: '15', hasta: '24.999', orden: 2 },
  { nombre: 'Medio', desde: '5', hasta: '14.999', orden: 3 },
  { nombre: 'Bajo', desde: '0', hasta: '4.999', orden: 4 },
];

function dia(n: number): Date {
  return new Date(`2026-09-${String(n).padStart(2, '0')}T00:00:00.000Z`);
}

describe('parsearPlazo — las formas confirmadas contra la base de desarrollo (2026-09-15)', () => {
  it('«15 días» / «30 días» / «60 días» — plazoPlan de Crítico, Alto, Medio', () => {
    expect(parsearPlazo('15 días')).toEqual({ tipo: 'dias', dias: 15 });
    expect(parsearPlazo('30 días')).toEqual({ tipo: 'dias', dias: 30 });
    expect(parsearPlazo('60 días')).toEqual({ tipo: 'dias', dias: 60 });
  });

  it('«No requiere» — plazoPlan de Bajo', () => {
    expect(parsearPlazo('No requiere')).toEqual({ tipo: 'sin-plazo' });
    expect(parsearPlazo('no requiere')).toEqual({ tipo: 'sin-plazo' });
  });

  it('«3 meses» / «6 meses» / «12 meses» — plazoEjecucion de Crítico, Alto, Medio', () => {
    expect(parsearPlazo('3 meses')).toEqual({ tipo: 'meses', meses: 3 });
    expect(parsearPlazo('6 meses')).toEqual({ tipo: 'meses', meses: 6 });
    expect(parsearPlazo('12 meses')).toEqual({ tipo: 'meses', meses: 12 });
  });

  // La forma AMBIGUA que el parser no adivina (Open Item, ver el módulo y el reporte).
  it('«Revisión anual» — plazoEjecucion de Bajo — es irreconocible, no se adivina', () => {
    expect(parsearPlazo('Revisión anual')).toEqual({ tipo: 'irreconocible', texto: 'Revisión anual' });
  });

  it('cualquier otro texto es irreconocible, nunca una excepción', () => {
    expect(parsearPlazo('cuando se pueda')).toEqual({ tipo: 'irreconocible', texto: 'cuando se pueda' });
    expect(parsearPlazo('')).toEqual({ tipo: 'irreconocible', texto: '' });
  });
});

describe('sumarPlazo', () => {
  it('«N días» suma días de calendario', () => {
    expect(sumarPlazo(dia(1), { tipo: 'dias', dias: 15 })?.toISOString().slice(0, 10)).toBe(
      '2026-09-16',
    );
  });

  it('«N meses» suma meses de CALENDARIO, no 30 días fijos', () => {
    // Enero tiene 31 días: 3 meses de calendario desde el 31 de enero no son 90 días fijos.
    const base = new Date('2026-01-31T00:00:00.000Z');
    const resultado = sumarPlazo(base, { tipo: 'meses', meses: 1 });
    // JS normaliza el 31 de febrero al 2-3 de marzo; lo que importa es que NO sea 30 días
    // fijos (2026-02-28 según ×30) sino la aritmética de mes de calendario de `Date`.
    expect(resultado?.toISOString().slice(0, 10)).not.toBe('2026-03-02');
  });

  it('sin-plazo e irreconocible no tienen fecha', () => {
    expect(sumarPlazo(dia(1), { tipo: 'sin-plazo' })).toBeNull();
    expect(sumarPlazo(dia(1), { tipo: 'irreconocible', texto: 'x' })).toBeNull();
  });
});

describe('estaEscalado', () => {
  it('supera el plazo en días → escalado', () => {
    expect(estaEscalado(16, '15 días')).toBe(true);
    expect(estaEscalado(15, '15 días')).toBe(false);
    expect(estaEscalado(1, '15 días')).toBe(false);
  });

  it('«No requiere» nunca escala', () => {
    expect(estaEscalado(9999, 'No requiere')).toBe(false);
  });

  it('un plazo irreconocible no se puede evaluar — null, no una adivinanza', () => {
    expect(estaEscalado(100, 'Revisión anual')).toBeNull();
  });
});

describe('antiguedadEnCritico — camina la racha de RiesgoCalculo', () => {
  it('sin ningún cálculo, no hay antigüedad', () => {
    expect(antiguedadEnCritico([], BANDAS)).toBeNull();
  });

  it('el cálculo más reciente no es Crítico → null, nada que envejecer', () => {
    const calculos: CalculoParaAntiguedad[] = [{ calculadoEn: dia(10), riesgoResidual: '10' }];
    expect(antiguedadEnCritico(calculos, BANDAS)).toBeNull();
  });

  it('una racha ininterrumpida de Crítico devuelve el cálculo MÁS ANTIGUO de la racha', () => {
    const calculos: CalculoParaAntiguedad[] = [
      { calculadoEn: dia(1), riesgoResidual: '30' },
      { calculadoEn: dia(5), riesgoResidual: '28' },
      { calculadoEn: dia(10), riesgoResidual: '26' },
    ];
    expect(antiguedadEnCritico(calculos, BANDAS)).toEqual(dia(1));
  });

  it('una interrupción corta la racha: la antigüedad es desde que VOLVIÓ a subir, no desde la primera vez', () => {
    const calculos: CalculoParaAntiguedad[] = [
      { calculadoEn: dia(1), riesgoResidual: '30' }, // Crítico — pero interrumpido después
      { calculadoEn: dia(5), riesgoResidual: '10' }, // bajó a Medio
      { calculadoEn: dia(10), riesgoResidual: '26' }, // volvió a subir
    ];
    expect(antiguedadEnCritico(calculos, BANDAS)).toEqual(dia(10));
  });

  it('el orden de entrada no importa: se reordena por fecha', () => {
    const calculos: CalculoParaAntiguedad[] = [
      { calculadoEn: dia(10), riesgoResidual: '26' },
      { calculadoEn: dia(1), riesgoResidual: '30' },
      { calculadoEn: dia(5), riesgoResidual: '28' },
    ];
    expect(antiguedadEnCritico(calculos, BANDAS)).toEqual(dia(1));
  });
});

describe('edadEnDias', () => {
  it('cuenta días completos, nunca negativos', () => {
    expect(edadEnDias(dia(1), dia(7))).toBe(6);
    expect(edadEnDias(dia(7), dia(1))).toBe(0);
    expect(edadEnDias(dia(1), dia(1))).toBe(0);
  });
});

describe('construirResolverDeuda — el ResolverDeudaPlan que analisis-riesgos.ts consume', () => {
  it('un AccionPlan activo cuyo origen cubre el riesgo → cubierto', () => {
    const resolver = construirResolverDeuda([
      {
        activa: true,
        origen: formatearOrigen('R-0123', 'TEC-GEN-0004', 'A.24', 'Residual crítico'),
      },
    ]);
    expect(resolver({ activoCodigo: 'TEC-GEN-0004', amenazaCodigo: 'A.24' })).toBe(true);
  });

  it('sin ningún AccionPlan que lo cubra → sin plan', () => {
    const resolver = construirResolverDeuda([]);
    expect(resolver({ activoCodigo: 'TEC-GEN-0004', amenazaCodigo: 'A.24' })).toBe(false);
  });

  it('un AccionPlan dado de baja no cubre nada', () => {
    const resolver = construirResolverDeuda([
      {
        activa: false,
        origen: formatearOrigen('R-0123', 'TEC-GEN-0004', 'A.24', 'Residual crítico'),
      },
    ]);
    expect(resolver({ activoCodigo: 'TEC-GEN-0004', amenazaCodigo: 'A.24' })).toBe(false);
  });

  it('un origen sin el prefijo verificable (legado, "Agregada desde Controles…") no cubre nada', () => {
    const resolver = construirResolverDeuda([
      { activa: true, origen: 'Agregada desde Controles y madurez. El control está en L2.' },
    ]);
    expect(resolver({ activoCodigo: 'TEC-GEN-0004', amenazaCodigo: 'A.24' })).toBe(false);
  });

  // Spec "ACEPTAR exits the band" — el tipo del plan no importa acá, solo que exista y
  // cubra el origen. `app/sgsi/acciones/plan.ts` es quien exige justificación/fecha de
  // revisión/aprobador para ACEPTAR; el resolutor solo mira "¿hay un plan activo?".
  it('cubre sin importar el tipo del plan (ACEPTAR también saca al riesgo de la deuda)', () => {
    const resolver = construirResolverDeuda([
      { activa: true, origen: formatearOrigen('R-0009', 'TEC-SER-0051', 'A.24', 'Aceptado') },
    ]);
    expect(resolver({ activoCodigo: 'TEC-SER-0051', amenazaCodigo: 'A.24' })).toBe(true);
  });

  it('no coincide con otro activo ni con otra amenaza del mismo activo', () => {
    const resolver = construirResolverDeuda([
      { activa: true, origen: formatearOrigen('R-0123', 'TEC-GEN-0004', 'A.24', 'x') },
    ]);
    expect(resolver({ activoCodigo: 'TEC-EQU-0003', amenazaCodigo: 'A.24' })).toBe(false);
    expect(resolver({ activoCodigo: 'TEC-GEN-0004', amenazaCodigo: 'A.11' })).toBe(false);
  });
});

describe('elegirControlParaPlan', () => {
  it('sin controles mapeados → null, nunca inventado', () => {
    expect(elegirControlParaPlan([])).toBeNull();
  });

  it('el principal declarado gana, aunque otro tenga menor madurez', () => {
    const control = elegirControlParaPlan([
      { codigo: 'A.8.6', nivel: 1, esPrincipal: false },
      { codigo: 'A.8.20', nivel: 4, esPrincipal: true },
    ]);
    expect(control?.codigo).toBe('A.8.20');
  });

  it('sin ningún principal (Open Item 6 — 272 pares sin relevancia), gana el de menor madurez', () => {
    const control = elegirControlParaPlan([
      { codigo: 'A.8.6', nivel: 3, esPrincipal: false },
      { codigo: 'A.8.20', nivel: 1, esPrincipal: false },
    ]);
    expect(control?.codigo).toBe('A.8.20');
  });

  it('un control sin evaluar (nivel null) cuenta como el más urgente', () => {
    const control = elegirControlParaPlan([
      { codigo: 'A.8.6', nivel: 1, esPrincipal: false },
      { codigo: 'A.8.20', nivel: null, esPrincipal: false },
    ]);
    expect(control?.codigo).toBe('A.8.20');
  });
});

describe('fechaObjetivoPlan — «hoy + CriterioAceptacion.plazoEjecucion»', () => {
  it('Crítico: hoy + 3 meses', () => {
    const fecha = fechaObjetivoPlan(dia(1), '3 meses');
    expect(fecha).not.toBeNull();
    expect(fecha?.getUTCMonth()).toBe(11); // septiembre (8) + 3 = diciembre (11)
  });

  it('un plazo irreconocible deja el campo sin fecha, no una inventada', () => {
    expect(fechaObjetivoPlan(dia(1), 'Revisión anual')).toBeNull();
  });
});

describe('activosSinPlan — las filas nombradas de la franja (tarea 4.17)', () => {
  const AHORA = dia(20);

  function riesgo(
    activoCodigo: string,
    amenazaCodigo: string,
    desdeQueEsCritico: number,
  ): RiesgoParaDeuda {
    return {
      activoCodigo,
      activoNombre: `Nombre ${activoCodigo}`,
      amenazaCodigo,
      amenazaNombre: `Amenaza ${amenazaCodigo}`,
      calculos: [{ calculadoEn: dia(desdeQueEsCritico), riesgoResidual: '30' }],
    };
  }

  it('un riesgo Crítico sin plan aparece nombrado, con su antigüedad', () => {
    const filas = activosSinPlan(
      [riesgo('TEC-GEN-0004', 'A.24', 14)],
      BANDAS,
      construirResolverDeuda([]),
      '15 días',
      AHORA,
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      activoCodigo: 'TEC-GEN-0004',
      amenazaCodigo: 'A.24',
      diasPendiente: 6,
      escalado: false,
    });
  });

  it('un riesgo cubierto por un AccionPlan activo no aparece', () => {
    const filas = activosSinPlan(
      [riesgo('TEC-GEN-0004', 'A.24', 14)],
      BANDAS,
      construirResolverDeuda([
        { activa: true, origen: formatearOrigen('R-1', 'TEC-GEN-0004', 'A.24', 'x') },
      ]),
      '15 días',
      AHORA,
    );
    expect(filas).toHaveLength(0);
  });

  it('un activo con dos riesgos Críticos sin plan aparece UNA sola vez, con el más antiguo', () => {
    const filas = activosSinPlan(
      [riesgo('TEC-GEN-0004', 'A.24', 14), riesgo('TEC-GEN-0004', 'A.11', 1)],
      BANDAS,
      construirResolverDeuda([]),
      '15 días',
      AHORA,
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].amenazaCodigo).toBe('A.11'); // el 1, más antiguo que el 14
    expect(filas[0].diasPendiente).toBe(19);
  });

  it('ordena por antigüedad descendente: el más pendiente primero', () => {
    const filas = activosSinPlan(
      [riesgo('TEC-GEN-0004', 'A.24', 14), riesgo('TEC-EQU-0003', 'A.11', 18), riesgo('TEC-SER-0051', 'A.24', 20)],
      BANDAS,
      construirResolverDeuda([]),
      '15 días',
      AHORA,
    );
    expect(filas.map((f) => f.activoCodigo)).toEqual(['TEC-GEN-0004', 'TEC-EQU-0003', 'TEC-SER-0051']);
  });

  it('un riesgo que ya no es Crítico (bajó de banda) no cuenta como deuda', () => {
    const filas = activosSinPlan(
      [
        {
          activoCodigo: 'TEC-GEN-0004',
          activoNombre: 'x',
          amenazaCodigo: 'A.24',
          amenazaNombre: 'x',
          calculos: [{ calculadoEn: dia(15), riesgoResidual: '5' }], // Medio, no Crítico
        },
      ],
      BANDAS,
      construirResolverDeuda([]),
      '15 días',
      AHORA,
    );
    expect(filas).toHaveLength(0);
  });
});
