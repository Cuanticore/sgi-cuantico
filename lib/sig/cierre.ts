// lib/sig/cierre.ts
//
// Qué hace válido un cierre y qué se deduce de las fechas. Puro a propósito: R4 manda
// que la validación viva en el servidor, y esta es la única copia de esas reglas.

import type { TipoContenido, ValorRespuesta } from '@prisma/client';

export interface RespuestaCierre {
  itemId: number;
  obligatorio: boolean;
  permiteNoAplica: boolean;
  respuesta: ValorRespuesta | undefined;
  nota?: string | null;
}

export interface DatosCierre {
  tipo: TipoContenido;
  versionLeida?: string | null;
  asistio?: boolean | null;
  calificacion?: number | null;
  exigeEvaluacion?: boolean;
  notaMinima?: number | null;
  nota?: string | null;
  respuestas?: RespuestaCierre[];
}

/// Devuelve los errores del cierre; vacío significa válido. La interfaz ayuda, no decide.
export function validarCierre(datos: DatosCierre): string[] {
  const errores: string[] = [];

  switch (datos.tipo) {
    case 'LECTURA':
      if (!datos.versionLeida?.trim()) errores.push('indique la versión que leyó');
      break;

    case 'CAPACITACION':
      if (datos.asistio === undefined || datos.asistio === null) {
        errores.push('registre la asistencia');
      } else if (datos.asistio && datos.exigeEvaluacion) {
        if (datos.calificacion === undefined || datos.calificacion === null) {
          errores.push('registre la calificación');
        }
      }
      break;

    case 'VERIFICACION':
      for (const r of datos.respuestas ?? []) {
        if (!r.respuesta) {
          if (r.obligatorio) errores.push(`el ítem ${r.itemId} es obligatorio`);
        } else if (r.respuesta === 'NO_APLICA' && !r.permiteNoAplica) {
          errores.push(`el ítem ${r.itemId} no admite "no aplica"`);
        }
      }
      break;

    case 'TAREA':
      break;
  }

  return errores;
}

/// R3: la vencida se calcula, nunca se guarda. Vence al día siguiente de la fecha
/// límite; el mismo día sigue en plazo.
export function esVencida(
  estado: string,
  fechaLimite: Date,
  hoy: Date,
): boolean {
  if (estado !== 'PENDIENTE') return false;
  return diaDe(hoy) > diaDe(fechaLimite);
}

/// Extemporáneo se deduce de las fechas: cerró después de la fecha límite.
export function esExtemporaneo(fechaCierre: Date | null, fechaLimite: Date): boolean {
  if (!fechaCierre) return false;
  return diaDe(fechaCierre) > diaDe(fechaLimite);
}

/// La decisión del cierre, congelada en el registro (ver cabecera del plan, decisión 2).
export function aprobadoDe(
  calificacion: number | null | undefined,
  notaMinima: number | null | undefined,
): boolean | null {
  if (
    calificacion === null ||
    calificacion === undefined ||
    notaMinima === null ||
    notaMinima === undefined
  ) {
    return null;
  }
  return calificacion >= notaMinima;
}

function diaDe(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}