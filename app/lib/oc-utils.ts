import type { Indicator, QualityObjective, OcRadarData } from './types';

function parseMeta(meta: string): number | null {
  const match = meta.match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

function abbreviate(s: string, max = 20): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

export function computeOcRadarData(
  indicadores: Indicator[],
  objetivosCalidad: QualityObjective[],
  processFilter: string | null,
): OcRadarData[] {
  const filtered = processFilter
    ? indicadores.filter(ind => ind.proceso === processFilter)
    : indicadores;

  const ocMap = new Map<string, { resultados: number[]; metas: number[] }>();

  for (const ind of filtered) {
    if (!ind.oc) continue;
    if (!ocMap.has(ind.oc)) ocMap.set(ind.oc, { resultados: [], metas: [] });
    const entry = ocMap.get(ind.oc)!;
    if (ind.resultado !== null) entry.resultados.push(ind.resultado);
    const metaVal = parseMeta(ind.meta);
    if (metaVal !== null) entry.metas.push(metaVal);
  }

  return Array.from(ocMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([codigo, { resultados, metas }]) => {
      const obj = objetivosCalidad.find(o => o.codigo === codigo);
      const desc = obj ? abbreviate(obj.descripcion) : codigo;
      return {
        codigo,
        label: `${codigo} - ${desc}`,
        cumplimiento: avg(resultados),
        meta: avg(metas),
      };
    });
}
