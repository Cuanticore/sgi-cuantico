// app/lib/sharepoint.ts
import axios from 'axios';

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

async function getToken(): Promise<string> {
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

async function getSiteId(token: string): Promise<string> {
  const res = await http.get(
    `${GRAPH}/sites/${process.env.SHAREPOINT_SITE_URL}:/sites/${process.env.SHAREPOINT_SITE_NAME}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.id;
}

async function getDriveId(token: string, siteId: string): Promise<string> {
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
