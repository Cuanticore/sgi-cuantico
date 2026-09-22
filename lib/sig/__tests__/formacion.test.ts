// lib/sig/__tests__/formacion.test.ts
//
// El avance de un curso es un número que alguien va a mirar para decidir si insiste o no.
// Los casos que importan son los que le harían creer que sabe algo que el sistema no sabe:
// un cero que en realidad es «el paquete no reporta», o el progreso del intento bueno
// cuando el vigente es otro.

import {
  avanceDelCurso,
  esFormacion,
  fraseSinProgreso,
  hayIntentoEnCurso,
  progresoDeCurso,
  TIPOS_DE_FORMACION,
  type IntentoParaProgreso,
} from '../formacion';

const intento = (
  numero: number,
  estado: string,
  progressMeasure: number | null,
  dia = 16,
) => ({
  numero,
  estado,
  progressMeasure,
  ultimaActividadEn: new Date(Date.UTC(2026, 8, dia, 10, 0, 0)),
});

describe('esFormacion', () => {
  // D-4 · la frontera se decide por el TIPO declarado. No por tener paquete cargado, que es
  // justamente la inferencia que REQ-SIG-26 sacó del sistema.
  it('son formación la capacitación y el curso virtual, y nada más', () => {
    expect(esFormacion('CAPACITACION')).toBe(true);
    expect(esFormacion('CURSO_VIRTUAL')).toBe(true);
    expect(esFormacion('LECTURA')).toBe(false);
    expect(esFormacion('VERIFICACION')).toBe(false);
    expect(esFormacion('TAREA')).toBe(false);
  });

  it('un tipo que no existe no es formación', () => {
    expect(esFormacion('LO_QUE_SEA')).toBe(false);
    expect(esFormacion('')).toBe(false);
  });

  it('la lista de tipos es la que usa la frontera', () => {
    for (const t of TIPOS_DE_FORMACION) expect(esFormacion(t)).toBe(true);
  });
});

describe('progresoDeCurso', () => {
  it('sin intentos no hay progreso que mostrar', () => {
    expect(progresoDeCurso([])).toBeNull();
  });

  // D-5 · el caso que da nombre a todo esto. `progressMeasure` es opcional en SCORM y
  // muchos paquetes no lo reportan nunca. Pintar 0% ahí afirma que la persona no avanzó
  // nada, que es una afirmación que el sistema no puede hacer.
  it('sin progressMeasure NO dice 0%: dice que el curso no reporta avance', () => {
    const p = progresoDeCurso([intento(1, 'EN_CURSO', null)]);
    expect(p).not.toBeNull();
    expect(p?.porcentaje).toBeNull();
    expect(p?.etiqueta).toBe('Empezado; el curso no reporta avance');
    expect(p?.etiqueta).not.toContain('0%');
  });

  // El contracaso, y es el que demuestra que el de arriba mira lo que dice mirar: un cero
  // REPORTADO sí es un cero, y se dice.
  it('con progressMeasure en cero sí dice 0%, porque el curso lo reportó', () => {
    const p = progresoDeCurso([intento(1, 'EN_CURSO', 0)]);
    expect(p?.porcentaje).toBe(0);
    expect(p?.etiqueta).toBe('Va por el 0%');
  });

  it('redondea el avance a un entero', () => {
    expect(progresoDeCurso([intento(1, 'EN_CURSO', 0.45)])?.porcentaje).toBe(45);
    expect(progresoDeCurso([intento(1, 'EN_CURSO', 0.456)])?.porcentaje).toBe(46);
    expect(progresoDeCurso([intento(1, 'EN_CURSO', 1)])?.porcentaje).toBe(100);
  });

  // D-5 · el ÚLTIMO intento, no el mejor. La pregunta de la pestaña es dónde está la
  // persona ahora. El caso está armado para que los dos no coincidan: el intento viejo
  // avanzó más que el vigente.
  it('muestra el último intento aunque otro anterior haya avanzado más', () => {
    const p = progresoDeCurso([
      intento(1, 'ABANDONADO', 0.9, 10),
      intento(2, 'EN_CURSO', 0.2, 16),
    ]);
    expect(p?.numero).toBe(2);
    expect(p?.porcentaje).toBe(20);
    expect(p?.estado).toBe('EN_CURSO');
    expect(p?.intentos).toBe(2);
  });

  it('no depende de que la lista venga ordenada', () => {
    const p = progresoDeCurso([
      intento(2, 'EN_CURSO', 0.2, 16),
      intento(1, 'ABANDONADO', 0.9, 10),
    ]);
    expect(p?.numero).toBe(2);
    expect(p?.porcentaje).toBe(20);
  });

  it('redacta cada estado del intento con su propia frase', () => {
    expect(progresoDeCurso([intento(1, 'SUSPENDIDO', 0.6)])?.etiqueta).toBe(
      'Guardado en el 60% para seguir',
    );
    expect(progresoDeCurso([intento(1, 'SUSPENDIDO', null)])?.etiqueta).toBe(
      'Guardado para seguir',
    );
    expect(progresoDeCurso([intento(1, 'ABANDONADO', 0.3)])?.etiqueta).toBe(
      'Intento abandonado',
    );
    expect(progresoDeCurso([intento(1, 'COMPLETADO', 1)])?.etiqueta).toBe('Terminado');
  });

  it('lleva la fecha de la última actividad del intento vigente', () => {
    const p = progresoDeCurso([intento(1, 'ABANDONADO', 0.9, 10), intento(2, 'EN_CURSO', 0.2, 16)]);
    expect(p?.ultimaActividadEn).toBe('2026-09-16');
  });
});

