// lib/sgsi/__tests__/analisis-riesgos.test.ts
//
// REQ-SIG-20 §5 (P4, D7) — tarea 3.8. El fixture reproduce 37/3/34 (en análisis / valor 5 /
// valor 4) DESDE la distribución completa de 299 activos (3·5, 34·4, 244·3, 18·2), nunca
// escribiendo esos tres números a mano: si alguien cambia la forma de construir el fixture y
// las cifras siguen dando 37/3/34, es porque la cuenta las produjo, no porque coincidieron.
//
// El caso que más importa (§10 del repo, «las tarjetas y la lista nunca se contradicen»): un
// bloque de pruebas recorre varias combinaciones de filtros y comprueba, para cada una, que
// `tarjetasAnalisis(...).enAnalisis.n === filasAnalisis(...).length`. Es la misma garantía
// que REQ-SIG-18 exigió para el inventario, ahora sobre esta pantalla.

import {
  FILTROS_ANALISIS_VACIOS,
  consultaDeFiltrosAnalisis,
  TODAS_CRITICIDADES,
  SIN_ASIGNAR,
  filasAnalisis,
  filtrosAnalisisDesdeUrl,
  ordenarPorCriticidad,
  parametrosDeFiltrosAnalisis,
  tarjetasAnalisis,
  type ActivoAnalizable,
  type CatalogosFiltroAnalisis,
  type DatosAnalisis,
  type FiltrosAnalisis,
  type ResolverDeudaPlan,
  type RiesgoAnalizable,
} from '../analisis-riesgos';
import type { UmbralRiesgo } from '../riesgo-activo';

// Las mismas cuatro bandas que `umbral_riesgo` siembra hoy (ver `riesgo-activo.ts`), en
// minúsculo: Crítico ≥ 20, Alto 10-20, Medio 4-10, Bajo < 4. Los valores exactos no importan
// para estas pruebas más que su orden — lo que importa es que "Crítico" sea alcanzable.
const BANDAS: UmbralRiesgo[] = [
  { nombre: 'Crítico', desde: '20', hasta: '999999', orden: 1 },
  { nombre: 'Alto', desde: '10', hasta: '19.9999', orden: 2 },
  { nombre: 'Medio', desde: '4', hasta: '9.9999', orden: 3 },
  { nombre: 'Bajo', desde: '0', hasta: '3.9999', orden: 4 },
];

/// El umbral vigente es 4 en las 299 pruebas; `datos()` lo fija para no repetirlo en cada
/// llamada.
function datos(activos: ActivoAnalizable[]): DatosAnalisis {
  return { activos, bandas: BANDAS, umbral: 4 };
}

function riesgo(p: Partial<RiesgoAnalizable> = {}): RiesgoAnalizable {
  return {
    amenazaCodigo: 'A.24',
    amenazaNombre: 'Denegación de servicio',
    potencial: '25',
    residual: '25',
    obsoleto: false,
    // A.24 degrada sólo disponibilidad — la amenaza del caso de MINTRACE.
    degradacion: { D: 1, I: 0, C: 0 },
    ...p,
  };
}

/// Un control principal designado, con su nivel en puntos (REQ-SIG-24). Sin él, la amenaza
/// cae en `sin-principal` y la brecha NO SE PUEDE EVALUAR — que es el estado real de las 57
/// amenazas hoy, mientras REQ-SIG-21 no asigne las 272 relevancias.
function conPrincipal(nivel: number | null, p: Partial<RiesgoAnalizable> = {}): RiesgoAnalizable {
  return riesgo({ principal: { codigo: 'A.8.14', nivel }, ...p });
}

function activo(p: Partial<ActivoAnalizable> = {}): ActivoAnalizable {
  return {
    codigo: 'TEC-GEN-0001',
    nombre: 'Activo de prueba',
    valor: 4,
    valores: { D: 4, I: 4, C: 4 },
    criticidad: null,
    proceso: 'Gestión Tecnológica',
    propietario: 'Chief Operating Officer',
    persona: null,
    personaCorreo: null,
    riesgos: [riesgo()],
    ...p,
  };
}

