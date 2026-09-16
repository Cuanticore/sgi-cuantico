// lib/sig/scorm-token.ts
//
// El token que autoriza una ejecución. Mismo mecanismo que `firmarAnexo` en
// `lib/sgsi/anexo-archivo.ts`: HMAC con vigencia corta, sin estado en la base.
//
// El secreto entra por parámetro y no se lee del entorno acá para que el módulo sea puro y
// probable — quien llama pasa `SGI_RUTAS_SECRETO`, igual que los anexos.

import { createHmac, timingSafeEqual } from 'node:crypto';

/// UNA HORA, y antes eran quince minutos.
///
/// Con 900 s el token se emitía al abrir el curso, no se renovaba en ninguna parte, y a
/// partir del minuto 15 **todo guardado se rechazaba**: el autoguardado de cada 60 s y el
/// commit final de `Terminate`. Una inducción de 40 minutos terminaba con la persona
/// habiendo hecho el curso entero y la asignación sin cerrar.
///
/// La vigencia larga NO es la protección principal, y por eso se puede estirar sin
/// aflojar nada: `guardarIntento` comprueba además la sesión y que el intento sea de quien
/// escribe. El token es la segunda llave, no la única, y lo que impide es que cambiar un
/// número en una petición alcance para escribir en el intento de otro.
///
/// Se renueva igual en cada guardado (`app/mi-sig/acciones/curso.ts`): la hora es el techo
/// para una máquina que se suspende, no la vida esperada del token.
export const VIGENCIA_POR_DEFECTO = 3600;

export function firmarIntento(
  intentoId: number,
  secreto: string,
  vigenciaSegundos = VIGENCIA_POR_DEFECTO,
): string {
  const exp = Math.floor(Date.now() / 1000) + vigenciaSegundos;
  const mensaje = `${intentoId}:${exp}`;
  const firma = createHmac('sha256', secreto).update(mensaje).digest('base64url');
  return `${Buffer.from(mensaje).toString('base64url')}.${firma}`;
}

/// `null` cuando el token es válido. `'vencido'` cuando la firma es NUESTRA y sólo pasó la
/// fecha; `'invalido'` para todo lo demás.
///
/// La distinción es para el mensaje, y el orden de las comprobaciones es de seguridad: la
/// firma se verifica SIEMPRE antes de mirar la fecha. Decir «vencido» sobre una firma que
/// no cuadra le confirmaría a quien prueba secretos que acertó el suyo.
export function motivoDe(token: string, secreto: string): 'vencido' | 'invalido' | null {
  const partes = descomponer(token, secreto);
  if (partes === null) return 'invalido';
  return partes.exp < Math.floor(Date.now() / 1000) ? 'vencido' : null;
}

export function verificarIntento(
  token: string,
  secreto: string,
): { intentoId: number; exp: number } | null {
  const partes = descomponer(token, secreto);
  if (partes === null) return null;
  if (partes.exp < Math.floor(Date.now() / 1000)) return null;
  return partes;
}

/// Comprueba la firma y devuelve el contenido, SIN mirar la fecha. Privada a propósito:
/// quien la use por fuera se saltaría el vencimiento, que es justo lo que no se puede hacer.
function descomponer(
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

    return { intentoId, exp };
  } catch {
    return null;
  }
}
