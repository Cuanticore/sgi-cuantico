// lib/sgsi/__tests__/informe-valoracion.test.ts
//
// Las cuentas que el comité firma. Lo que se prueba acá no es que sume: es que el informe no
// pueda decir algo distinto de lo que muestra la pantalla, y que no pueda perder un activo
// ni confundir «sin calcular» con «bajo».

import {
  anclaDeProceso,
  armarInforme,
  SIN_CALCULAR,
  type ActivoDelInforme,
  type AceptacionDelInforme,
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
