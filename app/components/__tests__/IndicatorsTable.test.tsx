// app/components/__tests__/IndicatorsTable.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import IndicatorsTable from '../IndicatorsTable';
import type { Indicator } from '@/app/lib/types';

const emptyMonthly = Array(12).fill({ v1: null, v2: null, resultado: null });
const emptyQ = [null, null, null, null];
const emptyS = [null, null];

const mockIndicators: Indicator[] = [
  {
    numero: 1, proceso: 'P1', nombre: 'Ind A', lider: 'L1',
    frecuencia: 'Anual', meta: '90%', resultado: 95,
    status: 'en_meta', oc: 'OC1',
    datosMensuales: emptyMonthly, datosTrimestrales: emptyQ, datosSemestrales: emptyS,
  },
  {
    numero: 2, proceso: 'P2', nombre: 'Ind B', lider: 'L2',
    frecuencia: 'Trimestral', meta: '90%', resultado: 50,
    status: 'critico', oc: 'OC2',
    datosMensuales: emptyMonthly, datosTrimestrales: emptyQ, datosSemestrales: emptyS,
  },
  {
    numero: 3, proceso: 'P3', nombre: 'Ind C', lider: 'L3',
    frecuencia: 'Mensual', meta: '90%', resultado: null,
    status: 'sin_datos', oc: 'OC3',
    datosMensuales: emptyMonthly, datosTrimestrales: emptyQ, datosSemestrales: emptyS,
  },
];

test('shows all indicators by default', () => {
  render(<IndicatorsTable indicadores={mockIndicators} />);
  expect(screen.getByText('Ind A')).toBeInTheDocument();
  expect(screen.getByText('Ind B')).toBeInTheDocument();
  expect(screen.getByText('Ind C')).toBeInTheDocument();
});

test('filters to en_meta when clicking En Meta tab', () => {
  render(<IndicatorsTable indicadores={mockIndicators} />);
  fireEvent.click(screen.getByRole('button', { name: /En Meta/i }));
  expect(screen.getByText('Ind A')).toBeInTheDocument();
  expect(screen.queryByText('Ind B')).not.toBeInTheDocument();
  expect(screen.queryByText('Ind C')).not.toBeInTheDocument();
});

test('filters to critico when clicking Crítico tab', () => {
  render(<IndicatorsTable indicadores={mockIndicators} />);
  fireEvent.click(screen.getByRole('button', { name: /Crítico/i }));
  expect(screen.queryByText('Ind A')).not.toBeInTheDocument();
  expect(screen.getByText('Ind B')).toBeInTheDocument();
  expect(screen.queryByText('Ind C')).not.toBeInTheDocument();
});

test('returns to all indicators when clicking Todos tab', () => {
  render(<IndicatorsTable indicadores={mockIndicators} />);
  fireEvent.click(screen.getByRole('button', { name: /En Meta/i }));
  fireEvent.click(screen.getByRole('button', { name: /^Todos$/i }));
  expect(screen.getByText('Ind A')).toBeInTheDocument();
  expect(screen.getByText('Ind B')).toBeInTheDocument();
  expect(screen.getByText('Ind C')).toBeInTheDocument();
});
