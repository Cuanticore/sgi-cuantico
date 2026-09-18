// lib/sgsi/__tests__/informe-valoracion.test.ts
//
// Las cuentas que el comité firma. Lo que se prueba acá no es que sume: es que el informe no
// pueda decir algo distinto de lo que muestra la pantalla, y que no pueda perder un activo
// ni confundir «sin calcular» con «bajo».

import {
  agruparEnBandas,
  anclaDeProceso,
  armarInforme,
  peorBanda,
  SIN_CALCULAR,
  type ActivoDelInforme,
  type AceptacionDelInforme,
  type ProcesoDelInforme,
} from '../informe-valoracion';
import { columnasDeEscala, filasDeUmbrales } from '../matriz-clasica';

const NIVELES = ['Muy Alto', 'Alto', 'Medio', 'Bajo', 'Irrelevante'];
const BANDAS = ['Crítico', 'Alto', 'Medio', 'Bajo'];

function activo(p: Partial<ActivoDelInforme> & { codigo: string; proceso: string }): ActivoDelInforme {
  return {
    nombre: `Activo ${p.codigo}`,
    responsable: null,
    tipo: '[D] Datos / Información',
    valor: 3,
    nivelValor: 'Medio',
    entraAlAnalisis: true,
    bandaInherente: 'Alto',
    bandaResidual: 'Medio',
    ...p,
  };
}

const BASE = { aceptaciones: [] as AceptacionDelInforme[], nivelesDeValor: NIVELES, bandas: BANDAS };

describe('el orden de los capítulos', () => {
  it('manda el que más activos pone en el análisis, no el alfabeto', () => {
    // El informe se lee de arriba hacia abajo y el que más expone es el que primero hay que
    // mirar. Alfabético pondría «Gestión Estratégica» —con un activo— antes que Tecnología.
    const informe = armarInforme({
      ...BASE,
      activos: [
        activo({ codigo: 'EST-DAT-0001', proceso: 'Gestión Estratégica' }),
        activo({ codigo: 'TEC-DAT-0001', proceso: 'Tecnología' }),
        activo({ codigo: 'TEC-DAT-0002', proceso: 'Tecnología' }),
      ],
    });
    expect(informe.map((c) => c.proceso)).toEqual(['Tecnología', 'Gestión Estratégica']);
  });

  it('a igual cantidad, desempata el alfabeto en español', () => {
    const informe = armarInforme({
      ...BASE,
      activos: [
        activo({ codigo: 'B-0001', proceso: 'Ñandú' }),
        activo({ codigo: 'A-0001', proceso: 'Animales' }),
      ],
    });
    expect(informe.map((c) => c.proceso)).toEqual(['Animales', 'Ñandú']);
  });

  it('un activo fuera del análisis cuenta en «activos» pero no ordena el capítulo', () => {
    const informe = armarInforme({
      ...BASE,
      activos: [
        activo({ codigo: 'A-1', proceso: 'Poco', entraAlAnalisis: true }),
        activo({ codigo: 'B-1', proceso: 'Mucho', entraAlAnalisis: false }),
        activo({ codigo: 'B-2', proceso: 'Mucho', entraAlAnalisis: false }),
        activo({ codigo: 'B-3', proceso: 'Mucho', entraAlAnalisis: false }),
      ],
    });
    // «Mucho» tiene más activos pero ninguno en el análisis, así que no encabeza.
    expect(informe[0].proceso).toBe('Poco');
    expect(informe[1]).toMatchObject({ proceso: 'Mucho', activos: 3, enAnalisis: 0 });
  });
});

