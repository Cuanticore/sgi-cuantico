import 'server-only';

// app/components/sgsi/inicio/evaluacion.query.ts
//
// Server read for the "Evaluación del SGSI" half of handoff v2.1 screen 1 — everything
// from the INF-SIG-04 separator downwards. One pass over the dataset (2256 risks, 234
// assets, 93 controls) produces every aggregate the screen and its cross-filter need, so
// clicking a segment costs no round trip and no second query.
//
// THE TWO THINGS THIS MODULE REFUSES TO DO
//
// 1. It never turns an unknown residual into a zero. `Riesgo.riesgoResidual` is NULL on
//    every row today because no control-threat relevance is assigned, so efficacy is
//    unknown — not zero. Every residual aggregate here is `null` when nothing in its
//    scope has been calculated, and the screen renders "sin calcular". A residual matrix
//    identical to the inherent one is arithmetically consistent with a zero and
//    completely wrong as a report; this domain has already paid for that defect once.
//
// 2. It never invents a period. `LineaBase` holds at most one snapshot and today holds
//    none, so the comparative is drawn against the only prior rating that really exists:
//    the per-control baseline level in `Control.lineaBaseId`, which is the calificación
//    the Committee started from. What is missing is reported as missing.
//
// All arithmetic comes from lib/sgsi — `metricasMadurez`, `media`, `mediana`,
// `eficaciaDeNivel`, `valorActivo` and `clasificar`. Nothing is reimplemented here.

import { prisma } from '@/lib/db';
import { metricasMadurez, media, type ControlMadurez, type MetricasMadurez } from '@/lib/sgsi/madurez';
import { clasificar } from '@/lib/sgsi/clasificar';
import { valorActivo } from '@/lib/sgsi/formulas';

// ============================================================================
// Types crossing to the client — plain numbers and strings only
// ============================================================================

/// The dimension the descriptive analysis groups by. Four chips, in this order.
export type DimensionAnalisis = 'Proceso' | 'Responsable' | 'Tipo' | 'Subtipo';

export const DIMENSIONES_ANALISIS: readonly DimensionAnalisis[] = [
  'Proceso',
  'Responsable',
  'Tipo',
  'Subtipo',
] as const;

/// A figure in the comparative table. Three states, deliberately distinct: a number, a
/// residual nobody has calculated, and a period that was never recorded. Collapsing the
/// last two into "0" or "—" is what makes a comparative report lie.
export type ValorComparativo =
  | { estado: 'dato'; valor: number }
  | { estado: 'sinCalcular' }
  | { estado: 'sinPeriodo' };

export interface FilaComparativa {
  etiqueta: string;
  /// Why the figure is what it is, when that needs saying.
  nota: string | null;
  unidad: 'entero' | 'porcentaje' | 'nivel' | 'niveles';
  /// Which direction is an improvement, so the delta can be coloured green without the
  /// client having to know that fewer gaps is good and fewer controls in L3+ is not.
  mejoraCuando: 'sube' | 'baja' | 'ninguna';
  anterior: ValorComparativo;
  actual: ValorComparativo;
}

export interface PeriodoProgreso {
  periodo: string;
  etiqueta: string;
  /// Maturity index: mean of efficacy, as a percentage.
  indice: number;
  enL3: number;
  aplicables: number;
  /// Residual Alto or Crítico. Null when unknown.
  altos: number | null;
  /// Residual Alto or Crítico with no treatment decision recorded. Null when unknown.
  sinTratamiento: number | null;
  /// False when the period has no risk snapshot at all: then altos and sinTratamiento
  /// are "sin dato" (never measured), not "sin calcular" (measured, unknown efficacy).
  riesgosConocidos: boolean;
}

export interface BrechaControl {
  codigo: string;
  nombre: string;
  capacidad: string;
  actual: number;
  objetivo: number | null;
  brecha: number;
}

export interface RiesgoPendiente {
  codigo: string;
  activoCodigo: string;
  activoNombre: string;
  amenazaCodigo: string;
  amenazaNombre: string;
  responsable: string | null;
  inherente: number;
  bandaInherente: string;
  /// Null on every row today. Rendered "sin calcular", never 0 and never a bare dash.
  residual: number | null;
  bandaResidual: string | null;
}

