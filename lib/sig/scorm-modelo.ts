// lib/sig/scorm-modelo.ts
//
// El modelo de datos de SCORM 2004 3rd Edition: qué elementos existen, quién puede
// escribirlos, qué valores admiten y qué código de error corresponde a cada infracción.
//
// Es el corazón del player y es PURO, por dos razones que se refuerzan:
//
//   1. Se puede probar de verdad, sin navegador y sin base de datos.
//   2. Corre EN LOS DOS LADOS. El runner valida en el navegador para poder responderle al
//      curso de forma sincrónica —la API de SCORM no admite esperar—, y el servidor valida
//      otra vez antes de persistir (P5), porque un cliente puede mandar cualquier cosa. Al
//      ser el mismo módulo, no hay dos criterios que puedan discrepar.

import { aSegundos } from './scorm-tiempo';

// ── Códigos de error del estándar (P8) ──────────────────────────────────────────────────

export const OK = 0;
export const EXCEPCION_GENERAL = 101;
export const FALLO_GENERAL_AL_INICIALIZAR = 102;
export const YA_INICIALIZADO = 103;
export const CONTENIDO_TERMINADO = 104;
export const FALLO_GENERAL_AL_TERMINAR = 111;
export const TERMINAR_ANTES_DE_INICIALIZAR = 112;
export const TERMINAR_DESPUES_DE_TERMINAR = 113;
export const OBTENER_ANTES_DE_INICIALIZAR = 122;
export const OBTENER_DESPUES_DE_TERMINAR = 123;
export const FIJAR_ANTES_DE_INICIALIZAR = 132;
export const FIJAR_DESPUES_DE_TERMINAR = 133;
export const CONFIRMAR_ANTES_DE_INICIALIZAR = 142;
export const CONFIRMAR_DESPUES_DE_TERMINAR = 143;
export const ARGUMENTO_GENERAL_INVALIDO = 201;
export const FALLO_GENERAL_AL_OBTENER = 301;
export const FALLO_GENERAL_AL_FIJAR = 351;
export const FALLO_GENERAL_AL_CONFIRMAR = 391;
export const ELEMENTO_NO_DEFINIDO = 401;
export const ELEMENTO_NO_IMPLEMENTADO = 402;
export const VALOR_NO_INICIALIZADO = 403;
export const ELEMENTO_SOLO_LECTURA = 404;
export const ELEMENTO_SOLO_ESCRITURA = 405;
export const TIPO_INCORRECTO = 406;
export const VALOR_FUERA_DE_RANGO = 407;
export const DEPENDENCIA_NO_ESTABLECIDA = 408;

/// Las frases son las del estándar y van EN INGLÉS: `GetErrorString` es parte de la API que
/// consume el curso, no un mensaje para una persona. Lo que sí va en español es el
/// diagnóstico nuestro (`GetDiagnostic`), que es donde se explica qué pasó.
const FRASES: Record<number, string> = {
  0: 'No Error',
  101: 'General Exception',
  102: 'General Initialization Failure',
  103: 'Already Initialized',
  104: 'Content Instance Terminated',
  111: 'General Termination Failure',
  112: 'Termination Before Initialization',
  113: 'Termination After Termination',
  122: 'Retrieve Data Before Initialization',
  123: 'Retrieve Data After Termination',
  132: 'Store Data Before Initialization',
  133: 'Store Data After Termination',
  142: 'Commit Before Initialization',
  143: 'Commit After Termination',
  201: 'General Argument Error',
  301: 'General Get Failure',
  351: 'General Set Failure',
  391: 'General Commit Failure',
  401: 'Undefined Data Model Element',
  402: 'Unimplemented Data Model Element',
  403: 'Data Model Element Value Not Initialized',
  404: 'Data Model Element Is Read Only',
  405: 'Data Model Element Is Write Only',
  406: 'Data Model Element Type Mismatch',
  407: 'Data Model Element Value Out Of Range',
  408: 'Data Model Dependency Not Established',
};

export function frase(codigo: number): string {
  return FRASES[codigo] ?? FRASES[EXCEPCION_GENERAL];
}

// ── El modelo ───────────────────────────────────────────────────────────────────────────

export type Acceso = 'RO' | 'RW' | 'WO';

