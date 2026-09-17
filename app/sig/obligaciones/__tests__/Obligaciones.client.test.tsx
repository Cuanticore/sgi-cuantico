// app/sig/obligaciones/__tests__/Obligaciones.client.test.tsx
//
// REQ-SIG-26 · la pantalla de obligaciones reventaba en cuanto existía una obligación sobre
// un CURSO_VIRTUAL. `TipoObligacion` enumeraba cuatro tipos y el mapa `TIPO` tenía cuatro
// entradas, pero `TipoContenido` ya tenía cinco: `TIPO[o.tipo]` daba `undefined` y leerle
// `.fondo` tiraba en el render del servidor. La página entera dejaba de cargar — no una
// fila, no una celda: la página.
//
// El tipo del contenido lo decide la base, no esta pantalla. Por eso el mapa se indexa por
// `string` y hay una entrada de reserva: un tipo nuevo tiene que verse raro, nunca tumbar
// la lista maestra del numeral 8.

import { render, screen, within } from '@testing-library/react';
import ObligacionesClient, { type ObligacionFila } from '../Obligaciones.client';

jest.mock('@/app/sig/acciones/tareas', () => ({
  desactivarObligacion: jest.fn(),
}));

function fila(overrides: Partial<ObligacionFila> = {}): ObligacionFila {
  return {
    id: 1,
    codigo: 'CUR-001',
    titulo: 'Inducción en seguridad de la información',
    procedimientoOrigen: null,
    tipo: 'CURSO_VIRTUAL',
    alcance: 'Todas las personas',
    periodicidad: 'Única',
    plazoDias: 30,
    seguimiento: 'Daniel Medina',
    cumplimiento: null,
    ...overrides,
  };
}

describe('Obligaciones — una obligación sobre un curso virtual no tumba la pantalla', () => {
  // El chip de «Curso Virtual» sale dos veces —el filtro de arriba y la celda de la fila—,
  // así que la aserción se acota a la tabla: lo que se comprueba es que la FILA se dibuja.
  it('dibuja la fila del CURSO_VIRTUAL con su etiqueta', () => {
    render(<ObligacionesClient filas={[fila()]} />);
    const tabla = within(screen.getByRole('table'));

    expect(tabla.getByText('CUR-001')).toBeInTheDocument();
    expect(tabla.getByText('Inducción en seguridad de la información')).toBeInTheDocument();
    expect(tabla.getByText('Curso Virtual')).toBeInTheDocument();
  });

  it('el filtro por tipo ofrece el curso virtual y cuenta las suyas', () => {
    render(
      <ObligacionesClient
        filas={[fila(), fila({ id: 2, codigo: 'LEC-002', tipo: 'LECTURA' })]}
      />,
    );

    const chip = screen.getByRole('button', { name: /Curso Virtual/ });
    expect(within(chip).getByText('1')).toBeInTheDocument();
  });

  it('el curso no se pierde entre los otros tipos', () => {
    render(
      <ObligacionesClient
        filas={[
          fila(),
          fila({ id: 2, codigo: 'LEC-002', titulo: 'Política del SGSI', tipo: 'LECTURA' }),
        ]}
      />,
    );

    expect(screen.getByText('CUR-001')).toBeInTheDocument();
    expect(screen.getByText('LEC-002')).toBeInTheDocument();
  });

  // La defensa de fondo: el tipo viene de la base y esta pantalla no manda sobre él. Si
  // mañana aparece un sexto tipo y nadie se acuerda de este archivo, la fila se dibuja con
  // el tipo crudo a la vista —feo, y por eso se corrige— en vez de dejar sin pantalla a
  // quien administra el numeral 8.
  it('un tipo que esta pantalla no conoce se dibuja, no revienta', () => {
    render(<ObligacionesClient filas={[fila({ tipo: 'SIMULACRO' as never })]} />);
    const tabla = within(screen.getByRole('table'));

    expect(tabla.getByText('CUR-001')).toBeInTheDocument();
    expect(tabla.getByText('SIMULACRO')).toBeInTheDocument();
  });
});
