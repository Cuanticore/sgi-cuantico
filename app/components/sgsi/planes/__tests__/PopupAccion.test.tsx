// app/components/sgsi/planes/__tests__/PopupAccion.test.tsx
//
// Observaciones era un `<input>` de una línea. El defecto no es el tamaño: es que un
// `<input>` DESCARTA LOS SALTOS DE LÍNEA, así que el seguimiento de tres reuniones se
// guardaba como un párrafo corrido y nadie se enteraba hasta releerlo.
//
// Por eso hay dos pruebas y no una. La del elemento sola pasaría con un `textarea` de una
// fila que sirviera de poco; la del viaje del dato es la que falla si el texto no sobrevive.
//
// El popup importa acciones de servidor, que arrastran `next/cache` —que en jsdom no
// arranca—. Se simulan, igual que hace `PopupPlanCritico.test.tsx`.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PopupAccion from '../PopupAccion';
import { guardarAccion } from '@/app/sgsi/acciones/plan';
import type { AccionVista } from '../PlanesTratamiento';

jest.mock('@/app/sgsi/acciones/plan', () => ({
  guardarAccion: jest.fn(),
  darDeBajaAccion: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

const mockGuardar = guardarAccion as jest.Mock;

const ACCION: AccionVista = {
  codigo: 'PT-013',
  accion: 'Activar elevación temporal de privilegios con aprobación',
  tipo: 'MITIGAR',
  origen: 'Las cuentas privilegiadas tienen MFA pero no elevación temporal.',
  responsable: 'Gestión Tecnológica',
  aprueba: 'Líder del SIG',
  fechaObjetivo: '2026-12-18',
  fechaAprobacion: null,
  fechaCierre: null,
  estado: 'NO_INICIADA',
  avance: 0,
  verificacion: 'PENDIENTE',
  observacion: null,
  recursos: null,
  madurezAlcanzada: null,
  justificacionAceptacion: null,
  control: {
    codigo: 'A.8.2',
    nombre: 'Derechos de acceso privilegiado',
    capacidad: 'Gestión de identidad',
    lineaBase: 50,
    actual: 50,
    objetivo: 90,
  },
  alcance: null,
  controlId: 7,
  responsableId: 3,
  apruebaId: 5,
  madurezAlcanzadaId: null,
  instrumento: null,
  riesgoRemanente: null,
  fechaRevisionAceptacion: null,
};

const CONTROLES = [{ id: 7, codigo: 'A.8.2', nombre: 'Derechos de acceso privilegiado' }];
const CARGOS = [
  { id: 3, nombre: 'Gestión Tecnológica' },
  { id: 5, nombre: 'Líder del SIG' },
];
const MADUREZ = [{ id: 30, nivel: 90, nombre: 'Definido' }];

function montar() {
  render(
    <PopupAccion
      accion={ACCION}
      controles={CONTROLES}
      cargos={CARGOS}
      madurez={MADUREZ}
      onCerrar={() => {}}
    />,
  );
}

beforeEach(() => {
  mockGuardar.mockReset();
  mockGuardar.mockResolvedValue({ ok: true, mensaje: 'Guardada.' });
});

describe('Observaciones', () => {
  it('es un campo de varias líneas', () => {
    montar();
    expect(screen.getByLabelText('Observaciones').tagName).toBe('TEXTAREA');
  });

  it('los saltos de línea llegan al guardado', async () => {
    montar();
    fireEvent.change(screen.getByLabelText('Observaciones'), {
      target: { value: 'Comité 12/01\nComité 09/02\nPendiente la cotización' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la acción' }));

    await waitFor(() => expect(mockGuardar).toHaveBeenCalled());
    expect(mockGuardar).toHaveBeenCalledWith(
      'PT-013',
      expect.objectContaining({
        observacion: 'Comité 12/01\nComité 09/02\nPendiente la cotización',
      }),
    );
  });
});

describe('el orden de los campos', () => {
  // «Estado» y «Avance» son lo que más se toca al administrar un plan, y Estado estaba en el
  // quinto renglón: había que bajar para la operación más frecuente. Se afirma el orden del
  // documento y no una posición en píxeles, que jsdom no mide.
  //
  // `Campo` renderiza el `pie` DENTRO del `<label>`, así que el nombre accesible de un campo
  // con pie lleva el texto de ayuda pegado: «Origen y justificaciónPor qué existe esta
  // acción…». Por eso la expresión regular anclada y no la cadena exacta.
  it('Estado va antes que Origen y justificación', () => {
    montar();
    const estado = screen.getByLabelText('Estado');
    const origen = screen.getByLabelText(/^Origen y justificación/);
    const posicion = estado.compareDocumentPosition(origen);
    expect(posicion & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Observaciones es el último campo del formulario', () => {
    montar();
    const observaciones = screen.getByLabelText('Observaciones');
    const recursos = screen.getByLabelText('Recursos o presupuesto');
    const posicion = recursos.compareDocumentPosition(observaciones);
    expect(posicion & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
