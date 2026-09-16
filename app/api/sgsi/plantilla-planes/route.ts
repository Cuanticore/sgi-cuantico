// app/api/sgsi/plantilla-planes/route.ts
//
// Descarga FOR-SIG-13 v02 con las listas desplegables pobladas desde los catálogos REALES.
//
// La plantilla se GENERA y no se guarda como archivo en el repositorio. Un .xlsx versionado
// envejece el día que se agrega un control o un cargo, y entonces el formato ofrece opciones
// que el importador rechaza — la peor combinación posible, porque el desplegable promete que
// el valor es válido. Generándola, las listas son siempre las de hoy.
//
// Fuera de `/sgsi`, así que el portero del layout no la ve: el permiso se comprueba acá, como
// en `plantilla-activos` y `exportar-activos`.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { construirPlantillaPlanes } from '@/lib/sgsi/plan-plantilla-libro';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse(null, { status: 401 });
  if (!puede(rolDesdeGrupos(session.user?.grupos), 'sgsi:ver')) {
    return new NextResponse(null, { status: 403 });
  }

  const [controles, cargos, madurez] = await Promise.all([
    // Sólo los aplicables. Ofrecer en el desplegable un control marcado «no aplica» sería
    // invitar a colgarle un plan a algo que por restricción no tiene madurez, y ese plan no
    // podría cerrarse nunca.
    prisma.control.findMany({
      where: { soa: { not: 'NO' } },
      orderBy: { codigo: 'asc' },
      select: { codigo: true, nombre: true },
    }),
    prisma.cargoResponsable.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      select: { nombre: true },
    }),
    prisma.escalaMadurez.findMany({ orderBy: { nivel: 'asc' }, select: { nivel: true } }),
  ]);

  const hoy = new Date();
  const libro = await construirPlantillaPlanes(
    {
      // Código y nombre juntos: el código es la llave por la que el importador resuelve, y
      // verlo junto al nombre evita elegir el control equivocado por parecido de nombre.
      controles: controles.map((c) => `${c.codigo} — ${c.nombre}`),
      cargos: cargos.map((c) => c.nombre),
      madurez: madurez.map((m) => String(m.nivel)),
    },
    hoy,
  );

  const buffer = await libro.xlsx.writeBuffer();
  const nombre = `FOR-SIG-13 Plan de Tratamiento y Mejora ${hoy.toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    },
  });
}
