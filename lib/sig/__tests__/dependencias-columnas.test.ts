// lib/sig/__tests__/dependencias-columnas.test.ts
//
// **La composición, no las piezas.** `activosDeRama`, `subgrafoDeRama`, `columnasDelGrafo` y
// `ordenDentroDeColumnas` ya tienen su suite cada una. Los tres bugs que originaron el harness
// no vivían en ninguna pieza: vivían entre ellas —un paso que no escribía alimentando a otro
// que esperaba que hubiera escrito, un número que dos funciones contaban desde orígenes
// distintos—. Acá se encadenan en el mismo orden en que las llama la pantalla.

import {
  columnasDelGrafo,
  ordenDentroDeColumnas,
  subgrafoDeRama,
  type Arista,
} from '../dependencias';
import { activosDeRama, type Nivel } from '../niveles';

const a = (activoId: number, dependeDeId: number): Arista => ({ activoId, dependeDeId, tipo: 'USA' });
const n = (id: number, grado: number, nombre: string, padreId: number | null, clase: Nivel['clase'] = null): Nivel => ({
  id,
  grado,
  nombre,
  padreId,
  clase,
  activo: true,
});

// PRODUCTOS › MINTRACE › Ambientes   ·   EMPRESA › Infraestructura › Servidores
const NIVELES: Nivel[] = [
  n(1, 1, 'PRODUCTOS', null, 'PRODUCTOS'),
  n(2, 2, 'MINTRACE', 1),
  n(3, 3, 'Ambientes', 2),
  n(10, 1, 'EMPRESA', null, 'EMPRESA'),
  n(11, 2, 'Infraestructura', 10),
  n(12, 3, 'Servidores', 11),
];

// La forma real: la aplicación de MINTRACE se aloja en un servidor de EMPRESA, que a su vez
// corre sobre un hipervisor de EMPRESA. Y hay un CRM ajeno que también usa ese servidor.
const ACTIVOS = [
  { id: 100, nivelId: 3, codigo: 'APP-01' }, // MINTRACE
  { id: 101, nivelId: 3, codigo: 'API-01' }, // MINTRACE
  { id: 102, nivelId: 3, codigo: 'SUELTO' }, // MINTRACE, sin ninguna relación
  { id: 200, nivelId: 12, codigo: 'SRV-01' }, // EMPRESA
  { id: 201, nivelId: 12, codigo: 'HYP-01' }, // EMPRESA, a dos saltos de MINTRACE
  { id: 300, nivelId: null, codigo: 'CRM-99' }, // sin clasificar, usa el mismo servidor
];

const ARISTAS: Arista[] = [a(100, 200), a(101, 200), a(200, 201), a(300, 200)];

function encadenar(nivelId: number | null) {
  const sujeto = activosDeRama(nivelId, NIVELES, ACTIVOS);
  const sub = subgrafoDeRama(sujeto, ARISTAS);
  const visibles = [...sub.sujeto, ...sub.frontera];
  const columnas = columnasDelGrafo(visibles, sub.aristas);
  const codigos = new Map(ACTIVOS.map((x) => [x.id, x.codigo]));
  return { sub, columnas, orden: ordenDentroDeColumnas(columnas, sub.aristas, codigos) };
}

describe('filtrar MINTRACE — las cuatro funciones encadenadas', () => {
  it('trae los activos de MINTRACE y el servidor que los sostiene', () => {
    const { sub } = encadenar(2);
    expect([...sub.sujeto].sort()).toEqual([100, 101, 102]);
    expect([...sub.frontera].sort()).toEqual([200]);
  });

  it('el hipervisor, a dos saltos, no entra', () => {
    const { sub } = encadenar(2);
    expect(sub.frontera.has(201)).toBe(false);
  });

  it('el CRM ajeno no entra aunque comparta el servidor', () => {
    // Es la arista frontera↔afuera: el servidor está dibujado, pero lo que cuelga de él sin
    // pasar por MINTRACE no es la pregunta.
    const { sub } = encadenar(2);
    expect(sub.sujeto.has(300)).toBe(false);
    expect(sub.frontera.has(300)).toBe(false);
  });

  it('las columnas del subgrafo arrancan en 0, no en la columna que tenían en el grafo completo', () => {
    // Sin recalcular, MINTRACE filtrado arrancaría desplazado y las primeras columnas
    // quedarían vacías.
    const { columnas } = encadenar(2);
    expect(Math.min(...columnas.values())).toBe(0);
    expect(columnas.get(100)).toBe(0);
    expect(columnas.get(101)).toBe(0);
  });

  it('la frontera queda estrictamente a la derecha de quien depende de ella', () => {
    const { columnas } = encadenar(2);
    expect(columnas.get(200) as number).toBeGreaterThan(columnas.get(100) as number);
  });

  it('un activo de la rama sin ninguna relación se dibuja en la columna 0', () => {
    // D11 · con filtro puesto, «qué activos de MINTRACE nadie conectó con nada» es el hallazgo.
    const { columnas } = encadenar(2);
    expect(columnas.get(102)).toBe(0);
  });

  it('`columnasDelGrafo` recibe exactamente lo que `subgrafoDeRama` devolvió', () => {
    // Los tres bugs del harness fueron de esta forma: dos pasos contando desde orígenes
    // distintos. Acá se exige que ningún nodo dibujado quede sin columna, y que ninguna
    // columna corresponda a un nodo que no se dibuja.
    const { sub, columnas, orden } = encadenar(2);
    const visibles = new Set([...sub.sujeto, ...sub.frontera]);
    expect(new Set(columnas.keys())).toEqual(visibles);
    expect(new Set(orden.keys())).toEqual(visibles);
    for (const arista of sub.aristas) {
      expect(visibles.has(arista.activoId)).toBe(true);
      expect(visibles.has(arista.dependeDeId)).toBe(true);
    }
  });

  it('filtrar por «sin nivel» trae el CRM y el servidor que usa', () => {
    const { sub } = encadenar(null);
    expect([...sub.sujeto]).toEqual([300]);
    expect([...sub.frontera]).toEqual([200]);
  });

  it('el acomodo no deja dos cajas de la misma columna en el mismo renglón', () => {
    const { columnas, orden } = encadenar(2);
    const ocupados = new Set<string>();
    for (const [id, c] of columnas) {
      const celda = `${c}:${orden.get(id)}`;
      expect(ocupados.has(celda)).toBe(false);
      ocupados.add(celda);
    }
  });
});
