// lib/sgsi/__tests__/informe-documento.test.ts
//
// El documento que se imprime, se archiva y se firma. Lo que se prueba acá es que no pueda
// afirmar algo que nadie calculó, y que el texto libre que alguien escribió en un formulario
// no pueda romperlo.

import { documentoInforme, esc, fechaLarga, type DatosDocumento } from '../informe-documento';
import { armarInforme, type ActivoDelInforme } from '../informe-valoracion';
import { columnasDeEscala, filasDeUmbrales } from '../matriz-clasica';

const FILAS_IMPACTO = filasDeUmbrales([
  { nombre: 'Muy alto', desde: 4.5, hasta: 5 },
  { nombre: 'Bajo', desde: 0, hasta: 1.5 },
]);
const COLUMNAS = columnasDeEscala([
  { nombre: 'Baja — cada varios años', vecesAno: 0.1 },
  { nombre: 'Media — una vez al año', vecesAno: 1 },
]);
const UMBRALES_RIESGO = [
  { nombre: 'Crítico', desde: 3, hasta: 1e9 },
  { nombre: 'Bajo', desde: 0, hasta: 3 },
];

function activo(p: Partial<ActivoDelInforme> & { codigo: string; proceso: string }): ActivoDelInforme {
  return {
    nombre: `Activo ${p.codigo}`,
    responsable: 'Jefe de Tecnología',
    tipo: '[D] Datos / Información',
    valor: 5,
    nivelValor: 'Muy Alto',
    entraAlAnalisis: true,
    bandaInherente: 'Crítico',
    bandaResidual: 'Bajo',
    ...p,
  };
}

function documento(over: Partial<DatosDocumento> = {}, activos?: ActivoDelInforme[]): string {
  const capitulos = armarInforme({
    activos: activos ?? [activo({ codigo: 'TEC-DAT-0001', proceso: 'Gestión Tecnológica' })],
    aceptaciones: [],
    nivelesDeValor: ['Muy Alto', 'Bajo'],
    bandas: ['Crítico', 'Bajo'],
    riesgos: [{ proceso: 'Gestión Tecnológica', impacto: 4.8, aro: 1, aroResidual: 0.1 }],
    filasImpacto: FILAS_IMPACTO,
    columnasFrecuencia: COLUMNAS,
    umbralesRiesgo: UMBRALES_RIESGO,
  });
  return documentoInforme({
    capitulos,
    generadoEn: new Date('2026-09-16T12:00:00Z'),
    alcance: 'Todos los procesos',
    filasImpacto: FILAS_IMPACTO,
    columnasFrecuencia: COLUMNAS,
    umbralValoracion: 4,
    totalActivos: 1,
    totalEnAnalisis: 1,
    totalAceptaciones: 0,
    ...over,
  });
}

