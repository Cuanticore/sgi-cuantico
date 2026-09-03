// lib/sig/organizaciones.ts
//
// La reevaluación anual de organizaciones que exige POL-TEC-02 (D4).
//
// Todo lo de acá se DERIVA de la última evaluación registrada. Una columna «estado» se
// quedaría vieja el 1 de enero —una organización evaluada en marzo de 2026 pasa a estar
// vencida sin que nadie escriba nada— y nadie se enteraría hasta la auditoría. Es el
// invariante 1 del paquete: lo derivable se calcula, nunca se almacena.
//
// La periodicidad es un PARÁMETRO, no una constante: POL-TEC-02 pide anual, pero el
// invariante 4 dice que ningún plazo va en el código. Entra como argumento con el default
// de la política.

export type ResultadoEvaluacion = 'CUMPLE' | 'CUMPLE_CON_OBSERVACIONES' | 'NO_CUMPLE';

export interface EvaluacionRegistrada {
  anio: number;
  fecha: Date;
  resultado: ResultadoEvaluacion;
}

/// Qué tan al día está la evaluación de una organización.
///
/// `SIN_EVALUAR` no es lo mismo que `VENCIDA`: la primera dice que nunca se evaluó —puede
/// ser una organización que entró la semana pasada— y la segunda que se dejó caducar.
/// Colapsarlas haría que dar de alta un proveedor generara un incumplimiento inmediato.
export type EstadoEvaluacion = 'AL_DIA' | 'POR_VENCER' | 'VENCIDA' | 'SIN_EVALUAR';

/// Cuántos días antes del vencimiento se considera «por vencer». Es el aviso, y como todo
/// plazo entra como parámetro.
export const DIAS_AVISO_EVALUACION = 30;

/// La última evaluación, por año y luego por fecha. El orden importa: dos evaluaciones del
/// mismo año no deberían existir —hay una unique— pero si existieran, manda la más reciente.
export function ultimaEvaluacion(
  evaluaciones: readonly EvaluacionRegistrada[],
): EvaluacionRegistrada | null {
  if (evaluaciones.length === 0) return null;
  return [...evaluaciones].sort(
    (a, b) => b.anio - a.anio || b.fecha.getTime() - a.fecha.getTime(),
  )[0];
}

/// Cuándo toca la siguiente. `null` cuando nunca se evaluó: no hay desde dónde contar, y
/// devolver «hoy» convertiría un alta en un vencimiento.
export function proximaEvaluacion(
  evaluaciones: readonly EvaluacionRegistrada[],
  mesesDePeriodicidad = 12,
): Date | null {
  const ultima = ultimaEvaluacion(evaluaciones);
  if (ultima === null) return null;
  const f = ultima.fecha;
  // `Date.UTC` con el mes desbordado rueda el año solo: mes 14 de 2026 es febrero de 2027.
  return new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + mesesDePeriodicidad, f.getUTCDate()));
}

export function estadoDeEvaluacion(
  evaluaciones: readonly EvaluacionRegistrada[],
  hoy: Date,
  mesesDePeriodicidad = 12,
  diasAviso = DIAS_AVISO_EVALUACION,
): EstadoEvaluacion {
  const proxima = proximaEvaluacion(evaluaciones, mesesDePeriodicidad);
  if (proxima === null) return 'SIN_EVALUAR';
  const MS_DIA = 86_400_000;
  const medianoche = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  // Medianoche UTC y no la fecha empaquetada: restar `YYYYMMDD` da 70 «días» entre el 31
  // de enero y el 1 de febrero. Es la familia de defectos que ya apareció cinco veces en
  // este proyecto.
  const dias = Math.round((medianoche(proxima) - medianoche(hoy)) / MS_DIA);
  if (dias < 0) return 'VENCIDA';
  if (dias <= diasAviso) return 'POR_VENCER';
  return 'AL_DIA';
}

/// El último resultado importa aparte del estado: una organización evaluada al día con
/// `NO_CUMPLE` está peor que una vencida con `CUMPLE`, y un solo semáforo no distingue las
/// dos. El lienzo pinta el resultado y la próxima fecha por separado justamente por eso.
export function resultadoVigente(
  evaluaciones: readonly EvaluacionRegistrada[],
): ResultadoEvaluacion | null {
  return ultimaEvaluacion(evaluaciones)?.resultado ?? null;
}

export const ETIQUETA_ESTADO: Record<EstadoEvaluacion, string> = {
  AL_DIA: 'Al día',
  POR_VENCER: 'Por vencer',
  VENCIDA: 'Vencida',
  SIN_EVALUAR: 'Sin evaluar',
};

export const ETIQUETA_RESULTADO: Record<ResultadoEvaluacion, string> = {
  CUMPLE: 'Cumple',
  CUMPLE_CON_OBSERVACIONES: 'Cumple con observaciones',
  NO_CUMPLE: 'No cumple',
};

export const ETIQUETA_TIPO_ORGANIZACION: Record<string, string> = {
  PROVEEDOR: 'Proveedor',
  CLIENTE: 'Cliente',
  ENTE_CONTROL: 'Ente de control',
  ALIADO: 'Aliado',
  OTRO: 'Otro',
};
