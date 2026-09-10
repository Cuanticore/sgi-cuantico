// lib/sgsi/__tests__/consolidado-matriz.test.ts
//
// REQ-SIG-12 §4.1 · la «Matriz de Activos» → `Activo` + `ActivoValor` + jerarquía.
//
// **La regla de oro se prueba primero** (§3): el código del libro se PRESERVA. El
// importador histórico hace lo contrario —mapea «Código» a `codigoHeredado` y emite uno
// nuevo desde `ContadorCodigo`— y con V19 eso rompe las 40 dependencias, los 129
// despliegues y las 720 aristas del grafo, que referencian a cada activo por ese código
// exacto.
//
// **Y la segunda regla, del §6: ningún caso borde aborta la carga.** Una fila a la que le
// falta el área no se puede escribir —`areaId` es NOT NULL— y se rechaza con su motivo;
// una a la que le falta el custodio SÍ se escribe, porque la columna es nulable y el libro
// tiene dieciocho así (H-20). La diferencia entre RECHAZAR y AVISAR es la diferencia entre
// «esto no cabe en el modelo» y «esto cabe, pero alguien tiene que completarlo».

import { leerMatrizConsolidado, type CatalogosConsolidado } from '../consolidado-lectura';

const CATALOGOS: CatalogosConsolidado = {
  areas: [
    { id: 1, nombre: 'Sistema Integrado de Gestión', prefijo: 'SIG' },
    { id: 2, nombre: 'Gestión Tecnológica', prefijo: 'TEC' },
    { id: 3, nombre: 'Gestión de Proyectos', prefijo: 'PRY' },
  ],
  tipos: [
    { id: 10, codigo: '[D]', abreviatura: 'DAT' },
    { id: 11, codigo: '[S]', abreviatura: 'SER' },
  ],
  subtipos: [
    { id: 20, tipoId: 10, codigo: '[files]' },
    { id: 21, tipoId: 11, codigo: '[www]' },
  ],
  cargos: [
    { id: 30, nombre: 'Líder del SIG' },
    { id: 31, nombre: 'Architecture Manager' },
  ],
  ubicaciones: [{ id: 40, nombre: 'Nube Microsoft 365' }],
  entornos: [{ id: 50, nombre: 'Producción' }],
  proveedores: [{ id: 60, nombre: 'Microsoft' }],
  escala: [
    { valor: 5, etiqueta: '5 — Muy Alto' },
    { valor: 4, etiqueta: '4 — Alto' },
    { valor: 3, etiqueta: '3 — Medio' },
    { valor: 2, etiqueta: '2 — Bajo' },
  ],
};

/// Una fila de la hoja, por número de columna (1-based) como la ve la persona en Excel.
/// La cabecera vive en la fila 7 y los datos arrancan en la 8.
function hoja(...filas: Record<number, string>[]): string[][] {
  const matriz: string[][] = [];
  for (let i = 0; i < 7; i++) matriz.push([]); // filas 1..7: títulos y cabecera
  for (const f of filas) {
    const celdas: string[] = [];
    for (let c = 1; c <= 25; c++) celdas.push(f[c] ?? '');
    matriz.push(celdas);
  }
  return matriz;
}

/// Una fila completa y sana, para que cada prueba cambie SOLO lo que está ejercitando.
const SANA: Record<number, string> = {
  2: 'SIG-DAT-0030',
  3: 'CUANTICO',
  4: 'SIG',
  5: 'Documentación',
  6: 'Manual del SGSI',
  7: 'El manual maestro',
  8: '1',
  9: '[D] Datos / Información',
  10: '[files] Ficheros',
  11: 'Sistema Integrado de Gestión',
  12: 'Líder del SIG',
  13: 'Líder del SIG',
  14: 'Nube Microsoft 365',
  15: 'Producción',
  16: 'No',
  17: 'Sí',
  18: 'No',
  19: 'Microsoft',
  20: '',
  21: '3 — Medio',
  22: '4 — Alto',
  23: '5 — Muy Alto',
  24: '5',
  25: 'Muy Alto',
};

