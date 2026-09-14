// lib/sig/__tests__/grupos.test.ts
//
// Lo que se prueba acá es a quién le llegan las obligaciones dirigidas a un grupo, y desde
// cuándo. Un plan que se equivoca borrando deja sin respuesta la pregunta «quién estaba en
// Desarrolladores en marzo»; uno que se equivoca en el `desde` le cobra a alguien periodos de
// antes de pertenecer; y uno que acepta una membresía en «Todos» crea la segunda respuesta a
// «quién pertenece», que es la que el esquema está construido para que no exista.

import {
  planificarGrupos,
  type GrupoConocido,
  type MembresiaVigente,
} from '../grupos';

const HOY = new Date('2026-09-14T00:00:00.000Z');

const TODOS: GrupoConocido = { id: 1, nombre: 'Todos', derivado: true };
const DESARROLLADORES: GrupoConocido = { id: 2, nombre: 'Desarrolladores', derivado: false };
const LIDERES: GrupoConocido = { id: 3, nombre: 'Líderes SIG', derivado: false };
const CATALOGO = [TODOS, DESARROLLADORES, LIDERES];

const vigente = (id: number, grupoId: number, desde: string): MembresiaVigente => ({
  id,
  grupoId,
  desde: new Date(`${desde}T00:00:00.000Z`),
});

describe('el grupo derivado', () => {
  // P10 · la casilla de «Todos» está deshabilitada en el popup, pero una validación que sólo
  // vive en el cliente se salta llamando a la acción con el id puesto. Por eso se decide acá.
  it('rechaza guardar una membresía en un grupo derivado, con la frase', () => {
    const plan = planificarGrupos([], [TODOS.id], CATALOGO, HOY);

    expect(plan.errores).toHaveLength(1);
    expect(plan.errores[0]).toContain('Todos');
    expect(plan.errores[0]).toContain('derivado');
  });

  it('no crea la fila del derivado ni siquiera mientras arma el plan', () => {
    const plan = planificarGrupos([], [TODOS.id, DESARROLLADORES.id], CATALOGO, HOY);

    expect(plan.crear.map((m) => m.grupoId)).toEqual([DESARROLLADORES.id]);
    expect(plan.vigentesResultantes.map((m) => m.grupoId)).toEqual([DESARROLLADORES.id]);
  });

  // Un id que el catálogo no tiene dejaría una membresía en un grupo que nadie puede abrir y
  // al que el generador no le dirige nada.
  it('rechaza un grupo que no existe o está inactivo', () => {
    const plan = planificarGrupos([], [99], CATALOGO, HOY);

    expect(plan.crear).toEqual([]);
    expect(plan.errores).toHaveLength(1);
    expect(plan.errores[0]).toContain('99');
  });
});

