// lib/sgsi/__tests__/consolidado-dependencias.test.ts
//
// REQ-SIG-12 §4.3 · la hoja Dependencias → `DependenciaActivo`.
//
// **El REQ describe dos formas y el libro tiene tres.** Las 107 filas se reparten así:
//
//   40  activo → activo, ambos con código          → arista real
//   58  agregador → tercero POR NOMBRE, sin código → NO es arista
//    9  sin base, solo el nombre (H-43)            → NO es arista
//
// Las 58 traen en su columna «Nivel 3 del activo relacionado» la leyenda literal «(tercero
// sin activo propio)»: Coolify, Docker, systemd, GHCR, Apache Superset. `DependenciaActivo`
// exige dos `Activo`, y esos terceros el inventario no los lista **por diseño**.
//
// De ahí que el §8.3 —«98 dependencias cargadas»— no sea alcanzable: 40 + 58 son las «98
// con base» del §2, pero solo 40 se pueden escribir. Las otras se reportan fila por fila,
// que es lo que el §6 pide para todo caso borde: cargar lo válido y no descartar en
// silencio.

import { clasificarDependencias, tipoDeDependencia } from '../consolidado';

const fila = (n: number, base: string, rel: string, n3 = '', nombre = '') => ({
  fila: n,
  base,
  relacionado: rel,
  nivel3Relacionado: n3,
  nombreRelacionado: nombre,
});

describe('clasificarDependencias', () => {
  const FILAS = [
    fila(11, 'TEC-SER-0033', 'TEC-SER-0053', 'Dependencias', 'SERVICIOS BASE — Dependencias'),
    fila(51, 'TEC-SER-0053', '', 'Plataforma (tercero sin activo propio)', 'Coolify'),
    fila(2, '', '', 'Servicios de Información', 'Servicios de Información / Apollo'),
  ];

  it('separa las tres formas', () => {
    const r = clasificarDependencias(FILAS);
    expect(r.aristas).toHaveLength(1);
    expect(r.terceros).toHaveLength(1);
    expect(r.huerfanas).toHaveLength(1);
  });

  it('la arista conserva la dirección: base → relacionado', () => {
    const [a] = clasificarDependencias(FILAS).aristas;
    expect(a).toEqual({ fila: 11, base: 'TEC-SER-0033', relacionado: 'TEC-SER-0053' });
  });

  // El tercero se reporta CON su base: sin ella, «Coolify» no le dice a nadie de qué activo
  // cuelga, y el parte deja de servir para arreglarlo.
  it('el tercero se reporta con la base de la que cuelga', () => {
    const [t] = clasificarDependencias(FILAS).terceros;
    expect(t.base).toBe('TEC-SER-0053');
    expect(t.nombre).toBe('Coolify');
    expect(t.fila).toBe(51);
  });

  it('la huérfana se reporta con su nombre, que es lo único que trae', () => {
    const [h] = clasificarDependencias(FILAS).huerfanas;
    expect(h.nombre).toContain('Apollo');
    expect(h.fila).toBe(2);
  });

  // Este es el error que cometí leyendo el libro: descartar «filas vacías» mirando solo las
  // dos primeras columnas hizo desaparecer las nueve huérfanas, que traen su dato en la
  // tercera y la cuarta.
  it('una fila es vacía solo si TODAS sus columnas lo están', () => {
    const r = clasificarDependencias([
      fila(20, '', '', '', ''),
      fila(21, '', '', 'Servicios de Información', 'Apollo'),
    ]);
    expect(r.huerfanas).toHaveLength(1);
    expect(r.huerfanas[0].fila).toBe(21);
  });

  it('una base con código inválido no se cuela como arista', () => {
    const r = clasificarDependencias([fila(30, 'basura', 'TEC-SER-0053')]);
    expect(r.aristas).toHaveLength(0);
    expect(r.huerfanas).toHaveLength(1);
  });

  it('un activo no depende de sí mismo', () => {
    const r = clasificarDependencias([fila(31, 'TEC-SER-0001', 'TEC-SER-0001')]);
    expect(r.aristas).toHaveLength(0);
    expect(r.problemas).toHaveLength(1);
    expect(r.problemas[0].mensaje).toContain('sí mismo');
  });

  // Repetir la misma arista en dos filas no es dos aristas: la tabla tiene única
  // (activo, dependeDe, tipo) y la segunda moriría contra ella.
  it('la misma arista dos veces se carga una sola vez', () => {
    const r = clasificarDependencias([
      fila(11, 'TEC-SER-0033', 'TEC-SER-0053'),
      fila(12, 'TEC-SER-0033', 'TEC-SER-0053'),
    ]);
    expect(r.aristas).toHaveLength(1);
  });

  it('sin filas no hay nada de nada', () => {
    const r = clasificarDependencias([]);
    expect(r).toEqual({ aristas: [], terceros: [], huerfanas: [], problemas: [] });
  });
});

