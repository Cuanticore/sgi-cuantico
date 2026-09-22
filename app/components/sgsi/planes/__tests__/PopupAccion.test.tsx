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

function montar(extra: Partial<AccionVista> = {}) {
  render(
    <PopupAccion
      accion={{ ...ACCION, ...extra }}
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

  it('Observaciones va después de Recursos', () => {
    montar();
    const observaciones = screen.getByLabelText('Observaciones');
    const recursos = screen.getByLabelText('Recursos o presupuesto');
    const posicion = recursos.compareDocumentPosition(observaciones);
    expect(posicion & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Observaciones sigue siendo el último campo cuando el tipo abre los campos condicionales', () => {
    // Con MITIGAR los bloques de Transferir y Aceptar no se renderizan, así que compararla
    // sólo contra Recursos no dice nada sobre ellos: la prueba pasaría igual si alguien los
    // moviera detrás de Observaciones. Con ACEPTAR sí salen.
    montar({ tipo: 'ACEPTAR' });
    const observaciones = screen.getByLabelText('Observaciones');
    const fechaRevision = screen.getByLabelText(/^Fecha de revisión/);
    const posicion = fechaRevision.compareDocumentPosition(observaciones);
    expect(posicion & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('el tamaño que hace que el formulario quepa', () => {
  // Esto no es decoración: 1040 px es lo que permite el renglón de cinco campos, y 80vh
  // es lo que hace que los trece entren sin desplazamiento. Sin estas tres aserciones,
  // revertir cualquiera de los tres valores deja la suite entera en verde y el defecto
  // sólo se ve abriendo la pantalla.
  //
  // El alto contra el que se mide: el contenido del formulario suma ~589 px y el tope en
  // una ventana de 940 px —lo que deja una pantalla de 1080— es min(752, 724) = 724 px.

  function tarjeta(): HTMLElement {
    const cuerpo = screen.getByRole('dialog').querySelector('[data-popup="cuerpo"]');
    if (cuerpo === null) throw new Error('El popup no marca su cuerpo con data-popup="cuerpo".');
    return cuerpo.parentElement as HTMLElement;
  }

  it('la tarjeta mide 1040 px', () => {
    montar();
    expect(tarjeta().style.maxWidth).toBe('1040px');
  });

  it('el cuerpo pide 80vh, topado para que la tarjeta no desborde', () => {
    montar();
    const cuerpo = screen.getByRole('dialog').querySelector('[data-popup="cuerpo"]') as HTMLElement;
    expect(cuerpo.style.maxHeight).toBe('min(80vh, calc(100vh - 216px))');
  });

  it('los cinco campos cortos pasan a un renglón cuando la tarjeta deja de crecer', () => {
    // 1080 px y no `xl`: ahí es donde la tarjeta llega a su ancho máximo. Ver el comentario
    // del bloque en PopupAccion.tsx.
    montar();
    const renglon = screen.getByLabelText('Fecha objetivo').closest('div.grid');
    expect(renglon?.className).toContain('min-[1080px]:grid-cols-5');
  });
});
