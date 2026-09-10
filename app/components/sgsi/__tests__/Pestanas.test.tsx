// app/components/sgsi/__tests__/Pestanas.test.tsx
//
// La verificación 21 de REQ-SIG-15 §11: «pestañas navegables con flechas, `aria-selected`
// correcto». Eso no es cableado: es la conducta que decide si alguien puede usar el popup
// sin ratón, y se prueba.
//
// Lo que más importa acá y es lo que se olvida: **un solo punto de tabulación**. Sin eso, Tab
// recorre las cuatro pestañas antes de llegar al primer campo del formulario, y con cuatro
// secciones eso son cuatro tabulaciones extra cada vez que alguien entra a una.

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import Pestanas, { type Pestana } from '../Pestanas';

type Clave = 'base' | 'licencias' | 'contactos' | 'grupos';

const PESTANAS: readonly Pestana<Clave>[] = [
  { clave: 'base', etiqueta: 'Datos base' },
  { clave: 'licencias', etiqueta: 'Licencias', cuantos: 2 },
  { clave: 'contactos', etiqueta: 'Contactos', cuantos: 0 },
  { clave: 'grupos', etiqueta: 'Grupos', atencion: true },
];

/// Envoltura con estado, porque el componente es controlado: sin ella las flechas moverían
/// el foco y la selección no cambiaría, y la prueba mediría la mitad.
function Sujeto({ inicial = 'base' as Clave }: { inicial?: Clave }) {
  const [activa, setActiva] = useState<Clave>(inicial);
  return (
    <Pestanas pestanas={PESTANAS} activa={activa} onCambiar={setActiva} nombre="persona">
      <p>panel de {activa}</p>
    </Pestanas>
  );
}

describe('la estructura que un lector de pantalla necesita', () => {
  it('hay un tablist con una pestaña por sección y un solo panel', () => {
    render(<Sujeto />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('sólo la activa dice aria-selected', () => {
    render(<Sujeto />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    for (const t of tabs.slice(1)) expect(t).toHaveAttribute('aria-selected', 'false');
  });

  it('el panel está enlazado con su pestaña en las dos direcciones', () => {
    render(<Sujeto />);
    const tab = screen.getAllByRole('tab')[0];
    const panel = screen.getByRole('tabpanel');
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
  });

  // Dos grupos en la misma página no pueden compartir ids: el `aria-controls` del segundo
  // apuntaría al panel del primero y un lector de pantalla leería el contenido equivocado.
  it('dos grupos en la misma página no chocan de ids', () => {
    render(
      <>
        <Sujeto />
        <Sujeto />
      </>,
    );
    const ids = screen.getAllByRole('tab').map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('un solo punto de tabulación', () => {
  // Es lo que hace que Tab entre al grupo y salga de él, en vez de recorrer las cuatro.
  it('la activa es tabulable y las demás no', () => {
    render(<Sujeto />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    for (const t of tabs.slice(1)) expect(t).toHaveAttribute('tabindex', '-1');
  });

  it('y el punto se mueve con la selección', () => {
    render(<Sujeto />);
    fireEvent.click(screen.getByRole('tab', { name: /Contactos/ }));
    const tabs = screen.getAllByRole('tab');
    expect(tabs[2]).toHaveAttribute('tabindex', '0');
    expect(tabs[0]).toHaveAttribute('tabindex', '-1');
  });
});

describe('las flechas mueven y activan', () => {
  it('derecha avanza', () => {
    render(<Sujeto />);
    fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Licencias/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('izquierda retrocede', () => {
    render(<Sujeto inicial="contactos" />);
    fireEvent.keyDown(screen.getAllByRole('tab')[2], { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: /Licencias/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  // Circular: es lo que espera quien mantiene la flecha apretada.
  it('de la última a la primera y al revés', () => {
    render(<Sujeto inicial="grupos" />);
    fireEvent.keyDown(screen.getAllByRole('tab')[3], { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Datos base/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: /Grupos/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('Home y End van a los extremos', () => {
    render(<Sujeto inicial="licencias" />);
    fireEvent.keyDown(screen.getAllByRole('tab')[1], { key: 'End' });
    expect(screen.getByRole('tab', { name: /Grupos/ })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(screen.getAllByRole('tab')[3], { key: 'Home' });
    expect(screen.getByRole('tab', { name: /Datos base/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  // Arriba y abajo también, porque un tablist vertical se navega así y el componente no
  // sabe cómo lo van a dibujar.
  it('arriba y abajo funcionan igual', () => {
    render(<Sujeto />);
    fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'ArrowDown' });
    expect(screen.getByRole('tab', { name: /Licencias/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  // Escape lo maneja el popup que envuelve a esto. Si el tablist lo consumiera, el popup no
  // se cerraría desde una pestaña — y un modal del que sólo se sale con el ratón es una
  // trampa, que es justo lo que `Popup.tsx` existe para evitar.
  it('Escape no se consume acá', () => {
    render(<Sujeto />);
    const evento = fireEvent.keyDown(screen.getAllByRole('tab')[0], { key: 'Escape' });
    // `fireEvent` devuelve false cuando algo llamó a `preventDefault`.
    expect(evento).toBe(true);
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
  });
});

describe('lo que la pestaña muestra al lado de la etiqueta', () => {
  it('el conteo se dibuja cuando lo hay, incluido el cero', () => {
    render(<Sujeto />);
    expect(screen.getByRole('tab', { name: /Licencias 2/ })).toBeInTheDocument();
    // Cero contactos es un dato —«no tiene ninguno»— y no lo mismo que no contarlos.
    expect(screen.getByRole('tab', { name: /Contactos 0/ })).toBeInTheDocument();
  });

  it('y no se dibuja donde no aporta', () => {
    render(<Sujeto />);
    expect(screen.getByRole('tab', { name: 'Datos base' })).toBeInTheDocument();
  });

  // El punto de atención no entra al nombre accesible: repetirlo haría que el lector lea
  // «atención» al recorrer el grupo, y el motivo vive dentro del panel.
  it('la marca de atención no ensucia el nombre accesible', () => {
    render(<Sujeto />);
    expect(screen.getByRole('tab', { name: 'Grupos' })).toBeInTheDocument();
  });
});

describe('el panel muestra sólo la sección activa', () => {
  it('cambia con la pestaña', () => {
    render(<Sujeto />);
    expect(screen.getByText('panel de base')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Grupos/ }));
    expect(screen.getByText('panel de grupos')).toBeInTheDocument();
    expect(screen.queryByText('panel de base')).not.toBeInTheDocument();
  });
});
