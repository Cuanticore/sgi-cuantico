// lib/sig/eventos.ts
//
// Eventos e incidentes de seguridad (REQ-SIG-07 §3.1).
//
// Es el único mecanismo del SGSI que había quedado sin construir: REQ-SIG-01 §2.2 lo dejó
// explícitamente fuera de alcance, y es el que alimenta el origen `incidente` que el módulo
// de Mejora ya acepta.
//
// **Tres cosas que este módulo calcula y que la tabla NO guarda**: la severidad, el estado y
// el tiempo hasta evaluar. Las tres son derivables, y guardarlas produciría el mismo
// problema tres veces: una severidad almacenada que no cambia al corregir un impacto, un
// estado que se queda viejo, y un tiempo que nadie recalcula.

export type Veredicto = 'INCIDENTE' | 'OBSERVACION' | 'FALSO_POSITIVO';
export type DimensionCID = 'CONFIDENCIALIDAD' | 'INTEGRIDAD' | 'DISPONIBILIDAD';
export type NivelImpacto = 'NINGUNO' | 'BAJO' | 'MEDIO' | 'ALTO';

export interface Impacto {
  dimension: DimensionCID;
  nivel: NivelImpacto;
}

const ORDEN_NIVEL: Record<NivelImpacto, number> = {
  NINGUNO: 0,
  BAJO: 1,
  MEDIO: 2,
  ALTO: 3,
};

/// **O5 · la severidad es el MAYOR de los tres impactos.** Una sola dimensión en alto basta
/// para que el incidente sea alto. Nunca se captura ni se almacena.
///
/// Sin impactos declarados devuelve `null` y no `NINGUNO`: no es lo mismo «se evaluó y no
/// hubo impacto» que «nadie lo evaluó todavía», y pintar el segundo como el primero diría
/// que un incidente sin evaluar es inofensivo.
export function severidad(impactos: readonly Impacto[]): NivelImpacto | null {
  if (impactos.length === 0) return null;
  return impactos.reduce<NivelImpacto>(
    (peor, i) => (ORDEN_NIVEL[i.nivel] > ORDEN_NIVEL[peor] ? i.nivel : peor),
    'NINGUNO',
  );
}

export type EstadoEvento =
  | 'POR_EVALUAR'
  | 'EN_TRATAMIENTO'
  | 'CERRADO'
  | 'ARCHIVADO';

export interface MarcasEvento {
  veredicto: Veredicto | null;
  fechaCierre: Date | null;
}

/// El estado se calcula del veredicto y las marcas de cierre.
///
/// **O4 · sólo `INCIDENTE` abre el ciclo completo.** Con `OBSERVACION` o `FALSO_POSITIVO` el
/// evento se archiva en la misma pantalla de evaluación y las tres etapas siguientes no
/// aplican — por eso `ARCHIVADO` es un estado distinto de `CERRADO`: cerrar un incidente
/// exige lección aprendida, archivar una observación no.
export function estadoDelEvento(m: MarcasEvento): EstadoEvento {
  if (m.veredicto === null) return 'POR_EVALUAR';
  if (m.veredicto !== 'INCIDENTE') return 'ARCHIVADO';
  return m.fechaCierre !== null ? 'CERRADO' : 'EN_TRATAMIENTO';
}

/// Cuánto tardó en evaluarse, en horas. Es el indicador de reacción de la cláusula 9.1.
///
/// `null` mientras no se evalúe: un cero diría que se evaluó al instante.
export function horasHastaEvaluar(creadoEn: Date, fechaEvaluacion: Date | null): number | null {
  if (fechaEvaluacion === null) return null;
  return Math.round((fechaEvaluacion.getTime() - creadoEn.getTime()) / 3_600_000);
}

/// **O3 · la justificación es obligatoria en los TRES veredictos.** Archivar como falso
/// positivo sin decir por qué es peor que no evaluar: deja el evento fuera de la estadística
/// sin dejar rastro de la decisión.
export function validarEvaluacion(datos: {
  veredicto: Veredicto | null;
  justificacion: string | null;
}): string[] {
  const errores: string[] = [];
  if (datos.veredicto === null) {
    errores.push('elegí el veredicto');
  }
  if ((datos.justificacion ?? '').trim().length < 10) {
    errores.push(
      'la justificación es obligatoria en los tres veredictos, también en falso positivo',
    );
  }
  return errores;
}