export type Tipo =
  | { clase: 'cadena'; largoMaximo: number }
  | { clase: 'vocabulario'; valores: readonly string[] }
  | { clase: 'decimal'; minimo: number; maximo: number }
  | { clase: 'duracion' }
  | { clase: 'entero'; minimo: number };

export interface Definicion {
  acceso: Acceso;
  tipo: Tipo;
}

const ESTADO_COMPLETITUD = ['completed', 'incomplete', 'not attempted', 'unknown'] as const;
const ESTADO_EXITO = ['passed', 'failed', 'unknown'] as const;
const SALIDA = ['time-out', 'suspend', 'logout', 'normal', ''] as const;
const ENTRADA = ['ab-initio', 'resume', ''] as const;
const MODO = ['browse', 'normal', 'review'] as const;
const CREDITO = ['credit', 'no-credit'] as const;
const NAVEGACION = ['continue', 'previous', 'choice', 'exit', 'exitAll', 'abandon', 'abandonAll', '_none_'] as const;

const cadena = (largoMaximo: number): Tipo => ({ clase: 'cadena', largoMaximo });
const vocabulario = (valores: readonly string[]): Tipo => ({ clase: 'vocabulario', valores });
const decimal = (minimo: number, maximo: number): Tipo => ({ clase: 'decimal', minimo, maximo });

/// Los elementos del requerimiento §6, con `n` donde va el índice de una colección.
export const ELEMENTOS: Record<string, Definicion> = {
  'cmi._version': { acceso: 'RO', tipo: cadena(20) },
  'cmi.learner_id': { acceso: 'RO', tipo: cadena(4000) },
  'cmi.learner_name': { acceso: 'RO', tipo: cadena(250) },
  'cmi.completion_status': { acceso: 'RW', tipo: vocabulario(ESTADO_COMPLETITUD) },
  'cmi.success_status': { acceso: 'RW', tipo: vocabulario(ESTADO_EXITO) },
  'cmi.score.scaled': { acceso: 'RW', tipo: decimal(-1, 1) },
  'cmi.score.raw': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.score.min': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.score.max': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.progress_measure': { acceso: 'RW', tipo: decimal(0, 1) },
  'cmi.session_time': { acceso: 'WO', tipo: { clase: 'duracion' } },
  'cmi.total_time': { acceso: 'RO', tipo: { clase: 'duracion' } },
  'cmi.location': { acceso: 'RW', tipo: cadena(1000) },
  'cmi.suspend_data': { acceso: 'RW', tipo: cadena(64_000) },
  'cmi.entry': { acceso: 'RO', tipo: vocabulario(ENTRADA) },
  'cmi.exit': { acceso: 'WO', tipo: vocabulario(SALIDA) },
  'cmi.credit': { acceso: 'RO', tipo: vocabulario(CREDITO) },
  'cmi.mode': { acceso: 'RO', tipo: vocabulario(MODO) },
  'cmi.launch_data': { acceso: 'RO', tipo: cadena(4000) },
  'cmi.scaled_passing_score': { acceso: 'RO', tipo: decimal(-1, 1) },
  'cmi.completion_threshold': { acceso: 'RO', tipo: decimal(0, 1) },
  'cmi.max_time_allowed': { acceso: 'RO', tipo: { clase: 'duracion' } },
  'cmi.time_limit_action': {
    acceso: 'RO',
    tipo: vocabulario(['exit,message', 'continue,message', 'exit,no message', 'continue,no message']),
  },
  'cmi.objectives._count': { acceso: 'RO', tipo: { clase: 'entero', minimo: 0 } },
  'cmi.objectives.n.id': { acceso: 'RW', tipo: cadena(4000) },
  'cmi.objectives.n.success_status': { acceso: 'RW', tipo: vocabulario(ESTADO_EXITO) },
  'cmi.objectives.n.completion_status': { acceso: 'RW', tipo: vocabulario(ESTADO_COMPLETITUD) },
  'cmi.objectives.n.progress_measure': { acceso: 'RW', tipo: decimal(0, 1) },
  'cmi.objectives.n.description': { acceso: 'RW', tipo: cadena(250) },
  'cmi.objectives.n.score.scaled': { acceso: 'RW', tipo: decimal(-1, 1) },
  'cmi.objectives.n.score.raw': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.objectives.n.score.min': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.objectives.n.score.max': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.interactions._count': { acceso: 'RO', tipo: { clase: 'entero', minimo: 0 } },
  'cmi.interactions.n.id': { acceso: 'RW', tipo: cadena(4000) },
  'cmi.interactions.n.type': {
    acceso: 'RW',
    tipo: vocabulario([
      'true-false', 'choice', 'fill-in', 'long-fill-in', 'likert', 'matching',
      'performance', 'sequencing', 'numeric', 'other',
    ]),
  },
  'cmi.interactions.n.timestamp': { acceso: 'RW', tipo: cadena(30) },
  'cmi.interactions.n.learner_response': { acceso: 'RW', tipo: cadena(4000) },
  'cmi.interactions.n.correct_responses._count': { acceso: 'RO', tipo: { clase: 'entero', minimo: 0 } },
  'cmi.interactions.n.result': { acceso: 'RW', tipo: cadena(250) },
  'cmi.interactions.n.weighting': { acceso: 'RW', tipo: decimal(-1_000_000, 1_000_000) },
  'cmi.interactions.n.latency': { acceso: 'RW', tipo: { clase: 'duracion' } },
  'cmi.interactions.n.description': { acceso: 'RW', tipo: cadena(250) },
  'cmi.interactions.n.objectives._count': { acceso: 'RO', tipo: { clase: 'entero', minimo: 0 } },
  'cmi.comments_from_learner._count': { acceso: 'RO', tipo: { clase: 'entero', minimo: 0 } },
  'cmi.comments_from_learner.n.comment': { acceso: 'RW', tipo: cadena(4000) },
  'cmi.comments_from_learner.n.location': { acceso: 'RW', tipo: cadena(250) },
  'cmi.comments_from_learner.n.timestamp': { acceso: 'RW', tipo: cadena(30) },
  // D-3 · con un solo SCO la navegación es trivial, pero los elementos EXISTEN: un curso
  // que pregunta y recibe 401 puede decidir que el LMS está roto.
  'adl.nav.request': { acceso: 'RW', tipo: vocabulario(NAVEGACION) },
  'adl.nav.request_valid.continue': { acceso: 'RO', tipo: cadena(20) },
  'adl.nav.request_valid.previous': { acceso: 'RO', tipo: cadena(20) },
};

