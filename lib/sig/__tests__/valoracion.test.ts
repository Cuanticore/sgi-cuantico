// lib/sig/__tests__/valoracion.test.ts
//
// El defecto original no era de redacción. `pintarCriticidad` —copiada en dos pantallas—
// aplastaba la escala de seis niveles en cuatro con un `else 'bajo'`, así que un activo
// valorado **0 — Irrelevante** y otro valorado **2 — Bajo** salían idénticos. Quien valoró
// tomó dos decisiones distintas y la pantalla las volvía la misma.
//
// La prueba que importa es la que separa esos tres de abajo. Una que sólo mirara «devuelve
// un texto» habría pasado con el código roto.

import {
  colorDeValor,
  etiquetaDeValor,
  nombreDeNivel,
  pintarValor,
  SIN_VALORAR,
  type NivelEscala,
} from '../valoracion';

/// El catálogo real, tal como está sembrado en `escala_valor`.
const ESCALA: NivelEscala[] = [
  { valor: 5, etiqueta: '5 — Muy Alto' },
  { valor: 4, etiqueta: '4 — Alto' },
  { valor: 3, etiqueta: '3 — Medio' },
  { valor: 2, etiqueta: '2 — Bajo' },
  { valor: 1, etiqueta: '1 — Muy Bajo' },
  { valor: 0, etiqueta: '0 — Irrelevante' },
];

describe('nombreDeNivel', () => {
  it('quita el número y el guion largo', () => {
    expect(nombreDeNivel('5 — Muy Alto')).toBe('Muy Alto');
    expect(nombreDeNivel('0 — Irrelevante')).toBe('Irrelevante');
  });

  it('una etiqueta sin guion se devuelve entera', () => {
    expect(nombreDeNivel('Muy Alto')).toBe('Muy Alto');
  });
});

describe('etiquetaDeValor', () => {
  it.each([
    [5, 'Muy Alto'],
    [4, 'Alto'],
    [3, 'Medio'],
    [2, 'Bajo'],
    [1, 'Muy Bajo'],
    [0, 'Irrelevante'],
  ])('%s se nombra «%s»', (valor, esperado) => {
    expect(etiquetaDeValor(ESCALA, valor)).toBe(esperado);
  });

  // El corazón del defecto: los tres de abajo eran «bajo» los tres.
  it('los tres niveles bajos NO son el mismo', () => {
    const bajos = [2, 1, 0].map((v) => etiquetaDeValor(ESCALA, v));
    expect(new Set(bajos).size).toBe(3);
  });

  // Cero es una valoración hecha; `null` es que nadie valoró. Confundirlos esconde el
  // activo sin valorar entre los que sí se miraron, que es justo lo que hay que encontrar.
  it('cero no es «sin valorar»', () => {
    expect(etiquetaDeValor(ESCALA, 0)).toBe('Irrelevante');
    expect(etiquetaDeValor(ESCALA, null)).toBe(SIN_VALORAR);
    expect(etiquetaDeValor(ESCALA, 0)).not.toBe(etiquetaDeValor(ESCALA, null));
  });

  // Sin aproximar al vecino: decir «muy alto» de un valor que el catálogo no define sería
  // inventar una lectura que nadie estableció.
  it('un valor fuera del catálogo se muestra como número', () => {
    expect(etiquetaDeValor(ESCALA, 7)).toBe('7');
  });

  it('con catálogo vacío tampoco inventa', () => {
    expect(etiquetaDeValor([], 5)).toBe('5');
  });
});

describe('colorDeValor', () => {
  it('sube con el valor y no repite el de arriba', () => {
    const altos = [5, 4, 3].map(colorDeValor);
    expect(new Set(altos).size).toBe(3);
  });

  // Lo irrelevante se apaga en vez de teñirse: darle color sería darle el mismo peso visual
  // que a lo que sí exige atención.
  it('cero y sin valorar se apagan', () => {
    expect(colorDeValor(0)).toBe('var(--hf-text-faint)');
    expect(colorDeValor(null)).toBe('var(--hf-text-faint)');
  });
});

describe('pintarValor', () => {
  it('devuelve el texto y el color juntos', () => {
    expect(pintarValor(ESCALA, 4)).toEqual({ texto: 'Alto', color: '#b8791a' });
  });

  it('sin valorar tiene su propio texto', () => {
    expect(pintarValor(ESCALA, null).texto).toBe(SIN_VALORAR);
  });
});
