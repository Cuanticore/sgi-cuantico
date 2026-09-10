// lib/sig/__tests__/scorm-modelo.test.ts
//
// P8 · los códigos de error se implementan, no se aproximan. Un curso bien hecho RAMIFICA
// según el código: devolver siempre 101 hace que decida mal y que el defecto parezca del
// curso. Es la misma lección de `graph-fallo.ts` — un error que significa cinco cosas manda
// a la gente a arreglar lo que no está roto.
//
// Estas pruebas son el contrato que comparten el runner (en el navegador) y el servidor: la
// validación corre en los dos lados con este mismo módulo, así que una discrepancia entre
// lo que el curso creyó guardar y lo que se guardó es imposible por construcción.

import {
  ELEMENTO_NO_DEFINIDO,
  ELEMENTO_SOLO_ESCRITURA,
  ELEMENTO_SOLO_LECTURA,
  FALLO_GENERAL_AL_FIJAR,
  FIJAR_ANTES_DE_INICIALIZAR,
  OBTENER_ANTES_DE_INICIALIZAR,
  OBTENER_DESPUES_DE_TERMINAR,
  OK,
  TIPO_INCORRECTO,
  VALOR_FUERA_DE_RANGO,
  YA_INICIALIZADO,
  frase,
  indiceDe,
  normalizar,
  validarEscritura,
  validarLectura,
  validarInitialize,
} from '../scorm-modelo';

const ABIERTO = { iniciado: true, terminado: false };

describe('normalizar e indiceDe', () => {
  // Las colecciones se direccionan con un índice; el modelo se declara una sola vez con `n`.
  it('reemplaza el índice por n', () => {
    expect(normalizar('cmi.objectives.3.id')).toBe('cmi.objectives.n.id');
    expect(normalizar('cmi.interactions.12.result')).toBe('cmi.interactions.n.result');
  });

  it('deja intacto lo que no es colección', () => {
    expect(normalizar('cmi.completion_status')).toBe('cmi.completion_status');
  });

  it('extrae el índice', () => {
    expect(indiceDe('cmi.objectives.3.id')).toBe(3);
    expect(indiceDe('cmi.completion_status')).toBeNull();
  });
});

describe('máquina de estados', () => {
  it('Initialize dos veces es 103', () => {
    expect(validarInitialize({ iniciado: false, terminado: false })).toBe(OK);
    expect(validarInitialize(ABIERTO)).toBe(YA_INICIALIZADO);
  });

  it('leer antes de Initialize es 122', () => {
    expect(validarLectura('cmi.learner_id', { iniciado: false, terminado: false })).toBe(
      OBTENER_ANTES_DE_INICIALIZAR,
    );
  });

  it('leer después de Terminate es 123', () => {
    expect(validarLectura('cmi.learner_id', { iniciado: true, terminado: true })).toBe(
      OBTENER_DESPUES_DE_TERMINAR,
    );
  });

  it('escribir antes de Initialize es 132', () => {
    expect(
      validarEscritura('cmi.location', 'p3', { iniciado: false, terminado: false }, { objetivos: 0, interacciones: 0 }),
    ).toBe(FIJAR_ANTES_DE_INICIALIZAR);
  });
});

describe('acceso a los elementos', () => {
  it('un elemento inexistente es 401', () => {
    expect(validarLectura('cmi.inventado', ABIERTO)).toBe(ELEMENTO_NO_DEFINIDO);
  });

  // `cmi.total_time` lo acumula el LMS. Si el curso pudiera escribirlo, el tiempo total de
  // capacitación de la organización sería lo que cada curso quiera decir.
  it('escribir un elemento de solo lectura es 404', () => {
    expect(validarEscritura('cmi.total_time', 'PT1H', ABIERTO, { objetivos: 0, interacciones: 0 })).toBe(
      ELEMENTO_SOLO_LECTURA,
    );
    expect(validarEscritura('cmi.learner_id', 'otro', ABIERTO, { objetivos: 0, interacciones: 0 })).toBe(
      ELEMENTO_SOLO_LECTURA,
    );
  });

  it('leer un elemento de solo escritura es 405', () => {
    expect(validarLectura('cmi.session_time', ABIERTO)).toBe(ELEMENTO_SOLO_ESCRITURA);
    expect(validarLectura('cmi.exit', ABIERTO)).toBe(ELEMENTO_SOLO_ESCRITURA);
  });

  it('los elementos que el requerimiento exige existen', () => {
    for (const e of [
      'cmi._version',
      'cmi.completion_status',
      'cmi.success_status',
      'cmi.score.scaled',
      'cmi.score.raw',
      'cmi.progress_measure',
      'cmi.location',
      'cmi.suspend_data',
      'cmi.entry',
      'cmi.credit',
      'cmi.mode',
      'cmi.launch_data',
      'cmi.scaled_passing_score',
      'cmi.completion_threshold',
      'cmi.objectives.n.id',
      'cmi.interactions.n.id',
      'adl.nav.request',
    ]) {
      expect(validarLectura(e, ABIERTO)).not.toBe(ELEMENTO_NO_DEFINIDO);
    }
  });
});

