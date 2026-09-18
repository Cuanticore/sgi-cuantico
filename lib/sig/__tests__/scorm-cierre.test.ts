// lib/sig/__tests__/scorm-cierre.test.ts
//
// Lo que se prueba acá es quién tiene la última palabra sobre si alguien aprobó.
//
// P15 · la da `notaMinima` del SIG, no el curso. `cmi.scaled_passing_score` es lo que opina
// el autor del contenido; `notaMinima` es lo que exige la organización. Y el veredicto se
// calcula con `aprobadoDe()`, que ya existe y ya se usa en el cierre manual: dos formas de
// decidir lo mismo terminan discrepando, y la discrepancia aparece en la auditoría.

import { calificacionDe, veredictoDelIntento, resultadoDeclarado } from '../scorm-cierre';

describe('resultadoDeclarado · la persona declara que terminó (REQ-SIG-24, plan de confianza)', () => {
  // Coursebox no reporta la completitud por SCORM, así que se ofrece registrarla a mano y se
  // confía en el registro. La declaración es SIEMPRE «completado»; la nota es opcional.
  it('sin nota es un curso completado sin resultado medido', () => {
    const r = resultadoDeclarado(null);
    expect(r.completionStatus).toBe('completed');
    expect(r.successStatus).toBe('unknown');
    expect(r.scoreScaled).toBeNull();
  });

  // Un curso que NO exige evaluación se cierra con la sola declaración: completó, sin nota.
  it('un curso sin evaluación se cierra con la sola declaración', () => {
    const v = veredictoDelIntento(resultadoDeclarado(null), { exigeEvaluacion: false, notaMinima: null });
    expect(v.cierra).toBe(true);
    expect(v.asistio).toBe(true);
  });

  // Un curso que SÍ exige evaluación no se cierra sin nota (P16): la declaración de nota es
  // lo que falta, y por eso la opción la pide cuando el contenido la exige.
  it('un curso con evaluación NO se cierra si no se declara la nota', () => {
    const v = veredictoDelIntento(resultadoDeclarado(null), { exigeEvaluacion: true, notaMinima: 60 });
    expect(v.cierra).toBe(false);
  });

  // Con la nota declarada, el veredicto lo da `notaMinima` como en cualquier cierre. La nota
  // va en 0–100, igual que la que produce `calificacionDe`.
  it('con la nota declarada, cierra y decide aprobado con notaMinima', () => {
    const aprob = veredictoDelIntento(resultadoDeclarado(80), { exigeEvaluacion: true, notaMinima: 60 });
    expect(aprob.cierra).toBe(true);
    expect(aprob.calificacion).toBe(80);
    expect(aprob.aprobado).toBe(true);
    const reprob = veredictoDelIntento(resultadoDeclarado(30), { exigeEvaluacion: true, notaMinima: 60 });
    expect(reprob.aprobado).toBe(false);
  });
});

const COMPLETO = {
  completionStatus: 'completed',
  successStatus: 'passed',
  scoreScaled: 0.9,
  scoreRaw: null,
  scoreMin: null,
  scoreMax: null,
};

const CON_EVALUACION = { exigeEvaluacion: true, notaMinima: 80 };
const SIN_EVALUACION = { exigeEvaluacion: false, notaMinima: null };

describe('calificacionDe', () => {
  it('scaled manda y se lleva a 0–100', () => {
    expect(calificacionDe({ ...COMPLETO, scoreScaled: 0.9 })).toBe(90);
  });

  it('sin scaled normaliza raw contra min y max', () => {
    expect(
      calificacionDe({ ...COMPLETO, scoreScaled: null, scoreRaw: 15, scoreMin: 0, scoreMax: 20 }),
    ).toBe(75);
  });

  it('sin min declarado asume cero', () => {
    expect(
      calificacionDe({ ...COMPLETO, scoreScaled: null, scoreRaw: 8, scoreMin: null, scoreMax: 10 }),
    ).toBe(80);
  });

  // Un raw sin máximo no se puede normalizar: inventar un 100 sería inventar la nota.
  it('raw sin máximo no produce nota', () => {
    expect(
      calificacionDe({ ...COMPLETO, scoreScaled: null, scoreRaw: 8, scoreMin: null, scoreMax: null }),
    ).toBeNull();
  });

  it('sin ninguna nota devuelve null', () => {
    expect(calificacionDe({ ...COMPLETO, scoreScaled: null })).toBeNull();
  });
});

