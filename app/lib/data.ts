// app/lib/data.ts
import { IndicatorsData } from './types';
import { fetchIndicatorsBuffer, IndicatorYear } from './sharepoint';
import { parseExcelBuffer } from './excel-parser';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const caches: Partial<Record<IndicatorYear, { data: IndicatorsData; timestamp: number }>> = {};

export async function getIndicatorsData(year: IndicatorYear = '2026'): Promise<IndicatorsData> {
  const cached = caches[year];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const buffer = await fetchIndicatorsBuffer(year);
  const parsed = await parseExcelBuffer(buffer);
  const data: IndicatorsData = { ...parsed, fetchedAt: new Date().toISOString() };
  caches[year] = { data, timestamp: Date.now() };
  return data;
}

export function invalidateCache(year?: IndicatorYear): void {
  if (year) {
    delete caches[year];
  } else {
    (Object.keys(caches) as IndicatorYear[]).forEach(k => delete caches[k]);
  }
}
