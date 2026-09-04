// lib/sig/__tests__/dependencias.test.ts
//
// E3 · no se admiten ciclos DE NINGUNA LONGITUD. Es la regla que el Excel no puede tener y
// la que hace que el drill-down del mapa termine.

import {
  aguasAbajo,
  aguasArriba,
  asimetrias,
  caminoDelCiclo,
  cerrariaCiclo,
  type Arista,
} from '../dependencias';

const usa = (activoId: number, dependeDeId: number): Arista => ({
  activoId,
  dependeDeId,
  tipo: 'USA',
});

// CRM(1) → postgres(2) → servidor(3) → nube(4). La cadena del ejemplo de la spec.
const CADENA: Arista[] = [usa(1, 2), usa(2, 3), usa(3, 4)];

describe('cerrariaCiclo — la reciprocidad directa no alcanza', () => {
  it('rechaza el ciclo de longitud 1: un activo dependiendo de sí mismo', () => {
    expect(cerrariaCiclo(1, 1, [])).toBe(true);
  });

  it('rechaza el ciclo directo A→B→A', () => {
    expect(cerrariaCiclo(2, 1, [usa(1, 2)])).toBe(true);
  });

  it('rechaza el ciclo LARGO A→B→C→A, que es el que se cuela', () => {
    // Comprobar sólo si ya existe la arista inversa dejaría pasar éste, y es justo el que
    // hace que el recorrido del mapa no termine.
    expect(cerrariaCiclo(4, 1, CADENA)).toBe(true);
  });

  it('acepta una arista que no cierra nada', () => {
    expect(cerrariaCiclo(1, 5, CADENA)).toBe(false);
    expect(cerrariaCiclo(5, 1, CADENA)).toBe(false);
  });

  it('un rombo no es un ciclo: dos caminos hacia el mismo destino son legítimos', () => {
    // A→B, A→C, B→D, C→D. Nada vuelve sobre sus pasos.
    const rombo = [usa(1, 2), usa(1, 3), usa(2, 4), usa(3, 4)];
    expect(cerrariaCiclo(1, 4, rombo)).toBe(false);
  });

  it('no se cuelga con un ciclo ya presente en los datos', () => {
    // Si un ciclo se coló por otra vía, la función tiene que responder, no girar.
    const conCiclo = [usa(1, 2), usa(2, 1)];
    expect(cerrariaCiclo(3, 1, conCiclo)).toBe(false);
  });
});

describe('caminoDelCiclo — decir POR DÓNDE, no sólo que lo hay', () => {
  it('devuelve la cadena completa del ciclo largo', () => {
    // «Cerraría un ciclo» sin mostrar el camino manda a alguien a reconstruirlo a mano.
    expect(caminoDelCiclo(4, 1, CADENA)).toEqual([1, 2, 3, 4]);
  });

  it('devuelve null cuando no hay ciclo', () => {
    expect(caminoDelCiclo(5, 1, CADENA)).toBeNull();
  });

  it('el camino es el más corto cuando hay dos', () => {
    const dos = [usa(1, 2), usa(2, 9), usa(1, 9)];
    expect(caminoDelCiclo(9, 1, dos)).toEqual([1, 9]);
  });
});

describe('aguasArriba y aguasAbajo — la dirección inversa es la que no contesta nadie hoy', () => {
  it('aguas arriba sigue la cadena completa con su distancia', () => {
    expect(aguasArriba(1, CADENA)).toEqual([
      { activoId: 2, distancia: 1, tipo: 'USA', viaId: null },
      { activoId: 3, distancia: 2, tipo: 'USA', viaId: 2 },
      { activoId: 4, distancia: 3, tipo: 'USA', viaId: 3 },
    ]);
  });

  it('soloDirectas corta en el primer salto', () => {
    expect(aguasArriba(1, CADENA, true)).toEqual([
      { activoId: 2, distancia: 1, tipo: 'USA', viaId: null },
    ]);
  });

  it('aguas abajo responde quién se cae si esto se cae', () => {
    // Es la que alimenta el BIA anual, y la que el editor de dependencias no contesta.
    expect(aguasAbajo(4, CADENA)).toEqual([
      { activoId: 3, distancia: 1, tipo: 'USA', viaId: null },
      { activoId: 2, distancia: 2, tipo: 'USA', viaId: 3 },
      { activoId: 1, distancia: 3, tipo: 'USA', viaId: 2 },
    ]);
  });

  it('la distancia es la MÍNIMA cuando hay dos caminos', () => {
    // A→B→D y A→D. D está a un salto, no a dos, aunque el recorrido lo alcance por los dos
    // lados: «qué tan cerca está» tiene una sola respuesta.
    const dos = [usa(1, 2), usa(2, 4), usa(1, 4)];
    const r = aguasArriba(1, dos);
    expect(r.find((n) => n.activoId === 4)?.distancia).toBe(1);
  });

  it('un activo sin dependencias no devuelve nada, y eso no es un error', () => {
    expect(aguasArriba(99, CADENA)).toEqual([]);
  });

  it('no se cuelga si los datos ya traen un ciclo', () => {
    const conCiclo = [usa(1, 2), usa(2, 3), usa(3, 1)];
    expect(aguasArriba(1, conCiclo).map((n) => n.activoId).sort()).toEqual([2, 3]);
  });
});

describe('asimetrias — un crítico que depende de uno sin valorar es un hallazgo', () => {
  const cr = (activoId: number, criticidad: number | null) => ({ activoId, criticidad });

  it('reporta el que depende de uno SIN VALORAR', () => {
    // Sin valorar no es «bajo»: es que nadie lo miró, y no se puede afirmar que el conjunto
    // está bien si una pieza no se miró.
    const r = asimetrias([usa(1, 2)], [cr(1, 5), cr(2, null)], 4);
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toContain('sin valorar');
  });

  it('reporta el que depende de uno MENOS crítico', () => {
    const r = asimetrias([usa(1, 2)], [cr(1, 5), cr(2, 2)], 4);
    expect(r[0].motivo).toContain('menos crítico');
  });

  it('no reporta nada cuando el propio no llega al umbral', () => {
    // Un activo poco crítico que depende de uno sin valorar no es noticia.
    expect(asimetrias([usa(1, 2)], [cr(1, 2), cr(2, null)], 4)).toEqual([]);
  });

  it('no reporta cuando la dependencia es igual o más crítica', () => {
    expect(asimetrias([usa(1, 2)], [cr(1, 5), cr(2, 5)], 4)).toEqual([]);
    expect(asimetrias([usa(1, 2)], [cr(1, 4), cr(2, 5)], 4)).toEqual([]);
  });
});

describe('el «via» de cada nodo — sin el, una cadena de tres saltos no se puede auditar', () => {
  it('los directos no tienen via y llevan el tipo de su arista', () => {
    const r = aguasArriba(1, [{ activoId: 1, dependeDeId: 9, tipo: 'ALMACENA_EN' }]);
    expect(r[0]).toEqual({ activoId: 9, distancia: 1, tipo: 'ALMACENA_EN', viaId: null });
  });

  it('un nodo en cadena dice por donde se llega', () => {
    // «vía postgres» es lo que permite reconstruir el camino sin volver a recorrer el grafo.
    const r = aguasArriba(1, CADENA);
    expect(r.find((n) => n.activoId === 4)?.viaId).toBe(3);
  });
});
