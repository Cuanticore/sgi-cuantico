// lib/sgsi/riesgos.ts
//
// The single source of risks. Matrices, KPIs, reports and drill-downs all derive from
// this projection: there is no stored matrix, no materialised view and no cached count.
// The prototype's precooked matrices are a visual reference for the designer, not data
// — reintroducing them is what produced contradictory figures in v1.
//
// A risk is the cartesian product of the asset by the threats its TYPE pre-classifies,
// filtered to assets that reach the valuation threshold. Risks are never hand-picked.
//
// WHY RESIDUAL VALUES CAN BE NULL
//
// Efficacy comes from the maturity of the controls mapped to the threat, weighted by
// relevance. Until that mapping exists, efficacy is unknown — and unknown is not zero.
// Writing zero would make every residual matrix come out identical to the inherent one:
// arithmetically consistent with the inputs, and completely wrong as a report. That is a
// defect this domain has already paid for once, so the residual columns stay null and
// the screens say "sin calcular" instead of showing a number nobody computed.

import type { PrismaClient } from '@prisma/client';
import { Decimal, calcularRiesgo, entraAlAnalisis, type ValoresDimension } from './formulas';
import { eficaciaAmenaza, eficaciaDeNivel } from './madurez';

export interface DiagnosticoRiesgos {
  activosEnInventario: number;
  activosEnAnalisis: number;
  riesgosGenerados: number;
  riesgosObsoletos: number;
  amenazasSinControles: number;
  residualSinCalcular: number;
}

/// Efficacy per threat, from its controls' current maturity weighted by relevance and
/// capped by the principal. Returns null when the threat has no controls mapped: the
/// distinction between "no controls" and "controls at L0" is the whole point.
export async function eficaciaPorAmenaza(
  prisma: PrismaClient,
  delta = 0.05,
): Promise<Map<number, number | null>> {
  const amenazas = await prisma.amenaza.findMany({ select: { id: true } });
  const eficacia = new Map<number, number | null>(amenazas.map((a) => [a.id, null]));

  const pares = await prisma.controlAmenaza.findMany({
    include: {
      relevancia: true,
      control: { include: { actual: true } },
    },
  });

  const porAmenaza = new Map<number, { nivel: number | null; peso: number; esPrincipal: boolean }[]>();
  for (const p of pares) {
    // A control marked as not applicable is excluded from its own average.
    if (!p.control.aplica) continue;
    const lista = porAmenaza.get(p.amenazaId) ?? [];
    // A pair with no relevance yet aggregates the way the workbook's own AVERAGE does:
    // weight 1 and no principal, which makes the weighted mean a plain mean and leaves the
    // δ cap inert. That is MET-SIG-01 v2, and it is the honest interim — the alternative
    // was returning null and rendering every residual risk "sin calcular".
    lista.push({
      nivel: p.control.actual?.nivel ?? null,
      peso: p.relevancia?.peso ?? 1,
      esPrincipal: p.relevancia?.esPrincipal ?? false,
    });
    porAmenaza.set(p.amenazaId, lista);
  }

  for (const [amenazaId, controles] of porAmenaza) {
    if (controles.length > 0) eficacia.set(amenazaId, eficaciaAmenaza(controles, delta));
  }

  return eficacia;
}

