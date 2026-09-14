// lib/sig/envio-enlace-firma.ts
//
// **REQ-SIG-19 · Task 6 · el envío del correo, con su registro.**
//
// Esta es la función que `emitirEnlace` (Task 5) va a llamar cuando exista, y también la que va a
// llamar el botón de «reenviar». Se escribe separada y con una firma cerrada justamente para que
// emitir y enviar no queden soldados: **reenviar es normal** —«no me llegó»— y un envío que sólo
// se puede hacer emitiendo obligaría a emitir un enlace nuevo para repetir un correo, lo que
// revoca el que la persona ya tenía (P6) por un problema que no era del enlace.
//
// ── Las tres reglas que sostienen el módulo ──────────────────────────────────────────────────
//
// **P8 · el envío se registra en `EnlaceFirma`, no en `EnvioNotificacion`.** `EnvioNotificacion`
// tiene `@@unique([tipo, periodo, personaId])`, que es lo que hace idempotentes los avisos del
// cron —y exactamente lo que impediría reenviar—. Reusar esa tabla por parecido de forma haría
// que el segundo envío fallara con un error de unicidad que nadie va a entender. Acá el envío se
// cuenta en `vecesEnviado` y se fecha en `enviadoEn`, que es un contador y no una llave.
//
// **Sin `PUBLIC_URL` no se envía nada, y no se cuenta nada.** El enlace apuntaría a `localhost` y
// el correo se perdería sin que nadie se entere. La comprobación vive en `basePublica`, y acá
// sólo se obedece.
//
// **P3 · el token no se nombra en ninguna parte.** Ni en el resultado, ni en el detalle de un
// fallo, ni en un mensaje que alguien pueda llegar a registrar. Lo que se devuelve son los
// `codigo` de los enlaces —`ENL-2026-0007`—, y el detalle pasa por `sinTokens` antes de salir:
// el detalle lo escribe la librería de SMTP y no este módulo, así que no alcanza con tener
// cuidado al redactarlo.
//
// **El envío queda FUERA de la transacción de emisión.** Es la misma doctrina que P10 de
// REQ-SIG-13 sobre Graph: una transacción esperando a un servidor de correo sostiene sus bloqueos
// todo el tiempo que ese servidor tarde, y lo que importa —que el enlace exista— ya está
// decidido. Por eso el registro del envío se hace con el cliente normal y no con el `tx` de quien
// emite.

