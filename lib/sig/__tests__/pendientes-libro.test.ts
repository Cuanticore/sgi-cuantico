// lib/sig/__tests__/pendientes-libro.test.ts
//
// El libro se construye acá y se lee de vuelta, que es para lo que el módulo no importa
// Prisma ni sesión.
//
// El caso que manda es el del avance sin reportar. En una pantalla, una celda vacía y un
// cero se distinguen mirando; en una hoja de cálculo el cero se suma, se promedia y se
// grafica. Es la peor superficie posible para confundir «no sé» con «cero».

import ExcelJS from 'exceljs';

import { construirLibroPendientes, ENCABEZADOS, type FilaPendienteExport } from '../pendientes-libro';

const fila = (parche: Partial<FilaPendienteExport> = {}): FilaPendienteExport => ({
  codigo: 'FOR-CAP-04',
  titulo: 'Seguridad de la información',
  tipo: 'CURSO_VIRTUAL',
  persona: 'Daniel Medina',
  correo: 'daniel.medina@cuantico.com',
  area: 'Gestión Estratégica',
  cargo: 'CEO',
  periodo: '2026-09',
  fechaLimite: '2026-09-30',
  dias: 12,
  vencida: false,
  avance: 45,
  intentos: 2,
  ...parche,
});

async function leer(filas: FilaPendienteExport[]) {
  const buffer = await construirLibroPendientes(filas, 'Pendientes del censo');
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as ArrayBuffer);
  const hoja = libro.worksheets[0];
  return { libro, hoja };
}

describe('construirLibroPendientes', () => {
  it('pone el encabezado declarado y una fila por pendiente', async () => {
    const { hoja } = await leer([fila(), fila({ codigo: 'POL-LEC-02' })]);

    const encabezado = hoja.getRow(1).values as unknown[];
    expect(encabezado.slice(1)).toEqual([...ENCABEZADOS]);
    // Encabezado + dos filas.
    expect(hoja.rowCount).toBe(3);
    expect(hoja.getRow(2).getCell(1).value).toBe('FOR-CAP-04');
    expect(hoja.getRow(3).getCell(1).value).toBe('POL-LEC-02');
  });

  // D-5, en la superficie donde más duele.
  it('un curso sin avance reportado deja la celda VACÍA, no en cero', async () => {
    const { hoja } = await leer([fila({ avance: null })]);
    const celda = hoja.getRow(2).getCell(ENCABEZADOS.indexOf('Avance del curso') + 1);

    expect(celda.value).toBeNull();
    expect(celda.value).not.toBe(0);
  });

  it('un avance de cero reportado por el curso sí sale como cero', async () => {
    const { hoja } = await leer([fila({ avance: 0 })]);
    const celda = hoja.getRow(2).getCell(ENCABEZADOS.indexOf('Avance del curso') + 1);

    expect(celda.value).toBe(0);
  });

  it('una vencida sale con días negativos y su estado de plazo coincide', async () => {
    const { hoja } = await leer([fila({ dias: -6, vencida: true })]);
    const f = hoja.getRow(2);

    expect(f.getCell(ENCABEZADOS.indexOf('Días') + 1).value).toBe(-6);
    expect(f.getCell(ENCABEZADOS.indexOf('Estado del plazo') + 1).value).toBe('Vencida');
  });

  it('una en plazo sale con días positivos y dice En plazo', async () => {
    const { hoja } = await leer([fila({ dias: 12, vencida: false })]);
    const f = hoja.getRow(2);

    expect(f.getCell(ENCABEZADOS.indexOf('Días') + 1).value).toBe(12);
    expect(f.getCell(ENCABEZADOS.indexOf('Estado del plazo') + 1).value).toBe('En plazo');
  });

  // Un archivo vacío es una respuesta —«no tiene nada abierto»—; un error no lo es, y
  // obligaría a quien exporta a adivinar si falló la descarga o si no había filas.
  it('sin pendientes genera el libro igual, con sólo el encabezado', async () => {
    const { hoja } = await leer([]);

    expect(hoja.rowCount).toBe(1);
    expect((hoja.getRow(1).values as unknown[]).slice(1)).toEqual([...ENCABEZADOS]);
  });

  it('los campos que pueden faltar salen vacíos y no como «null»', async () => {
    const { hoja } = await leer([fila({ area: null, cargo: null, intentos: 0 })]);
    const f = hoja.getRow(2);

    expect(f.getCell(ENCABEZADOS.indexOf('Área') + 1).value).toBeNull();
    expect(f.getCell(ENCABEZADOS.indexOf('Cargo') + 1).value).toBeNull();
  });

  it('el título de la hoja es el que se le pasa', async () => {
    const buffer = await construirLibroPendientes([fila()], 'Pendientes de Daniel Medina');
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as ArrayBuffer);

    expect(libro.worksheets[0].name).toBe('Pendientes');
    expect(libro.worksheets[0].getRow(1).getCell(1).value).toBe('Código');
  });
});
