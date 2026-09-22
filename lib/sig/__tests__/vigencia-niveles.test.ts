// lib/sig/__tests__/vigencia-niveles.test.ts
//
// Qué cuenta como trabajo pendiente en la auditoría del árbol de niveles, y qué es una lápida.
//
// POR QUÉ ESTE MÓDULO EXISTE. `scripts/auditar-niveles.ts` contaba sobre TODOS los nodos. Eso
// era correcto ANTES de la primera fusión y deja de serlo después: un nodo absorbido queda
// `activo = false` y **conserva su nombre viejo a propósito**, para poder deshacer la fusión.
//
// Consecuencia medida el 22/09/2026, sobre producción ya estandarizada: el informe seguía
// diciendo «3 nombres sin normalizar · 2 colisiones» cuando entre nodos VIVOS no quedaba
// ninguna. Quien lo leyera sin ese contexto concluiría que la fusión quedó a medias.
//
// La regla que se prueba acá: **el trabajo pendiente se cuenta entre nodos activos.** Las
// lápidas se informan aparte y con su nombre, porque son evidencia de lo que se hizo, no deuda.

import { nombresPendientes, separarColisiones } from '../vigencia-niveles';

const n = (id: number, nombre: string, activo = true, grado = 3, padreId: number | null = 9) => ({
  id,
  nombre,
  grado,
  padreId,
  activo,
});

describe('nombresPendientes', () => {
  it('cuenta solo los ACTIVOS que no estan en mayuscula', () => {
    const r = nombresPendientes([n(1, 'Documentación'), n(2, 'CÓDIGO FUENTE'), n(3, 'Monitor', false)]);
    expect(r.map((x) => x.id)).toEqual([1]);
  });

  it('una lapida con nombre viejo NO es trabajo pendiente', () => {
    expect(nombresPendientes([n(3, 'Mintrace', false), n(4, 'Productos', false)])).toEqual([]);
  });

  it('un arbol ya normalizado no deja nada', () => {
    expect(nombresPendientes([n(1, 'DOCUMENTACIÓN'), n(2, 'CÓDIGO FUENTE')])).toEqual([]);
  });
});

describe('separarColisiones', () => {
  it('un grupo con dos ACTIVOS es una fusion pendiente', () => {
    const g = [[n(1, 'MONITOR'), n(2, 'Monitor')]];
    const { pendientes, lapidas } = separarColisiones(g);
    expect(pendientes).toHaveLength(1);
    expect(lapidas).toHaveLength(0);
  });

  it('un grupo con un activo y una lapida YA esta resuelto', () => {
    const g = [[n(1, 'MONITOR'), n(2, 'Monitor', false)]];
    const { pendientes, lapidas } = separarColisiones(g);
    expect(pendientes).toHaveLength(0);
    expect(lapidas).toHaveLength(1);
  });

  it('un grupo entero de lapidas tampoco es pendiente', () => {
    const { pendientes, lapidas } = separarColisiones([[n(1, 'X', false), n(2, 'x', false)]]);
    expect(pendientes).toHaveLength(0);
    expect(lapidas).toHaveLength(1);
  });

  it('separa varios grupos a la vez sin perder ninguno', () => {
    const g = [
      [n(1, 'A'), n(2, 'a')],
      [n(3, 'B'), n(4, 'b', false)],
      [n(5, 'C', false), n(6, 'c', false)],
    ];
    const { pendientes, lapidas } = separarColisiones(g);
    expect(pendientes).toHaveLength(1);
    expect(lapidas).toHaveLength(2);
    expect(pendientes.length + lapidas.length).toBe(g.length);
  });
});
