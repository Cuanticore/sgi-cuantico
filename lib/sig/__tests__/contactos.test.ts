// lib/sig/__tests__/contactos.test.ts
//
// Lo que se prueba acá es a quién se llama en una emergencia y en qué orden. Un plan que se
// equivoca creando deja un contacto de más y alguien lo saca; uno que se equivoca en el
// orden pone segundo a quien tenía que atender primero, y eso no se nota hasta el día en que
// importa.

import {
  estaEnBlanco,
  planificarContactos,
  type ContactoGuardado,
  type ContactoPropuesto,
} from '../contactos';

const guardado = (
  id: number,
  nombre: string,
  parentesco: string,
  telefono: string,
  orden = id,
): ContactoGuardado => ({ id, nombre, parentesco, telefono, orden });

const propuesto = (
  nombre: string,
  parentesco: string,
  telefono: string,
  id?: number,
): ContactoPropuesto => ({ ...(id !== undefined && { id }), nombre, parentesco, telefono });

const enBlanco: ContactoPropuesto = { nombre: '', parentesco: '', telefono: '' };

describe('qué contacto es válido', () => {
  // Una fila con los tres campos vacíos es el hueco que el formulario ofrece para agregar.
  // Guardar sin usarlo es lo normal, no una equivocación.
  it('descarta en silencio la fila en blanco, sin error', () => {
    const plan = planificarContactos([], [enBlanco, enBlanco]);

    expect(plan.errores).toEqual([]);
    expect(plan.crear).toEqual([]);
    expect(plan.anotaciones).toEqual([]);
    expect(estaEnBlanco(enBlanco)).toBe(true);
  });

  it('rechaza la fila a medias y dice qué le falta', () => {
    const plan = planificarContactos([], [propuesto('Ana Pérez', '', '')]);

    expect(plan.crear).toEqual([]);
    expect(plan.errores).toHaveLength(1);
    expect(plan.errores[0]).toContain('parentesco');
    expect(plan.errores[0]).toContain('teléfono');
  });

  // El parentesco es texto libre, pero no opcional: sin él la lista no alcanza para decidir
  // a quién se llama primero ni qué se le dice.
  it('exige el parentesco aunque haya nombre y teléfono', () => {
    const plan = planificarContactos([], [propuesto('Ana Pérez', '   ', '300 111 2222')]);

    expect(plan.crear).toEqual([]);
    expect(plan.errores).toHaveLength(1);
    expect(plan.errores[0]).toContain('parentesco');
  });

  it('limpia los espacios de los tres campos antes de guardar', () => {
    const plan = planificarContactos([], [propuesto('  Ana Pérez ', ' madre ', ' 300 111 2222 ')]);

    expect(plan.crear).toEqual([
      { orden: 1, nombre: 'Ana Pérez', parentesco: 'madre', telefono: '300 111 2222' },
    ]);
  });

  it('no hace nada con una lista vacía y sin contactos guardados', () => {
    const plan = planificarContactos([], []);

    expect(plan).toEqual({ crear: [], actualizar: [], retirar: [], anotaciones: [], errores: [] });
  });
});

describe('el orden de llamada', () => {
  it('numera 1..n por la posición en la lista', () => {
    const plan = planificarContactos(
      [],
      [
        propuesto('Ana Pérez', 'madre', '300 111 2222'),
        propuesto('Luis Gómez', 'hermano', '300 333 4444'),
        propuesto('Sara Ríos', 'esposa', '300 555 6666'),
      ],
    );

    expect(plan.crear.map((c) => [c.orden, c.nombre])).toEqual([
      [1, 'Ana Pérez'],
      [2, 'Luis Gómez'],
      [3, 'Sara Ríos'],
    ]);
  });

  // El caso que justifica filtrar las filas en blanco ANTES de numerar: si contaran, el
  // hueco del medio correría el orden y el segundo contacto pasaría a ser el tercero.
  it('no deja que una fila en blanco intercalada corra el orden de las siguientes', () => {
    const plan = planificarContactos(
      [],
      [
        propuesto('Ana Pérez', 'madre', '300 111 2222'),
        enBlanco,
        propuesto('Luis Gómez', 'hermano', '300 333 4444'),
      ],
    );

    expect(plan.errores).toEqual([]);
    expect(plan.crear.map((c) => [c.orden, c.nombre])).toEqual([
      [1, 'Ana Pérez'],
      [2, 'Luis Gómez'],
    ]);
  });
});

