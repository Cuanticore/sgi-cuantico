// lib/sig/enlace-firma.ts
//
// **REQ-SIG-19 · el núcleo puro del enlace de firma.**
//
// Alguien sale de la organización con documentos pendientes de firmar y su cuenta corporativa
// ya está deshabilitada. Sin cuenta no hay sesión, sin sesión no hay firma, y esas asignaciones
// quedan abiertas para siempre contándose como vencidas. La vía de excepción es un enlace único
// enviado al correo personal. Lo que se decide acá es todo lo que esa vía tiene de reglas:
// **el token, su hash, el código, el estado del enlace, la verificación del documento y el tope
// de intentos.**
//
// Es puro por la misma razón que `lib/sgsi/bloqueo.ts`: no toca la red, no toca Prisma y no lee
// `process.env` por su cuenta. Una regla que sólo se puede comprobar levantando Postgres termina
// sin comprobarse, y ésta gobierna quién puede firmar en nombre de quién. Las acciones ejecutan
// lo que este módulo decide y no vuelven a decidir nada.
//
// ── Las cinco reglas que sostienen el módulo ─────────────────────────────────────────────────
//
// **P2 · se guarda el hash, nunca el token.** Igual que una contraseña y por la misma razón: un
// respaldo de la base, un `SELECT` de soporte o una fuga del volcado no pueden entregarle a
// nadie la capacidad de firmar en nombre de otro. La verificación es una **búsqueda por hash**
// —`where: { tokenHash: hashDeToken(recibido) }`— y no una comparación de secretos, así que no
// hay nada que proteger contra tiempos: no se compara nada.
//
// **P3 · el token no se nombra en ninguna parte.** Ni en la bitácora, ni en un registro, ni en
// un mensaje de error. Lo que se nombra es el `codigo` —`ENL-2026-0007`—, y ése es el motivo por
// el que el código existe. Un token en la bitácora es un token en manos de todo el que puede
// leer la bitácora, que es justamente el grupo que audita las firmas. Por eso ninguna función de
// este módulo devuelve el token dentro de una frase.
//
// **D-5 · un solo uso para firmar; abrirlo, cuantas veces haga falta.** La gente cierra la
// pestaña, se le va la conexión, quiere leer el documento dos veces antes de aceptar. Lo que se
// consume una sola vez es la **firma**, y por eso `USADO` es el primer estado que se evalúa.
//
// **D-7 · el documento de identidad se verifica, no sólo se registra.** Con sesión corporativa
// la identidad la aporta Azure y el tecleo es sólo el acto deliberado. Sin sesión, ese tecleo es
// lo único que separa «quien tiene el enlace» de «quien es la persona»: posesión más
// conocimiento. Un enlace filtrado, solo, no alcanza.
//
// **D-8 · el plazo es parámetro y no constante.** Cambiar de 7 a 3 días es una decisión del
// líder del SIG, y no debería exigir un despliegue. El entorno llega por parámetro —como en
// `bloqueoHabilitado`— para que la regla se pueda probar sin ensuciar el entorno del proceso de
// pruebas.

import { randomBytes } from 'node:crypto';

import { huella } from '@/lib/sig/firma';

/// **§6 · 32 bytes en base64url**, 43 caracteres, 256 bits.
export const BYTES_DEL_TOKEN = 32;

/// **P14 · cinco documentos equivocados y el enlace queda bloqueado.**
///
/// Un documento de identidad son entre seis y diez dígitos. Sin tope, quien consiga un enlace
/// —reenviado, filtrado, encontrado en un historial— termina adivinándolo. Cinco es suficiente
/// para quien se equivoca tecleando y ridículamente poco para quien prueba.
export const TOPE_DE_INTENTOS = 5;

/// **D-8 · el plazo por defecto.** Suficiente para quien no revisa su correo personal a diario,
/// corto para que un correo reenviado meses después no siga firmando.
export const DIAS_DE_VALIDEZ_POR_DEFECTO = 7;

/// La variable que ajusta el plazo sin desplegar.
export const VARIABLE_DE_DIAS = 'FIRMA_ENLACE_DIAS';

/// **El token del enlace.** 32 bytes de `node:crypto` en base64url.
///
/// **No es un UUID.** Un v4 tiene 122 bits, que alcanzarían, pero su formato invita a tratarlo
/// como identificador —se pega en un ticket, se registra en un log, el navegador lo
/// autocompleta— y no toda librería que los genera usa un generador criptográfico. Un token
/// opaco de 32 bytes no se confunde con un id.
///
/// base64url y no base64: el token viaja **en la ruta** de la URL (`/firmar/<token>`), y ni `+`
/// ni `/` ni `=` sobreviven ahí sin escaparse. Un token que hay que escapar es un token que
/// alguien va a copiar mal.
export function generarToken(): string {
  return randomBytes(BYTES_DEL_TOKEN).toString('base64url');
}

/// **P2 · lo único que se guarda del token.** SHA-256 en hexadecimal, con la misma función que
/// calcula la huella del acta: no se introduce un segundo algoritmo de hash en el proyecto para
/// que no haya dos respuestas a «¿con qué se calculó esto?».
export function hashDeToken(token: string): string {
  return huella(token);
}