describe('fraseSinProgreso', () => {
  // D-5 · tres motivos distintos para no tener avance, y cada uno significa otra cosa. Una
  // sola frase genérica para los tres dejaría a quien mira sin saber si el curso está sin
  // empezar, si es presencial o si es externo.
  it('da una frase distinta por cada motivo', () => {
    const capacitacion = fraseSinProgreso('CAPACITACION', null, false);
    const externo = fraseSinProgreso('CURSO_VIRTUAL', 'ENLACE', false);
    const sinAbrir = fraseSinProgreso('CURSO_VIRTUAL', 'PAQUETE', false);

    expect(capacitacion).toBe('No es un curso en línea: se registra asistencia');
    expect(externo).toBe('Curso externo: el avance no vuelve al sistema');
    expect(sinAbrir).toBe('Sin abrir');
    expect(new Set([capacitacion, externo, sinAbrir]).size).toBe(3);
  });

  it('un curso con paquete que ya tiene intentos no necesita explicación', () => {
    expect(fraseSinProgreso('CURSO_VIRTUAL', 'PAQUETE', true)).toBeNull();
  });

  it('lo que no es formación no dice nada de avance', () => {
    expect(fraseSinProgreso('LECTURA', null, false)).toBeNull();
    expect(fraseSinProgreso('TAREA', null, false)).toBeNull();
  });
});

describe('avanceDelCurso', () => {
  it('un curso con paquete y un intento trae progreso y ninguna explicación', () => {
    const r = avanceDelCurso('CURSO_VIRTUAL', 'PAQUETE', [intento(1, 'EN_CURSO', 0.45)]);
    expect(r.progreso?.porcentaje).toBe(45);
    expect(r.sinProgresoPorque).toBeNull();
  });

  it('un curso con paquete sin abrir trae la explicación y ningún progreso', () => {
    const r = avanceDelCurso('CURSO_VIRTUAL', 'PAQUETE', []);
    expect(r.progreso).toBeNull();
    expect(r.sinProgresoPorque).toBe('Sin abrir');
  });

  // El caso torcido: la base no impide que un curso de clase ENLACE tenga intentos. Si los
  // tuviera, informar su avance sería afirmar algo sobre un curso que corre fuera del
  // sistema — el sistema no puede saberlo, y decir que sí es peor que callarse.
  it('un curso por enlace no inventa progreso aunque tenga intentos colgados', () => {
    const r = avanceDelCurso('CURSO_VIRTUAL', 'ENLACE', [intento(1, 'EN_CURSO', 0.8)]);
    expect(r.progreso).toBeNull();
    expect(r.sinProgresoPorque).toBe('Curso externo: el avance no vuelve al sistema');
  });

  it('una capacitación no tiene avance y dice por qué', () => {
    const r = avanceDelCurso('CAPACITACION', null, []);
    expect(r.progreso).toBeNull();
    expect(r.sinProgresoPorque).toBe('No es un curso en línea: se registra asistencia');
  });

  it('una lectura no habla de avance en absoluto', () => {
    const r = avanceDelCurso('LECTURA', null, []);
    expect(r.progreso).toBeNull();
    expect(r.sinProgresoPorque).toBeNull();
  });
});

// El booleano que separa «Iniciar» de «Reanudar» en la bandeja.
//
// Vive acá y no como un `.some()` suelto en la consulta por una razón concreta: hasta el
// 21/09/2026 lo resolvía un filtro de Prisma —`where: { estado: 'EN_CURSO' }`— y ese filtro
// tuvo que irse para poder redactar el avance, que necesita también los intentos
// SUSPENDIDOS. Al quedar como una expresión suelta, «simplificarla» a `intentos.length > 0`
// se ve inocente y cambia el verbo del botón para una asignación cuyo único intento está
// abandonado o completado. Con esta prueba, esa simplificación se pone roja.
describe('hayIntentoEnCurso', () => {
  // Se llama distinto del `intento` del módulo a propósito: acá el único dato que importa
  // es el estado, y sombrear el otro haría dudar de cuál se está usando.
  const conEstado = (estado: string): IntentoParaProgreso => ({
    numero: 1,
    estado,
    progressMeasure: null,
    ultimaActividadEn: new Date('2026-09-21'),
  });

  it('sin intentos, no', () => {
    expect(hayIntentoEnCurso([])).toBe(false);
  });

  it('con un intento en curso, sí', () => {
    expect(hayIntentoEnCurso([conEstado('EN_CURSO')])).toBe(true);
  });

  // Los tres que NO cuentan, y es lo que la prueba existe para fijar.
  it('un intento suspendido, completado o abandonado NO es un curso en marcha', () => {
    expect(hayIntentoEnCurso([conEstado('SUSPENDIDO')])).toBe(false);
    expect(hayIntentoEnCurso([conEstado('COMPLETADO')])).toBe(false);
    expect(hayIntentoEnCurso([conEstado('ABANDONADO')])).toBe(false);
  });

  it('basta uno en curso entre varios', () => {
    expect(hayIntentoEnCurso([conEstado('ABANDONADO'), conEstado('EN_CURSO')])).toBe(true);
  });
});
