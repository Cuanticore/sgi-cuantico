// lib/sig/__tests__/auditorias.test.ts
//
// El estado se calcula (decisión 3.1.4); C2 independencia; C7 vencimiento contra el
// plazo; C5 solo NC y OM promueven (C9).

import {
  coberturaDeNorma,
  esIndependiente,
  estadoAuditoria,
  listarFaltantes,
  promueveHallazgo,
  vencidoEntrega,
  nombreDeCapitulo,
  rotuloDeCapitulo,
} from '../auditorias';

describe('estadoAuditoria', () => {
  it('sin notas: planificada', () => {
    expect(
      estadoAuditoria({ emitidoEn: null, cerradaEn: null, notas: 0, preliminar: false }),
    ).toBe('PLANIFICADA');
  });

  it('con notas y sin informe: en ejecución', () => {
    expect(
      estadoAuditoria({ emitidoEn: null, cerradaEn: null, notas: 3, preliminar: false }),
    ).toBe('EN_EJECUCION');
  });

  it('con preliminar: informe preliminar', () => {
    expect(
      estadoAuditoria({ emitidoEn: null, cerradaEn: null, notas: 3, preliminar: true }),
    ).toBe('INFORME_PRELIMINAR');
  });

  it('emitida manda: es un acto de una persona', () => {
    expect(
      estadoAuditoria({ emitidoEn: new Date(), cerradaEn: null, notas: 3, preliminar: true }),
    ).toBe('EMITIDA');
  });
});

describe('esIndependiente (C2)', () => {
  it('un auditor no puede auditar el proceso del que es responsable', () => {
    expect(esIndependiente('Gestión de calidad', 'Gestión de calidad')).toBe(false);
    expect(esIndependiente('Gestión comercial', 'Gestión de calidad')).toBe(true);
  });

  it('un auditor sin proceso asignado es independiente de cualquiera', () => {
    expect(esIndependiente('Gestión de calidad', null)).toBe(true);
  });
});

describe('vencidoEntrega (C7)', () => {
  it('vence cuando pasan los días del plazo desde el cierre', () => {
    expect(vencidoEntrega(new Date('2026-02-20'), 4, new Date('2026-02-24'))).toBe(false);
    expect(vencidoEntrega(new Date('2026-02-20'), 4, new Date('2026-02-25'))).toBe(true);
  });
});

describe('promueveHallazgo (C5, C9)', () => {
  it('NC y OM promueven; OK, RM y Fortaleza no', () => {
    expect(promueveHallazgo('NC')).toBe(true);
    expect(promueveHallazgo('OM')).toBe(true);
    expect(promueveHallazgo('OK')).toBe(false);
    expect(promueveHallazgo('RM')).toBe(false);
    expect(promueveHallazgo('FORTALEZA')).toBe(false);
  });
});
describe('coberturaDeNorma', () => {
  const AUDITABLES = [
    { numeral: '4.1' }, { numeral: '4.2' }, { numeral: '7.1.5' },
    { numeral: '8.5.3' }, { numeral: '10.3' },
  ];

  it('cuenta los numerales tocados en el año y nombra los que faltan', () => {
    const r = coberturaDeNorma(AUDITABLES, [
      { numeral: '4.1' }, { numeral: '4.2' }, { numeral: '4.1' },
    ]);
    expect(r.cubiertos).toBe(2);
    expect(r.total).toBe(5);
    expect(r.faltantes).toEqual(['7.1.5', '8.5.3', '10.3']);
    expect(r.porciento).toBe(40);
  });

  // El denominador se calculaba como `numerales.length + 4`: agregar una celda BAJABA el
  // porcentaje. Acá el denominador es la norma y no se mueve.
  it('agregar una celda nunca baja la cobertura', () => {
    const antes = coberturaDeNorma(AUDITABLES, [{ numeral: '4.1' }]);
    const despues = coberturaDeNorma(AUDITABLES, [{ numeral: '4.1' }, { numeral: '4.2' }]);
    expect(despues.porciento).toBeGreaterThan(antes.porciento as number);
    expect(despues.total).toBe(antes.total);
  });

  // Una celda contra algo que dejo de ser auditable no debe inflar la cobertura.
  it('una celda fuera del listado auditable no cuenta', () => {
    const r = coberturaDeNorma(AUDITABLES, [{ numeral: '4.1' }, { numeral: '9.9.9' }]);
    expect(r.cubiertos).toBe(1);
  });

  it('sin celdas la cobertura es cero y faltan todos', () => {
    const r = coberturaDeNorma(AUDITABLES, []);
    expect(r.porciento).toBe(0);
    expect(r.faltantes).toHaveLength(5);
  });

  it('sin norma cargada no se inventa un porcentaje', () => {
    expect(coberturaDeNorma([], []).porciento).toBeNull();
  });
});

