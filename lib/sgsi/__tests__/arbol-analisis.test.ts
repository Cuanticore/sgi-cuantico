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

import {
  agruparRiesgos,
  armarFilasArbol,
  esFilaDeRiesgo,
  type RiesgoDeArbol,
} from '../arbol-analisis';
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
  conductor: 'valor',
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
    // Con los dos grupos, entre el padre y sus hijos va la cabecera. Lo que la prueba vigila
    // sigue siendo lo mismo: NADA de otro activo se cuela en medio de esta tanda.
    const r = armarFilasArbol([activo('A-1'), activo('A-2')], MAPA, new Set(['A-1']));
    expect(
      r.map((f) =>
        f.tipo === 'activo' ? f.codigo : f.tipo === 'grupo' ? `  [${f.grupo}]` : `    ${f.amenazaCodigo}`,
      ),
    ).toEqual(['A-1', '  [alarmantes]', '    E.1', '    I.5', 'A-2']);
  });

  it('cada hijo nombra a su padre, para que un huérfano se vea en el dato', () => {
    const r = armarFilasArbol([activo('A-1')], MAPA, new Set(['A-1']));
    const hijos = r.filter((f) => f.tipo === 'riesgo');
    expect(hijos.every((h) => h.tipo === 'riesgo' && h.padre === 'A-1')).toBe(true);
  });

  it('expandir dos activos no mezcla sus hijos', () => {
    const r = armarFilasArbol([activo('A-1'), activo('A-2')], MAPA, new Set(['A-1', 'A-2']));
    // activo A-1, su cabecera, sus dos riesgos, y A-2 sin nada detrás.
    expect(r.map((f) => (f.tipo === 'activo' ? f.codigo : f.padre))).toEqual([
      'A-1',
      'A-1',
      'A-1',
      'A-1',
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
    // activo + cabecera + el único riesgo vivo. El obsoleto no aparece ni se cuenta.
    expect(r).toHaveLength(3);
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
    // La cabecera TAMBIÉN va de ancho completo: no tiene columnas propias que llenar.
    expect(esFilaDeRiesgo(r[1])).toBe(true);
    expect(esFilaDeRiesgo(r[2])).toBe(true);
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
    const hijo = r[2]; // r[1] es la cabecera del grupo
    expect(hijo.tipo === 'riesgo' && hijo.principal?.codigo).toBe('A.8.2');
    expect(hijo.tipo === 'riesgo' && hijo.brecha.tipo).toBe('cubierto');
  });
});


// ── LOS DOS GRUPOS ─────────────────────────────────────────────────────────────────────
//
// Expandir un activo mostraba sus 23 amenazas. Veintitrés renglones no son una respuesta: son
// la misma lista que la pantalla ya tenía, sólo que abierta. Las dos preguntas que traen a
// alguien a expandir un activo son distintas y se responden con subconjuntos distintos:
//
//   1. ¿Qué riesgo me queda alto? -> residual en banda Alto o Crítico.
//   2. ¿Qué me falta por continuidad? -> brecha cuya EXIGENCIA la manda la criticidad.
//
// La segunda no es «brecha» a secas. `CriticidadNegocio` lleva RTO y RPO: es la clasificación
// de continuidad, y sólo manda sobre la dimensión Disponibilidad. Una brecha que venga del
// VALOR de Integridad o Confidencialidad no es del plan de continuidad, aunque sea una brecha.
//
// SON EXCLUYENTES, Y LA ALARMANTE GANA. Una amenaza puede cumplir las dos; repetirla haría
// dudar de si son dos amenazas. Se lista arriba, donde el riesgo que queda manda sobre el
// motivo por el que quedó.