describe('esc', () => {
  it('neutraliza lo que rompería el documento', () => {
    expect(esc('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('escapa comillas, que es lo que rompe un atributo', () => {
    // Los `title` de la matriz y los `href` de las anclas llevan datos adentro de comillas.
    expect(esc('a" onmouseover="x')).toBe('a&quot; onmouseover=&quot;x');
  });

  it('el ampersand primero, o se escaparía dos veces', () => {
    expect(esc('Ventas & Marketing <S.A.>')).toBe('Ventas &amp; Marketing &lt;S.A.&gt;');
  });

  it('un valor ausente es cadena vacía y no «null» impreso', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('el texto libre de la base no puede romper el documento', () => {
  it('el nombre de un activo con marcado sale escapado', () => {
    // Es texto que alguien escribió en un formulario. Un `<` sin escapar rompería la tabla;
    // uno bien elegido convertiría el informe en un vector.
    const html = documento({}, [
      activo({ codigo: 'A-1', proceso: 'P', nombre: '<img src=x onerror=alert(1)>' }),
    ]);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('un proceso con ampersand no produce una entidad rota', () => {
    const html = documento({}, [activo({ codigo: 'A-1', proceso: 'Ventas & Marketing' })]);
    expect(html).toContain('Ventas &amp; Marketing');
    expect(html).not.toContain('Ventas & Marketing');
  });
});

describe('lo que el documento tiene que decir', () => {
  it('nombra el umbral, porque «entra al análisis» sin criterio no dice nada', () => {
    expect(documento({ umbralValoracion: 4 })).toContain('umbral de 4');
  });

  it('imprime el alcance, para que un informe parcial no se lea como completo', () => {
    expect(documento({ alcance: '1 proceso: Gestión Tecnológica' })).toContain(
      '1 proceso: Gestión Tecnológica',
    );
  });

  it('explica que «Sin calcular» no es «bajo»', () => {
    // La confusión que el informe existe para no provocar.
    expect(documento()).toContain('no está diciendo «bajo»');
  });

  it('avisa que las matrices cuentan riesgos y no activos', () => {
    // Las dos cifras van en la misma página, así que la pregunta obvia al verlas es por qué
    // difieren. El documento tiene que responderla antes de que se haga.
    expect(documento()).toContain('cuentan <strong>riesgos</strong>, no activos');
  });

  it('cada capítulo arranca en página nueva', () => {
    expect(documento()).toContain('page-break-before:always');
  });

  it('el ancla del capítulo enlaza desde la tabla de contenido', () => {
    const html = documento();
    expect(html).toContain('id="gestion-tecnologica"');
    expect(html).toContain('href="#gestion-tecnologica"');
  });
});

describe('lo que el documento NO puede afirmar', () => {
  it('sin activos, el porcentaje es «—» y no «0 %»', () => {
    // Una división por cero impresa como «0 %» afirma algo que nadie calculó.
    const html = documentoInforme({
      capitulos: armarInforme({
        activos: [],
        aceptaciones: [],
        nivelesDeValor: ['Muy Alto'],
        bandas: ['Crítico'],
      }),
      generadoEn: new Date('2026-09-16T12:00:00Z'),
      alcance: 'Todos los procesos',
      filasImpacto: FILAS_IMPACTO,
      columnasFrecuencia: COLUMNAS,
      umbralValoracion: 4,
      totalActivos: 0,
      totalEnAnalisis: 0,
      totalAceptaciones: 0,
    });
    expect(html).not.toContain('0 %');
    expect(html).toContain('no incluye ningún activo');
  });

  it('un proceso sin riesgos no imprime dos cuadrículas de ceros', () => {
    const capitulos = armarInforme({
      activos: [activo({ codigo: 'A-1', proceso: 'P' })],
      aceptaciones: [],
      nivelesDeValor: ['Muy Alto'],
      bandas: ['Crítico'],
      riesgos: [],
      filasImpacto: FILAS_IMPACTO,
      columnasFrecuencia: COLUMNAS,
      umbralesRiesgo: UMBRALES_RIESGO,
    });
    const html = documentoInforme({
      capitulos,
      generadoEn: new Date('2026-09-16T12:00:00Z'),
      alcance: 'Todos',
      filasImpacto: FILAS_IMPACTO,
      columnasFrecuencia: COLUMNAS,
      umbralValoracion: 4,
      totalActivos: 1,
      totalEnAnalisis: 1,
      totalAceptaciones: 0,
    });
    expect(html).toContain('no tiene riesgos ubicables');
    expect(html).not.toContain('Impacto ↓');
  });

  it('una aceptación sin fecha de revisión queda marcada, no en blanco', () => {
    const capitulos = armarInforme({
      activos: [activo({ codigo: 'A-1', proceso: 'P' })],
      aceptaciones: [
        {
          activoCodigo: 'A-1',
          activoNombre: 'Activo A-1',
          proceso: 'P',
          planCodigo: 'PT-001',
          justificacion: 'Acordado por el comité.',
          fechaRevision: null,
        },
      ],
      nivelesDeValor: ['Muy Alto'],
      bandas: ['Crítico'],
    });
    const html = documentoInforme({
      capitulos,
      generadoEn: new Date('2026-09-16T12:00:00Z'),
      alcance: 'Todos',
      filasImpacto: FILAS_IMPACTO,
      columnasFrecuencia: COLUMNAS,
      umbralValoracion: 4,
      totalActivos: 1,
      totalEnAnalisis: 1,
      totalAceptaciones: 1,
    });
    expect(html).toContain('Sin fecha');
    expect(html).toContain('nadie vuelve a mirar');
  });
});

describe('fechaLarga', () => {
  it('no depende del ICU de la máquina que generó el documento', () => {
    // En un documento que se archiva, la fecha no puede salir distinta según dónde se generó.
    expect(fechaLarga(new Date(2026, 8, 16))).toBe('16 de septiembre de 2026');
    expect(fechaLarga(new Date(2026, 0, 1))).toBe('1 de enero de 2026');
  });
});
