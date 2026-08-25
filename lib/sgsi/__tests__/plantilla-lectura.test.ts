// lib/sgsi/__tests__/plantilla-lectura.test.ts
//
// The import reader is the only place in the application where data arrives from outside
// with no form to constrain it. Every case here is a mistake somebody actually makes in a
// spreadsheet.

import { COLUMNAS_PLANTILLA } from '../plantilla';
import { aTernario, entreCorchetes, leerFilas, type Catalogos } from '../plantilla-lectura';

const CATALOGOS: Catalogos = {
  tipos: [
    { id: 1, codigo: '[D]' },
    { id: 2, codigo: '[SW]' },
  ],
  subtipos: [
    { id: 10, tipoId: 1, codigo: '[files]' },
    { id: 11, tipoId: 1, codigo: '[backup]' },
    { id: 20, tipoId: 2, codigo: '[app]' },
  ],
  areas: [
    { id: 100, nombre: 'Tecnología' },
    { id: 101, nombre: 'Gestión Humana' },
  ],
  cargos: [
    { id: 200, nombre: 'Líder de Tecnología' },
    { id: 201, nombre: 'Analista de Soporte' },
  ],
  ubicaciones: [{ id: 300, nombre: 'Sede Bogotá' }],
  entornos: [{ id: 400, nombre: 'Producción' }],
  proveedores: [{ id: 500, nombre: 'Microsoft' }],
  escala: [
    { valor: 5, etiqueta: '5 — Muy Alto' },
    { valor: 4, etiqueta: '4 — Alto' },
    { valor: 3, etiqueta: '3 — Medio' },
  ],
  heredadosExistentes: new Set(['tec-008']),
};

const ENCABEZADO = COLUMNAS_PLANTILLA.map((c) => c.encabezado);

/// Builds a sheet row from a partial record, so each test states only what it is about.
function fila(campos: Record<string, string>): string[] {
  return COLUMNAS_PLANTILLA.map((c) => campos[c.clave] ?? '');
}

const VALIDA = {
  nombre: 'Servidor de archivos',
  tipo: '[D] Datos / Información',
  subtipo: '[files] Ficheros',
  area: 'Tecnología',
  custodio: 'Líder de Tecnología',
  valorD: '4 — Alto',
  valorI: '4 — Alto',
  valorC: '3 — Medio',
};

const leer = (filas: Record<string, string>[]) =>
  leerFilas([ENCABEZADO, ...filas.map(fila)], CATALOGOS);

describe('entreCorchetes', () => {
  it('takes the code and ignores the wording after it', () => {
    expect(entreCorchetes('[D] Datos / Información')).toBe('[D]');
    expect(entreCorchetes('[SW]')).toBe('[SW]');
  });

  it('leaves a cell with no code alone, so it fails validation instead of matching wrongly', () => {
    expect(entreCorchetes('Datos')).toBe('Datos');
  });
});

describe('aTernario', () => {
  it('reads sí and no in the shapes a spreadsheet produces', () => {
    expect(aTernario('Sí')).toBe('SI');
    expect(aTernario('si')).toBe('SI');
    expect(aTernario('NO')).toBe('NO');
  });

  it('treats an empty or unrecognised answer as por definir, never as no', () => {
    // An unanswered question about personal data must not read as an answer.
    expect(aTernario('')).toBe('POR_DEFINIR');
    expect(aTernario('quizás')).toBe('POR_DEFINIR');
  });
});

