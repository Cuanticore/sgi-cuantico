import 'server-only';

// lib/sig/scorm-paquete.ts
//
// Descomprime un .zip de SCORM VALIDANDO ANTES de extraer, y lo guarda.
//
// El orden importa y es la razón de usar `yauzl`: primero se lee el directorio central
// —nombre y tamaño descomprimido de cada entrada— y sólo si todo el paquete pasa los
// límites se extrae. Una librería que descomprime de una pasada obligaría a confiar
// primero y validar después, que con una bomba zip llega tarde.

import { createHash } from 'node:crypto';
import yauzl from 'yauzl';
import { prisma } from '@/lib/db';
import { LIMITE_ARCHIVOS, excedeElTotal, limiteDescomprimido, rutaSegura } from '@/lib/sig/scorm-zip';
import { analizarManifiesto, type Resultado } from '@/lib/sig/scorm-manifiesto';

export interface EntradaExtraida {
  ruta: string;
  /// `Buffer<ArrayBuffer>` y no `Buffer` a secas: la columna `Bytes` de Prisma 7 pide un
  /// `Uint8Array` sobre un `ArrayBuffer` propio, y el `Buffer` genérico admite además
  /// `SharedArrayBuffer`, que ahí no vale.
  bytes: Buffer<ArrayBuffer>;
}

const MIMES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  xsd: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'audio/ogg',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  eot: 'application/vnd.ms-fontobject',
  pdf: 'application/pdf',
  vtt: 'text/vtt',
};

/// El MIME se decide por extensión y con lista blanca. Lo que no está en la lista se sirve
/// como `application/octet-stream`: nunca se adivina `text/html` para una extensión
/// desconocida, porque eso convierte un archivo cualquiera en una página ejecutable dentro
/// del origen de contenido.
export function mimeDe(ruta: string): string {
  const ext = ruta.split('.').pop()?.toLowerCase() ?? '';
  return MIMES[ext] ?? 'application/octet-stream';
}

export function extraer(zip: Buffer, maxZipMb: number): Promise<EntradaExtraida[]> {
  const techo = limiteDescomprimido(maxZipMb);

  return new Promise((resolver, rechazar) => {
    yauzl.fromBuffer(zip, { lazyEntries: true }, (err, archivo) => {
      if (err || !archivo) return rechazar(err ?? new Error('el .zip no se pudo abrir'));

      const salida: EntradaExtraida[] = [];
      let acumulado = 0;
      let contadas = 0;

      archivo.readEntry();

      archivo.on('entry', (entrada: yauzl.Entry) => {
        // Los directorios no se guardan: la ruta completa de cada archivo ya los implica.
        if (entrada.fileName.endsWith('/')) return archivo.readEntry();

        const ruta = rutaSegura(entrada.fileName);
        if (ruta === null) {
          archivo.close();
          return rechazar(
            new Error(
              `el paquete trae una entrada con ruta insegura («${entrada.fileName}»). ` +
                'Se rechaza completo: un solo archivo que escapa del directorio es un ataque, ' +
                'no un descuido.',
            ),
          );
        }

        contadas += 1;
        if (contadas > LIMITE_ARCHIVOS) {
          archivo.close();
          return rechazar(
            new Error(`el paquete trae más de ${LIMITE_ARCHIVOS} archivos: eso no es un curso`),
          );
        }

        acumulado += entrada.uncompressedSize;
        if (excedeElTotal(acumulado, techo)) {
          archivo.close();
          return rechazar(
            new Error(
              `descomprimido el paquete supera ${Math.round(techo / 1024 / 1024)} MB. ` +
                'Se detiene ANTES de extraer: es el caso de la bomba zip.',
            ),
          );
        }

        archivo.openReadStream(entrada, (err2, flujo) => {
          if (err2 || !flujo) {
            archivo.close();
            return rechazar(err2 ?? new Error(`no se pudo leer «${ruta}»`));
          }
          const trozos: Buffer[] = [];
          flujo.on('data', (t: Buffer) => trozos.push(t));
          flujo.on('end', () => {
            // `Buffer.concat` asigna SIEMPRE un búfer nuevo y no compartido; el tipo de
            // `@types/node` es más laxo que el hecho, y se estrecha acá sin copiar.
            salida.push({ ruta, bytes: Buffer.concat(trozos) as Buffer<ArrayBuffer> });
            archivo.readEntry();
          });
          flujo.on('error', (e) => {
            archivo.close();
            rechazar(e);
          });
        });
      });

      archivo.on('end', () => resolver(salida));
      archivo.on('error', (e) => rechazar(e));
    });
  });
}

export interface PaqueteGuardado {
  paqueteId: number;
  version: number;
}

/// Analiza y guarda. Devuelve el resultado del análisis sin guardar nada cuando el paquete
/// no pasa: un paquete rechazado no debe dejar filas a medio escribir.
export async function guardarPaquete(
  contenidoId: number,
  zip: Buffer,
  personaId: number | null,
  maxZipMb: number,
): Promise<{ ok: true; guardado: PaqueteGuardado } | { ok: false; motivo: string }> {
  const entradas = await extraer(zip, maxZipMb);

  const manifiesto = entradas.find((e) => e.ruta === 'imsmanifest.xml');
  if (manifiesto === undefined) {
    return {
      ok: false,
      motivo:
        'el paquete no tiene imsmanifest.xml en la raíz. Sin manifiesto no hay paquete SCORM: ' +
        'no se puede saber cuál es el SCO ni qué edición declara.',
    };
  }

  const rutas = entradas.map((e) => e.ruta);
  // Sólo el HTML se le pasa al análisis: es donde se ve si el curso apunta afuera (D-1).
  const contenidos: Record<string, string> = {};
  for (const e of entradas) {
    if (e.ruta.endsWith('.html') || e.ruta.endsWith('.htm')) {
      contenidos[e.ruta] = e.bytes.toString('utf8');
    }
  }

  const analisis: Resultado = analizarManifiesto(
    manifiesto.bytes.toString('utf8'),
    rutas,
    contenidos,
  );
  if (!analisis.ok) return { ok: false, motivo: analisis.motivo };

  const ultimo = await prisma.paqueteScorm.findFirst({
    where: { contenidoId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (ultimo?.version ?? 0) + 1;

  const paquete = await prisma.paqueteScorm.create({
    data: {
      contenidoId,
      version,
      clase: analisis.paquete.clase,
      edicion: analisis.paquete.edicion,
      organizacionId: analisis.paquete.organizacionId,
      tituloOrganizacion: analisis.paquete.tituloOrganizacion,
      entradaHref: analisis.paquete.entradaHref,
      dominiosExternos: analisis.paquete.dominiosExternos,
      zipSha256: createHash('sha256').update(zip).digest('hex'),
      zipTamano: zip.length,
      archivos: entradas.length,
      subidoPorId: personaId,
    },
    select: { id: true },
  });

  // En lotes: `createMany` con 2 000 archivos y sus bytes en una sola sentencia puede
  // pasarse del límite de parámetros del protocolo de Postgres.
  const LOTE = 50;
  for (let i = 0; i < entradas.length; i += LOTE) {
    await prisma.archivoScorm.createMany({
      data: entradas.slice(i, i + LOTE).map((e) => ({
        paqueteId: paquete.id,
        ruta: e.ruta,
        mime: mimeDe(e.ruta),
        tamano: e.bytes.length,
        sha256: createHash('sha256').update(e.bytes).digest('hex'),
        bytes: e.bytes,
      })),
    });
  }

  return { ok: true, guardado: { paqueteId: paquete.id, version } };
}
