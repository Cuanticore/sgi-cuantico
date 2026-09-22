// app/components/sgsi/planes/__tests__/PopupAccionNueva.test.tsx
//
// El popup de «Acción nueva». Comparte los campos con la edición —viven en
// `CamposAccion.tsx`— y lo que esta prueba vigila es JUSTAMENTE LA DIFERENCIA entre los dos.
//
// Estado, Avance, Verificación de eficacia y Madurez alcanzada son el seguimiento de una
// acción. Ofrecerlos al crear seria ofrecer cuatro campos cuya única respuesta honesta ya
// está fijada por el servidor: `crearAccionLibre` los escribe NO_INICIADA / 0 / PENDIENTE
// pase lo que pase. Un campo que no se respeta es peor que un campo ausente — el que lo
// llenó cree que eligió algo.
//
// Como los cuatro se esconden con una bandera y no borrándolos, la prueba que dice que no
// están tiene que venir acompañada de la que dice que en la edición SÍ: una bandera invertida
// dejaría a las dos pantallas iguales y a media suite en verde.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PopupAccionNueva from '../PopupAccionNueva';
import { crearAccionLibre } from '@/app/sgsi/acciones/plan';

jest.mock('@/app/sgsi/acciones/plan', () => ({
  crearAccionLibre: jest.fn(),
  guardarAccion: jest.fn(),
  darDeBajaAccion: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

const mockCrear = crearAccionLibre as jest.Mock;

const CONTROLES = [{ id: 7, codigo: 'A.8.2', nombre: 'Derechos de acceso privilegiado' }];
const CARGOS = [
  { id: 3, nombre: 'Gestión Tecnológica' },
  { id: 5, nombre: 'Líder del SIG' },
];
const MADUREZ = [{ id: 30, nivel: 90, nombre: 'Definido' }];

const SEGUIMIENTO = ['Estado', 'Avance', 'Verificación de eficacia', 'Madurez alcanzada'];

function montar() {
  render(
    <PopupAccionNueva
      controles={CONTROLES}
      cargos={CARGOS}
      madurez={MADUREZ}
      onCerrar={() => {}}
    />,
  );
}

beforeEach(() => {
  mockCrear.mockReset();
  mockCrear.mockResolvedValue({ ok: true, mensaje: 'Se creó PT-021.', codigo: 'PT-021' });
});

describe('los campos de seguimiento no se ofrecen al crear', () => {
  it.each(SEGUIMIENTO)('no renderiza %s', (etiqueta) => {
    montar();
    expect(screen.queryByLabelText(etiqueta)).toBeNull();
  });

  it('los campos que sí definen la acción están todos', () => {
    montar();
    for (const etiqueta of [
      'Acción',
      'Tipo de tratamiento',
      /^Control asociado/,
      /^Origen y justificación/,
      'Responsable de la ejecución',
      /^Propietario del riesgo que aprueba/,
      'Fecha objetivo',
      'Recursos o presupuesto',
      'Observaciones',
    ]) {
      expect(screen.getByLabelText(etiqueta)).toBeInTheDocument();
    }
  });
});

describe('la puerta de 6.1.3, la misma que la edición', () => {
  it('con MITIGAR y sin control el botón está apagado y dice qué falta', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Acción'), { target: { value: 'Algo que mitigar' } });
    fireEvent.change(screen.getByLabelText(/^Origen y justificación/), {
      target: { value: 'Hallazgo de auditoría' },
    });

    const boton = screen.getByRole('button', { name: 'Crear la acción' });
    expect(boton).toBeDisabled();
    expect(
      screen.getByText('· Una acción de mitigación necesita un control asociado.'),
    ).toBeInTheDocument();
  });

  it('la póliza cyber: TRANSFERIR sin control, con instrumento y remanente, sí se crea', async () => {
    montar();
    fireEvent.change(screen.getByLabelText('Acción'), {
      target: { value: 'Adquirir póliza de ciberriesgo' },
    });
    fireEvent.change(screen.getByLabelText(/^Origen y justificación/), {
      target: { value: 'Decisión del Comité del SIG del 12/03.' },
    });
    fireEvent.change(screen.getByLabelText('Tipo de tratamiento'), {
      target: { value: 'TRANSFERIR' },
    });
    fireEvent.change(screen.getByLabelText('Instrumento de transferencia'), {
      target: { value: 'Póliza de ciberriesgo 2027' },
    });
    fireEvent.change(screen.getByLabelText('Riesgo remanente'), {
      target: { value: 'El deducible' },
    });

    const boton = screen.getByRole('button', { name: 'Crear la acción' });
    expect(boton).toBeEnabled();
    fireEvent.click(boton);

    await waitFor(() => expect(mockCrear).toHaveBeenCalled());
    expect(mockCrear).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'Adquirir póliza de ciberriesgo',
        tipo: 'TRANSFERIR',
        controlId: null,
        origen: 'Decisión del Comité del SIG del 12/03.',
        instrumento: 'Póliza de ciberriesgo 2027',
        riesgoRemanente: 'El deducible',
      }),
    );
  });

  it('sin origen no se puede crear: es la justificación que pide 6.1.3', () => {
    montar();
    fireEvent.change(screen.getByLabelText('Acción'), { target: { value: 'Algo' } });
    fireEvent.change(screen.getByLabelText(/^Control asociado/), { target: { value: '7' } });

    expect(screen.getByRole('button', { name: 'Crear la acción' })).toBeDisabled();
    expect(
      screen.getByText('· El origen y la justificación son obligatorios.'),
    ).toBeInTheDocument();
  });
});

describe('el tamaño, el mismo que la edición', () => {
  it('la tarjeta mide 1040 px y el cuerpo pide 80vh', () => {
    montar();
    const cuerpo = screen.getByRole('dialog').querySelector('[data-popup="cuerpo"]') as HTMLElement;
    expect((cuerpo.parentElement as HTMLElement).style.maxWidth).toBe('1040px');
    expect(cuerpo.style.maxHeight).toBe('min(80vh, calc(100vh - 216px))');
  });
});
