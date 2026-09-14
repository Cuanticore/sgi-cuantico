// lib/sig/firma-por-enlace.ts
//
// **REQ-SIG-19 · Task 8 · qué decide la firma por enlace, antes de escribir nada.**
//
// `lib/sig/enlace-firma.ts` decide el estado de un enlace y si un documento coincide.
// Acá se decide **el acto de firmar**: en qué orden se abren las puertas, cuál de ellas rechaza,
// cuándo se cuenta un intento fallido y cuándo el enlace queda bloqueado. Es la regla completa de
// la vía sin sesión, y por eso vive separada de la acción: una regla que sólo se puede comprobar
// levantando Postgres y SMTP termina sin comprobarse, y ésta gobierna quién puede firmar en
// nombre de quién.
//
// La acción `app/sig/acciones/enlace-firma.ts` ejecuta lo que este módulo decide y no vuelve a
// decidir nada.
//
// ── Las cuatro reglas que sostienen el módulo ────────────────────────────────────────────────
//
// **P14 · el bloqueo se evalúa ANTES que el documento, y por eso el sexto intento ni se
// evalúa.** Al quinto fallo el enlace queda con `bloqueadoEn`, y desde ese instante
// `estadoDelEnlace` lo devuelve `BLOQUEADO`: la comparación del documento queda detrás de esa
// puerta y no llega a ejecutarse. Si el orden fuera el inverso —comparar y después mirar el
// bloqueo— el tope contaría intentos pero no impediría ninguno, que es exactamente el defecto
// que un tope existe para cerrar. El orden es la regla, así que se prueba con un comparador
// espía: que el resultado sea el correcto no demuestra que no se haya comparado.
//
// **P13 · de cara a quien abrió el enlace no hay un quinto estado.** Las salidas públicas son las
// mismas tres que ya existen en `lib/sig/vista-enlace-publico.ts`: «no está disponible», «ya está
// firmado» y firmar. Una asignación que se cerró por la vía corporativa **no** inventa una cuarta
// frase: es un documento que ya está firmado, y así se dice, con la misma constante que el enlace
// ya usado. Lo que las separa es interno —`motivo`— y lo usa la acción para revocar el enlace,
// no la pantalla para decir algo distinto.
//
// **El intento fallido se decide acá, pero se anota allá.** Esta función dice «este documento no
// coincide y el contador quedaría en cuatro»; la acción es la que escribe. Esa separación es la
// que le permite a la acción no anotar nada cuando además el formulario venía incompleto —sin
// nombre, sin marcar la aceptación—: un formulario a medias no es un intento de suplantación, y
// gastarle uno de los cinco a quien se equivocó tecleando lo deja sin enlace por un error que no
// era ése. Los cinco se reservan para documentos efectivamente probados.
//
// **P3 · el token no se nombra.** Este módulo no lo recibe, así que no puede filtrarlo por
// descuido: recibe el estado del enlace y su código, que es lo que se nombra en la bitácora, en
// el acta y en un ticket de soporte.

import {
  FRASE_ENLACE_NO_DISPONIBLE,
  documentoCoincide,
  estadoDelEnlace,
  quedaBloqueado,
  type EnlaceParaEvaluar,
} from '@/lib/sig/enlace-firma';

/// **P16 · el autor de la bitácora de una firma sin sesión.**
///
/// `enlace:ENL-2026-0007 · nombre@gmail.com`. Nunca el correo corporativo: ése afirmaría una
/// sesión que no existió, que es el defecto entero que esta vía viene a evitar. El prefijo
/// `enlace:` está para que la cadena no se confunda jamás con un correo de sesión, ni leyéndola
/// ni filtrando la bitácora por autor.
///
/// **Lleva el código y no el token** (P3). Un token en la bitácora es un token en manos de todo
/// el que puede leer la bitácora, que es justamente el grupo que audita las firmas.
export function autorDeBitacoraPorEnlace(codigo: string, correoDestino: string): string {
  return `enlace:${codigo} · ${correoDestino}`;
}

/// **La frase para quien vuelve sobre un documento que ya está firmado.**
///
/// Es la excepción que P13 ya admite —la de `USADO`— y no una quinta salida: a esa altura la
/// firma ocurrió y no queda nada que proteger. La comparten el enlace ya usado y la asignación
/// cerrada por la vía corporativa, porque para quien abrió el enlace son el mismo hecho: no hay
/// nada pendiente.
export const FRASE_YA_FIRMADO =
  'Este documento ya está firmado, así que no queda nada pendiente. Si necesita el acta, ' +
  'escriba a quien le envió la solicitud.';

/// **La frase de un documento de identidad que no coincide.**
///
/// **No dice cuántos intentos quedan y no dice que el enlace haya quedado bloqueado.** Decirle
/// «le quedan tres» a quien está probando documentos le dice cuánto puede seguir probando, y
/// anunciar el bloqueo en el quinto le confirma dónde está el tope. Quien se equivocó tecleando
/// vuelve a abrir el enlace y la página ya le dice qué hacer: escribirle a quien se lo envió.
export const FRASE_DOCUMENTO_NO_COINCIDE =
  'El número de documento de identidad no coincide con el registrado en su ficha. Verifíquelo y ' +
  'vuelva a intentarlo.';

