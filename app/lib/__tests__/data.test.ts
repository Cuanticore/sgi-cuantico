// app/lib/__tests__/data.test.ts
//
// Lo que se prueba acá es CUÁNDO se vuelve a leer el libro, que es lo único que decide si
// la pantalla muestra lo que alguien acaba de guardar o lo de hace un rato.
//
// Hubo una caché de cinco minutos. En una pantalla que se abre para revisar un indicador
// que se acaba de cargar, cinco minutos son eternos: la persona guarda en SharePoint,
// recarga, ve lo viejo, y concluye que el sistema no tomó su cambio. Y no había forma de
// forzarlo: `invalidateCache` existía, pero nadie la llamaba — ni un botón, ni una ruta.
//
// Cada carga relee. El costo es un viaje a Graph por año mostrado, y la URL compartida ya
// ahorró los dos viajes que antes resolvían el sitio y la biblioteca.

// Sin esto el archivo es un script y no un módulo, y sus ayudantes caen en el mismo ámbito
// global que los de `sharepoint.test.ts` — que también declara `modulo()`. Jest corre igual;
// `tsc --noEmit` es el que lo ve, y se queja de implementación duplicada.
export {};

const fetchIndicatorsBuffer = jest.fn();
const parseExcelBuffer = jest.fn();

jest.mock('../sharepoint', () => ({
  __esModule: true,
  fetchIndicatorsBuffer: (...args: unknown[]) => fetchIndicatorsBuffer(...args),
}));

jest.mock('../excel-parser', () => ({
  __esModule: true,
  parseExcelBuffer: (...args: unknown[]) => parseExcelBuffer(...args),
}));

async function modulo() {
  jest.resetModules();
  return import('../data');
}

function datos(avance: number) {
  return {
    summary: { avanceGlobal: avance, medidos: 1, totalIndicadores: 1, enMeta: 1, alerta: 0, critico: 0 },
    trimestres: [],
    procesos: [],
    mensual: [],
    indicadores: [],
    objetivosCalidad: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchIndicatorsBuffer.mockResolvedValue(Buffer.from('libro'));
});

describe('getIndicatorsData', () => {
  it('vuelve a leer el libro en cada llamada', async () => {
    parseExcelBuffer.mockResolvedValue(datos(80));

    const { getIndicatorsData } = await modulo();
    await getIndicatorsData('2026');
    await getIndicatorsData('2026');
    await getIndicatorsData('2026');

    expect(fetchIndicatorsBuffer).toHaveBeenCalledTimes(3);
  });

  // La prueba que importa: lo que se guardó en SharePoint hace un segundo tiene que verse
  // en la siguiente carga, no en la siguiente ventana de caché.
  it('sirve el valor nuevo apenas cambia el libro', async () => {
    parseExcelBuffer.mockResolvedValueOnce(datos(80)).mockResolvedValueOnce(datos(95));

    const { getIndicatorsData } = await modulo();
    const antes = await getIndicatorsData('2026');
    const despues = await getIndicatorsData('2026');

    expect(antes.summary.avanceGlobal).toBe(80);
    expect(despues.summary.avanceGlobal).toBe(95);
  });

  it('cada año lee su propio libro', async () => {
    parseExcelBuffer.mockResolvedValue(datos(80));

    const { getIndicatorsData } = await modulo();
    await getIndicatorsData('2026');
    await getIndicatorsData('2025');

    expect(fetchIndicatorsBuffer).toHaveBeenNthCalledWith(1, '2026');
    expect(fetchIndicatorsBuffer).toHaveBeenNthCalledWith(2, '2025');
  });

  it('sella cada lectura con la hora en que se hizo', async () => {
    parseExcelBuffer.mockResolvedValue(datos(80));

    const { getIndicatorsData } = await modulo();
    const d = await getIndicatorsData('2026');

    expect(Date.parse(d.fetchedAt)).not.toBeNaN();
  });
});

// El contador de la barra lateral es otra cosa, y por eso tiene su propia puerta.
//
// `ShellSig` envuelve `app/sgsi/layout.tsx` y `app/tecnologia/layout.tsx`, o sea unas
// treinta y cinco pantallas, y lo único que necesita del libro es `indicadores.length`
// para el numerito del menú. Si eso releyera en cada carga, abrir cualquier pantalla del
// SGSI se bajaría el libro entero de SharePoint para pintar un número de dos cifras.
//
// Las pantallas que MUESTRAN los datos releen siempre. El contador no.
describe('contarIndicadores', () => {
  it('reusa la lectura dentro de su ventana', async () => {
    parseExcelBuffer.mockResolvedValue(datos(80));

    const { contarIndicadores } = await modulo();
    await contarIndicadores();
    await contarIndicadores();
    await contarIndicadores();

    expect(fetchIndicatorsBuffer).toHaveBeenCalledTimes(1);
  });

  // Un fallo de SharePoint no puede tumbar el menú de treinta y cinco pantallas.
  it('devuelve cero si el libro no se puede leer', async () => {
    fetchIndicatorsBuffer.mockRejectedValue(new Error('sin red'));

    const { contarIndicadores } = await modulo();
    expect(await contarIndicadores()).toBe(0);
  });

  it('no comparte caché con la lectura fresca del tablero', async () => {
    parseExcelBuffer.mockResolvedValue(datos(80));

    const { contarIndicadores, getIndicatorsData } = await modulo();
    await contarIndicadores();
    await getIndicatorsData('2026');

    expect(fetchIndicatorsBuffer).toHaveBeenCalledTimes(2);
  });
});