const INDICE = /\.(\d+)\./;

export function normalizar(elemento: string): string {
  return elemento.replace(/\.\d+\./g, '.n.');
}

export function indiceDe(elemento: string): number | null {
  const m = INDICE.exec(elemento);
  return m === null ? null : Number(m[1]);
}

export function definicionDe(elemento: string): Definicion | null {
  return ELEMENTOS[normalizar(elemento)] ?? null;
}

export interface EstadoSesion {
  iniciado: boolean;
  terminado: boolean;
}

export interface Conteos {
  objetivos: number;
  interacciones: number;
}

export function validarInitialize(s: EstadoSesion): number {
  if (s.terminado) return CONTENIDO_TERMINADO;
  if (s.iniciado) return YA_INICIALIZADO;
  return OK;
}

export function validarTerminate(s: EstadoSesion): number {
  if (s.terminado) return TERMINAR_DESPUES_DE_TERMINAR;
  if (!s.iniciado) return TERMINAR_ANTES_DE_INICIALIZAR;
  return OK;
}

export function validarCommit(s: EstadoSesion): number {
  if (s.terminado) return CONFIRMAR_DESPUES_DE_TERMINAR;
  if (!s.iniciado) return CONFIRMAR_ANTES_DE_INICIALIZAR;
  return OK;
}

export function validarLectura(elemento: string, s: EstadoSesion): number {
  if (s.terminado) return OBTENER_DESPUES_DE_TERMINAR;
  if (!s.iniciado) return OBTENER_ANTES_DE_INICIALIZAR;
  const def = definicionDe(elemento);
  if (def === null) return ELEMENTO_NO_DEFINIDO;
  if (def.acceso === 'WO') return ELEMENTO_SOLO_ESCRITURA;
  return OK;
}

