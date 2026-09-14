// lib/sgsi/bloqueo.ts
//
// **Qué se decide antes de dejar a una persona sin poder trabajar** (REQ-SIG-15 §6, P19 a P25).
//
// Bloquear una cuenta es la acción más destructiva que la aplicación tiene. Todo lo que se
// decide acá es puro: no toca la red, no toca Prisma y no lee `process.env` por su cuenta. Es
// la misma razón que llevó a `graph-fallo.ts` y a `graph-usuario.ts` a existir aparte — una
// regla que sólo se puede comprobar levantando Postgres y saliendo a Microsoft Graph termina
// sin comprobarse, y ésta es precisamente la que no puede salir mal.
//
// La acción (`app/sig/acciones/personas-bloqueo.ts`) ejecuta lo que este módulo decide y no
// vuelve a decidir nada.
//
// ── Las cuatro reglas que sostienen el módulo ────────────────────────────────────────────
//
// **P19 · el bloqueo son DOS llamadas a Graph y ninguna es opcional.** Deshabilitar la cuenta
// y revocar las sesiones. El token de acceso que la persona ya tiene sigue siendo válido
// hasta una hora después de deshabilitar: un bloqueo por incidente de seguridad que deja a
// alguien dentro una hora más no contiene nada. Por eso los pasos viven en `PASOS_DE_RED`,
// la acción los recorre y `laRedQuedoCompleta` es lo que habilita la escritura en la base:
// saltarse el segundo paso exigiría editar esta constante, y la prueba la mira.
//
// **P21 · las tres negativas se deciden acá y no en la pantalla.** Una validación que sólo
// vive en el popup se salta llamando a la acción directamente, que es la misma razón por la
// que `lib/sig/grupos.ts` rechaza el grupo derivado en el servidor.
//
// **La red y la base son dos cosas distintas y el resultado lo dice.** Ninguna llamada a
// Graph va dentro de una transacción de Prisma (P10 de REQ-SIG-13). La consecuencia es que
// existe un estado real —Azure bloqueó, la base no registró— y callarlo dejaría a alguien
// mirando una pantalla que dice «activa» sobre una persona que ya no puede entrar.
// `fraseDeDesincronizacion` es esa frase, y existe acá para que sea la misma siempre.
//
// **P25 · sin la variable, no hay botón.** Los dos permisos de Azure que el bloqueo necesita
// —`User.EnableDisableAccount.All` y `User.RevokeSessions.All`— no están concedidos todavía.
// Un botón que existe y responde 403 se lee como que la aplicación está rota, y alguien va a
// probarlo tres veces con tres personas distintas antes de concluirlo.

import { esInvitadoB2B, type UsuarioDeGraph } from '@/lib/sgsi/graph-usuario';

/// **P19.1 · el motivo, y con piso.** Va a `Bitacora.motivo` y es lo único que responde por
/// qué esta persona no puede trabajar. Un bloqueo sin motivo es indefendible ante el afectado
/// y ante un auditor; uno con «ok» de motivo es lo mismo con un trámite cumplido encima.
export const MOTIVO_MINIMO = 10;

/// La variable que habilita la operación entera (§10). **Arranca en `false`.**
export const VARIABLE_DE_BLOQUEO = 'GRAPH_BLOQUEO_HABILITADO';

export type Operacion = 'BLOQUEO' | 'DESBLOQUEO';

export type PasoDeGraph = 'DESHABILITAR' | 'REVOCAR_SESIONES' | 'HABILITAR';

/// **Los pasos de red de cada operación, en orden, y en un solo lugar.**
///
/// La acción recorre esta lista y `laRedQuedoCompleta` la vuelve a mirar antes de escribir en
/// la base: no hay ninguna función exportada que haga sólo el `PATCH`. Es lo que impide que
/// `revokeSignInSessions` quede afuera por un `if` mal puesto o por un reintento a medias.
export const PASOS_DE_RED: Readonly<Record<Operacion, readonly PasoDeGraph[]>> = {
  BLOQUEO: ['DESHABILITAR', 'REVOCAR_SESIONES'],
  DESBLOQUEO: ['HABILITAR'],
};

/// Cómo se nombra cada paso cuando hay que decir cuál quedó hecho y cuál no. Con el verbo y
/// con la llamada: quien lee esto después de un fallo necesita saber qué reintentar.
export const NOMBRE_DEL_PASO: Readonly<Record<PasoDeGraph, string>> = {
  DESHABILITAR: 'deshabilitar la cuenta (PATCH /users/{oid} con accountEnabled: false)',
  REVOCAR_SESIONES: 'revocar las sesiones abiertas (POST /users/{oid}/revokeSignInSessions)',
  HABILITAR: 'habilitar la cuenta (PATCH /users/{oid} con accountEnabled: true)',
};