describe('listarFaltantes', () => {
  it('usa «y» antes del ultimo', () => {
    expect(listarFaltantes(['7.1.5', '8.5.3', '8.5.5', '10.3'])).toBe(
      '7.1.5, 8.5.3, 8.5.5 y 10.3',
    );
  });

  it('uno solo va suelto', () => {
    expect(listarFaltantes(['10.3'])).toBe('10.3');
  });

  // Veintiocho numerales en una linea dejan de leerse y tapan el resto de la leyenda.
  it('recorta cuando son muchos', () => {
    const muchos = Array.from({ length: 10 }, (_, i) => `9.${i}`);
    expect(listarFaltantes(muchos, 3)).toBe('9.0, 9.1, 9.2 y 7 más');
  });

  it('ninguno no deja texto colgando', () => {
    expect(listarFaltantes([])).toBe('');
  });
});

// ─── El nombre del capítulo ────────────────────────────────────────────────────────────
//
// El tablero mostraba «capítulo 8» y nada más. «8» no le dice nada a quien no se sabe la
// estructura de memoria, y esa persona es justo la que abre el tablero para entender dónde
// está el hueco de cobertura.
//
// Lo que se prueba acá NO es la tabla de nombres: es que el módulo se calle cuando no puede
// afirmar. El catálogo se importa desde Excel y puede traer un decreto, donde el capítulo 8
// no es «Operación» ni nada parecido.
describe('nombreDeCapitulo', () => {
  const ISO9001 = { codigo: 'ISO9001', nombre: 'Sistemas de gestión de la calidad' };

  it('nombra los capítulos de una norma con Anexo SL', () => {
    expect(nombreDeCapitulo(ISO9001, '4')).toBe('Contexto');
    expect(nombreDeCapitulo(ISO9001, '8')).toBe('Operación');
    expect(nombreDeCapitulo(ISO9001, '10')).toBe('Mejora');
  });

  // La estructura de alto nivel es la MISMA en todas las normas de sistemas de gestión.
  // Por eso hay un mapa y no uno por norma.
  it.each([
    ['ISO 27001', 'ISO 27001', 'Seguridad de la información'],
    ['ISO 45001', 'ISO45001', 'Seguridad y salud en el trabajo'],
    ['ISO 14001', 'X-14001', 'Gestión ambiental'],
  ])('%s también sigue el Anexo SL', (_n, codigo, nombre) => {
    expect(nombreDeCapitulo({ codigo, nombre }, '8')).toBe('Operación');
  });

  // Reconoce la norma por el nombre cuando el código viene con otra convención: el catálogo
  // se importa desde Excel y nadie garantiza cómo lo escribieron.
  it('reconoce la norma por el nombre si el código no la delata', () => {
    expect(nombreDeCapitulo({ codigo: 'N-001', nombre: 'ISO 9001:2015' }, '5')).toBe('Liderazgo');
  });

  // Éste es el caso que importa: callarse vale más que inventar.
  it('una norma ajena al Anexo SL no recibe nombres inventados', () => {
    const decreto = { codigo: 'DEC-1072', nombre: 'Decreto Único Reglamentario del Sector Trabajo' };
    expect(nombreDeCapitulo(decreto, '8')).toBeNull();
  });

  // Los capítulos 1 a 3 son objeto, referencias y términos: no traen requisitos auditables.
  it('los capítulos sin requisitos auditables no tienen nombre', () => {
    expect(nombreDeCapitulo(ISO9001, '1')).toBeNull();
    expect(nombreDeCapitulo(ISO9001, '3')).toBeNull();
  });

  it('un capítulo desconocido tampoco', () => {
    expect(nombreDeCapitulo(ISO9001, '99')).toBeNull();
  });
});

describe('rotuloDeCapitulo', () => {
  it('junta número y nombre cuando lo hay', () => {
    expect(rotuloDeCapitulo({ codigo: 'ISO9001', nombre: 'Calidad' }, '8')).toBe('8 · Operación');
  });

  // Sin nombre devuelve el número pelado: el número al menos no miente.
  it('sin nombre devuelve el número solo', () => {
    expect(rotuloDeCapitulo({ codigo: 'DEC-1072', nombre: 'Decreto' }, '8')).toBe('8');
  });
});