export interface SegmentoAnalisis {
  clave: string;
  activos: number;
  riesgos: number;
  /// Residual Alto or Crítico in the segment. Null when no risk in it has a calculated
  /// residual: unknown, not zero.
  altosResiduales: number | null;
  /// Inherent Alto or Crítico. Knowable today, and a strict upper bound of the residual
  /// count, because efficacy lies in [0,1] and therefore residual ≤ potencial.
  altosInherentes: number;
  /// Mean of max(v_D, v_I, v_C) across the segment's assets. Null with no assets.
  valorMedio: number | null;
  /// Counts per band of `umbral_riesgo`, in the catalogue's own order (Crítico first).
  inherentePorBanda: number[];
  residualPorBanda: number[];
  /// Risks in the segment whose residual IS calculated. Zero means the residual
  /// distribution is unknown, not empty.
  conResidual: number;
}

export interface Entidad {
  etiqueta: string;
  n: number;
  nota: string;
  href: string;
}

export interface EvaluacionSgsiDatos {
  /// Report identifier for the mono strip. Constant, but it belongs with the data.
  codigoInforme: string;
  /// Name of the current `LineaBase` snapshot, or null when none is recorded.
  lineaBaseVigente: string | null;
  /// Label of the period the comparison is drawn against. Never empty: when no prior
  /// snapshot exists it names the per-control baseline rating instead, and
  /// `anteriorEsCalificacionInicial` says which of the two it is.
  periodoAnterior: string;
  /// Every recorded snapshot, newest first, for the "Comparar otros periodos" panel.
  periodos: { nombre: string; fecha: string }[];
  /// True when `periodoAnterior` is the per-control baseline rating rather than a stored
  /// snapshot, so the screen can say exactly what it is comparing.
  anteriorEsCalificacionInicial: boolean;

  metricas: MetricasMadurez;
  metricasBase: MetricasMadurez;

  resumen: FilaComparativa[];
  progreso: PeriodoProgreso[];

  brechas: BrechaControl[];
  brechasTotal: number;

  pendientes: RiesgoPendiente[];
  pendientesTotal: number;
  /// 'residual' when the list is the one the report asks for. 'inherente' when the
  /// residual does not exist yet and the screen is showing its upper bound instead.
  pendientesBase: 'residual' | 'inherente';

  conclusiones: string[];

  bandas: string[];
  analisis: Record<DimensionAnalisis, SegmentoAnalisis[]>;
  totalInventario: SegmentoAnalisis;

  entidades: Entidad[];

  /// Scope figures for the report's alcance paragraph and the residual disclaimer.
  activosInventariados: number;
  activosEnAnalisis: number;
  riesgosVigentes: number;
  riesgosConResidual: number;
  /// Risks with no treatment decision recorded, at any band. Always knowable.
  riesgosSinDecision: number;
  criteriosSinRatificar: number;
}

// ============================================================================
// Aggregation
// ============================================================================

/// Everything one segment accumulates while the single pass runs. Values are kept as an
/// array so the mean goes through `media` rather than a second division written here.
interface Acumulador {
  activos: number;
  valores: number[];
  riesgos: number;
  conResidual: number;
  inherentePorBanda: number[];
  residualPorBanda: number[];
}

function nuevoAcumulador(bandas: number): Acumulador {
  return {
    activos: 0,
    valores: [],
    riesgos: 0,
    conResidual: 0,
    inherentePorBanda: new Array<number>(bandas).fill(0),
    residualPorBanda: new Array<number>(bandas).fill(0),
  };
}

function cerrar(clave: string, a: Acumulador): SegmentoAnalisis {
  // Alto or Crítico is the first two positions of the band ramp, by ORDER rather than by
  // name: renaming a band must not silently empty this count.
  const altosInherentes = a.inherentePorBanda[0] + a.inherentePorBanda[1];
  const altosResiduales =
    a.conResidual === 0 ? null : a.residualPorBanda[0] + a.residualPorBanda[1];

  return {
    clave,
    activos: a.activos,
    riesgos: a.riesgos,
    altosResiduales,
    altosInherentes,
    valorMedio: a.valores.length === 0 ? null : media(a.valores),
    inherentePorBanda: a.inherentePorBanda,
    residualPorBanda: a.residualPorBanda,
    conResidual: a.conResidual,
  };
}

