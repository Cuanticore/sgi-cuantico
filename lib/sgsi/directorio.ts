import 'server-only';

// lib/sgsi/directorio.ts
//
// El Directorio Activo, para las menciones `@` en las notas de evidencia y para el censo
// de personas.
//
// En producción se lee de Microsoft Graph con el app credential de Azure AD (mismo
// tenant de la autenticación). En desarrollo, donde esas credenciales no existen, se
// cae a lo que la base SÍ conoce con certeza: los autores reales de la bitácora y de
// las evidencias — nunca se inventa una lista de personas.
//
// Cuando Graph no contesta, este módulo devuelve POR QUÉ. Antes devolvía `null` para las
// cinco causas posibles y la pantalla adivinaba; ver `graph-fallo.ts`.

import { prisma } from '@/lib/db';
import { OBJECT_ID_GRUPO_SIG } from '@/lib/sgsi/permisos';
import {
  clasificarRecurso,
  clasificarToken,
  variablesQueFaltan,
  type FalloGraph,
  type ResultadoGraph,
} from '@/lib/sgsi/graph-fallo';

export type { FalloGraph, ResultadoGraph };
export { explicarFallo } from '@/lib/sgsi/graph-fallo';

export interface PersonaDirectorio {
  nombre: string;
  correo: string;
}

/// Los permisos de aplicación que exige cada llamada. Se nombran en un solo lugar porque
/// son lo que alguien tiene que ir a conceder en Azure, y el mensaje de la pantalla los
/// cita textualmente.
const PERMISO_USUARIOS = 'User.Read.All';
const PERMISO_MIEMBROS = 'GroupMember.Read.All';

/// Token de aplicación para Graph.
///
/// Estaba escrito tres veces palabra por palabra. Una credencial que se pide en tres
/// lugares es una credencial que mañana se arregla en dos.
async function tokenDeGraph(): Promise<ResultadoGraph<string>> {
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
async function consultarGraph<T>(
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

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : 'error desconocido';
}

async function desdeGraph(): Promise<PersonaDirectorio[] | null> {
  const r = await consultarGraph<{ value?: { displayName?: string; userPrincipalName?: string }[] }>(
    'https://graph.microsoft.com/v1.0/users?$select=displayName,userPrincipalName&$top=199&$orderby=displayName',
    '/users',
    PERMISO_USUARIOS,
  );
  if (!r.ok) return null;
  const personas = (r.datos.value ?? [])
    .filter((u) => u.displayName && u.userPrincipalName)
    .map((u) => ({ nombre: u.displayName as string, correo: u.userPrincipalName as string }));
  return personas.length > 0 ? personas : null;
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

/// Para las menciones `@`. Acá el respaldo SÍ sirve: quien ya escribió en la bitácora es
/// alguien a quien tiene sentido mencionar, aunque la lista no sea el censo completo.
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
/// A diferencia de `leerDirectorio()`, acá no hay respaldo: el respaldo se arma con los
/// autores de la bitácora, que no traen object id y no son el censo de la organización.
/// Sincronizar contra una lista inventada es peor que no sincronizar.
export async function leerDirectorioCompleto(): Promise<ResultadoGraph<PersonaDirectorioCompleta[]>> {
  // `accountEnabled` distingue a quien sigue en la organización de quien tiene la cuenta
  // bloqueada: una cuenta deshabilitada no debe recibir tareas.
  const r = await consultarGraph<{
    value?: {
      id?: string;
      displayName?: string;
      userPrincipalName?: string;
      accountEnabled?: boolean;
    }[];
  }>(
    'https://graph.microsoft.com/v1.0/users' +
      '?$select=id,displayName,userPrincipalName,accountEnabled&$top=999&$orderby=displayName',
    '/users',
    PERMISO_USUARIOS,
  );
  if (!r.ok) return r;
  return {
    ok: true,
    datos: (r.datos.value ?? [])
      .filter((u) => u.id && u.displayName && u.userPrincipalName && u.accountEnabled !== false)
      .map((u) => ({
        oid: u.id as string,
        nombre: u.displayName as string,
        correo: u.userPrincipalName as string,
      })),
  };
}

/// Los object ids de quienes están en el grupo del SIG, para decir el rol de cada persona
/// del censo.
///
/// Cuando falla, la pantalla dice la causa REAL. Antes afirmaba siempre «falta
/// GroupMember.Read.All», que era cierto el día que se escribió y dejó de serlo apenas la
/// causa cambió: con el permiso ya concedido y el object id equivocado, seguía mandando a
/// conceder un permiso que ya estaba.
///
/// Nunca devuelve un conjunto vacío como si fuera un resultado. Vacío pintaría a todas las
/// personas como Colaborador —incluida la que administra el SIG— y sería una tabla de
/// permisos que miente sin que nadie se entere.
///
/// Nada de esto se guarda. La aplicación no almacena roles: el Directorio manda, y lo que
/// se muestra se deriva al leer. Es la misma regla que sostiene `rolDesdeGrupos`.
export async function oidsDelGrupoSig(): Promise<ResultadoGraph<Set<string>>> {
  // Sólo el id: el nombre y el correo ya los tiene la tabla `persona`, y pedir menos
  // campos es una llamada que no se degrada cuando el censo crece.
  const r = await consultarGraph<{ value?: { id?: string }[] }>(
    `https://graph.microsoft.com/v1.0/groups/${OBJECT_ID_GRUPO_SIG}/members` +
      '/microsoft.graph.user?$select=id&$top=999',
    `el grupo Líderes SIG (${OBJECT_ID_GRUPO_SIG})`,
    PERMISO_MIEMBROS,
  );
  if (!r.ok) return r;
  const oids = new Set<string>();
  for (const m of r.datos.value ?? []) {
    if (m.id) oids.add(m.id.toLowerCase());
  }
  // Un grupo sin miembros es un dato posible pero no en este caso: el grupo existe porque
  // alguien administra el SIG. Vacío se trata como «no se pudo saber», y se dice por qué.
  if (oids.size === 0) {
    return {
      ok: false,
      fallo: { causa: 'NO_EXISTE', recurso: `miembros del grupo Líderes SIG (${OBJECT_ID_GRUPO_SIG})` },
    };
  }
  return { ok: true, datos: oids };
}
