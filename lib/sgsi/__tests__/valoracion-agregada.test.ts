// lib/sgsi/__tests__/valoracion-agregada.test.ts
//
// Los invariantes del §10 de REQ-SIG-18, escritos como invariantes y no como cifras: los
// conteos reales dependen de qué carga esté aplicada, así que cualquier número fijo acá es un
// test que se rompe con la próxima carga.

import {
  CRITERIO_MAX,
  SIN_ASIGNAR,
  criterios,
  dimensionesQueMandan,
  escalaCompartida,
  matrizValoracion,
  nivelesAscendentes,
  repartir,
  tablaAgrupada,
  topesDeTinte,
  valorDeCriterio,
  type ActivoAgregable,
  type DimensionActiva,
  type NivelEscala,
} from '../valoracion-agregada';

const DIMENSIONES: DimensionActiva[] = [
  { codigo: 'D', nombre: 'Disponibilidad' },
  { codigo: 'I', nombre: 'Integridad' },
  { codigo: 'C', nombre: 'Confidencialidad' },
];

// Como llega de `escala_valor`: ordenada por `orden`, o sea el 5 primero.
const ESCALA: NivelEscala[] = [
  { valor: 5, etiqueta: '5 — Muy Alto' },
  { valor: 4, etiqueta: '4 — Alto' },
  { valor: 3, etiqueta: '3 — Medio' },
  { valor: 2, etiqueta: '2 — Bajo' },
  { valor: 1, etiqueta: '1 — Muy Bajo' },
  { valor: 0, etiqueta: '0 — Irrelevante' },
];

const NIVELES = nivelesAscendentes(ESCALA);

function activo(
  codigo: string,
  valores: Record<string, number | null>,
  propietario: string | null = 'CEO',
  persona: ActivoAgregable['persona'] = null,
): ActivoAgregable {
  return { codigo, propietario, persona, valores };
}

// Un inventario chico pero con todos los casos borde del §9 adentro.
const INVENTARIO: ActivoAgregable[] = [
  activo('A-1', { D: 5, I: 3, C: 2 }, 'CEO'),
  activo('A-2', { D: 4, I: 4, C: 1 }, 'CEO'), // empate en el máximo
  activo('A-3', { D: 2, I: 2, C: 4 }, 'Líder del SIG'),
  activo('A-4', { D: 0, I: 0, C: 0 }, 'Líder del SIG'),
  activo('A-5', { D: 3, I: 3, C: 3 }, 'Líder del SIG'),
  activo('A-6', { C: 5 }, 'CEO'), // valorado en una sola dimensión
  activo('A-7', {}, null), // sin ninguna fila en ActivoValor, y sin propietario
];