/// `ENL-2026-0007`, con el mismo patrón que `codigoActa`. El año va adelante porque la
/// numeración se reinicia con él, y sin el año dos enlaces de años distintos podrían chocar.
///
/// **Es lo que se nombra en la bitácora, en el acta y en un ticket de soporte** (P3). Existe
/// para que nadie tenga nunca la necesidad de pegar el token en ninguna parte.
export function codigoEnlace(anio: number, consecutivo: number): string {
  return `ENL-${anio}-${String(consecutivo).padStart(4, '0')}`;
}

/// **D-8 · cuántos días vale el enlace en este entorno.**
///
/// Cualquier cosa que no sea un entero positivo cae en el valor por defecto: un `FIRMA_ENLACE_DIAS`
/// mal escrito —vacío, `siete`, `0`, `-3`— no puede producir un enlace que nace vencido ni uno
/// que no vence nunca. Fallar hacia los 7 días es la única caída que no cambia el riesgo.
export function diasDeValidez(entorno: Record<string, string | undefined>): number {
  const crudo = entorno[VARIABLE_DE_DIAS]?.trim();
  if (crudo === undefined || crudo === '') return DIAS_DE_VALIDEZ_POR_DEFECTO;
  const dias = Number(crudo);
  if (!Number.isInteger(dias) || dias <= 0) return DIAS_DE_VALIDEZ_POR_DEFECTO;
  return dias;
}

/// Cuándo vence un enlace emitido en este instante. Se calcula una vez, al emitir, y se guarda:
/// la expiración es un **dato del enlace** y no una cuenta que se rehace en cada consulta. Si se
/// recalculara, cambiar el parámetro alargaría enlaces ya emitidos, que es exactamente lo que un
/// plazo existe para impedir.
export function venceEn(emitidoEn: Date, dias: number): Date {
  return new Date(emitidoEn.getTime() + dias * 24 * 60 * 60 * 1000);
}

/// Los cinco estados en que puede estar un enlace que **existe**. El que no existe no tiene
/// estado: lo resuelve quien consulta, al no encontrar la fila, y muestra lo mismo que los
/// cuatro que no sirven (P13).
export type EstadoDelEnlace = 'USADO' | 'REVOCADO' | 'BLOQUEADO' | 'EXPIRADO' | 'VIGENTE';

/// Lo mínimo que hace falta saber del enlace para decidir su estado. Son las cuatro columnas de
/// `EnlaceFirma` que marcan un fin, declaradas acá y no importadas de Prisma: este módulo se
/// prueba sin base, y el día que el esquema renombre una columna la traducción se hace en la
/// acción, que es donde se lee la fila.
export interface EnlaceParaEvaluar {
  expiraEn: Date;
  /// El instante de la firma. Lo que se consume una sola vez.
  usadoEn: Date | null;
  revocadoEn: Date | null;
  bloqueadoEn: Date | null;
}

/// **En qué estado está el enlace.** El orden de evaluación no es cosmético.
///
/// **`USADO` va primero, incluso por encima de `EXPIRADO`** (D-5). Quien firmó y vuelve a abrir
/// su propio enlace una semana después necesita ver la constancia —el código del acta y su
/// fecha—, porque ya no tiene dónde consultarla: `/mi-sig` le está cerrado. Evaluar la
/// expiración antes le mostraría «este enlace no está disponible» sobre una firma que sí
/// ocurrió, que es lo más parecido a decirle que no firmó.
///
/// `REVOCADO` y `BLOQUEADO` van antes que `EXPIRADO` porque describen un fin **deliberado** —lo
/// reemplazó uno nuevo, o se agotaron los intentos— y ése es el dato que sirve en soporte. A la
/// pantalla los tres le dan lo mismo (P13); a quien atiende el reclamo, no.
export function estadoDelEnlace(e: EnlaceParaEvaluar, ahora: Date): EstadoDelEnlace {
  if (e.usadoEn !== null) return 'USADO';
  if (e.revocadoEn !== null) return 'REVOCADO';
  if (e.bloqueadoEn !== null) return 'BLOQUEADO';
  // El límite es el propio instante de expiración: un enlace que vence a las 14:00 no sirve a
  // las 14:00. Al revés habría un empate que depende de milisegundos y que nadie puede explicar.
  if (ahora.getTime() >= e.expiraEn.getTime()) return 'EXPIRADO';
  return 'VIGENTE';
}

/// **P13 · un token que no sirve produce siempre la misma página.**
///
/// Inexistente, expirado, revocado o bloqueado: la misma frase, sin nombres y sin decir cuál de
/// los cuatro casos es. Distinguirlos convertiría la ruta en un oráculo para saber si un token
/// adivinado existe, y cada respuesta distinta es una pista más.
///
/// Vive acá, en una constante, para que las cuatro salidas sean literalmente la misma cadena: dos
/// frases parecidas escritas en dos lugares terminan distinguiéndose en la primera corrección de
/// estilo, y ahí vuelve el oráculo.
export const FRASE_ENLACE_NO_DISPONIBLE =
  'Este enlace no está disponible. Si tenía un documento pendiente de firma, escriba a quien le ' +
  'envió la solicitud para que le haga llegar uno nuevo.';