import type { PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/db';
import { enviarCorreo } from '@/lib/sgsi/notificaciones';
import {
  MOTIVO_SIN_BASE_PUBLICA,
  basePublica,
  correoDeEnlaceDeFirma,
} from '@/lib/sig/correo-enlace-firma';

/// Un enlace ya emitido, listo para entregarse.
export interface EnlaceParaEnviar {
  /// La fila de `EnlaceFirma`. Es lo que se actualiza al contar el envío.
  id: number;
  /// `ENL-2026-0007`. **Es lo que se nombra** cuando hay que hablar de este enlace (P3).
  codigo: string;
  /// El token en claro. Vive sólo en memoria, desde que se genera hasta que sale en el correo.
  token: string;
  /// El documento que este enlace firma (D-4: uno por enlace).
  documento: { codigo: string; titulo: string };
}

/// Un correo, con todos los enlaces de una persona (P7).
export interface EnvioDeEnlaces {
  nombre: string;
  /// La dirección personal, copiada al emitir (`EnlaceFirma.correoDestino`).
  correoDestino: string;
  /// Hasta cuándo sirven. Todos los enlaces de un mismo correo comparten el plazo porque se
  /// emiten juntos; si algún día no fuera así, esto pasa a ser por enlace.
  expiraEn: Date;
  /// `EnlaceFirma.emitidoPor`: a quién escribirle si no reconoce la solicitud.
  contacto: string;
  enlaces: EnlaceParaEnviar[];
}

export interface ResultadoEnvioDeEnlaces {
  enviado: boolean;
  /// Los códigos de los enlaces entregados. **Nunca los tokens.**
  codigos: string[];
  /// Para la pantalla de gestión y para la bitácora de quien emitió. Ya viene sin tokens.
  detalle: string;
}

/// Lo mínimo que este módulo necesita de Prisma. Se declara estructuralmente para que lo cumplan
/// tanto el cliente normal como un `Prisma.TransactionClient`, sin que el módulo tenga que
/// conocer ninguno de los dos.
type ClienteDeEnlaces = { enlaceFirma: Pick<PrismaClient['enlaceFirma'], 'updateMany'> };

/// **P8 · así se cuenta un envío.** `updateMany` y no un `update` por fila: los enlaces de un
/// mismo correo se entregaron en el mismo acto, y contarlos de a uno abre la puerta a que el
/// tercero falle y queden dos contados y dos no.
export function anotarEnvioCon(cliente: ClienteDeEnlaces) {
  return async (ids: number[], enviadoEn: Date): Promise<void> => {
    await cliente.enlaceFirma.updateMany({
      where: { id: { in: ids } },
      data: { enviadoEn, vecesEnviado: { increment: 1 } },
    });
  };
}

/// Las piezas que el módulo toma de afuera. Todas tienen valor por defecto: quien llama no
/// necesita conocerlas, y quien prueba puede reemplazarlas sin SMTP y sin base.
export interface PuertosDeEnvio {
  entorno?: Record<string, string | undefined>;
  enviar?: typeof enviarCorreo;
  anotarEnvio?: (ids: number[], enviadoEn: Date) => Promise<void>;
  ahora?: () => Date;
}

/// **P3 · la garantía de que el token no sale por el detalle.**
///
/// El detalle de un fallo lo escribe nodemailer, no este módulo. Redactarlo con cuidado no
/// alcanza cuando el texto viene de afuera, así que se filtra: lo que se devuelve no puede
/// contener un token aunque la librería decida incluirlo.
export function sinTokens(texto: string, tokens: string[]): string {
  return tokens.reduce((acc, t) => (t === '' ? acc : acc.split(t).join('«token»')), texto);
}

/// **Envía el correo con los enlaces y cuenta el envío.**
///
/// Devuelve en vez de lanzar: un correo que no salió no debe deshacer un enlace que sí se emitió.
/// Quien llama decide qué hacer con eso —mostrarlo, reintentar, dejarlo para el botón de
/// reenviar—, y el enlace sigue existiendo y sirviendo.
///
/// El envío **no se cuenta si el correo no salió**: `vecesEnviado` responde «cuántas veces llegó
/// a salir», y contar los intentos fallidos convertiría el único número que sirve para atender un
/// «no me llegó» en un número que no significa nada.
export async function enviarEnlaceDeFirma(
  envio: EnvioDeEnlaces,
  puertos: PuertosDeEnvio = {},
): Promise<ResultadoEnvioDeEnlaces> {
  const entorno = puertos.entorno ?? process.env;
  const enviar = puertos.enviar ?? enviarCorreo;
  const anotarEnvio = puertos.anotarEnvio ?? anotarEnvioCon(prisma);
  const ahora = puertos.ahora ?? (() => new Date());

  const codigos = envio.enlaces.map((e) => e.codigo);
  const tokens = envio.enlaces.map((e) => e.token);
  const limpio = (detalle: string) => sinTokens(detalle, tokens);

  if (envio.enlaces.length === 0) {
    return { enviado: false, codigos: [], detalle: 'No hay enlaces que entregar.' };
  }

  const base = basePublica(entorno);
  if (base === null) {
    // No se envía y no se cuenta. El enlace ya emitido queda sin entregar, que es un estado
    // visible y arreglable; un correo con un enlace a `localhost` no lo es.
    return { enviado: false, codigos, detalle: MOTIVO_SIN_BASE_PUBLICA };
  }

  const correo = correoDeEnlaceDeFirma(base, {
    nombre: envio.nombre,
    expiraEn: envio.expiraEn,
    contacto: envio.contacto,
    documentos: envio.enlaces.map((e) => ({
      token: e.token,
      codigo: e.documento.codigo,
      titulo: e.documento.titulo,
    })),
  });

  const resultado = await enviar(envio.correoDestino, correo.asunto, correo.texto, correo.html);
  if (!resultado.enviado) {
    return { enviado: false, codigos, detalle: limpio(resultado.detalle) };
  }

  await anotarEnvio(
    envio.enlaces.map((e) => e.id),
    ahora(),
  );

  return { enviado: true, codigos, detalle: limpio(resultado.detalle) };
}
