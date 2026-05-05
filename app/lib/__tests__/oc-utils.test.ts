import { computeOcRadarData } from '../oc-utils';
import type { Indicator, QualityObjective } from '../types';

const emptyMonthly = Array(12).fill({ v1: null, v2: null, resultado: null });
const emptyQ = [null, null, null, null];
const emptyS = [null, null];

const mockOCs: QualityObjective[] = [
  { codigo: 'OC1', descripcion: 'Satisfacción del cliente', cumplimiento: null },
  { codigo: 'OC2', descripcion: 'Mejora continua', cumplimiento: null },
];

function ind(
  proceso: string,
  oc: string,
  resultado: number | null,
  meta: string,
): Indicator {
  return {
    numero: 1, proceso, nombre: 'X', lider: 'L', frecuencia: 'Anual',
    meta, resultado, status: 'en_meta', oc,
    datosMensuales: emptyMonthly, datosTrimestrales: emptyQ, datosSemestrales: emptyS,
  };
}

test('groups by OC and computes averages without process filter', () => {
  const indicadores = [
    ind('P1', 'OC1', 80, '90%'),
    ind('P2', 'OC1', 100, '90%'),
    ind('P1', 'OC2', 70, '85%'),
  ];
  const result = computeOcRadarData(indicadores, mockOCs, null);
  expect(result).toHaveLength(2);
  expect(result[0].codigo).toBe('OC1');
  expect(result[0].cumplimiento).toBe(90);
  expect(result[0].meta).toBe(90);
  expect(result[1].codigo).toBe('OC2');
  expect(result[1].cumplimiento).toBe(70);
  expect(result[1].meta).toBe(85);
});

test('filters indicators by process when processFilter is set', () => {
  const indicadores = [
    ind('P1', 'OC1', 80, '90%'),
    ind('P2', 'OC1', 100, '90%'),
    ind('P1', 'OC2', 70, '85%'),
  ];
  const result = computeOcRadarData(indicadores, mockOCs, 'P1');
  expect(result).toHaveLength(2);
  const oc1 = result.find(r => r.codigo === 'OC1')!;
  expect(oc1.cumplimiento).toBe(80);
});

test('omits OCs that have no indicators for the selected process', () => {
  const indicadores = [
    ind('P1', 'OC1', 80, '90%'),
    ind('P2', 'OC2', 70, '85%'),
  ];
  const result = computeOcRadarData(indicadores, mockOCs, 'P1');
  expect(result).toHaveLength(1);
  expect(result[0].codigo).toBe('OC1');
});

test('ignores null resultados when computing cumplimiento average', () => {
  const indicadores = [
    ind('P1', 'OC1', null, '90%'),
    ind('P1', 'OC1', 80, '90%'),
  ];
  const result = computeOcRadarData(indicadores, mockOCs, null);
  expect(result[0].cumplimiento).toBe(80);
});

test('builds label with OC code and abbreviated description', () => {
  const indicadores = [ind('P1', 'OC1', 80, '90%')];
  const result = computeOcRadarData(indicadores, mockOCs, null);
  expect(result[0].label).toMatch(/^OC1 - /);
});

test('returns empty array when no indicators match the process', () => {
  const indicadores = [ind('P1', 'OC1', 80, '90%')];
  const result = computeOcRadarData(indicadores, mockOCs, 'P_NONEXISTENT');
  expect(result).toHaveLength(0);
});
