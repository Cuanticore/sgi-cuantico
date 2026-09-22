// app/components/sgsi/__tests__/Popup.test.tsx
//
// El tope de alto del cuerpo. La prueba que importa no es la del popup que pide más alto:
// es la del que NO PIDE NADA. `Popup` lo usan ocho pantallas y siete no van a cambiar, así
// que el valor por defecto es una invariante, no una implementación.
//
// Se afirma sobre `style.maxHeight` y no sobre una clase porque el tope es un valor
// calculado, y jsdom conserva `min()` y `calc()` íntegros — se comprobó antes de escribir
// esto.

import { render, screen } from '@testing-library/react';
import Popup from '../Popup';

function montar(props: { alto?: string } = {}) {
  render(
    <Popup titulo="Prueba" ancho={820} onCerrar={() => {}} {...props}>
      <p>contenido</p>
    </Popup>,
  );
}

function cuerpo(): HTMLElement {
  const el = screen.getByRole('dialog').querySelector('[data-popup="cuerpo"]');
  if (el === null) throw new Error('El popup no marca su cuerpo con data-popup="cuerpo".');
  return el as HTMLElement;
}

describe('el tope de alto del cuerpo', () => {
  it('sin `alto`, se topa en 61vh — los siete popups que no piden nada no cambian', () => {
    montar();
    expect(cuerpo().style.maxHeight).toBe('61vh');
  });

  it('con `alto`, lo usa', () => {
    montar({ alto: '80vh' });
    expect(cuerpo().style.maxHeight).toContain('80vh');
  });

  it('con `alto`, la tarjeta no puede desbordar la pantalla', () => {
    // 216px = los 96 del margen del overlay más los ~120 del encabezado y el pie. Sin este
    // tope, pedir 90vh deja el botón de guardar por debajo del borde y sin forma de llegar.
    montar({ alto: '80vh' });
    expect(cuerpo().style.maxHeight).toBe('min(80vh, calc(100vh - 216px))');
  });
});

describe('el margen del overlay', () => {
  it('sin `alto`, conserva los 78px de siempre', () => {
    montar();
    expect(screen.getByRole('dialog').className).toContain('py-[78px]');
  });

  it('con `alto`, cede a 48px', () => {
    // 78 arriba y 78 abajo son 156px que, sumados a un cuerpo de 80vh, no caben en la
    // ventana de una pantalla de 1080.
    montar({ alto: '80vh' });
    const overlay = screen.getByRole('dialog');
    expect(overlay.className).toContain('py-12');
    expect(overlay.className).not.toContain('py-[78px]');
  });
});
