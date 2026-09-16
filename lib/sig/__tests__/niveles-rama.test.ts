// lib/sig/__tests__/niveles-rama.test.ts
//
// El filtro del grafo por Nivel 1 / 2 / 3.
//
// **Filtrar por un nivel es filtrar por su RAMA, no por el nivel exacto.** Elegir el nivel 2
// `MINTRACE` tiene que traer los activos de todos sus niveles 3: el activo apunta al grado 3
// y los grados 1 y 2 se derivan subiendo por `padreId` (E2). Comparar `a.nivelId === nivelId`
// devolvería cero activos para cualquier nivel 1 o 2, que es el error silencioso que este
// archivo existe para impedir.

import { activosDeRama, type Nivel } from '../niveles';

const n = (
  id: number,
  grado: number,
  nombre: string,
  padreId: number | null,
  clase: Nivel['clase'] = null,
  activo = true,
): Nivel => ({ id, grado, nombre, padreId, clase, activo });

// PRODUCTOS ─┬─ MINTRACE ──┬─ Ambientes
//            │             └─ Repositorios
//            └─ CONDUCPRO ─── Ambientes CP
// EMPRESA ────── Infraestructura ─ Servidores
// Y un nivel 3 huérfano: su padre no existe.
const NIVELES: Nivel[] = [
  n(1, 1, 'PRODUCTOS', null, 'PRODUCTOS'),
  n(2, 2, 'MINTRACE', 1),
  n(3, 3, 'Ambientes', 2),
  n(4, 3, 'Repositorios', 2),
  n(5, 2, 'CONDUCPRO', 1),
  n(6, 3, 'Ambientes CP', 5),
  n(10, 1, 'EMPRESA', null, 'EMPRESA'),
  n(11, 2, 'Infraestructura', 10),
  n(12, 3, 'Servidores', 11),
  n(90, 3, 'Huérfano', 404),
  n(20, 2, 'Descontinuado', 1, null, false),
  n(21, 3, 'Ambiente viejo', 20, null, false),
];

const ACTIVOS = [
  { id: 100, nivelId: 3 }, // MINTRACE · Ambientes
  { id: 101, nivelId: 3 }, // MINTRACE · Ambientes
  { id: 102, nivelId: 4 }, // MINTRACE · Repositorios
  { id: 200, nivelId: 6 }, // CONDUCPRO
  { id: 300, nivelId: 12 }, // EMPRESA · Servidores
  { id: 400, nivelId: 90 }, // cuelga de un nivel huérfano
  { id: 500, nivelId: null }, // sin clasificar
  { id: 501, nivelId: null }, // sin clasificar
  { id: 600, nivelId: 21 }, // en una rama desactivada
];

describe('activosDeRama — filtrar por un nivel es filtrar por su rama', () => {
  it('un nivel 3 trae sólo los activos que apuntan a él', () => {
    expect([...activosDeRama(3, NIVELES, ACTIVOS)].sort()).toEqual([100, 101]);
  });

  it('un nivel 2 trae los activos de TODOS sus niveles 3', () => {
    // Es la prueba que separa «filtrar por la rama» de «comparar nivelId»: el 102 cuelga de
    // `Repositorios`, no de `MINTRACE`, y tiene que entrar igual.
    expect([...activosDeRama(2, NIVELES, ACTIVOS)].sort()).toEqual([100, 101, 102]);
  });

  it('un nivel 2 no trae los activos de su hermano', () => {
    expect(activosDeRama(2, NIVELES, ACTIVOS).has(200)).toBe(false);
  });

  it('un nivel 1 trae la rama entera, dos grados abajo', () => {
    expect([...activosDeRama(1, NIVELES, ACTIVOS)].sort()).toEqual([100, 101, 102, 200, 600]);
  });

  it('`null` trae exactamente los activos sin nivel', () => {
    // No es un caso degenerado: es una opción del filtro. Los activos sin clasificar son
    // trabajo pendiente conocido, y esconderlos sería perder inventario en silencio.
    expect([...activosDeRama(null, NIVELES, ACTIVOS)].sort()).toEqual([500, 501]);
  });

  it('los activos de un nivel 3 huérfano no entran a la rama de ningún nivel 1', () => {
    // `cadenaDeNivel` devuelve lo que hay, no lo que debería haber. Si la cadena no llega a
    // la raíz, el activo no pertenece a esa raíz — y el dato roto queda visible en vez de
    // repartido al azar.
    expect(activosDeRama(1, NIVELES, ACTIVOS).has(400)).toBe(false);
    expect(activosDeRama(10, NIVELES, ACTIVOS).has(400)).toBe(false);
  });

  it('un nivel huérfano sigue filtrando por sí mismo', () => {
    expect([...activosDeRama(90, NIVELES, ACTIVOS)]).toEqual([400]);
  });

  it('un nivel inactivo se puede filtrar: sus activos siguen existiendo', () => {
    // Esconderlos haría que el inventario se viera completo justamente porque le falta algo.
    expect([...activosDeRama(20, NIVELES, ACTIVOS)]).toEqual([600]);
  });

  it('un nivel que no existe no trae nada', () => {
    expect(activosDeRama(777, NIVELES, ACTIVOS).size).toBe(0);
  });

  it('una jerarquía con ciclo no cuelga el filtro', () => {
    // `cadenaDeNivel` corta al repisar un id. Acá se comprueba que `activosDeRama` hereda esa
    // garantía: un dato corrupto no debería colgar una pantalla.
    const ciclo: Nivel[] = [n(1, 1, 'A', 2), n(2, 2, 'B', 1)];
    expect(() => activosDeRama(1, ciclo, [{ id: 1, nivelId: 1 }])).not.toThrow();
  });
});