describe('leerFilas', () => {
  it('resolves a complete row to ids', () => {
    const { filas, resueltas } = leer([
      { ...VALIDA, codigoHeredado: 'TEC-100', propietario: 'Analista de Soporte', ubicacion: 'Sede Bogotá', entorno: 'Producción', proveedor: 'Microsoft', datosPersonales: 'Sí' },
    ]);

    expect(filas).toHaveLength(1);
    expect(filas[0].errores).toEqual([]);
    expect(resueltas).toHaveLength(1);
    expect(resueltas[0]).toMatchObject({
      fila: 2,
      codigoHeredado: 'TEC-100',
      areaId: 100,
      tipoId: 1,
      subtipoId: 10,
      custodioId: 200,
      propietarioId: 201,
      ubicacionId: 300,
      entornoId: 400,
      proveedorId: 500,
      datosPersonales: 'SI',
      datosCliente: 'POR_DEFINIR',
      valorD: 4,
      valorI: 4,
      valorC: 3,
    });
  });

  it('skips the header, blank rows and the template example without reporting them', () => {
    const { filas } = leer([
      { codigoHeredado: 'EJEMPLO — borrá esta fila', nombre: 'Servidor de ejemplo' },
      {},
      VALIDA,
    ]);

    expect(filas).toHaveLength(1);
    expect(filas[0].fila).toBe(4);
  });

  it('accepts a bare number where the scale label was expected', () => {
    // Excel turns "4 — Alto" into 4 as soon as somebody retypes the cell.
    const { resueltas } = leer([{ ...VALIDA, valorD: '5', valorI: '4', valorC: '3' }]);
    expect(resueltas[0]).toMatchObject({ valorD: 5, valorI: 4, valorC: 3 });
  });

  it('matches catalogue names ignoring accents and case', () => {
    const { resueltas } = leer([
      { ...VALIDA, area: 'tecnologia', custodio: 'lider de tecnologia' },
    ]);
    expect(resueltas).toHaveLength(1);
    expect(resueltas[0].areaId).toBe(100);
  });

  it('rejects a valid subtype under the wrong type, and says which type it checked', () => {
    const { filas, resueltas } = leer([{ ...VALIDA, subtipo: '[app] Aplicación' }]);

    expect(resueltas).toHaveLength(0);
    expect(filas[0].errores).toEqual(['El subtipo «[app] Aplicación» no pertenece a [D].']);
  });

  it('collects every missing mandatory field instead of stopping at the first', () => {
    const { filas } = leer([{ nombre: '' }]);
    // The row still has to be reported: a name-less row with a code is somebody's data.
    const { filas: conCodigo } = leer([{ codigoHeredado: 'X-1' }]);

    expect(filas).toHaveLength(0);
    expect(conCodigo[0].errores).toEqual([
      'Falta el nombre del activo.',
      'Falta el tipo MAGERIT.',
      'Falta el subtipo.',
      'Falta el proceso o área.',
      'Falta el custodio.',
      'Falta el valor en Disponibilidad.',
      'Falta el valor en Integridad.',
      'Falta el valor en Confidencialidad.',
    ]);
  });

  it('flags a legacy code that already exists in the inventory', () => {
    const { filas, resueltas } = leer([{ ...VALIDA, codigoHeredado: 'TEC-008' }]);

    expect(resueltas).toHaveLength(0);
    expect(filas[0].errores).toEqual([
      'Ya existe un activo con el código heredado «TEC-008».',
    ]);
  });

  it('flags a legacy code repeated inside the same file, pointing at the first row', () => {
    const { filas, resueltas } = leer([
      { ...VALIDA, codigoHeredado: 'TEC-200' },
      { ...VALIDA, codigoHeredado: 'TEC-200', nombre: 'Otro servidor' },
    ]);

    expect(resueltas).toHaveLength(1);
    expect(filas[1].errores).toEqual([
      'El código heredado «TEC-200» ya aparece en la fila 2.',
    ]);
  });

  it('lets rows without a legacy code through: it is optional and blank is not a duplicate', () => {
    const { resueltas } = leer([VALIDA, { ...VALIDA, nombre: 'Otro activo' }]);
    expect(resueltas).toHaveLength(2);
    expect(resueltas.every((r) => r.codigoHeredado === null)).toBe(true);
  });

  it('rejects a value outside the scale rather than clamping it', () => {
    const { filas, resueltas } = leer([{ ...VALIDA, valorD: '9' }]);

    expect(resueltas).toHaveLength(0);
    expect(filas[0].errores).toEqual(['Valor en Disponibilidad fuera de la escala: «9».']);
  });

  it('keeps a good row and drops a bad one from the same file', () => {
    const { filas, resueltas } = leer([
      VALIDA,
      { ...VALIDA, nombre: 'Sin área', area: 'Mercadeo' },
      { ...VALIDA, nombre: 'Tercero' },
    ]);

    expect(filas).toHaveLength(3);
    expect(resueltas).toHaveLength(2);
    expect(resueltas.map((r) => r.fila)).toEqual([2, 4]);
    expect(filas[1].errores).toEqual(['Proceso o área desconocido: «Mercadeo».']);
  });

  it('echoes what was typed so the preview shows the cell, not the resolved id', () => {
    const { filas } = leer([{ ...VALIDA, area: 'tecnologia' }]);
    expect(filas[0].lectura.area).toBe('tecnologia');
    expect(filas[0].lectura.nombre).toBe('Servidor de archivos');
  });
});
