// lib/sgsi/__tests__/consolidado-pasada2.test.ts
//
// REQ-SIG-12 §5.4, §5.5 y §5.7 · lo que sólo se puede resolver cuando ya existe todo:
// el activo superior, el nivel de grado 3, las aristas que no cierran ciclo, y la siembra
// de `ContadorCodigo`.
//
// **Por qué hay una segunda pasada y no una sola.** «Depende del activo superior» apunta a
// otro activo del MISMO archivo, y `nivelId` a un nodo de una jerarquía que se arma desde
// las mismas filas. En la primera pasada el destino puede no existir todavía: nueve filas
// del libro traen superior, y nada garantiza que su padre esté más arriba en la hoja.
// Ordenar el archivo para que sí lo esté sería pedirle a la persona que resuelva un
// problema del importador.

import {
  aristasSinCiclos,
  contadoresASembrar,
  resolverSuperiores,
  caminoDeNivel,
} from '../consolidado';

// ─── §5.4 · el activo superior ─────────────────────────────────────────────────────────

const fila = (n: number, codigo: string, superiorCodigo: string | null = null) => ({
  fila: n,
  codigo,
  superiorCodigo,
});

describe('§5.4 · resolverSuperiores', () => {
  it('resuelve un superior que aparece MÁS ABAJO en la hoja', () => {
    const { superiores } = resolverSuperiores([
      fila(8, 'FIN-APP-0001', 'FIN-DAT-0005'),
      fila(9, 'FIN-DAT-0005'),
    ]);
    expect(superiores).toEqual([{ codigo: 'FIN-APP-0001', superiorCodigo: 'FIN-DAT-0005' }]);
  });

  it('una fila sin superior no aporta nada', () => {
    expect(resolverSuperiores([fila(8, 'FIN-DAT-0005')]).superiores).toEqual([]);
  });

  // Apuntar a un activo que no se cargó deja `superiorId` colgando. No se escribe y se
  // reporta: el activo entra igual, sin padre, que es exactamente lo que el §6 pide.
  it('un superior que no existe se reporta y el activo queda sin padre', () => {
    const { superiores, problemas } = resolverSuperiores([fila(8, 'FIN-APP-0001', 'NO-EXI-0001')]);
    expect(superiores).toEqual([]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0].mensaje).toContain('NO-EXI-0001');
    expect(problemas[0].fila).toBe(8);
  });

  // `superiorId` es CONTENCIÓN: un padre, un árbol. Un árbol con un ciclo no tiene raíz, y
  // el drill-down del mapa no termina nunca.
  it('un activo no se contiene a sí mismo', () => {
    const { superiores, problemas } = resolverSuperiores([fila(8, 'FIN-APP-0001', 'FIN-APP-0001')]);
    expect(superiores).toEqual([]);
    expect(problemas[0].mensaje).toContain('sí mismo');
  });

  it('un ciclo de contención de tres saltos se corta y se dice por dónde iba', () => {
    const { superiores, problemas } = resolverSuperiores([
      fila(8, 'A-AAA-0001', 'B-BBB-0002'),
      fila(9, 'B-BBB-0002', 'C-CCC-0003'),
      fila(10, 'C-CCC-0003', 'A-AAA-0001'),
    ]);
    expect(superiores).toHaveLength(2);
    expect(problemas).toHaveLength(1);
    expect(problemas[0].mensaje).toContain('A-AAA-0001');
  });

  it('sin filas no hay nada', () => {
    expect(resolverSuperiores([])).toEqual({ superiores: [], problemas: [] });
  });
});

// ─── E3 · las dependencias no admiten ciclos, de ninguna longitud ──────────────────────

const arista = (n: number, base: string, relacionado: string) => ({ fila: n, base, relacionado });

