// lib/sig/cumplimiento.ts
//
// Los indicadores del módulo A. Puros a propósito: la barra de Obligaciones, el correo
// mensual y el histórico comparten estas reglas, y «nunca pueden contradecir a la
// bandeja» (nota del lienzo de Obligaciones). Nada de esto se almacena (regla 01).

export interface AsignacionIndicador {
  id: number;
  estado: 'PENDIENTE' | 'REALIZADA' | 'NO_APLICA' | 'ANULADA';
  fechaLimite: Date;
  fechaCierre: Date | null;
  personaId: number;
  cerradaPor: number | null;
}

export interface CumplimientoPeriodo {
  asignadas: number;
  realizadasATiempo: number;
  realizadasTarde: number;
  pendientes: number;
  /// Porcentaje redondeado; null cuando no hay asignadas.
  porciento: number | null;
}

/// Decisión 7 del plan: numerador = realizadas a tiempo; denominador = exigibles
/// (PENDIENTE + REALIZADA). NO_APLICA y ANULADA no eran exigibles y no penalizan.
export function cumplimientoDePeriodo(
  asignaciones: readonly AsignacionIndicador[],
): CumplimientoPeriodo {
  const exigibles = asignaciones.filter(
    (a) => a.estado === 'PENDIENTE' || a.estado === 'REALIZADA',
  );
  const realizadasATiempo = exigibles.filter(
    (a) => a.estado === 'REALIZADA' && a.fechaCierre !== null && a.fechaCierre <= a.fechaLimite,
  ).length;
  const realizadasTarde = exigibles.filter(
    (a) => a.estado === 'REALIZADA' && a.fechaCierre !== null && a.fechaCierre > a.fechaLimite,
  ).length;
  return {
    asignadas: exigibles.length,
    realizadasATiempo,
    realizadasTarde,
    pendientes: exigibles.filter((a) => a.estado === 'PENDIENTE').length,
    porciento:
      exigibles.length === 0 ? null : Math.round((realizadasATiempo / exigibles.length) * 100),
  };
}

export interface DeudaVencida {
  cantidad: number;
  /// Días que lleva abierta la más vieja; null sin deuda.
  masAntiguaDias: number | null;
}

export function deudaVencida(
  asignaciones: readonly AsignacionIndicador[],
  hoy: Date,
): DeudaVencida {
  const vencidas = asignaciones.filter(
    (a) => a.estado === 'PENDIENTE' && diaDe(a.fechaLimite) < diaDe(hoy),
  );
  if (vencidas.length === 0) return { cantidad: 0, masAntiguaDias: null };
  const masVieja = Math.min(...vencidas.map((a) => diaDe(a.fechaLimite)));
  return { cantidad: vencidas.length, masAntiguaDias: diaDe(hoy) - masVieja };
}

/// R5: el cierre administrativo se contabiliza aparte del cumplimiento.
export function cierresAdministrativos(
  asignaciones: readonly AsignacionIndicador[],
): number {
  return asignaciones.filter(
    (a) => a.estado === 'REALIZADA' && a.cerradaPor !== null && a.cerradaPor !== a.personaId,
  ).length;
}

function diaDe(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}