describe('el orden de los activos dentro del capítulo', () => {
  it('peor residual primero', () => {
    const informe = armarInforme({
      ...BASE,
      activos: [
        activo({ codigo: 'C-3', proceso: 'P', bandaResidual: 'Bajo' }),
        activo({ codigo: 'C-1', proceso: 'P', bandaResidual: 'Crítico' }),
        activo({ codigo: 'C-2', proceso: 'P', bandaResidual: 'Medio' }),
      ],
    });
    expect(informe[0].filas.map((f) => f.codigo)).toEqual(['C-1', 'C-2', 'C-3']);
  });

  it('«sin calcular» va al FINAL, no al principio', () => {
    // Un residual desconocido es una deuda del modelo, no el riesgo más alto del proceso.
    // Ponerlo arriba haría que el comité mirara primero lo que nadie midió.
    const informe = armarInforme({
      ...BASE,
      activos: [
        activo({ codigo: 'S-1', proceso: 'P', bandaResidual: null }),
        activo({ codigo: 'S-2', proceso: 'P', bandaResidual: 'Bajo' }),
        activo({ codigo: 'S-3', proceso: 'P', bandaResidual: 'Crítico' }),
      ],
    });
    expect(informe[0].filas.map((f) => f.codigo)).toEqual(['S-3', 'S-2', 'S-1']);
  });
});

describe('los conteos', () => {
  it('los rangos en cero se imprimen igual', () => {
    // «Muy Alto: 0» es una afirmación que alguien quiere leer. Una fila ausente obliga a
    // preguntarse si el rango no existe o si nadie lo contó.
    const informe = armarInforme({
      ...BASE,
      activos: [activo({ codigo: 'A-1', proceso: 'P', nivelValor: 'Medio' })],
    });
    expect(informe[0].porNivelValor).toEqual([
      { etiqueta: 'Muy Alto', n: 0 },
      { etiqueta: 'Alto', n: 0 },
      { etiqueta: 'Medio', n: 1 },
      { etiqueta: 'Bajo', n: 0 },
      { etiqueta: 'Irrelevante', n: 0 },
    ]);
  });

  it('un nivel que no está en la escala declarada aparece igual, al final', () => {
    // Un valor nuevo en el catálogo no puede desaparecer del informe por no estar en una
    // lista escrita a mano.
    const informe = armarInforme({
      ...BASE,
      activos: [activo({ codigo: 'A-1', proceso: 'P', nivelValor: 'Catastrófico' })],
    });
    expect(informe[0].porNivelValor.at(-1)).toEqual({ etiqueta: 'Catastrófico', n: 1 });
  });

  it('«sin calcular» es una fila del conteo residual, no un cero', () => {
    const informe = armarInforme({
      ...BASE,
      activos: [
        activo({ codigo: 'A-1', proceso: 'P', bandaResidual: null }),
        activo({ codigo: 'A-2', proceso: 'P', bandaResidual: 'Bajo' }),
      ],
    });
    expect(informe[0].porBandaResidual).toContainEqual({ etiqueta: SIN_CALCULAR, n: 1 });
    expect(informe[0].porBandaResidual).toContainEqual({ etiqueta: 'Bajo', n: 1 });
  });

  it('la tabla de frecuencias por tipo cuenta todos los activos, entren o no al análisis', () => {
    // Es un censo del inventario del proceso, no del alcance del análisis.
    const informe = armarInforme({
      ...BASE,
      activos: [
        activo({ codigo: 'A-1', proceso: 'P', tipo: '[D] Datos', entraAlAnalisis: true }),
        activo({ codigo: 'A-2', proceso: 'P', tipo: '[D] Datos', entraAlAnalisis: false }),
        activo({ codigo: 'A-3', proceso: 'P', tipo: '[HW] Equipos', entraAlAnalisis: false }),
      ],
    });
    expect(informe[0].porTipo).toEqual([
      { etiqueta: '[D] Datos', n: 2 },
      { etiqueta: '[HW] Equipos', n: 1 },
    ]);
  });

  it('el traslado inherente → residual sólo mira los que entran al análisis', () => {
    const informe = armarInforme({
      ...BASE,
      activos: [
        activo({ codigo: 'A-1', proceso: 'P', bandaInherente: 'Crítico', bandaResidual: 'Alto' }),
        activo({ codigo: 'A-2', proceso: 'P', bandaInherente: 'Crítico', bandaResidual: 'Alto' }),
        activo({
          codigo: 'A-3',
          proceso: 'P',
          entraAlAnalisis: false,
          bandaInherente: null,
          bandaResidual: null,
        }),
      ],
    });
    expect(informe[0].traslado).toEqual([{ inherente: 'Crítico', residual: 'Alto', n: 2 }]);
  });
});

