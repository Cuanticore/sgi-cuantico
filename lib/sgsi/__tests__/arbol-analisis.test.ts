// lib/sgsi/__tests__/arbol-analisis.test.ts
//
// Qué filas existen cuando la grilla de análisis se expande, y de quién cuelga cada una.
//
// LO QUE ESTE MÓDULO VIGILA, Y NO ES EL RENDERIZADO. AG Grid **no sabe** que estas filas son
// hijas de nadie: lo único que sostiene la relación es que el hijo viene inmediatamente detrás
// de su padre en la lista. Esa propiedad es frágil por construcción —basta que algo reordene la
// lista para que un riesgo quede bajo un activo que no es el suyo— y por eso se prueba acá,
// donde se puede afirmar sin montar un navegador.
//
// El árbol se construye a mano porque Row Grouping y Tree Data son de AG Grid Enterprise
// (999 USD por desarrollador) y el proyecto usa Community. Ver el diseño en
// `docs/superpowers/specs/2026-09-28-arbol-de-riesgos-por-activo-design.md`.

import { armarFilasArbol, esFilaDeRiesgo, type RiesgoDeArbol } from '../arbol-analisis';
import type { FilaAnalisis } from '../analisis-riesgos';

const activo = (codigo: string): FilaAnalisis =>
  ({
    codigo,
    nombre: `Activo ${codigo}`,
    valor: 4,
    valores: { D: 4, I: 3, C: 3 },
    criticidad: 'C4',
    proceso: 'Gestión Tecnológica',
    propietario: 'COO',
    cantidadAmenazas: 2,
    peorInherente: null,
    peorResidual: null,
    estadoPlan: 'no-requiere',
  }) as unknown as FilaAnalisis;

const riesgo = (amenazaCodigo: string, residual: string | null, obsoleto = false): RiesgoDeArbol => ({
  amenazaCodigo,
  amenazaNombre: `Amenaza ${amenazaCodigo}`,
  residual,
  obsoleto,
  principal: { codigo: 'A.8.2', nivel: 70 },
  brecha: { tipo: 'cubierto', exigido: 70, actual: 70 },
});

const MAPA = new Map<string, RiesgoDeArbol[]>([
  ['A-1', [riesgo('E.1', '5.50'), riesgo('I.5', '6.48')]],
  ['A-2', [riesgo('A.30', '2.10')]],
]);

describe('armarFilasArbol', () => {
  it('sin nada expandido devuelve una fila por activo y ninguna más', () => {
    const r = armarFilasArbol([activo('A-1'), activo('A-2')], MAPA, new Set());
    expect(r).toHaveLength(2);
    expect(r.every((f) => f.tipo === 'activo')).toBe(true);
  });

  it('el activo dice cuántos hijos tendría ANTES de abrirlo', () => {
    const [a1] = armarFilasArbol([activo('A-1')], MAPA, new Set());
    expect(a1.tipo === 'activo' && a1.hijos).toBe(2);
  });

  it('al expandir, los hijos van INMEDIATAMENTE detrás de su padre', () => {
    // Es la propiedad que sostiene todo el árbol: AG Grid no conoce la jerarquía, sólo el
    // orden. Si un hijo se separa de su padre, la pantalla miente sin que nada falle.
    const r = armarFilasArbol([activo('A-1'), activo('A-2')], MAPA, new Set(['A-1']));
    expect(r.map((f) => (f.tipo === 'activo' ? f.codigo : `  ${f.amenazaCodigo}`))).toEqual([
      'A-1',
      '  E.1',
      '  I.5',
      'A-2',
    ]);
  });

  it('cada hijo nombra a su padre, para que un huérfano se vea en el dato', () => {
    const r = armarFilasArbol([activo('A-1')], MAPA, new Set(['A-1']));
    const hijos = r.filter((f) => f.tipo === 'riesgo');
    expect(hijos.every((h) => h.tipo === 'riesgo' && h.padre === 'A-1')).toBe(true);
  });

  it('expandir dos activos no mezcla sus hijos', () => {
    const r = armarFilasArbol([activo('A-1'), activo('A-2')], MAPA, new Set(['A-1', 'A-2']));
    expect(r.map((f) => (f.tipo === 'activo' ? f.codigo : f.padre))).toEqual([
      'A-1',
      'A-1',
      'A-1',
      'A-2',
      'A-2',
    ]);
  });

  it('los riesgos obsoletos no cuelgan ni se cuentan', () => {
    // Mismo criterio que el resto de la pantalla: un riesgo obsoleto inflaría «Amenazas» y
    // podría subir una banda por algo que ya no aplica.
    const mapa = new Map<string, RiesgoDeArbol[]>([
      ['A-1', [riesgo('E.1', '5.50'), riesgo('OBS', '9.99', true)]],
    ]);
    const r = armarFilasArbol([activo('A-1')], mapa, new Set(['A-1']));
    expect(r).toHaveLength(2);
    expect(r[0].tipo === 'activo' && r[0].hijos).toBe(1);
  });

  it('un activo sin riesgos registrados se expande sin romperse', () => {
    const r = armarFilasArbol([activo('A-9')], MAPA, new Set(['A-9']));
    expect(r).toHaveLength(1);
    expect(r[0].tipo === 'activo' && r[0].hijos).toBe(0);
  });
});

describe('esFilaDeRiesgo', () => {
  it('distingue la franja del activo', () => {
    const r = armarFilasArbol([activo('A-1')], MAPA, new Set(['A-1']));
    expect(esFilaDeRiesgo(r[0])).toBe(false);
    expect(esFilaDeRiesgo(r[1])).toBe(true);
  });

  it('una fila que no existe no es una franja', () => {
    // `isFullWidthRow` recibe `data` sin garantía: durante la virtualización llega `undefined`.
    expect(esFilaDeRiesgo(undefined)).toBe(false);
  });
});

describe('el hijo lleva lo que la pantalla no muestra en ningún otro sitio', () => {
  it('propaga el control principal y la brecha ya evaluada', () => {
    // Es el punto del árbol: la brecha no se ve hoy en ninguna pantalla, y recalcularla en el
    // componente seria la segunda cuenta que separa las dos vistas.
    const r = armarFilasArbol([activo('A-1')], MAPA, new Set(['A-1']));
    const hijo = r[1];
    expect(hijo.tipo === 'riesgo' && hijo.principal?.codigo).toBe('A.8.2');
    expect(hijo.tipo === 'riesgo' && hijo.brecha.tipo).toBe('cubierto');
  });
});
