// lib/sgsi/__tests__/clases-relevancia.test.ts
//
// LA CLASE DE LA FÓRMULA Y EL NOMBRE DEL CATÁLOGO SON EL MISMO HECHO, y hasta REQ-SIG-21 se
// declaraban por separado. El resultado no era un nombre distinto: era un nombre que señalaba
// al grupo equivocado.
//
//   catálogo (`relevancia_control`, el que ofrece el <select>)   fórmula (`ClaseRelevancia`)
//     Principal      peso 3   →  70 %                              principal
//     Complementario peso 2   →  20 %                              secundario
//     De apoyo       peso 1   →  10 %                              complementario
//
// La pantalla imprimía la clase de la fórmula en mayúsculas, así que «COMPLEMENTARIO» en la
// pestaña Ecuación era el grupo del 10 %, mientras que «Complementario» en el selector era el
// del 20 %. Quien leyera las dos cosas en la misma ficha —que es lo normal— clasificaba al
// revés, y nada fallaba: la aritmética siempre estuvo bien, el rótulo no.
//
// Por eso `CATALOGO_RELEVANCIA` es ahora la única declaración: la siembra la escribe en la
// base y la interfaz la lee para rotular. Este archivo fija que sigan atadas.

import {
  CATALOGO_RELEVANCIA,
  PRESUPUESTO_CLASE,
  catalogoDeClase,
  claseDeControl,
} from '../madurez';

describe('El catálogo de relevancia es la única declaración', () => {
  it('trae las tres clases con el nombre y el peso que `relevancia_control` guarda', () => {
    expect(
      CATALOGO_RELEVANCIA.map((r) => ({ nombre: r.nombre, peso: r.peso, orden: r.orden })),
    ).toEqual([
      { nombre: 'Principal', peso: 3, orden: 1 },
      { nombre: 'Complementario', peso: 2, orden: 2 },
      { nombre: 'De apoyo', peso: 1, orden: 3 },
    ]);
  });

  it('un solo principal declarado, que es lo que el techo necesita', () => {
    expect(CATALOGO_RELEVANCIA.filter((r) => r.esPrincipal).map((r) => r.nombre)).toEqual([
      'Principal',
    ]);
  });

  it('cada entrada cae en la clase que `claseDeControl` le asigna a su peso', () => {
    // Si alguien cambiara «Complementario» a peso 1, la clase se movería sola y el
    // presupuesto con ella. Esto lo hace visible acá y no en una matriz dentro de seis meses.
    for (const r of CATALOGO_RELEVANCIA) {
      expect(claseDeControl({ nivel: null, peso: r.peso, esPrincipal: r.esPrincipal })).toBe(
        r.clase,
      );
    }
  });

  it('el presupuesto declarado es el mismo que reparte la fórmula', () => {
    for (const r of CATALOGO_RELEVANCIA) {
      expect(r.presupuesto).toBeCloseTo(PRESUPUESTO_CLASE[r.clase], 10);
    }
    expect(CATALOGO_RELEVANCIA.map((r) => r.presupuesto)).toEqual([0.7, 0.2, 0.1]);
  });

  it('la clase «secundario» se rotula «Complementario», y «complementario» se rotula «De apoyo»', () => {
    // La prueba que justifica el archivo: es exactamente el cruce que la pantalla tenía al
    // revés. Escrito con los literales a la vista para que un cambio accidental salte.
    expect(catalogoDeClase('principal').nombre).toBe('Principal');
    expect(catalogoDeClase('secundario').nombre).toBe('Complementario');
    expect(catalogoDeClase('complementario').nombre).toBe('De apoyo');
  });

  it('cada clase tiene su criterio, que es el texto que explica cuándo se elige', () => {
    for (const r of CATALOGO_RELEVANCIA) {
      expect(r.criterio.length).toBeGreaterThan(20);
    }
    expect(catalogoDeClase('principal').criterio).toMatch(/no se contiene/);
  });
});