/// ¿Quedaron hechos TODOS los pasos de red? Es la puerta de la transacción.
///
/// Se pregunta por la lista completa y no por «el último paso respondió bien»: un reintento
/// que sólo repita el segundo paso, o un camino nuevo que llame al primero y se olvide del
/// segundo, seguirían pasando esa otra pregunta.
export function laRedQuedoCompleta(
  operacion: Operacion,
  hechos: readonly PasoDeGraph[],
): boolean {
  return PASOS_DE_RED[operacion].every((paso) => hechos.includes(paso));
}

/// Los pasos que faltaron, para poder nombrarlos en el mensaje.
export function pasosQueFaltan(
  operacion: Operacion,
  hechos: readonly PasoDeGraph[],
): PasoDeGraph[] {
  return PASOS_DE_RED[operacion].filter((paso) => !hechos.includes(paso));
}

/// **P25 · ¿está habilitada la operación en este entorno?**
///
/// Cadena vacía, ausente o cualquier otra cosa cuentan como `false`: la variable habilita
/// escribir sobre cuentas del Directorio, y ahí lo único aceptable es el `'true'` exacto y
/// deliberado. Recibe el entorno como parámetro —y no lee `process.env` adentro— para que la
/// regla se pueda probar sin ensuciar el entorno del proceso de pruebas.
export function bloqueoHabilitado(entorno: Record<string, string | undefined>): boolean {
  return entorno[VARIABLE_DE_BLOQUEO]?.trim() === 'true';
}

/// Lo que hace falta saber de la persona, desde el censo.
export interface PersonaDelCenso {
  /// El object id del Directorio, que es con lo que se le habla a Graph.
  oid: string;
  /// La llave con la que la aplicación identifica a una persona, y lo que se teclea para
  /// confirmar (P20).
  correo: string;
  activa: boolean;
}

export interface ContextoDeLaDecision {
  /// Quien ejecuta, como lo identifica la sesión: el correo. No hay object id en el token —
  /// `app/lib/auth.ts` sólo proyecta nombre, correo y grupos—, así que la propia cuenta se
  /// reconoce por el correo, que es además la llave del censo.
  autor: string;
  /// La cuenta tal como la ve el Directorio AHORA. `null` cuando no se pudo leer: no saber a
  /// quién se está por bloquear no es lo mismo que saber que se puede.
  cuenta: UsuarioDeGraph | null;
  /// Los object ids del grupo del SIG (`oidsDelGrupoSig`), o `null` cuando Graph no pudo
  /// contestar. Ese `null` NO se traduce a «no es responsable», por lo mismo que
  /// `rolDeLaPersona` devuelve `DESCONOCIDO` en vez de `COLABORADOR`.
  miembrosDelGrupoSig: ReadonlySet<string> | null;
}

export type Decision = { ok: true } | { ok: false; mensaje: string };

const SI: Decision = { ok: true };

const no = (mensaje: string): Decision => ({ ok: false, mensaje });

/// **P20 · la confirmación escribiendo el correo, comprobada también en el servidor.**
///
/// El popup pide teclear el correo exacto para habilitar el botón, y eso protege a quien usa
/// el popup. La acción es invocable directamente con el id puesto, así que la comprobación se
/// repite acá: es la misma razón por la que `planificarGrupos` rechaza el grupo derivado en el
/// servidor aunque la casilla esté deshabilitada.
///
/// Se pliega la caja y se recortan los espacios: un correo del Directorio no distingue
/// mayúsculas, y hacer fallar la confirmación por una mayúscula empuja a copiar y pegar, que
/// es exactamente la ceremonia que este paso viene a evitar.
export function confirmacionCoincide(correo: string, escrito: string): boolean {
  return escrito.trim().toLowerCase() === correo.trim().toLowerCase();
}

export function motivoValido(motivo: string): boolean {
  return motivo.trim().length >= MOTIVO_MINIMO;
}

const FRASE_MOTIVO =
  `El motivo es obligatorio y tiene que decir algo: al menos ${MOTIVO_MINIMO} caracteres. ` +
  'Queda en la bitácora y es lo único que responde por qué esta persona no puede trabajar.';

