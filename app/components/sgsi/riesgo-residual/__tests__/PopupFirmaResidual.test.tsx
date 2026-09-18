// app/components/sgsi/riesgo-residual/__tests__/PopupFirmaResidual.test.tsx
//
// Registrar una firma que ocurrió en papel. Lo que el popup no puede permitir:
//   · guardar sin el soporte — marcar una firma sin el papel que la sostiene es el registro
//     que nadie puede auditar;
//   · ofrecer procesos que no tienen firmante resoluble, ni los que ya firmaron;
//   · guardar sin decir QUIÉN firmó cada proceso que se marcó.

import { fireEvent, render, screen } from '@testing-library/react';
import PopupFirmaResidual from '../PopupFirmaResidual';
import type { RenglonFirmaVista } from '@/app/sgsi/riesgo-residual/acta.query';

const cargar = jest.fn();
jest.mock('@/app/sgsi/acciones/acta-residual', () => ({
  emitirActaResidual: jest.fn(),
  cargarSoporteActaResidual: (...args: unknown[]) => cargar(...args),
  anularActaResidual: jest.fn(),
}));

function renglon(p: Partial<RenglonFirmaVista> & { areaId: number }): RenglonFirmaVista {
  return {
    proceso: `Proceso ${p.areaId}`,
    cargoNombre: 'Líder',
    resoluble: true,
    activos: 2,
    aprobo: false,
    firmante: null,
    fechaFirma: null,
    soporteId: null,
    registradoPor: null,
    candidatos: [{ id: 100, nombre: 'Ana Ruiz' }],
    ...p,
  };
}

function abrir(renglones: RenglonFirmaVista[]) {
  return render(
    <PopupFirmaResidual actaId={1} renglones={renglones} alCerrar={jest.fn()} />,
  );
}

describe('PopupFirmaResidual', () => {
  beforeEach(() => cargar.mockReset());

  it('ofrece sólo los procesos resolubles que todavía no han firmado', () => {
    abrir([
      renglon({ areaId: 1, proceso: 'Tecnología' }),
      renglon({ areaId: 2, proceso: 'Legal', resoluble: false, candidatos: [] }),
      renglon({ areaId: 3, proceso: 'Talento', aprobo: true, firmante: 'Luis Paz' }),
    ]);
    expect(screen.getByLabelText(/Tecnología/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Legal/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Talento/)).not.toBeInTheDocument();
  });

  it('sin ningún proceso pendiente lo dice en vez de mostrar un formulario vacío', () => {
    abrir([renglon({ areaId: 3, proceso: 'Talento', aprobo: true, firmante: 'Luis Paz' })]);
    expect(screen.getByText(/no queda ningún proceso/i)).toBeInTheDocument();
  });

  // La regla que sostiene todo lo demás: el papel primero.
  it('no deja guardar sin archivo adjunto', () => {
    abrir([renglon({ areaId: 1, proceso: 'Tecnología' })]);
    fireEvent.click(screen.getByLabelText(/Tecnología/));
    fireEvent.click(screen.getByRole('button', { name: /registrar/i }));
    expect(cargar).not.toHaveBeenCalled();
    expect(screen.getByText(/adjunta el acta firmada/i)).toBeInTheDocument();
  });

  it('no deja guardar sin marcar al menos un proceso', () => {
    abrir([renglon({ areaId: 1, proceso: 'Tecnología' })]);
    fireEvent.click(screen.getByRole('button', { name: /registrar/i }));
    expect(cargar).not.toHaveBeenCalled();
    expect(screen.getByText(/marca al menos un proceso/i)).toBeInTheDocument();
  });

  it('el botón dice cuántos procesos se van a registrar', () => {
    abrir([
      renglon({ areaId: 1, proceso: 'Tecnología' }),
      renglon({ areaId: 2, proceso: 'Legal' }),
    ]);
    fireEvent.click(screen.getByLabelText(/Tecnología/));
    fireEvent.click(screen.getByLabelText(/Legal/));
    expect(screen.getByRole('button', { name: /registrar 2 firmas/i })).toBeInTheDocument();
  });

  it('un proceso con dos candidatos obliga a elegir quién firmó', () => {
    abrir([
      renglon({
        areaId: 1,
        proceso: 'Tecnología',
        candidatos: [
          { id: 100, nombre: 'Ana Ruiz' },
          { id: 101, nombre: 'Luis Paz' },
        ],
      }),
    ]);
    fireEvent.click(screen.getByLabelText(/Tecnología/));
    const select = screen.getByLabelText(/quién firmó por Tecnología/i);
    expect((select as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('option', { name: 'Ana Ruiz' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Luis Paz' })).toBeInTheDocument();
  });

  // Con un solo candidato no hay nada que elegir, y obligar a abrir un desplegable de una
  // opción es una decisión que el sistema le inventa a alguien.
  it('un proceso con un solo candidato lo deja preseleccionado', () => {
    abrir([renglon({ areaId: 1, proceso: 'Tecnología' })]);
    fireEvent.click(screen.getByLabelText(/Tecnología/));
    const select = screen.getByLabelText(/quién firmó por Tecnología/i);
    expect((select as HTMLSelectElement).value).toBe('100');
  });
});
