// lib/sig/__tests__/tablero-tareas.test.ts
//
// El tablero muestra numeros que un lider usa para decidir a quien le escribe este mes. Lo
// que se prueba acá es que esos numeros no puedan mentir de las formas en que ya mintieron
// antes en este proyecto: un denominador inventado, un promedio de todo el historico, una
// resta de fechas empaquetadas.

import { deudaVencida } from '../cumplimiento';
import {
  antiguedadDeDeuda,
  armarTitular,
  colorDeCumplimiento,
  cumplimientoPorArea,
  peoresObligaciones,
  segmentosDe,
  type AsignacionDelTablero,
} from '../tablero-tareas';

const HOY = new Date('2026-09-02T00:00:00.000Z');

let siguiente = 1;
function a(
  estado: AsignacionDelTablero['estado'],
  limite: string,
  cierre: string | null,
  extra: Partial<AsignacionDelTablero> = {},
): AsignacionDelTablero {
  return {
    id: siguiente++,
    estado,
    fechaLimite: new Date(`${limite}T00:00:00.000Z`),
    fechaCierre: cierre === null ? null : new Date(`${cierre}T00:00:00.000Z`),
    personaId: 1,
    cerradaPor: null,
    areaId: 1,
    obligacionId: 1,
    ...extra,
  };
}

describe('deudaVencida · la resta de fechas empaquetadas', () => {
  // El defecto: `diaDe` devuelve YYYYMMDD, que compara bien y resta mal. Vencida AYER
  // cruzando el fin de mes daba 20260201 - 20260131 = 70 «dias».
  it('vencida ayer cruzando el fin de mes dice 1 dia, no 70', () => {
    const r = deudaVencida([a('PENDIENTE', '2026-01-31', null)], new Date('2026-02-01T00:00:00Z'));
    expect(r.cantidad).toBe(1);
    expect(r.masAntiguaDias).toBe(1);
  });

  it('45 dias reales sobre dos cambios de mes dicen 45', () => {
    const r = deudaVencida([a('PENDIENTE', '2026-01-15', null)], new Date('2026-03-01T00:00:00Z'));
    expect(r.masAntiguaDias).toBe(45);
  });

  it('sin vencidas no hay antiguedad que reportar', () => {
    expect(deudaVencida([a('REALIZADA', '2026-08-10', '2026-08-09')], HOY)).toEqual({
      cantidad: 0,
      masAntiguaDias: null,
    });
  });
});

describe('segmentosDe', () => {
  it('los tres estados suman el total y el 100 %', () => {
    const s = segmentosDe({
      asignadas: 10,
      realizadasATiempo: 7,
      realizadasTarde: 2,
      pendientes: 1,
      porciento: 70,
    });
    expect(s.map((x) => x.n)).toEqual([7, 2, 1]);
    expect(s.reduce((t, x) => t + x.porciento, 0)).toBeCloseTo(100, 1);
  });

  // Un segmento vacio dibuja una franja de 0 px con su borde blanco: una linea que parece
  // un estado que no existe.
  it('un estado en cero no produce segmento', () => {
    const s = segmentosDe({
      asignadas: 5,
      realizadasATiempo: 5,
      realizadasTarde: 0,
      pendientes: 0,
      porciento: 100,
    });
    expect(s).toHaveLength(1);
  });
});

