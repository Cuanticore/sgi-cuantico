// lib/sgsi/__tests__/catalogos-curables.test.ts
//
// Que un cargo no esté en el catálogo no dice nada sobre si debe existir: dice que nadie
// lo registró todavía. El V21 llegó con «Architecture and Technology Manager» —un cargo
// real de la organización— y con «OpenAI» como proveedor, y la carga rechazaba las filas
// sin ofrecer salida.
//
// Estas pruebas fijan las dos salidas: CREAR lo que falta, o MAPEAR el texto del libro a
// algo que ya existe. Y fijan el límite: MAGERIT no se cura desde una celda de Excel.

import {
  CATALOGOS_CREABLES,
  CATALOGOS_CURABLES,
  agruparFaltantes,
  aplicarAlias,
  esCurable,
  indiceDeAlias,
  problemasDeResoluciones,
  type Resolucion,
} from '../catalogos-curables';

describe('esCurable', () => {
  it('acepta los catálogos que la organización cura', () => {
    for (const c of ['cargo', 'proveedor', 'ubicacion', 'entorno', 'area'] as const) {
      expect(esCurable(c)).toBe(true);
    }
  });

  it('rechaza MAGERIT y la criticidad de negocio', () => {
    // No es una omisión: MAGERIT v3.0 es un catálogo normativo cerrado, y la criticidad
    // son cinco filas fijas. Inventarlos desde el libro deja el análisis fuera de la
    // metodología que dice seguir.
    expect(esCurable('tipo')).toBe(false);
    expect(esCurable('subtipo')).toBe(false);
    expect(esCurable('criticidad')).toBe(false);
  });

  it('expone la lista de curables sin MAGERIT dentro', () => {
    expect([...CATALOGOS_CURABLES].sort()).toEqual([
      'area',
      'cargo',
      'entorno',
      'proveedor',
      'ubicacion',
    ]);
  });
});

describe('agruparFaltantes', () => {
  it('junta las filas que piden el mismo valor, para decidir una vez y no doce', () => {
    const faltantes = agruparFaltantes([
      { catalogo: 'cargo', valor: 'Architecture and Technology Manager', fila: 12 },
      { catalogo: 'proveedor', valor: 'OpenAI', fila: 12 },
      { catalogo: 'cargo', valor: 'Architecture and Technology Manager', fila: 40 },
      { catalogo: 'cargo', valor: 'Architecture and Technology Manager', fila: 8 },
    ]);

    expect(faltantes).toEqual([
      {
        catalogo: 'cargo',
        valor: 'Architecture and Technology Manager',
        filas: [8, 12, 40],
      },
      { catalogo: 'proveedor', valor: 'OpenAI', filas: [12] },
    ]);
  });

  it('trata como el mismo valor lo que sólo cambia en tildes o mayúsculas', () => {
    // Si «Ubicación Bogotá» y «ubicacion bogota» viajaran separados, la persona vería dos
    // faltantes para una sola decisión y podría crear dos filas para la misma cosa.
    const faltantes = agruparFaltantes([
      { catalogo: 'ubicacion', valor: 'Oficina Bogotá', fila: 3 },
      { catalogo: 'ubicacion', valor: 'oficina bogota', fila: 9 },
    ]);

    expect(faltantes).toHaveLength(1);
    // Se conserva la primera grafía vista: es la que la persona reconoce de su libro.
    expect(faltantes[0].valor).toBe('Oficina Bogotá');
    expect(faltantes[0].filas).toEqual([3, 9]);
  });

  it('no inventa faltantes cuando no hubo ninguno', () => {
    expect(agruparFaltantes([])).toEqual([]);
  });
});

describe('aplicarAlias', () => {
  const indice = indiceDeAlias([
    { catalogo: 'cargo', valor: 'Arq. y Tec. Manager', accion: 'mapear', destino: 'CTO' },
    { catalogo: 'proveedor', valor: 'OpenAI', accion: 'crear' },
  ]);

  it('traduce el texto del libro al nombre que el catálogo ya tiene', () => {
    expect(aplicarAlias(indice, 'cargo', 'Arq. y Tec. Manager')).toBe('CTO');
  });

  it('traduce aunque el libro cambie tildes o mayúsculas', () => {
    expect(aplicarAlias(indice, 'cargo', 'ARQ. Y TEC. MANAGER')).toBe('CTO');
  });

  it('deja intacto lo que se va a crear: el nombre del libro ES el nombre nuevo', () => {
    expect(aplicarAlias(indice, 'proveedor', 'OpenAI')).toBe('OpenAI');
  });

  it('no cruza catálogos — un alias de cargo no afecta a un proveedor', () => {
    expect(aplicarAlias(indice, 'proveedor', 'Arq. y Tec. Manager')).toBe('Arq. y Tec. Manager');
  });

  it('deja pasar lo que nadie resolvió', () => {
    expect(aplicarAlias(indice, 'cargo', 'Otro cargo')).toBe('Otro cargo');
  });
});

