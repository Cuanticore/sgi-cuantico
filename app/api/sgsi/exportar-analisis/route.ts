// app/api/sgsi/exportar-analisis/route.ts
//
// «Análisis de riesgos» a Excel, con los mismos colores que la pantalla.
//
// Mismo corte que `exportar-activos`: la sesión y los datos acá, el aspecto del archivo en
// `lib/sgsi/analisis-libro.ts`, que no toca Prisma y por eso se puede probar solo.
//
// La ruta NO está bajo `/sgsi`, así que la puerta del layout no la ve: `sgsi:ver` se
// comprueba acá explícitamente. Quien tiene sesión válida y no el permiso recibe 403 y no
// 404 — el archivo lleva el inventario en riesgo, y decir «no existe» sería mentir.
//
// LOS CÓDIGOS VIAJAN, LOS DATOS NO. La pantalla manda qué filas está viendo y en qué orden;
// las cifras se vuelven a derivar acá con el MISMO `filasAnalisis` que las derivó allá. Si en
// cambio el cliente mandara los valores, un navegador con la pestaña abierta desde ayer
// exportaría las cifras de ayer y el archivo diría que son las de hoy.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { leerAnalisisRiesgos } from '@/app/components/sgsi/valoracion-riesgos/analisis-riesgos.query';
import { FILTROS_ANALISIS_VACIOS, filasAnalisis } from '@/lib/sgsi/analisis-riesgos';
import { construirResolverDeuda } from '@/lib/sgsi/deuda-planes';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse(null, { status: 401 });

  if (!puede(rolDesdeGrupos(session.user?.grupos), 'sgsi:ver')) {
    return new NextResponse(null, { status: 403 });
  }

  const url = new URL(request.url);
  const pedidos = (url.searchParams.get('codigos') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const datos = await leerAnalisisRiesgos();
  const resolverDeuda = construirResolverDeuda(datos.accionesParaDeuda);
  const todas = filasAnalisis(
    { activos: datos.activos, bandas: datos.bandas, umbral: datos.umbral },
    FILTROS_ANALISIS_VACIOS,
    resolverDeuda,
  );

  // Sin `codigos` se exporta todo lo que está en análisis, que es el comportamiento de un
  // clic. Con ellos se respeta además EL ORDEN en que la pantalla los mandó: quien ordenó la
  // grilla por proceso espera abrir el archivo y encontrarlo ordenado por proceso.
  const porCodigo = new Map(todas.map((f) => [f.codigo, f]));
  const filas =
    pedidos.length === 0
      ? todas
      : pedidos.map((c) => porCodigo.get(c)).filter((f): f is (typeof todas)[number] => f !== undefined);

  const { construirLibroAnalisis } = await import('@/lib/sgsi/analisis-libro');
  const wb = await construirLibroAnalisis(filas, {
    enAnalisis: todas.length,
    totalVigentes: datos.activos.length,
    umbral: datos.umbral,
  });
  const buffer = await wb.xlsx.writeBuffer();

  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Analisis de riesgos ${fecha}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
