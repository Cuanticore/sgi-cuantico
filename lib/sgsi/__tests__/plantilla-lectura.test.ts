// lib/sgsi/__tests__/plantilla-lectura.test.ts
//
// The import reader is the only place in the application where data arrives from outside
// with no form to constrain it. Every case here is a mistake somebody actually makes in a
// spreadsheet.

import { COLUMNAS_PLANTILLA } from '../plantilla';
import { aTernario, entreCorchetes, esFormatoLegacy, leerFilas, type Catalogos } from '../plantilla-lectura';
import { indiceDeAlias } from '../catalogos-curables';
import { ID_POR_CREAR, LEGACY_NORMALIZAR, conPendientes } from '../plantilla-lectura';

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

describe('esFormatoLegacy — detección del FOR-SIG-12 histórico', () => {
  const FILA_LEGACY = [
    '', 'Código', 'Nombre del activo', 'Descripción', 'Tipo de activo', 'Subtipo de activo',
    'Proceso o Área', 'Responsable (custodio)', 'Propietario del activo', 'Ubicación',
    'Entorno', '¿Contiene datos de cliente?', '¿Contiene datos personales (Ley 1581)?',
    '¿Está expuesto a Internet?', 'Proveedor o subencargado', 'Depende del activo superior',
    'Valor en Disponibilidad', 'Valor en Integridad', 'Valor en Confidencialidad',
    'Valor del activo (0 a 5)', 'Nivel del activo',
  ];

  it('reconoce el encabezado del workbook original (con «Proceso o Área» en mayúscula)', () => {
    expect(esFormatoLegacy(FILA_LEGACY)).toBe(true);
  });

  it('no confunde el encabezado de nuestra plantilla con el formato histórico', () => {
    expect(esFormatoLegacy(COLUMNAS_PLANTILLA.map((c) => c.encabezado))).toBe(false);
  });

  it('rechaza una fila cualquiera sin la firma legacy', () => {
    expect(esFormatoLegacy(['INVENTARIO', '', '', '', '', '', '', '', '', '', ''])).toBe(false);
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

describe('faltantes de catálogo', () => {
  it('reporta el cargo que no existe, con la fila que lo pide', () => {
    const { faltantes } = leer([{ ...VALIDA, custodio: 'Architecture and Technology Manager' }]);

    expect(faltantes).toEqual([
      { catalogo: 'cargo', valor: 'Architecture and Technology Manager', filas: [2] },
    ]);
  });

  it('reporta el proveedor que no existe', () => {
    const { faltantes } = leer([{ ...VALIDA, proveedor: 'OpenAI' }]);

    expect(faltantes).toEqual([{ catalogo: 'proveedor', valor: 'OpenAI', filas: [2] }]);
  });

  it('junta las filas que piden el mismo cargo', () => {
    const { faltantes } = leer([
      { ...VALIDA, custodio: 'Architecture and Technology Manager' },
      { ...VALIDA, nombre: 'Otro activo', custodio: 'Architecture and Technology Manager' },
    ]);

    expect(faltantes).toHaveLength(1);
    expect(faltantes[0].filas).toEqual([2, 3]);
  });

  it('NO reporta como faltante un tipo MAGERIT desconocido', () => {
    // MAGERIT v3.0 es normativo y cerrado: el tipo sigue siendo un error de la fila, no
    // algo que la pantalla de carga pueda ofrecerse a crear.
    const { filas, faltantes } = leer([{ ...VALIDA, tipo: '[XX] Inventado' }]);

    expect(faltantes).toEqual([]);
    expect(filas[0].errores.join(' ')).toContain('Tipo MAGERIT desconocido');
  });

  it('no reporta faltantes cuando todo el libro resuelve', () => {
    expect(leer([VALIDA]).faltantes).toEqual([]);
  });
});

describe('alias de catálogo', () => {
  it('un cargo mapeado resuelve la fila sin crear nada', () => {
    const conAlias: Catalogos = {
      ...CATALOGOS,
      alias: indiceDeAlias([
        { catalogo: 'cargo', valor: 'Arq. y Tec. Manager', accion: 'mapear', destino: 'Líder de Tecnología' },
      ]),
    };

    const { filas, resueltas, faltantes } = leerFilas(
      [ENCABEZADO, fila({ ...VALIDA, custodio: 'Arq. y Tec. Manager' })],
      conAlias,
    );

    expect(filas[0].errores).toEqual([]);
    expect(faltantes).toEqual([]);
    expect(resueltas[0].custodioId).toBe(200);
  });

  it('un proveedor mapeado resuelve al id del destino', () => {
    const conAlias: Catalogos = {
      ...CATALOGOS,
      alias: indiceDeAlias([
        { catalogo: 'proveedor', valor: 'OpenAI', accion: 'mapear', destino: 'Microsoft' },
      ]),
    };

    const { resueltas } = leerFilas(
      [ENCABEZADO, fila({ ...VALIDA, proveedor: 'OpenAI' })],
      conAlias,
    );

    expect(resueltas[0].proveedorId).toBe(500);
  });

  it('lo marcado para crear sigue faltando hasta que exista de verdad', () => {
    // `crear` no traduce: el nombre del libro ES el nombre nuevo, y la fila sólo resuelve
    // cuando la transacción ya insertó esa fila en el catálogo.
    const conAlias: Catalogos = {
      ...CATALOGOS,
      alias: indiceDeAlias([{ catalogo: 'cargo', valor: 'Nuevo Cargo', accion: 'crear', nombre: 'Nuevo Cargo' }]),
    };

    const { faltantes } = leerFilas(
      [ENCABEZADO, fila({ ...VALIDA, custodio: 'Nuevo Cargo' })],
      conAlias,
    );

    expect(faltantes).toEqual([{ catalogo: 'cargo', valor: 'Nuevo Cargo', filas: [2] }]);
  });
});

describe('«No aplica» como proveedor', () => {
  it('significa SIN proveedor, no un proveedor que se llama así', () => {
    // 7 de las 15 filas que el V21 rechazó decían «No aplica» en la columna de proveedor.
    // No es un nombre sin registrar: es la ausencia de proveedor, y `Activo.proveedorId` ya
    // es nullable. Crear un proveedor llamado «No aplica» metería una organización
    // inexistente al alcance de A.5.19–A.5.22.
    expect(LEGACY_NORMALIZAR.proveedor['No aplica']).toBe('');
  });

  it('sigue valiendo como ubicación y como entorno, que sí lo tienen', () => {
    // La asimetría es del catálogo, no un descuido: «No aplica» ES una ubicación y un
    // entorno registrados, y mapearlos a vacío borraría un dato que la fila sí declara.
    expect(LEGACY_NORMALIZAR.ubicacion['N.A.']).toBe('No aplica');
    expect(LEGACY_NORMALIZAR.entorno['N.A.']).toBe('No aplica');
  });
});

describe('el número de fila que se reporta', () => {
  it('sin decir nada, asume el encabezado en la fila 1', () => {
    // La plantilla que genera la aplicación trae el encabezado arriba de todo, así que la
    // primera fila de datos es la 2.
    const { filas } = leer([{ ...VALIDA, tipo: '[XX] No existe' }]);

    expect(filas[0].fila).toBe(2);
  });

  it('con el encabezado en la fila 7, la primera fila de datos es la 8', () => {
    // EL FOR-SIG-12 HISTÓRICO PONE EL ENCABEZADO EN LA FILA 7. Sin decírselo, el lector
    // numeraba desde 1 y todo el parte salía corrido seis filas: el mensaje decía «FILA 45»
    // y en la fila 45 del libro había otro activo. La persona corrige el activo equivocado,
    // y el que estaba mal sigue mal.
    const { filas } = leerFilas(
      [ENCABEZADO, fila({ ...VALIDA, tipo: '[XX] No existe' })],
      CATALOGOS,
      7,
    );

    expect(filas[0].fila).toBe(8);
  });

  it('numera correlativo desde el encabezado, sin saltos', () => {
    const { filas } = leerFilas(
      [
        ENCABEZADO,
        fila({ ...VALIDA, tipo: '[XX] No existe' }),
        fila({ ...VALIDA, nombre: 'Otro', tipo: '[YY] Tampoco' }),
      ],
      CATALOGOS,
      7,
    );

    expect(filas.map((f) => f.fila)).toEqual([8, 9]);
  });

  it('los faltantes de catálogo apuntan a la misma fila que los errores', () => {
    // Si el faltante dijera una fila y el error otra, el parte se contradiría a sí mismo.
    const { filas, faltantes } = leerFilas(
      [ENCABEZADO, fila({ ...VALIDA, proveedor: 'OpenIA' })],
      CATALOGOS,
      7,
    );

    expect(faltantes[0].filas).toEqual([filas[0].fila]);
    expect(faltantes[0].filas).toEqual([8]);
  });
});

describe('lo que se decidió CREAR, durante el análisis', () => {
  // EL BUCLE. El análisis no escribe nada, así que un proveedor marcado para crear seguía
  // sin estar en el catálogo: la fila fallaba igual y el faltante volvía a salir. El botón
  // decía «Aplicar y revalidar» para siempre y el de importar no aparecía nunca, porque
  // sólo aparece cuando no quedan faltantes. Elegir «crear» no llevaba a ningún lado.

  const conCreacion = (resoluciones: Parameters<typeof conPendientes>[1]) =>
    leerFilas(
      [ENCABEZADO, fila({ ...VALIDA, proveedor: 'Claude' })],
      conPendientes(
        { ...CATALOGOS, alias: indiceDeAlias(resoluciones) },
        resoluciones,
      ),
    );

  it('deja de contarse como faltante: ya está decidido', () => {
    const { faltantes } = conCreacion([
      { catalogo: 'proveedor', valor: 'Claude', accion: 'crear', nombre: 'Claude' },
    ]);

    expect(faltantes).toEqual([]);
  });

  it('la fila pasa a estar lista, para que el parte diga la verdad', () => {
    const { filas, resueltas } = conCreacion([
      { catalogo: 'proveedor', valor: 'Claude', accion: 'crear', nombre: 'Claude' },
    ]);

    expect(filas[0].errores).toEqual([]);
    expect(resueltas).toHaveLength(1);
  });

  it('el id es provisional y se reconoce como tal', () => {
    // La importación relee DENTRO de la transacción con los ids reales. Si uno de éstos
    // llegara a la escritura sería un id inexistente, así que se marca para poder detectarlo.
    const { resueltas } = conCreacion([
      { catalogo: 'proveedor', valor: 'Claude', accion: 'crear', nombre: 'Claude' },
    ]);

    expect(resueltas[0].proveedorId).toBe(ID_POR_CREAR);
    expect(ID_POR_CREAR).toBeLessThan(0);
  });

  it('el nombre corregido es el que entra al catálogo provisional', () => {
    const { faltantes, resueltas } = conCreacion([
      { catalogo: 'proveedor', valor: 'Claude', accion: 'crear', nombre: 'Anthropic' },
    ]);

    expect(faltantes).toEqual([]);
    expect(resueltas).toHaveLength(1);
  });

  it('un «mapear» no agrega nada al catálogo: apunta a algo que ya está', () => {
    const resoluciones = [
      { catalogo: 'proveedor' as const, valor: 'Claude', accion: 'mapear' as const, destino: 'Microsoft' },
    ];
    const conMapeo = conPendientes({ ...CATALOGOS, alias: indiceDeAlias(resoluciones) }, resoluciones);

    expect(conMapeo.proveedores).toHaveLength(CATALOGOS.proveedores.length);
  });

  it('no toca los catálogos que no se pueden crear', () => {
    // Un área se mapea pero no se crea: agregarla provisionalmente diría que la carga puede
    // seguir cuando el servidor la va a rechazar.
    const resoluciones = [
      { catalogo: 'area' as const, valor: 'Innovación', accion: 'crear' as const, nombre: 'Innovación' },
    ];
    const conArea = conPendientes({ ...CATALOGOS, alias: indiceDeAlias(resoluciones) }, resoluciones);

    expect(conArea.areas).toHaveLength(CATALOGOS.areas.length);
  });
});
