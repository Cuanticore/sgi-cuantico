// app/components/sgsi/riesgo-residual/__tests__/PantallaRiesgoResidual.test.tsx
//
// Lo que esta pantalla no puede hacer, y por eso está probado:
//   · esconder los activos con residual sin calcular, que quedaron fuera del acta;
//   · decir «no ha firmado» de un proceso que no tiene a quién pedirle la firma;
//   · dejar recoger firmas sobre un acta cuyas cifras ya cambiaron;
//   · ofrecer acciones de escritura a quien sólo puede ver.

import { fireEvent, render, screen } from '@testing-library/react';
import PantallaRiesgoResidual from '../PantallaRiesgoResidual';
import type { ActaVista, VistaRiesgoResidual } from '@/app/sgsi/riesgo-residual/acta.query';
import type { FilaAlcance, FirmanteProceso } from '@/lib/sgsi/alcance-residual';

// Las acciones arrastran Prisma, `next/cache` y el navegador del generador de PDF, que en
// jsdom no existen. Es la misma sustitución que hacen `PopupPlanCritico.test.tsx` y
// `OverlayActivo.test.tsx`.
jest.mock('@/app/sgsi/acciones/acta-residual', () => ({
  emitirActaResidual: jest.fn(),
  cargarSoporteActaResidual: jest.fn(),
  anularActaResidual: jest.fn(),
}));

const TECNOLOGIA: FirmanteProceso = {
  areaId: 1,
  proceso: 'Tecnología',
  cargoId: 10,
  cargoNombre: 'Líder de Tecnología',
  candidatos: [{ id: 100, nombre: 'Ana Ruiz' }],
  resoluble: true,
  activos: 3,
};

const LEGAL: FirmanteProceso = {
  areaId: 2,
  proceso: 'Legal',
  cargoId: null,
  cargoNombre: null,
  candidatos: [],
  resoluble: false,
  activos: 1,
};

const ACTIVO: FilaAlcance = {
  activoId: 1,
  codigo: 'TEC-SRV-0001',
  nombre: 'Servidor de aplicaciones',
  areaId: 1,
  proceso: 'Tecnología',
  banda: 'Alto',
  cifra: '4.5',
};

function acta(p: Partial<ActaVista> = {}): ActaVista {
  return {
    id: 1,
    codigo: 'ARR-2026-001',
    estado: 'EMITIDA',
    generadaEn: '2026-09-16',
    generadaPor: 'Daniel Medina',
    sinCalcular: 0,
    renglones: [
      {
        areaId: 1,
        proceso: 'Tecnología',
        cargoNombre: 'Líder de Tecnología',
        resoluble: true,
        activos: 3,
        aprobo: false,
        firmante: null,
        fechaFirma: null,
        soporteId: null,
        registradoPor: null,
        candidatos: [{ id: 100, nombre: 'Ana Ruiz' }],
      },
    ],
    soportes: [],
    ...p,
  };
}

function vista(p: Partial<VistaRiesgoResidual> = {}): VistaRiesgoResidual {
  return {
    periodo: '2026',
    filas: [ACTIVO],
    firmantes: [TECNOLOGIA],
    sinCalcular: 0,
    fueraDeBanda: 0,
    huellaActual: 'a'.repeat(64),
    acta: null,
    ...p,
  };
}

describe('PantallaRiesgoResidual', () => {
  // La tarjeta que impide que el tablero se vea completo cuando no lo está.
  it('cuenta los activos sin calcular en su propia tarjeta', () => {
    render(<PantallaRiesgoResidual datos={vista({ sinCalcular: 12 })} puedeEscribir />);
    expect(screen.getByText(/sin calcular/i)).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  // «Pendiente de firma» sólo tiene sentido con una hoja de firmas delante: antes de emitir el
  // acta no hay a quién se le esté esperando nada. Lo que sí se ve desde el principio es la
  // deuda del catálogo, en su tarjeta.
  it('cuenta los procesos sin firmante resoluble antes de emitir el acta', () => {
    render(
      <PantallaRiesgoResidual datos={vista({ firmantes: [TECNOLOGIA, LEGAL] })} puedeEscribir />,
    );
    expect(screen.getByText(/sin firmante resoluble/i)).toBeInTheDocument();
    expect(screen.queryByText(/pendiente de firma/i)).not.toBeInTheDocument();
  });

  it('en la hoja de firmas distingue «sin firmante resoluble» de «pendiente de firma»', () => {
    const conLegal = acta({
      renglones: [
        ...acta().renglones,
        {
          areaId: 2,
          proceso: 'Legal',
          cargoNombre: null,
          resoluble: false,
          activos: 1,
          aprobo: false,
          firmante: null,
          fechaFirma: null,
          soporteId: null,
          registradoPor: null,
          candidatos: [],
        },
      ],
    });
    render(
      <PantallaRiesgoResidual
        datos={vista({ firmantes: [TECNOLOGIA, LEGAL], acta: conLegal })}
        puedeEscribir
      />,
    );
    // El de la tabla, además del de la tarjeta: son dos lugares y dicen lo mismo.
    expect(screen.getAllByText(/sin firmante resoluble/i).length).toBeGreaterThan(1);
    expect(screen.getByText(/pendiente de firma/i)).toBeInTheDocument();
  });

  it('sin acta emitida ofrece emitirla', () => {
    render(<PantallaRiesgoResidual datos={vista()} puedeEscribir />);
    expect(screen.getByRole('button', { name: /emitir/i })).toBeInTheDocument();
  });

  it('con el acta desactualizada lo dice y no deja registrar firmas', () => {
    render(
      <PantallaRiesgoResidual
        datos={vista({ acta: acta({ estado: 'DESACTUALIZADA' }) })}
        puedeEscribir
      />,
    );
    expect(screen.getByText(/desactualizada/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /registrar firma/i })).not.toBeInTheDocument();
  });

  it('con el acta emitida y vigente sí deja registrar firmas', () => {
    render(<PantallaRiesgoResidual datos={vista({ acta: acta() })} puedeEscribir />);
    expect(screen.getAllByRole('button', { name: /registrar firma/i }).length).toBeGreaterThan(0);
  });

  // Un botón que existe y no hace nada pasa cualquier prueba que sólo compruebe que existe.
  it('«Registrar firma» abre el popup', () => {
    render(<PantallaRiesgoResidual datos={vista({ acta: acta() })} puedeEscribir />);
    expect(screen.queryByText(/registrar las firmas del acta/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /registrar firma/i })[0]);
    expect(screen.getByText(/registrar las firmas del acta/i)).toBeInTheDocument();
  });

  it('sin permiso de escritura no ofrece ninguna acción que escriba', () => {
    render(<PantallaRiesgoResidual datos={vista({ acta: acta() })} puedeEscribir={false} />);
    expect(screen.queryByRole('button', { name: /emitir/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /registrar firma/i })).not.toBeInTheDocument();
  });

  it('sin activos en alcance no ofrece emitir un acta vacía', () => {
    render(<PantallaRiesgoResidual datos={vista({ filas: [], firmantes: [] })} puedeEscribir />);
    expect(screen.queryByRole('button', { name: /emitir/i })).not.toBeInTheDocument();
  });
});
