// app/lib/excel-parser.ts
import type ExcelJS from 'exceljs';
import {
  IndicatorsSummary, Quarter, Process, MonthlyData,
  QualityObjective, Indicator, IndicatorsData, IndicatorStatus,
} from './types';

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

type AnyWorksheet = Pick<ExcelJS.Worksheet, 'getRow'>;

function cellValue(ws: AnyWorksheet, row: number, col: number): unknown {
  return ws.getRow(row).getCell(col).value;
}

function toPercent(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && val !== null && 'error' in val) return null;
  const n = Number(val);
  if (isNaN(n)) return null;
  // ExcelJS returns decimals for percentages (0.814 for 81.4%)
  // Values > 2 are already in percent form (edge case: >200% indicators like Talento Humano 111%)
  return n <= 2 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
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
    cumplimiento: null,
  }));
}

export function parseIndicators(ws: AnyWorksheet): Indicator[] {
  const indicators: Indicator[] = [];
  for (let row = 19; row <= 200; row++) {
    const numero = cellValue(ws, row, 1);
    if (!numero) break;
    const metaStr = String(cellValue(ws, row, 14) ?? '');
    const resultadoRaw = cellValue(ws, row, 20);
    const resultado = toPercent(resultadoRaw);

    indicators.push({
      numero: Number(numero),
      proceso: String(cellValue(ws, row, 2) ?? ''),
      nombre: String(cellValue(ws, row, 3) ?? ''),
      lider: String(cellValue(ws, row, 4) ?? ''),
      oc: String(cellValue(ws, row, 9) ?? ''),
      frecuencia: String(cellValue(ws, row, 13) ?? ''),
      meta: metaStr,
      resultado,
      status: computeStatus(resultado, metaStr),
    });
  }
  return indicators;
}

export async function parseExcelBuffer(buffer: Buffer): Promise<Omit<IndicatorsData, 'fetchedAt'>> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

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
