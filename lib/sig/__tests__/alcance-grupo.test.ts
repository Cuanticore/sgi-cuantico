// lib/sig/__tests__/alcance-grupo.test.ts
//
// **P11 · lo que el selector elige no es lo que la base guarda, y acá se fija.**
//
// `decidirAlcancePorGrupo` es la única traducción del formulario donde la elección y la
// columna no coinciden: «Todos» se guarda como `alcance: 'TODOS'` sin destino, y cualquier
// otro grupo como `GRUPO_INTERES` con su id. Las cuatro pruebas de abajo son las cuatro
// formas de romperlo, y la última —la que cruza contra `validarDatosObligacion`— es la que
// impide que este módulo produzca algo que el servidor después rechaza.

import { decidirAlcancePorGrupo, type GrupoOfrecido } from '../alcance-grupo';
import { validarDatosObligacion, type DatosObligacion } from '../obligacion-validacion';

/// El catálogo tal como llega de la página: sólo los grupos ACTIVOS, y «Todos» con su marca
/// de derivado.
const CATALOGO: GrupoOfrecido[] = [
  { id: 1, nombre: 'Todos', derivado: true },
  { id: 2, nombre: 'Desarrolladores', derivado: false },
  { id: 3, nombre: 'Administradores de sistemas', derivado: false },
];

describe('el grupo derivado se guarda como TODOS, sin destino', () => {
  // La decisión que sostiene todo el resto: «Todos» no tiene filas de membresía, así que
  // guardarlo como `GRUPO_INTERES` con su id daría una obligación que resuelve cero personas
  // sin que nada avise.
  it('elegir «Todos» produce alcance TODOS', () => {
    const { destino, error } = decidirAlcancePorGrupo(1, CATALOGO);
    expect(error).toBeNull();
    expect(destino).toEqual({ alcance: 'TODOS' });
  });

  it('y NO lleva alcanceGrupoInteresId', () => {
    const { destino } = decidirAlcancePorGrupo(1, CATALOGO);
    expect(destino?.alcanceGrupoInteresId).toBeUndefined();
  });
});

describe('un grupo no derivado se guarda como GRUPO_INTERES con su id', () => {
  it('elegir «Desarrolladores» produce el alcance por grupo con su id', () => {
    const { destino, error } = decidirAlcancePorGrupo(2, CATALOGO);
    expect(error).toBeNull();
    expect(destino).toEqual({ alcance: 'GRUPO_INTERES', alcanceGrupoInteresId: 2 });
  });

  // El id que viaja es el del grupo elegido y no el primero de la lista: un `find` mal escrito
  // —o un índice usado como id— pasaría la prueba de arriba y dirigiría la obligación al grupo
  // equivocado, que es un error que nadie ve hasta que llegan las tareas.
  it('el id es el del grupo elegido', () => {
    expect(decidirAlcancePorGrupo(3, CATALOGO).destino).toEqual({
      alcance: 'GRUPO_INTERES',
      alcanceGrupoInteresId: 3,
    });
  });
});

describe('un grupo inactivo o inexistente se rechaza con frase', () => {
  // El catálogo trae sólo los ACTIVOS, así que un grupo dado de baja llega acá exactamente
  // igual que uno que nunca existió: los dos son «no está en la lista». Y se rechazan igual,
  // porque en los dos casos la obligación quedaría apuntando a un grupo al que el generador
  // no le dirige nada — creada, activa y sin generar nunca.
  it('un id que el catálogo no tiene no produce destino', () => {
    const { destino, error } = decidirAlcancePorGrupo(99, CATALOGO);
    expect(destino).toBeNull();
    expect(error).toContain('no existe o está inactivo');
  });

  it('un grupo que quedó inactivo se rechaza igual, porque salió del catálogo', () => {
    const sinDesarrolladores = CATALOGO.filter((g) => g.id !== 2);
    const { destino, error } = decidirAlcancePorGrupo(2, sinDesarrolladores);
    expect(destino).toBeNull();
    expect(error).toContain('no existe o está inactivo');
  });

  // El `<select>` sin elegir manda `''`, y `Number('')` es `0`. La frase es otra a propósito:
  // «el grupo 0 no existe» suena a dato corrupto y no a un campo sin completar.
  it('sin elegir nada pide elegir, no dice que el grupo no existe', () => {
    for (const vacio of [0, Number.NaN, -1, 2.5]) {
      const { destino, error } = decidirAlcancePorGrupo(vacio, CATALOGO);
      expect(destino).toBeNull();
      expect(error).toBe('elegí a qué grupo de interés alcanza');
    }
  });
});

describe('ninguna elección produce una obligación que el servidor rechace', () => {
  const BASE: DatosObligacion = {
    contenidoId: 1,
    alcance: 'TODOS',
    periodicidad: 'MENSUAL',
    fechaInicio: new Date('2026-09-01T00:00:00.000Z'),
    plazoDias: 15,
    diasAviso: 5,
    responsableSeguimientoId: 7,
  };

  // R4 pide **exactamente un destino**, y `TODOS` pide **ninguno**. Las dos ramas de este
  // módulo son justamente las dos caras de esa regla, así que se comprueban contra la guarda
  // real y no contra una copia: si mañana alguien le agrega el id al grupo derivado «para que
  // quede completo», esta prueba falla con el mensaje del servidor.
  it.each(CATALOGO)('$nombre pasa validarDatosObligacion', (grupo) => {
    const { destino, error } = decidirAlcancePorGrupo(grupo.id, CATALOGO);
    expect(error).toBeNull();
    expect(validarDatosObligacion({ ...BASE, ...destino! })).toEqual([]);
  });

  // El invariante que impide la obligación duplicada: un alcance por grupo SIEMPRE lleva id, y
  // `TODOS` NUNCA lo lleva. Si los dos pudieran llevarlo, «Todos» tendría dos representaciones
  // en la base y la lista mostraría dos obligaciones que alcanzan al mismo conjunto.
  it('TODOS nunca lleva id y GRUPO_INTERES siempre lo lleva', () => {
    for (const grupo of CATALOGO) {
      const { destino } = decidirAlcancePorGrupo(grupo.id, CATALOGO);
      if (destino!.alcance === 'TODOS') {
        expect(destino!.alcanceGrupoInteresId).toBeUndefined();
      } else {
        expect(destino!.alcanceGrupoInteresId).toBe(grupo.id);
      }
    }
  });
});