describe('cumplimientoPorArea', () => {
  const AREAS = [
    { id: 1, nombre: 'Gestión Tecnológica' },
    { id: 2, nombre: 'Talento Humano' },
    { id: 3, nombre: 'Gestión Financiera' },
  ];

  it('ordena del peor al mejor: lo que hay que empujar va arriba', () => {
    const asignaciones = [
      // Área 1: 2 de 2 a tiempo = 100 %
      a('REALIZADA', '2026-08-10', '2026-08-09', { areaId: 1 }),
      a('REALIZADA', '2026-08-10', '2026-08-10', { areaId: 1 }),
      // Área 2: 1 de 2 = 50 %
      a('REALIZADA', '2026-08-10', '2026-08-09', { areaId: 2 }),
      a('PENDIENTE', '2026-08-10', null, { areaId: 2 }),
    ];
    const filas = cumplimientoPorArea(asignaciones, AREAS);
    expect(filas.map((f) => f.porciento)).toEqual([50, 100]);
  });

  // Un area sin asignaciones con «0 %» la acusa de incumplir algo que nunca se le pidio.
  it('un área sin asignaciones no aparece', () => {
    const filas = cumplimientoPorArea(
      [a('REALIZADA', '2026-08-10', '2026-08-09', { areaId: 1 })],
      AREAS,
    );
    expect(filas.map((f) => f.nombre)).toEqual(['Gestión Tecnológica']);
  });

  // Si se descartaran, la suma de las filas no daria el titular y alguien lo iba a notar.
  it('las personas sin área se muestran aparte, no se descartan', () => {
    const filas = cumplimientoPorArea(
      [
        a('REALIZADA', '2026-08-10', '2026-08-09', { areaId: 1 }),
        a('PENDIENTE', '2026-08-10', null, { areaId: null }),
      ],
      AREAS,
    );
    expect(filas.map((f) => f.nombre)).toContain('Sin área asignada');
    expect(filas.reduce((t, f) => t + f.total, 0)).toBe(2);
  });
});

describe('antiguedadDeDeuda', () => {
  it('reparte por tramo y los tramos suman el total vencido', () => {
    const asignaciones = [
      a('PENDIENTE', '2026-08-30', null), // 3 d
      a('PENDIENTE', '2026-08-29', null), // 4 d
      a('PENDIENTE', '2026-08-15', null), // 18 d
      a('PENDIENTE', '2026-06-01', null), // 93 d
      a('PENDIENTE', '2026-09-30', null), // futura: NO vencida
      a('REALIZADA', '2026-08-01', '2026-08-01'), // cerrada: NO es deuda
    ];
    const tramos = antiguedadDeDeuda(asignaciones, HOY);
    expect(tramos.map((t) => [t.etiqueta, t.n])).toEqual([
      ['Menos de 7 d', 2],
      ['7 a 30 d', 1],
      ['Más de 30 d', 1],
    ]);
    expect(tramos.reduce((t, x) => t + x.n, 0)).toBe(4);
  });

  // Los bordes son los que el lienzo nombra. Exactamente 7 y exactamente 30 caen al medio.
  it('7 y 30 dias exactos caen en el tramo del medio', () => {
    const tramos = antiguedadDeDeuda(
      [a('PENDIENTE', '2026-08-26', null), a('PENDIENTE', '2026-08-03', null)],
      HOY,
    );
    expect(tramos).toEqual([{ etiqueta: '7 a 30 d', n: 2, porciento: 100 }]);
  });

  it('sin deuda no hay tramos', () => {
    expect(antiguedadDeDeuda([a('REALIZADA', '2026-08-01', '2026-08-01')], HOY)).toEqual([]);
  });
});

