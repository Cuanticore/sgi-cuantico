// app/scorm/archivo/[paqueteId]/[...ruta]/route.ts
//
// Sirve los bytes de un paquete SCORM. Vive en el ORIGEN DE CONTENIDO y sólo responde ahí.
//
// No exige sesión a propósito (P3): el contenido de un curso es público dentro de la
// organización y el control de acceso está en la página del player, que sí la exige. Lo que
// no puede pasar es que esta ruta responda en el origen de la aplicación — ahí el
// JavaScript del curso tendría el origen de la sesión.
//
// **Responde por tramos, y lee por tramos.** Las dos mitades son necesarias y son distintas:
// sin `Accept-Ranges` y `206` el navegador no puede buscar dentro de un video; y si para
// contestar un tramo hubiera que traer el archivo entero de Postgres, un curso con video
// largo cargaría 200 MB en memoria por cada petición de rango. Eso último es la forma del
// `rowCount` inflado que HARNESS.md documenta como la primera cicatriz.

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { cspDelPaquete, esOrigenDeContenido } from '@/lib/sig/scorm-origen';
import { analizarRango } from '@/lib/sig/rango-http';

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

  // Los metadatos SIN los bytes. Es el cambio que impide cargar el archivo entero para
  // saber su mime.
  const archivo = await prisma.archivoScorm.findUnique({
    where: { paqueteId_ruta: { paqueteId: id, ruta: ruta.join('/') } },
    select: {
      id: true,
      mime: true,
      sha256: true,
      tamano: true,
      paquete: { select: { dominiosExternos: true } },
    },
  });
  if (archivo === null) return new NextResponse('archivo no encontrado', { status: 404 });

  // Van en los TRES caminos. Una respuesta parcial sin CSP sirve el contenido de un paquete
  // sin las restricciones que ese paquete declaró, y es el mismo contenido.
  const comunes: Record<string, string> = {
    'Content-Type': archivo.mime,
    // El contenido de un paquete es inmutable: una versión nueva es un paquete nuevo con
    // otro id, así que la URL cambia. Sin esto se leería de Postgres en cada vista.
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: `"${archivo.sha256}"`,
    'X-Content-Type-Options': 'nosniff',
    // `SCORM_ORIGEN_APP` va en `frame-ancestors`: la app embebe el runner que embebe este
    // contenido, y `frame-ancestors` mira toda la cadena. Sin él, `'self'` bloquea a la
    // app (otro origen) y el curso no carga. Ver `cspDelPaquete`.
    'Content-Security-Policy': cspDelPaquete(
      archivo.paquete.dominiosExternos,
      process.env.SCORM_ORIGEN_APP,
    ),
  };

  const rango = analizarRango(cabeceras.get('range'), archivo.tamano);

  if (rango.clase === 'inatendible') {
    // No se lee ni un byte para contestar que el rango no sirve.
    return new NextResponse('rango no satisfacible', {
      status: 416,
      headers: { ...comunes, 'Content-Range': `bytes */${archivo.tamano}` },
    });
  }

  const desde = rango.clase === 'parcial' ? rango.desde : 0;
  const hasta = rango.clase === 'parcial' ? rango.hasta : archivo.tamano - 1;
  const largo = Math.max(0, hasta - desde + 1);

  // `substring` sobre `bytea` corta EN POSTGRES y devuelve sólo el tramo. Es 1-indexado, de
  // ahí el `+ 1`. Los `::int` son deliberados: sin ellos el parámetro llega sin tipo y el
  // planificador puede no resolver la sobrecarga de `substring`.
  const filas = await prisma.$queryRaw<{ trozo: Uint8Array }[]>`
    SELECT substring("bytes" FROM ${desde + 1}::int FOR ${largo}::int) AS trozo
    FROM "archivo_scorm"
    WHERE "id" = ${archivo.id}
  `;

  const buffer = Buffer.from(filas[0]?.trozo ?? new Uint8Array(0));
  const cuerpo = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;

  if (rango.clase === 'parcial') {
    return new NextResponse(cuerpo, {
      status: 206,
      headers: {
        ...comunes,
        'Content-Length': String(largo),
        'Content-Range': `bytes ${desde}-${hasta}/${archivo.tamano}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  return new NextResponse(cuerpo, {
    status: 200,
    headers: { ...comunes, 'Content-Length': String(largo), 'Accept-Ranges': 'bytes' },
  });
}