describe('validación de valores', () => {
  const conteos = { objetivos: 0, interacciones: 0 };

  it('un vocabulario fuera de lista es 406', () => {
    expect(validarEscritura('cmi.completion_status', 'terminado', ABIERTO, conteos)).toBe(
      TIPO_INCORRECTO,
    );
    expect(validarEscritura('cmi.completion_status', 'completed', ABIERTO, conteos)).toBe(OK);
    expect(validarEscritura('cmi.success_status', 'passed', ABIERTO, conteos)).toBe(OK);
  });

  it('una nota fuera de rango es 407', () => {
    expect(validarEscritura('cmi.score.scaled', '1.5', ABIERTO, conteos)).toBe(VALOR_FUERA_DE_RANGO);
    expect(validarEscritura('cmi.score.scaled', '-1', ABIERTO, conteos)).toBe(OK);
    expect(validarEscritura('cmi.progress_measure', '-0.1', ABIERTO, conteos)).toBe(
      VALOR_FUERA_DE_RANGO,
    );
  });

  it('una nota que no es número es 406', () => {
    expect(validarEscritura('cmi.score.scaled', 'ocho', ABIERTO, conteos)).toBe(TIPO_INCORRECTO);
  });

  it('una duración mal formada es 406', () => {
    expect(validarEscritura('cmi.session_time', '40 minutos', ABIERTO, conteos)).toBe(
      TIPO_INCORRECTO,
    );
    expect(validarEscritura('cmi.session_time', 'PT40M', ABIERTO, conteos)).toBe(OK);
  });

  // §6 · `suspend_data` son 64 000 caracteres en 2004 (4 096 era 1.2). Truncarlo es perder
  // el avance de alguien en un curso de 40 minutos, y eso se paga con que no lo repita.
  it('suspend_data admite 64 000 caracteres y rechaza 64 001', () => {
    expect(validarEscritura('cmi.suspend_data', 'x'.repeat(64_000), ABIERTO, conteos)).toBe(OK);
    expect(validarEscritura('cmi.suspend_data', 'x'.repeat(64_001), ABIERTO, conteos)).toBe(
      TIPO_INCORRECTO,
    );
  });

  it('location admite 1 000 caracteres', () => {
    expect(validarEscritura('cmi.location', 'x'.repeat(1_000), ABIERTO, conteos)).toBe(OK);
    expect(validarEscritura('cmi.location', 'x'.repeat(1_001), ABIERTO, conteos)).toBe(
      TIPO_INCORRECTO,
    );
  });
});

describe('colecciones', () => {
  // P9 · escribir el índice 3 cuando el conteo es 1 es 351. Aceptarlo en silencio hace que
  // un curso que consulta `_count` y recibe basura escriba basura.
  it('un índice fuera de orden es 351', () => {
    expect(
      validarEscritura('cmi.objectives.3.id', 'obj-3', ABIERTO, { objetivos: 1, interacciones: 0 }),
    ).toBe(FALLO_GENERAL_AL_FIJAR);
  });

  it('el índice siguiente al conteo se acepta: es agregar', () => {
    expect(
      validarEscritura('cmi.objectives.1.id', 'obj-2', ABIERTO, { objetivos: 1, interacciones: 0 }),
    ).toBe(OK);
  });

  it('un índice existente se acepta: es corregir', () => {
    expect(
      validarEscritura('cmi.objectives.0.id', 'obj-1', ABIERTO, { objetivos: 1, interacciones: 0 }),
    ).toBe(OK);
  });
});

describe('frase', () => {
  it('cada código tiene su frase del estándar', () => {
    expect(frase(0)).toBe('No Error');
    expect(frase(404)).toBe('Data Model Element Is Read Only');
    expect(frase(9999)).toBe('General Exception');
  });
});