const con = (cambios: Record<number, string>) => ({ ...SANA, ...cambios });
const leer = (...filas: Record<number, string>[]) =>
  leerMatrizConsolidado(hoja(...filas), CATALOGOS);

// ─── §3 · la regla de oro ──────────────────────────────────────────────────────────────

describe('§3 · el código del libro se preserva', () => {
  it('el código llega tal cual, sin regenerarse', () => {
    const { filas } = leer(SANA);
    expect(filas).toHaveLength(1);
    expect(filas[0].codigo).toBe('SIG-DAT-0030');
  });

  // El prefijo del código NO es el área del activo, y el §3 lo dice con números: hay 134
  // códigos «TEC» y sólo 122 activos en «Gestión Tecnológica». Recalcular el código desde
  // (área, tipo) le cambiaría el prefijo a esa docena y rompería sus referencias.
  it('el prefijo del código no manda sobre el área, ni al revés', () => {
    const { filas } = leer(con({ 2: 'PRO-DAT-0017', 11: 'Gestión de Proyectos' }));
    expect(filas[0].codigo).toBe('PRO-DAT-0017');
    expect(filas[0].areaId).toBe(3); // el área que dice la columna 11, prefijo PRY
  });

  it('un código que no cumple el patrón se rechaza: nada lo podría referenciar', () => {
    const { filas, rechazadas } = leer(con({ 2: 'SIG-DAT-30' }));
    expect(filas).toHaveLength(0);
    expect(rechazadas[0].mensaje).toContain('AAA-TTT-NNNN');
  });

  // Dos activos con el mismo código son un `@unique` roto y, peor, una referencia ambigua:
  // ninguna hoja podría decir a cuál de los dos apunta.
  it('un código repetido dentro del archivo se rechaza la segunda vez', () => {
    const { filas, rechazadas } = leer(SANA, con({ 6: 'Otro' }));
    expect(filas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].mensaje).toContain('fila 8');
  });
});

// ─── Catálogos: lo que rechaza y lo que sólo avisa ─────────────────────────────────────

describe('catálogos obligatorios · rechazan la fila', () => {
  it.each([
    ['área', 11, 'Área que no existe'],
    ['tipo', 9, '[XX] Inventado'],
    ['subtipo', 10, '[nope] Inventado'],
  ])('un %s que no resuelve rechaza la fila, porque la columna es NOT NULL', (_q, col, valor) => {
    const { filas, rechazadas } = leer(con({ [col]: valor }));
    expect(filas).toHaveLength(0);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].codigo).toBe('SIG-DAT-0030');
  });

  // El error habitual no es un subtipo inventado: es uno válido bajo el tipo equivocado.
  // Decir contra qué tipo se comprobó es lo que lo hace arreglable.
  it('el subtipo se valida CONTRA SU TIPO, y el mensaje lo dice', () => {
    const { rechazadas } = leer(con({ 9: '[D] Datos', 10: '[www] Sitio' }));
    expect(rechazadas[0].mensaje).toContain('[D]');
  });

  it('el tipo y el subtipo se resuelven por el código entre corchetes', () => {
    const { filas } = leer(con({ 9: '[D] cualquier cosa que hayan escrito', 10: '[files] otra' }));
    expect(filas[0].tipoId).toBe(10);
    expect(filas[0].subtipoId).toBe(20);
  });
});

// La decisión de esta carga: normalizar lo evidente, no inventar catálogo. «Sistema
// Integrado de Gestión (SIG)» son 35 activos del libro y el área existe con el mismo
// nombre sin la sigla. Es una diferencia de escritura, no un área distinta.
describe('la única normalización de área, y por qué es explícita', () => {
  it('«Sistema Integrado de Gestión (SIG)» es el área que ya existe', () => {
    const { filas, rechazadas } = leer(con({ 11: 'Sistema Integrado de Gestión (SIG)' }));
    expect(rechazadas).toHaveLength(0);
    expect(filas[0].areaId).toBe(1);
  });

  // Deliberadamente NO se deduce «lo que va entre paréntesis es la sigla del área». Esa
  // regla parece más general y es más peligrosa: convertiría cualquier paréntesis en una
  // afirmación sobre a qué proceso pertenece un activo, sin que nadie la haya revisado.
  it('no se inventa una regla general de paréntesis', () => {
    const { rechazadas } = leer(con({ 11: 'Gestión Tecnológica (TEC) y algo más' }));
    expect(rechazadas).toHaveLength(1);
  });
});

