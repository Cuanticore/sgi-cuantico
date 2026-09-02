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
  // Restar `diaDe` era un defecto: devuelve la fecha EMPAQUETADA como `YYYYMMDD`, que
  // sirve para comparar —el orden se conserva— pero no para restar. Una asignación vencida
  // AYER, 31 de enero contra 1 de febrero, daba 20260201 − 20260131 = 70 «días». El número
  // sale en la barra de Obligaciones y en el correo mensual.
  const masVieja = vencidas.reduce(
    (peor, a) => Math.min(peor, medianocheUtc(a.fechaLimite)),
    Number.POSITIVE_INFINITY,
  );
  return { cantidad: vencidas.length, masAntiguaDias: diasEntre(masVieja, medianocheUtc(hoy)) };
}

/// Días completos entre dos medianoches UTC. La resta que `diaDe` no puede hacer.
export function diasEntre(desde: number, hasta: number): number {
  return Math.round((hasta - desde) / 86_400_000);
}

/// R5: el cierre administrativo se contabiliza aparte del cumplimiento.
export function cierresAdministrativos(
  asignaciones: readonly AsignacionIndicador[],
): number {
  return asignaciones.filter(
    (a) => a.estado === 'REALIZADA' && a.cerradaPor !== null && a.cerradaPor !== a.personaId,
  ).length;
}

/// La fecha empaquetada `YYYYMMDD`. Conserva el orden, así que sirve para `<` y `>`.
/// NUNCA para restar: entre dos días consecutivos a fin de mes la diferencia salta 70.
function diaDe(fecha: Date): number {
  return fecha.getUTCFullYear() * 10000 + (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
}

/// Milisegundos de la medianoche UTC de ese día. Esta SÍ se puede restar.
export function medianocheUtc(fecha: Date): number {
  return Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
}