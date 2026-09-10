// app/lib/sharepoint.ts
import axios from 'axios';

import {
  clasificarRecurso,
  clasificarToken,
  variablesQueFaltan,
  type FalloGraph,
  type ResultadoGraph,
} from '@/lib/sgsi/graph-fallo';

const GRAPH = 'https://graph.microsoft.com/v1.0';

// Axios has no default timeout: a Graph call that never answers holds the request open
// until the platform kills it. Measured on the production build, the dashboard spent
// 2.2 s of its 2.2 s render waiting on calls that were going to fail anyway — the whole
// budget of REQ-SIG-01 §7 burned reaching a screen that then says the indicators are
// unavailable. Ten seconds is generous for Graph and still bounded, and every caller
// already degrades when this throws.
//
// It is an instance and not `axios.defaults` on purpose: the default object is shared with
// whatever else imports axios later, and a timeout chosen for Graph is not a timeout
// chosen for them.
const http = axios.create({ timeout: 10_000 });

export type IndicatorYear = '2025' | '2026';

export async function getToken(): Promise<string> {
  const res = await http.post(
    `https://login.microsoftonline.com/${process.env.SHAREPOINT_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHAREPOINT_CLIENT_ID!,
      client_secret: process.env.SHAREPOINT_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data.access_token;
}

export async function getSiteId(token: string): Promise<string> {
  const res = await http.get(
    `${GRAPH}/sites/${process.env.SHAREPOINT_SITE_URL}:/sites/${process.env.SHAREPOINT_SITE_NAME}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.id;
}

export async function getDriveId(token: string, siteId: string): Promise<string> {
  const res = await http.get(
    `${GRAPH}/sites/${siteId}/drives`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const drives: { id: string; name: string }[] = res.data.value;
  const drive = drives.find(d => d.name === 'Documents' || d.name === 'Shared Documents') ?? drives[0];
  return drive.id;
}

const FILE_CONFIG: Record<IndicatorYear, { path: string; file: string }> = {
  '2026': {
    path: process.env.SHAREPOINT_INDICATORS_PATH!,
    file: process.env.SHAREPOINT_INDICATORS_FILE!,
  },
  '2025': {
    path: process.env.SHAREPOINT_INDICATORS_PATH_2025!,
    file: process.env.SHAREPOINT_INDICATORS_FILE_2025!,
  },
};

export async function fetchIndicatorsBuffer(year: IndicatorYear = '2026'): Promise<Buffer> {
  // Dev: read from local filesystem if path is configured
  const localEnvKey = year === '2026' ? 'LOCAL_INDICATORS_FILE_2026' : 'LOCAL_INDICATORS_FILE_2025';
  const localPath = process.env[localEnvKey];
  if (localPath) {
    const fs = await import('fs');
    return fs.readFileSync(localPath);
  }

  const token = await getToken();
  const siteId = await getSiteId(token);
  const driveId = await getDriveId(token, siteId);
  const { path, file } = FILE_CONFIG[year];
  const filePath = `${path}/${file}`;

  const res = await http.get(
    `${GRAPH}/sites/${siteId}/drives/${driveId}/root:/${encodeURIComponent(filePath).replace(/%2F/g, '/')}:/content`,
    { headers: { Authorization: `Bearer ${token}` }, responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

// ── Escritura de soportes (REQ-SIG-13) ──────────────────────────────────────────────────
//
// Lo que sigue existe para publicar las actas de firma en la carpeta de cada persona.
// Reusa el token, el sitio y la biblioteca de arriba —no abre un segundo camino a Graph— y
// clasifica cada fallo con `lib/sgsi/graph-fallo.ts` en vez de dejar escapar el error de
// axios: la pantalla tiene que poder decir QUÉ hacer, no «error al publicar».

/// El permiso que se nombra en un 403. Es el de REQ-SIG-13 §8: menos que
/// `Files.ReadWrite.All`, que daría escritura sobre todo el tenant a un secreto de un `.env`.
const PERMISO_ESCRITURA = 'Sites.Selected (rol write)';

/// P7 · el sitio y la biblioteca son estables; hoy se resuelven en cada llamada, que son dos
/// viajes a Graph antes de cada operación útil. La caché vive en el proceso y se invalida al
/// reiniciar, que es exactamente cuando puede haber cambiado la configuración.
let idsEnCache: { siteId: string; driveId: string } | null = null;

function faltanVariables(): string[] {
  const propias = ['SHAREPOINT_SITE_URL', 'SHAREPOINT_SITE_NAME', 'SHAREPOINT_SOPORTES_PATH'];
  return [
    ...variablesQueFaltan(process.env),
    ...propias.filter((v) => (process.env[v] ?? '').trim() === ''),
  ];
}

function fallo(e: unknown, recurso: string): FalloGraph {
  if (axios.isAxiosError(e)) {
    if (e.response) return clasificarRecurso(e.response.status, recurso, PERMISO_ESCRITURA);
    return { causa: 'SIN_RED', detalle: e.code ?? e.message };
  }
  return { causa: 'SIN_RED', detalle: e instanceof Error ? e.message : String(e) };
}

/// Graph identifica una ruta con `root:/a/b/c:` — las barras NO se codifican, todo lo demás sí.
function rutaGraph(ruta: string): string {
  return encodeURIComponent(ruta).replace(/%2F/g, '/');
}

async function tokenYIds(): Promise<
  ResultadoGraph<{ token: string; siteId: string; driveId: string }>
> {
  const faltan = faltanVariables();
  if (faltan.length > 0) return { ok: false, fallo: { causa: 'SIN_CONFIGURAR', faltan } };

  let token: string;
  try {
    token = await getToken();
  } catch (e) {
    if (axios.isAxiosError(e) && e.response) {
      return { ok: false, fallo: clasificarToken(e.response.status, e.response.statusText ?? '') };
    }
    return { ok: false, fallo: fallo(e, 'el endpoint de token') };
  }

  if (idsEnCache) return { ok: true, datos: { token, ...idsEnCache } };

  try {
    const siteId = await getSiteId(token);
    const driveId = await getDriveId(token, siteId);
    idsEnCache = { siteId, driveId };
    return { ok: true, datos: { token, siteId, driveId } };
  } catch (e) {
    return { ok: false, fallo: fallo(e, 'el sitio o la biblioteca de SharePoint') };
  }
}

export interface CarpetaBase {
  driveId: string;
  carpetaBaseId: string;
}

export async function resolverCarpetaBase(): Promise<ResultadoGraph<CarpetaBase>> {
  const base = await tokenYIds();
  if (!base.ok) return base;
  const { token, driveId } = base.datos;
  const ruta = process.env.SHAREPOINT_SOPORTES_PATH as string;

  try {
    const res = await http.get(`${GRAPH}/drives/${driveId}/root:/${rutaGraph(ruta)}:`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { ok: true, datos: { driveId, carpetaBaseId: res.data.id } };
  } catch (e) {
    // P1 · si no existe, se FALLA. No se crea: una variable mal escrita no debe convertirse
    // en un árbol de carpetas fantasma dentro de la biblioteca del SIG.
    return { ok: false, fallo: fallo(e, `la carpeta «${ruta}»`) };
  }
}

export interface CarpetaDePersona {
  id: string;
  nombre: string;
}

export async function asegurarCarpetaDePersona(
  driveId: string,
  carpetaBaseId: string,
  nombre: string,
  conocida: CarpetaDePersona | null,
): Promise<ResultadoGraph<CarpetaDePersona>> {
  if (conocida !== null && conocida.nombre === nombre) {
    return { ok: true, datos: conocida };
  }

  const base = await tokenYIds();
  if (!base.ok) return base;
  const { token } = base.datos;
  const cabeceras = { headers: { Authorization: `Bearer ${token}` } };

  // P4 · el correo cambió: se renombra por id. Crear una segunda carpeta partiría en dos
  // los soportes de una misma persona.
  if (conocida !== null) {
    try {
      await http.patch(
        `${GRAPH}/drives/${driveId}/items/${conocida.id}`,
        { name: nombre },
        cabeceras,
      );
      return { ok: true, datos: { id: conocida.id, nombre } };
    } catch (e) {
      return { ok: false, fallo: fallo(e, `la carpeta «${conocida.nombre}»`) };
    }
  }

  try {
    const res = await http.post(
      `${GRAPH}/drives/${driveId}/items/${carpetaBaseId}/children`,
      { name: nombre, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
      cabeceras,
    );
    return { ok: true, datos: { id: res.data.id, nombre } };
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 409) {
      try {
        const res = await http.get(
          `${GRAPH}/drives/${driveId}/items/${carpetaBaseId}:/${rutaGraph(nombre)}:`,
          cabeceras,
        );
        return { ok: true, datos: { id: res.data.id, nombre } };
      } catch (e2) {
        return { ok: false, fallo: fallo(e2, `la carpeta «${nombre}»`) };
      }
    }
    return { ok: false, fallo: fallo(e, `la carpeta «${nombre}»`) };
  }
}

export async function subirSoporte(
  driveId: string,
  carpetaId: string,
  nombre: string,
  bytes: Buffer,
  mime: string,
): Promise<ResultadoGraph<{ id: string; webUrl: string }>> {
  const base = await tokenYIds();
  if (!base.ok) return base;
  const { token } = base.datos;
  const cabeceras = { headers: { Authorization: `Bearer ${token}` } };

  try {
    // P6 · `fail` y nunca `replace` ni `rename`: `replace` permitiría sobrescribir un acta
    // firmada, y `rename` llenaría la carpeta de «ACT-2026-0014 1.txt».
    const res = await http.put(
      `${GRAPH}/drives/${driveId}/items/${carpetaId}:/${rutaGraph(nombre)}:/content` +
        '?%40microsoft.graph.conflictBehavior=fail',
      bytes,
      { headers: { ...cabeceras.headers, 'Content-Type': mime } },
    );
    return { ok: true, datos: { id: res.data.id, webUrl: res.data.webUrl } };
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 409) {
      // Ya está publicado. El reintento del cron no puede tratar esto como fallo.
      try {
        const res = await http.get(
          `${GRAPH}/drives/${driveId}/items/${carpetaId}:/${rutaGraph(nombre)}:`,
          cabeceras,
        );
        return { ok: true, datos: { id: res.data.id, webUrl: res.data.webUrl } };
      } catch (e2) {
        return { ok: false, fallo: fallo(e2, `el archivo «${nombre}»`) };
      }
    }
    return { ok: false, fallo: fallo(e, `el archivo «${nombre}»`) };
  }
}