describe('columnas nulables · la fila se carga y se avisa', () => {
  // H-20 · dieciocho activos del libro no traen custodio. La columna es nulable: el §6 dice
  // que se cargan. Un vacío DECLARADO no es un aviso — es un dato que el libro no tiene.
  it('sin custodio se carga con nulo y sin ruido (H-20)', () => {
    const { filas, avisos } = leer(con({ 12: '' }));
    expect(filas[0].custodioId).toBeNull();
    expect(avisos).toHaveLength(0);
  });

  // Distinto es un custodio ESCRITO que el catálogo no tiene: «Architecture and Technology
  // Manager» son 17 activos, y el catálogo tiene «Architecture Manager». Parecido no es
  // igual, y mapearlo por parecido sería afirmar que son el mismo cargo.
  it('un custodio que no está en el catálogo se carga nulo Y se avisa', () => {
    const { filas, avisos } = leer(con({ 12: 'Architecture and Technology Manager' }));
    expect(filas).toHaveLength(1);
    expect(filas[0].custodioId).toBeNull();
    expect(avisos).toHaveLength(1);
    expect(avisos[0].mensaje).toContain('Architecture and Technology Manager');
  });

  // H-19 · «Cada usuario», «External Legal Counsel» y «Cliente» son roles genéricos, no
  // cargos.
  //
  // **La regla cambió en REQ-SIG-18 §15.6, y a propósito.** Antes se avisaba y se dejaba en
  // null, con el criterio de no crear cargos que nadie aprobó — correcto para un valor
  // desconocido. Pero estos tres no son desconocidos: el §15.3 fijó a qué cargo REAL
  // corresponde cada uno, así que dejarlos en null no protege nada y deja ocho activos sin
  // dueño. Ahora se traducen, **y la traducción se reporta**: un mapeo callado es tan malo
  // como el null callado que reemplaza.
  describe('un responsable genérico se traduce y se reporta (H-19 · §15.6)', () => {
    const CON_DESTINO = {
      ...CATALOGOS,
      cargos: [...CATALOGOS.cargos, { id: 32, nombre: 'Operations & Services Manager' }],
    };
    const leerConDestino = (...filas: Record<number, string>[]) =>
      leerMatrizConsolidado(hoja(...filas), CON_DESTINO);

    it('resuelve al cargo real cuando está en el catálogo', () => {
      const { filas, avisos } = leerConDestino(con({ 13: 'Cada usuario' }));
      expect(filas[0].propietarioId).toBe(32);
      expect(avisos).toHaveLength(1);
      expect(avisos[0].mensaje).toContain('«Cada usuario» no es un cargo');
      expect(avisos[0].mensaje).toContain('Operations & Services Manager');
    });

    // Si el destino de la traducción tampoco está en el catálogo, se avisan las DOS cosas:
    // que se tradujo, y que el cargo traducido falta. Callar la primera dejaría a alguien
    // buscando «Cada usuario» en el catálogo, que nunca va a estar ahí.
    it('sin el cargo destino en el catálogo, avisa la traducción Y el faltante', () => {
      const { filas, avisos } = leer(con({ 13: 'Cada usuario' }));
      expect(filas[0].propietarioId).toBeNull();
      expect(avisos).toHaveLength(2);
      expect(avisos[0].mensaje).toContain('no es un cargo');
      expect(avisos[1].mensaje).toContain('no está en el catálogo');
    });

    it('el custodio se traduce por el mismo camino', () => {
      const { filas } = leerConDestino(con({ 12: 'Cada usuario' }));
      expect(filas[0].custodioId).toBe(32);
    });

    // La ubicación, el entorno y el proveedor NO se traducen: la tabla es de cargos.
    it('no traduce las columnas que no son de responsable', () => {
      const { filas, avisos } = leerConDestino(con({ 14: 'Cliente' }));
      expect(filas[0].ubicacionId).toBeNull();
      expect(avisos).toHaveLength(1);
      expect(avisos[0].mensaje).toContain('no está en el catálogo');
    });
  });

  it.each([
    ['ubicación', 14],
    ['entorno', 15],
    ['proveedor', 19],
  ])('un valor de %s vacío no avisa nada', (_q, col) => {
    const { avisos } = leer(con({ [col]: '' }));
    expect(avisos).toHaveLength(0);
  });

  // «No aplica» es una respuesta, no una omisión: el libro está diciendo que ese activo no
  // tiene proveedor. Se guarda como nulo y no se reporta, porque no hay nada que corregir.
  it('proveedor «No aplica» es nulo declarado, no un faltante', () => {
    const { filas, avisos } = leer(con({ 19: 'No aplica' }));
    expect(filas[0].proveedorId).toBeNull();
    expect(avisos).toHaveLength(0);
  });

  it('un proveedor desconocido se carga nulo y se avisa', () => {
    const { filas, avisos } = leer(con({ 19: 'GoDaddy' }));
    expect(filas[0].proveedorId).toBeNull();
    expect(avisos[0].mensaje).toContain('GoDaddy');
  });
});