describe('nivelesAscendentes', () => {
  it('da la vuelta al orden de la escala: 0 a 5, izquierda a derecha', () => {
    expect(NIVELES.map((n) => n.valor)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('no muta la escala que recibe', () => {
    expect(ESCALA[0]!.valor).toBe(5);
  });
});

describe('valorDeCriterio', () => {
  it('el máximo es el mayor de las dimensiones activas', () => {
    expect(valorDeCriterio({ D: 5, I: 3, C: 2 }, CRITERIO_MAX, DIMENSIONES)).toBe(5);
  });

  it('con una sola dimensión valorada, el máximo se calcula sobre las presentes', () => {
    expect(valorDeCriterio({ C: 5 }, CRITERIO_MAX, DIMENSIONES)).toBe(5);
  });

  it('sin ninguna dimensión valorada no hay máximo: es null, no 0', () => {
    expect(valorDeCriterio({}, CRITERIO_MAX, DIMENSIONES)).toBeNull();
    expect(valorDeCriterio({ D: null, I: null, C: null }, CRITERIO_MAX, DIMENSIONES)).toBeNull();
  });

  it('valorado en 0 no es lo mismo que sin valorar', () => {
    expect(valorDeCriterio({ D: 0, I: 0, C: 0 }, CRITERIO_MAX, DIMENSIONES)).toBe(0);
  });

  it('una dimensión inactiva no es un criterio, aunque tenga valor guardado', () => {
    expect(valorDeCriterio({ D: 1, A: 5 }, 'A', DIMENSIONES)).toBeNull();
  });

  it('el máximo ignora las dimensiones inactivas', () => {
    expect(valorDeCriterio({ D: 1, I: 1, C: 1, A: 5 }, CRITERIO_MAX, DIMENSIONES)).toBe(1);
  });

  it('una cuarta dimensión activa entra al máximo sin tocar código', () => {
    const conA = [...DIMENSIONES, { codigo: 'A', nombre: 'Autenticidad' }];
    expect(valorDeCriterio({ D: 1, I: 1, C: 1, A: 5 }, CRITERIO_MAX, conA)).toBe(5);
    expect(valorDeCriterio({ D: 1, A: 5 }, 'A', conA)).toBe(5);
  });
});

describe('criterios', () => {
  it('el máximo va primero y después una por dimensión activa, en su orden', () => {
    expect(criterios(DIMENSIONES, 'Valor del activo').map((c) => c.clave)).toEqual([
      CRITERIO_MAX,
      'D',
      'I',
      'C',
    ]);
  });

  it('una quinta dimensión da una quinta fila', () => {
    const conA = [...DIMENSIONES, { codigo: 'A', nombre: 'Autenticidad' }];
    expect(criterios(conA, 'Valor').length).toBe(5);
  });
});

describe('criterio 1 · cada fila suma los activos vigentes', () => {
  const matriz = matrizValoracion({
    activos: INVENTARIO,
    dimensiones: DIMENSIONES,
    niveles: NIVELES,
    umbral: 4,
    criterios: criterios(DIMENSIONES, 'Valor del activo'),
  });

  it.each(matriz.map((f) => [f.etiqueta, f] as const))(
    'los seis niveles más «Sin valorar» dan el total en la fila %s',
    (_etiqueta, fila) => {
      expect(fila.porNivel.reduce((t, n) => t + n, 0) + fila.sinValorar).toBe(INVENTARIO.length);
      expect(fila.total).toBe(INVENTARIO.length);
    },
  );

  it('hay una fila por criterio', () => {
    expect(matriz.map((f) => f.clave)).toEqual([CRITERIO_MAX, 'D', 'I', 'C']);
  });

  it('el activo sin ninguna fila de valoración cae en «Sin valorar» en las cuatro', () => {
    for (const fila of matriz) expect(fila.sinValorar).toBeGreaterThanOrEqual(1);
  });

  it('el valorado en una sola dimensión aporta a esa fila y a «Sin valorar» en las otras', () => {
    const c = matriz.find((f) => f.clave === 'C')!;
    const d = matriz.find((f) => f.clave === 'D')!;
    // A-6 tiene C y no tiene D: cuenta en C y falta en D.
    expect(c.sinValorar).toBe(1); // solo A-7
    expect(d.sinValorar).toBe(2); // A-6 y A-7
  });
});

describe('criterio 3 · monotonía del máximo', () => {
  const matriz = matrizValoracion({
    activos: INVENTARIO,
    dimensiones: DIMENSIONES,
    niveles: NIVELES,
    umbral: 4,
    criterios: criterios(DIMENSIONES, 'Valor'),
  });
  const desdeNivel = (fila: (typeof matriz)[number], n: number) =>
    NIVELES.reduce((t, nivel, i) => (nivel.valor >= n ? t + fila.porNivel[i]! : t), 0);

  it.each(NIVELES.map((n) => n.valor))(
    'los de máximo >= %i son al menos los de cualquier dimensión >= ese nivel',
    (n) => {
      const max = desdeNivel(matriz[0]!, n);
      for (const fila of matriz.slice(1)) expect(max).toBeGreaterThanOrEqual(desdeNivel(fila, n));
    },
  );
});

describe('criterio 5 · el ≥ umbral sale del parámetro', () => {
  const conUmbral = (umbral: number) =>
    repartir(INVENTARIO, CRITERIO_MAX, DIMENSIONES, NIVELES, umbral);

  it('es la suma de los niveles >= umbral', () => {
    const r = conUmbral(4);
    const esperado = NIVELES.reduce((t, n, i) => (n.valor >= 4 ? t + r.porNivel[i]! : t), 0);
    expect(r.desdeUmbral).toBe(esperado);
  });

  it('bajar el umbral a 3 mueve la cifra sin tocar el reparto', () => {
    const a = conUmbral(4);
    const b = conUmbral(3);
    expect(b.porNivel).toEqual(a.porNivel);
    expect(b.desdeUmbral).toBeGreaterThan(a.desdeUmbral);
  });
});

describe('repartir', () => {
  it('un valor que la escala no admite cuenta como sin valorar, no se redondea', () => {
    const r = repartir([activo('X', { D: 9, I: 9, C: 9 })], CRITERIO_MAX, DIMENSIONES, NIVELES, 4);
    expect(r.porNivel).toEqual([0, 0, 0, 0, 0, 0]);
    expect(r.sinValorar).toBe(1);
    expect(r.total).toBe(1);
  });

  it('valorados es el largo de la pila y no incluye los sin valorar', () => {
    const r = repartir(INVENTARIO, 'D', DIMENSIONES, NIVELES, 4);
    expect(r.valorados).toBe(INVENTARIO.length - r.sinValorar);
  });

  it('un inventario vacío da todo en cero', () => {
    const r = repartir([], CRITERIO_MAX, DIMENSIONES, NIVELES, 4);
    expect(r).toEqual({ porNivel: [0, 0, 0, 0, 0, 0], sinValorar: 0, valorados: 0, total: 0, desdeUmbral: 0 });
  });
});

describe('escalaCompartida', () => {
  it('es la barra más larga, no el total del inventario', () => {
    const matriz = matrizValoracion({
      activos: INVENTARIO,
      dimensiones: DIMENSIONES,
      niveles: NIVELES,
      umbral: 4,
      criterios: criterios(DIMENSIONES, 'Valor'),
    });
    expect(escalaCompartida(matriz)).toBe(Math.max(...matriz.map((f) => f.valorados)));
  });
});

describe('dimensionesQueMandan · el empate no se desempata (D-7)', () => {
  const d = dimensionesQueMandan({
    activos: INVENTARIO,
    dimensiones: DIMENSIONES,
    niveles: NIVELES,
    umbral: 4,
  });

  it('cuenta los que alcanzan el umbral por su máximo', () => {
    // A-1 (5), A-2 (4), A-3 (4), A-6 (5).
    expect(d.alcanzanUmbral).toBe(4);
  });

  it('un activo con empate cuenta en cada dimensión empatada', () => {
    const suma = d.porDimension.reduce((t, c) => t + c.cuenta, 0);
    expect(suma).toBeGreaterThan(d.alcanzanUmbral);
    expect(d.hayEmpates).toBe(true);
  });

  it('sin empates, las cuentas suman el total y no hay advertencia', () => {
    const sinEmpates = dimensionesQueMandan({
      activos: [activo('U-1', { D: 5, I: 1, C: 1 }), activo('U-2', { D: 1, I: 4, C: 1 })],
      dimensiones: DIMENSIONES,
      niveles: NIVELES,
      umbral: 4,
    });
    expect(sinEmpates.porDimension.reduce((t, c) => t + c.cuenta, 0)).toBe(2);
    expect(sinEmpates.hayEmpates).toBe(false);
  });

  it('no nombra ninguna cuando dos dimensiones empatan en la punta', () => {
    const empatadas = dimensionesQueMandan({
      activos: [activo('U-1', { D: 4, I: 4, C: 1 })],
      dimensiones: DIMENSIONES,
      niveles: NIVELES,
      umbral: 4,
    });
    expect(empatadas.manda).toBeNull();
  });

  it('con nadie sobre el umbral no manda nadie', () => {
    const bajo = dimensionesQueMandan({
      activos: [activo('U-1', { D: 1, I: 1, C: 1 })],
      dimensiones: DIMENSIONES,
      niveles: NIVELES,
      umbral: 4,
    });
    expect(bajo.manda).toBeNull();
    expect(bajo.alcanzanUmbral).toBe(0);
  });
});

describe('tablaAgrupada · Tabla A, por propietario', () => {
  const unCriterio = [{ clave: CRITERIO_MAX, etiqueta: 'Valor final' }];
  const tabla = tablaAgrupada({
    activos: INVENTARIO,
    dimensiones: DIMENSIONES,
    niveles: NIVELES,
    umbral: 4,
    agrupador: 'propietario',
    criterios: unCriterio,
    incluirSinAsignar: true,
  });

  it('criterio 4 · la suma de cada fila es su total', () => {
    for (const f of tabla.filas) {
      const r = f.porCriterio[CRITERIO_MAX]!;
      expect(r.porNivel.reduce((t, n) => t + n, 0) + r.sinValorar).toBe(f.total);
    }
  });

  it('criterio 4 · la suma de cada columna de nivel es la fila de totales', () => {
    const totales = tabla.totales.porCriterio[CRITERIO_MAX]!;
    NIVELES.forEach((_n, i) => {
      const suma = tabla.filas.reduce((t, f) => t + f.porCriterio[CRITERIO_MAX]!.porNivel[i]!, 0);
      expect(suma).toBe(totales.porNivel[i]);
    });
  });

  it('criterio 2 · su fila de totales es la fila del máximo de la matriz', () => {
    const filaMaximo = matrizValoracion({
      activos: INVENTARIO,
      dimensiones: DIMENSIONES,
      niveles: NIVELES,
      umbral: 4,
      criterios: criterios(DIMENSIONES, 'Valor'),
    })[0]!;
    const totales = tabla.totales.porCriterio[CRITERIO_MAX]!;
    expect(totales.porNivel).toEqual(filaMaximo.porNivel);
    expect(totales.sinValorar).toBe(filaMaximo.sinValorar);
    expect(totales.desdeUmbral).toBe(filaMaximo.desdeUmbral);
  });

  it('criterio 9 · los sin propietario van en su propia fila, al final, y no se pierden', () => {
    const ultima = tabla.filas[tabla.filas.length - 1]!;
    expect(ultima.sinAsignar).toBe(true);
    expect(ultima.clave).toBe(SIN_ASIGNAR);
    expect(tabla.filas.reduce((t, f) => t + f.total, 0)).toBe(INVENTARIO.length);
    expect(tabla.fuera).toBe(0);
  });

  it('ordena por ≥ umbral descendente y después por total descendente', () => {
    const reales = tabla.filas.filter((f) => !f.sinAsignar);
    for (let i = 1; i < reales.length; i += 1) {
      const a = reales[i - 1]!;
      const b = reales[i]!;
      expect(a.desdeUmbral > b.desdeUmbral || (a.desdeUmbral === b.desdeUmbral && a.total >= b.total)).toBe(true);
    }
  });

  it('un propietario sin activos no aparece: la tabla lista los cargos que tienen activos', () => {
    expect(tabla.filas.some((f) => f.etiqueta === 'Chief Legal Officer')).toBe(false);
  });
});

describe('tablaAgrupada · Tabla B, por persona', () => {
  const CUATRO = criterios(DIMENSIONES, 'Valor final');
  const conPersona: ActivoAgregable[] = [
    activo('P-1', { D: 2, I: 3, C: 4 }, 'CEO', {
      nombre: 'Juan Felipe Ruiz',
      correo: 'jruiz@cuantico.co',
      activa: true,
    }),
    activo('P-2', { D: 3, I: 3, C: 3 }, 'CEO', {
      nombre: 'Juan Felipe Ruiz',
      correo: 'jruiz@cuantico.co',
      activa: true,
    }),
    activo('P-3', { D: 5, I: 1, C: 1 }, 'CEO', {
      nombre: 'Albeiro Medina',
      correo: 'amedina@cuantico.co',
      activa: false,
    }),
  ];
  const inventario = [...INVENTARIO, ...conPersona];
  const tabla = tablaAgrupada({
    activos: inventario,
    dimensiones: DIMENSIONES,
    niveles: NIVELES,
    umbral: 4,
    agrupador: 'persona',
    criterios: CUATRO,
    incluirSinAsignar: false,
  });

  it('D-8 · no lleva fila «Sin asignar» y dice cuántos quedan fuera', () => {
    expect(tabla.filas.some((f) => f.sinAsignar)).toBe(false);
    expect(tabla.fuera).toBe(INVENTARIO.length);
    expect(tabla.filas.reduce((t, f) => t + f.total, 0)).toBe(conPersona.length);
  });

  it('criterio 13 · el total general es el count de los que tienen persona', () => {
    expect(tabla.totales.total).toBe(conPersona.length);
  });

  it('criterio 12 · los cuatro grupos suman, por fila, el mismo total', () => {
    for (const f of tabla.filas) {
      for (const c of CUATRO) {
        const r = f.porCriterio[c.clave]!;
        expect(r.porNivel.reduce((t, n) => t + n, 0) + r.sinValorar).toBe(f.total);
      }
    }
  });

  it('la fila viaja por correo y muestra el correo bajo el nombre', () => {
    const fila = tabla.filas.find((f) => f.etiqueta === 'Juan Felipe Ruiz')!;
    expect(fila.clave).toBe('jruiz@cuantico.co');
    expect(fila.subtitulo).toBe('jruiz@cuantico.co');
    expect(fila.total).toBe(2);
  });

  it('una persona inactiva con activos en la mano aparece, marcada', () => {
    const fila = tabla.filas.find((f) => f.etiqueta === 'Albeiro Medina')!;
    expect(fila.inactiva).toBe(true);
  });

  it('criterio 14 · sin ninguna persona asignada, la tabla no tiene filas', () => {
    const vacia = tablaAgrupada({
      activos: INVENTARIO,
      dimensiones: DIMENSIONES,
      niveles: NIVELES,
      umbral: 4,
      agrupador: 'persona',
      criterios: CUATRO,
      incluirSinAsignar: false,
    });
    expect(vacia.filas).toEqual([]);
    expect(vacia.totales.total).toBe(0);
    expect(vacia.fuera).toBe(INVENTARIO.length);
  });
});

describe('topesDeTinte', () => {
  it('escala dentro de cada criterio, no sobre la tabla entera', () => {
    const CUATRO = criterios(DIMENSIONES, 'Valor final');
    const tabla = tablaAgrupada({
      activos: INVENTARIO,
      dimensiones: DIMENSIONES,
      niveles: NIVELES,
      umbral: 4,
      agrupador: 'propietario',
      criterios: CUATRO,
      incluirSinAsignar: true,
    });
    const topes = topesDeTinte(tabla.filas, CUATRO);
    for (const c of CUATRO) {
      const maximoDelGrupo = Math.max(
        ...tabla.filas.flatMap((f) => f.porCriterio[c.clave]!.porNivel),
      );
      expect(topes[c.clave]).toBe(maximoDelGrupo);
    }
  });

  it('la fila de totales no entra en el tope', () => {
    const uno = [{ clave: CRITERIO_MAX, etiqueta: 'Valor final' }];
    const tabla = tablaAgrupada({
      activos: INVENTARIO,
      dimensiones: DIMENSIONES,
      niveles: NIVELES,
      umbral: 4,
      agrupador: 'propietario',
      criterios: uno,
      incluirSinAsignar: true,
    });
    const topes = topesDeTinte(tabla.filas, uno);
    const topeTotales = Math.max(...tabla.totales.porCriterio[CRITERIO_MAX]!.porNivel);
    expect(topes[CRITERIO_MAX]!).toBeLessThanOrEqual(topeTotales);
  });
});
