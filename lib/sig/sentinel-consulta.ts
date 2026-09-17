import 'server-only';

// lib/sig/sentinel-consulta.ts
//
// **El cliente de Log Analytics: el token y la consulta, en un solo lugar.**
//
// Mismo reparto que `lib/sgsi/graph-consulta.ts` y por la misma razón que ese comentario
// ya deja escrita: una credencial que se pide en un solo lugar es una credencial que
// mañana se arregla en uno. Acá no hay ninguna regla de negocio — qué es un incidente, si
// cambió o cuánto abarca la sincronización lo deciden `sentinel.ts` y `sentinel-fallo.ts`,
// los dos puros y probados sin red. Este módulo solo pide el token, hace la consulta y
// traduce el código de respuesta con las reglas de aquéllos.
//
// **Por qué NO comparte credenciales con lo que ya existe.** `AZURE_AD_*` es el registro
// del inicio de sesión de la aplicación entera: apuntar la sincronización ahí obligaría a
// concederle Log Analytics Reader al app registration por el que entra toda la empresa —
// el radio de exposición de un secreto filtrado pasaría de «lee incidentes de Sentinel» a
// «además puede autenticar a cualquiera». `SHAREPOINT_*` es peor: ese service principal
// tiene permisos de ESCRITURA en Graph (deshabilita cuentas, sube archivos). `SENTINEL_*`
// son variables nuevas y separadas: menor privilegio, y un secreto de Sentinel filtrado
// solo puede leer incidentes.

import {
  clasificarConsultaSentinel,
  clasificarTokenSentinel,
  variablesSentinelQueFaltan,
  type ResultadoSentinel,
} from './sentinel-fallo';
import { ventanaDeSincronizacion, type RespuestaLogAnalytics } from './sentinel';

/// Token de aplicación para Log Analytics, vía `client_credentials`.
export async function tokenDeLogAnalytics(): Promise<ResultadoSentinel<string>> {
  const faltan = variablesSentinelQueFaltan(process.env as Record<string, string | undefined>);
  if (faltan.length > 0) {
    return { ok: false, fallo: { causa: 'SIN_CONFIGURAR', faltan } };
  }
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${process.env.SENTINEL_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: process.env.SENTINEL_CLIENT_ID as string,
          client_secret: process.env.SENTINEL_CLIENT_SECRET as string,
          scope: 'https://api.loganalytics.io/.default',
        }),
      },
    );
    if (!res.ok) {
      // El endpoint de token trae `error`/`error_description` en el cuerpo, y ahí está la
      // diferencia entre un secreto vencido y un tenant equivocado.
      const cuerpo = (await res.json().catch(() => ({}))) as {
        error?: string;
        error_description?: string;
      };
      return {
        ok: false,
        fallo: clasificarTokenSentinel(res.status, cuerpo.error ?? cuerpo.error_description ?? ''),
      };
    }
    const cuerpo = (await res.json()) as { access_token?: string };
    if (!cuerpo.access_token) {
      return { ok: false, fallo: clasificarTokenSentinel(res.status, 'respuesta sin access_token') };
    }
    return { ok: true, datos: cuerpo.access_token };
  } catch (e) {
    return { ok: false, fallo: { causa: 'SIN_RED', detalle: mensajeDe(e) } };
  }
}

/// Ejecuta una consulta KQL contra el workspace configurado.
///
/// **D11 — la única ventana de tiempo es esta.** `ventanaDeSincronizacion(process.env)` va
/// como `timespan` del cuerpo, y el KQL que llega en `kql` (típicamente `KQL_INCIDENTES`)
/// NUNCA debe llevar su propio `ago()`: dos ventanas compitiendo pierden filas en silencio,
/// y esta función no tiene forma de saber si `kql` trae una — por eso esa regla se impone
/// en `sentinel.ts`, donde `KQL_INCIDENTES` se prueba sin red.
///
/// **Nunca lanza.** Todo `catch` cae en `SIN_RED`: quien llama (el trabajo de
/// sincronización) necesita un `ResultadoSentinel` en cada camino para poder registrar el
/// fallo en `EjecucionTrabajo` sin que una excepción no atrapada tumbe la corrida entera.
export async function consultarLogAnalytics(
  kql: string,
): Promise<ResultadoSentinel<RespuestaLogAnalytics>> {
  const faltan = variablesSentinelQueFaltan(process.env as Record<string, string | undefined>);
  if (faltan.length > 0) {
    return { ok: false, fallo: { causa: 'SIN_CONFIGURAR', faltan } };
  }
  const token = await tokenDeLogAnalytics();
  if (!token.ok) return token;
  try {
    const res = await fetch(
      `https://api.loganalytics.io/v1/workspaces/${process.env.SENTINEL_WORKSPACE_ID}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.datos}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: kql,
          timespan: ventanaDeSincronizacion(process.env as Record<string, string | undefined>),
        }),
      },
    );
    if (!res.ok) {
      // El cuerpo de error de Log Analytics trae `error.message`, y ese detalle es lo que
      // distingue un KQL mal formado (CONSULTA_INVALIDA) de cualquier otra cosa.
      const cuerpo = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      return {
        ok: false,
        fallo: clasificarConsultaSentinel(res.status, cuerpo.error?.message ?? ''),
      };
    }
    return { ok: true, datos: (await res.json()) as RespuestaLogAnalytics };
  } catch (e) {
    return { ok: false, fallo: { causa: 'SIN_RED', detalle: mensajeDe(e) } };
  }
}

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : 'error desconocido';
}
