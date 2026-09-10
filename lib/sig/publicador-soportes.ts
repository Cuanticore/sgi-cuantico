import 'server-only';

// lib/sig/publicador-soportes.ts
//
// Publica un soporte en la carpeta de su persona, y drena la cola.
//
// Vive en `lib/` con `server-only` y NO en un archivo de acciones por la misma razón que
// `trabajos.ts`: en un archivo `'use server'` toda exportación se vuelve una server action
// invocable desde el navegador, y esto corre sin compuerta de permiso porque detrás hay un
// cron y no una persona.
//
// Ninguna decisión se toma acá: los nombres y la política de reintentos vienen del módulo
// puro, y la clasificación de fallos de `graph-fallo.ts`. Este archivo es el cableado.

import {
  asegurarCarpetaDePersona,
  resolverCarpetaBase,
  subirSoporte,
} from '@/app/lib/sharepoint';
import { prisma } from '@/lib/db';
import { almacenPostgres } from '@/lib/sgsi/anexos';
import { registrar } from '@/lib/sgsi/bitacora';
import { explicarFallo, type FalloGraph } from '@/lib/sgsi/graph-fallo';
import {
  debeDetenerElLote,
  esperaAntesDeReintentar,
  estadoTrasFallo,
  gastaIntento,
  nombreDeArchivo,
  nombreDeCarpeta,
  rutaCompleta,
} from '@/lib/sig/soportes-sharepoint';

export interface ResultadoPublicacion {
  publicados: number;
  pendientes: number;
  bloqueados: number;
  detalle: string;
}

const SELECCION = {
  id: true,
  intentos: true,
  evidenciaId: true,
  persona: {
    select: { id: true, correo: true, carpetaSoportesId: true, carpetaSoportesRuta: true },
  },
  evidencia: {
    select: {
      id: true,
      archivoNombre: true,
      archivoMime: true,
      actaPdf: {
        select: {
          codigo: true,
          aceptadoEn: true,
          contenidoVersion: true,
          contenido: { select: { codigo: true } },
        },
      },
    },
  },
} as const;

async function anotarFallo(
  publicacionId: number,
  intentos: number,
  falla: FalloGraph,
): Promise<void> {
  const intentosNuevos = gastaIntento(falla.causa) ? intentos + 1 : intentos;
  await prisma.publicacionSoporte.update({
    where: { id: publicacionId },
    data: {
      estado: estadoTrasFallo(falla.causa, intentosNuevos),
      intentos: intentosNuevos,
      ultimoIntentoEn: new Date(),
      causaFallo: falla.causa,
      detalleFallo: explicarFallo(falla),
    },
  });
}