/// **P21 · las tres cuentas que la aplicación se niega a bloquear, más las dos que no puede
/// evaluar.**
///
/// El orden no es casual: primero lo que es imposible por lo que la cuenta ES —y que no se
/// arregla escribiendo mejor el formulario—, y recién al final el motivo y la confirmación,
/// que sí se arreglan tecleando. Al revés, quien intenta autobloquearse leería «el motivo es
/// muy corto», lo corregiría, y recién entonces se enteraría de que nunca iba a poder.
export function decidirBloqueo(
  persona: PersonaDelCenso,
  contexto: ContextoDeLaDecision,
  motivo: string,
  correoEscrito: string,
): Decision {
  // 1 · la propia cuenta. Quien administra no se puede autobloquear: perdería el acceso con
  // el que arreglarlo, y el arreglo pasaría a vivir en Azure, con alguien que quizá no esté
  // disponible el viernes a las 7 de la tarde.
  if (confirmacionCoincide(persona.correo, contexto.autor)) {
    return no(
      'No se puede bloquear la propia cuenta: perderías el acceso con el que arreglarlo. ' +
        'Si hay que bloquearla, la bloquea otra persona con el permiso.',
    );
  }

  // 2 · una persona ya inactiva. No hay nada que bloquear: o ya salió del Directorio, o es
  // una cuenta invitada —que el censo nunca da por activa, porque
  // `esColaboradorDeLaOrganizacion` las filtra por `userType`—.
  if (!persona.activa) {
    return no(
      `${persona.correo} ya figura como inactiva en el censo: no hay nada que bloquear. ` +
        'Si la cuenta sigue habilitada en Azure, lo que hay que hacer es sincronizar y mirar ' +
        'por qué el censo y el Directorio no dicen lo mismo.',
    );
  }

  const porLaCuenta = revisarLaCuentaDelDirectorio(persona, contexto.cuenta, 'BLOQUEO');
  if (!porLaCuenta.ok) return porLaCuenta;

  // 3 · la última cuenta con rol RESPONSABLE. Un SIG sin ningún administrador se arregla en
  // Azure, por alguien que quizá no esté disponible.
  const porElGrupo = revisarElGrupoDelSig(persona, contexto.miembrosDelGrupoSig);
  if (!porElGrupo.ok) return porElGrupo;

  if (!motivoValido(motivo)) return no(FRASE_MOTIVO);
  if (!confirmacionCoincide(persona.correo, correoEscrito)) {
    return no(
      `Para bloquear hay que escribir el correo exacto de la persona (${persona.correo}). ` +
        'No es una traba: es lo que evita bloquear a quien estaba una fila más abajo.',
    );
  }

  return SI;
}

/// **P24 · desbloquear existe y va por el mismo camino**, con el mismo permiso y el mismo
/// motivo obligatorio. Sin desbloqueo, el clic equivocado no tiene remedio dentro de la
/// aplicación y hay que salir a buscar a quien administre Azure.
///
/// Las dos negativas de P21 que no aplican son las que no tienen sentido al revés: nadie se
/// desbloquea a sí mismo —para llegar acá hay que poder entrar— y habilitar una cuenta nunca
/// deja el grupo del SIG en cero.
export function decidirDesbloqueo(
  persona: PersonaDelCenso,
  contexto: ContextoDeLaDecision,
  motivo: string,
  correoEscrito: string,
): Decision {
  if (persona.activa) {
    return no(`${persona.correo} ya figura como activa en el censo: no hay nada que desbloquear.`);
  }

  const porLaCuenta = revisarLaCuentaDelDirectorio(persona, contexto.cuenta, 'DESBLOQUEO');
  if (!porLaCuenta.ok) return porLaCuenta;

  if (!motivoValido(motivo)) return no(FRASE_MOTIVO);
  if (!confirmacionCoincide(persona.correo, correoEscrito)) {
    return no(
      `Para desbloquear hay que escribir el correo exacto de la persona (${persona.correo}).`,
    );
  }

  return SI;
}

/// Lo que las dos operaciones preguntan del Directorio.
///
/// La cuenta invitada se rechaza en las DOS: bloquear la de un aliado de Tiindux o de la UNAD
/// sería salirse del alcance de la organización y romperle la colaboración a otro, y
/// habilitarla sería exactamente lo mismo con el signo cambiado.
function revisarLaCuentaDelDirectorio(
  persona: PersonaDelCenso,
  cuenta: UsuarioDeGraph | null,
  operacion: Operacion,
): Decision {
  const verbo = operacion === 'BLOQUEO' ? 'bloquear' : 'desbloquear';
  if (cuenta === null) {
    // Se falla cerrado, y no cuesta nada: los pasos que vienen después también son Graph, así
    // que una consulta que no responde es una operación que tampoco iba a completarse. Lo que
    // sí cuesta es lo contrario — seguir sin saber a quién se está por tocar.
    return no(
      `No se pudo leer la cuenta de ${persona.correo} en el Directorio, así que no se puede ` +
        `${verbo} nada: no hay forma de comprobar que es una cuenta de la organización y no ` +
        'una invitada. No se cambió nada.',
    );
  }
  if (esInvitadoB2B(cuenta)) {
    return no(
      `${persona.correo} es una cuenta INVITADA del tenant (userType «Guest»), no una cuenta ` +
        `de la organización. ${verbo === 'bloquear' ? 'Bloquearla' : 'Habilitarla'} desde la ` +
        'herramienta del SIG sería salirse del alcance de la organización y tocarle la ' +
        'colaboración a otro. Se administra donde corresponde, en el tenant.',
    );
  }
  return SI;
}