describe('problemasDeResoluciones', () => {
  const NOMBRES = {
    cargo: ['CTO', 'CEO'],
    proveedor: ['Amazon Web Services'],
    ubicacion: [],
    entorno: [],
    area: [],
  };
  const FALTANTES = [
    { catalogo: 'cargo' as const, valor: 'Architecture and Technology Manager', filas: [8] },
    { catalogo: 'proveedor' as const, valor: 'OpenAI', filas: [8] },
  ];

  it('no protesta cuando cada faltante tiene su decisión', () => {
    const resoluciones: Resolucion[] = [
      { catalogo: 'cargo', valor: 'Architecture and Technology Manager', accion: 'crear' },
      { catalogo: 'proveedor', valor: 'OpenAI', accion: 'mapear', destino: 'Amazon Web Services' },
    ];

    expect(problemasDeResoluciones(FALTANTES, resoluciones, NOMBRES)).toEqual([]);
  });

  it('exige una decisión por cada faltante: media carga es peor que ninguna', () => {
    const resoluciones: Resolucion[] = [
      { catalogo: 'cargo', valor: 'Architecture and Technology Manager', accion: 'crear' },
    ];

    expect(problemasDeResoluciones(FALTANTES, resoluciones, NOMBRES)).toEqual([
      'Falta decidir qué hacer con el proveedor «OpenAI».',
    ]);
  });

  it('rechaza mapear a un destino que no existe', () => {
    const resoluciones: Resolucion[] = [
      { catalogo: 'cargo', valor: 'Architecture and Technology Manager', accion: 'crear' },
      { catalogo: 'proveedor', valor: 'OpenAI', accion: 'mapear', destino: 'Anthropic' },
    ];

    expect(problemasDeResoluciones(FALTANTES, resoluciones, NOMBRES)).toEqual([
      'El proveedor «Anthropic» no existe, así que «OpenAI» no se puede mapear ahí.',
    ]);
  });

  it('rechaza crear algo que ya existe con otra grafía', () => {
    // Crear «cto» teniendo «CTO» da dos filas para un mismo cargo, y el inventario deja de
    // poder agruparse por responsable. Es el error que ya costó la trazabilidad del
    // codigo_heredado: sin llave controlada, el catálogo se duplica solo.
    const faltantes = [{ catalogo: 'cargo' as const, valor: 'cto', filas: [8] }];
    const resoluciones: Resolucion[] = [
      { catalogo: 'cargo', valor: 'cto', accion: 'crear' },
    ];

    expect(problemasDeResoluciones(faltantes, resoluciones, NOMBRES)).toEqual([
      'Ya existe el cargo «CTO». Mapea «cto» ahí en vez de crear uno nuevo.',
    ]);
  });

  it('rechaza una decisión sobre algo que el libro no pidió', () => {
    const resoluciones: Resolucion[] = [
      { catalogo: 'cargo', valor: 'Architecture and Technology Manager', accion: 'crear' },
      { catalogo: 'proveedor', valor: 'OpenAI', accion: 'crear' },
      { catalogo: 'cargo', valor: 'Cargo fantasma', accion: 'crear' },
    ];

    expect(problemasDeResoluciones(FALTANTES, resoluciones, NOMBRES)).toEqual([
      'El libro no pide el cargo «Cargo fantasma».',
    ]);
  });

  it('rechaza un nombre en blanco: un catálogo no se cura con una celda vacía', () => {
    const faltantes = [{ catalogo: 'cargo' as const, valor: '   ', filas: [8] }];
    const resoluciones: Resolucion[] = [{ catalogo: 'cargo', valor: '   ', accion: 'crear' }];

    expect(problemasDeResoluciones(faltantes, resoluciones, NOMBRES)).toEqual([
      'No se puede crear un cargo sin nombre.',
    ]);
  });
});

describe('crear un área', () => {
  it('no se ofrece: un área necesita un prefijo que entra en el código de sus activos', () => {
    // `Area.prefijo` es CHAR(3) único y forma el código de cada activo del área
    // (`COM-APP-0001`). Inventarlo desde un nombre sería decidir la codificación de la
    // organización por ella, y ese prefijo después es inmutable.
    expect([...CATALOGOS_CREABLES].sort()).toEqual([
      'cargo',
      'entorno',
      'proveedor',
      'ubicacion',
    ]);
  });

  it('rechaza crear un área, pero deja mapearla', () => {
    const faltantes = [{ catalogo: 'area' as const, valor: 'Innovación', filas: [8] }];
    const nombres = {
      cargo: [],
      proveedor: [],
      ubicacion: [],
      entorno: [],
      area: ['Tecnología'],
    };

    expect(
      problemasDeResoluciones(faltantes, [{ catalogo: 'area', valor: 'Innovación', accion: 'crear' }], nombres),
    ).toEqual([
      'Un área no se puede crear desde la carga: necesita un prefijo de tres letras que entra en el código de sus activos. Créala en parámetros, o mapea «Innovación» a un área existente.',
    ]);

    expect(
      problemasDeResoluciones(
        faltantes,
        [{ catalogo: 'area', valor: 'Innovación', accion: 'mapear', destino: 'Tecnología' }],
        nombres,
      ),
    ).toEqual([]);
  });
});
