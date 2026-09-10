// lib/sgsi/__tests__/valoracion-cuadre.test.ts
//
// El criterio 6 del §10 de REQ-SIG-18, que es la razón de que exista todo el §7: **el número de
// una celda tiene que ser el número de filas que el inventario muestra**.
//
// Se prueba acá y no en la pantalla porque las dos mitades son puras y viven en dos módulos: el
// que cuenta (`valoracion-agregada`) y el que filtra (`inventario-filtros`). El defecto que este
// archivo impide no rompe nada visible: la celda dice 41, el inventario abre 63 filas, y nadie se
// da cuenta hasta que alguien cuenta a mano.
//
// El inventario sintético trae a propósito los casos que el §9 nombra: valoración parcial, un
// activo sin ninguna fila, empates en el máximo, un activo sin propietario y personas repetidas.

import {
  CRITERIO_MAX,
  criterios as construirCriterios,
  escalaCompartida,
  matrizValoracion,
  nivelesAscendentes,
  tablaAgrupada,
  type ActivoAgregable,
  type DimensionActiva,
  type NivelEscala,
} from '../valoracion-agregada';
import { segmentos } from '../valoracion-figura';
import {
  FILTROS_VACIOS,
  cumpleFiltros,
  type ActivoFiltrable,
  type Filtros,
} from '../inventario-filtros';

const DIMENSIONES: DimensionActiva[] = [
  { codigo: 'D', nombre: 'Disponibilidad' },
  { codigo: 'I', nombre: 'Integridad' },
  { codigo: 'C', nombre: 'Confidencialidad' },
];

const NIVELES: NivelEscala[] = nivelesAscendentes([
  { valor: 5, etiqueta: '5 — Muy Alto' },
  { valor: 4, etiqueta: '4 — Alto' },
  { valor: 3, etiqueta: '3 — Medio' },
  { valor: 2, etiqueta: '2 — Bajo' },
  { valor: 1, etiqueta: '1 — Muy Bajo' },
  { valor: 0, etiqueta: '0 — Irrelevante' },
]);

const UMBRAL = 4;

interface Semilla {
  codigo: string;
  propietario: string | null;
  /// El CUSTODIO CARGO, que no es el propietario. Está para que la prueba pueda demostrar que
  /// `propietario` y `responsable` no dan lo mismo: es el defecto del §7.4.
  custodio: string | null;
  persona: { nombre: string; correo: string; activa: boolean } | null;
  valores: Record<string, number | null>;
}

const SEMILLAS: Semilla[] = [
  { codigo: 'A-01', propietario: 'CEO', custodio: 'Líder del SIG', persona: null, valores: { D: 5, I: 3, C: 2 } },
  { codigo: 'A-02', propietario: 'CEO', custodio: 'Líder del SIG', persona: null, valores: { D: 4, I: 4, C: 1 } },
  { codigo: 'A-03', propietario: 'CEO', custodio: null, persona: null, valores: { D: 3, I: 3, C: 3 } },
  { codigo: 'A-04', propietario: 'Líder del SIG', custodio: 'CEO', persona: null, valores: { D: 2, I: 2, C: 4 } },
  { codigo: 'A-05', propietario: 'Líder del SIG', custodio: 'CEO', persona: null, valores: { D: 0, I: 0, C: 0 } },
  { codigo: 'A-06', propietario: 'Líder del SIG', custodio: null, persona: null, valores: { C: 5 } },
  { codigo: 'A-07', propietario: 'Líder del SIG', custodio: null, persona: null, valores: { D: 3 } },
  { codigo: 'A-08', propietario: null, custodio: 'CEO', persona: null, valores: {} },
  { codigo: 'A-09', propietario: null, custodio: null, persona: null, valores: { D: 4, I: 2, C: 4 } },
  {
    codigo: 'A-10',
    propietario: 'CEO',
    custodio: 'CEO',
    persona: { nombre: 'Juan Felipe Ruiz', correo: 'jruiz@cuantico.co', activa: true },
    valores: { D: 2, I: 3, C: 4 },
  },
  {
    codigo: 'A-11',
    propietario: 'CEO',
    custodio: 'CEO',
    persona: { nombre: 'Juan Felipe Ruiz', correo: 'jruiz@cuantico.co', activa: true },
    valores: { D: 1, I: 1, C: 1 },
  },
  {
    codigo: 'A-12',
    propietario: 'Líder del SIG',
    custodio: null,
    // Dos personas con el MISMO NOMBRE. Las filas se distinguen por correo y el clic viaja por
    // correo, no por nombre (§9).
    persona: { nombre: 'Juan Felipe Ruiz', correo: 'jfruiz@cuantico.co', activa: false },
    valores: { D: 5, I: 5, C: 5 },
  },
];

