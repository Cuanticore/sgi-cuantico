import 'server-only';

// lib/sgsi/directorio.ts
//
// El Directorio Activo, para las menciones `@` en las notas de evidencia.
//
// En producción se lee de Microsoft Graph con el app credential de Azure AD (mismo
// tenant de la autenticación). En desarrollo, donde esas credenciales no existen, se
// cae a lo que la base SÍ conoce con certeza: los autores reales de la bitácora y de
// las evidencias — nunca se inventa una lista de personas.

import { prisma } from '@/lib/db';

export interface PersonaDirectorio {
  nombre: string;
  correo: string;
}

async function desdeGraph(): Promise<PersonaDirectorio[] | null> {
  const tenant = process.env.SHAREPOINT_TENANT_ID;
  const cliente = process.env.SHAREPOINT_CLIENT_ID;
  const secreto = process.env.SHAREPOINT_CLIENT_SECRET;
  if (!tenant || !cliente || !secreto) return null;
  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: cliente,
        client_secret: secreto,
        scope: 'https://graph.microsoft.com/.default',
      }),
    });
    if (!tokenRes.ok) return null;
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) return null;
    const res = await fetch(
      'https://graph.microsoft.com/v1.0/users?$select=displayName,userPrincipalName&$top=199&$orderby=displayName',
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      value?: { displayName?: string; userPrincipalName?: string }[];
    };
    const personas = (data.value ?? [])
      .filter((u) => u.displayName && u.userPrincipalName)
      .map((u) => ({ nombre: u.displayName as string, correo: u.userPrincipalName as string }));
    return personas.length > 0 ? personas : null;
  } catch {
    return null;
  }
}

async function desdeUsoReal(): Promise<PersonaDirectorio[]> {
  const filas = await prisma.$queryRaw<
    { usuario: string }[]
  >`SELECT DISTINCT usuario FROM (
      SELECT usuario FROM bitacora WHERE usuario LIKE '%@%'
      UNION
      SELECT creada_por FROM evidencia WHERE creada_por LIKE '%@%' AND creada_por IS NOT NULL
    ) t WHERE usuario IS NOT NULL AND usuario <> '' ORDER BY usuario`;
  return filas
    .map((f) => {
      const [local] = f.usuario.split('@');
      return { nombre: local.replace(/[._]/g, ' '), correo: f.usuario };
    })
    .filter((p) => {
      const dominio = p.correo.split('@')[1];
      return Boolean(dominio && dominio.includes('.'));
    });
}

export async function leerDirectorio(): Promise<PersonaDirectorio[]> {
  const delGraph = await desdeGraph();
  if (delGraph) return delGraph;
  return desdeUsoReal();
}
