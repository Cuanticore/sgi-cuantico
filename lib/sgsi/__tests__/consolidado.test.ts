// lib/sgsi/__tests__/consolidado.test.ts
//
// REQ-SIG-12 §3 · la regla de oro: el código del libro se PRESERVA, no se regenera.
//
// El importador actual mapea «Código» a `codigoHeredado` y emite uno nuevo desde
// `ContadorCodigo`. Con V19 eso rompe TODO el tejido relacional: la hoja Dependencias, el
// Detalle de ambiente y las 720 aristas del Grafo referencian a los activos por su código
// exacto. Y no es hipotético — el prefijo de área del código no siempre coincide con la
// columna «Proceso o Área», así que regenerar le cambiaría el prefijo a una docena de
// activos y sus referencias quedarían apuntando a la nada.
//
// La otra mitad de la regla es sembrar los contadores al máximo observado, para que las
// altas futuras continúen la serie en vez de repetir un número que ya existe.

import {
  esCodigoDeLibro,
  esConsolidadoV19,
  diagnosticoDeFormato,
  maximosPorSerie,
  partesDeCodigo,
  serieDeCodigo,
} from '../consolidado';

describe('esCodigoDeLibro', () => {
  it.each(['TEC-SER-0001', 'SIG-DAT-0030', 'COM-CLA-0001'])('acepta %s', (c) => {
    expect(esCodigoDeLibro(c)).toBe(true);
  });

  it.each([
    ['minúsculas', 'tec-ser-0001'],
    ['tres dígitos', 'TEC-SER-001'],
    ['cinco dígitos', 'TEC-SER-00001'],
    ['dos segmentos', 'TEC-0001'],
    ['con espacio', 'TEC-SER-0001 '],
    ['vacío', ''],
  ])('rechaza %s', (_n, c) => {
    expect(esCodigoDeLibro(c)).toBe(false);
  });
});

describe('partesDeCodigo', () => {
  it('separa área, tipo y número', () => {
    expect(partesDeCodigo('TEC-SER-0052')).toEqual({
      area: 'TEC',
      tipo: 'SER',
      numero: 52,
      serie: 'TEC-SER',
    });
  });

  // El cero a la izquierda no es parte del número: `0001` es 1, y el contador guarda 1.
  it('el número no arrastra los ceros', () => {
    expect(partesDeCodigo('SIG-APP-0001')?.numero).toBe(1);
  });

  it('un código que no cumple el patrón devuelve null', () => {
    expect(partesDeCodigo('TEC-SER-1')).toBeNull();
  });
});

describe('maximosPorSerie', () => {
  it('toma el mayor de cada serie, no el último visto', () => {
    const m = maximosPorSerie(['TEC-SER-0052', 'TEC-SER-0007', 'TEC-APP-0033']);
    expect(m.get('TEC-SER')).toBe(52);
    expect(m.get('TEC-APP')).toBe(33);
  });

  it('ignora los códigos que no cumplen el patrón en vez de reventar', () => {
    const m = maximosPorSerie(['TEC-SER-0052', 'basura', '', 'TEC-SER-1']);
    expect(m.get('TEC-SER')).toBe(52);
    expect(m.size).toBe(1);
  });

  it('sin códigos devuelve un mapa vacío', () => {
    expect(maximosPorSerie([]).size).toBe(0);
  });
});

describe('serieDeCodigo', () => {
  it('es el prefijo que identifica al contador', () => {
    expect(serieDeCodigo('TEC-SER-0052')).toBe('TEC-SER');
  });
});

