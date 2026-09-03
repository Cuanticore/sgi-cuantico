// lib/sgsi/anexo-archivo.ts
//
// Validación de archivos de evidencia y firma de descarga. PURAS — sin prisma, sin
// I/O, sin fr... frameworks: la ruta, la UI y el test comparten esta implementación,
// así que la lista blanca y las firmas se prueban una sola vez y no por memoria.

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/// Extensiones aceptadas y su tipo MIME. Ejecutables y macros quedan fuera: un .exe,
/// .msi, .jar, .vbs, .scr o un .docm/.xlsm son exactamente el vector que la lista
/// blanca existe para cerrar.
export const ANEXOS_ACEPTADOS: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  zip: 'application/zip',
};

export function esExtension(extension: string): extension is keyof typeof ANEXOS_ACEPTADOS {
  return extension in ANEXOS_ACEPTADOS;
}

/// Firma mágica del contenido — el tipo se verifica por CONTENIDO, no por extensión:
/// una extensión es una afirmación, el primer byte es un hecho.
export function mimePorContenido(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buffer.length >= 4 && (buffer.subarray(0, 4).toString('latin1') === 'PK\u0003\u0004' || buffer.subarray(0, 4).toString('latin1') === 'PK\u0005\u0006')) return 'application/zip';
  return null;
}

export function sha256De(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/// El dueño de un anexo. `Evidencia` admite cuatro; el prefijo los separa para que un
/// listado del almacén siga diciendo de quién es cada objeto sin consultar la base.
export type DuenoAnexo = 'control' | 'evento' | 'hallazgo';

/// Clave generada por el servidor. El nombre original NUNCA es la ruta: es un dato
/// (archivo_nombre) mientras la clave es una identidad sin colisión.
export function clavePara(dueno: DuenoAnexo, duenoId: number, extension: string): string {
  const id = randomUUID();
  return `sgsi/${dueno}-${duenoId}/anexos/${id}.${extension}`;
}

function secretoRutas(): string {
  return process.env.SGI_RUTAS_SECRETO ?? process.env.AUTH_SECRET ?? 'sgi-dev-secret';
}

/// Firma HMAC de la ruta de descarga (vigencia corta). Reservada en uso pleno para el
/// adaptador S3; el GET local la valida además contra la sesión.
export function firmarAnexo(id: number, expiraEnSegundos = 900): string {
  const exp = Math.floor(Date.now() / 1000) + expiraEnSegundos;
  const mensaje = `${id}:${exp}`;
  const firma = createHmac('sha256', secretoRutas()).update(mensaje).digest('base64url');
  return `${Buffer.from(mensaje).toString('base64url')}.${firma}`;
}

export function verificarFirma(token: string): { id: number; exp: number } | null {
  const [base, firma] = token.split('.');
  if (!base || !firma) return null;
  try {
    const [idTexto, expTexto] = Buffer.from(base, 'base64url').toString('utf8').split(':');
    const id = Number(idTexto);
    const exp = Number(expTexto);
    if (!Number.isInteger(id) || !Number.isFinite(exp)) return null;
    const esperada = createHmac('sha256', secretoRutas()).update(`${id}:${exp}`).digest();
    const recibida = Buffer.from(firma, 'base64url');
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    return { id, exp };
  } catch {
    return null;
  }
}

export function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
