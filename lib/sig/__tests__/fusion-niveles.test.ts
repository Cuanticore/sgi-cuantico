// lib/sig/__tests__/fusion-niveles.test.ts
//
// El plan para estandarizar los nombres del árbol del inventario.
//
// Poner un nombre en mayúscula NO es un renombre cuando ya existe un hermano que ocupa ese
// mismo nombre normalizado: ahí hay dos nodos que pasan a ser el mismo, y alguien tiene que
// mudar los hijos y los activos de uno al otro. Eso es una FUSIÓN.
//
// **Y fusionar un padre cambia quiénes son hermanos en el grado siguiente.** Si `Productos` y
// `PRODUCTOS` se funden, los hijos de grado 2 de ambos pasan a ser hermanos, y ahí aparecen
// colisiones que antes no existían. Por eso el plan se calcula de grado 1 hacia grado 3,
// propagando el resultado de cada grado al siguiente.
//
// Ese es el defecto que este archivo existe para impedir, y es de la misma forma que las tres
// cicatrices de HARNESS.md: no vive en una pieza, vive en la composición. Una función que
// mirara cada grado por separado pasaría sus propios tests y dejaría el árbol duplicado.

import { planDeEstandarizacion, type NivelCrudo } from '../fusion-niveles';

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

describe('planDeEstandarizacion', () => {
  test('un árbol ya normalizado no produce ningún cambio', () => {
    const plan = planDeEstandarizacion([
      n(1, 1, 'PRODUCTOS', null, { clase: 'PRODUCTOS' }),
      n(2, 2, 'MINTRACE', 1),
      n(3, 3, 'AMBIENTES', 2),
    ]);

    expect(plan.renombres).toEqual([]);
    expect(plan.fusiones).toEqual([]);
    expect(plan.conflictos).toEqual([]);
  });

  test('un nombre en minúscula sin hermano que choque es un renombre, no una fusión', () => {
    const plan = planDeEstandarizacion([
      n(1, 1, 'PRODUCTOS', null, { clase: 'PRODUCTOS' }),
      n(2, 3, 'codigo fuente', 1),
    ]);

    expect(plan.renombres).toEqual([{ id: 2, de: 'codigo fuente', a: 'CODIGO FUENTE' }]);
    expect(plan.fusiones).toEqual([]);
  });

  test('dos hermanos que colapsan al mismo nombre son una fusión', () => {
    const plan = planDeEstandarizacion([
      n(1, 1, 'PRODUCTOS', null, { clase: 'PRODUCTOS' }),
      n(2, 3, 'CODIGO FUENTE', 1, { activosDirectos: 5 }),
      n(3, 3, 'codigo fuente', 1, { activosDirectos: 2 }),
    ]);

    expect(plan.fusiones).toEqual([
      { grado: 3, sobrevive: 2, absorbe: [3], nombre: 'CODIGO FUENTE' },
    ]);
    // El absorbido no se renombra: se apaga.
    expect(plan.renombres).toEqual([]);
  });

  test('fusionar dos raíces hace colisionar a sus hijos de grado 2', () => {
    // PRODUCTOS ── MINTRACE        ← dos ramas que hoy no se tocan,
    // Productos ── Mintrace        ← y que al fundir las raíces pasan a ser hermanas.
    const plan = planDeEstandarizacion([
      n(1, 1, 'PRODUCTOS', null, { clase: 'PRODUCTOS' }),
      n(2, 2, 'MINTRACE', 1, { activosDirectos: 10 }),
      n(10, 1, 'Productos', null),
      n(11, 2, 'Mintrace', 10, { activosDirectos: 3 }),
    ]);

    expect(plan.fusiones).toEqual([
      { grado: 1, sobrevive: 1, absorbe: [10], nombre: 'PRODUCTOS' },
      { grado: 2, sobrevive: 2, absorbe: [11], nombre: 'MINTRACE' },
    ]);
  });

  test('la colisión propagada llega hasta el grado 3', () => {
    const plan = planDeEstandarizacion([
      n(1, 1, 'PRODUCTOS', null, { clase: 'PRODUCTOS' }),
      n(2, 2, 'MINTRACE', 1),
      n(3, 3, 'AMBIENTES', 2),
      n(10, 1, 'Productos', null),
      n(11, 2, 'Mintrace', 10),
      n(12, 3, 'ambientes', 11),
    ]);

    expect(plan.fusiones.map((f) => f.grado)).toEqual([1, 2, 3]);
    expect(plan.fusiones[2]).toEqual({
      grado: 3,
      sobrevive: 3,
      absorbe: [12],
      nombre: 'AMBIENTES',
    });
  });

  test('dos nodos con el mismo nombre bajo padres DISTINTOS no se fusionan', () => {
    // «Documentación» cuelga de once ramas en el libro real: indexar por nombre las
    // colapsaría todas en una.
    const plan = planDeEstandarizacion([
      n(1, 1, 'PRODUCTOS', null, { clase: 'PRODUCTOS' }),
      n(2, 2, 'MINTRACE', 1),
      n(3, 2, 'CONDUCPRO', 1),
      n(4, 3, 'DOCUMENTACION', 2),
      n(5, 3, 'documentacion', 3),
    ]);

    expect(plan.fusiones).toEqual([]);
    expect(plan.renombres).toEqual([{ id: 5, de: 'documentacion', a: 'DOCUMENTACION' }]);
  });

  test('sobrevive el que tiene clase, aunque tenga menos activos', () => {
    const plan = planDeEstandarizacion([
      n(1, 1, 'Productos', null, { activosDirectos: 0 }),
      n(2, 1, 'PRODUCTOS', null, { clase: 'PRODUCTOS', activosDirectos: 0 }),
    ]);

    expect(plan.fusiones).toEqual([
      { grado: 1, sobrevive: 2, absorbe: [1], nombre: 'PRODUCTOS' },
    ]);
  });

  test('sobrevive el activo sobre el apagado, aunque el apagado tenga clase', () => {
    const plan = planDeEstandarizacion([
      n(1, 1, 'PRODUCTOS', null, { clase: 'PRODUCTOS', activo: false }),
      n(2, 1, 'Productos', null, { activo: true }),
    ]);

    expect(plan.fusiones[0].sobrevive).toBe(2);
  });

  test('un nivel apagado que colisiona igual entra al plan', () => {
    // El índice único no distingue apagados: si se deja, la migración no puede crearlo.
    const plan = planDeEstandarizacion([
      n(1, 1, 'PRODUCTOS', null, { clase: 'PRODUCTOS' }),
      n(2, 3, 'AMBIENTES', 1),
      n(3, 3, 'ambientes', 1, { activo: false }),
    ]);

    expect(plan.fusiones).toEqual([
      { grado: 3, sobrevive: 2, absorbe: [3], nombre: 'AMBIENTES' },
    ]);
  });

  test('a igualdad de clase y estado, sobrevive el de más activos en su RAMA', () => {
    // El nodo 1 no tiene activos propios, pero su rama sí. Contar sólo los directos elegiría
    // al otro y dejaría la rama grande colgando de un nodo absorbido.
    const plan = planDeEstandarizacion([
      n(1, 1, 'Productos', null),
      n(2, 2, 'MINTRACE', 1),
      n(3, 3, 'AMBIENTES', 2, { activosDirectos: 40 }),
      n(50, 1, 'PRODUCTOS', null, { activosDirectos: 3 }),
    ]);

    expect(plan.fusiones[0].sobrevive).toBe(1);
  });

  test('a igualdad de todo, sobrevive el de menor id', () => {
    const plan = planDeEstandarizacion([
      n(7, 1, 'PROYECTOS', null),
      n(3, 1, 'Proyectos', null),
    ]);

    expect(plan.fusiones[0]).toEqual({
      grado: 1,
      sobrevive: 3,
      absorbe: [7],
      nombre: 'PROYECTOS',
    });
  });

  test('si los dos encabezan un Producto, no se fusiona: se reporta el conflicto', () => {
    // `producto.nivel_id` es @unique: uno de los dos Producto quedaría sin nivel, y eso es
    // una decisión de negocio, no de datos.
    const plan = planDeEstandarizacion([
      n(1, 1, 'MINTRACE', null, { clase: 'PRODUCTOS', encabezaProducto: true }),
      n(2, 1, 'Mintrace', null, { clase: 'PRODUCTOS', encabezaProducto: true }),
    ]);

    expect(plan.fusiones).toEqual([]);
    expect(plan.conflictos).toHaveLength(1);
    expect(plan.conflictos[0].tipo).toBe('PRODUCTO_DUPLICADO');
    expect(plan.conflictos[0].ids.sort()).toEqual([1, 2]);
  });

  test('si las clases son distintas y ninguna es nula, no se fusiona', () => {
    const plan = planDeEstandarizacion([
      n(1, 1, 'PROYECTOS', null, { clase: 'PROYECTOS' }),
      n(2, 1, 'Proyectos', null, { clase: 'EMPRESA' }),
    ]);

    expect(plan.fusiones).toEqual([]);
    expect(plan.conflictos[0].tipo).toBe('CLASE_INCOMPATIBLE');
  });

  test('un conflicto en el grado 1 NO propaga la fusión a sus hijos', () => {
    // Si las raíces no se funden, sus hijos siguen sin ser hermanos.
    const plan = planDeEstandarizacion([
      n(1, 1, 'MINTRACE', null, { encabezaProducto: true }),
      n(2, 2, 'AMBIENTES', 1),
      n(10, 1, 'Mintrace', null, { encabezaProducto: true }),
      n(11, 2, 'ambientes', 10),
    ]);

    expect(plan.fusiones).toEqual([]);
    expect(plan.renombres).toEqual([{ id: 11, de: 'ambientes', a: 'AMBIENTES' }]);
  });

  test('el superviviente con nombre sin normalizar también se renombra', () => {
    const plan = planDeEstandarizacion([
      n(1, 1, 'Productos', null, { clase: 'PRODUCTOS' }),
      n(2, 1, 'productos', null),
    ]);

    expect(plan.fusiones[0].sobrevive).toBe(1);
    expect(plan.renombres).toEqual([{ id: 1, de: 'Productos', a: 'PRODUCTOS' }]);
  });

  test('tres hermanos que colapsan se funden en uno solo', () => {
    const plan = planDeEstandarizacion([
      n(1, 1, 'PRODUCTOS', null, { clase: 'PRODUCTOS' }),
      n(2, 3, 'AMBIENTES', 1),
      n(3, 3, 'ambientes', 1),
      n(4, 3, '  Ambientes  ', 1),
    ]);

    expect(plan.fusiones).toEqual([
      { grado: 3, sobrevive: 2, absorbe: [3, 4], nombre: 'AMBIENTES' },
    ]);
  });
});
