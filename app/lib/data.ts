// app/lib/data.ts
import { IndicatorsData } from './types';
import { fetchIndicatorsBuffer } from './sharepoint';
import { parseExcelBuffer } from './excel-parser';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let cache: { data: IndicatorsData; timestamp: number } | null = null;

export async function getIndicatorsData(): Promise<IndicatorsData> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  const buffer = await fetchIndicatorsBuffer();
  const parsed = await parseExcelBuffer(buffer);
  const data: IndicatorsData = { ...parsed, fetchedAt: new Date().toISOString() };
  cache = { data, timestamp: Date.now() };
  return data;
}

export function invalidateCache(): void {
  cache = null;
}
