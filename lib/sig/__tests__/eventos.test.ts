// lib/sig/__tests__/eventos.test.ts
//
// Eventos e incidentes. Lo que se prueba aca son las tres cosas que la tabla NO guarda —
// severidad, estado y tiempo hasta evaluar— y las dos puertas de cierre.
//
// La distincion que mas se repite en estas pruebas: **`null` no es un valor bajo.** Un
// evento sin impactos declarados no tiene severidad NINGUNO, no tiene severidad; y pintar
// lo segundo como lo primero diria que un incidente sin evaluar es inofensivo.

import {
  codigoEvento,
  correspondeLevantarHallazgo,
  estadoDelEvento,
  horasHastaEvaluar,
  NO_SE_PIDE_AL_REPORTAR,
  severidad,
  validarCierreEvento,
  validarEvaluacion,
  type Impacto,
} from '../eventos';

const imp = (c: string, i: string, d: string): Impacto[] => [
  { dimension: 'CONFIDENCIALIDAD', nivel: c as Impacto['nivel'] },
  { dimension: 'INTEGRIDAD', nivel: i as Impacto['nivel'] },
  { dimension: 'DISPONIBILIDAD', nivel: d as Impacto['nivel'] },
];

describe('severidad · O5', () => {
  // «Una sola dimension en alto basta para que el incidente sea alto.» Es un MAXIMO, no un
  // promedio: promediar diria que un incidente que expuso datos confidenciales pero no
  // afecto la disponibilidad es «medio», y no lo es.
  it('es el MAYOR de los tres, no el promedio', () => {
    expect(severidad(imp('ALTO', 'NINGUNO', 'NINGUNO'))).toBe('ALTO');
    expect(severidad(imp('BAJO', 'MEDIO', 'BAJO'))).toBe('MEDIO');
    expect(severidad(imp('NINGUNO', 'NINGUNO', 'NINGUNO'))).toBe('NINGUNO');
  });

  it('cualquiera de las tres dimensiones puede mandar', () => {
    expect(severidad(imp('NINGUNO', 'NINGUNO', 'ALTO'))).toBe('ALTO');
    expect(severidad(imp('NINGUNO', 'ALTO', 'NINGUNO'))).toBe('ALTO');
  });

  // LA DISTINCION. Sin impactos NO es `NINGUNO`: es que nadie evaluo todavia. Devolver
  // `NINGUNO` diria que un incidente sin evaluar es inofensivo.
  it('sin impactos declarados devuelve null, no NINGUNO', () => {
    expect(severidad([])).toBeNull();
  });
});

describe('estadoDelEvento · el estado no se almacena', () => {
  it('sin veredicto esta por evaluar', () => {
    expect(estadoDelEvento({ veredicto: null, fechaCierre: null })).toBe('POR_EVALUAR');
  });

  it('un incidente sin cerrar esta en tratamiento', () => {
    expect(estadoDelEvento({ veredicto: 'INCIDENTE', fechaCierre: null })).toBe('EN_TRATAMIENTO');
  });

  it('un incidente con fecha de cierre esta cerrado', () => {
    expect(estadoDelEvento({ veredicto: 'INCIDENTE', fechaCierre: new Date() })).toBe('CERRADO');
  });

  // O4 · solo INCIDENTE abre el ciclo completo. ARCHIVADO es un estado DISTINTO de CERRADO:
  // cerrar un incidente exige leccion aprendida, archivar una observacion no. Colapsarlos
  // haria que la estadistica de «cerrados» incluyera cosas que nadie trato.
  it('una observacion queda ARCHIVADA, no cerrada', () => {
    expect(estadoDelEvento({ veredicto: 'OBSERVACION', fechaCierre: null })).toBe('ARCHIVADO');
    expect(estadoDelEvento({ veredicto: 'FALSO_POSITIVO', fechaCierre: null })).toBe('ARCHIVADO');
  });
});

describe('horasHastaEvaluar', () => {
  it('cuenta las horas entre el reporte y la evaluacion', () => {
    expect(
      horasHastaEvaluar(new Date('2026-09-01T08:00:00Z'), new Date('2026-09-01T14:00:00Z')),
    ).toBe(6);
  });

  it('cruza el dia sin problema', () => {
    expect(
      horasHastaEvaluar(new Date('2026-09-01T20:00:00Z'), new Date('2026-09-02T08:00:00Z')),
    ).toBe(12);
  });

  // Un cero diria que se evaluo al instante, que es lo contrario de no haberse evaluado.
  it('sin evaluar devuelve null, no cero', () => {
    expect(horasHastaEvaluar(new Date(), null)).toBeNull();
  });
});