describe('peoresObligaciones', () => {
  const OBLIGACIONES = [
    { id: 1, codigo: 'LEC-008', titulo: 'Manual de Riesgos' },
    { id: 2, codigo: 'TAR-006', titulo: 'Evaluación de proveedores' },
    { id: 3, codigo: 'CAP-004', titulo: 'Inducción del SGC' },
  ];

  it('ordena de peor a mejor', () => {
    const asignaciones = [
      // 1 → 0 %
      a('PENDIENTE', '2026-08-10', null, { obligacionId: 1 }),
      a('PENDIENTE', '2026-08-10', null, { obligacionId: 1 }),
      // 2 → 50 %
      a('REALIZADA', '2026-08-10', '2026-08-09', { obligacionId: 2 }),
      a('PENDIENTE', '2026-08-10', null, { obligacionId: 2 }),
      // 3 → 100 %
      a('REALIZADA', '2026-08-10', '2026-08-09', { obligacionId: 3 }),
      a('REALIZADA', '2026-08-10', '2026-08-09', { obligacionId: 3 }),
    ];
    const r = peoresObligaciones(asignaciones, OBLIGACIONES);
    expect(r.map((x) => x.codigo)).toEqual(['LEC-008', 'TAR-006', 'CAP-004']);
  });

  // Con una sola asignacion el resultado solo puede ser 0 % o 100 %. Una obligacion nueva
  // que nadie alcanzo a hacer encabezaria la lista por delante de una que falla en treinta.
  it('una obligación con una sola asignación no encabeza la lista', () => {
    const asignaciones = [
      a('PENDIENTE', '2026-08-10', null, { obligacionId: 1 }), // nueva, 0 % con n=1
      a('REALIZADA', '2026-08-10', '2026-08-11', { obligacionId: 2 }), // tarde
      a('PENDIENTE', '2026-08-10', null, { obligacionId: 2 }),
    ];
    const r = peoresObligaciones(asignaciones, OBLIGACIONES);
    expect(r.map((x) => x.codigo)).toEqual(['TAR-006']);
  });

  it('a igual porcentaje va primero la que afecta a más gente', () => {
    const asignaciones = [
      a('PENDIENTE', '2026-08-10', null, { obligacionId: 1 }),
      a('PENDIENTE', '2026-08-10', null, { obligacionId: 1 }),
      ...Array.from({ length: 5 }, () =>
        a('PENDIENTE', '2026-08-10', null, { obligacionId: 2 }),
      ),
    ];
    const r = peoresObligaciones(asignaciones, OBLIGACIONES);
    expect(r[0].codigo).toBe('TAR-006');
    expect(r[0].total).toBe(5);
  });

  it('respeta el tope de cuántas devuelve', () => {
    const asignaciones = OBLIGACIONES.flatMap((o) => [
      a('PENDIENTE', '2026-08-10', null, { obligacionId: o.id }),
      a('PENDIENTE', '2026-08-10', null, { obligacionId: o.id }),
    ]);
    expect(peoresObligaciones(asignaciones, OBLIGACIONES, 2)).toHaveLength(2);
  });
});

describe('armarTitular', () => {
  const ESTE = [
    a('REALIZADA', '2026-08-10', '2026-08-09'),
    a('REALIZADA', '2026-08-10', '2026-08-11'),
    a('PENDIENTE', '2026-08-10', null),
    a('PENDIENTE', '2026-08-15', null),
  ];

  it('la variación son puntos porcentuales contra el periodo anterior', () => {
    const anterior = [
      a('REALIZADA', '2026-07-10', '2026-07-09'),
      a('REALIZADA', '2026-07-10', '2026-07-09'),
      a('REALIZADA', '2026-07-10', '2026-07-09'),
      a('PENDIENTE', '2026-07-10', null),
    ];
    const t = armarTitular(ESTE, anterior, HOY);
    expect(t.cumplimiento.porciento).toBe(25);
    // 25 − 75 = −50
    expect(t.variacion).toBe(-50);
  });

  // Un 0 se leeria como «igual que el mes pasado», que es una afirmacion sobre un periodo
  // del que no hay dato.
  it('sin periodo anterior la variación es null, no cero', () => {
    expect(armarTitular(ESTE, [], HOY).variacion).toBeNull();
  });

  it('los cierres administrativos se cuentan aparte del cumplimiento', () => {
    const con = [
      ...ESTE,
      a('REALIZADA', '2026-08-10', '2026-08-09', { personaId: 5, cerradaPor: 9 }),
    ];
    const t = armarTitular(con, [], HOY);
    expect(t.cierresAdministrativos).toBe(1);
    // Y sigue contando como realizada a tiempo en el cumplimiento: se informa aparte,
    // no se descuenta.
    expect(t.cumplimiento.realizadasATiempo).toBe(2);
  });
});

describe('colorDeCumplimiento', () => {
  it('usa los tres cortes del lienzo', () => {
    expect(colorDeCumplimiento(95)).toBe('bien');
    expect(colorDeCumplimiento(90)).toBe('bien');
    expect(colorDeCumplimiento(89)).toBe('atencion');
    expect(colorDeCumplimiento(75)).toBe('atencion');
    expect(colorDeCumplimiento(74)).toBe('mal');
  });

  it('sin dato no se pinta de verde', () => {
    expect(colorDeCumplimiento(null)).toBe('atencion');
  });
});