/// Brings the risk set in line with the current inventory and parameterisation, then
/// recalculates. Never deletes: a risk that leaves the scope is marked obsolete, and one
/// that returns is reactivated with its previous valuation intact.
export async function generarRiesgos(prisma: PrismaClient): Promise<DiagnosticoRiesgos> {
  const umbralParam = await prisma.parametro.findUnique({ where: { clave: 'umbral_valoracion' } });
  const umbral = Number(umbralParam?.valor ?? 4);

  const deltaParam = await prisma.parametro.findUnique({ where: { clave: 'delta_techo_eficacia' } });
  const delta = Number(deltaParam?.valor ?? 0.05);

  const activos = await prisma.activo.findMany({
    where: { activo: true },
    include: { valores: { include: { dimension: true, valor: true } } },
  });

  const aplicabilidad = await prisma.amenazaTipo.findMany({ where: { aplica: true } });
  const porTipo = new Map<number, number[]>();
  for (const a of aplicabilidad) {
    porTipo.set(a.tipoId, [...(porTipo.get(a.tipoId) ?? []), a.amenazaId]);
  }

  const amenazas = await prisma.amenaza.findMany({
    include: { frecuencia: true, degradacion: { include: { dimension: true, degradacion: true } } },
  });
  const amenazaPorId = new Map(amenazas.map((a) => [a.id, a]));

  const eficacias = await eficaciaPorAmenaza(prisma, delta);

  const existentes = await prisma.riesgo.findMany({
    select: {
      id: true,
      activoId: true,
      amenazaId: true,
      obsoleto: true,
      excluidoManual: true,
      frecuenciaId: true,
      madurezId: true,
    },
  });
  const claveExistente = new Map(existentes.map((r) => [`${r.activoId}|${r.amenazaId}`, r]));

  const frecuencias = new Map(
    (await prisma.escalaFrecuencia.findMany()).map((f) => [f.id, f.vecesAno]),
  );

  // Per-risk exceptions. The baseline degradation belongs to the threat; these rows are
  // the deliberate departures from it, and each one carries its own justification.
  const excepciones = await prisma.riesgoDegradacion.findMany({
    include: { dimension: true, degradacion: true },
  });
  const porRiesgo = new Map<number, Record<string, string>>();
  for (const e of excepciones) {
    const actual = porRiesgo.get(e.riesgoId) ?? {};
    actual[e.dimension.codigo] = String(e.degradacion.factor);
    porRiesgo.set(e.riesgoId, actual);
  }

  // An overridden maturity replaces the threat's aggregated efficacy for that one risk.
  const nivelPorMadurez = new Map(
    (await prisma.escalaMadurez.findMany()).map((m) => [m.id, m.nivel]),
  );

  const enAlcance = new Set<string>();
  let generados = 0;
  let residualSinCalcular = 0;
  let consecutivo = existentes.length;

  for (const activo of activos) {
    const valores = leerValores(activo.valores);
    if (!valores || !entraAlAnalisis(valores, umbral)) continue;

    for (const amenazaId of porTipo.get(activo.tipoId) ?? []) {
      const amenaza = amenazaPorId.get(amenazaId);
      if (!amenaza) continue;

      const clave = `${activo.id}|${amenazaId}`;
      enAlcance.add(clave);
      const previo = claveExistente.get(clave);

      // A person took this threat off this asset, with a reason. The parameterisation
      // still covers the pair, so without this guard the row would be resurrected on
      // every save that touches a maturity or a valuation.
      if (previo?.excluidoManual) continue;

      const degradaciones = {
        ...leerDegradaciones(amenaza.degradacion),
        ...(previo ? (porRiesgo.get(previo.id) ?? {}) : {}),
      };
      const aro = previo?.frecuenciaId
        ? frecuencias.get(previo.frecuenciaId) ?? amenaza.frecuencia.vecesAno
        : amenaza.frecuencia.vecesAno;

      // The per-risk override wins over the threat's aggregated efficacy.
      const eficacia =
        previo?.madurezId != null
          ? eficaciaDeNivel(nivelPorMadurez.get(previo.madurezId) ?? null)
          : eficacias.get(amenazaId);
      const calculo = calcularRiesgo({
        valores,
        degradaciones,
        aro,
        eficacia: eficacia ?? 0,
      });

      // Unknown efficacy leaves the residual side null rather than equal to the
      // inherent one.
      const residualConocido = eficacia !== null;
      if (!residualConocido) residualSinCalcular++;

      const derivados = {
        impacto: calculo.impacto.toString(),
        riesgoPotencial: calculo.riesgoPotencial.toString(),
        frecuenciaResidual: residualConocido ? calculo.frecuenciaResidual.toString() : null,
        riesgoResidual: residualConocido ? calculo.riesgoResidual.toString() : null,
        calculadoEn: new Date(),
      };

      if (previo) {
        await prisma.riesgo.update({
          where: { id: previo.id },
          data: { ...derivados, obsoleto: false, obsoletoEn: null },
        });
      } else {
        consecutivo++;
        await prisma.riesgo.create({
          data: {
            codigo: `R-${String(consecutivo).padStart(4, '0')}`,
            activo: { connect: { id: activo.id } },
            amenaza: { connect: { id: amenazaId } },
            ...derivados,
          },
        });
      }
      generados++;
    }
  }

  // Out of scope now: marked obsolete, never deleted.
  const fuera = existentes.filter(
    (r) => !enAlcance.has(`${r.activoId}|${r.amenazaId}`) && !r.obsoleto,
  );
  for (const r of fuera) {
    await prisma.riesgo.update({
      where: { id: r.id },
      data: { obsoleto: true, obsoletoEn: new Date() },
    });
  }

  return {
    activosEnInventario: activos.length,
    activosEnAnalisis: new Set([...enAlcance].map((k) => k.split('|')[0])).size,
    riesgosGenerados: generados,
    riesgosObsoletos: fuera.length,
    amenazasSinControles: [...eficacias.values()].filter((e) => e === null).length,
    residualSinCalcular,
  };
}

function leerValores(
  valores: { dimension: { codigo: string }; valor: { valor: number } }[],
): ValoresDimension | null {
  const mapa: Partial<ValoresDimension> = {};
  for (const v of valores) {
    if (v.dimension.codigo === 'D' || v.dimension.codigo === 'I' || v.dimension.codigo === 'C') {
      mapa[v.dimension.codigo] = v.valor.valor;
    }
  }
  if (mapa.D === undefined || mapa.I === undefined || mapa.C === undefined) return null;
  return mapa as ValoresDimension;
}

function leerDegradaciones(
  filas: { dimension: { codigo: string }; degradacion: { factor: unknown } }[],
): Record<keyof ValoresDimension, Decimal.Value> {
  const mapa: Record<string, Decimal.Value> = { D: 0, I: 0, C: 0 };
  for (const f of filas) {
    mapa[f.dimension.codigo] = String(f.degradacion.factor);
  }
  return mapa as Record<keyof ValoresDimension, Decimal.Value>;
}