describe('veredictoDelIntento', () => {
  it('un curso sin terminar no registra ni cierra', () => {
    const v = veredictoDelIntento({ ...COMPLETO, completionStatus: 'incomplete' }, CON_EVALUACION);
    expect(v).toEqual(
      expect.objectContaining({ registrar: false, cierra: false }),
    );
    expect(v.motivo).toMatch(/todavía no/i);
  });

  it('completado y aprobado por encima del mínimo cierra', () => {
    const v = veredictoDelIntento(COMPLETO, CON_EVALUACION);
    expect(v).toEqual(
      expect.objectContaining({ registrar: true, cierra: true, asistio: true, calificacion: 90, aprobado: true }),
    );
  });

  // P15 · el curso dice «passed» pero la organización exige 80 y sacó 60. Manda el SIG.
  it('aprobado por el curso pero bajo el mínimo del SIG no cierra', () => {
    const v = veredictoDelIntento({ ...COMPLETO, scoreScaled: 0.6 }, CON_EVALUACION);
    expect(v).toEqual(
      expect.objectContaining({ registrar: true, cierra: false, aprobado: false, calificacion: 60 }),
    );
    expect(v.motivo).toMatch(/80/);
  });

  it('reprobado por el curso registra el intento y deja la asignación abierta', () => {
    const v = veredictoDelIntento(
      { ...COMPLETO, successStatus: 'failed', scoreScaled: 0.4 },
      CON_EVALUACION,
    );
    expect(v).toEqual(expect.objectContaining({ registrar: true, cierra: false, aprobado: false }));
  });

  // P16 · «terminé» sin resultado, en una capacitación que exige evaluación, no es aprobar.
  // Cerrarla como aprobada sería inventar el dato que falta.
  //
  // «Sin resultado» es sin `success_status` Y sin nota: si el curso reportó una nota, el
  // dato que `notaMinima` necesita está, y P15 manda que el SIG decida con esa nota. El
  // fixture anula `scoreScaled` a propósito — con la nota de COMPLETO (0.9) este caso no
  // sería «sin resultado» sino «con nota y sin veredicto del autor», que es el caso de más
  // abajo.
  it('completado sin resultado no cierra cuando se exige evaluación', () => {
    const v = veredictoDelIntento(
      { ...COMPLETO, successStatus: 'unknown', scoreScaled: null },
      CON_EVALUACION,
    );
    expect(v.registrar).toBe(true);
    expect(v.cierra).toBe(false);
    expect(v.motivo).toMatch(/no reportó/i);
  });

  // P15 · el autor del curso no opinó («unknown») pero reportó la nota, y el SIG tiene su
  // mínimo: hay con qué decidir, y decide el SIG. No es el caso de P16 porque no falta
  // ningún dato que haya que inventar.
  it('completado sin veredicto del curso pero con nota suficiente cierra', () => {
    const v = veredictoDelIntento({ ...COMPLETO, successStatus: 'unknown' }, CON_EVALUACION);
    expect(v).toEqual(
      expect.objectContaining({ registrar: true, cierra: true, aprobado: true, calificacion: 90 }),
    );
  });

  it('sin evaluación exigida, completar alcanza', () => {
    const v = veredictoDelIntento(
      { ...COMPLETO, successStatus: 'unknown', scoreScaled: null },
      SIN_EVALUACION,
    );
    expect(v).toEqual(
      expect.objectContaining({ registrar: true, cierra: true, aprobado: null, calificacion: null }),
    );
  });

  it('con evaluación exigida y sin nota mínima declarada, el resultado del curso alcanza', () => {
    const v = veredictoDelIntento(COMPLETO, { exigeEvaluacion: true, notaMinima: null });
    expect(v).toEqual(expect.objectContaining({ cierra: true, aprobado: true }));
  });
});
