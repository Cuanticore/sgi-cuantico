// lib/sgsi/__tests__/consolidado-niveles.test.ts
//
// REQ-SIG-12 §4.4 · las columnas Nivel 1/2/3 son una JERARQUÍA de tres grados, no tres
// columnas sueltas (E1).
//
// **La trampa está en el dato, y es grande.** Doce nombres de Nivel 3 se repiten bajo
// padres distintos: «Documentación» aparece bajo ONCE ramas —MINTRACE, Gestión de
// Proyectos, SIG…—, «Código fuente» bajo nueve, «Ambiente de producción» bajo nueve.
//
// Indexar el grado 3 por NOMBRE colapsaría once niveles distintos en uno solo, y los
// activos de once ramas terminarían colgando del mismo nodo. La identidad de un nivel es su
// CAMINO completo, no su nombre.

import { caminoDeNivel, jerarquiaDeNiveles } from '../consolidado';

const fila = (n: number, n1: string, n2: string, n3: string) => ({ fila: n, n1, n2, n3 });

describe('caminoDeNivel', () => {
  it('el camino identifica al nivel, no el nombre', () => {
    const a = caminoDeNivel(['CUANTICO', 'SIG', 'Documentación']);
    const b = caminoDeNivel(['PRODUCTOS', 'MINTRACE', 'Documentación']);
    expect(a).not.toBe(b);
  });

  it('el mismo camino da la misma clave', () => {
    expect(caminoDeNivel(['CUANTICO', 'SIG'])).toBe(caminoDeNivel(['CUANTICO', 'SIG']));
  });
});

describe('jerarquiaDeNiveles', () => {
  const FILAS = [
    fila(8, 'CUANTICO', 'SIG', 'Documentación'),
    fila(9, 'CUANTICO', 'SIG', 'Dependencias'),
    fila(10, 'PRODUCTOS', 'MINTRACE', 'Documentación'),
    fila(11, 'PROYECTOS', 'ILC', 'Código fuente'),
  ];

  it('arma los tres grados', () => {
    const { nodos } = jerarquiaDeNiveles(FILAS);
    expect(nodos.filter((n) => n.grado === 1)).toHaveLength(3);
    expect(nodos.filter((n) => n.grado === 2)).toHaveLength(3);
    expect(nodos.filter((n) => n.grado === 3)).toHaveLength(4);
  });

  // EL CASO QUE IMPORTA. Dos «Documentación» bajo padres distintos son DOS niveles.
  it('el mismo nombre bajo padres distintos son nodos distintos', () => {
    const { nodos } = jerarquiaDeNiveles(FILAS);
    const docs = nodos.filter((n) => n.grado === 3 && n.nombre === 'Documentación');
    expect(docs).toHaveLength(2);
    expect(new Set(docs.map((d) => d.padreCamino)).size).toBe(2);
  });

  it('no duplica un camino que aparece en muchas filas', () => {
    const repetido = [...FILAS, fila(12, 'CUANTICO', 'SIG', 'Documentación')];
    const { nodos } = jerarquiaDeNiveles(repetido);
    expect(nodos.filter((n) => n.grado === 3 && n.nombre === 'Documentación')).toHaveLength(2);
  });

  it('cada grado 2 y 3 cuelga de su padre', () => {
    const { nodos } = jerarquiaDeNiveles(FILAS);
    for (const n of nodos) {
      if (n.grado === 1) expect(n.padreCamino).toBeNull();
      else expect(n.padreCamino).not.toBeNull();
    }
  });

  // La clase vive SOLO en el grado 1: un nivel 2 o 3 la hereda subiendo, y guardarla otra
  // vez permitiría que un hijo contradijera a su padre.
  it('la clase va solo en el grado 1', () => {
    const { nodos } = jerarquiaDeNiveles(FILAS);
    expect(nodos.find((n) => n.grado === 1 && n.nombre === 'CUANTICO')?.clase).toBe('EMPRESA');
    expect(nodos.find((n) => n.grado === 1 && n.nombre === 'PRODUCTOS')?.clase).toBe('PRODUCTOS');
    expect(nodos.find((n) => n.grado === 1 && n.nombre === 'PROYECTOS')?.clase).toBe('PROYECTOS');
    for (const n of nodos.filter((x) => x.grado !== 1)) expect(n.clase).toBeNull();
  });

  // No se inventa una clase para una raíz que nadie definió: se reporta. Adivinarla es
  // decidir por el SGSI qué parte de la organización es un producto.
  it('una raíz desconocida se reporta y no recibe clase inventada', () => {
    const { nodos, problemas } = jerarquiaDeNiveles([fila(8, 'ALIANZAS', 'X', 'Y')]);
    expect(nodos.find((n) => n.grado === 1)?.clase).toBeNull();
    expect(problemas).toHaveLength(1);
    expect(problemas[0].fila).toBe(8);
    expect(problemas[0].mensaje).toContain('ALIANZAS');
  });

  it.each([
    ['Nivel 1', ['', 'SIG', 'Doc']],
    ['Nivel 2', ['CUANTICO', '', 'Doc']],
    ['Nivel 3', ['CUANTICO', 'SIG', '']],
  ])('una fila sin %s se reporta y no arma jerarquía a medias', (_n, [n1, n2, n3]) => {
    const { nodos, problemas } = jerarquiaDeNiveles([fila(8, n1, n2, n3)]);
    expect(problemas).toHaveLength(1);
    expect(nodos).toEqual([]);
  });

  it('sin filas no hay nodos ni problemas', () => {
    expect(jerarquiaDeNiveles([])).toEqual({ nodos: [], problemas: [] });
  });

  // El orden importa para escribir: un grado 2 no se puede crear antes que su grado 1.
  it('los nodos salen ordenados por grado', () => {
    const { nodos } = jerarquiaDeNiveles(FILAS);
    const grados = nodos.map((n) => n.grado);
    expect(grados).toEqual([...grados].sort((a, b) => a - b));
  });
});

// ─── Paridad con el §7.1 ──────────────────────────────────────────────────────────────
//
// El requerimiento descompone sus 405 aristas «contiene» como «299 + 85 + 18 + 3»: los
// activos, más los niveles de cada grado. Esos tres últimos son exactamente lo que esta
// función tiene que producir sobre el libro real.
describe('paridad · la descomposición del §7.1', () => {
  it('tres raíces, y son las del libro', () => {
    const filas = [
      fila(8, 'CUANTICO', 'SIG', 'Documentación'),
      fila(9, 'PRODUCTOS', 'MINTRACE', 'Código fuente'),
      fila(10, 'PROYECTOS', 'ILC', 'Ambiente de producción'),
    ];
    const raices = jerarquiaDeNiveles(filas).nodos.filter((n) => n.grado === 1);
    expect(raices.map((r) => r.nombre).sort()).toEqual(['CUANTICO', 'PRODUCTOS', 'PROYECTOS']);
  });
});
