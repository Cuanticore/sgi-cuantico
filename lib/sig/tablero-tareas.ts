// lib/sig/tablero-tareas.ts
//
// El tablero «Cumplimiento de tareas del SIG» (handoff_tableros/Main.dc.html).
//
// Esta pantalla no existía. Las cifras que pide —cumplimiento por área, antigüedad de la
// deuda, peores obligaciones— no estaban en ningún lado, y las que sí (`cumplimientoDePeriodo`,
// `deudaVencida`, `cierresAdministrativos`) viven en `cumplimiento.ts` y se reusan tal cual.
// Duplicar la regla del numerador acá haría que el tablero y la barra de Obligaciones
// pudieran contradecirse, que es exactamente lo que el lienzo prohíbe.
//
// Todo se calcula al leer. Nada se guarda (regla 01).

import {
  cierresAdministrativos,
  cumplimientoDePeriodo,
  deudaVencida,
  diasEntre,
  medianocheUtc,
  type AsignacionIndicador,
  type CumplimientoPeriodo,
  type DeudaVencida,
} from './cumplimiento';

/// Una asignación con lo que el tablero necesita además de los indicadores: de qué área es
/// la persona y de qué obligación salió.
export interface AsignacionDelTablero extends AsignacionIndicador {
  areaId: number | null;
  obligacionId: number | null;
}

export interface Segmento {
  etiqueta: 'A tiempo' | 'Tarde' | 'Sin hacer';
  n: number;
  /// Porcentaje del total, ya redondeado a un decimal. `0` cuando el total es 0.
  porciento: number;
}

/// Los tres estados de la barra apilada. El lienzo insiste en que el color nunca va solo:
/// cada segmento lleva su etiqueta y su conteo, así que acá se devuelven juntos.
///
/// «Sin hacer» son las PENDIENTES, vencidas o no. En el periodo cerrado que mira el
/// tablero, una pendiente es una que no se hizo.
export function segmentosDe(c: CumplimientoPeriodo): Segmento[] {
  const total = c.asignadas;
  const crudos: { etiqueta: Segmento['etiqueta']; n: number }[] = [
    { etiqueta: 'A tiempo', n: c.realizadasATiempo },
    { etiqueta: 'Tarde', n: c.realizadasTarde },
    { etiqueta: 'Sin hacer', n: c.pendientes },
  ];
  return crudos
    .filter((s) => s.n > 0)
    .map((s) => ({
      ...s,
      porciento: total === 0 ? 0 : Number(((s.n / total) * 100).toFixed(1)),
    }));
}

export interface FilaDeArea {
  areaId: number | null;
  nombre: string;
  segmentos: Segmento[];
  /// El mismo porcentaje que calcula `cumplimientoDePeriodo`. `null` sin asignaciones.
  porciento: number | null;
  total: number;
}

/// Cumplimiento por área, ordenado del peor al mejor: quien abre el tablero busca dónde
/// hay que empujar, y eso tiene que estar arriba sin scrollear.
///
/// Un área sin asignaciones NO aparece. Mostrarla con «— %» ocupa una fila y no dice nada;
/// mostrarla con 0 % la acusaría de incumplir algo que nunca se le pidió.
export function cumplimientoPorArea(
  asignaciones: readonly AsignacionDelTablero[],
  areas: readonly { id: number; nombre: string }[],
): FilaDeArea[] {
  const filas: FilaDeArea[] = [];
  for (const area of areas) {
    const suyas = asignaciones.filter((a) => a.areaId === area.id);
    const c = cumplimientoDePeriodo(suyas);
    if (c.asignadas === 0) continue;
    filas.push({
      areaId: area.id,
      nombre: area.nombre,
      segmentos: segmentosDe(c),
      porciento: c.porciento,
      total: c.asignadas,
    });
  }

  // Las personas sin área existen —el Directorio no siempre la trae— y sus asignaciones
  // son exigibles igual. Sumarlas a un área cualquiera sería inventar; dejarlas fuera
  // haría que la suma de las filas no diera el titular, y alguien lo iba a notar.
  const huerfanas = asignaciones.filter((a) => a.areaId === null);
  const cH = cumplimientoDePeriodo(huerfanas);
  if (cH.asignadas > 0) {
    filas.push({
      areaId: null,
      nombre: 'Sin área asignada',
      segmentos: segmentosDe(cH),
      porciento: cH.porciento,
      total: cH.asignadas,
    });
  }

  return filas.sort((a, b) => (a.porciento ?? 0) - (b.porciento ?? 0));
}

