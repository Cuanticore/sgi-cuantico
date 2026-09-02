// app/api/sgsi/plantilla-activos/route.ts
//
// Session, catalogues, download. What the FILE looks like lives in
// `lib/sgsi/plantilla-libro.ts`, which has no session and no Prisma so a test can build the
// workbook and read its dropdowns back — same IO-at-the-edge split as the import reader.
//
// PROPIETARIO and CUSTODIO are read as two lists because the organisation asked for them
// separately: the `esPropietario` / `esCustodio` flags are two curated views of one position
// catalogue, and the template has to offer the same two lists the asset sheet does. A
// template that offered the union would put values in the file that the form refuses.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { construirPlantilla } from '@/lib/sgsi/plantilla-libro';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse(null, { status: 401 });

  // A session alone is not enough. This file carries the internal catalogues — every
  // process, custodian, owner and provider — and it is NOT under the /sgsi path, so the
  // layout's read gate never sees it. `403`, not `404`: the caller is authenticated and
  // hiding the route's existence from them buys nothing.
  if (!puede(rolDesdeGrupos(session.user?.grupos, session.user?.email), 'sgsi:ver')) {
    return new NextResponse(null, { status: 403 });
  }

  const [tipos, subtipos, areas, cargos, escala, ubicaciones, entornos, proveedores] =
    await Promise.all([
      prisma.tipoMagerit.findMany({
        where: { activo: true },
        orderBy: { orden: 'asc' },
        select: { id: true, codigo: true, nombre: true },
      }),
      prisma.subtipoMagerit.findMany({
        where: { activo: true },
        orderBy: [{ tipoId: 'asc' }, { codigo: 'asc' }],
        select: { tipoId: true, codigo: true, nombre: true },
      }),
      prisma.area.findMany({
        where: { activa: true },
        orderBy: { orden: 'asc' },
        select: { nombre: true },
      }),
      prisma.cargoResponsable.findMany({
        where: { activo: true },
        orderBy: { orden: 'asc' },
        select: { nombre: true, esPropietario: true, esCustodio: true },
      }),
      prisma.escalaValor.findMany({ orderBy: { orden: 'asc' }, select: { valor: true, etiqueta: true } }),
      prisma.ubicacion.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' }, select: { nombre: true } }),
      prisma.entorno.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' }, select: { nombre: true } }),
      prisma.proveedor.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' }, select: { nombre: true } }),
    ]);

  const wb = await construirPlantilla({
    tipos,
    subtipos,
    areas,
    custodios: cargos.filter((c) => c.esCustodio),
    propietarios: cargos.filter((c) => c.esPropietario),
    ubicaciones,
    entornos,
    proveedores,
    escala,
  });

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="FOR-SIG-12-plantilla-activos.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