describe('las anclas de la tabla de contenido', () => {
  it('salen del nombre y no de un índice', () => {
    // Un enlace que cambia porque se agregó un proceso antes es un enlace roto en el PDF que
    // alguien ya archivó.
    expect(anclaDeProceso('Gestión Tecnológica')).toBe('gestion-tecnologica');
    expect(anclaDeProceso('I+D & Calidad')).toBe('i-d-calidad');
  });

  it('el ancla del capítulo no depende de cuántos procesos haya antes', () => {
    const uno = armarInforme({ ...BASE, activos: [activo({ codigo: 'A', proceso: 'Tecnología' })] });
    const dos = armarInforme({
      ...BASE,
      activos: [
        activo({ codigo: 'A', proceso: 'Tecnología' }),
        activo({ codigo: 'B', proceso: 'Calidad' }),
      ],
    });
    const anclaTec = (r: ReturnType<typeof armarInforme>) =>
      r.find((c) => c.proceso === 'Tecnología')!.ancla;
    expect(anclaTec(dos)).toBe(anclaTec(uno));
  });
});

describe('las aceptaciones', () => {
  it('cada capítulo se queda con las suyas', () => {
    const aceptacion = (proceso: string, planCodigo: string): AceptacionDelInforme => ({
      activoCodigo: 'A-1',
      activoNombre: 'Activo',
      proceso,
      planCodigo,
      justificacion: 'Acordado por el comité.',
      fechaRevision: '2027-01-31',
    });
    const informe = armarInforme({
      ...BASE,
      activos: [activo({ codigo: 'A-1', proceso: 'P' }), activo({ codigo: 'B-1', proceso: 'Q' })],
      aceptaciones: [aceptacion('P', 'PL-001'), aceptacion('Q', 'PL-002')],
    });
    expect(informe.find((c) => c.proceso === 'P')!.aceptaciones.map((a) => a.planCodigo)).toEqual([
      'PL-001',
    ]);
  });

  it('un proceso sin aceptaciones las deja vacías, para que el informe omita la sección', () => {
    const informe = armarInforme({ ...BASE, activos: [activo({ codigo: 'A', proceso: 'P' })] });
    expect(informe[0].aceptaciones).toEqual([]);
  });
});

// ===========================================================================
// Las matrices — que cuentan RIESGOS y no activos
// ===========================================================================

const FILAS_IMPACTO = filasDeUmbrales([
  { nombre: 'Muy alto', desde: 4.5, hasta: 5 },
  { nombre: 'Alto', desde: 3.5, hasta: 4 },
  { nombre: 'Medio', desde: 2, hasta: 2.5 },
  { nombre: 'Bajo', desde: 0.5, hasta: 1.5 },
  { nombre: 'Muy bajo', desde: 0, hasta: 0.5 },
]);
const COLUMNAS = columnasDeEscala([
  { nombre: 'Muy baja — excepcional', vecesAno: 0.01 },
  { nombre: 'Baja', vecesAno: 0.1 },
  { nombre: 'Media', vecesAno: 1 },
  { nombre: 'Alta', vecesAno: 10 },
  { nombre: 'Muy alta', vecesAno: 100 },
]);
const UMBRALES_RIESGO = [
  { nombre: 'Crítico', desde: 50, hasta: 1e9 },
  { nombre: 'Alto', desde: 10, hasta: 50 },
  { nombre: 'Medio', desde: 1, hasta: 10 },
  { nombre: 'Bajo', desde: 0, hasta: 1 },
];
const EJES = {
  filasImpacto: FILAS_IMPACTO,
  columnasFrecuencia: COLUMNAS,
  umbralesRiesgo: UMBRALES_RIESGO,
};

