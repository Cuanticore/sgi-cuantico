// lib/sig/__tests__/fechas.test.ts
//
// La comparación por día calendario y su frontera: el día del plazo todavía está en plazo,
// la hora no cuenta, y el fin de mes no es un caso especial. Lo que estas pruebas fijan de
// verdad es la superficie: el módulo no expone el entero empaquetado, así que el defecto
// que se repitió cuatro veces —restarlo— ya no se puede escribir.

import { esDiaPosterior, esDiaPosteriorOIgual } from '../fechas';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('esDiaPosterior', () => {
  it('el día del plazo todavía no venció', () => {
    expect(esDiaPosterior(d('2026-09-10'), d('2026-09-10'))).toBe(false);
  });

  it('vence al día siguiente', () => {
    expect(esDiaPosterior(d('2026-09-11'), d('2026-09-10'))).toBe(true);
  });

  it('un día antes no venció', () => {
    expect(esDiaPosterior(d('2026-09-09'), d('2026-09-10'))).toBe(false);
  });

  it('la hora no cuenta: mismo día son el mismo día', () => {
    const temprano = new Date('2026-09-10T00:30:00.000Z');
    const tarde = new Date('2026-09-10T23:30:00.000Z');
    expect(esDiaPosterior(tarde, temprano)).toBe(false);
    expect(esDiaPosterior(temprano, tarde)).toBe(false);
  });

  const fronteras: [string, string, string][] = [
    ['de agosto a septiembre', '2026-09-01', '2026-08-31'],
    ['de febrero a marzo', '2026-03-01', '2026-02-28'],
    ['de diciembre a enero', '2027-01-01', '2026-12-31'],
  ];

  for (const [nombre, siguiente, anterior] of fronteras) {
    it(`el cruce ${nombre} es un día como cualquier otro`, () => {
      expect(esDiaPosterior(d(siguiente), d(anterior))).toBe(true);
      expect(esDiaPosterior(d(anterior), d(siguiente))).toBe(false);
    });
  }
});

describe('esDiaPosteriorOIgual', () => {
  it('el día del vencimiento cuenta como vigente', () => {
    expect(esDiaPosteriorOIgual(d('2026-09-10'), d('2026-09-10'))).toBe(true);
  });

  it('el día siguiente ya no', () => {
    expect(esDiaPosteriorOIgual(d('2026-09-09'), d('2026-09-10'))).toBe(false);
  });
});

// La razón de ser del módulo: la resta que rompía es imposible de pedir. Si algún día
// alguien exporta el entero empaquetado, esta prueba falla y explica por qué no debe.
describe('la superficie del módulo', () => {
  it('no exporta nada que se pueda restar', async () => {
    const fechas = await import('../fechas');
    expect(Object.keys(fechas).sort()).toEqual(['esDiaPosterior', 'esDiaPosteriorOIgual']);
    for (const valor of Object.values(fechas)) {
      expect(typeof valor).toBe('function');
      expect(typeof (valor as (a: Date, b: Date) => unknown)(d('2026-09-11'), d('2026-09-10'))).toBe(
        'boolean',
      );
    }
  });
});
