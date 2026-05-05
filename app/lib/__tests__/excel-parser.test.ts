// app/lib/__tests__/excel-parser.test.ts
import {
  parseExecutiveSummary,
  parseQuarters,
  parseProcesses,
  parseMonthly,
  parseIndicators,
  parseQualityObjectives,
} from '../excel-parser';

// Mock helpers — simulate ExcelJS Worksheet API
function mockCell(value: unknown) {
  return { value };
}
function mockRow(cells: Record<number, unknown>) {
  return { getCell: (col: number) => mockCell(cells[col] ?? null) };
}
function mockWs(rows: Record<number, Record<number, unknown>>) {
  return { getRow: (row: number) => mockRow(rows[row] ?? {}) };
}

describe('parseExecutiveSummary', () => {
  it('parses avance, evaluados, enMeta, alerta, critico', () => {
    const ws = mockWs({ 7: { 2: 0.814, 4: '17 / 26', 6: 11, 8: 1, 10: 2 } });
    const result = parseExecutiveSummary(ws as any);
    expect(result.avanceGlobal).toBeCloseTo(81.4, 1);
    expect(result.medidos).toBe(17);
    expect(result.totalIndicadores).toBe(26);
    expect(result.enMeta).toBe(11);
    expect(result.alerta).toBe(1);
    expect(result.critico).toBe(2);
  });
});

describe('parseQuarters', () => {
  it('parses Q1–Q4 rows with status', () => {
    const ws = mockWs({
      11: { 2: 'Q1', 3: 'Ene-Mar', 4: 0.81, 5: 38, 6: '🟡 Alerta' },
      12: { 2: 'Q2', 3: 'Abr-Jun', 4: 0.582, 5: 6, 6: '🔴 Crítico' },
      13: { 2: 'Q3', 3: 'Jul-Sep', 4: 0, 5: 0, 6: 'Sin datos' },
      14: { 2: 'Q4', 3: 'Oct-Dic', 4: 0, 5: 0, 6: 'Sin datos' },
    });
    const result = parseQuarters(ws as any);
    expect(result).toHaveLength(4);
    expect(result[0].label).toBe('Q1');
    expect(result[0].cumplimiento).toBeCloseTo(81.0, 1);
    expect(result[0].status).toBe('alerta');
    expect(result[1].status).toBe('critico');
    expect(result[2].status).toBe('sin_datos');
  });
});

describe('parseProcesses', () => {
  it('parses process rows with status', () => {
    const ws = mockWs({
      19: { 2: 'Gestión Estratégica', 3: 3, 4: 0.445, 5: 0.9, 6: '🔴 Crítico' },
      20: { 2: 'Gestión Comercial', 3: 3, 4: 0.702, 5: 0.95, 6: '🔴 Crítico' },
      27: { 2: 'Gestión de Calidad', 3: 4, 4: 1.0, 5: 1.0, 6: '🟢 En meta' },
      28: { 2: null },
    });
    const result = parseProcesses(ws as any);
    expect(result[0].nombre).toBe('Gestión Estratégica');
    expect(result[0].cumplimiento).toBeCloseTo(44.5, 1);
    expect(result[0].meta).toBeCloseTo(90, 0);
    expect(result[0].status).toBe('critico');
    expect(result.find(p => p.nombre === 'Gestión de Calidad')?.status).toBe('en_meta');
  });
});

describe('parseMonthly', () => {
  it('parses monthly cumplimiento values, null for errors', () => {
    const ws = mockWs({
      31: { 3: 0.796, 4: 0.789, 5: 0.848, 6: 0.582, 7: { error: '#N/D' } },
    });
    const result = parseMonthly(ws as any);
    expect(result).toHaveLength(12);
    expect(result[0].mes).toBe('Ene');
    expect(result[0].cumplimiento).toBeCloseTo(79.6, 1);
    expect(result[3].cumplimiento).toBeCloseTo(58.2, 1);
    expect(result[4].cumplimiento).toBeNull();
  });
});

describe('parseQualityObjectives', () => {
  it('parses OC codes and descriptions from cols 8–9', () => {
    const ws = mockWs({
      11: { 8: 'OC1', 9: 'Satisfacción del cliente' },
      12: { 8: 'OC2', 9: 'Mejora continua' },
      15: { 8: 'OC5', 9: 'Eficiencia Operativa' },
    });
    const result = parseQualityObjectives(ws as any);
    expect(result).toHaveLength(5);
    expect(result[0].codigo).toBe('OC1');
    expect(result[0].descripcion).toBe('Satisfacción del cliente');
  });
});

describe('parseIndicators', () => {
  it('parses indicator rows from row 19 until col 1 is empty', () => {
    const ws = mockWs({
      19: { 1: 1, 2: 'Gestión Estratégica', 3: 'Cumplimiento sostenibilidad', 4: 'Daniel Medina', 9: 'OC5', 13: 'Anual', 14: '90%', 20: 0.34 },
      20: { 1: 2, 2: 'Gestión Estratégica', 3: 'Ingresos compañía', 4: 'Daniel Medina', 9: 'OC5', 13: 'Anual', 14: '90%', 20: 0 },
      21: { 1: null },
    });
    const result = parseIndicators(ws as any);
    expect(result).toHaveLength(2);
    expect(result[0].numero).toBe(1);
    expect(result[0].resultado).toBeCloseTo(34, 0);
    expect(result[0].status).toBe('critico');
  });
});
