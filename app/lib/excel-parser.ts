// app/lib/excel-parser.ts
import type ExcelJS from 'exceljs';
import {
  IndicatorsSummary, Quarter, Process, MonthlyData,
  QualityObjective, Indicator, IndicatorsData, IndicatorStatus,
  MonthlyMeasure,
} from './types';
import { IndicatorYear } from './sharepoint';

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// 2026: column indices for each month's V1, V2, Resultado in "Indicadores Gestión"
const MONTH_V1_COLS  = [18, 21, 24, 28, 31, 34, 39, 42, 45, 49, 52, 55];
const MONTH_V2_COLS  = [19, 22, 25, 29, 32, 35, 40, 43, 46, 50, 53, 56];
const MONTH_RES_COLS = [20, 23, 26, 30, 33, 36, 41, 44, 47, 51, 54, 57];
// Quarter: Q1=27, Q2=37, Q3=48, Q4=58; Semester: S1=38, S2=59

type AnyWorksheet = Pick<ExcelJS.Worksheet, 'getRow'>;

function cellValue(ws: AnyWorksheet, row: number, col: number): unknown {
  const val = ws.getRow(row).getCell(col).value;
  if (val !== null && typeof val === 'object') {
    const obj = val as unknown as Record<string, unknown>;
    if ('formula' in obj || 'sharedFormula' in obj) {
      return 'result' in obj ? (obj.result ?? null) : null;
    }
  }
  return val;
}

function toPercent(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && val !== null && 'error' in val) return null;
  const n = Number(val);
  if (isNaN(n)) return null;
  // ExcelJS returns decimals for percentages (0.814 → 81.4%)
  // Values > 2 are already in percent form
  return n <= 2 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
}

function toRaw(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && val !== null && 'error' in val) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function statusFromEmoji(text: string): IndicatorStatus {
  if (text.includes('🟢') || text.toLowerCase().includes('en meta')) return 'en_meta';
  if (text.includes('🟡') || text.toLowerCase().includes('alerta')) return 'alerta';
  if (text.includes('🔴') || text.toLowerCase().includes('crítico') || text.toLowerCase().includes('critico')) return 'critico';
  return 'sin_datos';
}

function computeStatus(resultado: number | null, meta: string): IndicatorStatus {
  if (resultado === null) return 'sin_datos';
  const metaNum = parseFloat(meta.replace('%', '').replace('≥', '').trim());
  if (isNaN(metaNum)) return resultado > 0 ? 'en_meta' : 'sin_datos';
  if (resultado >= metaNum) return 'en_meta';
  if (resultado >= metaNum * 0.8) return 'alerta';
  return 'critico';
}

// Returns best available result: quarterly/semester aggregates preferred over raw monthly
function getBestResult(ws: AnyWorksheet, row: number): number | null {
  for (const col of [58, 59, 48, 37, 38, 27]) { // Q4, S2, Q3, Q2, S1, Q1
    const v = toPercent(cellValue(ws, row, col));
    if (v !== null) return v;
  }
  for (let i = MONTH_RES_COLS.length - 1; i >= 0; i--) {
    const v = toPercent(cellValue(ws, row, MONTH_RES_COLS[i]));
    if (v !== null) return v;
  }
  return null;
}

// ─── 2026 parsers ─────────────────────────────────────────────────────────────

export function parseExecutiveSummary(ws: AnyWorksheet): IndicatorsSummary {
  const avanceRaw = cellValue(ws, 7, 2);
  const evaluadosStr = String(cellValue(ws, 7, 4) ?? '');
  const match = evaluadosStr.match(/(\d+)\s*\/\s*(\d+)/);

  return {
    avanceGlobal: toPercent(avanceRaw) ?? 0,
    medidos: match ? parseInt(match[1]) : 0,
    totalIndicadores: match ? parseInt(match[2]) : 0,
    enMeta: Number(cellValue(ws, 7, 6)),
    alerta: Number(cellValue(ws, 7, 8)),
    critico: Number(cellValue(ws, 7, 10)),
  };
}

export function parseQuarters(ws: AnyWorksheet): Quarter[] {
  return [11, 12, 13, 14].map(rowIdx => {
    const cumplimientoRaw = cellValue(ws, rowIdx, 4);
    const cumplimiento = toPercent(cumplimientoRaw);
    const estadoText = String(cellValue(ws, rowIdx, 6) ?? '');

    return {
      label: String(cellValue(ws, rowIdx, 2) ?? ''),
      months: String(cellValue(ws, rowIdx, 3) ?? ''),
      cumplimiento,
      mediciones: Number(cellValue(ws, rowIdx, 5)) || 0,
      status: statusFromEmoji(estadoText),
    };
  });
}