const AGREGABLES: ActivoAgregable[] = SEMILLAS.map((s) => ({
  codigo: s.codigo,
  propietario: s.propietario,
  persona: s.persona,
  valores: s.valores,
}));

const FILTRABLES: ActivoFiltrable[] = SEMILLAS.map((s) => ({
  codigo: s.codigo,
  codigoHeredado: null,
  nombre: s.codigo,
  tipo: '[SW] Aplicaciones',
  subtipo: 'SW.1',
  proveedor: null,
  propietario: s.propietario,
  custodio: s.custodio,
  personaCorreo: s.persona?.correo ?? null,
  valores: s.valores,
}));

/// Cuántas filas abre el inventario con esos filtros. Es la mitad de la promesa del criterio 6.
const filas = (filtros: Partial<Filtros>): number =>
  FILTRABLES.filter((a) => cumpleFiltros(a, { ...FILTROS_VACIOS, ...filtros }, '', DIMENSIONES))
    .length;

const base = { activos: AGREGABLES, dimensiones: DIMENSIONES, niveles: NIVELES, umbral: UMBRAL };
const CRITERIOS = construirCriterios(DIMENSIONES, 'Valor del activo');
const MATRIZ = matrizValoracion({ ...base, criterios: CRITERIOS });
const ESCALA = escalaCompartida(MATRIZ);

/// Los parámetros que el destino arrastra: con el máximo no viaja `dimension`; con una dimensión,
/// sí (§4.6 y §6.4).
const arrastre = (clave: string): Partial<Filtros> =>
  clave === CRITERIO_MAX ? {} : { dimension: clave };

describe('criterio 6 · cada segmento de las cuatro pilas abre exactamente su cuenta', () => {
  const casos = MATRIZ.flatMap((f) =>
    segmentos(f, NIVELES, ESCALA, UMBRAL).map((s) => ({
      nombre: `${f.clave} × nivel ${s.valor}`,
      filtros: { ...arrastre(f.clave), valor: s.valor },
      esperado: s.cuenta,
    })),
  );

  it('hay al menos un segmento por pila', () => {
    for (const f of MATRIZ) expect(segmentos(f, NIVELES, ESCALA, UMBRAL).length).toBeGreaterThan(0);
  });

  it.each(casos.map((c) => [c.nombre, c] as const))('%s', (_n, c) => {
    expect(filas(c.filtros)).toBe(c.esperado);
  });
});

describe('criterio 6 · la cuenta ≥ umbral de cada pila abre exactamente su cuenta', () => {
  it.each(MATRIZ.map((f) => [f.clave, f] as const))('%s', (_n, f) => {
    expect(filas({ ...arrastre(f.clave), valorMinimo: UMBRAL })).toBe(f.desdeUmbral);
  });
});

describe('criterio 6 · la Tabla A, con el máximo seleccionado', () => {
  const tabla = tablaAgrupada({
    ...base,
    agrupador: 'propietario',
    criterios: [CRITERIOS[0]!],
    incluirSinAsignar: true,
  });

  it('cada fila abre su total', () => {
    for (const f of tabla.filas) expect(filas({ propietario: f.clave })).toBe(f.total);
  });

  it('cada celda de la parrilla abre su cuenta', () => {
    for (const f of tabla.filas) {
      const r = f.porCriterio[CRITERIO_MAX]!;
      NIVELES.forEach((n, i) => {
        expect(filas({ propietario: f.clave, valor: n.valor })).toBe(r.porNivel[i]);
      });
    }
  });

  it('cada celda ≥ umbral abre su cuenta', () => {
    for (const f of tabla.filas) {
      expect(filas({ propietario: f.clave, valorMinimo: UMBRAL })).toBe(f.desdeUmbral);
    }
  });

  it('el encabezado de columna abre la columna entera', () => {
    const totales = tabla.totales.porCriterio[CRITERIO_MAX]!;
    NIVELES.forEach((n, i) => {
      expect(filas({ valor: n.valor })).toBe(totales.porNivel[i]);
    });
  });

  it('la fila «Sin propietario» los muestra: cero activos perdidos (criterio 9)', () => {
    const sin = tabla.filas.find((f) => f.sinAsignar)!;
    expect(sin.total).toBeGreaterThan(0);
    expect(filas({ propietario: sin.clave })).toBe(sin.total);
  });
});