// ─── Paridad con el §3 ────────────────────────────────────────────────────────────────
//
// El requerimiento PUBLICA los máximos por serie. Derivarlos de la lista de códigos y
// contrastarlos contra lo publicado prueba dos cosas de una vez: que la derivación es
// correcta, y que el libro que tengo es el mismo que se analizó para escribir el REQ.
//
// Si esto falla, el archivo cambió y hay que preguntar antes de cargar — no ajustar la
// prueba al archivo, que es exactamente cómo una prueba de paridad deja de probar.
describe('paridad · los máximos publicados en el §3', () => {
  const PUBLICADOS: Record<string, number> = {
    'TEC-SER': 52, 'TEC-APP': 33, 'TEC-EQU': 16, 'TEC-RED': 13, 'TEC-GEN': 11,
    'TEC-PER': 7, 'TEC-CLA': 6, 'TEC-AUX': 1,
    'SIG-DAT': 30, 'SIG-PER': 2, 'SIG-APP': 1, 'SIG-EQU': 1,
    'PRO-DAT': 17, 'PRO-PER': 7, 'PRO-APP': 2, 'PRO-SER': 2, 'PRO-GEN': 1,
    'COM-DAT': 19, 'COM-PER': 4, 'COM-APP': 3, 'COM-CLA': 1, 'COM-EQU': 1,
    'FIN-DAT': 8, 'FIN-PER': 6, 'FIN-SER': 5, 'FIN-CLA': 2, 'FIN-APP': 1,
    'FIN-EQU': 1, 'FIN-SOP': 1,
    'LCO-DAT': 14, 'LCO-PER': 2, 'LCO-APP': 1, 'LCO-EQU': 1,
    'EST-DAT': 10, 'EST-PER': 4, 'EST-EQU': 1, 'EST-INS': 1,
    'TAL-DAT': 8, 'TAL-PER': 5,
    'CLI-DAT': 3,
  };

  /// Reconstruye la lista de códigos que produce esos máximos. No es el libro —eso se
  /// verifica en la prueba de paridad del §8, que sí lo abre— pero sí prueba que la
  /// derivación coincide con lo publicado sobre el mismo conjunto.
  const codigos = Object.entries(PUBLICADOS).flatMap(([serie, max]) =>
    Array.from({ length: max }, (_, i) => `${serie}-${String(i + 1).padStart(4, '0')}`),
  );

  it('la derivación reproduce los máximos publicados, serie por serie', () => {
    const m = maximosPorSerie(codigos);
    expect(Object.fromEntries(m)).toEqual(PUBLICADOS);
  });

  it('las cuarenta series del §3 estan cubiertas', () => {
    expect(maximosPorSerie(codigos).size).toBe(Object.keys(PUBLICADOS).length);
  });
});

// ─── §2 · reconocer el consolidado, y no confundirlo con el formato histórico ──────────
//
// El importador busca el encabezado legacy en TODAS las hojas y, si lo encuentra, mapea
// «Código» a `codigoHeredado` y emite uno nuevo. **V19 cumple `esFormatoLegacy`** —trae
// Código, Proceso o Área, Custodio y Valor en Disponibilidad—, así que hoy entraría por ese
// camino y perdería su tejido relacional.
//
// De ahí que la detección del consolidado tenga que correr ANTES y ser inequívoca. Lo que
// lo distingue no es una columna sola: es la jerarquía de tres niveles y el activo superior
// en la Matriz, MÁS las hojas que el §5 necesita para cargar. Un archivo con las columnas y
// sin las hojas no es un consolidado: es una matriz suelta.
describe('esConsolidadoV19', () => {
  const CABECERA = [
    '', 'Código', 'Nivel 1', 'Nivel 2', 'Nivel 3', 'Nombre del activo', 'Descripción',
    'Cantidad', 'Tipo de activo', 'Subtipo de activo', 'Proceso o Área', 'Custodio',
    'Propietario del activo', 'Ubicación', 'Entorno', '¿Contiene datos de cliente?',
    '¿Contiene datos personales (Ley 1581)?', '¿Está expuesto a Internet?',
    'Proveedor o subencargado', 'Depende del activo superior', 'Valor en Disponibilidad',
    'Valor en Integridad', 'Valor en Confidencialidad', 'Valor del activo (0 a 5)',
    'Nivel del activo',
  ];
  const HOJAS = [
    'Guía de uso', 'Dashboard', 'Dependencias', 'Detalle de ambiente',
    'Matriz de Activos', 'Grafo (aristas)',
  ];

  it('reconoce el libro V19 real', () => {
    expect(esConsolidadoV19(CABECERA, HOJAS)).toBe(true);
  });

  // El histórico no trae niveles ni activo superior: tiene que seguir entrando por el
  // camino legacy, que para él es el correcto.
  it('el formato histórico NO es un consolidado', () => {
    const historico = CABECERA.filter(
      (h) => !/^Nivel [123]$/.test(h) && h !== 'Depende del activo superior',
    );
    expect(esConsolidadoV19(historico, HOJAS)).toBe(false);
  });

  it('sin las hojas de dependencias y ambiente no es un consolidado', () => {
    expect(esConsolidadoV19(CABECERA, ['Matriz de Activos'])).toBe(false);
  });

  // Los nombres de hoja se comparan sin acentos ni caja: quien renombre «Detalle de
  // Ambiente» no rompió el archivo.
  it('los nombres de hoja no dependen de acentos ni de la caja', () => {
    expect(
      esConsolidadoV19(CABECERA, ['MATRIZ DE ACTIVOS', 'dependencias', 'detalle de ambiente']),
    ).toBe(true);
  });

  it('falta un nivel y ya no alcanza: la jerarquía es de tres grados', () => {
    const sinNivel3 = CABECERA.map((h) => (h === 'Nivel 3' ? '' : h));
    expect(esConsolidadoV19(sinNivel3, HOJAS)).toBe(false);
  });
});

