// app/lib/data.ts
import { IndicatorsData } from './types';
import { fetchIndicatorsBuffer, IndicatorYear } from './sharepoint';
import { parseExcelBuffer } from './excel-parser';

/// Cada carga relee el libro.
///
/// Hubo una caché de cinco minutos acá. En una pantalla que se abre justamente para
/// revisar un indicador que se acaba de cargar, cinco minutos son eternos: la persona
/// guarda en SharePoint, recarga, ve lo de antes, y concluye que el sistema no tomó su
/// cambio. Peor todavía, no había cómo forzarlo: `invalidateCache` existía y estaba
/// exportada, pero NADIE la llamaba —ni un botón, ni una ruta, ni una acción—, así que la
/// única salida era esperar o reiniciar el proceso.
///
/// El costo es un viaje a Graph por año mostrado. La URL compartida ya se llevó los dos
/// viajes que antes resolvían el sitio y la biblioteca, así que leer de nuevo cuesta hoy
/// menos que lo que costaba leer una sola vez antes.
export async function getIndicatorsData(year: IndicatorYear = '2026'): Promise<IndicatorsData> {
  const buffer = await fetchIndicatorsBuffer(year);
  const parsed = await parseExcelBuffer(buffer, year);
  return { ...parsed, fetchedAt: new Date().toISOString() };
}

/// Sólo el número que `ShellSig` pone al lado de «Indicadores» en el menú.
///
/// Esta puerta existe porque `ShellSig` envuelve `app/sgsi/layout.tsx` y
/// `app/tecnologia/layout.tsx` —unas treinta y cinco pantallas—, y lo único que necesita
/// del libro es cuántas filas tiene. Si leyera en vivo como el tablero, abrir cualquier
/// pantalla del SGSI se bajaría el libro entero de SharePoint para pintar dos cifras.
///
/// Lo que MUESTRA los datos relee siempre; el contador se conforma con una ventana. Un
/// número de menú que tarda unos minutos en moverse no confunde a nadie: el tablero, que
/// es donde se va a mirar, ya está al día.
const VENTANA_DEL_CONTADOR = 5 * 60 * 1000;
let contadorEnCache: { valor: number; momento: number } | null = null;

export async function contarIndicadores(): Promise<number> {
  if (contadorEnCache && Date.now() - contadorEnCache.momento < VENTANA_DEL_CONTADOR) {
    return contadorEnCache.valor;
  }
  try {
    const { indicadores } = await getIndicatorsData();
    contadorEnCache = { valor: indicadores.length, momento: Date.now() };
    return indicadores.length;
  } catch {
    // Un fallo de SharePoint deja el menú sin número, no sin menú.
    return 0;
  }
}
