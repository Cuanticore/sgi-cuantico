import 'server-only';

// app/components/sgsi/inicio/inicio.query.ts
//
// Everything the Resumen SGSI dashboard needs, in one pass. Nothing here is read from a
// stored aggregate: the metrics come from lib/sgsi/madurez.ts over the current control
// levels, and the risk bands are classified at read time from the persisted decimals.
//
// Prisma Decimal does not cross the server/client boundary, so every figure leaves this
// module as a plain number.

import { prisma } from '@/lib/db';
import { clasificar } from '@/lib/sgsi/clasificar';
import {
  eficaciaDeNivel,
  esAplicable,
  media,
  mediana,
  metricasMadurez,
  type ControlMadurez,
} from '@/lib/sgsi/madurez';

export interface CapacidadBrecha {
  capacidad: string;
  corto: string;
  controles: number;
  enL3: number;
  mediana: number;
  eficacia: number;
  objetivo: number;
  lineaBase: number;
  brecha: number;
}

export interface BandaRiesgo {
  nombre: string;
  inherente: number;
  /// Null while efficacy is unknown: no control-threat relevance is assigned yet, and a
  /// zero here would render the residual distribution identical to the inherent one.
  residual: number | null;
}

export interface DatosInicio {
  indice: number;
  indiceLineaBase: number;
  indiceObjetivo: number;
  /// «GAP 2 mar 2026» — la fecha de la línea base es un dato (LineaBase), no un literal.
  fechaLineaBase: string;
  total: number;
  aplicables: number;
  noAplicables: number;
  enL3: number;
  pctL3: number;
  enObjetivo: number;
  nivelTipico: number;
  nivelMedio: number;
  avanceMedio: number;
  brechas: number;
  brechaTotal: number;
  activos: number;
  activosEnAnalisis: number;
  riesgos: number;
  altosSinTratamiento: number | null;
  amenazas: number;
  capacidades: CapacidadBrecha[];
  bandas: BandaRiesgo[];
  residualCalculable: boolean;
}

export async function leerInicio(): Promise<DatosInicio> {
  const [controles, umbrales, activos, riesgos, amenazas, paresMapeados, lineaBase] =
    await Promise.all([
      prisma.control.findMany({
        include: { capacidad: true, lineaBase: true, actual: true, objetivo: true },
      }),
      prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
      prisma.activo.count({ where: { activo: true } }),
      prisma.riesgo.findMany({
        where: { obsoleto: false },
        select: {
          activoId: true,
          riesgoPotencial: true,
          riesgoResidual: true,
          tratamientoId: true,
        },
      }),
      prisma.amenaza.count({ where: { activa: true } }),
      prisma.controlAmenaza.count(),
      prisma.lineaBase.findFirst({ orderBy: { fecha: 'desc' }, select: { nombre: true } }),
  ]);

  const residualCalculable = paresMapeados > 0;

  const paraMetricas = controles.map<ControlMadurez>((c) => ({
    soa: c.soa === 'PARCIAL' ? 'parcial' : c.soa === 'NO' ? 'no' : 'si',
    lineaBase: c.lineaBase?.nivel ?? null,
    actual: c.actual?.nivel ?? null,
    objetivo: c.objetivo?.nivel ?? null,
  }));
  const m = metricasMadurez(paraMetricas);

  // The index the baseline had, and the one the approved targets would reach. Both go
  // through the same arithmetic as the current figure, so the progress bar compares
  // like with like. A pending judgment is not a zero: A.7.13 never entered the GAP and
  // the seven adapted controls are still «Por evaluar», so each series averages over
  // the controls somebody actually scored (92 in the baseline, 86 today).
  const indiceDe = (campo: 'lineaBase' | 'actual' | 'objetivo'): number =>
    media(
      paraMetricas
        .filter((c) => esAplicable(c.soa) && c[campo] !== null)
        .map((c) => eficaciaDeNivel(c[campo])),
    ) * 100;

  const aplicables = controles.filter((c) => c.soa !== 'NO');
  const porCapacidad = new Map<string, typeof aplicables>();
  for (const c of aplicables) {
    porCapacidad.set(c.capacidad.nombre, [...(porCapacidad.get(c.capacidad.nombre) ?? []), c]);
  }

  const capacidades: CapacidadBrecha[] = [...porCapacidad.entries()]
    .map(([capacidad, cs]) => {
      const evaluados = cs.filter((c) => c.actual !== null);
      const niveles = evaluados.map((c) => c.actual!.nivel!);
      const enL3 = evaluados.filter((c) => (c.actual!.nivel!) >= 3).length;
      const conBase = cs.filter((c) => c.lineaBase !== null);
      return {
        capacidad,
        corto: cs[0].capacidad.nombreCorto,
        controles: cs.length,
        enL3,
        mediana: mediana(niveles),
        eficacia: media(evaluados.map((c) => eficaciaDeNivel(c.actual!.nivel!))) * 100,
        objetivo: media(
          cs.filter((c) => c.objetivo !== null).map((c) => eficaciaDeNivel(c.objetivo!.nivel!)),
        ) * 100,
        lineaBase: media(conBase.map((c) => eficaciaDeNivel(c.lineaBase!.nivel!))) * 100,
        // The gap is in efficacy points, which is what the index is measured in.
        brecha: evaluados.reduce(
          (s, c) => s + Math.max(0, (c.objetivo?.nivel ?? 0) - (c.actual!.nivel!)),
          0,
        ),
        orden: cs[0].capacidad.orden,
      };
    })
    .sort((a, b) => a.orden - b.orden)
    .map(({ orden: _orden, ...resto }) => resto);

  const bandas: BandaRiesgo[] = umbrales.map((u) => ({
    nombre: u.nombre,
    inherente: riesgos.filter(
      (r) =>
        r.riesgoPotencial !== null &&
        clasificar(r.riesgoPotencial.toString(), umbrales) === u.nombre,
    ).length,
    residual: residualCalculable
      ? riesgos.filter(
          (r) =>
            r.riesgoResidual !== null &&
            clasificar(r.riesgoResidual.toString(), umbrales) === u.nombre,
        ).length
      : null,
  }));

  // High or critical residual with no treatment decision recorded. Unknowable while the
  // residual itself is unknown — reporting zero would say the opposite of the truth.
  const altosSinTratamiento = residualCalculable
    ? riesgos.filter((r) => {
        if (r.tratamientoId !== null || r.riesgoResidual === null) return false;
        const banda = clasificar(r.riesgoResidual.toString(), umbrales);
        return banda === 'Crítico' || banda === 'Alto';
      }).length
    : null;

  return {
    indice: m.indice,
    indiceLineaBase: indiceDe('lineaBase'),
    indiceObjetivo: indiceDe('objetivo'),
    fechaLineaBase: lineaBase?.nombre ?? 'sin establecer',
    total: m.total,
    aplicables: m.aplicables,
    noAplicables: m.noAplicables,
    enL3: m.enL3,
    pctL3: m.pctL3,
    enObjetivo: m.enObjetivo,
    nivelTipico: m.nivelTipico,
    nivelMedio: m.nivelMedio,
    avanceMedio: m.avanceMedio,
    brechas: m.brechas,
    brechaTotal: m.brechaTotal,
    activos,
    activosEnAnalisis: new Set(riesgos.map((r) => r.activoId)).size,
    riesgos: riesgos.length,
    altosSinTratamiento,
    amenazas,
    capacidades,
    bandas,
    residualCalculable,
  };
}
