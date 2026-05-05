// app/lib/sharepoint.ts
import axios from 'axios';

const GRAPH = 'https://graph.microsoft.com/v1.0';

async function getToken(): Promise<string> {
  const res = await axios.post(
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
  const res = await axios.get(
    `${GRAPH}/sites/${process.env.SHAREPOINT_SITE_URL}:/sites/${process.env.SHAREPOINT_SITE_NAME}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.id;
}

async function getDriveId(token: string, siteId: string): Promise<string> {
  const res = await axios.get(
    `${GRAPH}/sites/${siteId}/drives`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const drives: { id: string; name: string }[] = res.data.value;
  // The default library is "Documents" (internal name), shown in UI as "Shared Documents"
  const drive = drives.find(d => d.name === 'Documents' || d.name === 'Shared Documents') ?? drives[0];
  return drive.id;
}

export async function fetchIndicatorsBuffer(): Promise<Buffer> {
  const token = await getToken();
  const siteId = await getSiteId(token);
  const driveId = await getDriveId(token, siteId);
  const filePath = `${process.env.SHAREPOINT_INDICATORS_PATH}/${process.env.SHAREPOINT_INDICATORS_FILE}`;

  const res = await axios.get(
    `${GRAPH}/sites/${siteId}/drives/${driveId}/root:/${encodeURIComponent(filePath).replace(/%2F/g, '/')}:/content`,
    { headers: { Authorization: `Bearer ${token}` }, responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}
