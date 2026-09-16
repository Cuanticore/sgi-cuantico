// lib/sig/__tests__/dependencias-orden.test.ts
//
// D5 · **el orden vertical dentro de una columna deja de ser alfabético.**
//
// Hasta acá las cajas se apilaban en el orden en que venían de la consulta —por código—, así
// que ninguna quedaba cerca de aquello con lo que se conecta y toda arista era una diagonal
// larga. Esto ordena cada columna por el baricentro de sus vecinos.
//
// **Y tiene que ser DETERMINISTA.** El grafo se dibuja a mano, y no con un motor de acomodo,
// porque «un mapa que se mueve solo no se puede señalar con el dedo en una reunión». Un
// baricentro que dependa del orden de la lista de aristas rompería exactamente esa promesa, y
// las doce pruebas de la pantalla pasarían igual.

import { ordenDentroDeColumnas, type Arista } from '../dependencias';

const a = (activoId: number, dependeDeId: number): Arista => ({ activoId, dependeDeId, tipo: 'USA' });

/// Las columnas tal como las devuelve `columnasDelGrafo`: la flecha va de la columna menor a
/// la mayor, siempre.
const cols = (pares: [number, number][]) => new Map(pares);
const codigos = (pares: [number, string][]) => new Map(pares);

describe('ordenDentroDeColumnas — las cajas se acercan a lo que las conecta', () => {
  it('sin aristas, cada columna conserva el orden por código', () => {
    const orden = ordenDentroDeColumnas(
      cols([
        [1, 0],
        [2, 0],
        [3, 0],
      ]),
      [],
      codigos([
        [1, 'TEC-003'],
        [2, 'TEC-001'],
        [3, 'TEC-002'],
      ]),
    );
    expect(orden.get(2)).toBe(0);
    expect(orden.get(3)).toBe(1);
    expect(orden.get(1)).toBe(2);
  });

  it('deshace un cruce: cada nodo se alinea con su vecino de la izquierda', () => {
    // Columna 0: A(0) B(1). Columna 1: X depende... de nada; B depende de X, A depende de Y.
    // Por código, X entra antes que Y y las dos aristas se cruzan. El baricentro las desanuda.
    const orden = ordenDentroDeColumnas(
      cols([
        [10, 0],
        [11, 0],
        [20, 1],
        [21, 1],
      ]),
      [a(11, 20), a(10, 21)],
      codigos([
        [10, 'A'],
        [11, 'B'],
        [20, 'X'],
        [21, 'Y'],
      ]),
    );
    expect(orden.get(10)).toBe(0);
    expect(orden.get(11)).toBe(1);
    expect(orden.get(21)).toBe(0); // Y, a la altura de A
    expect(orden.get(20)).toBe(1); // X, a la altura de B
  });

  it('el empate se rompe por código, no por orden de llegada', () => {
    // Los dos cuelgan del mismo nodo, así que tienen el mismo baricentro. Sin una regla de
    // desempate, el dibujo dependería del orden en que Prisma devolvió las filas.
    const orden = ordenDentroDeColumnas(
      cols([
        [10, 0],
        [20, 1],
        [21, 1],
      ]),
      [a(10, 20), a(10, 21)],
      codigos([
        [10, 'A'],
        [20, 'TEC-009'],
        [21, 'TEC-002'],
      ]),
    );
    expect(orden.get(21)).toBe(0);
    expect(orden.get(20)).toBe(1);
  });

  it('un nodo sin vecinos a la izquierda conserva su índice en vez de irse al tope', () => {
    // Columna 1: `A2` cuelga del último de la columna 0 (baricentro 2), `C2` del primero
    // (baricentro 0) y `B2` no cuelga de nadie. Conservando su índice, `B2` queda en el medio.
    //
    // Es la prueba que separa «conservar el índice» de «tratar la ausencia como cero»: con un
    // cero por omisión, `B2` empataría con `C2` y ganaría por código, desplazando al único de
    // los tres que sí tiene una razón para estar arriba.
    const orden = ordenDentroDeColumnas(
      cols([
        [10, 0],
        [11, 0],
        [12, 0],
        [20, 1],
        [21, 1],
        [22, 1],
      ]),
      [a(12, 20), a(10, 22)],
      codigos([
        [10, 'A'],
        [11, 'B'],
        [12, 'C'],
        [20, 'A2'],
        [21, 'B2'],
        [22, 'C2'],
      ]),
    );
    expect(orden.get(22)).toBe(0);
    expect(orden.get(21)).toBe(1);
    expect(orden.get(20)).toBe(2);
  });

  it('los índices de cada columna son 0..n-1 sin huecos ni repetidos', () => {
    const columnas = cols([
      [1, 0],
      [2, 0],
      [3, 1],
      [4, 1],
      [5, 1],
      [6, 2],
    ]);
    const orden = ordenDentroDeColumnas(
      columnas,
      [a(1, 3), a(2, 4), a(1, 5), a(3, 6)],
      codigos([
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
        [4, 'd'],
        [5, 'e'],
        [6, 'f'],
      ]),
    );
    const porColumna = new Map<number, number[]>();
    for (const [id, c] of columnas) {
      const previos = porColumna.get(c);
      if (previos === undefined) porColumna.set(c, [orden.get(id) as number]);
      else previos.push(orden.get(id) as number);
    }
    for (const [, indices] of porColumna) {
      expect([...indices].sort((x, y) => x - y)).toEqual(indices.map((_, i) => i));
    }
  });

  it('el resultado no depende del orden de la lista de aristas', () => {
    // Es la prueba que protege la promesa del mapa que no se mueve solo.
    const columnas = cols([
      [1, 0],
      [2, 0],
      [3, 1],
      [4, 1],
      [5, 2],
    ]);
    const cod = codigos([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
      [4, 'd'],
      [5, 'e'],
    ]);
    const aristas = [a(1, 4), a(2, 3), a(3, 5), a(1, 3)];
    const directo = ordenDentroDeColumnas(columnas, aristas, cod);
    const alReves = ordenDentroDeColumnas(columnas, [...aristas].reverse(), cod);
    expect([...alReves.entries()].sort()).toEqual([...directo.entries()].sort());
  });

  it('el resultado no depende del orden de inserción del mapa de columnas', () => {
    const pares: [number, number][] = [
      [1, 0],
      [2, 0],
      [3, 1],
      [4, 1],
    ];
    const cod = codigos([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
      [4, 'd'],
    ]);
    const aristas = [a(2, 3), a(1, 4)];
    const directo = ordenDentroDeColumnas(cols(pares), aristas, cod);
    const alReves = ordenDentroDeColumnas(cols([...pares].reverse()), aristas, cod);
    expect([...alReves.entries()].sort()).toEqual([...directo.entries()].sort());
  });

  it('dos llamadas idénticas devuelven exactamente lo mismo', () => {
    const columnas = cols([
      [1, 0],
      [2, 1],
      [3, 1],
    ]);
    const cod = codigos([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
    const aristas = [a(1, 3)];
    expect([...ordenDentroDeColumnas(columnas, aristas, cod).entries()]).toEqual(
      [...ordenDentroDeColumnas(columnas, aristas, cod).entries()],
    );
  });

  it('un activo sin código no rompe el orden', () => {
    // `Activo.codigo` es opcional, y el grafo ya dibuja `#id` cuando falta.
    const orden = ordenDentroDeColumnas(
      cols([
        [7, 0],
        [8, 0],
      ]),
      [],
      codigos([[8, 'TEC-001']]),
    );
    expect(new Set(orden.values())).toEqual(new Set([0, 1]));
  });

  it('una arista hacia un nodo que no está en el subgrafo se ignora', () => {
    // El subgrafo filtrado descarta aristas, y el acomodo no puede suponer que toda arista
    // tiene sus dos extremos dibujados.
    const orden = ordenDentroDeColumnas(cols([[1, 0]]), [a(1, 999)], codigos([[1, 'a']]));
    expect(orden.get(1)).toBe(0);
    expect(orden.has(999)).toBe(false);
  });

  it('sin nodos devuelve un mapa vacío', () => {
    expect(ordenDentroDeColumnas(new Map(), [], new Map()).size).toBe(0);
  });
});
