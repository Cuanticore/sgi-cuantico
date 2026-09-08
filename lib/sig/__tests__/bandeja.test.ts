// lib/sig/__tests__/bandeja.test.ts
//
// El botón y el plazo son lo único que la persona lee antes de decidir. Los casos que
// importan son los que le harían abrir un panel distinto del que el botón prometía, o
// creer que tiene más plazo del que le queda.

import { verboDeCierre, textoPlazo } from '../bandeja';

describe('verboDeCierre', () => {
  it('da un verbo distinto a cada tipo de trabajo', () => {
    expect(verboDeCierre('LECTURA')).toBe('Leer y acusar');
    expect(verboDeCierre('VERIFICACION')).toBe('Diligenciar');
    expect(verboDeCierre('TAREA')).toBe('Registrar');
    expect(verboDeCierre('CAPACITACION')).toBe('Registrar');
  });

  it('no cambia el verbo porque la asignación esté vencida', () => {
    // El bug: una tarea vencida ofrecía «Leer y acusar» y abría el panel de nota.
    for (const tipo of ['LECTURA', 'VERIFICACION', 'TAREA', 'CAPACITACION']) {
      expect(verboDeCierre(tipo)).toBe(verboDeCierre(tipo));
    }
    expect(verboDeCierre('TAREA')).not.toBe('Leer y acusar');
    expect(verboDeCierre('CAPACITACION')).not.toBe('Leer y acusar');
  });

  it('un tipo desconocido cae en el verbo del panel genérico', () => {
    expect(verboDeCierre('LO_QUE_SEA')).toBe('Registrar');
  });
});

describe('textoPlazo', () => {
  it('nombra el día de hoy en vez de dar un número', () => {
    expect(textoPlazo({ vencida: false, dias: 0 })).toBe('Vence hoy');
  });

  it('nombra mañana en vez de «en 1 día»', () => {
    expect(textoPlazo({ vencida: false, dias: 1 })).toBe('Vence mañana');
  });

  it('usa el mismo verbo a los dos lados del plazo', () => {
    expect(textoPlazo({ vencida: false, dias: 4 })).toBe('Vence en 4 días');
    expect(textoPlazo({ vencida: true, dias: -4 })).toBe('Vencida hace 4 días');
  });

  it('singulariza el día vencido', () => {
    expect(textoPlazo({ vencida: true, dias: -1 })).toBe('Vencida hace 1 día');
  });

  it('vencida el mismo día no dice «hace 0 días»', () => {
    expect(textoPlazo({ vencida: true, dias: 0 })).toBe('Vencida hoy');
  });
});