describe('agruparRiesgos', () => {
  const alarmante = (c: string): RiesgoDeArbol => ({
    amenazaCodigo: c,
    amenazaNombre: `Amenaza ${c}`,
    residual: '6.48',
    obsoleto: false,
    principal: { codigo: 'A.8.2', nivel: 70 },
    brecha: { tipo: 'cubierto', exigido: 70, actual: 70 },
    conductor: 'valor',
  });
  const porContinuidad = (c: string): RiesgoDeArbol => ({
    ...alarmante(c),
    residual: '0.50',
    brecha: { tipo: 'brecha', exigido: 80, actual: 70, brecha: 10 },
    conductor: 'criticidad',
  });
  const ninguno = (c: string): RiesgoDeArbol => ({
    ...alarmante(c),
    residual: '0.50',
    brecha: { tipo: 'cubierto', exigido: 70, actual: 70 },
    conductor: 'valor',
  });

  it('separa las alarmantes de las de continuidad', () => {
    const g = agruparRiesgos([alarmante('I.5'), porContinuidad('E.1'), ninguno('A.7')]);
    expect(g.alarmantes.map((r) => r.amenazaCodigo)).toEqual(['I.5']);
    expect(g.continuidad.map((r) => r.amenazaCodigo)).toEqual(['E.1']);
  });

  it('lo que no cae en ningún grupo no se muestra', () => {
    // Es el punto del cambio: 23 renglones no son una respuesta.
    const g = agruparRiesgos([ninguno('A.7'), ninguno('A.8')]);
    expect(g.alarmantes).toHaveLength(0);
    expect(g.continuidad).toHaveLength(0);
  });

  it('una amenaza que cumple las dos va arriba y NO se repite', () => {
    const doble: RiesgoDeArbol = {
      ...alarmante('X.1'),
      brecha: { tipo: 'brecha', exigido: 80, actual: 70, brecha: 10 },
      conductor: 'criticidad',
    };
    const g = agruparRiesgos([doble]);
    expect(g.alarmantes.map((r) => r.amenazaCodigo)).toEqual(['X.1']);
    expect(g.continuidad).toHaveLength(0);
  });

  it('una brecha que viene del VALOR no es del plan de continuidad', () => {
    // El caso de control: misma brecha, distinto conductor. Sin esto, el segundo grupo seria
    // «brecha» a secas y el titulo mentiria.
    const porValor: RiesgoDeArbol = {
      ...alarmante('V.1'),
      residual: '0.50',
      brecha: { tipo: 'brecha', exigido: 70, actual: 60, brecha: 10 },
      conductor: 'valor',
    };
    const g = agruparRiesgos([porValor]);
    expect(g.continuidad).toHaveLength(0);
  });

  it('«ambos» tambien cuenta: la criticidad manda, aunque el valor coincida', () => {
    const g = agruparRiesgos([{ ...porContinuidad('E.9'), conductor: 'ambos' }]);
    expect(g.continuidad.map((r) => r.amenazaCodigo)).toEqual(['E.9']);
  });

  it('los obsoletos no entran a ningun grupo', () => {
    const g = agruparRiesgos([{ ...alarmante('OBS'), obsoleto: true }]);
    expect(g.alarmantes).toHaveLength(0);
  });
});


describe('armarFilasArbol, con los dos grupos', () => {
  const r = (codigo: string, residual: string, conductor: 'criticidad' | 'valor'): RiesgoDeArbol => ({
    amenazaCodigo: codigo,
    amenazaNombre: `Amenaza ${codigo}`,
    residual,
    obsoleto: false,
    principal: { codigo: 'A.8.2', nivel: 70 },
    brecha:
      conductor === 'criticidad'
        ? { tipo: 'brecha', exigido: 80, actual: 70, brecha: 10 }
        : { tipo: 'cubierto', exigido: 70, actual: 70 },
    conductor,
  });

  const MAPA2 = new Map<string, RiesgoDeArbol[]>([
    ['A-1', [r('I.5', '6.48', 'valor'), r('E.1', '0.50', 'criticidad'), r('A.7', '0.10', 'valor')]],
  ]);

  it('cada grupo lleva su cabecera, y sólo si tiene contenido', () => {
    const f = armarFilasArbol([activo('A-1')], MAPA2, new Set(['A-1']));
    expect(f.map((x) => x.tipo)).toEqual(['activo', 'grupo', 'riesgo', 'grupo', 'riesgo']);
  });

  it('la cabecera dice cuál es y cuántos trae', () => {
    const f = armarFilasArbol([activo('A-1')], MAPA2, new Set(['A-1']));
    const cabeceras = f.filter((x) => x.tipo === 'grupo');
    expect(cabeceras.map((c) => c.tipo === 'grupo' && [c.grupo, c.cuantos])).toEqual([
      ['alarmantes', 1],
      ['continuidad', 1],
    ]);
  });

  it('un grupo vacío no deja una cabecera colgando', () => {
    // El control: con sólo amenazas tranquilas no debe aparecer ninguna cabecera, ni una que
    // diga «0». Una cabecera sin filas se lee como un error de carga.
    const mapa = new Map<string, RiesgoDeArbol[]>([['A-1', [r('A.7', '0.10', 'valor')]]]);
    const f = armarFilasArbol([activo('A-1')], mapa, new Set(['A-1']));
    expect(f.map((x) => x.tipo)).toEqual(['activo']);
  });

  it('el contador del activo cuenta lo que se mostraría, no sus 23 amenazas', () => {
    const f = armarFilasArbol([activo('A-1')], MAPA2, new Set());
    expect(f[0].tipo === 'activo' && f[0].hijos).toBe(2);
  });
});
