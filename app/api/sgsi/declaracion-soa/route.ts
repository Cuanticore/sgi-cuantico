// app/api/sgsi/declaracion-soa/route.ts
//
// The Statement of Applicability, as a downloadable workbook. Session, query, download;
// what the FILE looks like lives in `lib/sgsi/declaracion-libro.ts`, which has no session
// and no Prisma so a test can build the workbook and read its cells back — same
// IO-at-the-edge split as the import template.
//
// A SOA declaration is internal evidence and it is NOT under the /sgsi path, so the
// layout's read gate never sees this route: `sgsi:ver` is checked here explicitly,
// exactly as plantilla-activos does.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse(null, { status: 401 });

  if (!puede(rolDesdeGrupos(session.user?.grupos), 'sgsi:ver')) {
    return new NextResponse(null, { status: 403 });
  }

  const controles = await prisma.control.findMany({
    orderBy: { codigo: 'asc' },
    include: {
      dominio: true,
      capacidad: true,
      responsable: true,
      actual: true,
    },
  });

  const { construirDeclaracion } = await import('@/lib/sgsi/declaracion-libro');
  type FilaDeclaracion = import('@/lib/sgsi/declaracion-libro').FilaDeclaracion;

  const filas: FilaDeclaracion[] = controles.map((c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    dominio: c.dominio.nombre,
    capacidad: c.capacidad.nombre,
    estado:
      c.soa === 'NO' ? 'No aplica' : c.soa === 'PARCIAL' ? 'Aplica con alcance adaptado' : 'Aplica',
    descripcion: c.soaDescripcion ?? '',
    justificacion: c.justificacionSoa ?? '',
    responsable: c.responsable?.nombre ?? '',
    fechaCambio: c.soaActualizadoEn
      ? c.soaActualizadoEn.toLocaleDateString('es-AR')
      : '',
    madurez: c.actual ? `L${c.actual.nivel}` : '',
    version: c.soaVersion ? `v${c.soaVersion}` : '',
    fechaAprobacion: c.soaFecha ? c.soaFecha.toLocaleDateString('es-AR') : '',
    aprobadoPor: c.soaAprobadoPor ?? '',
  }));

  const wb = await construirDeclaracion(filas);
  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="SOA-declaracion-de-aplicabilidad.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