describe('el plan contra lo guardado', () => {
  it('crea los que no traen id, actualiza los que sí y retira los que ya no llegan', () => {
    const plan = planificarContactos(
      [
        guardado(1, 'Ana Pérez', 'madre', '300 111 2222'),
        guardado(2, 'Luis Gómez', 'hermano', '300 333 4444'),
      ],
      [
        propuesto('Ana Pérez', 'madre', '300 999 0000', 1),
        propuesto('Sara Ríos', 'esposa', '300 555 6666'),
      ],
    );

    expect(plan.errores).toEqual([]);
    expect(plan.actualizar).toEqual([
      { id: 1, orden: 1, nombre: 'Ana Pérez', parentesco: 'madre', telefono: '300 999 0000' },
    ]);
    expect(plan.crear).toEqual([
      { orden: 2, nombre: 'Sara Ríos', parentesco: 'esposa', telefono: '300 555 6666' },
    ]);
    // El 2 desapareció de la lista: se retira.
    expect(plan.retirar).toEqual([2]);
  });

  // Sólo cambia el teléfono: el contacto entra a `actualizar` y nada más se mueve.
  it('actualiza al que sólo le cambió el teléfono, y no toca a los demás', () => {
    const plan = planificarContactos(
      [
        guardado(1, 'Ana Pérez', 'madre', '300 111 2222'),
        guardado(2, 'Luis Gómez', 'hermano', '300 333 4444'),
      ],
      [
        propuesto('Ana Pérez', 'madre', '300 111 2222', 1),
        propuesto('Luis Gómez', 'hermano', '311 777 8888', 2),
      ],
    );

    expect(plan.errores).toEqual([]);
    expect(plan.crear).toEqual([]);
    expect(plan.retirar).toEqual([]);
    // El 1 llegó igual que como está guardado: no genera un `update` que no cambia nada.
    expect(plan.actualizar).toEqual([
      { id: 2, orden: 2, nombre: 'Luis Gómez', parentesco: 'hermano', telefono: '311 777 8888' },
    ]);
  });

  // Cambiar el orden es un cambio real: cambia a quién se llama primero.
  it('trata el reordenamiento puro como cambio, sin crear ni retirar nada', () => {
    const plan = planificarContactos(
      [
        guardado(1, 'Ana Pérez', 'madre', '300 111 2222'),
        guardado(2, 'Luis Gómez', 'hermano', '300 333 4444'),
      ],
      [
        propuesto('Luis Gómez', 'hermano', '300 333 4444', 2),
        propuesto('Ana Pérez', 'madre', '300 111 2222', 1),
      ],
    );

    expect(plan.errores).toEqual([]);
    expect(plan.crear).toEqual([]);
    expect(plan.retirar).toEqual([]);
    expect(plan.actualizar.map((a) => [a.id, a.orden])).toEqual([
      [2, 1],
      [1, 2],
    ]);
  });

  it('retira todo cuando la lista llega vacía', () => {
    const plan = planificarContactos([guardado(1, 'Ana Pérez', 'madre', '300 111 2222')], []);

    expect(plan.errores).toEqual([]);
    expect(plan.retirar).toEqual([1]);
  });

  it('rechaza un id que no pertenece a la persona en vez de crearlo en silencio', () => {
    const plan = planificarContactos(
      [guardado(1, 'Ana Pérez', 'madre', '300 111 2222')],
      [propuesto('Otra persona', 'tía', '300 000 0000', 99)],
    );

    expect(plan.crear).toEqual([]);
    expect(plan.errores).toHaveLength(1);
    expect(plan.errores[0]).toContain('99');
  });

  it('rechaza el mismo id dos veces', () => {
    const plan = planificarContactos(
      [guardado(1, 'Ana Pérez', 'madre', '300 111 2222')],
      [
        propuesto('Ana Pérez', 'madre', '300 111 2222', 1),
        propuesto('Ana Pérez', 'madre', '300 999 0000', 1),
      ],
    );

    expect(plan.errores).toHaveLength(1);
    expect(plan.errores[0]).toContain('dos veces');
  });

  // Un contacto que llegó a medias sigue estando guardado: el error no lo convierte en un
  // retiro. Sin esto, un parentesco borrado por accidente pediría borrar el contacto.
  it('no manda a retirar un contacto guardado que llegó incompleto', () => {
    const plan = planificarContactos(
      [guardado(1, 'Ana Pérez', 'madre', '300 111 2222')],
      [propuesto('Ana Pérez', '', '300 111 2222', 1)],
    );

    expect(plan.errores).toHaveLength(1);
    expect(plan.retirar).toEqual([]);
  });
});

