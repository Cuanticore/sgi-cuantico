import 'server-only';

// lib/sgsi/graph-consulta.ts
//
// **El cliente de Microsoft Graph: el token y la consulta, en un solo lugar.**
//
// Salió de `directorio.ts` cuando apareció el segundo consumidor (`graph-licencias.ts`).
// El comentario que ese módulo ya llevaba escrito lo pedía en voz alta: «estaba escrito tres
// veces palabra por palabra; una credencial que se pide en tres lugares es una credencial que
// mañana se arregla en dos». Copiarlo para las licencias habría vuelto a crear exactamente esa
// situación, con la diferencia de que esta vez estaba avisada.
//
// Acá no hay ninguna regla de negocio: quién entra al censo lo decide `graph-usuario.ts` y por
// qué falló una consulta lo decide `graph-fallo.ts`, los dos puros y probados sin red. Este
// módulo sólo pide el token, hace la llamada y traduce el código de respuesta con las reglas
// de aquéllos.

import {
  clasificarRecurso,
  clasificarToken,
  variablesQueFaltan,
  type ResultadoGraph,
} from '@/lib/sgsi/graph-fallo';

/// Token de aplicación para Graph.
export async function tokenDeGraph(): Promise<ResultadoGraph<string>> {
  const faltan = variablesQueFaltan(process.env as Record<string, string | undefined>);
  if (faltan.length > 0) {
    return { ok: false, fallo: { causa: 'SIN_CONFIGURAR', faltan } };
  }
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${process.env.SHAREPOINT_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: process.env.SHAREPOINT_CLIENT_ID as string,
          client_secret: process.env.SHAREPOINT_CLIENT_SECRET as string,
          scope: 'https://graph.microsoft.com/.default',
        }),
      },
    );
    if (!res.ok) {
      // El cuerpo del endpoint de token trae `error` y `error_description`, y ahí está la
      // diferencia entre un secreto vencido y un tenant equivocado. Tirarlo obligaba a
      // reproducir el fallo con curl para averiguar lo que la respuesta ya decía.
      const cuerpo = (await res.json().catch(() => ({}))) as {
        error?: string;
        error_description?: string;
      };
      return {
        ok: false,
        fallo: clasificarToken(res.status, cuerpo.error ?? cuerpo.error_description ?? ''),
      };
    }
    const cuerpo = (await res.json()) as { access_token?: string };
    if (!cuerpo.access_token) {
      return { ok: false, fallo: clasificarToken(res.status, 'respuesta sin access_token') };
    }
    return { ok: true, datos: cuerpo.access_token };
  } catch (e) {
    return { ok: false, fallo: { causa: 'SIN_RED', detalle: mensajeDe(e) } };
  }
}

/// Una consulta a Graph con el token ya resuelto. Concentra la clasificación del fallo
/// para que cada endpoint no la repita —y no la repita distinto.
///
/// **Cada llamada devuelve su propio resultado.** No hay un estado global de «Graph anda» o
/// «Graph no anda»: dos consultas distintas pueden fallar por causas distintas —o fallar una
/// y responder la otra— y quien llama tiene que poder mostrar lo que sí obtuvo. Es la regla
/// P8 de REQ-SIG-15, y vive acá porque es lo que hace que degradar por separado sea el
/// comportamiento por omisión en vez de algo que cada pantalla tenga que recordar.
export async function consultarGraph<T>(
  url: string,
  recurso: string,
  permiso: string,
): Promise<ResultadoGraph<T>> {
  const token = await tokenDeGraph();
  if (!token.ok) return token;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token.datos}` } });
    if (!res.ok) return { ok: false, fallo: clasificarRecurso(res.status, recurso, permiso) };
    return { ok: true, datos: (await res.json()) as T };
  } catch (e) {
    return { ok: false, fallo: { causa: 'SIN_RED', detalle: mensajeDe(e) } };
  }
}

/// Una ESCRITURA en Graph, con el token ya resuelto.
///
/// Es la hermana de `consultarGraph` y vive al lado por la misma razón por la que aquélla
/// salió de `directorio.ts`: el token, el `Authorization` y la traducción del código de
/// respuesta son lo mismo lea o escriba, y copiarlos para el bloqueo habría creado otra vez
/// la situación que este archivo vino a cerrar.
///
/// **No lee el cuerpo de la respuesta.** Las dos escrituras que existen hoy no devuelven un
/// recurso: `PATCH /users/{oid}` contesta 204 sin contenido y `revokeSignInSessions` contesta
/// un `{ "value": true }` que no agrega nada a lo que el código de estado ya dijo. Un
/// `res.json()` incondicional sobre el 204 revienta con «Unexpected end of JSON input» y ese
/// error se leería como que la escritura falló cuando de hecho ocurrió — el peor resultado
/// posible en una operación que deshabilita la cuenta de una persona.
///
/// `cuerpo` en `null` es para el POST sin carga: sin él iría un `Content-Type: application/json`
/// anunciando un cuerpo que no existe.
export async function escribirEnGraph(
  url: string,
  metodo: 'PATCH' | 'POST',
  cuerpo: Record<string, unknown> | null,
  recurso: string,
  permiso: string,
): Promise<ResultadoGraph<null>> {
  const token = await tokenDeGraph();
  if (!token.ok) return token;
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token.datos}`,
        ...(cuerpo !== null && { 'Content-Type': 'application/json' }),
      },
      ...(cuerpo !== null && { body: JSON.stringify(cuerpo) }),
    });
    if (!res.ok) return { ok: false, fallo: clasificarRecurso(res.status, recurso, permiso) };
    return { ok: true, datos: null };
  } catch (e) {
    return { ok: false, fallo: { causa: 'SIN_RED', detalle: mensajeDe(e) } };
  }
}

export function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : 'error desconocido';
}
