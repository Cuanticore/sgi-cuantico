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
// ─── Los capítulos de la norma ─────────────────────────────────────────────────────────

/// El nombre de cada capítulo de la **estructura de alto nivel (Anexo SL)**.
///
/// No es la tabla de contenidos de ISO 9001: es la estructura ARMONIZADA que comparten
/// todas las normas de sistemas de gestión —9001, 14001, 45001, 27001, 22301—, y por eso
/// un solo mapa sirve para el catálogo entero en vez de uno por norma.
///
/// Empieza en el 4 a propósito. Los capítulos 1 a 3 son objeto y campo de aplicación,
/// referencias normativas y términos: no contienen requisitos auditables, así que si
/// aparecieran en la malla serían filas que nadie puede marcar.
const NOMBRE_CAPITULO: Record<string, string> = {
  '4': 'Contexto',
  '5': 'Liderazgo',
  '6': 'Planificación',
  '7': 'Apoyo',
  '8': 'Operación',
  '9': 'Evaluación',
  '10': 'Mejora',
};

/// Las normas cuyo capitulado sigue el Anexo SL. Se comprueba contra el código Y el nombre
/// porque el catálogo se importa desde Excel y nadie garantiza cómo viene escrito.
/// Frontera de DIGITO y no de palabra: `\b` no separa la O del 9, asi que `ISO9001`
/// —sin espacio, que es como suele venir del Excel— no coincidia. Las miras alrededor
/// evitan ademas que `9001` acierte dentro de `29001`.
const ANEXO_SL = /(?<![0-9])(9001|14001|45001|27001|22301|37001|50001)(?![0-9])/;

/// El nombre del capítulo, o `null` si no se puede afirmar.
///
/// **`null` no es un hueco: es la respuesta correcta** cuando la norma no sigue el Anexo SL.
/// El catálogo se importa desde Excel y puede traer un decreto o una resolución, donde el
/// capítulo 8 no es «Operación» ni nada parecido. Inventarle un nombre a la estructura de
/// otro documento sería peor que mostrar el número: el número al menos no miente.
export function nombreDeCapitulo(norma: { codigo: string; nombre: string }, capitulo: string): string | null {
  if (!ANEXO_SL.test(norma.codigo) && !ANEXO_SL.test(norma.nombre)) return null;
  return NOMBRE_CAPITULO[capitulo] ?? null;
}

/// El rótulo completo del capítulo: «8 · Operación», o «8» cuando no hay nombre que dar.
export function rotuloDeCapitulo(norma: { codigo: string; nombre: string }, capitulo: string): string {
  const nombre = nombreDeCapitulo(norma, capitulo);
  return nombre === null ? capitulo : `${capitulo} · ${nombre}`;
}
