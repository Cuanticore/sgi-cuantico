// lib/sig/scorm-token.ts
//
// El token que autoriza una ejecución. Mismo mecanismo que `firmarAnexo` en
// `lib/sgsi/anexo-archivo.ts`: HMAC con vigencia corta, sin estado en la base.
//
// El secreto entra por parámetro y no se lee del entorno acá para que el módulo sea puro y
// probable — quien llama pasa `SGI_RUTAS_SECRETO`, igual que los anexos.

import { createHmac, timingSafeEqual } from 'node:crypto';

export function firmarIntento(intentoId: number, secreto: string, vigenciaSegundos = 900): string {
  const exp = Math.floor(Date.now() / 1000) + vigenciaSegundos;
  const mensaje = `${intentoId}:${exp}`;
  const firma = createHmac('sha256', secreto).update(mensaje).digest('base64url');
  return `${Buffer.from(mensaje).toString('base64url')}.${firma}`;
}

export function verificarIntento(
  token: string,
  secreto: string,
): { intentoId: number; exp: number } | null {
  const [base, firma] = token.split('.');
  if (!base || !firma) return null;
  try {
    const mensaje = Buffer.from(base, 'base64url').toString('utf8');
    const [idTexto, expTexto] = mensaje.split(':');
    const intentoId = Number(idTexto);
    const exp = Number(expTexto);
    if (!Number.isInteger(intentoId) || !Number.isFinite(exp)) return null;

    const esperada = createHmac('sha256', secreto).update(mensaje).digest();
    const recibida = Buffer.from(firma, 'base64url');
    if (esperada.length !== recibida.length) return null;
    if (!timingSafeEqual(esperada, recibida)) return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;

    return { intentoId, exp };
  } catch {
    return null;
  }
}