// Recomendación del auditor (18/09/2026): el valor del activo es `max(D, I, C)`, y esa
// agregación borra CUÁL dimensión lo puso ahí. Dos activos en valor 5 —uno por
// disponibilidad, otro por confidencialidad— exigen controles distintos, y la grilla los
// mostraba idénticos.
describe('la fila conserva el valor por dimensión, no sólo el máximo', () => {
  it('lleva D, I y C tal como vienen del activo', () => {
    const [fila] = filasAnalisis(
      { activos: [activo({ valor: 5, valores: { D: 5, I: 2, C: 3 } })], bandas: BANDAS, umbral: 4 },
      FILTROS_ANALISIS_VACIOS,
    );
    expect(fila.valores).toEqual({ D: 5, I: 2, C: 3 });
  });

  // El máximo tiene que seguir saliendo del activo y no recalcularse acá: `valorActivo` de
  // `formulas.ts` es su único dueño, y una segunda cuenta es como las dos se separan.
  it('el valor agregado sigue siendo el que trae el activo', () => {
    const [fila] = filasAnalisis(
      { activos: [activo({ valor: 5, valores: { D: 5, I: 2, C: 3 } })], bandas: BANDAS, umbral: 4 },
      FILTROS_ANALISIS_VACIOS,
    );
    expect(fila.valor).toBe(5);
  });
});

/// Construye los 299 activos de la distribución V19 (§2 del handoff): 3 en valor 5, 34 en
/// valor 4, 244 en valor 3, 18 en valor 2. Los de valor 3 y 2 no entran al análisis (umbral
/// 4) y no llevan riesgos, igual que un activo bajo el umbral no los genera (P1).
function distribucionV19(): ActivoAnalizable[] {
  const activos: ActivoAnalizable[] = [];
  let n = 0;
  const siguienteCodigo = () => `TEC-GEN-${String(++n).padStart(4, '0')}`;

  for (let i = 0; i < 3; i++) {
    activos.push(activo({ codigo: siguienteCodigo(), valor: 5 }));
  }
  for (let i = 0; i < 34; i++) {
    activos.push(activo({ codigo: siguienteCodigo(), valor: 4 }));
  }
  for (let i = 0; i < 244; i++) {
    activos.push(activo({ codigo: siguienteCodigo(), valor: 3, riesgos: [] }));
  }
  for (let i = 0; i < 18; i++) {
    activos.push(activo({ codigo: siguienteCodigo(), valor: 2, riesgos: [] }));
  }
  return activos;
}

describe('§5.1 · las cinco tarjetas, desde la distribución (tarea 3.8)', () => {
  it('reproduce 37/3/34 sin números a mano', () => {
    const activos = distribucionV19();
    const tarjetas = tarjetasAnalisis(datos(activos), FILTROS_ANALISIS_VACIOS);

    expect(tarjetas.enAnalisis).toEqual({ n: 37, deTotal: 299 });
    expect(tarjetas.muyAltos).toBe(3);
    expect(tarjetas.altos).toBe(34);
  });

  it('la lista trae exactamente los 37 activos en análisis, y solo esos', () => {
    const activos = distribucionV19();
    const filas = filasAnalisis(datos(activos), FILTROS_ANALISIS_VACIOS);
    expect(filas).toHaveLength(37);
    expect(filas.every((f) => f.valor >= 4)).toBe(true);
  });

  it('SIN PLAN es null —no 0— cuando no se provee resolutor: la Fase 4 no existe todavía', () => {
    const activos = [activo({ riesgos: [riesgo({ residual: '25', potencial: '25' })] })];
    const tarjetas = tarjetasAnalisis(datos(activos), FILTROS_ANALISIS_VACIOS);
    expect(tarjetas.sinPlan).toBeNull();
  });

  // REQ-SIG-24 §7 · la tarjeta ya no lee la banda del residual, que es inalcanzable: lee la
  // BRECHA. Estos activos tienen `valores.D = 4` y la amenaza degrada sólo D, así que la
  // exigencia por valor es 70 % (§6).
  it('CON BRECHA cuenta brechas MEDIDAS, y lo no evaluable va aparte', () => {
    const conBrecha = activo({ codigo: 'TEC-GEN-0001', riesgos: [conPrincipal(50)] });
    const cubierto = activo({ codigo: 'TEC-GEN-0002', riesgos: [conPrincipal(70)] });
    // Sin principal designado: no es «cumple», es «no se sabe».
    const noEvaluable = activo({ codigo: 'TEC-GEN-0003', riesgos: [riesgo()] });

    const tarjetas = tarjetasAnalisis(
      datos([conBrecha, cubierto, noEvaluable]),
      FILTROS_ANALISIS_VACIOS,
    );
    expect(tarjetas.conBrecha).toBe(1);
    expect(tarjetas.sinDeterminar).toBe(1);
  });

  it('un activo cuya brecha no se puede evaluar NO cuenta como que no requiere plan', () => {
    // Es la diferencia entera entre «no falta nada» y «nadie miró». Hoy cubre las 57
    // amenazas, así que esta cifra mide cuánto del análisis todavía no se puede hacer.
    const sinPrincipal = activo({ riesgos: [riesgo()] });
    const filas = filasAnalisis(datos([sinPrincipal]), FILTROS_ANALISIS_VACIOS);
    expect(filas[0].estadoPlan).toBe('sin-determinar');
  });

  it('el principal designado pero sin evaluar tampoco es cumplimiento', () => {
    const filas = filasAnalisis(
      datos([activo({ riesgos: [conPrincipal(null)] })]),
      FILTROS_ANALISIS_VACIOS,
    );
    expect(filas[0].estadoPlan).toBe('sin-determinar');
  });

  it('la columna Brecha lleva los puntos que faltan', () => {
    const filas = filasAnalisis(
      datos([activo({ riesgos: [conPrincipal(50)] })]),
      FILTROS_ANALISIS_VACIOS,
    );
    expect(filas[0].peorBrecha).toBe(20);
  });

  it('con resolutor, SIN PLAN cuenta los activos con alguna BRECHA sin plan activo', () => {
    const conPlan = activo({
      codigo: 'TEC-GEN-0001',
      riesgos: [conPrincipal(50, { amenazaCodigo: 'A.24' })],
    });
    const sinPlan = activo({
      codigo: 'TEC-GEN-0002',
      riesgos: [conPrincipal(50, { amenazaCodigo: 'A.11' })],
    });
    const resolver: ResolverDeudaPlan = (r) => r.activoCodigo === 'TEC-GEN-0001';

    const tarjetas = tarjetasAnalisis(datos([conPlan, sinPlan]), FILTROS_ANALISIS_VACIOS, resolver);
    expect(tarjetas.sinPlan).toBe(1);

    const filas = filasAnalisis(datos([conPlan, sinPlan]), FILTROS_ANALISIS_VACIOS, resolver);
    expect(filas.find((f) => f.codigo === 'TEC-GEN-0001')?.estadoPlan).toBe('con-plan');
    expect(filas.find((f) => f.codigo === 'TEC-GEN-0002')?.estadoPlan).toBe('pendiente');
  });
});