/// Si el estado se le puede contar a quien abrió el enlace.
///
/// **Sólo `USADO`.** Es la excepción de P13 y está justificada: a esa altura ya no hay nada que
/// proteger —la firma ocurrió— y quien vuelve necesita la confirmación. Todo lo demás calla.
export function elEstadoSeLeCuentaAlPublico(estado: EstadoDelEnlace): boolean {
  return estado === 'USADO';
}

/// **P14 · si el enlace queda bloqueado con esta cantidad de intentos fallidos.**
///
/// Recibe el contador **ya incrementado**: se llama después de anotar el fallo, con el número que
/// va a quedar guardado. Preguntarlo antes obligaría a que cada quien recuerde sumar uno, y el
/// que se olvide regala un intento.
export function quedaBloqueado(intentosFallidos: number): boolean {
  return intentosFallidos >= TOPE_DE_INTENTOS;
}

/// Cuántos intentos le quedan. Nunca baja de cero, y **no se le muestra a quien está tecleando**:
/// decirle «te quedan 3» a alguien que está probando documentos le dice cuánto puede seguir
/// probando. Es para la pantalla de gestión y para el correo de soporte.
export function intentosRestantes(intentosFallidos: number): number {
  return Math.max(0, TOPE_DE_INTENTOS - intentosFallidos);
}

/// Deja el documento de identidad en su forma comparable.
///
/// Se quitan espacios, puntos y guiones, que es como la gente escribe un número de documento
/// cuando lo copia de la cédula, y se pliega la caja porque algunos documentos llevan letras. Lo
/// que queda es lo que identifica, y nada de lo que se quita identificaba.
function normalizarDocumento(documento: string): string {
  return documento.replace(/[\s.\-–—]/g, '').toUpperCase();
}

/// **D-7 · el documento tecleado contra el guardado.**
///
/// Es la segunda de las dos piezas de identificación (P5): posesión del enlace más conocimiento
/// del documento. Sin ella, un enlace filtrado firma solo.
///
/// Un documento vacío —de cualquiera de los dos lados— **nunca coincide**, aunque los dos estén
/// vacíos. Una persona sin `documentoIdentidad` cargado no debería llegar hasta acá (P5 lo exige
/// para emitir), pero si llegara, dos cadenas vacías comparándose como iguales dejarían firmar a
/// cualquiera que apriete enter.
export function documentoCoincide(tecleado: string, guardado: string | null): boolean {
  if (guardado === null) return false;
  const a = normalizarDocumento(tecleado);
  const b = normalizarDocumento(guardado);
  if (a === '' || b === '') return false;
  return a === b;
}

/// Lo que hace falta saber de la persona para decidir si se le puede emitir un enlace.
export interface PersonaParaEnlace {
  /// El censo. `false` es lo que hace elegible esta vía (P4).
  activa: boolean;
  correoPersonal: string | null;
  documentoIdentidad: string | null;
}

/// **Qué impide emitir el enlace.** Devuelve la lista completa y no el primer error, igual que
/// `validarFirma`: quien está por emitir merece ver todo lo que falta de una vez, no descubrirlo
/// de a uno y volver tres veces a la ficha.
///
/// **P4 · la aplicación se niega a emitir cuando la vía fuerte está disponible.** Si la cuenta
/// corporativa funciona, la persona firma en Mi SIG con su sesión, y punto. Sin esta regla el
/// enlace se convierte en el camino cómodo —no hay que iniciar sesión— y en seis meses la mitad
/// de las actas de la organización tendría el fundamento débil en vez del fuerte. Una vía de
/// excepción que se puede usar sin excepción deja de ser una excepción.
///
/// **P5 · no se emite sin las dos piezas del segundo factor.** Sin correo personal no hay a dónde
/// escribir; sin documento de identidad no hay nada contra qué verificar, y el enlace pasaría a
/// ser la única credencial. Las frases dicen a dónde ir a cargarlo, porque el vacío se arregla en
/// la ficha y no en este botón.
export function puedeEmitir(p: PersonaParaEnlace): string[] {
  const errores: string[] = [];

  if (p.activa) {
    errores.push(
      'esta persona sigue activa: mientras su cuenta corporativa funcione, firma en Mi SIG con ' +
        'su sesión. El enlace es la vía de excepción para quien ya no puede entrar.',
    );
  }
  if (p.correoPersonal === null || p.correoPersonal.trim() === '') {
    errores.push(
      'falta el correo personal: sin una dirección a dónde escribir, el enlace no se puede ' +
        'enviar. Se carga en la pestaña de contactos.',
    );
  }
  if (p.documentoIdentidad === null || p.documentoIdentidad.trim() === '') {
    errores.push(
      'falta el documento de identidad: es lo que se verifica al firmar, y sin él el enlace ' +
        'sería la única credencial. Se carga en la pestaña de datos base.',
    );
  }

  return errores;
}
