// lib/sgsi/__tests__/criticidad-coherencia.test.ts
//
// REQ-SIG-20 §11.3 (P9) · las dos comprobaciones que habilita la columna de criticidad.
// Criticidad y valoración D son primas, no gemelas: cuando se contradicen, una de las dos
// está mal. «Avisa, no bloquea» (D17): esta función solo dice si hay que avisar.

import { esCriticidadSospechosa } from '../criticidad-coherencia';

describe('§11.3 · C1/C2 con D ≤ 3 es sospechoso', () => {
  it('C1 con D = 3 avisa: quien no tolera diez minutos difícilmente valga "Medio" en D', () => {
    expect(esCriticidadSospechosa('C1', 3)).toBe(true);
  });

  it('C2 con D = 2 también avisa', () => {
    expect(esCriticidadSospechosa('C2', 2)).toBe(true);
  });

  it('C1 con D = 1, el caso más extremo, sigue siendo sospechoso', () => {
    expect(esCriticidadSospechosa('C1', 1)).toBe(true);
  });
});

describe('§11.3 · D = 5 con C4/C5 es coherente y queda en silencio', () => {
  it('D = 5 con C4 no avisa: catastrófico y recuperable en tres días son cosas distintas', () => {
    expect(esCriticidadSospechosa('C4', 5)).toBe(false);
  });

  it('D = 5 con C5 tampoco avisa', () => {
    expect(esCriticidadSospechosa('C5', 5)).toBe(false);
  });
});

describe('el resto de las combinaciones queda en silencio', () => {
  it('C1 con D = 4 no cruza el umbral D ≤ 3, no avisa', () => {
    expect(esCriticidadSospechosa('C1', 4)).toBe(false);
  });

  it('C3 con D = 1 no es C1 ni C2, no avisa', () => {
    expect(esCriticidadSospechosa('C3', 1)).toBe(false);
  });

  it('sin criticidad declarada no hay nada que contradecir, no avisa', () => {
    expect(esCriticidadSospechosa(null, 1)).toBe(false);
  });
});