describe('las frases de bitácora', () => {
  it('describe el alta con el contacto nuevo y sin valor anterior', () => {
    const plan = planificarContactos([], [propuesto('Ana Pérez', 'madre', '300 111 2222')]);

    expect(plan.anotaciones).toEqual([
      {
        campo: 'contacto de emergencia',
        anterior: null,
        nuevo: '1 · Ana Pérez · madre · 300 111 2222',
      },
    ]);
  });

  it('describe el cambio con los dos lados, para que se vea qué se movió', () => {
    const plan = planificarContactos(
      [guardado(1, 'Ana Pérez', 'madre', '300 111 2222')],
      [propuesto('Ana Pérez', 'madre', '311 777 8888', 1)],
    );

    expect(plan.anotaciones).toEqual([
      {
        campo: 'contacto de emergencia',
        anterior: '1 · Ana Pérez · madre · 300 111 2222',
        nuevo: '1 · Ana Pérez · madre · 311 777 8888',
      },
    ]);
  });

  // El retiro es el que más importa: la fila es lo único que queda del contacto.
  it('describe el retiro con el contacto que se fue y sin valor nuevo', () => {
    const plan = planificarContactos([guardado(1, 'Ana Pérez', 'madre', '300 111 2222')], []);

    expect(plan.anotaciones).toEqual([
      {
        campo: 'contacto de emergencia',
        anterior: '1 · Ana Pérez · madre · 300 111 2222',
        nuevo: null,
      },
    ]);
  });

  it('anota el orden nuevo en un reordenamiento, que si no sería invisible', () => {
    const plan = planificarContactos(
      [
        guardado(1, 'Ana Pérez', 'madre', '300 111 2222'),
        guardado(2, 'Luis Gómez', 'hermano', '300 333 4444'),
      ],
      [
        propuesto('Luis Gómez', 'hermano', '300 333 4444', 2),
        propuesto('Ana Pérez', 'madre', '300 111 2222', 1),
      ],
    );

    expect(plan.anotaciones.map((a) => [a.anterior, a.nuevo])).toEqual([
      ['2 · Luis Gómez · hermano · 300 333 4444', '1 · Luis Gómez · hermano · 300 333 4444'],
      ['1 · Ana Pérez · madre · 300 111 2222', '2 · Ana Pérez · madre · 300 111 2222'],
    ]);
  });

  it('no anota nada cuando la lista llegó igual que como está guardada', () => {
    const plan = planificarContactos(
      [guardado(1, 'Ana Pérez', 'madre', '300 111 2222')],
      [propuesto('Ana Pérez', 'madre', '300 111 2222', 1)],
    );

    expect(plan.anotaciones).toEqual([]);
  });
});
