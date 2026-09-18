// app/api/sgsi/acta-residual/route.ts
//
// Descarga del acta emitida (PDF), de un soporte firmado, y del registro en Excel.
//
// SE REGISTRA QUIÉN DESCARGÓ QUÉ, igual que `app/api/sgsi/anexo/route.ts`, y por la misma
// razón: el acta lleva el nombre, el proceso y la cifra residual de los activos más expuestos
// de la organización. Es el mapa que el layout de `/tecnologia` se niega a mostrar sin el grupo
// del Directorio, y acá va junto en un solo archivo.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { registrar } from '@/lib/sgsi/bitacora';
import { libroDelRegistro } from '@/lib/sgsi/registro-residual-libro';

export const dynamic = 'force-dynamic';

function respuesta(buffer: Buffer, mime: string, nombre: string): NextResponse {
  return new NextResponse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(buffer.length),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse('sin sesión', { status: 401 });
  const rol = rolDesdeGrupos(session.user?.grupos);
  if (!puede(rol, 'sgsi:ver')) return new NextResponse('sin permiso', { status: 403 });
  const autor = session.user?.email ?? 'desconocido';

  const url = new URL(req.url);
  const que = url.searchParams.get('que');
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return new NextResponse('id inválido', { status: 400 });

  if (que === 'soporte') {
    const s = await prisma.soporteActaResidual.findUnique({
      where: { id },
      select: {
        bytes: true,
        mime: true,
        nombreOriginal: true,
        acta: { select: { codigo: true } },
      },
    });
    if (!s) return new NextResponse('soporte no encontrado', { status: 404 });
    await registrar({ bitacora: prisma.bitacora }, autor, [
      {
        tabla: 'acta_riesgo_residual',
        registroId: s.acta.codigo,
        campo: 'soporte descargado',
        anterior: null,
        nuevo: s.nombreOriginal,
      },
    ]);
    return respuesta(Buffer.from(s.bytes), s.mime, s.nombreOriginal);
  }

  const acta = await prisma.actaRiesgoResidual.findUnique({
    where: { id },
    select: {
      codigo: true,
      // El blob sólo se lee acá, y sólo cuando se pide el PDF.
      documento: que === 'registro' ? false : true,
      activos: {
        orderBy: { cifraResidual: 'desc' },
        select: {
          codigo: true,
          nombre: true,
          proceso: true,
          banda: true,
          cifraResidual: true,
          planCodigo: true,
        },
      },
      firmantes: {
        select: { proceso: true, fechaFirma: true, firmante: { select: { nombre: true } } },
      },
    },
  });
  if (!acta) return new NextResponse('acta no encontrada', { status: 404 });

  if (que === 'registro') {
    // La firma es del PROCESO, así que cada activo hereda la de su proceso. Es lo mismo que
    // dice la hoja de firmas del acta, puesto al lado de cada renglón para que la hoja se
    // pueda filtrar y ordenar sin tener que cruzarla con nada.
    const porProceso = new Map(acta.firmantes.map((f) => [f.proceso, f]));
    const libro = await libroDelRegistro(
      acta.activos.map((a) => {
        const f = porProceso.get(a.proceso);
        return {
          codigo: a.codigo,
          nombre: a.nombre,
          proceso: a.proceso,
          banda: a.banda,
          cifra: a.cifraResidual.toString(),
          planCodigo: a.planCodigo,
          firmante: f?.firmante?.nombre ?? null,
          fechaFirma: f?.fechaFirma?.toISOString().slice(0, 10) ?? null,
        };
      }),
    );
    await registrar({ bitacora: prisma.bitacora }, autor, [
      {
        tabla: 'acta_riesgo_residual',
        registroId: acta.codigo,
        campo: 'registro descargado',
        anterior: null,
        nuevo: `${acta.activos.length} filas`,
      },
    ]);
    return respuesta(
      libro,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      `${acta.codigo}-registro.xlsx`,
    );
  }

  if (!acta.documento) return new NextResponse('el acta no tiene documento', { status: 500 });

  await registrar({ bitacora: prisma.bitacora }, autor, [
    {
      tabla: 'acta_riesgo_residual',
      registroId: acta.codigo,
      campo: 'acta descargada',
      anterior: null,
      nuevo: `${acta.activos.length} activos`,
    },
  ]);
  return respuesta(Buffer.from(acta.documento), 'application/pdf', `${acta.codigo}.pdf`);
}
