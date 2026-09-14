import 'server-only';

// lib/sgsi/graph-bloqueo.ts
//
// **Las llamadas a Microsoft Graph que bloquean y desbloquean una cuenta** (REQ-SIG-15 §6):
// qué se pide, a qué URL y con qué permiso. Qué se puede pedir y qué se hace con la respuesta
// lo decide `bloqueo.ts`, que es puro.
//
// El token y la clasificación del fallo salen de `graph-consulta.ts`, igual que para el censo
// y para las licencias. Acá no se vuelve a pedir un token ni se vuelve a traducir un 403: ese
// código ya existía y copiarlo habría creado la tercera credencial que se arregla en dos.
//
// ── Los dos permisos, y por qué ÉSOS ──────────────────────────────────────────────────────
//
// `User.EnableDisableAccount.All` habilita escribir **sólo** `accountEnabled`.
// `User.ReadWrite.All` daría escritura sobre todos los atributos de todas las cuentas del
// tenant a un secreto que vive en un archivo de entorno: con él se cambia el correo de
// cualquiera, incluido el de un administrador. Es el mismo razonamiento que llevó a
// `Sites.Selected` en REQ-SIG-13, y un SGSI que se concede permisos excesivos a sí mismo es
// un hallazgo con razón.
//
// `User.RevokeSessions.All` es el permiso propio de `revokeSignInSessions`. No requiere el
// anterior ni viceversa, y sin él el bloqueo no bloquea.
//
// **Ninguno de los dos está concedido todavía**, y por eso `GRAPH_BLOQUEO_HABILITADO` arranca
// en `false` (P25). Lo que sí está concedido es la lectura del Directorio, que es la que usa
// `leerCuenta`.
//
// ── Por qué no hay una función que haga sólo el PATCH ─────────────────────────────────────
//
// Porque la habría. `aplicarEnGraph` recorre `PASOS_DE_RED[operacion]` y devuelve qué pasos
// quedaron hechos; la acción no elige pasos, elige operación. Exportar un `deshabilitarCuenta`
// suelto sería dejar a mano exactamente el atajo que P19 prohíbe — un bloqueo sin revocación
// de sesiones, que deja a la persona dentro hasta una hora.

import {
  NOMBRE_DEL_PASO,
  PASOS_DE_RED,
  type Operacion,
  type PasoDeGraph,
} from '@/lib/sgsi/bloqueo';
import { consultarGraph, escribirEnGraph } from '@/lib/sgsi/graph-consulta';
import type { FalloGraph, ResultadoGraph } from '@/lib/sgsi/graph-fallo';
import type { UsuarioDeGraph } from '@/lib/sgsi/graph-usuario';

/// La lectura va con el consentimiento que la registración YA tiene: es la misma que lee el
/// censo. Por eso comprobar que la cuenta no es una invitada no espera a que nadie conceda nada.
const PERMISO_LECTURA = 'User.Read.All';
const PERMISO_HABILITAR = 'User.EnableDisableAccount.All';
const PERMISO_REVOCAR = 'User.RevokeSessions.All';

function urlDeLaCuenta(oid: string): string {
  return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(oid)}`;
}

/// **La cuenta tal como el Directorio la ve ahora**, para decidir si se puede tocar.
///
/// Se piden los mismos campos que el censo, porque la pregunta es la misma que
/// `esColaboradorDeLaOrganizacion` responde al sincronizar: si `userType` dice `Guest`, esta
/// cuenta es de un aliado y la herramienta del SIG no la administra (P21.3).
export async function leerCuenta(oid: string): Promise<ResultadoGraph<UsuarioDeGraph>> {
  return consultarGraph<UsuarioDeGraph>(
    `${urlDeLaCuenta(oid)}?$select=id,displayName,userPrincipalName,accountEnabled,userType`,
    `la cuenta ${oid} (/users/${oid})`,
    PERMISO_LECTURA,
  );
}

/// Lo que la red dejó hecho, y dónde se cortó si se cortó.
export interface RedDelBloqueo {
  /// Los pasos que quedaron HECHOS, en el orden en que se hicieron. Es lo que
  /// `laRedQuedoCompleta` mira antes de abrir la transacción.
  hechos: PasoDeGraph[];
  /// El fallo del primer paso que no se pudo hacer, o `null` si se hicieron todos.
  fallo: FalloGraph | null;
  /// En qué paso se cortó.
  pasoFallido: PasoDeGraph | null;
}

/// **Los pasos de red de la operación, en orden y sin saltearse ninguno.**
///
/// Se corta en el primer fallo: si la cuenta no se pudo deshabilitar, revocarle las sesiones
/// no arregla nada y sí cerraría la sesión de alguien que sigue trabajando con normalidad.
///
/// **Fuera de toda transacción de Prisma** (P10 de REQ-SIG-13). Quien llama escribe la base
/// DESPUÉS, y sólo si esto devolvió los pasos completos.
export async function aplicarEnGraph(
  operacion: Operacion,
  oid: string,
): Promise<RedDelBloqueo> {
  const red: RedDelBloqueo = { hechos: [], fallo: null, pasoFallido: null };
  for (const paso of PASOS_DE_RED[operacion]) {
    const r = await ejecutarPaso(paso, oid);
    if (!r.ok) {
      red.fallo = r.fallo;
      red.pasoFallido = paso;
      return red;
    }
    red.hechos.push(paso);
  }
  return red;
}

function ejecutarPaso(paso: PasoDeGraph, oid: string): Promise<ResultadoGraph<null>> {
  const recurso = `${NOMBRE_DEL_PASO[paso]} de ${oid}`;
  switch (paso) {
    case 'DESHABILITAR':
      return escribirEnGraph(
        urlDeLaCuenta(oid),
        'PATCH',
        { accountEnabled: false },
        recurso,
        PERMISO_HABILITAR,
      );
    case 'HABILITAR':
      return escribirEnGraph(
        urlDeLaCuenta(oid),
        'PATCH',
        { accountEnabled: true },
        recurso,
        PERMISO_HABILITAR,
      );
    case 'REVOCAR_SESIONES':
      // Sin cuerpo: es una acción, no un recurso que se edita. Graph contesta
      // `{ "value": true }` y el código de estado ya dice todo lo que hay que saber.
      return escribirEnGraph(
        `${urlDeLaCuenta(oid)}/revokeSignInSessions`,
        'POST',
        null,
        recurso,
        PERMISO_REVOCAR,
      );
  }
}
