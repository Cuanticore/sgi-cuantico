// app/components/sgsi/activos/__tests__/PopupPlanCritico.test.tsx
//
// REQ-SIG-20 §7 (D4, tarea 4.12) · spec `critical-risk-treatment-plan` "Fields prefilled":
// control, tipo MITIGAR, origen, madurez, responsable y fecha llegan prellenados desde una
// fixture. Cerrar sin registrar no llama a `registrarPlanCritico` — el guardado que abrió
// el popup ya tuvo éxito antes.

import { render, screen, waitFor } from '@testing-library/react';
import PopupPlanCritico from '../PopupPlanCritico';
import { datosPrefillPlanCritico, registrarPlanCritico } from '@/app/sgsi/acciones/plan';

jest.mock('@/app/sgsi/acciones/plan', () => ({
  datosPrefillPlanCritico: jest.fn(),
  registrarPlanCritico: jest.fn(),
}));

const mockPrefill = datosPrefillPlanCritico as jest.Mock;
const mockRegistrar = registrarPlanCritico as jest.Mock;

const FIXTURE = {
  riesgoCodigo: 'R-0123',
  activoCodigo: 'TEC-GEN-0004',
  activoNombre: 'MINTRACE producción',
  amenazaCodigo: 'A.24',
  amenazaNombre: 'Denegación de servicio',
  control: { id: 5, codigo: 'A.8.20', nombre: 'Protección contra DoS', madurezActual: 2 },
  madurezObjetivoSugerida: 3,
  responsable: { id: 9, nombre: 'Yuliet Rojas' },
  apruebaSugerido: { id: 12, nombre: 'Comité del SIG' },
  fechaObjetivo: '2026-12-15',
  cargos: [
    { id: 9, nombre: 'Yuliet Rojas' },
    { id: 12, nombre: 'Comité del SIG' },
  ],
  escalaMadurez: [
    { id: 30, nivel: 2, nombre: 'Repetible' },
    { id: 31, nivel: 3, nombre: 'Definido' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrefill.mockResolvedValue({ ok: true, mensaje: 'Prellenado listo.', datos: FIXTURE });
});

describe('PopupPlanCritico — prellenado (spec "Popup prefill sources")', () => {
  it('los seis campos llegan prellenados desde la fixture', async () => {
    render(
      <PopupPlanCritico activoCodigo="TEC-GEN-0004" amenazaCodigo="A.24" onCerrar={() => {}} />,
    );

    // Control
    await waitFor(() => {
      expect(screen.getByText('A.8.20 · Protección contra DoS')).toBeInTheDocument();
    });

    // Tipo — MITIGAR por defecto
    expect(screen.getByLabelText('Tipo de tratamiento')).toHaveValue('MITIGAR');

    // Riesgo de origen — el activo y la amenaza que dispararon el plan
    expect(screen.getByText(/R-0123 — MINTRACE producción × Denegación de servicio/)).toBeInTheDocument();

    // Madurez actual → objetivo
    expect(screen.getByText('L2')).toBeInTheDocument();
    expect(screen.getByLabelText('Madurez objetivo')).toHaveValue('31'); // L3 — Definido

    // Responsable — editable, prellenado con el propietario del activo
    expect(screen.getByLabelText('Responsable')).toHaveValue('9');

    // Fecha — hoy + plazoEjecucion (el label incluye el pie explicativo, de ahí el regex)
    expect(screen.getByLabelText(/^Fecha objetivo/)).toHaveValue('2026-12-15');
  });

  it('cerrar sin registrar no llama a registrarPlanCritico: el guardado ya tuvo éxito', async () => {
    const onCerrar = jest.fn();
    render(<PopupPlanCritico activoCodigo="TEC-GEN-0004" amenazaCodigo="A.24" onCerrar={onCerrar} />);

    await waitFor(() => expect(screen.getByText('A.8.20 · Protección contra DoS')).toBeInTheDocument());

    screen.getByText('Cerrar sin registrar').click();

    expect(onCerrar).toHaveBeenCalled();
    expect(mockRegistrar).not.toHaveBeenCalled();
  });

  it('sin control mapeado, MITIGAR queda impedido pero el popup no rompe', async () => {
    mockPrefill.mockResolvedValue({
      ok: true,
      mensaje: 'Prellenado listo.',
      datos: { ...FIXTURE, control: null, madurezObjetivoSugerida: null },
    });
    render(<PopupPlanCritico activoCodigo="TEC-GEN-0004" amenazaCodigo="A.24" onCerrar={() => {}} />);

    await waitFor(() => expect(screen.getByText('Sin control mapeado')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Registrar plan/ })).toBeDisabled();
  });
});