/// Publica UNA fila. Devuelve la causa del fallo cuando no pudo, para que el lote decida si
/// vale la pena seguir con las siguientes.
export async function publicarUno(
  publicacionId: number,
): Promise<{ ok: true } | { ok: false; causa: FalloGraph['causa'] }> {
  const fila = await prisma.publicacionSoporte.findUnique({
    where: { id: publicacionId },
    select: SELECCION,
  });
  if (!fila) return { ok: false, causa: 'NO_EXISTE' };

  const base = await resolverCarpetaBase();
  if (!base.ok) {
    await anotarFallo(fila.id, fila.intentos, base.fallo);
    return { ok: false, causa: base.fallo.causa };
  }

  const nombreCarpeta = nombreDeCarpeta(fila.persona.correo);
  const conocida =
    fila.persona.carpetaSoportesId !== null && fila.persona.carpetaSoportesRuta !== null
      ? { id: fila.persona.carpetaSoportesId, nombre: fila.persona.carpetaSoportesRuta }
      : null;

  const carpeta = await asegurarCarpetaDePersona(
    base.datos.driveId,
    base.datos.carpetaBaseId,
    nombreCarpeta,
    conocida,
  );
  if (!carpeta.ok) {
    await anotarFallo(fila.id, fila.intentos, carpeta.fallo);
    return { ok: false, causa: carpeta.fallo.causa };
  }

  if (
    fila.persona.carpetaSoportesId !== carpeta.datos.id ||
    fila.persona.carpetaSoportesRuta !== carpeta.datos.nombre
  ) {
    await prisma.persona.update({
      where: { id: fila.persona.id },
      data: {
        carpetaSoportesId: carpeta.datos.id,
        carpetaSoportesRuta: carpeta.datos.nombre,
      },
    });
  }

  const acta = fila.evidencia.actaPdf[0] ?? null;
  const nombre = nombreDeArchivo({
    // Sin acta el soporte no tiene código propio; se usa el id de la evidencia, que es
    // único y permite reencontrarlo. Hoy no pasa —solo se encolan actas— pero el modelo
    // admite otros soportes (§3) y un `undefined` en el nombre sería un archivo anónimo.
    codigo: acta?.codigo ?? `EVI-${fila.evidencia.id}`,
    documentoCodigo: acta?.contenido.codigo ?? null,
    documentoVersion: acta?.contenidoVersion ?? null,
    aceptadoEn: acta?.aceptadoEn ?? new Date(),
    extension: (fila.evidencia.archivoNombre ?? 'archivo.txt').split('.').pop() as string,
  });

  let bytes: Buffer;
  try {
    // `almacenPostgres` y no `almacenActivo()`: la firma escribe los bytes por la relación
    // inline, que es siempre la tabla de Postgres. Mismo criterio que `/api/sig/acta`.
    bytes = await almacenPostgres.leer(String(fila.evidencia.id));
  } catch {
    await prisma.publicacionSoporte.update({
      where: { id: fila.id },
      data: {
        estado: 'BLOQUEADO',
        ultimoIntentoEn: new Date(),
        causaFallo: 'SIN_ARCHIVO',
        detalleFallo:
          'La evidencia no tiene bytes guardados. No es un problema de SharePoint: el ' +
          'artefacto no se generó o se borró de la base.',
      },
    });
    return { ok: false, causa: 'NO_EXISTE' };
  }

  const subida = await subirSoporte(
    base.datos.driveId,
    carpeta.datos.id,
    nombre,
    bytes,
    fila.evidencia.archivoMime ?? 'application/octet-stream',
  );
  if (!subida.ok) {
    await anotarFallo(fila.id, fila.intentos, subida.fallo);
    return { ok: false, causa: subida.fallo.causa };
  }

  const ruta = rutaCompleta(
    process.env.SHAREPOINT_SOPORTES_PATH as string,
    carpeta.datos.nombre,
    nombre,
  );

  await prisma.publicacionSoporte.update({
    where: { id: fila.id },
    data: {
      estado: 'PUBLICADO',
      intentos: fila.intentos + 1,
      ultimoIntentoEn: new Date(),
      publicadoEn: new Date(),
      driveItemId: subida.datos.id,
      webUrl: subida.datos.webUrl,
      rutaPublicada: ruta,
      nombreArchivo: nombre,
      causaFallo: null,
      detalleFallo: null,
    },
  });

  await registrar({ bitacora: prisma.bitacora }, 'sistema', [
    {
      tabla: 'publicacion_soporte',
      registroId: String(fila.id),
      campo: 'publicado',
      anterior: null,
      nuevo: ruta,
      motivo: 'publicación del soporte en SharePoint',
    },
  ]);

  return { ok: true };
}

/// El disparo inmediato al firmar (§7.1). Encuentra la fila por su evidencia porque es lo
/// que la transacción de la firma acaba de crear.
export async function publicarPorEvidencia(evidenciaId: number): Promise<void> {
  const fila = await prisma.publicacionSoporte.findUnique({
    where: { evidenciaId },
    select: { id: true },
  });
  if (fila) await publicarUno(fila.id);
}

/// Drena la cola. `limite` acota una corrida para que un histórico grande no monopolice el
/// proceso: lo que no alcance sale en la corrida siguiente.
export async function publicarPendientes(limite = 50): Promise<ResultadoPublicacion> {
  const ahora = Date.now();
  const candidatas = await prisma.publicacionSoporte.findMany({
    where: { estado: 'PENDIENTE' },
    orderBy: [{ ultimoIntentoEn: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    select: { id: true, intentos: true, ultimoIntentoEn: true },
    take: limite,
  });

  let publicados = 0;
  let detenidoPor: FalloGraph['causa'] | null = null;

  for (const c of candidatas) {
    // P9 · respetar la espera. Sin esto el cron reintentaría cada hora lo que pidió un día.
    if (
      c.ultimoIntentoEn !== null &&
      ahora - c.ultimoIntentoEn.getTime() < esperaAntesDeReintentar(c.intentos)
    ) {
      continue;
    }

    const r = await publicarUno(c.id);
    if (r.ok) {
      publicados += 1;
      continue;
    }
    if (debeDetenerElLote(r.causa)) {
      detenidoPor = r.causa;
      break;
    }
  }

  const [pendientes, bloqueados] = await Promise.all([
    prisma.publicacionSoporte.count({ where: { estado: 'PENDIENTE' } }),
    prisma.publicacionSoporte.count({ where: { estado: 'BLOQUEADO' } }),
  ]);

  const detalle =
    detenidoPor === null
      ? `${publicados} publicados · ${pendientes} pendientes · ${bloqueados} bloqueados`
      : `${publicados} publicados · lote detenido por ${detenidoPor} · ${pendientes} pendientes · ` +
        `${bloqueados} bloqueados`;

  return { publicados, pendientes, bloqueados, detalle };
}
