// app/api/debug/route.ts
//
// Development diagnostic for the SharePoint data path: it fetches the indicators
// workbook with the application's own credentials and dumps cell contents.
//
// It used to answer to anyone. The route sat outside the middleware matcher and checked
// nothing, so on a public deployment it handed the workbook to whoever asked, using the
// server's SharePoint credentials. Two gates now stand in front of it:
//
//   1. It does not exist in a production build. Not "requires a role" — absent.
//   2. In development it still demands a session, so a shared machine or a tunnelled
//      port is not an open door either.
//
// The middleware matcher covers it as well; these checks are here because a route that
// exposes credentials should not depend on a matcher entry staying correct.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { fetchIndicatorsBuffer } from '@/app/lib/sharepoint';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const buffer = await fetchIndicatorsBuffer('2026');
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheets = wb.worksheets.map(ws => ws.name);

    // Leer las primeras celdas del primer sheet para orientarnos
    const first = wb.worksheets[0];
    const sample: Record<string, unknown> = {};
    for (let r = 1; r <= 10; r++) {
      for (let c = 1; c <= 12; c++) {
        const v = first.getRow(r).getCell(c).value;
        if (v !== null && v !== undefined) {
          sample[`R${r}C${c}`] = v;
        }
      }
    }

    // Si existe la hoja esperada, leer celdas clave del resumen
    const cuadro = wb.getWorksheet('Cuadro de Mando 2026');
    const cuadroSample: Record<string, unknown> = {};
    if (cuadro) {
      for (let r = 5; r <= 15; r++) {
        for (let c = 1; c <= 12; c++) {
          const v = cuadro.getRow(r).getCell(c).value;
          if (v !== null && v !== undefined) {
            cuadroSample[`R${r}C${c}`] = typeof v === 'object' ? JSON.stringify(v) : v;
          }
        }
      }
    }

    // Helper para extraer resultado de fórmulas igual que el parser
    const cv = (ws: typeof cuadro, r: number, c: number) => {
      if (!ws) return null;
      const v = ws.getRow(r).getCell(c).value;
      if (v !== null && typeof v === 'object' && 'formula' in (v as object)) {
        return (v as { formula: string; result?: unknown }).result ?? null;
      }
      return v;
    }

    // Samplear filas de procesos (19-35) y fila mensual (31)
    const procesosSample: Record<string, unknown> = {};
    if (cuadro) {
      for (let r = 17; r <= 35; r++) {
        for (let c = 1; c <= 8; c++) {
          const v = cv(cuadro, r, c);
          if (v !== null && v !== undefined) {
            procesosSample[`R${r}C${c}`] = v;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      bufferSize: buffer.length,
      sheets,
      firstSheetName: first?.name,
      cuadroFound: !!cuadro,
      firstSheetSample: sample,
      cuadroSample,
      procesosSample,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: String(err),
    }, { status: 500 });
  }
}
