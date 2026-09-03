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
export interface CoberturaNorma {
  cubiertos: number;
  total: number;
  /// Los numerales auditables que NADIE tocó en el año. El lienzo los nombra uno por uno
  /// —«faltan 7.1.5, 8.5.3, 8.5.5 y 10.3»— y por eso importan: un «24 de 28» sin decir
  /// cuáles obliga a reconstruir la resta a mano contra el listado de la norma.
  faltantes: string[];
  porciento: number | null;
}

/// Qué parte de la norma se auditó en el año.
///
/// Se calcula sobre TODAS las auditorías del periodo, no sobre la que se está mirando: la
/// obligación de ISO es cubrir el sistema completo en el ciclo, y una sola auditoría nunca
/// lo hace. Por eso el lienzo rotula «Cobertura de la norma este año» y no «de esta
/// auditoría».
///
/// El denominador son los numerales AUDITABLES. Antes se calculaba como
/// `numerales.length + 4` en la pantalla: un denominador inventado que hacía que el
/// porcentaje BAJARA al agregar una celda.
export function coberturaDeNorma(
  auditables: readonly { numeral: string }[],
  celdasDelAnio: readonly { numeral: string }[],
): CoberturaNorma {
  const tocados = new Set(celdasDelAnio.map((c) => c.numeral));
  // Sobre la lista de auditables, no sobre `tocados`: una celda contra un numeral que
  // dejó de ser auditable no debe inflar la cobertura.
  const faltantes = auditables.filter((a) => !tocados.has(a.numeral)).map((a) => a.numeral);
  const total = auditables.length;
  const cubiertos = total - faltantes.length;
  return {
    cubiertos,
    total,
    faltantes,
    porciento: total === 0 ? null : Math.round((cubiertos / total) * 100),
  };
}

/// «7.1.5, 8.5.3, 8.5.5 y 10.3». Con «y» antes del último, y recortada cuando son muchos:
/// veintiocho numerales en una línea dejan de leerse y tapan el resto de la leyenda.
export function listarFaltantes(faltantes: readonly string[], tope = 6): string {
  if (faltantes.length === 0) return '';
  if (faltantes.length > tope) {
    return `${faltantes.slice(0, tope).join(', ')} y ${faltantes.length - tope} más`;
  }
  if (faltantes.length === 1) return faltantes[0];
  return `${faltantes.slice(0, -1).join(', ')} y ${faltantes[faltantes.length - 1]}`;
}

export function promueveHallazgo(tipo: string): boolean {
  return tipo === 'NC' || tipo === 'OM';
}