function revisarElGrupoDelSig(
  persona: PersonaDelCenso,
  miembros: ReadonlySet<string> | null,
): Decision {
  if (miembros === null) {
    return no(
      'No se pudo consultar el grupo Líderes SIG, así que no se puede saber si ésta es la ' +
        'última cuenta con rol RESPONSABLE. No se bloquea: dejar el SIG sin ningún ' +
        'administrador se arregla en Azure, y no es un riesgo que valga la pena correr a ciegas.',
    );
  }
  // Los object ids se comparan plegados: Azure no es consistente con la caja que emite, y
  // `oidsDelGrupoSig` ya guarda los suyos en minúscula.
  if (!miembros.has(persona.oid.trim().toLowerCase())) return SI;
  if (miembros.size > 1) return SI;
  return no(
    `${persona.correo} es la última cuenta con rol RESPONSABLE del SIG: bloquearla dejaría ` +
      'el grupo en cero. Un SIG sin ningún administrador se arregla en Azure, por alguien ' +
      'que quizá no esté disponible el viernes a las 7 p. m. Primero hay que sumar a otra ' +
      'persona al grupo Líderes SIG.',
  );
}

/// **Lo que quedó hecho en Azure cuando la red se cortó a la mitad.**
///
/// El caso que importa es el del bloqueo con el primer paso hecho y el segundo no: la cuenta
/// quedó deshabilitada y la persona sigue dentro con el token que ya tenía. Decirlo con esas
/// palabras es lo que distingue «no se pudo bloquear» de «se bloqueó a medias», y son dos
/// situaciones que exigen cosas distintas de quien está mirando la pantalla.
export function fraseDeRedIncompleta(
  operacion: Operacion,
  hechos: readonly PasoDeGraph[],
): string {
  if (hechos.length === 0) {
    return operacion === 'BLOQUEO'
      ? 'No se cambió nada: ni la cuenta del Directorio ni el censo. La persona sigue pudiendo trabajar.'
      : 'No se cambió nada: ni la cuenta del Directorio ni el censo. La persona sigue sin poder entrar.';
  }
  const pendientes = pasosQueFaltan(operacion, hechos);
  const faltan = pendientes.map((p) => NOMBRE_DEL_PASO[p]).join('; ');
  const hechas = hechos.map((p) => NOMBRE_DEL_PASO[p]).join('; ');
  // El aviso del token sólo aparece cuando es cierto: es el que convierte «falló algo» en
  // «la persona sigue adentro», y repetirlo donde no aplica lo volvería ruido.
  const porLasSesiones = pendientes.includes('REVOCAR_SESIONES')
    ? 'Mientras las sesiones no se revoquen, el token que la persona ya tiene sigue siendo ' +
      'válido hasta una hora: puede seguir trabajando aunque la cuenta figure deshabilitada. '
    : '';
  return (
    `La operación quedó A MEDIAS en el Directorio. Se hizo: ${hechas}. No se pudo: ${faltan}. ` +
    `${porLasSesiones}No se escribió nada en el censo. Hay que reintentar la operación completa.`
  );
}

/// **Graph respondió bien y la transacción falló después.**
///
/// El estado existe porque ninguna llamada a Graph puede ir dentro de una transacción de
/// Prisma. No se puede deshacer —revertir el bloqueo automáticamente sería volver a habilitar
/// una cuenta que alguien acaba de decidir bloquear, quizá por un incidente en curso— así que
/// lo único honesto es decirlo entero: qué es cierto en Azure, qué va a seguir mostrando la
/// pantalla, y que la bitácora se quedó sin el motivo.
export function fraseDeDesincronizacion(operacion: Operacion, correo: string): string {
  if (operacion === 'BLOQUEO') {
    return (
      `La cuenta de ${correo} QUEDÓ BLOQUEADA en el Directorio y sus sesiones fueron ` +
      'revocadas: la persona ya no puede entrar. Lo que falló fue el registro en la base, ' +
      'así que el censo va a seguir mostrándola como activa y la bitácora se quedó SIN el ' +
      'motivo. Hay que reintentar —los dos pasos en Azure se pueden repetir sin efecto ' +
      'adicional— o corregir el estado a mano. La sincronización de las 05:00 también la va ' +
      'a inactivar, pero sin motivo y doce horas tarde.'
    );
  }
  return (
    `La cuenta de ${correo} QUEDÓ HABILITADA en el Directorio: la persona ya puede entrar. ` +
    'Lo que falló fue el registro en la base, así que el censo va a seguir mostrándola como ' +
    'inactiva y la bitácora se quedó SIN el motivo. Hay que reintentar o corregir el estado ' +
    'a mano.'
  );
}