describe('§5.2 · orden por peor residual descendente', () => {
  it('el peor residual va primero; sin residual calculado va al final', () => {
    const activos = [
      activo({ codigo: 'TEC-GEN-0001', riesgos: [riesgo({ residual: '5' })] }), // Bajo
      activo({ codigo: 'TEC-GEN-0002', riesgos: [riesgo({ residual: '25' })] }), // Crítico
      activo({ codigo: 'TEC-GEN-0003', riesgos: [riesgo({ residual: null })] }), // sin calcular
      activo({ codigo: 'TEC-GEN-0004', riesgos: [riesgo({ residual: '15' })] }), // Alto
    ];
    const filas = filasAnalisis(datos(activos), FILTROS_ANALISIS_VACIOS);
    expect(filas.map((f) => f.codigo)).toEqual([
      'TEC-GEN-0002',
      'TEC-GEN-0004',
      'TEC-GEN-0001',
      'TEC-GEN-0003',
    ]);
  });
});

describe('§5.3 · seis filtros rescopan lista y tarjetas a la vez (tarea 3.8)', () => {
  const A = activo({ codigo: 'TEC-GEN-0001', valor: 5, proceso: 'Gestión Tecnológica', propietario: 'COO', persona: 'Ana', personaCorreo: 'ana@cuantico.co', riesgos: [riesgo({ residual: '25' })] });
  const B = activo({ codigo: 'TEC-GEN-0002', valor: 4, proceso: 'Gestión Financiera', propietario: 'CFO', persona: null, personaCorreo: null, riesgos: [riesgo({ residual: '15', potencial: '15' })] });
  const activos = [A, B];

  it('proceso', () => {
    const filtros: FiltrosAnalisis = { ...FILTROS_ANALISIS_VACIOS, proceso: 'Gestión Financiera' };
    expect(filasAnalisis(datos(activos), filtros).map((f) => f.codigo)).toEqual(['TEC-GEN-0002']);
  });

  it('propietario', () => {
    const filtros: FiltrosAnalisis = { ...FILTROS_ANALISIS_VACIOS, propietario: 'COO' };
    expect(filasAnalisis(datos(activos), filtros).map((f) => f.codigo)).toEqual(['TEC-GEN-0001']);
  });

  it('persona, incluido el sentinel "sin asignar"', () => {
    const conPersona: FiltrosAnalisis = { ...FILTROS_ANALISIS_VACIOS, persona: 'ana@cuantico.co' };
    expect(filasAnalisis(datos(activos), conPersona).map((f) => f.codigo)).toEqual(['TEC-GEN-0001']);

    const sinPersona: FiltrosAnalisis = { ...FILTROS_ANALISIS_VACIOS, persona: SIN_ASIGNAR };
    expect(filasAnalisis(datos(activos), sinPersona).map((f) => f.codigo)).toEqual(['TEC-GEN-0002']);
  });

  it('valor', () => {
    const filtros: FiltrosAnalisis = { ...FILTROS_ANALISIS_VACIOS, valor: 5 };
    expect(filasAnalisis(datos(activos), filtros).map((f) => f.codigo)).toEqual(['TEC-GEN-0001']);
  });

  it('bandaResidual (rojo/verde/blanco, reusado de la tarea 1.7/3.11)', () => {
    const filtros: FiltrosAnalisis = { ...FILTROS_ANALISIS_VACIOS, bandaResidual: 'rojo' };
    // A: residual 25 → Crítico → nivel ≥4 → rojo. B: residual 15 → Alto → nivel ≥4 → rojo también.
    expect(filasAnalisis(datos(activos), filtros).map((f) => f.codigo).sort()).toEqual([
      'TEC-GEN-0001',
      'TEC-GEN-0002',
    ]);
  });

  it('estadoPlan', () => {
    const filtros: FiltrosAnalisis = { ...FILTROS_ANALISIS_VACIOS, estadoPlan: 'no-requiere' };
    // REQ-SIG-24 §7 · «no requiere» ya no es «su residual no llega a Crítico» sino «su
    // principal alcanza lo exigido». Con la exigencia por valor en 70 %, A en 50 % tiene
    // brecha y B en 90 % está cubierto.
    const conBrecha = activo({ codigo: 'TEC-GEN-0001', riesgos: [conPrincipal(50)] });
    const cubierto = activo({ codigo: 'TEC-GEN-0002', riesgos: [conPrincipal(90)] });
    expect(
      filasAnalisis(datos([conBrecha, cubierto]), filtros).map((f) => f.codigo),
    ).toEqual(['TEC-GEN-0002']);
  });

  it('las tarjetas y la lista nunca se contradicen bajo ninguna combinación de filtros', () => {
    const combinaciones: FiltrosAnalisis[] = [
      FILTROS_ANALISIS_VACIOS,
      { ...FILTROS_ANALISIS_VACIOS, proceso: 'Gestión Tecnológica' },
      { ...FILTROS_ANALISIS_VACIOS, valor: 4 },
      { ...FILTROS_ANALISIS_VACIOS, bandaResidual: 'rojo' },
      { ...FILTROS_ANALISIS_VACIOS, estadoPlan: 'no-requiere' },
      { ...FILTROS_ANALISIS_VACIOS, proceso: 'Gestión Financiera', valor: 4, bandaResidual: 'rojo' },
    ];
    for (const filtros of combinaciones) {
      const lista = filasAnalisis(datos(activos), filtros);
      const tarjetas = tarjetasAnalisis(datos(activos), filtros);
      expect(tarjetas.enAnalisis.n).toBe(lista.length);
    }
  });
});

