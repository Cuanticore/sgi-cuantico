// app/components/sgsi/valoracion-riesgos/__tests__/PopupPlanesActivo.test.tsx
//
// La fila de una amenaza en banda alarmante (Alto/Crítico) y sin plan lleva el acento visual
// de `lib/sgsi/alto-sin-plan.ts`; la que ya tiene plan, no — aunque su banda también sea Alto.
// El mock de las acciones de servidor sigue el patrón de
// `app/components/sgsi/activos/__tests__/PopupPlanCritico.test.tsx`, que resuelve el mismo
// problema (el popup importa `next/cache` a través de la server action).

import { render, screen, waitFor } from '@testing-library/react';
import PopupPlanesActivo from '../PopupPlanesActivo';
import { datosPrefillPlanesActivo, registrarPlanesActivo } from '@/app/sgsi/acciones/plan';

jest.mock('@/app/sgsi/acciones/plan', () => ({
  datosPrefillPlanesActivo: jest.fn(),
  registrarPlanesActivo: jest.fn(),
}));

const mockPrefill = datosPrefillPlanesActivo as jest.Mock;

function amenaza(sobrescribir: Partial<Record<string, unknown>>) {
  return {
    amenazaCodigo: 'A.1',
    amenazaNombre: 'Amenaza de prueba',
    principalCodigo: null,
    principalNombre: null,
    principalNivel: null,
    brecha: null,
    estadoBrecha: 'sin-principal',
    planExistente: null,
    residual: 10,
    bandaResidual: 'Alto',
    ...sobrescribir,
  };
}

const FIXTURE = {
  activoCodigo: 'TEC-GEN-0004',
  activoNombre: 'MINTRACE producción',
  amenazas: [
    amenaza({ amenazaCodigo: 'A.10', bandaResidual: 'Alto', planExistente: null }),
    amenaza({ amenazaCodigo: 'A.20', bandaResidual: 'Alto', planExistente: 'PL-0001' }),
  ],
  responsable: null,
  apruebaSugerido: null,
  fechaObjetivo: null,
  cargos: [],
  escalaMadurez: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrefill.mockResolvedValue({ ok: true, mensaje: 'Prellenado listo.', datos: FIXTURE });
});

describe('PopupPlanesActivo — acento de alto sin plan', () => {
  it('la amenaza Alto sin plan lleva el título de aviso; la que tiene plan, no', async () => {
    render(<PopupPlanesActivo activoCodigo="TEC-GEN-0004" onCerrar={() => {}} />);

    await waitFor(() => expect(screen.getByText('A.10')).toBeInTheDocument());

    const filaSinPlan = screen.getByText('A.10').closest('tr');
    const filaConPlan = screen.getByText('A.20').closest('tr');

    expect(filaSinPlan).toHaveAttribute('title', 'Residual Alto y sin plan registrado');
    expect(filaConPlan).not.toHaveAttribute('title');
  });
});
