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

export interface DatosCierre {
  anuladoEn: Date | null;
  fechaCierre: Date | null;
  tipo: string;
  /// Quién responde por el hallazgo y quién pretende cerrarlo. Nulos cuando el hallazgo
  /// no tiene responsable asignado todavía.
  responsableId: number | null;
  cierraId: number | null;
  /// Acciones que no son de verificación: son las que disparan la exigencia CONDICIONAL.
  accionesNoVerificacion: number;
  tieneVerificacionEficaz: boolean;
}

/// B5 y B7: por qué NO se puede cerrar un hallazgo, o `null` si se puede.
///
/// Vive acá y no dentro de la acción de servidor porque es exactamente la clase de regla
/// que el módulo declara en su cabecera: la que un auditor lee. Estaba escrita en línea en
/// `cerrarHallazgo`, y por lo tanto no se podía ejercitar sin una base de datos — de las
/// dos reglas que sostienen el cierre, la separación de funciones es la que nadie quiere
/// descubrir rota el día de la auditoría.
///
/// Devuelve el motivo ya redactado: la acción no debe reescribirlo, porque dos textos para
/// la misma negativa son dos reglas para quien los lee.
export function motivoQueImpideCerrar(h: DatosCierre): string | null {
  if (h.anuladoEn) return 'El hallazgo está anulado.';
  if (h.fechaCierre) return 'El hallazgo ya está cerrado.';

  // Separación de funciones: no depende del rol. Un administrador tampoco cierra el suyo,
  // porque el auditor pregunta quién verificó la acción, no quién tenía permiso.
  if (h.responsableId !== null && h.cierraId !== null && h.responsableId === h.cierraId) {
    return 'Nadie cierra su propio hallazgo (separación de funciones).';
  }

  const exige = exigeTabla(h.tipo);
  const haceFalta =
    exige.verificacion === 'SI' ||
    (exige.verificacion === 'CONDICIONAL' && h.accionesNoVerificacion > 0);
  if (haceFalta && !h.tieneVerificacionEficaz) {
    return 'No se cierra sin verificación eficaz.';
  }

  return null;
}

function diaDe(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}
/// Si el hallazgo ya lo clasificó alguien.
///
/// El enum `TipoHallazgo` no tiene `SIN_CLASIFICAR`, así que un hallazgo recién reportado
/// tiene un tipo guardado que NADIE eligió: lo pone `reportarHallazgo` porque la columna
/// no admite nulo. La verdad está en `fechaClasificacion`, y toda pantalla que muestre el
/// tipo tiene que consultar esto antes — o afirma una clasificación que no ocurrió.
///
/// B3 y el lienzo del formulario dicen lo mismo desde el principio: quien reporta no
/// clasifica. Mostrar «NC menor» sobre un reporte que nadie miró rompe esa promesa en la
/// primera pantalla donde el líder del SIG lo ve.
export function estaClasificado(fechaClasificacion: Date | null): boolean {
  return fechaClasificacion !== null;
}

/// La etiqueta del tipo para la interfaz: el tipo real si ya se clasificó, y si no, lo que
/// de verdad es.
export function etiquetaDeTipo(tipo: string, fechaClasificacion: Date | null): string {
  if (!estaClasificado(fechaClasificacion)) return 'Sin clasificar';
  return (
    {
      NC_MAYOR: 'NC mayor',
      NC_MENOR: 'NC menor',
      OBSERVACION: 'Observación',
      OPORTUNIDAD: 'Oportunidad',
    }[tipo] ?? tipo
  );
}
