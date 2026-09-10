// app/scorm/archivo/[paqueteId]/[...ruta]/route.ts
//
// Sirve los bytes de un paquete SCORM. Vive en el ORIGEN DE CONTENIDO y sólo responde ahí.
//
// No exige sesión a propósito (P3): el contenido de un curso es público dentro de la
// organización y el control de acceso está en la página del player, que sí la exige. Lo que
// no puede pasar es que esta ruta responda en el origen de la aplicación — ahí el
// JavaScript del curso tendría el origen de la sesión.

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { cspDelPaquete, esOrigenDeContenido } from '@/lib/sig/scorm-origen';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ paqueteId: string; ruta: string[] }> },
) {
  const cabeceras = await headers();
  if (!esOrigenDeContenido(cabeceras.get('host'), process.env.SCORM_ORIGEN_CONTENIDO)) {
    return new NextResponse('no disponible en este origen', { status: 404 });
  }

  const { paqueteId, ruta } = await params;
  const id = Number(paqueteId);
  if (!Number.isInteger(id)) return new NextResponse('paquete inválido', { status: 400 });

  const archivo = await prisma.archivoScorm.findUnique({
    where: { paqueteId_ruta: { paqueteId: id, ruta: ruta.join('/') } },
    select: {
      bytes: true,
      mime: true,
      sha256: true,
      paquete: { select: { dominiosExternos: true } },
    },
  });
  if (archivo === null) return new NextResponse('archivo no encontrado', { status: 404 });

  const buffer = Buffer.from(archivo.bytes);
  return new NextResponse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    {
      headers: {
        'Content-Type': archivo.mime,
        'Content-Length': String(buffer.length),
        // El contenido de un paquete es inmutable: una versión nueva es un paquete nuevo con
        // otro id, así que la URL cambia. Sin esto se leería de Postgres en cada vista.
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"${archivo.sha256}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': cspDelPaquete(archivo.paquete.dominiosExternos),
      },
    },
  );
}
