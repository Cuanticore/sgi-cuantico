import 'server-only';

// lib/sgsi/anexos.ts
//
// Evidencia anexa: límites y almacenamiento detrás de una interfaz. La parte pura
// (lista blanca, firma mágica, hash, firma de ruta) vive en anexo-archivo.ts para que
// el test la cubra sin arrastrar Prisma.
//
// DECISIÓN (27/08/2026): los anexos se almacenan EN LA BASE DE DATOS (BYTEA, tabla
// evidencia_archivo 1:1). El adaptador `almacenPostgres` es el que se usa por defecto;
// `almacenLocal` (disco fuera de la raíz web, vía SGI_ARCHIVOS_DIR) queda solo como
// fallback de desarrollo. El día que la organización quiera bucket, el adaptador S3
// (claves previstas: SGI_S3_ENDPOINT, SGI_S3_REGION, SGI_S3_BUCKET, SGI_S3_ACCESS_KEY,
// SGI_S3_SECRET_KEY, SGI_RUTAS_FIRMADAS_TTL) se enchufa aquí sin tocar la UI.

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';

/// Límites configurables por parámetros del sistema. Defaults: 25 MB por archivo,
/// 200 MB por control.
export async function limitesAnexos(): Promise<{ porArchivo: number; porControl: number }> {
  const filas = await prisma.parametro.findMany({
    where: { clave: { in: ['anexo_tamano_max_mb', 'anexo_total_max_mb'] } },
  });
  const leer = (clave: string, porDefecto: number) => {
    const f = filas.find((p) => p.clave === clave);
    const n = f ? Number(f.valor) : NaN;
    return Number.isFinite(n) && n > 0 ? n : porDefecto;
  };
  return {
    porArchivo: leer('anexo_tamano_max_mb', 25) * 1024 * 1024,
    porControl: leer('anexo_total_max_mb', 200) * 1024 * 1024,
  };
}

export interface AlmacenAnexos {
  guardar(evidenciaId: string, buffer: Buffer): Promise<void>;
  leer(evidenciaId: string): Promise<Buffer>;
}

/// Postgres (BYTEA) — el almacenamiento de los anexos. La clave S3-style de la fila de
/// evidencia queda como identidad; los bytes van en `evidencia_archivo` (1:1).
export const almacenPostgres: AlmacenAnexos = {
  async guardar(evidenciaId, buffer) {
    const id = Number(evidenciaId);
    if (!Number.isInteger(id)) throw new Error(`evidenciaId inválido: ${evidenciaId}`);
    await prisma.evidenciaArchivo.upsert({
      where: { evidenciaId: id },
      update: { bytes: new Uint8Array(buffer) },
      create: { evidenciaId: id, bytes: new Uint8Array(buffer) },
    });
  },
  async leer(evidenciaId) {
    const id = Number(evidenciaId);
    const fila = await prisma.evidenciaArchivo.findUnique({
      where: { evidenciaId: id },
      select: { bytes: true },
    });
    if (!fila) throw new Error('archivo no disponible');
    return Buffer.from(fila.bytes);
  },
};

export const DIR_ANEXOS = () => process.env.SGI_ARCHIVOS_DIR ?? join(process.cwd(), 'var', 'sgsi-anexos');

/// Disco local: ruta fuera de la raíz web, configurable por entorno. Solo como
/// fallback de desarrollo — producción guarda en la base (véase el encabezado).
export const almacenLocal: AlmacenAnexos = {
  async guardar(evidenciaId, buffer) {
    const ruta = join(DIR_ANEXOS(), `${evidenciaId}.bin`);
    await mkdir(join(ruta, '..'), { recursive: true });
    await writeFile(ruta, buffer);
  },
  async leer(evidenciaId) {
    return readFile(join(DIR_ANEXOS(), `${evidenciaId}.bin`));
  },
};

/// Adaptador activo: base de datos por defecto; `SGI_ARCHIVOS_PROVEEDOR=local` cambia a
/// disco (modo dev sin Postgres, aunque la app entera depende de él, así que rara vez).
export function almacenActivo(): AlmacenAnexos {
  return process.env.SGI_ARCHIVOS_PROVEEDOR === 'local' ? almacenLocal : almacenPostgres;
}

export interface ResultadoAntivirus {
  escaneado: boolean;
  infectado: boolean;
  motivo: string;
}

/// Análisis antivirus antes de dejar el archivo disponible.
///
/// Se ejecuta si el entorno define `SGI_ANTIVIRUS_CMD` — un comando que reciba el
/// archivo en `{archivo}` y devuelva 0 si está limpio, ≠0 si está infectado (ClamAV:
/// `clamscan {archivo}`, o el wrapper que la haya organización: `scan.sh {archivo}`).
/// Sin motor configurado el anexo se rechaza igual por lista blanca + verificación de
/// contenido, y la bitácora deja constancia de que la inspección externa no corrió.
export async function escanearAntivirus(buffer: Buffer): Promise<ResultadoAntivirus> {
  const cmd = process.env.SGI_ANTIVIRUS_CMD;
  if (!cmd || !cmd.includes('{archivo}')) {
    return {
      escaneado: false,
      infectado: false,
      motivo: 'motor antivirus no configurado (SGI_ANTIVIRUS_CMD) — se aplicó lista blanca y verificación de contenido',
    };
  }
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), 'sgi-antivirus-'));
    const ruta = join(dir, 'analisis.bin');
    await writeFile(ruta, buffer);
    const comando = cmd.split(/\s+/);
    const idx = comando.indexOf('{archivo}');
    comando[idx] = ruta;
    const ejecutar = promisify(execFile);
    // Exit 0 = limpio; cualquier otro código = infectado o error (se rechaza igual).
    await (await ejecutar(comando[0], comando.slice(1), { timeout: 120_000 })).stdout;
    return { escaneado: true, infectado: false, motivo: 'análisis antivirus: limpio' };
  } catch {
    return { escaneado: true, infectado: true, motivo: 'análisis antivirus: rechazado (código de salida ≠ 0)' };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/// La dirección IP de la petición, para la bitácora de anexos. Null cuando no se ve una
/// cabecera fiable — registrar una proxy que no es del autor sería peor que no registrar.
export async function ipDesdeSolicitud(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
    const real = h.get('x-real-ip');
    return real ?? null;
  } catch {
    return null;
  }
}
