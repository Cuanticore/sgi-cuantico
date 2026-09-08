// lib/sgsi/graph-usuario.ts
//
// Quién del tenant es COLABORADOR de la organización, que no es lo mismo que quién tiene
// cuenta.
//
// Vive aparte de `directorio.ts` por la misma razón que `graph-fallo.ts`: es una regla
// pura, y una regla que sólo se puede comprobar levantando Prisma y saliendo a la red
// termina sin comprobarse.

export interface UsuarioDeGraph {
  id?: string;
  displayName?: string;
  userPrincipalName?: string;
  accountEnabled?: boolean;
  userType?: string;
}

/// `/users` devuelve el tenant COMPLETO, y en un tenant con clientes y aliados eso incluye
/// invitados B2B: 54 de 90 en la primera sincronización real —Tiindux, UNAD, Unimilitar,
/// Webxcite—. Un invitado no firma el acuerdo de confidencialidad, no recibe la inducción
/// de seguridad y no tiene obligaciones del SIG. Contarlo como colaborador no es un rótulo
/// de más: le crea tareas, lo mete en el censo, le manda el correo semanal e infla el
/// denominador de todos los indicadores de cumplimiento.
///
/// Se decide por `userType`, que es el campo que Graph define para esto, y NO por el
/// `#ext#` del `userPrincipalName`: esa cadena es una convención de formato del UPN de
/// invitado, no un contrato, y el día que Microsoft la cambie el filtro dejaría de filtrar
/// en silencio.
///
/// `accountEnabled` sigue distinguiendo a quien continúa de quien tiene la cuenta
/// bloqueada: una cuenta deshabilitada no debe recibir tareas.
///
/// **Los ausentes se aceptan.** Un `userType` o un `accountEnabled` que no vino no es un
/// «no»: Graph los omite en varios escenarios, y excluir por un campo faltante dejaría a
/// una persona real fuera del SIG sin que nadie lo note. El error caro acá es el falso
/// negativo —un colaborador sin obligaciones—, no el falso positivo, que se ve en el censo.
export function esColaboradorDeLaOrganizacion(u: UsuarioDeGraph): boolean {
  if (!u.id || !u.displayName || !u.userPrincipalName) return false;
  if (u.accountEnabled === false) return false;
  return u.userType !== 'Guest';
}