// ─── Valoración D/I/C ──────────────────────────────────────────────────────────────────

describe('la valoración', () => {
  it('lee las tres dimensiones de sus columnas', () => {
    const { filas } = leer(SANA);
    expect([filas[0].valorD, filas[0].valorI, filas[0].valorC]).toEqual([3, 4, 5]);
  });

  it('acepta «4 — Alto» y un «4» pelado, que es lo que deja Excel', () => {
    const { filas } = leer(con({ 21: '4' }));
    expect(filas[0].valorD).toBe(4);
  });

  it.each([
    ['Disponibilidad', 21],
    ['Integridad', 22],
    ['Confidencialidad', 23],
  ])('sin valor en %s la fila se rechaza: `ActivoValor` no admite el hueco', (_d, col) => {
    const { filas, rechazadas } = leer(con({ [col]: '' }));
    expect(filas).toHaveLength(0);
    expect(rechazadas).toHaveLength(1);
  });

  it('un valor fuera de la escala se rechaza en vez de redondearse', () => {
    const { rechazadas } = leer(con({ 21: '9 — Altísimo' }));
    expect(rechazadas[0].mensaje).toContain('escala');
  });

  // Las columnas 24 y 25 son el máximo de D/I/C y su etiqueta: derivadas. Guardarlas sería
  // guardar dos veces el mismo hecho, y la copia se desincroniza en cuanto alguien
  // corrige una dimensión en la app.
  it('las columnas 24 y 25 son derivadas y no se leen', () => {
    const { filas } = leer(con({ 24: '0', 25: 'Irrelevante' }));
    expect(filas[0]).not.toHaveProperty('valorDerivado');
    expect(filas[0].valorC).toBe(5);
  });
});

// ─── El resto de la fila ───────────────────────────────────────────────────────────────

