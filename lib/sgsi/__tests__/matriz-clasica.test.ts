// lib/sgsi/__tests__/matriz-clasica.test.ts
//
// Lo que se prueba acá es dónde cae un riesgo y qué se hace con el que no cae en ningún
// lado. Esas dos cosas son las que deciden si la matriz del informe dice lo mismo que la de
// la pantalla, y si la suma de las casillas cuadra con el inventario.

import {
  columnaDeFrecuencia,
  columnasDeEscala,
  contarMatriz,
  filasDeUmbrales,
  ubicarRiesgo,
  type ColumnaFrecuencia,
  type FilaImpacto,
} from '../matriz-clasica';

/// La escala real: geométrica, cinco puntos por década.
const COLUMNAS: ColumnaFrecuencia[] = columnasDeEscala([
  { nombre: 'Muy baja — excepcional', vecesAno: 0.01 },
  { nombre: 'Baja — cada varios años', vecesAno: 0.1 },
  { nombre: 'Media — una vez al año', vecesAno: 1 },
  { nombre: 'Alta — cada mes', vecesAno: 10 },
  { nombre: 'Muy alta — a diario', vecesAno: 100 },
]);

/// Cinco bandas de impacto, de la peor a la mejor, como las entrega `umbral_impacto`.
const FILAS: FilaImpacto[] = filasDeUmbrales([
  { nombre: 'Muy alto', desde: 4.5, hasta: 5 },
  { nombre: 'Alto', desde: 3.5, hasta: 4 },
  { nombre: 'Medio', desde: 2, hasta: 2.5 },
  { nombre: 'Bajo', desde: 0.5, hasta: 1.5 },
  { nombre: 'Muy bajo', desde: 0, hasta: 0.5 },
]);

const BANDAS_RIESGO = [
  { nombre: 'Crítico', desde: 50, hasta: 1e9 },
  { nombre: 'Alto', desde: 10, hasta: 50 },
  { nombre: 'Medio', desde: 1, hasta: 10 },
  { nombre: 'Bajo', desde: 0, hasta: 1 },
];

describe('columnaDeFrecuencia', () => {
  it('un ARO exacto cae en su propia columna', () => {
    // Los inherentes siempre son así: salen de un punto de la escala.
    expect(columnaDeFrecuencia(0.01, COLUMNAS)).toBe(0);
    expect(columnaDeFrecuencia(1, COLUMNAS)).toBe(2);
    expect(columnaDeFrecuencia(100, COLUMNAS)).toBe(4);
  });

  it('mide en décadas, no en distancia lisa: 5,5 cae en «cada mes» y no en «una vez al año»', () => {
    // El caso que motiva la desviación del prototipo. En distancia lisa hay un empate exacto
    // —|5,5−1| = |5,5−10| = 4,5—; en décadas, 5,5 está a factor 1,8 de 10 y a factor 5,5 de
    // 1, así que la respuesta correcta no es ambigua.
    expect(columnaDeFrecuencia(5.5, COLUMNAS)).toBe(3);
  });

  it('un residual muy reducido baja de columna en vez de quedarse donde estaba', () => {
    // Un control eficaz que lleva 10/año a 0,08/año tiene que MOVER el riesgo en la matriz;
    // si no, la residual sale igual a la inherente y el informe no dice nada.
    expect(columnaDeFrecuencia(0.08, COLUMNAS)).toBe(1);
  });

  it('eficacia del 100 % — ARO cero — cae en la primera columna y no revienta', () => {
    // `Math.log10(0)` es −Infinity. Sin el guardia, la comparación con Infinity elegiría
    // una columna arbitraria o devolvería NaN.
    expect(columnaDeFrecuencia(0, COLUMNAS)).toBe(0);
    expect(columnaDeFrecuencia(-1, COLUMNAS)).toBe(0);
  });

  it('sin columnas no inventa una', () => {
    expect(columnaDeFrecuencia(1, [])).toBe(-1);
  });
});