describe('las matrices del capítulo', () => {
  it('cuentan RIESGOS, así que un activo con tres amenazas pone tres puntos', () => {
    // La cifra que no cuadra a simple vista con `enAnalisis`, y la razón por la que el
    // informe tiene que decirlo en la página.
    const informe = armarInforme({
      ...BASE,
      ...EJES,
      activos: [activo({ codigo: 'A-1', proceso: 'P' })],
      riesgos: [
        { proceso: 'P', impacto: 4.8, aro: 1, aroResidual: 0.1 },
        { proceso: 'P', impacto: 4.8, aro: 1, aroResidual: 0.1 },
        { proceso: 'P', impacto: 4.8, aro: 1, aroResidual: 0.1 },
      ],
    });
    expect(informe[0].enAnalisis).toBe(1);
    expect(informe[0].matrizInherente!.total).toBe(3);
    expect(informe[0].matrizInherente!.conteos[0][2]).toBe(3);
  });

  it('cada proceso cuenta sólo sus riesgos', () => {
    const informe = armarInforme({
      ...BASE,
      ...EJES,
      activos: [activo({ codigo: 'A-1', proceso: 'P' }), activo({ codigo: 'B-1', proceso: 'Q' })],
      riesgos: [
        { proceso: 'P', impacto: 4.8, aro: 1, aroResidual: 1 },
        { proceso: 'Q', impacto: 4.8, aro: 1, aroResidual: 1 },
        { proceso: 'Q', impacto: 4.8, aro: 1, aroResidual: 1 },
      ],
    });
    expect(informe.find((c) => c.proceso === 'P')!.matrizInherente!.total).toBe(1);
    expect(informe.find((c) => c.proceso === 'Q')!.matrizInherente!.total).toBe(2);
  });

  it('el tratamiento se ve: la residual mueve el riesgo de columna', () => {
    const informe = armarInforme({
      ...BASE,
      ...EJES,
      activos: [activo({ codigo: 'A-1', proceso: 'P' })],
      riesgos: [{ proceso: 'P', impacto: 4.8, aro: 10, aroResidual: 0.08 }],
    });
    expect(informe[0].matrizInherente!.conteos[0][3]).toBe(1);
    expect(informe[0].matrizResidual!.conteos[0][1]).toBe(1);
  });

  it('sin residual calculado, la residual lo informa en vez de dibujarlo tratado', () => {
    const informe = armarInforme({
      ...BASE,
      ...EJES,
      activos: [activo({ codigo: 'A-1', proceso: 'P' })],
      riesgos: [{ proceso: 'P', impacto: 4.8, aro: 10, aroResidual: null }],
    });
    expect(informe[0].matrizResidual!.total).toBe(0);
    expect(informe[0].matrizResidual!.sinResidual).toBe(1);
  });

  it('sin riesgos, el capítulo va sin matriz y NO con dos cuadrículas vacías', () => {
    // Una cuadrícula de ceros parece un error de cálculo; la ausencia de la sección dice lo
    // que efectivamente pasa, que es que ese proceso no tiene riesgos ubicables.
    const informe = armarInforme({ ...BASE, ...EJES, activos: [activo({ codigo: 'A', proceso: 'P' })] });
    expect(informe[0].matrizInherente).toBeNull();
    expect(informe[0].matrizResidual).toBeNull();
  });

  it('sin ejes no hay matriz inventada', () => {
    // Si el catálogo de umbrales no llegó, es preferible un informe sin matriz a uno con una
    // matriz armada sobre una escala supuesta.
    const informe = armarInforme({
      ...BASE,
      activos: [activo({ codigo: 'A', proceso: 'P' })],
      riesgos: [{ proceso: 'P', impacto: 4.8, aro: 1, aroResidual: 1 }],
    });
    expect(informe[0].matrizInherente).toBeNull();
  });
});

// ===========================================================================
// La banda del activo — donde «sin calcular» tiene que ganar
// ===========================================================================

