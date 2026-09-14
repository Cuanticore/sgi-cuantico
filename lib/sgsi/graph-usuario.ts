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
  return !esInvitadoB2B(u);
}

/// **¿Es una cuenta invitada?** La misma pregunta de arriba, aislada, porque hay un segundo
/// lugar que la necesita: el bloqueo (REQ-SIG-15 P21.3) tiene que negarse a deshabilitar la
/// cuenta de un aliado de Tiindux o de la UNAD, y ahí `esColaboradorDeLaOrganizacion` no
/// sirve como pregunta — devuelve `false` también para una cuenta propia ya deshabilitada,
/// que es justo la que el DESBLOQUEO tiene que poder tocar.
///
/// Se extrae en vez de copiarse: dos lugares que decidan por su cuenta qué es un invitado es
/// cómo se termina con uno mirando `userType` y el otro el `#ext#` del UPN — y ese segundo
/// deja de filtrar en silencio el día que Microsoft cambie el formato.
///
/// **Un `userType` ausente NO es un invitado.** Graph lo omite en varios escenarios, y ahí el
/// error caro se invierte respecto del censo: acá un falso positivo impediría bloquear a
/// alguien de la organización, y eso se ve; un falso negativo bloquearía a un tercero, y eso
/// le rompe la colaboración a otro sin que nadie de este lado se entere.
export function esInvitadoB2B(u: UsuarioDeGraph): boolean {
  return u.userType === 'Guest';
}
