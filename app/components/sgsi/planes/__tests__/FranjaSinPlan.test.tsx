// app/components/sgsi/planes/__tests__/FranjaSinPlan.test.tsx
//
// REQ-SIG-20 §7.3 (D4, tarea 4.17) · spec `critical-risk-treatment-plan`:
//   · "Bands name three unplanned assets" — nombra los códigos, no un conteo pelado.
//   · "More than five shows a link" — cinco códigos + «+n más».
//   · Colapsar no descarta para siempre: es estado local, vuelve entera al re-montar.

import { fireEvent, render, screen } from '@testing-library/react';
import FranjaSinPlan, { type FilaFranjaSinPlan } from '../FranjaSinPlan';

jest.mock('next/navigation', () => ({
  usePathname: () => '/sgsi/planes',
  useSearchParams: () => new URLSearchParams(),
}));

function fila(activoCodigo: string, diasPendiente: number, escalado: boolean | null = false): FilaFranjaSinPlan {
  return {
    activoCodigo,
    activoNombre: `Nombre ${activoCodigo}`,
    amenazaCodigo: 'A.24',
    amenazaNombre: 'Denegación de servicio',
    diasPendiente,
    escalado,
  };
}

describe('FranjaSinPlan — nombra los códigos, no un conteo (spec "Bands name three unplanned assets")', () => {
  it('sin filas no renderiza nada', () => {
    const { container } = render(<FranjaSinPlan filas={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('tres activos nombrados, cada uno con su antigüedad', () => {
    render(
      <FranjaSinPlan
        filas={[fila('TEC-GEN-0004', 6), fila('TEC-EQU-0003', 2), fila('TEC-SER-0051', 0)]}
      />,
    );
    expect(screen.getByText('TEC-GEN-0004')).toBeInTheDocument();
    expect(screen.getByText('TEC-EQU-0003')).toBeInTheDocument();
    expect(screen.getByText('TEC-SER-0051')).toBeInTheDocument();
    expect(screen.getByText('hace 6 días')).toBeInTheDocument();
    expect(screen.getByText('hace 2 días')).toBeInTheDocument();
    expect(screen.getByText('hoy')).toBeInTheDocument();
    expect(screen.getByText(/3 activos con riesgo residual Crítico/)).toBeInTheDocument();
  });
});

describe('FranjaSinPlan — máximo cinco + «+n más» (spec "More than five shows a link")', () => {
  it('siete activos: cinco nombrados y un enlace "+2 más" a la página filtrada', () => {
    const filas = Array.from({ length: 7 }, (_, i) => fila(`TEC-GEN-000${i}`, 7 - i));
    render(<FranjaSinPlan filas={filas} />);

    for (let i = 0; i < 5; i++) expect(screen.getByText(`TEC-GEN-000${i}`)).toBeInTheDocument();
    expect(screen.queryByText('TEC-GEN-0005')).not.toBeInTheDocument();
    expect(screen.queryByText('TEC-GEN-0006')).not.toBeInTheDocument();

    const enlace = screen.getByText('+2 más →');
    expect(enlace.closest('a')).toHaveAttribute('href', '/sgsi/valoracion-riesgos?estadoPlan=pendiente');
  });
});

describe('FranjaSinPlan — se colapsa a una línea, nunca se descarta para siempre', () => {
  it('colapsar oculta la lista pero conserva el conteo; expandir la trae de vuelta ENTERA', () => {
    render(<FranjaSinPlan filas={[fila('TEC-GEN-0004', 6)]} />);

    expect(screen.getByText('TEC-GEN-0004')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Colapsar'));

    expect(screen.queryByText('TEC-GEN-0004')).not.toBeInTheDocument();
    expect(screen.getByText(/1 activo con riesgo residual Crítico/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/1 activo con riesgo residual Crítico/));
    expect(screen.getByText('TEC-GEN-0004')).toBeInTheDocument();
  });

  it('un solo activo escalado lo dice junto a la antigüedad', () => {
    render(<FranjaSinPlan filas={[fila('TEC-GEN-0004', 20, true)]} />);
    expect(screen.getByText('hace 20 días · escalado')).toBeInTheDocument();
  });
});
