// app/lib/__tests__/useBloqueoDeSalida.test.tsx
//
// Recargar en medio de una importación no cancela el trabajo del servidor: lo deja
// corriendo sin nadie que lea el resultado. La persona se queda sin saber si los activos
// entraron, y la salida obvia —volver a importar el mismo archivo— crea un segundo juego
// de activos con códigos nuevos.

import { renderHook } from '@testing-library/react';
import { useBloqueoDeSalida } from '../useBloqueoDeSalida';

/// Dispara un `beforeunload` real y responde si el navegador mostraría el aviso.
///
/// Se mira `defaultPrevented` y no el texto: desde 2017 ningún navegador muestra un mensaje
/// propio, y afirmar sobre el string sería fijar algo que el navegador ignora.
function intentarSalir(): boolean {
  const evento = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(evento);
  return evento.defaultPrevented;
}

describe('useBloqueoDeSalida', () => {
  it('no estorba cuando no hay nada corriendo', () => {
    renderHook(() => useBloqueoDeSalida(false));

    expect(intentarSalir()).toBe(false);
  });

  it('bloquea la salida mientras hay un proceso en curso', () => {
    renderHook(() => useBloqueoDeSalida(true));

    expect(intentarSalir()).toBe(true);
  });

  it('suelta la salida en cuanto el proceso termina', () => {
    const { rerender } = renderHook(({ activo }) => useBloqueoDeSalida(activo), {
      initialProps: { activo: true },
    });
    expect(intentarSalir()).toBe(true);

    rerender({ activo: false });

    expect(intentarSalir()).toBe(false);
  });

  it('desmontar deja de bloquear: un popup cerrado no puede retener la pestaña', () => {
    const { unmount } = renderHook(() => useBloqueoDeSalida(true));
    expect(intentarSalir()).toBe(true);

    unmount();

    expect(intentarSalir()).toBe(false);
  });
});
