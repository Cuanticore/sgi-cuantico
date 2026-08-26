// lib/sgsi/__tests__/inventario-libro.test.ts
//
// Builds the FOR-SIG-12 styled workbook and reads it back, proving three things the
// browser can never show: the sheet names, the exact column order of the Matriz de
// Activos, and the named ranges behind the dropdowns — each list a catalogue row, in
// reference order.

import {
  construirLibroInventario,
  type CatalogosExportActivos,
  type FilaActivoExport,
} from '../inventario-libro';

const CAT: CatalogosExportActivos = {
  tipos: [
    { id: 1, codigo: '[SW]', nombre: 'Aplicaciones (software)' },
    { id: 2, codigo: '[HW]', nombre: 'Hardware' },
  ],
  subtipos: [
    { tipoId: 1, codigo: '[se]', nombre: 'Servidor' },
    { tipoId: 1, codigo: '[nf]', nombre: 'Nube' },
    { tipoId: 2, codigo: '[se]', nombre: 'Servidor físico' },
  ],
  procesos: ['Gestión Comercial', 'Gestión Financiera'],
  responsables: ['CEO', 'Chief Commercial Officer'],
  proveedores: ['Amazon Web Services', 'Microsoft'],
  entornos: ['Producción', 'Staging'],
  ubicaciones: ['Nube', 'Local'],
  escala: [
    { valor: 5, etiqueta: '5 — Muy Alto' },
    { valor: 4, etiqueta: '4 — Alto' },
    { valor: 3, etiqueta: '3 — Medio' },
    { valor: 2, etiqueta: '2 — Bajo' },
    { valor: 1, etiqueta: '1 — Muy Bajo' },
    { valor: 0, etiqueta: '0 — Irrelevante' },
  ],
};

const FILAS: FilaActivoExport[] = [
  {
    codigo: 'COM-APP-0001',
    codigoHeredado: 'LCO-01',
    nombre: 'CRM comercial de MinTrace',
    descripcion: 'Herramienta de gestión de clientes.',
    tipo: '[SW] Aplicaciones (software)',
    subtipo: '[se] Servidor',
    proceso: 'Gestión Comercial',
    custodio: 'CEO',
    propietario: null,
    ubicacion: 'Nube',
    entorno: 'Producción',
    datosCliente: 'Sí',
    datosPersonales: 'Sí',
    expuestoInternet: 'No',
    proveedor: null,
    superior: null,
    valorD: '4 — Alto',
    valorI: '4 — Alto',
    valorC: '3 — Medio',
    valorActivo: 4,
    nivelActivo: 'Alto',
    riesgoInherente: 'Alto (3.99)',
    riesgoResidual: 'sin calcular',
  },
];

describe('el libro de inventario replicado', () => {
  it('tiene las tres hojas del FOR-SIG-12 en su orden', async () => {
    const wb = await construirLibroInventario(FILAS, CAT);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Dashboard',
      'Matriz de Activos',
      'Listas',
    ]);
  });

  it('escribe la fila de encabezados en la fila 7 en el orden del formulario', async () => {
    const wb = await construirLibroInventario(FILAS, CAT);
    const matriz = wb.getWorksheet('Matriz de Activos')!;
    const cabeceras = [
      'Código',
      'Nombre del activo',
      'Descripción',
      'Tipo de activo',
      'Subtipo de activo',
      'Proceso o área',
      'Responsable (custodio)',
      'Propietario del activo',
      'Ubicación',
      'Entorno',
      '¿Contiene datos de cliente?',
      '¿Contiene datos personales (Ley 1581)?',
      '¿Está expuesto a Internet?',
      'Proveedor o subencargado',
      'Depende del activo superior',
      'Valor en Disponibilidad',
      'Valor en Integridad',
      'Valor en Confidencialidad',
      'Valor del activo (0 a 5)',
      'Nivel del activo',
    ];
    cabeceras.forEach((h, i) => {
      const letra = String.fromCharCode(66 + i); // B onward
      expect(matriz.getCell(`${letra}7`).value).toBe(h);
    });
  });

  it('escribe el activo en la fila 8 con sus valores en las columnas correspondientes', async () => {
    const wb = await construirLibroInventario(FILAS, CAT);
    const matriz = wb.getWorksheet('Matriz de Activos')!;
    expect(matriz.getCell('B8').value).toBe('COM-APP-0001');
    expect(matriz.getCell('C8').value).toBe('CRM comercial de MinTrace');
    expect(matriz.getCell('E8').value).toBe('[SW] Aplicaciones (software)');
    expect(matriz.getCell('F8').value).toBe('[se] Servidor');
    expect(matriz.getCell('L8').value).toBe('Sí');
    expect(matriz.getCell('Q8').value).toBe('4 — Alto');
    expect(matriz.getCell('T8').value).toBe(4);
    expect(matriz.getCell('U8').value).toBe('Alto');
    expect(matriz.getCell('W8').value).toBe('LCO-01');
  });

  it('registra los rangos nombrados que alimentan los desplegables', async () => {
    const wb = await construirLibroInventario(FILAS, CAT);
    const mapa = (
      wb.definedNames as unknown as { matrixMap: Record<string, unknown> }
    ).matrixMap;
    const nombres = new Set(Object.keys(mapa));
    // The form's "global" lists.
    expect(nombres.has('LstTipo')).toBe(true);
    expect(nombres.has('LstCargo')).toBe(true);
    expect(nombres.has('LstProceso')).toBe(true);
    expect(nombres.has('MgValorEt')).toBe(true);
    expect(nombres.has('LstSiNo')).toBe(true);
    expect(nombres.has('LstProveedor')).toBe(true);
    expect(nombres.has('LstEntorno')).toBe(true);
    expect(nombres.has('LstUbicacion')).toBe(true);
    // One per type, named exactly what the dependent formula resolves to.
    expect(nombres.has('SUB_SW')).toBe(true);
    expect(nombres.has('SUB_HW')).toBe(true);
  });

  it('lista los subtipos bajo un rango cuyo contenido arranca el código del tipo', async () => {
    const wb = await construirLibroInventario(FILAS, CAT);
    const listas = wb.getWorksheet('Listas')!;
    // SUB_SW is written at the first subtipo column: L. Values start at row 6.
    expect(listas.getCell('L5').value ?? '').toContain('Subtipo');
    expect(listas.getCell('L6').value ?? '').toMatch(/^\[se\]/);
    expect([7, 8].map((r) => listas.getCell(`L${r}`).value)).toContain('[nf] Nube');
  });

  it('deja dropdowns por columna según la fila de encabezados', async () => {
    const wb = await construirLibroInventario(FILAS, CAT);
    const matriz = wb.getWorksheet('Matriz de Activos')!;
    const model = (
      matriz as unknown as { dataValidations: { model: Record<string, unknown> } }
    ).dataValidations.model;
    const claves = Object.keys(model);
    const clavesDrop = claves.map((c) => c.replace(/\d+.*/, ''));
    expect(clavesDrop).toEqual(
      expect.arrayContaining(['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S']),
    );
    expect(claves.length).toBeGreaterThanOrEqual(15);
  });
});
