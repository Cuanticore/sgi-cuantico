// lib/sig/verificaciones.ts
//
// Verificaciones programadas. Módulo PURO.
//
// La decisión de modelo que más código ahorra: **una verificación programada es lo que el
// módulo A ya hace.** Un `ContenidoSig` con sus ítems son los puntos a verificar; una
// `Obligacion` con periodicidad, responsable y anclaje es la programación; una `Asignacion`
// por ciclo es cada ejecución. Lo único nuevo es el resultado.
//
// Por eso este módulo es corto: el calendario, los vencimientos, los avisos y el cierre ya
// están construidos y probados en el módulo A.

import type { Anclaje } from './generacion';

export type ResultadoVerificacion = 'CONFORME' | 'HALLAZGO' | 'NO_CONFORME';

export type EstadoVerificacion = 'VENCIDA' | 'PROXIMA' | 'AL_DIA' | 'SIN_CICLOS';

export interface CicloDeVerificacion {
  fechaLimite: Date;
  fechaCierre: Date | null;
}

const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/// El estado de la verificación según sus ciclos abiertos.
///
/// El orden importa y no es alfabético: **una vencida se reporta como vencida aunque haya
/// otra próxima**. Mirar sólo la más cercana escondería la deuda, que es exactamente lo que
/// el anclaje anclado existe para no hacer.
///
/// `SIN_CICLOS` no es «al día»: una verificación que nunca generó nada no está cumplida,
/// está sin arrancar. Con anclaje flotante ése es además el síntoma de que nadie cerró el
/// ciclo previo.
export function estadoDeVerificacion(
  ciclos: readonly CicloDeVerificacion[],
  hoy: Date,
  diasDeAviso: number,
): EstadoVerificacion {
  const abiertos = ciclos.filter((c) => c.fechaCierre === null);
  if (ciclos.length === 0) return 'SIN_CICLOS';
  if (abiertos.some((c) => dia(c.fechaLimite) < dia(hoy))) return 'VENCIDA';
  const aviso = dia(hoy) + diasDeAviso * 86_400_000;
  if (abiertos.some((c) => dia(c.fechaLimite) <= aviso)) return 'PROXIMA';
  return 'AL_DIA';
}

/// El aviso que la pantalla muestra al elegir el anclaje. **Los dos textos existen porque
/// la elección tiene consecuencias en los dos sentidos**: mostrar sólo la advertencia del
/// flotante haría parecer que el anclado no cuesta nada, cuando lo que hace es acumular
/// deuda a la vista — que es deseable, pero hay que saberlo.
export function avisoDeAnclaje(anclaje: Anclaje): { tono: 'cuidado' | 'bien'; texto: string } {
  if (anclaje === 'FLOTANTE') {
    return {
      tono: 'cuidado',
      texto:
        'Con anclaje flotante, una verificación que nadie cierra deja de generar periodos. ' +
        'Su primera ejecución vencida es el único aviso que habrá, así que conviene ' +
        'reservarlo para lo que depende de un intervalo —una evaluación de proveedor— y no ' +
        'para lo que depende del calendario.',
    };
  }
  return {
    tono: 'bien',
    texto:
      'Con anclaje al calendario, una ejecución vencida no desplaza a la siguiente y la ' +
      'deuda se acumula a la vista. Es lo que un auditor espera de una revisión trimestral: ' +
      'el trimestre existió aunque nadie lo mirara.',
  };
}

/// **Un resultado con hallazgo exige el hallazgo.** `HALLAZGO` y `NO_CONFORME` dicen que se
/// encontró algo, y lo que se encontró vive en Mejora: registrar el resultado sin levantarlo
/// deja la ejecución diciendo que algo pasó y a nadie a cargo de arreglarlo.
///
/// La nota es obligatoria en los tres. Una ejecución conforme sin nota no distingue «los
/// cuatro puntos verificados sin observaciones» de «nadie la miró y la cerró».
export function validarEjecucion(datos: {
  resultado: ResultadoVerificacion;
  nota: string;
  hallazgoId: number | null;
}): string[] {
  const errores: string[] = [];
  if (datos.nota.trim().length < 10) {
    errores.push('Escribí qué se verificó: una ejecución sin nota no se distingue de una que nadie miró');
  }
  if (datos.resultado !== 'CONFORME' && datos.hallazgoId === null) {
    errores.push(
      `Un resultado «${ETIQUETA_RESULTADO[datos.resultado]}» necesita su hallazgo en Mejora: ` +
        'lo que se encontró tiene que quedar a cargo de alguien',
    );
  }
  return errores;
}

export const ETIQUETA_RESULTADO: Record<ResultadoVerificacion, string> = {
  CONFORME: 'Conforme',
  HALLAZGO: 'Con hallazgo',
  NO_CONFORME: 'No conforme',
};

export const ETIQUETA_ESTADO_VERIFICACION: Record<EstadoVerificacion, string> = {
  VENCIDA: 'Vencida',
  PROXIMA: 'Próxima',
  AL_DIA: 'Al día',
  SIN_CICLOS: 'Sin ciclos',
};

export const ETIQUETA_ANCLAJE: Record<Anclaje, string> = {
  ANCLADA: 'Anclada',
  FLOTANTE: 'Flotante',
};