describe('qué se abre y qué se cierra', () => {
  it('abre la membresía marcada que no estaba vigente, desde hoy', () => {
    const plan = planificarGrupos([], [DESARROLLADORES.id], CATALOGO, HOY);

    expect(plan.crear).toEqual([{ grupoId: DESARROLLADORES.id, desde: HOY }]);
    expect(plan.cerrar).toEqual([]);
    expect(plan.errores).toEqual([]);
  });

  // La regla completa: desmarcar CIERRA con `hasta`. Si borrara la fila, «quién estaba en
  // Desarrolladores en marzo» dejaría de tener respuesta.
  it('cierra con hasta la membresía desmarcada, y conserva su id', () => {
    const plan = planificarGrupos([vigente(7, DESARROLLADORES.id, '2026-03-01')], [], CATALOGO, HOY);

    expect(plan.cerrar).toEqual([{ id: 7, grupoId: DESARROLLADORES.id, hasta: HOY }]);
    expect(plan.crear).toEqual([]);
    expect(plan.vigentesResultantes).toEqual([]);
  });

  // Un `update` que no cambia nada gasta una escritura y ensucia la bitácora; y reabrir la
  // membresía le movería el `desde` —el piso de periodos— a alguien que nunca dejó de
  // pertenecer.
  it('no escribe nada por una membresía que ya estaba vigente y sigue marcada', () => {
    const plan = planificarGrupos(
      [vigente(7, DESARROLLADORES.id, '2026-03-01')],
      [DESARROLLADORES.id],
      CATALOGO,
      HOY,
    );

    expect(plan.crear).toEqual([]);
    expect(plan.cerrar).toEqual([]);
    expect(plan.anotaciones).toEqual([]);
    expect(plan.vigentesResultantes).toEqual([
      { grupoId: DESARROLLADORES.id, desde: new Date('2026-03-01T00:00:00.000Z') },
    ]);
  });

  it('abre una y cierra otra en el mismo plan', () => {
    const plan = planificarGrupos(
      [vigente(7, DESARROLLADORES.id, '2026-03-01')],
      [LIDERES.id],
      CATALOGO,
      HOY,
    );

    expect(plan.cerrar.map((m) => m.grupoId)).toEqual([DESARROLLADORES.id]);
    expect(plan.crear.map((m) => m.grupoId)).toEqual([LIDERES.id]);
    expect(plan.vigentesResultantes).toEqual([{ grupoId: LIDERES.id, desde: HOY }]);
  });

  // Las casillas son un conjunto: marcar dos veces la misma es la misma marca, no dos.
  it('no duplica la membresía si el mismo id llega dos veces', () => {
    const plan = planificarGrupos([], [LIDERES.id, LIDERES.id], CATALOGO, HOY);

    expect(plan.crear).toHaveLength(1);
    expect(plan.errores).toEqual([]);
  });
});

describe('lo que el generador va a mirar', () => {
  // La propiedad que hace que el número del popup sea un hecho: la generación corre con la
  // lista que va a quedar guardada, no con la que estaba antes.
  it('las vigentes resultantes son las que quedan tras aplicar el plan, con su desde', () => {
    const plan = planificarGrupos(
      [vigente(7, DESARROLLADORES.id, '2026-03-01'), vigente(8, LIDERES.id, '2026-01-15')],
      [LIDERES.id],
      CATALOGO,
      HOY,
    );

    expect(plan.vigentesResultantes).toEqual([
      { grupoId: LIDERES.id, desde: new Date('2026-01-15T00:00:00.000Z') },
    ]);
  });

  it('devuelve las resultantes ordenadas, para que el plan no dependa del orden de la pantalla', () => {
    const a = planificarGrupos([], [LIDERES.id, DESARROLLADORES.id], CATALOGO, HOY);
    const b = planificarGrupos([], [DESARROLLADORES.id, LIDERES.id], CATALOGO, HOY);

    expect(a.vigentesResultantes).toEqual(b.vigentesResultantes);
    expect(a.crear).toEqual(b.crear);
  });
});

describe('las frases de la bitácora', () => {
  it('el alta dice el grupo y desde cuándo, sin valor anterior', () => {
    const plan = planificarGrupos([], [DESARROLLADORES.id], CATALOGO, HOY);

    expect(plan.anotaciones).toEqual([
      {
        campo: 'grupo de interés',
        anterior: null,
        nuevo: 'Desarrolladores · desde 2026-09-14',
      },
    ]);
  });

  // El nuevo valor no es `null`: la fila sigue existiendo, cerrada. «(vacío)» haría leer un
  // borrado donde hubo una baja con fecha, que es justo lo que `hasta` viene a distinguir.
  it('el cierre dice el retiro con su fecha, y no se lee como un borrado', () => {
    const plan = planificarGrupos([vigente(7, DESARROLLADORES.id, '2026-03-01')], [], CATALOGO, HOY);

    expect(plan.anotaciones).toEqual([
      {
        campo: 'grupo de interés',
        anterior: 'Desarrolladores · desde 2026-03-01',
        nuevo: 'retirado el 2026-09-14',
      },
    ]);
  });
});