// ─── El repliegue silencioso ───────────────────────────────────────────────────────────
//
// `esConsolidadoV19` devuelve un booleano, y un booleano no distingue «esto es el formato
// histórico» de «esto QUERÍA ser el consolidado y le falta algo». Esa diferencia importa
// mucho, porque el camino de al lado —`esFormatoLegacy`— regenera el código y destruye el
// tejido relacional.
//
// Basta con que alguien renombre «Nivel 3» a «Nivel3» para que un libro V19 caiga al camino
// legacy sin un solo aviso. Un archivo que trae las hojas del consolidado NO debe cargarse
// como histórico: hay que parar y decir qué falta.
describe('diagnosticoDeFormato', () => {
  const CAB_V19 = [
    'Código', 'Nivel 1', 'Nivel 2', 'Nivel 3', 'Nombre del activo',
    'Depende del activo superior', 'Valor en Disponibilidad',
  ];
  const HOJAS_V19 = ['Matriz de Activos', 'Dependencias', 'Detalle de ambiente'];

  it('el consolidado completo se reconoce', () => {
    const d = diagnosticoDeFormato(CAB_V19, HOJAS_V19);
    expect(d.formato).toBe('CONSOLIDADO');
    expect(d.faltantes).toEqual([]);
  });

  it('sin las hojas del consolidado es el histórico, y eso está bien', () => {
    const d = diagnosticoDeFormato(['Código', 'Nombre del activo'], ['Matriz de Activos']);
    expect(d.formato).toBe('HISTORICO');
  });

  // EL CASO QUE IMPORTA: trae las hojas del consolidado pero le falta una columna. No es
  // histórico. Cargarlo como histórico le regeneraría los códigos.
  it('con las hojas y sin una columna NO es histórico: es incompleto', () => {
    const sinNivel3 = CAB_V19.filter((h) => h !== 'Nivel 3');
    const d = diagnosticoDeFormato(sinNivel3, HOJAS_V19);
    expect(d.formato).toBe('CONSOLIDADO_INCOMPLETO');
    expect(d.faltantes).toEqual(['Nivel 3']);
  });

  it('nombra TODAS las columnas que faltan, no solo la primera', () => {
    const pelado = ['Código', 'Nombre del activo'];
    const d = diagnosticoDeFormato(pelado, HOJAS_V19);
    expect(d.formato).toBe('CONSOLIDADO_INCOMPLETO');
    expect(d.faltantes).toEqual([
      'Nivel 1', 'Nivel 2', 'Nivel 3', 'Depende del activo superior',
    ]);
  });

  // Y al revés: columnas del consolidado sin sus hojas. Tampoco se carga a ciegas.
  it('con las columnas y sin las hojas, dice qué hoja falta', () => {
    const d = diagnosticoDeFormato(CAB_V19, ['Matriz de Activos']);
    expect(d.formato).toBe('CONSOLIDADO_INCOMPLETO');
    expect(d.faltantes).toEqual(['hoja «Dependencias»', 'hoja «Detalle de ambiente»']);
  });
});