describe('§5.3 · URL ⇄ filtros', () => {
  const CATALOGOS: CatalogosFiltroAnalisis = {
    procesos: ['Gestión Tecnológica', 'Gestión Financiera'],
    propietarios: ['COO', 'CFO'],
    personas: ['ana@cuantico.co'],
    criticidades: ['C1', 'C2', 'C3', 'C4', 'C5'],
  };

  it('sin parámetros son los filtros vacíos', () => {
    expect(filtrosAnalisisDesdeUrl(new URLSearchParams(''), CATALOGOS)).toEqual({
      filtros: FILTROS_ANALISIS_VACIOS,
      avisos: [],
    });
  });

  it('round-trip: leer y volver a escribir la consulta reproduce los mismos parámetros', () => {
    const original = 'proceso=Gesti%C3%B3n+Financiera&valor=4&bandaResidual=rojo&estadoPlan=pendiente';
    const { filtros, avisos } = filtrosAnalisisDesdeUrl(new URLSearchParams(original), CATALOGOS);
    expect(avisos).toEqual([]);
    expect(new URLSearchParams(parametrosDeFiltrosAnalisis(filtros)).toString()).toBe(
      new URLSearchParams(original).toString(),
    );
  });

  it('un proceso que no está en el catálogo se ignora y avisa', () => {
    const { filtros, avisos } = filtrosAnalisisDesdeUrl(new URLSearchParams('proceso=Inexistente'), CATALOGOS);
    expect(filtros.proceso).toBe(FILTROS_ANALISIS_VACIOS.proceso);
    expect(avisos[0]).toContain('Inexistente');
  });
});