describe('los demás campos', () => {
  it('nombre, descripción y niveles llegan enteros', () => {
    const { filas } = leer(SANA);
    expect(filas[0]).toMatchObject({
      nombre: 'Manual del SGSI',
      descripcion: 'El manual maestro',
      n1: 'CUANTICO',
      n2: 'SIG',
      n3: 'Documentación',
    });
  });

  it('una descripción vacía es nula, no una cadena vacía', () => {
    const { filas } = leer(con({ 7: '' }));
    expect(filas[0].descripcion).toBeNull();
  });

  it('sin nombre la fila se rechaza: `Activo.nombre` es NOT NULL', () => {
    const { filas, rechazadas } = leer(con({ 6: '' }));
    expect(filas).toHaveLength(0);
    expect(rechazadas).toHaveLength(1);
  });

  it.each([
    ['Sí', 'SI'],
    ['SI', 'SI'],
    ['No', 'NO'],
  ])('«%s» se lee como %s', (escrito, esperado) => {
    const { filas } = leer(con({ 16: escrito, 17: escrito, 18: escrito }));
    expect(filas[0].datosCliente).toBe(esperado);
  });

  // Una pregunta sin responder no puede leerse como un «no». «¿Contiene datos personales?»
  // en blanco es una pregunta abierta, no una negación.
  it('una casilla en blanco queda POR_DEFINIR, nunca NO', () => {
    const { filas } = leer(con({ 17: '' }));
    expect(filas[0].datosPersonales).toBe('POR_DEFINIR');
  });

  it('la cantidad se lee, y sin ella vale 1 como el esquema', () => {
    expect(leer(con({ 8: '27' })).filas[0].cantidad).toBe(27);
    expect(leer(con({ 8: '' })).filas[0].cantidad).toBe(1);
  });

  // Una cantidad ilegible no vale rechazar un activo entero: se carga con 1 y se avisa.
  it('una cantidad ilegible avisa y no tumba la fila', () => {
    const { filas, avisos } = leer(con({ 8: 'varias' }));
    expect(filas[0].cantidad).toBe(1);
    expect(avisos).toHaveLength(1);
  });

  // §5.4 · «Depende del activo superior» se resuelve en una SEGUNDA PASADA, cuando ya
  // existen todos los activos. Acá sólo se captura el código.
  it('el activo superior se guarda como código para la 2ª pasada', () => {
    const { filas } = leer(con({ 20: 'FIN-DAT-0005' }));
    expect(filas[0].superiorCodigo).toBe('FIN-DAT-0005');
  });

  it('sin activo superior el código queda nulo', () => {
    expect(leer(SANA).filas[0].superiorCodigo).toBeNull();
  });
});

// ─── Barrido de la hoja ────────────────────────────────────────────────────────────────

describe('el recorrido de la hoja', () => {
  it('los datos arrancan en la fila 8 y el número de fila es el de Excel', () => {
    const { filas } = leer(SANA);
    expect(filas[0].fila).toBe(8);
  });

  it('una fila en blanco en el medio no es un error, se saltea', () => {
    const { filas, rechazadas, avisos } = leer(SANA, {}, con({ 2: 'TEC-SER-0001' }));
    expect(filas).toHaveLength(2);
    expect(rechazadas).toEqual([]);
    expect(avisos).toEqual([]);
  });

  it('una hoja sin filas de datos no devuelve nada ni revienta', () => {
    expect(leerMatrizConsolidado(hoja(), CATALOGOS)).toEqual({
      filas: [],
      rechazadas: [],
      avisos: [],
    });
  });

  // El §6 en una prueba: una fila rota no se lleva puestas a las sanas.
  it('una fila rechazada no arrastra a las demás', () => {
    const { filas, rechazadas } = leer(con({ 11: 'Área inventada' }), con({ 2: 'TEC-SER-0001' }));
    expect(filas).toHaveLength(1);
    expect(filas[0].codigo).toBe('TEC-SER-0001');
    expect(rechazadas).toHaveLength(1);
  });
});

// ─── Las dos filas del V19 cuyo tipo contradice a su subtipo ───────────────────────────
//
// El libro trae dos filas donde el TIPO y el SUBTIPO no pueden ser los dos verdaderos:
//
//   TEC-APP-0016  «Key Cloack»   tipo [SW]   subtipo [dir], que pertenece a [S]
//   TEC-AUX-0001  «ChatGPT Pro»  tipo [AUX]  subtipo [std], que pertenece a [SW]
//
// **Se le cree al SUBTIPO y se ajusta el tipo**, porque el subtipo es la afirmación más
// específica y porque el dato lo respalda: los doce subtipos de [AUX] son fuentes de
// alimentación, UPS, cableado, fibra, mobiliario y cajas fuertes. Ninguno describe una
// suscripción a ChatGPT, así que ahí lo que está mal es el tipo.
//
// **Y va por lista explícita, no por regla general.** El tipo MAGERIT determina qué amenazas
// aplican vía `AmenazaTipo`, y por lo tanto qué riesgos existen. Una regla que le creyera al
// subtipo SIEMPRE reclasificaría en silencio cualquier discrepancia futura — es decir,
// decidiría sola sobre el análisis de riesgos. Estos dos códigos los revisó una persona.

