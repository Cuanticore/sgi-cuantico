// lib/sgsi/__tests__/matriz-clasica.test.ts
//
// Lo que se prueba acá es dónde cae un riesgo y qué se hace con el que no cae en ningún
// lado. Esas dos cosas son las que deciden si la matriz del informe dice lo mismo que la de
// la pantalla, y si la suma de las casillas cuadra con el inventario.

import {
  columnaDeFrecuencia,
  matrizDeActivos,
  columnasDeEscala,
  contarMatriz,
  filasDeUmbrales,
  repartirPorBanda,
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
      // El valor REAL del riesgo viaja con la ubicación: es lo que permite que una casilla
      // ocupada se pinte con lo que contiene y no con su punto representativo.
      valorInherente: 4.8,
      valorResidual: 0.48,
      activoCodigo: undefined,
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
    { i: 0, inherente: 2, residual: 1, valorInherente: 4.75, valorResidual: 0.47 },
    { i: 0, inherente: 2, residual: 1, valorInherente: 4.75, valorResidual: 0.47 },
    { i: 1, inherente: 4, residual: -1, valorInherente: 375, valorResidual: null },
    { i: -1, inherente: 0, residual: 0, valorInherente: 0, valorResidual: 0 },
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

  // ── La regla que cambió, y por qué ───────────────────────────────────────────────────
  //
  // El punto representativo de una casilla usa la frecuencia NOMINAL de su columna. En la
  // inherente eso es exacto —el ARO cae sobre un punto de la escala—, pero el ARO residual es
  // continuo y `columnaDeFrecuencia` lo ajusta a la columna más cercana: la casilla pierde el
  // factor. Medido sobre el registro real, 226 de 584 riesgos quedaban pintados MENOS graves
  // de lo que son, incluido un residual de 13,00 en una casilla pintada Medio.
  describe('una casilla ocupada se pinta con lo que contiene', () => {
    it('el color sale del PEOR riesgo de la casilla, no de su punto representativo', () => {
      // Muy alto (medio 4,75) × una vez al año = 4,75 → la zona dice Medio.
      // Adentro cae un riesgo de 13,00, que es Alto. La casilla tiene que decir Alto.
      const m = contarMatriz(
        [{ i: 0, inherente: 2, residual: 2, valorInherente: 13, valorResidual: 13 }],
        'residual',
        FILAS,
        COLUMNAS,
        BANDAS_RIESGO,
      );
      expect(m.bandasZona[0][2]).toBe('Medio');
      expect(m.bandas[0][2]).toBe('Alto');
    });

    it('la casilla VACÍA conserva la banda de su zona', () => {
      const m = contarMatriz([], 'residual', FILAS, COLUMNAS, BANDAS_RIESGO);
      expect(m.conteos[0][4]).toBe(0);
      expect(m.bandas[0][4]).toBe(m.bandasZona[0][4]);
      expect(m.bandas[0][4]).toBe('Crítico');
    });

    it('manda el peor, no el último ni el promedio', () => {
      const m = contarMatriz(
        [
          { i: 0, inherente: 2, residual: 2, valorInherente: 13, valorResidual: 13 },
          { i: 0, inherente: 2, residual: 2, valorInherente: 1, valorResidual: 1 },
        ],
        'residual',
        FILAS,
        COLUMNAS,
        BANDAS_RIESGO,
      );
      expect(m.conteos[0][2]).toBe(2);
      expect(m.bandas[0][2]).toBe('Alto');
    });
  });

  it('la banda de ZONA es de la casilla, no de lo que cayó adentro: una casilla vacía sigue siendo crítica', () => {
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

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('matrizDeActivos', () => {
  // Cuatro riesgos sobre dos activos. Cada activo entra UNA vez, en la casilla de su peor
  // riesgo — la misma regla de agregación del inventario y de la página de análisis.
  const u = (
    activoCodigo: string,
    i: number,
    j: number,
    valor: number,
  ) => ({ i, inherente: j, residual: j, valorInherente: valor, valorResidual: valor, activoCodigo });

  const UBIS = [
    u('TEC-GEN-0004', 0, 2, 13), // el peor de este activo
    u('TEC-GEN-0004', 2, 1, 0.4),
    u('COM-APP-0001', 1, 2, 3),
    u('COM-APP-0001', 3, 0, 0.01),
  ];

  it('cada activo aparece una sola vez, en la casilla de su peor riesgo', () => {
    const m = matrizDeActivos(UBIS, 'residual', FILAS, COLUMNAS, BANDAS_RIESGO);
    expect(m.total).toBe(2);
    expect(m.conteos[0][2]).toBe(1);
    expect(m.conteos[1][2]).toBe(1);
    // El riesgo menor del mismo activo NO agrega una segunda marca.
    expect(m.conteos[2][1]).toBe(0);
    expect(m.conteos[3][0]).toBe(0);
  });

  it('la casilla lleva los códigos, para que se lea sin cruzar otra tabla', () => {
    const m = matrizDeActivos(UBIS, 'residual', FILAS, COLUMNAS, BANDAS_RIESGO);
    expect(m.codigos[0][2]).toEqual(['TEC-GEN-0004']);
    expect(m.codigos[1][2]).toEqual(['COM-APP-0001']);
  });

  it('un activo cuyo residual no está calculado se informa, no se ubica en la banda más baja', () => {
    const sinResidual = [
      { i: 0, inherente: 2, residual: -1, valorInherente: 13, valorResidual: null, activoCodigo: 'X-1' },
    ];
    const m = matrizDeActivos(sinResidual, 'residual', FILAS, COLUMNAS, BANDAS_RIESGO);
    expect(m.ubicados).toBe(0);
    expect(m.sinUbicar).toBe(1);
    // Se presenta igual: sale de la rejilla, no de la cuenta.
    expect(m.total).toBe(1);
    // En la inherente el mismo activo sí se ubica.
    expect(
      matrizDeActivos(sinResidual, 'inherente', FILAS, COLUMNAS, BANDAS_RIESGO).ubicados,
    ).toBe(1);
  });

  it('la casilla ocupada se pinta con su peor activo; la vacía, con su zona', () => {
    const m = matrizDeActivos(UBIS, 'residual', FILAS, COLUMNAS, BANDAS_RIESGO);
    expect(m.bandasZona[0][2]).toBe('Medio');
    expect(m.bandas[0][2]).toBe('Alto');
    expect(m.bandas[0][4]).toBe(m.bandasZona[0][4]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('repartirPorBanda', () => {
  // La lista de «riesgos por nivel» que acompaña a cada matriz. Se cuenta por el valor
  // PROPIO de cada riesgo y no por el color de la casilla que lo contiene: una casilla
  // pintada Alto porque adentro hay un riesgo Alto no convierte en altos a los otros veinte
  // riesgos medios que comparten esa casilla. Es la misma cuenta que hace la página de
  // análisis, y es la que un comité compara contra el informe.
  const UBIS = [
    { i: 0, inherente: 2, residual: 2, valorInherente: 60, valorResidual: 13 },
    { i: 0, inherente: 2, residual: 2, valorInherente: 40, valorResidual: 2 },
    { i: 1, inherente: 3, residual: 1, valorInherente: 30, valorResidual: 0.4 },
    { i: 2, inherente: 1, residual: -1, valorInherente: 5, valorResidual: null },
    { i: -1, inherente: 0, residual: 0, valorInherente: 0.2, valorResidual: 0.2 },
  ];

  it('cuenta cada riesgo por su propio valor, no por el color de su casilla', () => {
    const r = repartirPorBanda(UBIS, 'residual', BANDAS_RIESGO);
    // Los dos primeros comparten casilla; uno es Alto y el otro Medio, y así se cuentan.
    expect(r).toEqual([
      { nombre: 'Crítico', n: 0 },
      { nombre: 'Alto', n: 1 },
      { nombre: 'Medio', n: 1 },
      { nombre: 'Bajo', n: 1 },
    ]);
  });

  it('en la inherente reparte sobre los mismos riesgos que dibuja la matriz', () => {
    const r = repartirPorBanda(UBIS, 'inherente', BANDAS_RIESGO);
    expect(r.map((b) => b.n)).toEqual([1, 2, 1, 0]);
  });

  // La invariante que hace que el pie de la matriz no pueda contradecir a la matriz: la
  // suma del reparto es exactamente el total que entró en la rejilla.
  it('la suma del reparto es el total de la matriz, en las dos caras', () => {
    for (const cara of ['inherente', 'residual'] as const) {
      const m = contarMatriz(UBIS, cara, FILAS, COLUMNAS, BANDAS_RIESGO);
      const suma = repartirPorBanda(UBIS, cara, BANDAS_RIESGO).reduce((a, b) => a + b.n, 0);
      expect(suma).toBe(m.total);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('matrizDeActivos · qué riesgo ubicó a cada activo', () => {
  // La casilla se abre para ver los activos que contiene, y lo primero que hay que poder
  // responder ahí es POR QUÉ está cada uno. La respuesta es el riesgo que lo ubicó: su peor
  // riesgo. Si la matriz sólo devolviera los códigos, quien dibuja la pantalla tendría que
  // volver a buscar ese máximo por su cuenta — y esa segunda cuenta es justamente la que
  // termina discrepando de la primera.
  const u = (activoCodigo: string, i: number, j: number, valor: number) => ({
    i,
    inherente: j,
    residual: j,
    valorInherente: valor,
    valorResidual: valor,
    activoCodigo,
  });

  const UBIS = [
    u('TEC-GEN-0004', 2, 1, 0.4),
    u('COM-APP-0001', 1, 2, 3),
    u('TEC-GEN-0004', 0, 2, 13), // el peor de este activo: posición 2
    u('COM-APP-0001', 3, 0, 0.01),
  ];

  it('cada casilla lleva la posición de la ubicación que puso ahí a cada activo', () => {
    const m = matrizDeActivos(UBIS, 'residual', FILAS, COLUMNAS, BANDAS_RIESGO);
    expect(m.indices[0][2]).toEqual([2]);
    expect(m.indices[1][2]).toEqual([1]);
    expect(m.indices[2][1]).toEqual([]);
  });

  it('los índices van en el mismo orden que los códigos, para poder leerlos en paralelo', () => {
    // Dos activos en la misma casilla: los códigos se ordenan alfabéticamente y los índices
    // tienen que seguirlos, o la pantalla le atribuye a un activo el riesgo de otro.
    const juntos = [u('ZZZ-0001', 0, 2, 20), u('AAA-0001', 0, 2, 30)];
    const m = matrizDeActivos(juntos, 'residual', FILAS, COLUMNAS, BANDAS_RIESGO);
    expect(m.codigos[0][2]).toEqual(['AAA-0001', 'ZZZ-0001']);
    expect(m.indices[0][2]).toEqual([1, 0]);
  });
});

describe('matrizDeActivos · reparto por banda', () => {
  // Cuántos ACTIVOS quedan en cada nivel, por el valor de su peor riesgo. Es la cifra que
  // pide un comité —«cuántos activos me quedan en Alto»— y la misma que produce la página de
  // análisis, que toma el nivel de un activo como el de su riesgo más alto. Viaja dentro de
  // la matriz porque sale del mismo máximo por activo: calcularla aparte sería recorrer otra
  // vez el mismo dato con otra regla de desempate.
  const u = (activoCodigo: string, i: number, j: number, valor: number) => ({
    i,
    inherente: j,
    residual: j,
    valorInherente: valor,
    valorResidual: valor,
    activoCodigo,
  });

  it('cuenta activos, no riesgos: un activo con veinte riesgos medios pesa uno', () => {
    const m = matrizDeActivos(
      [
        u('A-1', 0, 2, 13), // Alto
        u('A-1', 1, 2, 3),
        u('A-1', 1, 2, 3),
        u('B-2', 1, 2, 3), // Medio
        u('C-3', 3, 0, 0.01), // Bajo
      ],
      'residual',
      FILAS,
      COLUMNAS,
      BANDAS_RIESGO,
    );
    expect(m.reparto).toEqual([
      { nombre: 'Crítico', n: 0 },
      { nombre: 'Alto', n: 1 },
      { nombre: 'Medio', n: 1 },
      { nombre: 'Bajo', n: 1 },
    ]);
    // El reparto reparte los activos UBICADOS. Cuando la matriz presenta además activos sin
    // riesgo valorado, `total` los incluye y esta suma ya no lo alcanza — por eso la
    // invariante se escribe contra `ubicados`, que es lo que la rejilla realmente dibuja.
    expect(m.reparto.reduce((a, b) => a + b.n, 0)).toBe(m.ubicados);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('matrizDeActivos · el universo es el inventario, no los riesgos', () => {
  // De los 378 activos vigentes, 30 tienen riesgos valorados. Contar sólo esos 30 hacía que
  // la tarjeta dijera «30 ACTIVOS» en una pantalla cuyo inventario tiene 378: la cifra no
  // está mal calculada, está contestando otra pregunta. Los 348 restantes no tienen riesgo
  // porque no alcanzan el umbral de valoración —4 hoy—, así que no hay casilla de la rejilla
  // a la que puedan caer; lo que no pueden hacer es desaparecer sin dejar rastro.
  const u = (activoCodigo: string, i: number, j: number, valor: number) => ({
    i,
    inherente: j,
    residual: j,
    valorInherente: valor,
    valorResidual: valor,
    activoCodigo,
  });

  const UBIS = [u('A-1', 0, 2, 13), u('B-2', 1, 2, 3)];
  // El valor propio de cada activo — el máximo de sus dimensiones, en la misma escala 0-5
  // que el impacto. Los tres que no tienen riesgo están en 3, 3 y 2: por debajo del umbral.
  const INVENTARIO = [
    { codigo: 'A-1', valor: 5 },
    { codigo: 'B-2', valor: 4 },
    { codigo: 'C-3', valor: 2 },
    { codigo: 'D-4', valor: 2 },
    { codigo: 'E-5', valor: 2 },
  ];

  it('el total es el inventario del filtro, no los activos que tienen riesgo', () => {
    const m = matrizDeActivos(UBIS, 'inherente', FILAS, COLUMNAS, BANDAS_RIESGO, INVENTARIO);
    expect(m.total).toBe(5);
    expect(m.ubicados).toBe(2);
  });

  it('un activo sin ningún riesgo valorado se cuenta aparte, no se ubica en la banda más baja', () => {
    const m = matrizDeActivos(UBIS, 'inherente', FILAS, COLUMNAS, BANDAS_RIESGO, INVENTARIO);
    expect(m.sinRiesgo).toBe(3);
    // Y no aparece en ninguna casilla: la rejilla sigue sumando sólo los ubicados.
    const enCasillas = m.conteos.flat().reduce((a, b) => a + b, 0);
    expect(enCasillas).toBe(2);
    // Tampoco se cuela en el reparto por nivel: no tiene nivel.
    expect(m.reparto.reduce((a, b) => a + b.n, 0)).toBe(2);
  });

  // La invariante que impide que un activo se pierda entre las tres cuentas. Es la misma
  // forma del defecto que ya costó tres despliegues: una lista que se encoge entre un paso
  // y el siguiente sin que ninguna cifra lo diga.
  it('total = ubicados + sinUbicar + sinRiesgo, en las dos caras', () => {
    const conResidualIncompleto = [
      ...UBIS,
      { i: 0, inherente: 2, residual: -1, valorInherente: 13, valorResidual: null, activoCodigo: 'C-3' },
    ];
    for (const cara of ['inherente', 'residual'] as const) {
      const m = matrizDeActivos(
        conResidualIncompleto,
        cara,
        FILAS,
        COLUMNAS,
        BANDAS_RIESGO,
        INVENTARIO,
      );
      expect(m.total).toBe(5);
      expect(m.ubicados + m.sinUbicar + m.sinRiesgo).toBe(m.total);
    }
    // En la residual, C-3 tiene riesgo pero no residual: es `sinUbicar`, no `sinRiesgo`. Son
    // dos causas distintas y la pantalla las explica distinto.
    const residual = matrizDeActivos(
      conResidualIncompleto,
      'residual',
      FILAS,
      COLUMNAS,
      BANDAS_RIESGO,
      INVENTARIO,
    );
    expect(residual.sinUbicar).toBe(1);
    expect(residual.sinRiesgo).toBe(2);
  });

  it('un activo repetido en el inventario cuenta una vez', () => {
    const m = matrizDeActivos(UBIS, 'inherente', FILAS, COLUMNAS, BANDAS_RIESGO, [
      ...INVENTARIO,
      { codigo: 'C-3', valor: 2 },
    ]);
    expect(m.total).toBe(5);
  });

  it('sin inventario, el universo son los activos que traen las ubicaciones', () => {
    const m = matrizDeActivos(UBIS, 'inherente', FILAS, COLUMNAS, BANDAS_RIESGO);
    expect(m.total).toBe(2);
    expect(m.ubicados).toBe(2);
    expect(m.sinRiesgo).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('matrizDeActivos · la columna de los que no entran al análisis', () => {
  // CONTARLOS NO ES VERLOS. Declarar «348 activos sin riesgo valorado» al pie deja invisible
  // lo único que un comité necesita saber de ellos: CUÁLES son graves. Medido contra el
  // registro del 22/09/2026, 330 de esos 348 valen 3 — que en la escala de impacto es la
  // banda ALTO. Trescientos treinta activos de impacto alto que la matriz no dibujaba.
  //
  // No tienen frecuencia y nunca la van a tener mientras no se les evalúe una amenaza, así
  // que no pueden entrar a la rejilla: la rejilla es impacto × frecuencia. Pero SÍ tienen
  // fila — su propio valor, que es el impacto que tendrían si una amenaza los degradara por
  // completo —, y con fila se pueden dibujar en una columna aparte.
  const u = (activoCodigo: string, i: number, j: number, valor: number) => ({
    i,
    inherente: j,
    residual: j,
    valorInherente: valor,
    valorResidual: valor,
    activoCodigo,
  });

  // LOS UMBRALES REALES, y no el `FILAS` compartido de arriba.
  //
  // Ese fixture deja huecos a propósito —Alto 3,5-4 y Medio 2-2,5— para ejercitar el valor
  // que no clasifica en ninguna banda. Acá hace falta lo contrario: la escala contigua que
  // `umbral_impacto` tiene de verdad, porque el hecho que esta suite fija es que **el valor
  // 3 cae en Alto**, y con una escala inventada ese hecho no diría nada del sistema.
  //
  // Comprobado contra 5432 el 22/09/2026: Muy alto 4,5-5 · Alto 3-4,499 · Medio 1,5-2,999 ·
  // Bajo 0,5-1,499 · Despreciable 0-0,499. El umbral de valoración es 4, así que la banda
  // Alto queda partida: 4 entra al análisis, 3 no. Esos son los 330 invisibles.
  const FILAS_REALES: FilaImpacto[] = filasDeUmbrales([
    { nombre: 'Muy alto', desde: 4.5, hasta: 5 },
    { nombre: 'Alto', desde: 3, hasta: 4.499 },
    { nombre: 'Medio', desde: 1.5, hasta: 2.999 },
    { nombre: 'Bajo', desde: 0.5, hasta: 1.499 },
    { nombre: 'Despreciable', desde: 0, hasta: 0.499 },
  ]);

  const UBIS = [u('A-1', 0, 2, 13)];
  const INVENTARIO = [
    { codigo: 'A-1', valor: 5 }, // ubicado en la rejilla
    { codigo: 'B-2', valor: 3 }, // banda Alto por su propio valor
    { codigo: 'C-3', valor: 3 }, // banda Alto
    { codigo: 'D-4', valor: 2 }, // banda Medio
    { codigo: 'E-5', valor: null }, // sin valorar: no hay fila que le corresponda
  ];

  const matriz = () =>
    matrizDeActivos(UBIS, 'inherente', FILAS_REALES, COLUMNAS, BANDAS_RIESGO, INVENTARIO);

  it('un activo sin riesgo cae en la fila de su PROPIO valor', () => {
    const m = matriz();
    // FILAS: 0 Muy alto (4,5-5) · 1 Alto (3-4,5) · 2 Medio (1,5-3) · 3 Bajo · 4 Despreciable.
    expect(m.sinAnalizar.conteos[1]).toBe(2);
    expect(m.sinAnalizar.conteos[2]).toBe(1);
    expect(m.sinAnalizar.conteos[0]).toBe(0);
  });

  // La razón de ser del cambio: el valor 3 es la banda ALTO y está por debajo del umbral 4.
  // Es exactamente la franja que el análisis deja fuera y la pantalla no mostraba.
  it('el valor 3 —bajo el umbral 4— es banda Alto, y se ve', () => {
    const m = matriz();
    expect(m.sinAnalizar.codigos[1]).toEqual(['B-2', 'C-3']);
  });

  it('lleva los códigos ordenados, como las casillas de la rejilla', () => {
    const m = matrizDeActivos(UBIS, 'inherente', FILAS_REALES, COLUMNAS, BANDAS_RIESGO, [
      { codigo: 'Z-9', valor: 3 },
      { codigo: 'A-2', valor: 3 },
    ]);
    expect(m.sinAnalizar.codigos[1]).toEqual(['A-2', 'Z-9']);
  });

  it('un activo sin valorar no tiene fila: se cuenta aparte, no se inventa una banda', () => {
    const m = matriz();
    expect(m.sinAnalizar.sinValor).toBe(1);
    expect(m.sinAnalizar.conteos.reduce((a, b) => a + b, 0)).toBe(3);
  });

  // La invariante de la pantalla completa: entre la rejilla, la columna y los sin valorar no
  // se pierde ni se duplica ningún activo.
  it('ubicados + la columna + sin valorar = el total', () => {
    const m = matriz();
    const enLaColumna = m.sinAnalizar.conteos.reduce((a, b) => a + b, 0);
    expect(m.ubicados + enLaColumna + m.sinAnalizar.sinValor).toBe(m.total);
  });

  // Un activo con riesgos que esta cara no puede ubicar —residual sin calcular— también
  // queda fuera de la rejilla, y tiene valor propio: va a la columna por la misma puerta.
  // Una sola regla —«lo que la rejilla no ubica, a la columna»— en vez de dos listas que
  // hay que mantener iguales.
  it('el que tiene riesgo pero no se ubica en esta cara también entra a la columna', () => {
    const sinResidual = [
      { i: 0, inherente: 2, residual: -1, valorInherente: 13, valorResidual: null, activoCodigo: 'A-1' },
    ];
    const m = matrizDeActivos(sinResidual, 'residual', FILAS_REALES, COLUMNAS, BANDAS_RIESGO, INVENTARIO);
    expect(m.ubicados).toBe(0);
    expect(m.sinAnalizar.conteos[0]).toBe(1); // A-1 vale 5 -> Muy alto
    expect(m.sinAnalizar.codigos[0]).toEqual(['A-1']);
  });

  it('sin inventario no hay columna: queda vacía, no a medias', () => {
    const m = matrizDeActivos(UBIS, 'inherente', FILAS_REALES, COLUMNAS, BANDAS_RIESGO);
    expect(m.sinAnalizar.conteos).toEqual(FILAS_REALES.map(() => 0));
    expect(m.sinAnalizar.sinValor).toBe(0);
  });
});