// ─── REQ-SIG-20 §11 (P9, tarea 4.6) · «sorting by criticality sorts by RTO» ────────────
//
// El código de criticidad (C1..C5) NO es el orden: es un identificador. Ordenar por RTO es
// justo lo contrario de ordenar alfabéticamente por código — coinciden hoy porque C1..C5 se
// numeraron en el mismo sentido que el RTO, pero la prueba tiene que fallar si alguien
// ordena por el string en vez del minuto, y no solo "dar la casualidad" de que ambos
// caminos producen el mismo resultado con datos bien numerados.
describe('§11 · ordenarPorCriticidad sigue el RTO, no el código', () => {
  const RTO_POR_CODIGO = new Map<string, number | null>([
    ['C1', 10],
    ['C2', 240],
    ['C3', 1440],
    ['C4', 4320],
    ['C5', null], // sin SLA
  ]);

  function fila(codigo: string, criticidad: string | null) {
    return filasAnalisis(
      datos([activo({ codigo, criticidad, riesgos: [] })]),
      FILTROS_ANALISIS_VACIOS,
    )[0];
  }

  it('el más exigente (menor RTO) va primero, aunque su código no sea alfabéticamente el primero', () => {
    // C3 y C2 en orden alfabético inverso a su RTO: si el comparador mirara el código en vez
    // del minuto, esta prueba fallaría.
    const filas = [fila('TEC-GEN-0003', 'C3'), fila('TEC-GEN-0001', 'C1'), fila('TEC-GEN-0002', 'C2')];
    const orden = ordenarPorCriticidad(filas, RTO_POR_CODIGO).map((f) => f.criticidad);
    expect(orden).toEqual(['C1', 'C2', 'C3']);
  });

  it('C5 (sin SLA, rtoMinutos null) y un activo sin criticidad declarada van al final', () => {
    const filas = [
      fila('TEC-GEN-0005', 'C5'),
      fila('TEC-GEN-0001', 'C1'),
      fila('TEC-GEN-0000', null),
    ];
    const orden = ordenarPorCriticidad(filas, RTO_POR_CODIGO).map((f) => f.codigo);
    expect(orden[0]).toBe('TEC-GEN-0001'); // C1, el más exigente
    expect(orden.slice(1)).toEqual(['TEC-GEN-0000', 'TEC-GEN-0005']); // orden estable por código
  });
});

// REQ-SIG-20 §11 (P9) · el filtro de criticidad. «Sin clasificar» es una respuesta y no la
// ausencia de filtro: hoy es el estado de casi todo el inventario, y poder aislarlo es lo
// que permite ir cerrandola.
describe('filtro de criticidad', () => {
  const CAT: CatalogosFiltroAnalisis = {
    procesos: [],
    propietarios: [],
    personas: [],
    criticidades: ['C1', 'C2', 'C3', 'C4', 'C5'],
  };
  const leer = (q: string) => filtrosAnalisisDesdeUrl(new URLSearchParams(q), CAT);

  it('un codigo del catalogo se toma tal cual', () => {
    expect(leer('criticidad=C1').filtros.criticidad).toBe('C1');
  });

  it('«sin clasificar» viaja por el mismo centinela que propietario y persona', () => {
    expect(leer(`criticidad=${SIN_ASIGNAR}`).filtros.criticidad).toBe(SIN_ASIGNAR);
  });

  it('un codigo que no existe se ignora y avisa, en vez de vaciar la lista en silencio', () => {
    const r = leer('criticidad=C9');
    expect(r.filtros.criticidad).toBe(TODAS_CRITICIDADES);
    expect(r.avisos.join(' ')).toMatch(/criticidad/);
  });

  it('sin el parametro queda en «todas»', () => {
    expect(leer('').filtros.criticidad).toBe(TODAS_CRITICIDADES);
  });

  it('no ensucia el enlace cuando esta en su valor por omision', () => {
    expect(parametrosDeFiltrosAnalisis(FILTROS_ANALISIS_VACIOS).criticidad).toBeUndefined();
  });

  it('y si viaja al enlace, vuelve igual', () => {
    const filtros = { ...FILTROS_ANALISIS_VACIOS, criticidad: 'C2' };
    expect(leer(consultaDeFiltrosAnalisis(filtros).slice(1)).filtros.criticidad).toBe('C2');
  });
});