describe('validarEvaluacion · O3', () => {
  it('con veredicto y justificacion pasa', () => {
    expect(
      validarEvaluacion({ veredicto: 'INCIDENTE', justificacion: 'Se confirmo el acceso indebido.' }),
    ).toEqual([]);
  });

  // «Archivar como falso positivo sin decir por que es peor que no evaluar»: deja el evento
  // fuera de la estadistica sin dejar rastro de la decision.
  it('un falso positivo TAMBIEN exige justificacion', () => {
    const r = validarEvaluacion({ veredicto: 'FALSO_POSITIVO', justificacion: null });
    expect(r.some((x) => x.includes('también en falso positivo'))).toBe(true);
  });

  it('una observacion tambien', () => {
    expect(validarEvaluacion({ veredicto: 'OBSERVACION', justificacion: '   ' }).length).toBeGreaterThan(0);
  });

  it('sin veredicto lo pide', () => {
    expect(validarEvaluacion({ veredicto: null, justificacion: 'algo suficientemente largo' })).toEqual([
      'elegí el veredicto',
    ]);
  });
});

describe('validarCierreEvento · O6 y O7', () => {
  const base = {
    veredicto: 'INCIDENTE' as const,
    impactos: imp('BAJO', 'BAJO', 'BAJO'),
    leccionAprendida: 'Se reforzo la verificacion del remitente en el filtro de correo.',
    causaRaiz: null,
  };

  it('un incidente de severidad baja cierra con leccion', () => {
    expect(validarCierreEvento(base)).toEqual([]);
  });

  // O6 · A.5.27. Es la unica forma de que el mecanismo produzca aprendizaje en vez de
  // archivo: sin la leccion, cerrar un incidente es archivarlo con otro nombre.
  it('sin leccion aprendida NO se cierra', () => {
    const r = validarCierreEvento({ ...base, leccionAprendida: null });
    expect(r.some((x) => x.includes('A.5.27'))).toBe(true);
  });

  // O7 · con impacto ALTO tampoco se cierra sin causa raiz, y ese analisis se levanta como
  // hallazgo en Mejora con metodo declarado.
  it('con impacto ALTO exige ademas la causa raiz', () => {
    const r = validarCierreEvento({ ...base, impactos: imp('ALTO', 'NINGUNO', 'NINGUNO') });
    expect(r.some((x) => x.includes('causa raíz'))).toBe(true);
  });

  it('con impacto ALTO y causa raiz, cierra', () => {
    expect(
      validarCierreEvento({
        ...base,
        impactos: imp('ALTO', 'NINGUNO', 'NINGUNO'),
        causaRaiz: 'El proveedor no aplico el parche publicado en julio.',
      }),
    ).toEqual([]);
  });

  // Lo que no es incidente no se «cierra»: ya quedo archivado al evaluar. Permitirlo daria
  // dos caminos para lo mismo y dos cifras distintas de «cerrados».
  it('una observacion no se cierra: ya estaba archivada', () => {
    const r = validarCierreEvento({ ...base, veredicto: 'OBSERVACION' });
    expect(r[0]).toContain('ya quedó archivado');
  });
});

describe('correspondeLevantarHallazgo · O8', () => {
  // El hallazgo NO vive en el incidente: vive en Mejora con origen tipado. Esto solo dice si
  // corresponde, y usa el MISMO umbral que O7 — tenerlo en una funcion evita que la pantalla
  // lo repita con otro criterio y las dos discrepen.
  it('corresponde con severidad alta', () => {
    expect(correspondeLevantarHallazgo('INCIDENTE', imp('ALTO', 'NINGUNO', 'NINGUNO'))).toBe(true);
  });

  it('no corresponde con severidad media', () => {
    expect(correspondeLevantarHallazgo('INCIDENTE', imp('MEDIO', 'MEDIO', 'MEDIO'))).toBe(false);
  });

  it('no corresponde si no es incidente', () => {
    expect(correspondeLevantarHallazgo('OBSERVACION', imp('ALTO', 'ALTO', 'ALTO'))).toBe(false);
  });
});

describe('NO_SE_PIDE_AL_REPORTAR · O2', () => {
  // Esta en el codigo y no solo en la pantalla porque es una DECISION, no una omision:
  // «pedirle a quien reporta que clasifique la gravedad es la forma mas eficaz de que no
  // reporte». Si alguien agrega el campo al formulario, esta lista lo contradice por escrito.
  it('nombra las cinco cosas que el formulario no pide', () => {
    expect(NO_SE_PIDE_AL_REPORTAR).toHaveLength(5);
    expect(NO_SE_PIDE_AL_REPORTAR.some((x) => x.includes('gravedad'))).toBe(true);
    expect(NO_SE_PIDE_AL_REPORTAR.some((x) => x.includes('causa raíz'))).toBe(true);
  });
});

describe('codigoEvento', () => {
  it('lleva el año y cuatro digitos', () => {
    expect(codigoEvento(2026, 31)).toBe('EVT-2026-0031');
  });
});
