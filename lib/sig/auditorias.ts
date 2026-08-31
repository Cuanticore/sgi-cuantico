// lib/sig/auditorias.ts
//
// El estado se calcula (3.1.4), la independencia se bloquea en el servidor (C2),
// el vencimiento se calcula contra el plazo (C7) y solo NC/OM promueven (C5, C9).

export type EstadoAuditoria = 'PLANIFICADA' | 'EN_EJECUCION' | 'INFORME_PRELIMINAR' | 'EMITIDA';

export function estadoAuditoria(d: {
  emitidoEn: Date | null;
  cerradaEn: Date | null;
  notas: number;
  preliminar: boolean;
}): EstadoAuditoria {
  if (d.emitidoEn) return 'EMITIDA';
  if (d.preliminar) return 'INFORME_PRELIMINAR';
  if (d.notas > 0) return 'EN_EJECUCION';
  return 'PLANIFICADA';
}

/// C2: el auditor de una celda no puede ser el responsable del proceso auditado.
export function esIndependiente(
  procesoAuditado: string,
  procesoDelAuditor: string | null,
): boolean {
  return procesoAuditado !== procesoDelAuditor;
}

/// C7: el plazo viene del programa; el vencimiento se calcula.
export function vencidoEntrega(fechaCierre: Date, plazoDias: number, hoy: Date): boolean {
  const limite = new Date(fechaCierre);
  limite.setUTCDate(limite.getUTCDate() + plazoDias);
  return hoy.getTime() > limite.getTime();
}

/// C5 + C9: solo NC y OM generan hallazgo en B.
export function promueveHallazgo(tipo: string): boolean {
  return tipo === 'NC' || tipo === 'OM';
}