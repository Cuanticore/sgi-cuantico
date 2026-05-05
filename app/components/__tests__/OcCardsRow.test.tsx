import { render, screen } from '@testing-library/react';
import OcCardsRow from '../OcCardsRow';
import type { OcRadarData } from '@/app/lib/types';

const mockOcData: OcRadarData[] = [
  { codigo: 'OC1', label: 'OC1 - Satisfacción del clie…', cumplimiento: 92, meta: 90 },
  { codigo: 'OC2', label: 'OC2 - Tiempo de entrega', cumplimiento: 75, meta: 90 },
  { codigo: 'OC3', label: 'OC3 - Calidad del producto', cumplimiento: 87, meta: 90 },
];

test('renders a card for each OC', () => {
  render(<OcCardsRow ocData={mockOcData} />);
  expect(screen.getByText('OC1')).toBeInTheDocument();
  expect(screen.getByText('OC2')).toBeInTheDocument();
  expect(screen.getByText('OC3')).toBeInTheDocument();
});

test('shows description from label (part after " - ")', () => {
  render(<OcCardsRow ocData={mockOcData} />);
  expect(screen.getByText('Satisfacción del clie…')).toBeInTheDocument();
  expect(screen.getByText('Tiempo de entrega')).toBeInTheDocument();
});

test('shows cumplimiento percentage and meta', () => {
  render(<OcCardsRow ocData={mockOcData} />);
  expect(screen.getByText('92%')).toBeInTheDocument();
  // all three OCs share meta 90%, so multiple elements are expected
  expect(screen.getAllByText('90%').length).toBeGreaterThan(0);
});

test('shows "En meta" for cumplimiento >= 95% of meta', () => {
  render(<OcCardsRow ocData={[{ codigo: 'OC1', label: 'OC1 - X', cumplimiento: 90, meta: 90 }]} />);
  expect(screen.getByText('En meta')).toBeInTheDocument();
});

test('shows "Alerta" for cumplimiento between 85-95% of meta', () => {
  // 80/90 = 0.889 — dentro del rango [0.85, 0.95)
  render(<OcCardsRow ocData={[{ codigo: 'OC1', label: 'OC1 - X', cumplimiento: 80, meta: 90 }]} />);
  expect(screen.getByText('Alerta')).toBeInTheDocument();
});

test('shows "Crítico" for cumplimiento below 85% of meta', () => {
  render(<OcCardsRow ocData={[{ codigo: 'OC1', label: 'OC1 - X', cumplimiento: 75, meta: 90 }]} />);
  expect(screen.getByText('Crítico')).toBeInTheDocument();
});

test('renders nothing when ocData is empty', () => {
  const { container } = render(<OcCardsRow ocData={[]} />);
  expect(container.firstChild).toBeNull();
});

test('shows "Sin datos" when meta is 0', () => {
  render(<OcCardsRow ocData={[{ codigo: 'OC1', label: 'OC1 - X', cumplimiento: 0, meta: 0 }]} />);
  expect(screen.getByText('Sin datos')).toBeInTheDocument();
});