// ─── D-1 · el tipo sale del Grafo ─────────────────────────────────────────────────────
//
// La hoja Dependencias no trae la columna del enum `TipoDependencia`. La decisión D-1
// (cerrada) lo deriva de «Grafo (aristas)» cruzando cada par: `usa`→USA, `alojado
// en`→SE_ALOJA_EN, `depende de`→USA por defecto.
describe('tipoDeDependencia', () => {
  it.each([
    ['usa', 'USA'],
    ['alojado en', 'SE_ALOJA_EN'],
    ['depende de', 'USA'],
  ])('«%s» → %s', (relacion, esperado) => {
    expect(tipoDeDependencia(relacion)).toBe(esperado);
  });

  it('no distingue mayúsculas ni acentos', () => {
    expect(tipoDeDependencia('ALOJADO EN')).toBe('SE_ALOJA_EN');
  });

  // Sin arista en el grafo que cruce ese par, USA es el defecto declarado por D-1. No es
  // una suposición del código: es la decisión, escrita.
  it('sin relación conocida cae en USA, que es el defecto de D-1', () => {
    expect(tipoDeDependencia('')).toBe('USA');
    expect(tipoDeDependencia('contiene')).toBe('USA');
  });

  // AUTENTICA_CON y ALMACENA_EN no aparecen en el libro: se refinan a mano en la app. Que
  // el importador no los invente es parte de la decisión.
  it('nunca inventa AUTENTICA_CON ni ALMACENA_EN', () => {
    for (const r of ['autentica', 'almacena', 'se autentica con', 'guarda en']) {
      expect(['USA', 'SE_ALOJA_EN']).toContain(tipoDeDependencia(r));
    }
  });
});

// ─── D-1 · el cruce contra «Grafo (aristas)» ──────────────────────────────────────────
//
// La hoja Dependencias no trae el enum; «Grafo (aristas)» sí lo tiene derivado. D-1 (cerrada)
// manda cruzar cada par (Activo Base → relacionado) contra su arista del grafo.
//
// **La cabecera de esa hoja está en la FILA 3, no en la 1.** Las dos primeras son un título
// y una nota. Leerla desde la 1 devolvería «Aristas del grafo» como nombre de columna y el
// cruce daría vacío para las 40 aristas — sin fallar, que es lo peor: todas caerían en el
// USA por defecto y nadie notaría que el tipo nunca se derivó.

import { tiposDelGrafo } from '../consolidado';

const aristaGrafo = (origen: string, relacion: string, destino: string) => ({
  origen,
  relacion,
  destino,
});

describe('tiposDelGrafo', () => {
  const GRAFO = [
    aristaGrafo('TEC-SER-0033', 'usa', 'TEC-SER-0053'),
    aristaGrafo('TEC-APP-0004', 'alojado en', 'TEC-SER-0012'),
    aristaGrafo('TEC-SER-0043', 'depende de', 'TEC-SER-0053'),
  ];

  it('cruza el par y devuelve el tipo del enum', () => {
    const tipos = tiposDelGrafo(GRAFO);
    expect(tipos.get('TEC-SER-0033\u0000TEC-SER-0053')).toBe('USA');
    expect(tipos.get('TEC-APP-0004\u0000TEC-SER-0012')).toBe('SE_ALOJA_EN');
    expect(tipos.get('TEC-SER-0043\u0000TEC-SER-0053')).toBe('USA');
  });

  // El grafo modela 585 nodos contra 299 activos: `RAIZ`, `G:` grupo, `C:` camino y los
  // terceros. Sólo los pares activo→activo pueden ser una `DependenciaActivo`.
  it('ignora los nodos que no son activos', () => {
    const tipos = tiposDelGrafo([
      aristaGrafo('RAIZ', 'contiene', 'G:CUANTICO'),
      aristaGrafo('G:CUANTICO', 'contiene', 'R:CUANTICO/Arquitectura'),
      aristaGrafo('C:CUANTICO/Arquitectura/Código fuente', 'contiene', 'TEC-GEN-0012'),
    ]);
    expect(tipos.size).toBe(0);
  });

  it('la dirección importa: A→B no dice nada de B→A', () => {
    const tipos = tiposDelGrafo([aristaGrafo('TEC-APP-0004', 'alojado en', 'TEC-SER-0012')]);
    expect(tipos.has('TEC-SER-0012\u0000TEC-APP-0004')).toBe(false);
  });

  it('sin aristas el cruce queda vacío, y el defecto de D-1 se encarga', () => {
    expect(tiposDelGrafo([]).size).toBe(0);
  });
});