describe('peorBanda', () => {
  it('toma la peor de las cifras, no la primera ni el promedio', () => {
    expect(peorBanda([2, 80, 15], UMBRALES_RIESGO)).toBe('Crítico');
  });

  it('un solo riesgo sin calcular deja al activo SIN banda, aunque los otros once esten', () => {
    // La decision que sostiene el informe. La peor de las once seria una cifra optimista
    // presentada como completa: el riesgo que falta puede ser el peor de todos, y el comite
    // estaria firmando una aceptacion sobre un techo que nadie midio.
    expect(peorBanda([2, 80, null], UMBRALES_RIESGO)).toBeNull();
  });

  it('un activo sin riesgos no tiene banda', () => {
    expect(peorBanda([], UMBRALES_RIESGO)).toBeNull();
  });

  it('una cifra fuera de todos los umbrales no se fuerza a una banda', () => {
    expect(peorBanda([-5], UMBRALES_RIESGO)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('agruparEnBandas', () => {
  // Los capítulos del informe son Áreas; el mapa de MAN-SIG-02 tiene bandas. Un comité lee
  // «procesos misionales» y no «Gestión Comercial, Gestión de Proyectos, Soporte»: agrupar
  // es lo que convierte una lista de diez capítulos en un documento navegable.
  const cap = (proceso: string, enAnalisis: number) =>
    ({ proceso, ancla: anclaDeProceso(proceso), enAnalisis }) as ProcesoDelInforme;

  const CAPITULOS = [
    cap('Gestión Tecnológica', 40),
    cap('Gestión Comercial', 20),
    cap('Transversal', 12),
    cap('Gestión Estratégica', 5),
    cap('Gestión Legal y Compras', 2),
  ];

  it('arma las bandas en el orden del mapa: estratégicos, misionales, apoyo', () => {
    const bandas = agruparEnBandas(CAPITULOS);
    expect(bandas.map((b) => b.titulo)).toEqual([
      'Procesos estratégicos',
      'Procesos misionales',
      'Procesos de apoyo',
      'Fuera del mapa de procesos',
    ]);
  });

  it('conserva dentro de cada banda el orden en que venían los capítulos', () => {
    // El orden global —por cuántos activos pone cada proceso en el análisis— lo decide
    // `armarInforme`. Agrupar reparte, no reordena: si acá se volviera a ordenar habría dos
    // criterios de orden y ninguno sería el que dice la cabecera del módulo.
    const apoyo = agruparEnBandas(CAPITULOS).find((b) => b.titulo === 'Procesos de apoyo')!;
    expect(apoyo.capitulos.map((c) => c.proceso)).toEqual([
      'Gestión Tecnológica',
      'Gestión Legal y Compras',
    ]);
  });

  it('un área que no es proceso del mapa va a su propio bloque, no a «Apoyo»', () => {
    const bandas = agruparEnBandas(CAPITULOS);
    const fuera = bandas[bandas.length - 1];
    expect(fuera.capitulos.map((c) => c.proceso)).toEqual(['Transversal']);
    // Y no se cuela en ninguna banda del mapa.
    for (const b of bandas.slice(0, 3)) {
      expect(b.capitulos.map((c) => c.proceso)).not.toContain('Transversal');
    }
  });

  it('las tres bandas del mapa se devuelven aunque queden vacías; la cuarta no', () => {
    // Que el mapa tenga tres bandas es del mapa, no de los datos: una banda que desaparece
    // cuando nadie la ocupa hace creer que el mapa tiene dos. «Fuera del mapa» es lo
    // contrario —no es del mapa—, así que sólo aparece cuando hay algo que poner.
    const bandas = agruparEnBandas([cap('Gestión Comercial', 3)]);
    expect(bandas.map((b) => b.titulo)).toEqual([
      'Procesos estratégicos',
      'Procesos misionales',
      'Procesos de apoyo',
    ]);
    expect(bandas[0].capitulos).toEqual([]);
  });

  it('no pierde ni duplica capítulos', () => {
    // La invariante que hace que el índice del documento cuadre con lo que hay adentro.
    const todos = agruparEnBandas(CAPITULOS).flatMap((b) => b.capitulos);
    expect(todos).toHaveLength(CAPITULOS.length);
    expect(new Set(todos.map((c) => c.proceso)).size).toBe(CAPITULOS.length);
  });

  it('cada banda lleva un ancla estable, derivada de su título', () => {
    const bandas = agruparEnBandas(CAPITULOS);
    expect(bandas[0].ancla).toBe('procesos-estrategicos');
    expect(bandas[3].ancla).toBe('fuera-del-mapa-de-procesos');
  });
});