describe('criterio 6 · la Tabla A siguiendo una dimensión (criterio 8)', () => {
  it.each(DIMENSIONES.map((d) => [d.codigo] as const))(
    'con %s seleccionada, cada celda y cada total cuadran',
    (codigo) => {
      const criterio = CRITERIOS.find((c) => c.clave === codigo)!;
      const tabla = tablaAgrupada({
        ...base,
        agrupador: 'propietario',
        criterios: [criterio],
        incluirSinAsignar: true,
      });
      for (const f of tabla.filas) {
        const r = f.porCriterio[codigo]!;
        expect(filas({ dimension: codigo, propietario: f.clave })).toBe(f.total);
        NIVELES.forEach((n, i) => {
          expect(filas({ dimension: codigo, propietario: f.clave, valor: n.valor })).toBe(
            r.porNivel[i],
          );
        });
        expect(filas({ dimension: codigo, propietario: f.clave, valorMinimo: UMBRAL })).toBe(
          f.desdeUmbral,
        );
      }
      // Los totales pasan a coincidir con la fila de esa dimensión en la matriz.
      const filaMatriz = MATRIZ.find((f) => f.clave === codigo)!;
      expect(tabla.totales.porCriterio[codigo]!.porNivel).toEqual(filaMatriz.porNivel);
      expect(tabla.totales.desdeUmbral).toBe(filaMatriz.desdeUmbral);
    },
  );
});

describe('criterio 6 · la Tabla B', () => {
  const criteriosB = construirCriterios(DIMENSIONES, 'Valor final');
  const tabla = tablaAgrupada({
    ...base,
    agrupador: 'persona',
    criterios: criteriosB,
    incluirSinAsignar: false,
  });

  it('el nombre de la persona abre sus activos, y viaja por correo', () => {
    for (const f of tabla.filas) expect(filas({ persona: f.clave })).toBe(f.total);
  });

  it('dos personas con el mismo nombre son dos filas distintas', () => {
    const homonimas = tabla.filas.filter((f) => f.etiqueta === 'Juan Felipe Ruiz');
    expect(homonimas.length).toBe(2);
    expect(new Set(homonimas.map((f) => f.clave)).size).toBe(2);
  });

  it('cada celda de cada grupo abre su cuenta', () => {
    for (const f of tabla.filas) {
      for (const c of criteriosB) {
        const r = f.porCriterio[c.clave]!;
        NIVELES.forEach((n, i) => {
          expect(filas({ ...arrastre(c.clave), persona: f.clave, valor: n.valor })).toBe(
            r.porNivel[i],
          );
        });
      }
    }
  });

  it('el encabezado de nivel de un grupo cuadra SOLO con conPersona', () => {
    for (const c of criteriosB) {
      NIVELES.forEach((n, i) => {
        const columna = tabla.totales.porCriterio[c.clave]!.porNivel[i]!;
        expect(filas({ ...arrastre(c.clave), valor: n.valor, conPersona: true })).toBe(columna);
      });
    }
  });

  it('sin conPersona el encabezado miente, y por eso el parámetro existe', () => {
    // Es el mismo defecto del §7.4 en otra puerta: sin acotar, el encabezado lleva a todo el
    // inventario. Esta prueba fija que la diferencia es real y no una precaución teórica.
    const conAlgo = NIVELES.map(
      (n, i) => [n.valor, tabla.totales.porCriterio[CRITERIO_MAX]!.porNivel[i]!] as const,
    ).filter(([, cuenta]) => cuenta > 0);
    expect(conAlgo.length).toBeGreaterThan(0);
    expect(
      conAlgo.some(([valor, cuenta]) => filas({ valor }) !== cuenta),
    ).toBe(true);
  });

  it('la celda ≥ umbral de una fila abre su cuenta', () => {
    for (const f of tabla.filas) {
      expect(filas({ persona: f.clave, valorMinimo: UMBRAL })).toBe(f.desdeUmbral);
    }
  });

  it('el enlace de la línea de encuadre abre los NO asignados', () => {
    expect(filas({ persona: '__sin__' })).toBe(AGREGABLES.length - tabla.totales.total);
    expect(tabla.fuera).toBe(AGREGABLES.length - tabla.totales.total);
  });
});

describe('§7.4 · el defecto que hacía mentir al número', () => {
  it('con `responsable` la celda de un propietario abriría MÁS filas de las que dijo', () => {
    const tabla = tablaAgrupada({
      ...base,
      agrupador: 'propietario',
      criterios: [CRITERIOS[0]!],
      incluirSinAsignar: true,
    });
    const ceo = tabla.filas.find((f) => f.clave === 'CEO')!;
    // Lo que la celda cuenta, y lo que el filtro correcto abre.
    expect(filas({ propietario: 'CEO' })).toBe(ceo.total);
    // Y lo que el filtro viejo habría abierto: los activos donde el CEO es CUSTODIO también.
    expect(filas({ responsable: 'CEO' })).toBeGreaterThan(ceo.total);
  });
});