export function parseProcesses(ws: AnyWorksheet): Process[] {
  const processes: Process[] = [];
  for (let row = 19; row <= 27; row++) {
    const nombre = cellValue(ws, row, 2);
    if (!nombre) continue;
    const cumplimiento = toPercent(cellValue(ws, row, 4));
    const meta = toPercent(cellValue(ws, row, 5)) ?? 90;
    const estadoText = String(cellValue(ws, row, 6) ?? '');

    processes.push({
      nombre: String(nombre),
      numIndicadores: Number(cellValue(ws, row, 3)) || 0,
      cumplimiento,
      meta,
      status: statusFromEmoji(estadoText),
    });
  }
  return processes;
}

export function parseMonthly(ws: AnyWorksheet): MonthlyData[] {
  return MONTH_NAMES.map((mes, i) => {
    const col = 3 + i; // cols 3–14
    return { mes, cumplimiento: toPercent(cellValue(ws, 31, col)) };
  });
}

export function parseQualityObjectives(ws: AnyWorksheet): QualityObjective[] {
  return [11, 12, 13, 14, 15].map(row => ({
    codigo: String(cellValue(ws, row, 8) ?? ''),
    descripcion: String(cellValue(ws, row, 9) ?? ''),
    cumplimiento: toPercent(cellValue(ws, row, 11)),
  }));
}

export function parseIndicators(ws: AnyWorksheet): Indicator[] {
  const indicators: Indicator[] = [];
  for (let row = 18; row <= 200; row++) {
    const numero = cellValue(ws, row, 1);
    if (!numero) break;

    // Excel stores percentages as decimals (0.9 = 90%); convert to "90%" string
    const toMetaStr = (raw: unknown): string => {
      const pct = toPercent(raw);
      return pct !== null ? `${pct}%` : String(raw ?? '');
    };

    const metaStr = toMetaStr(cellValue(ws, row, 14));
    const resultado = getBestResult(ws, row);

    const datosMensuales: MonthlyMeasure[] = MONTH_NAMES.map((_, i) => ({
      v1: toRaw(cellValue(ws, row, MONTH_V1_COLS[i])),
      v2: toRaw(cellValue(ws, row, MONTH_V2_COLS[i])),
      resultado: toPercent(cellValue(ws, row, MONTH_RES_COLS[i])),
    }));

    const qp = (col: number) => toPercent(cellValue(ws, row, col));

    indicators.push({
      numero: Number(numero),
      proceso: String(cellValue(ws, row, 2) ?? ''),
      nombre: String(cellValue(ws, row, 3) ?? ''),
      lider: String(cellValue(ws, row, 4) ?? ''),
      objetivo: String(cellValue(ws, row, 8) ?? ''),
      oc: String(cellValue(ws, row, 9) ?? ''),
      formula: String(cellValue(ws, row, 10) ?? ''),
      tipo: String(cellValue(ws, row, 12) ?? ''),
      frecuencia: String(cellValue(ws, row, 13) ?? ''),
      meta: metaStr,
      nivelEstandar: toMetaStr(cellValue(ws, row, 15)),
      nivelMedio: toMetaStr(cellValue(ws, row, 16)),
      nivelCritico: toMetaStr(cellValue(ws, row, 17)),
      resultado,
      status: computeStatus(resultado, metaStr),
      datosMensuales,
      datosTrimestrales: [qp(27), qp(37), qp(48), qp(58)],
      datosSemestrales: [qp(38), qp(59)],
    });
  }
  return indicators;
}

// ─── 2025 parsers ─────────────────────────────────────────────────────────────

const V1_COLS_2025 = [17, 20, 23, 26, 29, 32, 35, 38, 41, 44, 47, 50];
const V2_COLS_2025 = [18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51];
const INDICATOR_ROWS_2025 = Array.from({ length: 16 }, (_, i) => 19 + i);

const EMPTY_MONTHLY: MonthlyMeasure[] = MONTH_NAMES.map(() => ({ v1: null, v2: null, resultado: null }));

function parseExecutiveSummary2025(ws: AnyWorksheet): IndicatorsSummary {
  const totalIndicadores = Number(cellValue(ws, 8, 2)) || 0;
  const enMeta = Number(cellValue(ws, 8, 3)) || 0;
  const alerta = (Number(cellValue(ws, 8, 4)) || 0) + (Number(cellValue(ws, 8, 5)) || 0);
  const critico = Number(cellValue(ws, 8, 6)) || 0;
  const sinMedicion = Number(cellValue(ws, 8, 7)) || 0;
  return {
    avanceGlobal: toPercent(cellValue(ws, 8, 8)) ?? 0,
    totalIndicadores,
    medidos: totalIndicadores - sinMedicion,
    enMeta,
    alerta,
    critico,
  };
}

