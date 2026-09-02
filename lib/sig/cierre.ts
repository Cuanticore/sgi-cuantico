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

/// Los cuatro estados que la interfaz pinta, con el mismo vocabulario en todas partes.
///
/// «Por vencer» es pendiente, en plazo, y a siete días o menos. El umbral estaba escrito
/// dos veces —`lib/sig/resumen.ts` para el correo semanal y `app/mi-sig/bandeja.client.tsx`
/// para la bandeja— y el calendario, que tiene «Por vencer» en su leyenda, no lo aplicaba:
/// pintaba un color que la malla nunca usaba. Una leyenda que promete un color inexistente
/// es peor que no tener leyenda, porque enseña a leer mal la pantalla.
///
/// Los días se cuentan por día calendario, igual que `esVencida`: la hora no entra.
export type EstadoVencimiento = 'VENCIDA' | 'POR_VENCER' | 'PENDIENTE' | 'REALIZADA';

export const DIAS_POR_VENCER = 7;

export function estadoDeVencimiento(
  estado: string,
  fechaLimite: Date,
  hoy: Date,
): EstadoVencimiento {
  if (estado !== 'PENDIENTE') return 'REALIZADA';
  const dias = diasHasta(fechaLimite, hoy);
  if (dias < 0) return 'VENCIDA';
  return dias <= DIAS_POR_VENCER ? 'POR_VENCER' : 'PENDIENTE';
}

/// Días calendario que faltan para la fecha límite. Negativo si ya pasó.
///
/// No se resta `diaDe`: ése devuelve un entero empaquetado `YYYYMMDD`, y restarlo daría
/// 100 «días» entre el 31 de enero y el 1 de febrero. Se normaliza cada fecha a la
/// medianoche UTC de su día y ahí sí la diferencia son días.
export function diasHasta(fechaLimite: Date, hoy: Date): number {
  const MS_DIA = 86_400_000;
  return Math.round((medianocheUtc(fechaLimite) - medianocheUtc(hoy)) / MS_DIA);
}

function medianocheUtc(fecha: Date): number {
  return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
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