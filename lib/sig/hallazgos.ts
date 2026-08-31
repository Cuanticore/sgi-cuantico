// lib/sig/hallazgos.ts
//
// El estado se calcula (B3, B8), el flujo escalonado por tipo es una tabla (spec §4),
// y el consecutivo anual no lleva el tipo (B1). Puro a propósito: son las reglas que
// un auditor lee, y se prueban sin base de datos.

export type EstadoHallazgo =
  | 'ABIERTO'
  | 'EN_ANALISIS'
  | 'EN_EJECUCION'
  | 'EN_VERIFICACION'
  | 'CERRADO'
  | 'ANULADO';

export interface DatosEstado {
  anuladoEn: Date | null;
  fechaCierre: Date | null;
  tieneAnalisis: boolean;
  accionesAbiertas: number;
  verificacionEficaz: boolean;
  verificacionPendiente: boolean;
}

/// Las marcas de cerrado y anulado son actos de una persona; lo demás se deduce.
export function estadoCalculado(h: DatosEstado): EstadoHallazgo {
  if (h.anuladoEn) return 'ANULADO';
  if (h.fechaCierre) return 'CERRADO';
  if (h.verificacionPendiente) return 'EN_VERIFICACION';
  if (h.accionesAbiertas > 0) return 'EN_EJECUCION';
  if (h.tieneAnalisis) return 'EN_ANALISIS';
  return 'ABIERTO';
}

/// B8: vencido contra la fecha compromiso, nunca una marca que alguien deba poner.
export function vencidoContra(fechaCompromiso: Date | null, hoy: Date): boolean {
  if (!fechaCompromiso) return false;
  return diaDe(hoy) > diaDe(fechaCompromiso);
}

export interface ExigenciaTipo {
  correccion: 'SI' | 'SI_APLICA' | 'NO';
  causa: 'METODO' | 'LIBRE' | 'OPCIONAL' | 'NO';
  extension: boolean;
  /// SI siempre; CONDICIONAL solo si hubo acción.
  verificacion: 'SI' | 'CONDICIONAL';
}

/// La tabla del flujo escalonado de la spec §4, hecha función.
export function exigeTabla(tipo: string): ExigenciaTipo {
  switch (tipo) {
    case 'NC_MAYOR':
      return { correccion: 'SI', causa: 'METODO', extension: true, verificacion: 'SI' };
    case 'NC_MENOR':
      return { correccion: 'SI_APLICA', causa: 'LIBRE', extension: true, verificacion: 'SI' };
    case 'OBSERVACION':
      return { correccion: 'NO', causa: 'OPCIONAL', extension: false, verificacion: 'CONDICIONAL' };
    case 'OPORTUNIDAD':
      return { correccion: 'NO', causa: 'NO', extension: false, verificacion: 'CONDICIONAL' };
  }
  return { correccion: 'NO', causa: 'NO', extension: false, verificacion: 'CONDICIONAL' };
}

/// B1: el código es inmutable y no lleva el tipo.
export function codigoHallazgo(anio: number, consecutivo: number): string {
  return `HAL-${anio}-${String(consecutivo).padStart(4, '0')}`;
}

function diaDe(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}