export interface DatosCierreEvento {
  veredicto: Veredicto | null;
  impactos: readonly Impacto[];
  leccionAprendida: string | null;
  causaRaiz: string | null;
}

/// Qué falta para cerrar un incidente. Devuelve la lista completa.
///
/// **O6 · sin lección aprendida no se cierra** (A.5.27): es la única forma de que el
/// mecanismo produzca aprendizaje en vez de archivo.
///
/// **O7 · con impacto `ALTO` en cualquier dimensión tampoco se cierra sin análisis de causa
/// raíz**, y ese análisis se levanta como hallazgo en Mejora con método declarado.
export function validarCierreEvento(d: DatosCierreEvento): string[] {
  const errores: string[] = [];

  // O4: lo que no es incidente no se «cierra», se archivó al evaluar.
  if (d.veredicto !== 'INCIDENTE') {
    errores.push('sólo un incidente se cierra; una observación o un falso positivo ya quedó archivado');
    return errores;
  }
  if ((d.leccionAprendida ?? '').trim().length < 10) {
    errores.push('sin lección aprendida no se cierra un incidente (A.5.27)');
  }
  if (severidad(d.impactos) === 'ALTO' && (d.causaRaiz ?? '').trim().length < 10) {
    errores.push(
      'con impacto alto en alguna dimensión hace falta el análisis de causa raíz, y ese ' +
        'análisis se levanta como hallazgo en Mejora con método declarado',
    );
  }
  return errores;
}

/// **O8 · el hallazgo no vive en el incidente.** Vive en Mejora, con `origen = INCIDENTE` y
/// la referencia tipada al evento. Esto sólo dice si corresponde levantarlo.
///
/// Se levanta cuando la severidad es alta: es el umbral que O7 fija al exigir causa raíz, y
/// tenerlo en una función evita que la pantalla lo repita con otro criterio.
export function correspondeLevantarHallazgo(
  veredicto: Veredicto | null,
  impactos: readonly Impacto[],
): boolean {
  return veredicto === 'INCIDENTE' && severidad(impactos) === 'ALTO';
}

/// `EVT-2026-0031`.
export function codigoEvento(anio: number, consecutivo: number): string {
  return `EVT-${anio}-${String(consecutivo).padStart(4, '0')}`;
}

/// **O2 · lo que el formulario de reporte NO pide.** Está acá y no sólo en la pantalla
/// porque es una decisión, no una omisión: pedirle a quien reporta que clasifique la
/// gravedad es la forma más eficaz de que no reporte. Todo esto lo decide la evaluación.
export const NO_SE_PIDE_AL_REPORTAR = [
  'la gravedad',
  'la categoría',
  'los activos afectados',
  'el impacto en confidencialidad, integridad o disponibilidad',
  'la causa raíz',
];

export const ETIQUETA_ESTADO_EVENTO: Record<EstadoEvento, string> = {
  POR_EVALUAR: 'Por evaluar',
  EN_TRATAMIENTO: 'En tratamiento',
  CERRADO: 'Cerrado',
  ARCHIVADO: 'Archivado',
};

export const ETIQUETA_VEREDICTO: Record<Veredicto, string> = {
  INCIDENTE: 'Incidente',
  OBSERVACION: 'Observación',
  FALSO_POSITIVO: 'Falso positivo',
};

export const ETIQUETA_DIMENSION: Record<DimensionCID, string> = {
  CONFIDENCIALIDAD: 'Confidencialidad',
  INTEGRIDAD: 'Integridad',
  DISPONIBILIDAD: 'Disponibilidad',
};

export const ETIQUETA_NIVEL: Record<NivelImpacto, string> = {
  NINGUNO: 'Ninguno',
  BAJO: 'Bajo',
  MEDIO: 'Medio',
  ALTO: 'Alto',
};
