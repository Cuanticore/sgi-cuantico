// lib/sig/__tests__/scorm-token.test.ts
//
// P4 · cada ejecución lleva un token firmado. Sin esto, cambiar un número en la URL
// alcanzaría para escribir en el intento de otra persona.

import { firmarIntento, verificarIntento } from '../scorm-token';

const SECRETO = 'secreto-de-prueba';

describe('token de intento', () => {
  it('ida y vuelta devuelve el intento', () => {
    const token = firmarIntento(42, SECRETO, 900);
    expect(verificarIntento(token, SECRETO)).toEqual(expect.objectContaining({ intentoId: 42 }));
  });

  it('un token manipulado no vale', () => {
    const token = firmarIntento(42, SECRETO, 900);
    const otro = token.slice(0, -3) + 'aaa';
    expect(verificarIntento(otro, SECRETO)).toBeNull();
  });

  it('un token firmado con otro secreto no vale', () => {
    expect(verificarIntento(firmarIntento(42, 'otro', 900), SECRETO)).toBeNull();
  });

  it('un token vencido no vale', () => {
    expect(verificarIntento(firmarIntento(42, SECRETO, -1), SECRETO)).toBeNull();
  });

  it('basura no revienta', () => {
    expect(verificarIntento('', SECRETO)).toBeNull();
    expect(verificarIntento('a.b.c', SECRETO)).toBeNull();
  });
});