export interface TramoDeAntiguedad {
  etiqueta: 'Menos de 7 d' | '7 a 30 d' | 'Más de 30 d';
  n: number;
  porciento: number;
}

/// Cuánto lleva vencida la deuda. Siete asignaciones vencidas ayer y siete vencidas hace
/// dos meses son el mismo número y dos problemas distintos: el primero se resuelve con un
/// recordatorio, el segundo ya es un hallazgo.
export function antiguedadDeDeuda(
  asignaciones: readonly AsignacionIndicador[],
  hoy: Date,
): TramoDeAntiguedad[] {
  const corte = medianocheUtc(hoy);
  const vencidas = asignaciones.filter(
    (a) => a.estado === 'PENDIENTE' && medianocheUtc(a.fechaLimite) < corte,
  );
  const dias = vencidas.map((a) => diasEntre(medianocheUtc(a.fechaLimite), corte));
  const tramos: { etiqueta: TramoDeAntiguedad['etiqueta']; n: number }[] = [
    { etiqueta: 'Menos de 7 d', n: dias.filter((d) => d < 7).length },
    { etiqueta: '7 a 30 d', n: dias.filter((d) => d >= 7 && d <= 30).length },
    { etiqueta: 'Más de 30 d', n: dias.filter((d) => d > 30).length },
  ];
  const total = vencidas.length;
  return tramos
    .filter((t) => t.n > 0)
    .map((t) => ({ ...t, porciento: Number(((t.n / total) * 100).toFixed(1)) }));
}

export interface ObligacionFloja {
  obligacionId: number;
  codigo: string;
  titulo: string;
  porciento: number;
  total: number;
}

/// Las obligaciones con peor cumplimiento.
///
/// Se excluyen las que tienen menos de `minimo` asignaciones exigibles: con una sola, el
/// resultado sólo puede ser 0 % o 100 %, y una obligación nueva que nadie alcanzó a hacer
/// encabezaría la lista por delante de una que falla sistemáticamente en treinta personas.
export function peoresObligaciones(
  asignaciones: readonly AsignacionDelTablero[],
  obligaciones: readonly { id: number; codigo: string; titulo: string }[],
  cuantas = 6,
  minimo = 2,
): ObligacionFloja[] {
  const filas: ObligacionFloja[] = [];
  for (const o of obligaciones) {
    const suyas = asignaciones.filter((a) => a.obligacionId === o.id);
    const c = cumplimientoDePeriodo(suyas);
    if (c.asignadas < minimo || c.porciento === null) continue;
    filas.push({
      obligacionId: o.id,
      codigo: o.codigo,
      titulo: o.titulo,
      porciento: c.porciento,
      total: c.asignadas,
    });
  }
  return filas
    // A igual porcentaje, primero la que afecta a más gente: es la que más rinde arreglar.
    .sort((a, b) => a.porciento - b.porciento || b.total - a.total)
    .slice(0, cuantas);
}

export interface Titular {
  cumplimiento: CumplimientoPeriodo;
  segmentos: Segmento[];
  deuda: DeudaVencida;
  antiguedad: TramoDeAntiguedad[];
  cierresAdministrativos: number;
  /// Puntos porcentuales contra el periodo anterior. `null` cuando no hay con qué comparar
  /// —el periodo anterior no tuvo asignaciones—, y entonces la pantalla no dibuja tendencia
  /// en vez de inventar un 0 que se leería como «igual que el mes pasado».
  variacion: number | null;
}

export function armarTitular(
  delPeriodo: readonly AsignacionDelTablero[],
  delPeriodoAnterior: readonly AsignacionDelTablero[],
  hoy: Date,
): Titular {
  const cumplimiento = cumplimientoDePeriodo(delPeriodo);
  const anterior = cumplimientoDePeriodo(delPeriodoAnterior);
  return {
    cumplimiento,
    segmentos: segmentosDe(cumplimiento),
    deuda: deudaVencida(delPeriodo, hoy),
    antiguedad: antiguedadDeDeuda(delPeriodo, hoy),
    cierresAdministrativos: cierresAdministrativos(delPeriodo),
    variacion:
      cumplimiento.porciento === null || anterior.porciento === null
        ? null
        : cumplimiento.porciento - anterior.porciento,
  };
}

/// El color del número grande. Los tres cortes son los del lienzo.
export function colorDeCumplimiento(porciento: number | null): 'bien' | 'atencion' | 'mal' {
  if (porciento === null) return 'atencion';
  if (porciento >= 90) return 'bien';
  if (porciento >= 75) return 'atencion';
  return 'mal';
}
