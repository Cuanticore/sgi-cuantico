// lib/sig/__tests__/bandeja.test.ts
//
// El botón y el plazo son lo único que la persona lee antes de decidir. Los casos que
// importan son los que le harían abrir un panel distinto del que el botón prometía, o
// creer que tiene más plazo del que le queda.

import { verboDeCierre, textoPlazo, enlaceDirectoAlCurso } from '../bandeja';

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

  // REQ-SIG-24 · un curso no se «registra»: se INICIA la primera vez y se REANUDA si ya
  // hay un intento empezado. El botón de la bandeja tiene que decir cuál de las dos, igual
  // que ya lo dice el panel. «Registrar» invitaba a declarar una nota a mano, que es
  // justamente lo que un curso con paquete NO permite (P14).
  it('un curso virtual dice Iniciar la primera vez y Reanudar si ya empezó', () => {
    expect(verboDeCierre('CURSO_VIRTUAL', false)).toBe('Iniciar');
    expect(verboDeCierre('CURSO_VIRTUAL', true)).toBe('Reanudar');
  });

  it('sin el estado del curso, un curso virtual asume que no ha empezado', () => {
    expect(verboDeCierre('CURSO_VIRTUAL')).toBe('Iniciar');
  });
});

describe('enlaceDirectoAlCurso', () => {
  // El panel intermedio no aporta nada a un curso con paquete: sólo se puede abrir. Se salta.
  it('un curso con paquete abre directo el player', () => {
    expect(enlaceDirectoAlCurso({ tienePaqueteScorm: true, id: 7 })).toBe('/mi-sig/curso/7');
  });

  it('sin paquete (un enlace, o cualquier otro trabajo) pasa por el panel', () => {
    expect(enlaceDirectoAlCurso({ tienePaqueteScorm: false, id: 7 })).toBeNull();
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