describe('los dos activos con tipo y subtipo en conflicto', () => {
  const CON_CONFLICTO: CatalogosConsolidado = {
    ...CATALOGOS,
    tipos: [
      { id: 10, codigo: '[D]', abreviatura: 'DAT' },
      { id: 11, codigo: '[S]', abreviatura: 'SER' },
      { id: 12, codigo: '[SW]', abreviatura: 'APP' },
      { id: 13, codigo: '[AUX]', abreviatura: 'AUX' },
    ],
    subtipos: [
      { id: 20, tipoId: 10, codigo: '[files]' },
      { id: 21, tipoId: 11, codigo: '[www]' },
      { id: 22, tipoId: 11, codigo: '[dir]' },
      { id: 23, tipoId: 12, codigo: '[std]' },
    ],
  };
  const leerCon = (...filas: Record<number, string>[]) =>
    leerMatrizConsolidado(hoja(...filas), CON_CONFLICTO);

  it('«Key Cloack» adopta [S], el tipo de su subtipo [dir]', () => {
    const { filas, rechazadas, avisos } = leerCon(
      con({ 2: 'TEC-APP-0016', 9: '[SW] Aplicaciones (software)', 10: '[dir] Servicio de directorio' }),
    );
    expect(rechazadas).toEqual([]);
    expect(filas[0].tipoId).toBe(11); // [S] Servicios
    expect(filas[0].subtipoId).toBe(22);
    expect(avisos).toHaveLength(1);
  });

  it('«ChatGPT Pro» adopta [SW], el tipo de su subtipo [std]', () => {
    const { filas, rechazadas } = leerCon(
      con({ 2: 'TEC-AUX-0001', 9: '[AUX] Equipamiento auxiliar', 10: '[std] Estándar (off the shelf)' }),
    );
    expect(rechazadas).toEqual([]);
    expect(filas[0].tipoId).toBe(12); // [SW]
    expect(filas[0].subtipoId).toBe(23);
  });

  // El aviso dice los DOS tipos. «Se corrigió el tipo» sin decir de qué a qué no se puede
  // auditar, y esto cambia qué riesgos se generan para ese activo.
  it('el aviso nombra el tipo del libro y el que quedó', () => {
    const { avisos } = leerCon(
      con({ 2: 'TEC-AUX-0001', 9: '[AUX] Equipamiento auxiliar', 10: '[std] Estándar (off the shelf)' }),
    );
    expect(avisos[0].mensaje).toContain('[AUX]');
    expect(avisos[0].mensaje).toContain('[SW]');
  });

  // LA PRUEBA QUE PROTEGE EL ANÁLISIS DE RIESGOS. Cualquier otro activo con el mismo
  // conflicto se sigue rechazando: nadie revisó su clasificación.
  it('otro activo con el mismo conflicto se sigue rechazando', () => {
    const { filas, rechazadas } = leerCon(
      con({ 2: 'TEC-APP-0099', 9: '[SW] Aplicaciones (software)', 10: '[dir] Servicio de directorio' }),
    );
    expect(filas).toHaveLength(0);
    expect(rechazadas).toHaveLength(1);
  });

  // Si el subtipo existiera bajo DOS tipos —y el esquema lo permite, la única es
  // (tipoId, codigo)— adoptar «el suyo» no tendría respuesta única, y elegir uno sería
  // inventar. Se rechaza, incluso estando el código en la lista.
  //
  // Los dos duplicados van bajo [S] y [SW], NO bajo el [AUX] declarado: si uno colgara del
  // tipo del libro la fila resolvería en la primera búsqueda y esta prueba no ejercitaría
  // nada. (Fue el error que cometí al escribirla.)
  it('un subtipo ambiguo se rechaza aunque el código esté en la lista', () => {
    const ambiguo: CatalogosConsolidado = {
      ...CON_CONFLICTO,
      subtipos: [...CON_CONFLICTO.subtipos, { id: 24, tipoId: 11, codigo: '[std]' }],
    };
    const { filas, rechazadas } = leerMatrizConsolidado(
      hoja(con({ 2: 'TEC-AUX-0001', 9: '[AUX] Equipamiento auxiliar', 10: '[std] Estándar' })),
      ambiguo,
    );
    expect(filas).toHaveLength(0);
    expect(rechazadas).toHaveLength(1);
  });
});
