// lib/sig/scorm-cierre.ts
//
// De lo que reportó el SCO a lo que se escribe en `RegistroRealizado`.
//
// Reusa `aprobadoDe()` y `cierraLaAsignacion()` de `cierre.ts` en vez de reimplementar el
// veredicto (P15). Esa función ya congela el `aprobado` del cierre manual y ya sabe que una
// capacitación reprobada NO cierra: el intento queda registrado con su nota y la obligación
// sigue exigible para repetir la evaluación. Un curso SCORM no cambia esa regla — sólo
// cambia quién trae los datos.

import { aprobadoDe, cierraLaAsignacion } from './cierre';

export interface ResultadoDelSco {
  completionStatus: string;
  successStatus: string;
  scoreScaled: number | null;
  scoreRaw: number | null;
  scoreMin: number | null;
  scoreMax: number | null;
}

export interface ExigenciaDelContenido {
  exigeEvaluacion: boolean;
  notaMinima: number | null;
}

export interface Veredicto {
  /// ¿Se crea el `RegistroRealizado`? Un curso a medias no deja registro; un curso
  /// terminado sí, aunque no cierre.
  registrar: boolean;
  /// ¿La asignación pasa a REALIZADA?
  cierra: boolean;
  asistio: boolean;
  calificacion: number | null;
  /// `null` cuando no hay nada que aprobar: sin evaluación exigida o sin nota.
  aprobado: boolean | null;
  /// La frase que ve la persona. Dice qué pasó y qué falta, en ese orden.
  motivo: string;
}

/// La nota en 0–100. `cmi.score.scaled` manda porque es la única que el estándar define
/// normalizada; `raw` sólo sirve si el curso declaró su máximo, y sin máximo no se
/// normaliza: inventar un 100 sería inventar la nota.
export function calificacionDe(r: ResultadoDelSco): number | null {
  if (r.scoreScaled !== null) return redondear(r.scoreScaled * 100);
  if (r.scoreRaw === null || r.scoreMax === null) return null;
  const min = r.scoreMin ?? 0;
  const rango = r.scoreMax - min;
  if (rango <= 0) return null;
  return redondear(((r.scoreRaw - min) / rango) * 100);
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export function veredictoDelIntento(
  r: ResultadoDelSco,
  e: ExigenciaDelContenido,
): Veredicto {
  if (r.completionStatus !== 'completed') {
    return {
      registrar: false,
      cierra: false,
      asistio: false,
      calificacion: null,
      aprobado: null,
      motivo: 'el curso todavía no reportó que terminó',
    };
  }

  const calificacion = calificacionDe(r);

  // P16 · «terminé» sin resultado, en una capacitación que exige evaluación, no alcanza.
  //
  // «Sin resultado» es sin veredicto del autor Y sin nota. Si el curso reportó la nota, el
  // dato que `notaMinima` necesita está sobre la mesa y P15 manda que decida el SIG: no
  // falta nada que haya que inventar, así que este corte no aplica.
  if (e.exigeEvaluacion && r.successStatus === 'unknown' && calificacion === null) {
    return {
      registrar: true,
      cierra: false,
      asistio: true,
      calificacion: null,
      aprobado: null,
      motivo:
        'el curso reportó que terminó pero no reportó resultado, y esta capacitación exige ' +
        'evaluación. La asignación sigue abierta.',
    };
  }

  const aprobado = decidirAprobado(r, e, calificacion);

  // La regla de si cierra es la MISMA del cierre manual, con los datos del curso.
  const cierra = cierraLaAsignacion({
    tipo: 'CAPACITACION',
    asistio: true,
    calificacion,
    exigeEvaluacion: e.exigeEvaluacion,
    notaMinima: e.notaMinima,
  })
    ? aprobado !== false
    : false;

  return {
    registrar: true,
    cierra,
    asistio: true,
    calificacion,
    aprobado,
    motivo: cierra
      ? 'el curso reportó que terminó y el resultado cumple lo exigido'
      : aprobado === false && e.notaMinima !== null
        ? `el resultado no alcanza la nota mínima exigida (${e.notaMinima}). El intento queda ` +
          'registrado y la asignación sigue abierta para repetir la evaluación.'
        : 'el curso reportó reprobado. El intento queda registrado y la asignación sigue abierta.',
  };
}

/// El orden importa. Primero el veredicto del SIG cuando hay nota mínima —P15—, y sólo si
/// no hay con qué decidir se toma lo que dijo el curso.
function decidirAprobado(
  r: ResultadoDelSco,
  e: ExigenciaDelContenido,
  calificacion: number | null,
): boolean | null {
  // `aprobadoDe` acepta `number | null | undefined` y devuelve `null` cuando no se puede
  // decidir (falta la nota o el mínimo): `lib/sig/cierre.ts:145-158`.
  const porNota = aprobadoDe(calificacion, e.notaMinima);
  if (porNota !== null) return porNota;
  if (r.successStatus === 'passed') return true;
  if (r.successStatus === 'failed') return false;
  return null;
}