describe('E3 · aristasSinCiclos', () => {
  it('deja pasar una cadena que no se cierra', () => {
    const { aceptadas, ciclos } = aristasSinCiclos([
      arista(11, 'TEC-SER-0033', 'TEC-SER-0053'),
      arista(12, 'TEC-SER-0053', 'TEC-SER-0054'),
    ]);
    expect(aceptadas).toHaveLength(2);
    expect(ciclos).toEqual([]);
  });

  // Comprobar sólo la reciprocidad directa —«¿ya existe B→A?»— deja pasar A→B→C→A, que es
  // justo el ciclo que hace que el drill-down del mapa no termine.
  it('corta un ciclo de tres saltos, no sólo el recíproco directo', () => {
    const { aceptadas, ciclos } = aristasSinCiclos([
      arista(11, 'A-AAA-0001', 'B-BBB-0002'),
      arista(12, 'B-BBB-0002', 'C-CCC-0003'),
      arista(13, 'C-CCC-0003', 'A-AAA-0001'),
    ]);
    expect(aceptadas).toHaveLength(2);
    expect(ciclos).toHaveLength(1);
    expect(ciclos[0].fila).toBe(13);
  });

  it('el recíproco directo también se corta', () => {
    const { ciclos } = aristasSinCiclos([
      arista(11, 'A-AAA-0001', 'B-BBB-0002'),
      arista(12, 'B-BBB-0002', 'A-AAA-0001'),
    ]);
    expect(ciclos).toHaveLength(1);
  });

  // «Cerraría un ciclo» sin mostrar por dónde manda a reconstruirlo a mano sobre un grafo de
  // decenas de aristas. El camino concreto es lo que lo hace arreglable.
  it('el mensaje trae la cadena completa, no sólo el veredicto', () => {
    const { ciclos } = aristasSinCiclos([
      arista(11, 'A-AAA-0001', 'B-BBB-0002'),
      arista(12, 'B-BBB-0002', 'C-CCC-0003'),
      arista(13, 'C-CCC-0003', 'A-AAA-0001'),
    ]);
    for (const codigo of ['A-AAA-0001', 'B-BBB-0002', 'C-CCC-0003']) {
      expect(ciclos[0].mensaje).toContain(codigo);
    }
  });

  // Las que ya están en la base cuentan: una arista nueva puede cerrar un ciclo contra una
  // vieja, y mirar sólo el archivo lo dejaría pasar.
  it('las aristas ya existentes también cuentan para el ciclo', () => {
    const { ciclos } = aristasSinCiclos([arista(11, 'B-BBB-0002', 'A-AAA-0001')], [
      { base: 'A-AAA-0001', relacionado: 'B-BBB-0002' },
    ]);
    expect(ciclos).toHaveLength(1);
  });

  it('sin aristas no hay ciclos', () => {
    expect(aristasSinCiclos([])).toEqual({ aceptadas: [], ciclos: [] });
  });
});

// ─── §5.7 · sembrar `ContadorCodigo` ───────────────────────────────────────────────────

const AREAS = [
  { id: 1, prefijo: 'TEC' },
  { id: 2, prefijo: 'SIG' },
  { id: 3, prefijo: 'PRY' },
];
const TIPOS = [
  { id: 10, abreviatura: 'SER' },
  { id: 11, abreviatura: 'DAT' },
];

describe('§5.7 · contadoresASembrar', () => {
  it('siembra el máximo, con los ids del área y del tipo', () => {
    const { sembrar } = contadoresASembrar(new Map([['TEC-SER', 54]]), AREAS, TIPOS);
    expect(sembrar).toEqual([{ serie: 'TEC-SER', areaId: 1, tipoId: 10, valor: 54 }]);
  });

  // EL CASO DEL LIBRO. Once de las cuarenta series usan prefijos que ningún área tiene
  // —`PRO-*`, `LCO-*`, `CLI-DAT`— o un tipo que no existe —`TEC-GEN`—, porque el código del
  // libro es histórico y los catálogos de hoy son otros.
  //
  // No es un problema: la app construye el código como `area.prefijo`-`tipo.abreviatura`, y
  // si no hay par (área, tipo) tampoco puede EMITIR un código de esa serie. Una serie que no
  // se puede emitir no se puede repetir. Se reporta y se sigue.
  it('una serie sin área en el catálogo no se siembra, y se dice por qué', () => {
    const { sembrar, sinPar } = contadoresASembrar(new Map([['PRO-DAT', 17]]), AREAS, TIPOS);
    expect(sembrar).toEqual([]);
    expect(sinPar).toHaveLength(1);
    expect(sinPar[0].motivo).toContain('PRO');
  });

  it('una serie sin tipo en el catálogo tampoco se siembra', () => {
    const { sembrar, sinPar } = contadoresASembrar(new Map([['TEC-GEN', 12]]), AREAS, TIPOS);
    expect(sembrar).toEqual([]);
    expect(sinPar[0].motivo).toContain('GEN');
  });

  it('separa lo sembrable de lo que no, sin perder ninguna serie', () => {
    const maximos = new Map([
      ['TEC-SER', 54],
      ['SIG-DAT', 30],
      ['PRO-DAT', 17],
      ['TEC-GEN', 12],
    ]);
    const { sembrar, sinPar } = contadoresASembrar(maximos, AREAS, TIPOS);
    expect(sembrar).toHaveLength(2);
    expect(sinPar).toHaveLength(2);
    expect([...sembrar.map((s) => s.serie), ...sinPar.map((s) => s.serie)].sort()).toEqual([
      'PRO-DAT',
      'SIG-DAT',
      'TEC-GEN',
      'TEC-SER',
    ]);
  });

  it('sin series no siembra nada', () => {
    expect(contadoresASembrar(new Map(), AREAS, TIPOS)).toEqual({ sembrar: [], sinPar: [] });
  });
});

// ─── El nivel de grado 3, que es lo otro que resuelve la 2ª pasada ─────────────────────

describe('el nivel de una fila es su camino de tres segmentos', () => {
  // `Activo.nivelId` apunta SÓLO al grado 3 (§4.4); los grados 1 y 2 se derivan subiendo por
  // `padreId`. La clave para encontrar ese nodo es el camino completo, nunca el nombre:
  // «Documentación» cuelga de once ramas distintas.
  it('la misma «Documentación» bajo padres distintos son dos niveles', () => {
    expect(caminoDeNivel(['CUANTICO', 'SIG', 'Documentación'])).not.toBe(
      caminoDeNivel(['PRODUCTOS', 'MINTRACE', 'Documentación']),
    );
  });
});
