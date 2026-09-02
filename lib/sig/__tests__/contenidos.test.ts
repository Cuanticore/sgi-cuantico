// lib/sig/__tests__/contenidos.test.ts
//
// Los casos que importan son los que BORRAN. Un plan que se equivoca agregando deja un
// ítem de más y alguien lo saca; un plan que se equivoca borrando destruye la respuesta
// que probaba que la verificación se hizo, y eso no se recupera de la pantalla.

import { planificarItems, versionTrasEditar, type ItemGuardado } from '../contenidos';

const guardado = (id: number, texto: string, respuestas = 0): ItemGuardado => ({
  id,
  orden: id,
  texto,
  obligatorio: true,
  permiteNoAplica: true,
  respuestas,
});

const propuesto = (texto: string, id?: number) => ({
  ...(id !== undefined && { id }),
  texto,
  obligatorio: true,
  permiteNoAplica: true,
});

describe('planificarItems', () => {
  it('crea los que no traen id y actualiza los que sí', () => {
    const plan = planificarItems(
      [guardado(1, 'Revisar el log'), guardado(2, 'Verificar el backup')],
      [propuesto('Revisar el log del servidor', 1), propuesto('Probar la restauración')],
    );

    expect(plan.errores).toEqual([]);
    expect(plan.actualizar).toEqual([
      { id: 1, orden: 1, texto: 'Revisar el log del servidor', obligatorio: true, permiteNoAplica: true },
    ]);
    expect(plan.crear).toEqual([
      { orden: 2, texto: 'Probar la restauración', obligatorio: true, permiteNoAplica: true },
    ]);
    // El 2 desapareció de la propuesta y nadie lo respondió: se borra.
    expect(plan.borrar).toEqual([2]);
  });

  // El caso que justifica el módulo entero.
  it('NO borra un ítem ya respondido, y dice cuál y cuántas veces', () => {
    const plan = planificarItems(
      [guardado(1, 'Revisar el log'), guardado(2, 'Verificar el backup', 37)],
      [propuesto('Revisar el log', 1)],
    );

    expect(plan.borrar).toEqual([]);
    expect(plan.bloqueados).toEqual([{ id: 2, texto: 'Verificar el backup', respuestas: 37 }]);
    expect(plan.errores).toHaveLength(1);
    expect(plan.errores[0]).toContain('Verificar el backup');
    expect(plan.errores[0]).toContain('37');
  });

  // Reordenar no cambia lo que se preguntó, así que se permite siempre — incluso sobre
  // ítems con respuestas, porque la identidad del ítem es su id y no su número.
  it('reordena ítems ya respondidos sin bloquear nada', () => {
    const plan = planificarItems(
      [guardado(1, 'Primero', 12), guardado(2, 'Segundo', 12)],
      [propuesto('Segundo', 2), propuesto('Primero', 1)],
    );

    expect(plan.errores).toEqual([]);
    expect(plan.bloqueados).toEqual([]);
    expect(plan.actualizar.map((a) => [a.id, a.orden])).toEqual([
      [2, 1],
      [1, 2],
    ]);
  });

  // El orden sale de la posición, nunca de lo que manda la pantalla: hay una unique
  // (contenidoId, orden) esperando para fallar con un error de Prisma en la cara.
  it('el orden lo pone la posición en el arreglo', () => {
    const plan = planificarItems([], [propuesto('a'), propuesto('b'), propuesto('c')]);
    expect(plan.crear.map((c) => c.orden)).toEqual([1, 2, 3]);
  });

  it('rechaza una lista vacía', () => {
    const plan = planificarItems([guardado(1, 'Algo')], []);
    expect(plan.errores).toEqual(['una lista de verificación necesita al menos un ítem']);
    expect(plan.borrar).toEqual([]);
  });

  it('rechaza un ítem sin texto', () => {
    const plan = planificarItems([], [propuesto('   ')]);
    expect(plan.errores).toEqual(['el ítem 1 no tiene texto']);
    expect(plan.crear).toEqual([]);
  });

  it('recorta el texto', () => {
    const plan = planificarItems([], [propuesto('  Revisar el log  ')]);
    expect(plan.crear[0].texto).toBe('Revisar el log');
  });

  // Un id ajeno no se crea en silencio: la pantalla creyó estar editando algo, y crear
  // otra cosa con el texto que mandó es adivinar.
  it('rechaza un id que no pertenece al contenido', () => {
    const plan = planificarItems([guardado(1, 'Propio')], [propuesto('Ajeno', 99)]);
    expect(plan.errores).toEqual(['el ítem 99 no pertenece a este contenido']);
    expect(plan.crear).toEqual([]);
    expect(plan.actualizar).toEqual([]);
  });

  it('rechaza el mismo id dos veces', () => {
    const plan = planificarItems(
      [guardado(1, 'Uno')],
      [propuesto('Uno', 1), propuesto('Uno otra vez', 1)],
    );
    expect(plan.errores).toEqual(['el ítem 1 viene dos veces']);
  });
});

describe('versionTrasEditar', () => {
  it('sube la versión de un contenido que ya generó obligaciones', () => {
    expect(versionTrasEditar(3, true)).toBe(4);
  });

  it('no la mueve si nunca se asignó', () => {
    expect(versionTrasEditar(1, false)).toBe(1);
  });
});
