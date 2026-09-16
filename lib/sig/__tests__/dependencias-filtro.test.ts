// lib/sig/__tests__/dependencias-filtro.test.ts
//
// D2 · **filtrar define quién es el SUJETO; lo que lo sostiene se dibuja como frontera.**
//
// MINTRACE no se sostiene solo: su infraestructura vive en `EMPRESA` y sus externos —Apollo,
// RNEC, ANI, RUES— no cuelgan de ningún producto. Un filtro que los esconda dibuja un
// MINTRACE apoyado en nada, que es lo contrario de lo que el grafo promete responder.
//
// La frontera es de UN salto, y las aristas entre dos nodos de frontera no se dibujan: dos
// saltos es el grafo entero disfrazado.

import { subgrafoDeRama, type Arista } from '../dependencias';

const a = (activoId: number, dependeDeId: number, tipo: Arista['tipo'] = 'USA'): Arista => ({
  activoId,
  dependeDeId,
  tipo,
});

describe('subgrafoDeRama — el sujeto es la rama, la frontera es lo que la sostiene', () => {
  it('una arista de un sujeto hacia afuera trae al de afuera como frontera', () => {
    const r = subgrafoDeRama(new Set([1]), [a(1, 50)]);
    expect([...r.sujeto]).toEqual([1]);
    expect([...r.frontera]).toEqual([50]);
    expect(r.aristas).toEqual([a(1, 50)]);
  });

  it('una arista de afuera hacia un sujeto también trae al de afuera', () => {
    // La dirección no decide quién es contexto: «qué depende de MINTRACE» es tan parte de la
    // pregunta como «de qué depende MINTRACE».
    const r = subgrafoDeRama(new Set([1]), [a(50, 1)]);
    expect([...r.frontera]).toEqual([50]);
    expect(r.aristas).toEqual([a(50, 1)]);
  });

  it('una arista entre dos nodos de afuera se descarta entera', () => {
    const r = subgrafoDeRama(new Set([1]), [a(50, 51)]);
    expect(r.frontera.size).toBe(0);
    expect(r.aristas).toEqual([]);
  });

  it('una arista entre dos nodos de frontera NO se dibuja', () => {
    // Los dos están en el lienzo —cada uno por su propia arista con un sujeto— y aun así la
    // arista que los une no es la pregunta. Dibujarla traería el grafo completo por la puerta
    // de atrás.
    const r = subgrafoDeRama(new Set([1, 2]), [a(1, 50), a(2, 51), a(50, 51)]);
    expect([...r.frontera].sort()).toEqual([50, 51]);
    expect(r.aristas).toEqual([a(1, 50), a(2, 51)]);
  });

  it('el vecino del vecino no entra: la frontera es de un salto', () => {
    const r = subgrafoDeRama(new Set([1]), [a(1, 50), a(50, 60)]);
    expect([...r.frontera]).toEqual([50]);
    expect(r.aristas).toEqual([a(1, 50)]);
  });

  it('una arista entre dos sujetos se dibuja y no genera frontera', () => {
    const r = subgrafoDeRama(new Set([1, 2]), [a(1, 2)]);
    expect(r.frontera.size).toBe(0);
    expect(r.aristas).toEqual([a(1, 2)]);
  });

  it('un sujeto aislado sigue en el subgrafo aunque no tenga ninguna arista', () => {
    // D11 · con filtro puesto, «qué activos de la rama nadie conectó con nada» es el hallazgo,
    // no un efecto secundario.
    const r = subgrafoDeRama(new Set([1, 2]), [a(1, 50)]);
    expect([...r.sujeto].sort()).toEqual([1, 2]);
    expect(r.aristas).toEqual([a(1, 50)]);
  });

  it('un nodo nunca es sujeto y frontera a la vez', () => {
    const r = subgrafoDeRama(new Set([1, 2]), [a(1, 2), a(1, 50)]);
    expect(r.frontera.has(1)).toBe(false);
    expect(r.frontera.has(2)).toBe(false);
  });

  it('un mismo nodo de frontera alcanzado por dos aristas aparece una sola vez', () => {
    const r = subgrafoDeRama(new Set([1, 2]), [a(1, 50), a(2, 50)]);
    expect([...r.frontera]).toEqual([50]);
  });

  it('conserva el tipo de cada arista', () => {
    // Sin el tipo, el panel no puede decir «vía Coolify, se aloja en» y la cadena deja de
    // poder auditarse.
    const r = subgrafoDeRama(new Set([1]), [a(1, 50, 'SE_ALOJA_EN')]);
    expect(r.aristas[0].tipo).toBe('SE_ALOJA_EN');
  });

  it('sin sujetos no hay nada que dibujar', () => {
    const r = subgrafoDeRama(new Set<number>(), [a(1, 2)]);
    expect(r.sujeto.size).toBe(0);
    expect(r.frontera.size).toBe(0);
    expect(r.aristas).toEqual([]);
  });
});
