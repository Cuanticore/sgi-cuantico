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
  //
  // Son las de SEGURIDAD y las de identidad del recurso. El `Cache-Control` viaja acá por
  // comodidad, pero NO es de esa familia y el 416 lo pisa: ver abajo.
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
    //
    // **Dos cabeceras se apartan de `comunes` a propósito. No las unifiques.**
    //
    // `Cache-Control: no-store` — un 416 con `max-age` de un año es almacenable (RFC 9111
    // §3: el código no tiene que ser 200 si hay frescura explícita). Sin `Vary: Range`, un
    // proxy o CDN compartido ingenuo lo guarda con la URL como única clave y se lo entrega a
    // un `GET` posterior SIN `Range`. Una petición mal formada de un solo reproductor dejaría
    // el curso caído para todos los que estén detrás de esa caché, y por un año. El
    // `Cache-Control` no es política de seguridad; la CSP, el `ETag` y el `nosniff` sí, y
    // ésos sí van en los tres caminos.
    //
    // `Content-Type` — el cuerpo es un texto de error, no el video. Anunciar `video/mp4`
    // sobre «rango no satisfacible», y encima con `nosniff`, es mentirle al navegador.
    return new NextResponse('rango no satisfacible', {
      status: 416,
      headers: {
        ...comunes,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Range': `bytes */${archivo.tamano}`,
      },
    });
  }

  const desde = rango.clase === 'parcial' ? rango.desde : 0;
  const hasta = rango.clase === 'parcial' ? rango.hasta : archivo.tamano - 1;
  const largo = Math.max(0, hasta - desde + 1);

  // `substring` sobre `bytea` corta EN POSTGRES y devuelve sólo el tramo. Es 1-indexado, de
  // ahí el `+ 1`. Los `::int` son deliberados: sin ellos el parámetro llega sin tipo y el
  // planificador puede no resolver la sobrecarga de `substring`.
  //
  // El `<ArrayBuffer>` del tipo no es decorativo: `BodyInit` no acepta un `ArrayBufferLike`
  // porque ése admite `SharedArrayBuffer`. Prisma decodifica un `bytea` a un `Buffer` de
  // Node, que siempre va sobre un `ArrayBuffer` común — se declara en vez de castear.
  const filas = await prisma.$queryRaw<{ trozo: Uint8Array<ArrayBuffer> }[]>`
    SELECT substring("bytes" FROM ${desde + 1}::int FOR ${largo}::int) AS trozo
    FROM "archivo_scorm"
    WHERE "id" = ${archivo.id}
  `;

  // Entre las dos consultas no hay transacción, así que la fila pudo irse en el medio —el
  // borrado de un paquete arrastra sus archivos en cascada—. Se contesta 404, que es la
  // verdad. **Un `?? new Uint8Array(0)` acá sería peor que el error**: respondería 200 con
  // el `Content-Length` del archivo y cero bytes de cuerpo, y Node no cierra una respuesta
  // que no cumple su `Content-Length` — el reproductor se queda esperando para siempre, sin
  // nada en los registros.
  const trozo = filas[0]?.trozo;
  if (trozo === undefined) return new NextResponse('archivo no encontrado', { status: 404 });

  // El `Uint8Array` se entrega TAL CUAL. Un `Buffer.from(...)` copia, y un `.slice()` del
  // `ArrayBuffer` copia otra vez: sumadas a la que ya hizo Prisma al decodificar el `bytea`,
  // un `GET` sin `Range` de un video de 200 MB movía ~600 MB transitorios. Sería la misma
  // falla que esta ruta fue a arreglar, sobreviviendo en el único camino que todavía toca el
  // archivo entero.
  if (rango.clase === 'parcial') {
    return new NextResponse(trozo, {
      status: 206,
      headers: {
        ...comunes,
        'Content-Length': String(largo),
        'Content-Range': `bytes ${desde}-${hasta}/${archivo.tamano}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }

  return new NextResponse(trozo, {
    status: 200,
    headers: { ...comunes, 'Content-Length': String(largo), 'Accept-Ranges': 'bytes' },
  });
}