describe('ubicarRiesgo', () => {
  it('cruza la banda de impacto con la frecuencia', () => {
    expect(ubicarRiesgo({ impacto: 4.8, aro: 1, aroResidual: 0.1 }, FILAS, COLUMNAS)).toEqual({
      i: 0,
      inherente: 2,
      residual: 1,
    });
  });

  it('un residual sin calcular deja la columna residual en −1, NO en cero', () => {
    // La distinción que sostiene toda la matriz residual: eficacia desconocida no es
    // frecuencia cero. Meterlo en la columna 0 dibujaría un riesgo tratado que nadie trató.
    const u = ubicarRiesgo({ impacto: 4.8, aro: 10, aroResidual: null }, FILAS, COLUMNAS);
    expect(u.residual).toBe(-1);
    expect(u.inherente).toBe(3);
  });

  it('un impacto que no clasifica en ninguna banda queda sin fila', () => {
    // 3,2 cae en el hueco entre «Medio» (hasta 2,5) y «Alto» (desde 3,5). Los umbrales del
    // libro tienen huecos, y un riesgo ahí no puede aterrizar en la banda más baja por
    // descarte: se cuenta aparte.
    expect(ubicarRiesgo({ impacto: 3.2, aro: 1, aroResidual: 1 }, FILAS, COLUMNAS).i).toBe(-1);
  });
});

describe('contarMatriz', () => {
  const ubicaciones = [
    { i: 0, inherente: 2, residual: 1 },
    { i: 0, inherente: 2, residual: 1 },
    { i: 1, inherente: 4, residual: -1 },
    { i: -1, inherente: 0, residual: 0 },
  ];

  it('cuenta las casillas de la inherente', () => {
    const m = contarMatriz(ubicaciones, 'inherente', FILAS, COLUMNAS, BANDAS_RIESGO);
    expect(m.conteos[0][2]).toBe(2);
    expect(m.conteos[1][4]).toBe(1);
    expect(m.total).toBe(3);
  });

  it('el que no tiene impacto se cuenta aparte y no se pierde', () => {
    const m = contarMatriz(ubicaciones, 'inherente', FILAS, COLUMNAS, BANDAS_RIESGO);
    // Cuatro entraron; tres se ubicaron y uno se informa. La suma tiene que cuadrar, o el
    // informe pierde riesgos sin que nadie lo note.
    expect(m.total + m.sinImpacto + m.sinResidual).toBe(ubicaciones.length);
    expect(m.sinImpacto).toBe(1);
  });

  it('en la residual, el que no tiene residual calculado se informa y no se ubica', () => {
    const m = contarMatriz(ubicaciones, 'residual', FILAS, COLUMNAS, BANDAS_RIESGO);
    expect(m.sinResidual).toBe(1);
    expect(m.total).toBe(2);
    expect(m.total + m.sinImpacto + m.sinResidual).toBe(ubicaciones.length);
  });

  it('la banda es de la CASILLA, no de lo que cayó adentro: una casilla vacía sigue siendo crítica', () => {
    const m = contarMatriz([], 'inherente', FILAS, COLUMNAS, BANDAS_RIESGO);
    // Muy alto (medio 4,75) × a diario (100) = 475 → Crítico, con cero riesgos adentro.
    expect(m.conteos[0][4]).toBe(0);
    expect(m.bandas[0][4]).toBe('Crítico');
    // Muy bajo (medio 0,25) × excepcional (0,01) = 0,0025 → Bajo.
    expect(m.bandas[4][0]).toBe('Bajo');
  });

  it('la matriz tiene el tamaño de los ejes aunque no entre ningún riesgo', () => {
    const m = contarMatriz([], 'inherente', FILAS, COLUMNAS, BANDAS_RIESGO);
    expect(m.conteos).toHaveLength(FILAS.length);
    expect(m.conteos[0]).toHaveLength(COLUMNAS.length);
  });
});

describe('los ejes salen del catálogo', () => {
  it('el medio de la banda se deriva, no se escribe', () => {
    // Reproduce el IMP_MID = [4.75, 3.75, 2.25, 1.0, 0.25] del prototipo desde los umbrales.
    expect(FILAS.map((f) => f.medio)).toEqual([4.75, 3.75, 2.25, 1.0, 0.25]);
  });

  it('el encabezado se queda con el grado y la lectura completa viaja aparte', () => {
    expect(COLUMNAS[4].nombre).toBe('Muy alta');
    expect(COLUMNAS[4].lectura).toBe('Muy alta — a diario');
  });
});