/// Lo que hace falta saber para decidir. Son datos ya leídos de la base, no la fila de Prisma:
/// este módulo se prueba sin base, y la traducción se hace en la acción, que es donde se lee.
export interface EntradaDeFirmaPorEnlace {
  /// Los cuatro campos de estado del enlace, o `null` si el token no corresponde a ninguno.
  enlace: EnlaceParaEvaluar | null;
  /// `EnlaceFirma.enviadoEn`. Nulo es un enlace que nunca se entregó: quien tiene el token no lo
  /// recibió por el canal que el acta va a declarar, y el acta no puede decir «enviado a … el …»
  /// sobre un envío que no ocurrió.
  enviadoEn: Date | null;
  /// La asignación ya tiene su registro de realizado: se firmó por la vía corporativa antes de
  /// que este enlace se usara.
  asignacionCerrada: boolean;
  /// Lo que la persona tecleó. Ya pasó por `validarFirma`, así que no está vacío.
  documentoTecleado: string;
  /// `Persona.documentoIdentidad`.
  documentoGuardado: string | null;
  /// `EnlaceFirma.intentosFallidos`, **antes** de este intento.
  intentosFallidos: number;
}

/// Por qué se rechazó. **Es interno**: la pantalla usa `mensaje`, que sólo tiene dos valores
/// posibles. `motivo` existe para que la acción sepa si además tiene que revocar el enlace.
export type MotivoDeRechazo = 'NO_DISPONIBLE' | 'ENLACE_USADO' | 'ASIGNACION_CERRADA';

export type DecisionDeFirmaPorEnlace =
  | { clase: 'RECHAZO'; motivo: MotivoDeRechazo; mensaje: string }
  /// El documento no coincidió. `intentosFallidos` es el contador **ya incrementado**, que es lo
  /// que hay que guardar, y `bloquear` dice si con ese número el enlace se cierra (P14).
  | { clase: 'INTENTO_FALLIDO'; intentosFallidos: number; bloquear: boolean; mensaje: string }
  | { clase: 'FIRMAR' };

/// Cómo se compara el documento. Es un parámetro con valor por defecto y no una llamada directa
/// **para que el orden de las puertas se pueda demostrar**: la prueba del sexto intento pasa un
/// espía y comprueba que no se llamó. Que el resultado sea `RECHAZO` no probaría nada —también lo
/// sería comparando primero y descartando después—, y lo que P14 exige es que no se compare.
export type ComparadorDeDocumento = (tecleado: string, guardado: string | null) => boolean;

/// **Si se firma, y si no, por qué.** En este orden, que no es cosmético.
///
/// 1. El enlace **existe y está vigente**. `estadoDelEnlace` ya pone `USADO` primero (D-5) y
///    `BLOQUEADO` antes que `EXPIRADO`, así que el enlace agotado muere acá: **el sexto intento
///    no llega a comparar ningún documento** (P14).
/// 2. El enlace **se entregó**. Sin `enviadoEn` el acta no podría declarar su canal.
/// 3. La asignación **sigue abierta**. Si se cerró por la vía corporativa no se firma dos veces:
///    un segundo acta sobre la misma asignación diría que la persona aceptó dos veces lo mismo,
///    y el registro de realizado ya existe.
/// 4. El documento **coincide** (D-7, P5). Recién acá se compara, y recién acá se cuenta.
export function decidirFirmaPorEnlace(
  e: EntradaDeFirmaPorEnlace,
  ahora: Date,
  comparar: ComparadorDeDocumento = documentoCoincide,
): DecisionDeFirmaPorEnlace {
  const noDisponible = {
    clase: 'RECHAZO',
    motivo: 'NO_DISPONIBLE',
    mensaje: FRASE_ENLACE_NO_DISPONIBLE,
  } as const;

  // 1 · el token que no existe y el enlace que no sirve dan lo mismo (P13).
  if (e.enlace === null) return noDisponible;

  const estado = estadoDelEnlace(e.enlace, ahora);

  // La excepción que sí informa: la firma ya ocurrió por este mismo enlace.
  if (estado === 'USADO') {
    return { clase: 'RECHAZO', motivo: 'ENLACE_USADO', mensaje: FRASE_YA_FIRMADO };
  }
  // **Acá muere el sexto intento.** `BLOQUEADO`, `REVOCADO` y `EXPIRADO` producen la misma frase
  // y ninguno llega a la comparación de abajo.
  if (estado !== 'VIGENTE') return noDisponible;

  // 2 · un enlace que nunca salió no puede sostener el numeral 4 del acta.
  if (e.enviadoEn === null) return noDisponible;

  // 3 · ya se firmó por la vía corporativa. **No es un quinto estado público**: se le dice lo
  // mismo que a quien vuelve sobre su propio enlace ya usado, porque es el mismo hecho.
  if (e.asignacionCerrada) {
    return { clase: 'RECHAZO', motivo: 'ASIGNACION_CERRADA', mensaje: FRASE_YA_FIRMADO };
  }

  // 4 · la segunda pieza del segundo factor (D-7, P5).
  if (!comparar(e.documentoTecleado, e.documentoGuardado)) {
    const intentosFallidos = e.intentosFallidos + 1;
    return {
      clase: 'INTENTO_FALLIDO',
      intentosFallidos,
      bloquear: quedaBloqueado(intentosFallidos),
      mensaje: FRASE_DOCUMENTO_NO_COINCIDE,
    };
  }

  return { clase: 'FIRMAR' };
}