function parseIndicators2025(ws: AnyWorksheet): Indicator[] {
  const indicators: Indicator[] = [];
  for (const row of INDICATOR_ROWS_2025) {
    const nombre = cellValue(ws, row, 3);
    if (!nombre) continue;

    let totalV1 = 0, totalV2 = 0;
    for (let mi = 0; mi < 12; mi++) {
      const v2 = Number(cellValue(ws, row, V2_COLS_2025[mi])) || 0;
      if (v2 > 0) {
        totalV1 += Number(cellValue(ws, row, V1_COLS_2025[mi])) || 0;
        totalV2 += v2;
      }
    }
    // Multiply by 100 directly — toPercent's ≤2 threshold breaks for ratios > 200%
    const resultado = totalV2 > 0 ? Math.round(totalV1 / totalV2 * 1000) / 10 : null;
    const metaRaw = toPercent(cellValue(ws, row, 13));
    const metaStr = metaRaw !== null ? `${metaRaw}%` : '';

    indicators.push({
      numero: row - 18,
      proceso: String(cellValue(ws, row, 2) ?? ''),
      nombre: String(nombre),
      lider: String(cellValue(ws, row, 4) ?? ''),
      oc: String(cellValue(ws, row, 8) ?? ''),
      frecuencia: String(cellValue(ws, row, 12) ?? ''),
      meta: metaStr,
      resultado,
      status: computeStatus(resultado, metaStr),
      datosMensuales: EMPTY_MONTHLY,
      datosTrimestrales: [null, null, null, null],
      datosSemestrales: [null, null],
    });
  }
  return indicators;
}

function parseMonthly2025(ws: AnyWorksheet): MonthlyData[] {
  // Average individual indicator ratios — avoids scale dominance from high-volume indicators
  return MONTH_NAMES.map((mes, mi) => {
    const results: number[] = [];
    for (const row of INDICATOR_ROWS_2025) {
      const v2 = Number(cellValue(ws, row, V2_COLS_2025[mi])) || 0;
      if (v2 > 0) {
        const v1 = Number(cellValue(ws, row, V1_COLS_2025[mi])) || 0;
        results.push(Math.round(v1 / v2 * 1000) / 10);
      }
    }
    const cumplimiento = results.length
      ? Math.round(results.reduce((a: number, b: number) => a + b, 0) / results.length * 10) / 10
      : null;
    return { mes, cumplimiento };
  });
}

function parseQualityObjectives2025(ws: AnyWorksheet): QualityObjective[] {
  return [35, 36, 37, 38, 39].map(row => ({
    codigo: String(cellValue(ws, row, 2) ?? ''),
    descripcion: String(cellValue(ws, row, 3) ?? ''),
    cumplimiento: toPercent(cellValue(ws, row, 8)),
  }));
}

function computeProcesses2025(indicators: Indicator[]): Process[] {
  const map = new Map<string, { results: number[]; count: number }>();
  for (const ind of indicators) {
    if (!map.has(ind.proceso)) map.set(ind.proceso, { results: [], count: 0 });
    const entry = map.get(ind.proceso)!;
    entry.count++;
    if (ind.resultado !== null) entry.results.push(ind.resultado);
  }
  const processes: Process[] = [];
  map.forEach(({ results, count }, nombre) => {
    const cumplimiento = results.length
      ? Math.round(results.reduce((a: number, b: number) => a + b, 0) / results.length * 10) / 10
      : null;
    processes.push({ nombre, numIndicadores: count, cumplimiento, meta: 90, status: computeStatus(cumplimiento, '90%') });
  });
  return processes;
}

// ─── entry point ─────────────────────────────────────────────────────────────

export async function parseExcelBuffer(buffer: Buffer, year: IndicatorYear = '2026'): Promise<Omit<IndicatorsData, 'fetchedAt'>> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  if (year === '2025') {
    const dashboard = workbook.getWorksheet('Dashboard 2025')!;
    const indicadoresWs = workbook.getWorksheet('Indicadores 2025')!;
    const indicadores = parseIndicators2025(indicadoresWs);
    return {
      summary: parseExecutiveSummary2025(dashboard),
      trimestres: [],
      procesos: computeProcesses2025(indicadores),
      mensual: parseMonthly2025(indicadoresWs),
      indicadores,
      objetivosCalidad: parseQualityObjectives2025(dashboard),
    };
  }

  const cuadro = workbook.getWorksheet('Cuadro de Mando 2026')!;
  const indicadoresWs = workbook.getWorksheet('Indicadores Gestión')!;

  return {
    summary: parseExecutiveSummary(cuadro),
    trimestres: parseQuarters(cuadro),
    procesos: parseProcesses(cuadro),
    mensual: parseMonthly(cuadro),
    indicadores: parseIndicators(indicadoresWs),
    objetivosCalidad: parseQualityObjectives(cuadro),
  };
}