function comparar(a: SegmentoAnalisis, b: SegmentoAnalisis): number {
  return b.riesgos - a.riesgos || b.activos - a.activos || a.clave.localeCompare(b.clave, 'es');
}

function dato(valor: number): ValorComparativo {
  return { estado: 'dato', valor };
}

const SIN_CALCULAR: ValorComparativo = { estado: 'sinCalcular' };
const SIN_PERIODO: ValorComparativo = { estado: 'sinPeriodo' };

/// One decimal is the resolution the report quotes; keeping more invites two cards to
/// disagree on the last digit.
function unDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

function dosDecimales(n: number): number {
  return Math.round(n * 100) / 100;
}

/// Thousands with a point, decimals with a comma, negatives with U+2212 — for the prose of
/// the conclusions, which is assembled here and shown verbatim. Written out rather than
/// delegated to toLocaleString: the same string has to come out of the server and out of
/// the browser, and two ICU builds do not always agree. The client has its own copy for
/// the same reason it cannot import this module — `server-only`.
function texto(n: number): string {
  const redondeado = Math.round(n * 100) / 100;
  const [entero, decimales] = Math.abs(redondeado).toString().split('.');
  const cuerpo = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${redondeado < 0 ? '−' : ''}${cuerpo}${decimales ? `,${decimales}` : ''}`;
}

export async function cargarEvaluacionSgsi(): Promise<EvaluacionSgsiDatos> {
  const [controles, riesgos, activos, umbrales, lineasBase, criteriosSinRatificar, conteos] =
    await Promise.all([
      prisma.control.findMany({
        orderBy: { codigo: 'asc' },
        select: {
          codigo: true,
          nombre: true,
          soa: true,
          capacidad: { select: { nombre: true, nombreCorto: true } },
          lineaBase: { select: { nivel: true } },
          actual: { select: { nivel: true } },
          objetivo: { select: { nivel: true } },
        },
      }),
      // The whole risk set in one query, projected down to what the aggregates need. The
      // asset arrives by id and is joined in memory against the 234 asset rows: including
      // it here would repeat every asset up to 36 times across 2256 rows.
      prisma.riesgo.findMany({
        where: { obsoleto: false },
        select: {
          codigo: true,
          activoId: true,
          tratamientoId: true,
          riesgoPotencial: true,
          riesgoResidual: true,
          amenaza: { select: { codigo: true, nombre: true } },
        },
      }),
      prisma.activo.findMany({
        where: { activo: true },
        select: {
          id: true,
          codigo: true,
          nombre: true,
          area: { select: { nombre: true } },
          tipo: { select: { codigo: true, nombre: true } },
          subtipo: { select: { codigo: true, nombre: true } },
          propietario: { select: { nombre: true } },
          custodio: { select: { nombre: true } },
          valores: {
            select: { dimension: { select: { codigo: true } }, valor: { select: { valor: true } } },
          },
        },
      }),
      prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
      // At most one row exists, and today there are none. Ordered anyway so the screen
      // keeps working the day the second cut is taken.
      prisma.lineaBase.findMany({
        orderBy: { fecha: 'desc' },
        select: { nombre: true, fecha: true },
      }),
      prisma.criterioAceptacion.count({ where: { ratificado: false } }),
      Promise.all([
        prisma.tipoMagerit.count({ where: { activo: true } }),
        prisma.subtipoMagerit.count({ where: { activo: true } }),
        prisma.amenaza.count({ where: { activa: true } }),
        prisma.control.count(),
        prisma.evidencia.count(),
      ]),
    ]);

  const [nTipos, nSubtipos, nAmenazas, nControles, nEvidencias] = conteos;

  // --- Maturity, now and at the baseline rating --------------------------------------
  const paraMetricas = (usarBase: boolean) =>
    controles.map<ControlMadurez>((c) => ({
      soa: c.soa === 'PARCIAL' ? 'parcial' : c.soa === 'NO' ? 'no' : 'si',
      lineaBase: c.lineaBase?.nivel ?? null,
      actual: usarBase ? c.lineaBase?.nivel ?? null : c.actual?.nivel ?? null,
      objetivo: c.objetivo?.nivel ?? null,
    }));

  const metricas = metricasMadurez(paraMetricas(false));
  const metricasBase = metricasMadurez(paraMetricas(true));

  // --- Bands -------------------------------------------------------------------------
  const bandas = umbrales.map((u) => u.nombre);
  const indiceBanda = new Map(bandas.map((n, i) => [n, i]));
  const umbralesPlanos = umbrales.map((u) => ({
    nombre: u.nombre,
    desde: u.desde.toString(),
    hasta: u.hasta.toString(),
  }));

  /// Position in the severity ramp, or −1 when the value falls outside every band. A risk
  /// that cannot be classified is counted apart, never dropped into the mildest band.
  const posicion = (valor: string): number => {
    const nombre = clasificar(valor, umbralesPlanos);
    return nombre === null ? -1 : indiceBanda.get(nombre) ?? -1;
  };

  // --- Assets: dimension keys and value ----------------------------------------------
  interface ActivoResuelto {
    codigo: string;
    nombre: string;
    responsable: string | null;
    claves: Record<DimensionAnalisis, string>;
    valor: number;
  }

  const porActivo = new Map<number, ActivoResuelto>();

  const acumuladores: Record<DimensionAnalisis, Map<string, Acumulador>> = {
    Proceso: new Map(),
    Responsable: new Map(),
    Tipo: new Map(),
    Subtipo: new Map(),
  };
  const global = nuevoAcumulador(bandas.length);

  const tomar = (dimension: DimensionAnalisis, clave: string): Acumulador => {
    const mapa = acumuladores[dimension];
    let acc = mapa.get(clave);
    if (acc === undefined) {
      acc = nuevoAcumulador(bandas.length);
      mapa.set(clave, acc);
    }
    return acc;
  };

  for (const a of activos) {
    // A dimension with no row is a 0, not a hole: the workbook leaves the cell blank when
    // the dimension does not apply, and 0 is what "Irrelevante" means.
    const porDimension = new Map(a.valores.map((v) => [v.dimension.codigo, v.valor.valor]));
    const valor = valorActivo({
      D: porDimension.get('D') ?? 0,
      I: porDimension.get('I') ?? 0,
      C: porDimension.get('C') ?? 0,
    }).toNumber();

    // The workbook's "Propietario del activo" column is empty for all 234 assets, so the
    // custodian stands in as the responsible party — the same substitution the matrices
    // screen makes, and for the same reason: a column of dashes names nobody.
    const responsable = a.propietario?.nombre ?? a.custodio?.nombre ?? null;

    const resuelto: ActivoResuelto = {
      codigo: a.codigo ?? '(sin código)',
      nombre: a.nombre,
      responsable,
      claves: {
        Proceso: a.area.nombre,
        Responsable: responsable ?? 'Sin responsable asignado',
        // The catalogue code travels with the name, so grouping by type reads the same as
        // the MAGERIT taxonomy the auditors use.
        Tipo: `${a.tipo.codigo} ${a.tipo.nombre}`,
        Subtipo: `${a.subtipo.codigo} ${a.subtipo.nombre}`,
      },
      valor,
    };
    porActivo.set(a.id, resuelto);

    global.activos += 1;
    global.valores.push(valor);
    for (const dimension of DIMENSIONES_ANALISIS) {
      const acc = tomar(dimension, resuelto.claves[dimension]);
      acc.activos += 1;
      acc.valores.push(valor);
    }
  }

  // --- Risks: the single pass ---------------------------------------------------------
  const activosConRiesgo = new Set<number>();
  let riesgosSinDecision = 0;
  let sinBanda = 0;
  const candidatosResidual: RiesgoPendiente[] = [];
  const candidatosInherente: { fila: RiesgoPendiente; orden: number }[] = [];

  for (const r of riesgos) {
    const activo = porActivo.get(r.activoId);
    const iInherente = r.riesgoPotencial === null ? -1 : posicion(r.riesgoPotencial.toString());
    const iResidual = r.riesgoResidual === null ? -1 : posicion(r.riesgoResidual.toString());
    const tieneResidual = r.riesgoResidual !== null && iResidual >= 0;

    if (iInherente < 0) sinBanda += 1;
    if (r.tratamientoId === null) riesgosSinDecision += 1;
    if (activo !== undefined) activosConRiesgo.add(r.activoId);

    const anotar = (acc: Acumulador) => {
      acc.riesgos += 1;
      if (iInherente >= 0) acc.inherentePorBanda[iInherente] += 1;
      if (tieneResidual) {
        acc.residualPorBanda[iResidual] += 1;
        acc.conResidual += 1;
      }
    };

    anotar(global);
    if (activo !== undefined) {
      for (const dimension of DIMENSIONES_ANALISIS) {
        anotar(tomar(dimension, activo.claves[dimension]));
      }
    }

    // "Alto o Crítico sin decisión de tratamiento registrada" is the report's definition,
    // and it is a RESIDUAL definition. Both candidate lists are collected in this same
    // pass so the screen can fall back honestly when the residual does not exist.
    if (r.tratamientoId !== null || activo === undefined) continue;

    const fila: RiesgoPendiente = {
      codigo: r.codigo,
      activoCodigo: activo.codigo,
      activoNombre: activo.nombre,
      amenazaCodigo: r.amenaza.codigo,
      amenazaNombre: r.amenaza.nombre,
      responsable: activo.responsable,
      inherente: Number(r.riesgoPotencial ?? 0),
      bandaInherente: iInherente >= 0 ? bandas[iInherente] : 'sin banda',
      residual: tieneResidual ? Number(r.riesgoResidual) : null,
      bandaResidual: tieneResidual ? bandas[iResidual] : null,
    };

    if (tieneResidual && iResidual <= 1) candidatosResidual.push(fila);
    if (iInherente >= 0 && iInherente <= 1) {
      candidatosInherente.push({ fila, orden: fila.inherente });
    }
  }

  const totalInventario = cerrar('Todo el inventario', global);

  const analisis = {
    Proceso: [...acumuladores.Proceso].map(([k, v]) => cerrar(k, v)).sort(comparar),
    Responsable: [...acumuladores.Responsable].map(([k, v]) => cerrar(k, v)).sort(comparar),
    Tipo: [...acumuladores.Tipo].map(([k, v]) => cerrar(k, v)).sort(comparar),
    Subtipo: [...acumuladores.Subtipo].map(([k, v]) => cerrar(k, v)).sort(comparar),
  } satisfies Record<DimensionAnalisis, SegmentoAnalisis[]>;

  // --- Pending high risks -------------------------------------------------------------
  //
  // With no residual anywhere the strict list is empty, and an empty card would read as
  // "nothing pending" — the opposite of the truth. The fallback is the inherent Alto or
  // Crítico without a decision, which is a genuine SUPERSET: residual = impacto × aro ×
  // (1 − eficacia) ≤ impacto × aro = potencial, so every residually-high risk is already
  // in this list. The screen labels which of the two it is showing.
  //
  // The switch is whether ANY residual has been calculated, not whether the strict list
  // came out non-empty: once the residual exists, an empty list means "nothing pending",
  // which is a finding worth showing rather than a reason to fall back. While coverage is
  // partial the strict list is a lower bound, and `riesgosConResidual` says so on screen.
  const usaResidual = totalInventario.conResidual > 0;
  const pendientes = usaResidual
    ? candidatosResidual.sort((a, b) => (b.residual ?? 0) - (a.residual ?? 0)).slice(0, 12)
    : candidatosInherente
        .sort((a, b) => b.orden - a.orden)
        .slice(0, 12)
        .map((c) => c.fila);
  const pendientesTotal = usaResidual ? candidatosResidual.length : candidatosInherente.length;

  // --- Gaps ---------------------------------------------------------------------------
  const aplicables = controles.filter((c) => c.soa !== 'NO');
  const todasLasBrechas: BrechaControl[] = aplicables
    .filter((c) => (c.actual?.nivel ?? 0) <= 2)
    .map((c) => ({
      codigo: c.codigo,
      nombre: c.nombre,
      capacidad: c.capacidad.nombreCorto,
      actual: c.actual?.nivel ?? 0,
      objetivo: c.objetivo?.nivel ?? null,
      brecha: Math.max(0, (c.objetivo?.nivel ?? 0) - (c.actual?.nivel ?? 0)),
    }))
    .sort((a, b) => b.brecha - a.brecha || a.codigo.localeCompare(b.codigo, 'es'));

  // --- Capabilities with the widest gap, for the conclusions --------------------------
  const brechaPorCapacidad = new Map<string, number>();
  for (const c of aplicables) {
    const brecha = Math.max(0, (c.objetivo?.nivel ?? 0) - (c.actual?.nivel ?? 0));
    brechaPorCapacidad.set(
      c.capacidad.nombre,
      (brechaPorCapacidad.get(c.capacidad.nombre) ?? 0) + brecha,
    );
  }
  const peoresCapacidades = [...brechaPorCapacidad]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([nombre]) => nombre);

  // --- Periods ------------------------------------------------------------------------
  // The GAP of 2 mar 2026 is data (a LineaBase row), not a literal: it names the
  // previous period below. The current one is the August evaluation — the levels
  // stored per control, not a snapshot row.
  const lineaBaseVigente = lineasBase[0]?.nombre ?? null;
  const snapshotAnterior = lineasBase[1]?.nombre ?? null;
  const anteriorEsCalificacionInicial = snapshotAnterior === null;
  const periodoAnterior =
    snapshotAnterior ?? `línea base · ${lineasBase[0]?.nombre ?? 'sin establecer'}`;

  const altosResidualesGlobal = totalInventario.altosResiduales;
  const altosSinTratamiento = usaResidual ? candidatosResidual.length : null;

  const progreso: PeriodoProgreso[] = [
    {
      periodo: periodoAnterior,
      etiqueta: anteriorEsCalificacionInicial
        ? `Línea base — ${lineasBase[0]?.nombre ?? 'sin establecer'}`
        : 'Snapshot anterior',
      indice: metricasBase.indice,
      enL3: metricasBase.enL3,
      aplicables: metricasBase.aplicables,
      // No risk snapshot was ever taken for this period: the figure was never measured,
      // which is a different absence from an efficacy nobody has calculated.
      altos: null,
      sinTratamiento: null,
      riesgosConocidos: false,
    },
    {
      periodo: 'agosto de 2026',
      etiqueta: 'Evaluación actual',
      indice: metricas.indice,
      enL3: metricas.enL3,
      aplicables: metricas.aplicables,
      altos: altosResidualesGlobal,
      sinTratamiento: altosSinTratamiento,
      riesgosConocidos: true,
    },
  ];

  // --- Executive comparative ----------------------------------------------------------
  //
  // Rows the report asks for. Anything whose prior value was never recorded says so
  // instead of borrowing the current one, and every residual row says "sin calcular".
  const resumen: FilaComparativa[] = [
    {
      etiqueta: 'Activos inventariados',
      nota: `${activosConRiesgo.size} superan el umbral de valoración y generan riesgos`,
      unidad: 'entero',
      mejoraCuando: 'ninguna',
      anterior: SIN_PERIODO,
      actual: dato(activos.length),
    },
    {
      etiqueta: 'Riesgos analizados',
      nota: 'activo × amenaza preclasificada de su tipo',
      unidad: 'entero',
      mejoraCuando: 'ninguna',
      anterior: SIN_PERIODO,
      actual: dato(riesgos.length),
    },
    {
      etiqueta: 'Riesgos Alto y Crítico — inherente',
      nota: sinBanda > 0 ? `${sinBanda} riesgos sin banda por falta de impacto` : null,
      unidad: 'entero',
      mejoraCuando: 'baja',
      anterior: SIN_PERIODO,
      actual: dato(totalInventario.altosInherentes),
    },
    {
      etiqueta: 'Riesgos Alto y Crítico — residual',
      nota: 'la eficacia de los controles es desconocida, no cero',
      unidad: 'entero',
      mejoraCuando: 'baja',
      anterior: SIN_PERIODO,
      actual: altosResidualesGlobal === null ? SIN_CALCULAR : dato(altosResidualesGlobal),
    },
    {
      etiqueta: 'Riesgos Alto o Crítico sin tratamiento',
      nota: `${riesgosSinDecision} riesgos sin decisión registrada en cualquier banda`,
      unidad: 'entero',
      mejoraCuando: 'baja',
      anterior: SIN_PERIODO,
      actual: altosSinTratamiento === null ? SIN_CALCULAR : dato(altosSinTratamiento),
    },
    {
      etiqueta: 'Índice de madurez — media de la eficacia',
      nota: 'la eficacia es de razón y se promedia; el nivel es ordinal y no',
      unidad: 'porcentaje',
      mejoraCuando: 'sube',
      anterior: dato(unDecimal(metricasBase.indice)),
      actual: dato(unDecimal(metricas.indice)),
    },
    {
      etiqueta: 'Nivel típico — mediana del nivel',
      nota: null,
      unidad: 'nivel',
      mejoraCuando: 'sube',
      anterior: dato(dosDecimales(metricasBase.nivelTipico)),
      actual: dato(dosDecimales(metricas.nivelTipico)),
    },
    {
      etiqueta: 'Nivel medio — solo referencia',
      nota: 'nunca se reporta como «la madurez»: un L5 compensaría un L0',
      unidad: 'nivel',
      mejoraCuando: 'sube',
      anterior: dato(dosDecimales(metricasBase.nivelMedio)),
      actual: dato(dosDecimales(metricas.nivelMedio)),
    },
    {
      etiqueta: 'Controles gestionados en L3 o más',
      nota: `de ${metricas.aplicables} aplicables`,
      unidad: 'entero',
      mejoraCuando: 'sube',
      anterior: dato(metricasBase.enL3),
      actual: dato(metricas.enL3),
    },
    {
      etiqueta: 'Porcentaje en L3 o superior',
      nota: null,
      unidad: 'porcentaje',
      mejoraCuando: 'sube',
      anterior: dato(unDecimal(metricasBase.pctL3)),
      actual: dato(unDecimal(metricas.pctL3)),
    },
    {
      etiqueta: 'Brechas prioritarias en L2 o menos',
      nota: 'cada una es una acción concreta con responsable y fecha',
      unidad: 'entero',
      mejoraCuando: 'baja',
      anterior: dato(metricasBase.brechas),
      actual: dato(metricas.brechas),
    },
    {
      etiqueta: 'Cumplen su objetivo',
      nota: null,
      unidad: 'entero',
      mejoraCuando: 'sube',
      anterior: dato(metricasBase.enObjetivo),
      actual: dato(metricas.enObjetivo),
    },
    {
      etiqueta: 'Avance medio desde la línea base',
      nota: 'niveles ganados por control calificado',
      unidad: 'niveles',
      mejoraCuando: 'sube',
      anterior: SIN_PERIODO,
      actual: dato(dosDecimales(metricas.avanceMedio)),
    },
    {
      etiqueta: 'Brecha total hasta el objetivo',
      nota: 'Σ máx(0, objetivo − actual), en niveles',
      unidad: 'niveles',
      mejoraCuando: 'baja',
      anterior: dato(metricasBase.brechaTotal),
      actual: dato(metricas.brechaTotal),
    },
  ];

  // --- Conclusions: derived, never transcribed ----------------------------------------
  const conclusiones: string[] = [
    `El índice de madurez, medido como la media de la eficacia de los ${metricas.aplicables} ` +
      `controles aplicables, es ${texto(unDecimal(metricas.indice))} % frente a ` +
      `${texto(unDecimal(metricasBase.indice))} % en la calificación inicial. El nivel típico ` +
      `del SGSI es L${texto(dosDecimales(metricas.nivelTipico))} y ${metricas.enL3} controles ` +
      `están gestionados en L3 o más. Se reporta la media de la eficacia y no el promedio del ` +
      `nivel, porque la eficacia es una escala de razón y es la que alimenta el riesgo residual.`,

    peoresCapacidades.length > 0
      ? `Las capacidades operativas con mayor brecha frente al objetivo son ` +
        `${peoresCapacidades.join(', ')}. Concentrar allí el plan del próximo periodo tiene ` +
        `el mayor efecto sobre el riesgo residual agregado, porque al subir la madurez de un ` +
        `control bajan de golpe todos los riesgos que ese control mitiga.`
      : `No hay brechas frente al objetivo en ninguna capacidad operativa.`,

    `${metricas.noAplicables} controles del Anexo A se declaran no aplicables y quedan ` +
      `justificados en la declaración de aplicabilidad. Ninguno entra en los promedios: ` +
      `admitir un cero por un control que no aplica es exactamente lo que la declaración ` +
      `de aplicabilidad existe para evitar.`,

    // The sentence changes shape the day the relevance assignment lands, rather than
    // asserting "ninguno" forever.
    usaResidual
      ? `Quedan ${texto(candidatosResidual.length)} riesgos con residual Alto o Crítico sin ` +
        `decisión de tratamiento registrada, sobre ${texto(totalInventario.conResidual)} de ` +
        `${texto(riesgos.length)} riesgos con residual calculado. Conforme al criterio de ` +
        `aceptación, ninguno puede permanecer sin decisión aprobada por el Comité del SIG.`
      : `El riesgo residual no está calculado en ninguno de los ${texto(riesgos.length)} riesgos ` +
      `vigentes: falta asignar la relevancia de los pares control-amenaza, de modo que la ` +
      `eficacia es desconocida y no cero. Por eso este informe no afirma cuántos riesgos ` +
      `Alto o Crítico residuales quedan sin tratamiento. Lo que sí consta es que hay ` +
      `${texto(totalInventario.altosInherentes)} riesgos Alto o Crítico inherentes y ` +
      `${texto(riesgosSinDecision)} riesgos sin decisión de tratamiento registrada; como el ` +
      `residual nunca supera al inherente, el conjunto definitivo está contenido en ese.`,

    criteriosSinRatificar > 0
      ? `Quedan ${criteriosSinRatificar} criterios de aceptación propuestos y pendientes de ` +
        `ratificación por el Comité del SIG. Sin plazos ratificados, la decisión sobre un ` +
        `riesgo Alto no tiene fecha exigible.`
      : `Los criterios de aceptación y sus plazos están ratificados por el Comité del SIG.`,
  ];

  // --- System entities -----------------------------------------------------------------
  const entidades: Entidad[] = [
    {
      etiqueta: 'Tipos MAGERIT',
      n: nTipos,
      nota: 'taxonomía del Libro II',
      href: '/sgsi/parametros',
    },
    {
      etiqueta: 'Subtipos',
      n: nSubtipos,
      nota: 'dependientes del tipo',
      href: '/sgsi/parametros',
    },
    {
      etiqueta: 'Amenazas',
      n: nAmenazas,
      nota: 'catálogo con degradación y frecuencia',
      href: '/sgsi/amenazas',
    },
    {
      etiqueta: 'Controles ISO 27001:2022',
      n: nControles,
      nota: `${metricas.aplicables} aplican · 15 capacidades operativas`,
      href: '/sgsi/controles',
    },
    {
      etiqueta: 'Evidencias registradas',
      n: nEvidencias,
      nota: 'enlaces, notas y archivos por control',
      href: '/sgsi/controles',
    },
    {
      etiqueta: 'Riesgos analizados',
      n: riesgos.length,
      nota: 'activo × amenaza de su tipo',
      href: '/sgsi/matrices',
    },
  ];

  return {
    codigoInforme: 'INF-SIG-04',
    lineaBaseVigente,
    periodoAnterior,
    periodos: lineasBase.map((l) => ({
      nombre: l.nombre,
      // ISO date, sliced rather than localised: the same string has to come out of the
      // server and out of the browser.
      fecha: l.fecha.toISOString().slice(0, 10),
    })),
    anteriorEsCalificacionInicial,

    metricas,
    metricasBase,

    resumen,
    progreso,

    brechas: todasLasBrechas.slice(0, 12),
    brechasTotal: todasLasBrechas.length,

    pendientes,
    pendientesTotal,
    pendientesBase: usaResidual ? 'residual' : 'inherente',

    conclusiones,

    bandas,
    analisis,
    totalInventario,

    entidades,

    activosInventariados: activos.length,
    activosEnAnalisis: activosConRiesgo.size,
    riesgosVigentes: riesgos.length,
    riesgosConResidual: totalInventario.conResidual,
    riesgosSinDecision,
    criteriosSinRatificar,
  };
}
