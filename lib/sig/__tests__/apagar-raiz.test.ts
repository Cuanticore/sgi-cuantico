// lib/sig/__tests__/apagar-raiz.test.ts
//
// Apagar la raíz `EMPRESA`, que el seed de la migración creó (`migration.sql:175-178`) y que
// `CUANTICO` no reemplazó: se le sumó. Las dos quedaron con `clase: EMPRESA`.
//
// **Apagarla a ciegas es el error que hay que impedir.** `armarArbol` filtra por `activo`
// (`lib/sig/niveles.ts:335`), así que apagar una raíz con activos en su rama no los reubica:
// los saca del árbol y engrosa el aviso ámbar de «Fuera del árbol». El mapa se vería más
// limpio justamente porque perdió información.
//
// Por eso esta función sólo apaga cuando no hay nada que perder, y cuando hay algo colgando
// se niega y dice qué. Mudar activos de una rama a otra es una decisión de negocio.

import { planDeApagadoDeRaiz, type NivelCrudo } from '../apagar-raiz';

const n = (
  id: number,
  grado: number,
  nombre: string,
  padreId: number | null,
  extra: Partial<NivelCrudo> = {},
): NivelCrudo => ({
  id,
  grado,
  nombre,
  padreId,
  clase: null,
  activo: true,
  activosDirectos: 0,
  encabezaProducto: false,
  ...extra,
});

describe('planDeApagadoDeRaiz', () => {
  test('una raíz vacía se apaga', () => {
    const plan = planDeApagadoDeRaiz(
      [
        n(1, 1, 'CUANTICO', null, { clase: 'EMPRESA' }),
        n(2, 1, 'EMPRESA', null, { clase: 'EMPRESA' }),
      ],
      'EMPRESA',
    );

    expect(plan).toEqual({ apagar: 2, impedimentos: [] });
  });

  test('encuentra la raíz sin importar la caja del nombre', () => {
    const plan = planDeApagadoDeRaiz([n(2, 1, 'Empresa', null)], 'EMPRESA');

    expect(plan.apagar).toBe(2);
  });

  test('una raíz con activos en su rama NO se apaga', () => {
    const plan = planDeApagadoDeRaiz(
      [
        n(2, 1, 'EMPRESA', null, { clase: 'EMPRESA' }),
        n(3, 2, 'INFRAESTRUCTURA', 2),
        n(4, 3, 'SERVIDORES', 3, { activosDirectos: 12 }),
      ],
      'EMPRESA',
    );

    expect(plan.apagar).toBeNull();
    // Dos impedimentos: los activos y los niveles vigentes. El informe los dice todos, para
    // que quien lo lea sepa el tamaño real de la mudanza antes de empezarla.
    expect(plan.impedimentos).toHaveLength(2);
    expect(plan.impedimentos[0]).toMatch(/12 activo/);
  });

  test('una raíz con hijos pero sin activos tampoco se apaga sola', () => {
    // Apagar la raíz deja los hijos colgando de un padre invisible: el árbol los pierde
    // aunque ningún activo se caiga hoy.
    const plan = planDeApagadoDeRaiz(
      [n(2, 1, 'EMPRESA', null), n(3, 2, 'INFRAESTRUCTURA', 2)],
      'EMPRESA',
    );

    expect(plan.apagar).toBeNull();
    expect(plan.impedimentos[0]).toMatch(/1 nivel/);
  });

  test('los hijos ya apagados no cuentan como impedimento', () => {
    const plan = planDeApagadoDeRaiz(
      [n(2, 1, 'EMPRESA', null), n(3, 2, 'VIEJO', 2, { activo: false })],
      'EMPRESA',
    );

    expect(plan.apagar).toBe(2);
    expect(plan.impedimentos).toEqual([]);
  });

  test('una raíz que encabeza un Producto no se apaga', () => {
    const plan = planDeApagadoDeRaiz(
      [n(2, 1, 'EMPRESA', null, { encabezaProducto: true })],
      'EMPRESA',
    );

    expect(plan.apagar).toBeNull();
    expect(plan.impedimentos[0]).toMatch(/Producto/);
  });

  test('una raíz que ya está apagada no es un cambio', () => {
    const plan = planDeApagadoDeRaiz([n(2, 1, 'EMPRESA', null, { activo: false })], 'EMPRESA');

    expect(plan).toEqual({ apagar: null, impedimentos: [] });
  });

  test('si la raíz no existe, no hay nada que hacer y no es un error', () => {
    const plan = planDeApagadoDeRaiz([n(1, 1, 'CUANTICO', null)], 'EMPRESA');

    expect(plan).toEqual({ apagar: null, impedimentos: [] });
  });

  test('sólo mira raíces: un nivel 2 con ese nombre no se toca', () => {
    const plan = planDeApagadoDeRaiz(
      [n(1, 1, 'CUANTICO', null), n(5, 2, 'EMPRESA', 1)],
      'EMPRESA',
    );

    expect(plan.apagar).toBeNull();
  });

  test('suma activos y niveles cuando hay de los dos', () => {
    const plan = planDeApagadoDeRaiz(
      [
        n(2, 1, 'EMPRESA', null),
        n(3, 2, 'INFRAESTRUCTURA', 2),
        n(4, 3, 'SERVIDORES', 3, { activosDirectos: 7 }),
      ],
      'EMPRESA',
    );

    expect(plan.impedimentos).toHaveLength(2);
  });
});
