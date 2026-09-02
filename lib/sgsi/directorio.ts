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
import { OBJECT_ID_GRUPO_SIG } from '@/lib/sgsi/permisos';

export interface PersonaDirectorio {
  nombre: string;
  correo: string;
}

/// Token de aplicación para Graph, o `null` si falta configuración o el tenant no contesta.
///
/// Estaba escrito tres veces palabra por palabra. Una credencial que se pide en tres
/// lugares es una credencial que mañana se arregla en dos.
async function tokenDeGraph(): Promise<string | null> {
  const tenant = process.env.SHAREPOINT_TENANT_ID;
  const cliente = process.env.SHAREPOINT_CLIENT_ID;
  const secreto = process.env.SHAREPOINT_CLIENT_SECRET;
  if (!tenant || !cliente || !secreto) return null;
  try {
    const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: cliente,
        client_secret: secreto,
        scope: 'https://graph.microsoft.com/.default',
      }),
    });
    if (!res.ok) return null;
    const cuerpo = (await res.json()) as { access_token?: string };
    return cuerpo.access_token ?? null;
  } catch {
    return null;
  }
}

async function desdeGraph(): Promise<PersonaDirectorio[] | null> {
  const acceso = await tokenDeGraph();
  if (!acceso) return null;
  try {
    const res = await fetch(
      'https://graph.microsoft.com/v1.0/users?$select=displayName,userPrincipalName&$top=199&$orderby=displayName',
      { headers: { Authorization: `Bearer ${acceso}` } },
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

export interface PersonaDirectorioCompleta {
  oid: string;
  nombre: string;
  correo: string;
}

/// Las personas del Directorio CON su object id, para sincronizar la tabla `persona`.
///
/// Devuelve `null` cuando Graph no está configurado o falla. A diferencia de
/// `leerDirectorio()`, acá no hay respaldo: el respaldo se arma con los autores de la
/// bitácora, que no traen object id y no son el censo de la organización. Sincronizar
/// contra una lista inventada es peor que no sincronizar.
export async function leerDirectorioCompleto(): Promise<PersonaDirectorioCompleta[] | null> {
  const acceso = await tokenDeGraph();
  if (!acceso) return null;
  try {
    // `accountEnabled` distingue a quien sigue en la organización de quien tiene la cuenta
    // bloqueada: una cuenta deshabilitada no debe recibir tareas.
    const res = await fetch(
      'https://graph.microsoft.com/v1.0/users' +
        '?$select=id,displayName,userPrincipalName,accountEnabled&$top=999&$orderby=displayName',
      { headers: { Authorization: `Bearer ${acceso}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      value?: {
        id?: string;
        displayName?: string;
        userPrincipalName?: string;
        accountEnabled?: boolean;
      }[];
    };
    return (data.value ?? [])
      .filter((u) => u.id && u.displayName && u.userPrincipalName && u.accountEnabled !== false)
      .map((u) => ({
        oid: u.id as string,
        nombre: u.displayName as string,
        correo: u.userPrincipalName as string,
      }));
  } catch {
    return null;
  }
}

/// Los object ids de quienes están en el grupo del SIG, para decir el rol de cada persona
/// del censo. Devuelve `null` cuando no se pudo saber.
///
/// Ese `null` es la respuesta honesta, no un error tragado. Hoy Graph contesta 403: la
/// aplicación tiene `User.Read.All` pero NO `GroupMember.Read.All`, y sin ese permiso la
/// pertenencia a un grupo no se puede leer. Devolver un conjunto vacío pintaría a las 34
/// personas como Colaborador —incluida la que sí administra el SIG— y sería una tabla de
/// permisos que miente sin que nadie se entere. La pantalla dice que no pudo consultarse.
///
/// Nada de esto se guarda. La aplicación no almacena roles: el Directorio manda, y lo que
/// se muestra se deriva al leer. Es la misma regla que sostiene `rolDesdeGrupos`.
export async function oidsDelGrupoSig(): Promise<Set<string> | null> {
  const acceso = await tokenDeGraph();
  if (!acceso) return null;
  try {
    // Sólo el id: el nombre y el correo ya los tiene la tabla `persona`, y pedir menos
    // campos es una llamada que no se degrada cuando el censo crece.
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${OBJECT_ID_GRUPO_SIG}/members` +
        '/microsoft.graph.user?$select=id&$top=999',
      { headers: { Authorization: `Bearer ${acceso}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { value?: { id?: string }[] };
    const oids = new Set<string>();
    for (const m of data.value ?? []) {
      if (m.id) oids.add(m.id.toLowerCase());
    }
    // Un grupo sin miembros es un dato posible pero no en este caso: el grupo existe
    // porque alguien administra el SIG. Vacío se trata como «no se pudo saber».
    return oids.size > 0 ? oids : null;
  } catch {
    return null;
  }
}