export function validarValor(tipo: Tipo, valor: string): number {
  switch (tipo.clase) {
    case 'cadena':
      return valor.length > tipo.largoMaximo ? TIPO_INCORRECTO : OK;
    case 'vocabulario':
      return tipo.valores.includes(valor) ? OK : TIPO_INCORRECTO;
    case 'decimal': {
      if (valor.trim() === '' || Number.isNaN(Number(valor))) return TIPO_INCORRECTO;
      const n = Number(valor);
      return n < tipo.minimo || n > tipo.maximo ? VALOR_FUERA_DE_RANGO : OK;
    }
    case 'duracion':
      return aSegundos(valor) === null ? TIPO_INCORRECTO : OK;
    case 'entero': {
      if (!/^-?\d+$/.test(valor)) return TIPO_INCORRECTO;
      return Number(valor) < tipo.minimo ? VALOR_FUERA_DE_RANGO : OK;
    }
  }
}

export function validarEscritura(
  elemento: string,
  valor: string,
  s: EstadoSesion,
  conteos: Conteos,
): number {
  if (s.terminado) return FIJAR_DESPUES_DE_TERMINAR;
  if (!s.iniciado) return FIJAR_ANTES_DE_INICIALIZAR;

  const def = definicionDe(elemento);
  if (def === null) return ELEMENTO_NO_DEFINIDO;
  if (def.acceso === 'RO') return ELEMENTO_SOLO_LECTURA;

  // P9 · las colecciones se llenan EN ORDEN: se puede corregir un índice existente o
  // agregar el siguiente, nada más. Un salto significa que el curso perdió la cuenta, y
  // aceptarlo guarda un hueco que después nadie puede interpretar.
  const indice = indiceDe(elemento);
  if (indice !== null) {
    const normalizado = normalizar(elemento);
    const tope = normalizado.startsWith('cmi.objectives')
      ? conteos.objetivos
      : normalizado.startsWith('cmi.interactions')
        ? conteos.interacciones
        : Number.MAX_SAFE_INTEGER;
    if (indice > tope) return FALLO_GENERAL_AL_FIJAR;
  }

  return validarValor(def.tipo, valor);
}

/// Los elementos de solo lectura que el LMS entrega al abrir la sesión. Puro para poder
/// probar que un intento reanudado devuelve lo que el anterior dejó (P10).
export interface DatosDeLanzamiento {
  learnerId: string;
  learnerName: string;
  entry: 'ab-initio' | 'resume';
  mode: 'normal' | 'review';
  credit: 'credit' | 'no-credit';
  totalTime: string;
  location: string;
  suspendData: string;
  completionStatus: string;
  successStatus: string;
  scoreScaled: string | null;
  progressMeasure: string | null;
  launchData: string;
  scaledPassingScore: string | null;
  completionThreshold: string | null;
}

export function modeloInicial(d: DatosDeLanzamiento): Record<string, string> {
  const modelo: Record<string, string> = {
    'cmi._version': '1.0',
    'cmi.learner_id': d.learnerId,
    'cmi.learner_name': d.learnerName,
    'cmi.entry': d.entry,
    'cmi.mode': d.mode,
    'cmi.credit': d.credit,
    'cmi.total_time': d.totalTime,
    'cmi.location': d.location,
    'cmi.suspend_data': d.suspendData,
    'cmi.completion_status': d.completionStatus,
    'cmi.success_status': d.successStatus,
    'cmi.launch_data': d.launchData,
    'cmi.objectives._count': '0',
    'cmi.interactions._count': '0',
    'cmi.comments_from_learner._count': '0',
    'adl.nav.request': '_none_',
    // D-3 · un solo SCO: no hay a dónde continuar ni volver, y el estándar pide que se diga.
    'adl.nav.request_valid.continue': 'unsupported',
    'adl.nav.request_valid.previous': 'unsupported',
  };
  if (d.scoreScaled !== null) modelo['cmi.score.scaled'] = d.scoreScaled;
  if (d.progressMeasure !== null) modelo['cmi.progress_measure'] = d.progressMeasure;
  if (d.scaledPassingScore !== null) modelo['cmi.scaled_passing_score'] = d.scaledPassingScore;
  if (d.completionThreshold !== null) modelo['cmi.completion_threshold'] = d.completionThreshold;
  return modelo;
}
