'use server';

// app/sig/acciones/enlace-firma.ts
//
// **REQ-SIG-19 · Tasks 8 y 9 · firmar por enlace, y la constancia de que se firmó.**
//
// Es la segunda de las dos vías que llegan a un acta. La otra —`firmarYAceptar`— tiene una
// sesión corporativa autenticada detrás; ésta no tiene ninguna, y todo lo que la separa de ser un
// agujero es el orden en que se abren sus puertas.
//
// ── Las seis reglas que sostienen la acción ──────────────────────────────────────────────────
//
// **P16 · acá no se le pide el autor a la sesión, porque no hay sesión.** La función que lo
// devuelve en el resto de la aplicación lanzaría `SinSesionError` y no habría ni por dónde
// empezar; esa llamada no aparece en este archivo, ni siquiera nombrada. El autor de la bitácora es
// `enlace:ENL-2026-0007 · nombre@gmail.com`, que dice la verdad —no hubo sesión, hubo un
// enlace—, y **nunca el correo corporativo**, que afirmaría una sesión que no existió: ése es el
// defecto entero que este requerimiento viene a evitar. Lo arma
// `autorDeBitacoraPorEnlace`, en el módulo puro, y acá no se vuelve a construir a mano.
//
// **Y acá sí se puebla `Bitacora.ip`.** Sin sesión, el origen de red es uno de los pocos rastros
// verificables que quedan del acto, y es el mismo dato que el acta guarda en su numeral 4.
//
// **P15 · cero duplicación de las cinco escrituras.** El acta, la evidencia, el registro de
// realizado, la cola de publicación y el cierre de la asignación los asienta `asentarFirma`, que
// es exactamente la misma función que usa la vía con sesión. Si en este archivo apareciera un
// segundo lugar donde se creara el acta, las dos vías empezarían a divergir en la primera
// corrección, y el defecto saldría en las actas de una sola de ellas.
//
// **D-5 · lo que se consume una sola vez es la firma.** `usadoEn` y `actaId` se escriben **dentro
// de la misma transacción** que el acta: un enlace que se usó y no quedó marcado se puede volver
// a usar, y entonces el «un solo uso» no existe.
//
// **P3 · el token no se nombra en ninguna parte.** Ni en la bitácora, ni en un log, ni en un
// mensaje de error, ni en el correo de constancia. Entra por el parámetro, se convierte en hash
// para buscar la fila y se olvida. Lo que se nombra es el **código**.
//
// **P13 · de cara a quien abrió el enlace no hay un quinto estado.** Los cuatro casos malos
// devuelven la frase de `FRASE_ENLACE_NO_DISPONIBLE`, palabra por palabra la misma que la página;
// la asignación ya cerrada por la vía corporativa se resuelve como lo que es —un documento que ya
// está firmado— con la misma frase que el enlace ya usado.
//
// **D-9 · ninguna ruta pública nueva.** La constancia de la Task 9 se manda por correo, y por eso
// es un correo y no una página: cada ruta pública nueva es superficie de ataque sobre la
// aplicación que gobierna el SGSI.

import { headers } from 'next/headers';

import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { enviarCorreo } from '@/lib/sgsi/notificaciones';
import { asentarFirma, publicarLuego } from '@/lib/sig/asentar-firma';
import { correoDeConstanciaDeFirma } from '@/lib/sig/correo-constancia-firma';
import { FRASE_ENLACE_NO_DISPONIBLE, hashDeToken } from '@/lib/sig/enlace-firma';
import { validarFirma } from '@/lib/sig/firma';
import {
  autorDeBitacoraPorEnlace,
  decidirFirmaPorEnlace,
  type DecisionDeFirmaPorEnlace,
} from '@/lib/sig/firma-por-enlace';

/// Lo que la pantalla pública manda. Es el mismo mínimo que `DatosFirma` sin la nota: quien firma
/// por esta vía no tiene dónde escribir una, porque la pantalla pública no la ofrece (P11).
export interface DatosDeFirmaPorEnlace {
  abrioElDocumento: boolean;
  acepto: boolean;
  nombreFirmante: string;
  documentoFirmante: string;
}

/// Lo que la pantalla pública recibe. **La misma forma que `ResultadoFirma`**, para que
/// `PanelPublico` no tenga que saber por cuál de las dos vías firmó.
export interface ResultadoDeFirmaPorEnlace {
  ok: boolean;
  mensaje: string;
  codigoActa: string | null;
}

/// Lo que se le contesta a quien está del otro lado cuando algo falla de verdad —la base, el
/// generador del acta, un dato imposible—.
///
/// **No se le devuelve el mensaje del error.** `ejecutar`, que es lo que envuelve a las acciones
/// con sesión, devuelve `error.message` a la pantalla: allá quien lo lee está autenticado y el
/// detalle le sirve. Acá quien lo lee es anónimo, y el mensaje de un error de Prisma le cuenta
/// nombres de tablas y de columnas a cambio de nada. La causa se registra en el servidor.
const FRASE_FALLO_INTERNO =
  'No fue posible completar la firma en este momento. Vuelva a intentarlo en unos minutos; si el ' +
  'problema sigue, escriba a quien le envió la solicitud.';

function rechazo(mensaje: string): ResultadoDeFirmaPorEnlace {
  return { ok: false, mensaje, codigoActa: null };
}

/// **La firma por la vía del enlace público.**
///
/// Recibe el token porque es la única credencial que existe en esta vía, y lo primero que hace
/// con él es convertirlo en hash. De ahí en adelante el token ya no participa de nada.
export async function firmarConEnlace(
  token: string,
  datos: DatosDeFirmaPorEnlace,
): Promise<ResultadoDeFirmaPorEnlace> {
  try {
    return await ejecutarFirmaConEnlace(token, datos);
  } catch (error) {
    // El detalle va al servidor y no a la pantalla. **Sin el token**: no se registra acá, y el
    // objeto del error tampoco lo contiene porque nunca se le pasó a nadie más que a `huella`.
    console.error('[sig] la firma por enlace falló', error);
    return rechazo(FRASE_FALLO_INTERNO);
  }
}

async function ejecutarFirmaConEnlace(
  token: string,
  datos: DatosDeFirmaPorEnlace,
): Promise<ResultadoDeFirmaPorEnlace> {
  // **P2 · una búsqueda por hash, no una comparación de secretos.** El token en claro no existe
  // en la base, así que no hay nada que comparar y nada que proteger contra tiempos.
  const enlace = await prisma.enlaceFirma.findUnique({
    where: { tokenHash: hashDeToken(token) },
    include: {
      asignacion: {
        include: {
          persona: {
            include: {
              area: { select: { nombre: true } },
              cargo: { select: { nombre: true } },
              tipoContrato: { select: { nombre: true } },
            },
          },
          contenido: true,
          obligacion: { include: { contenido: true } },
          registros: { select: { id: true } },
        },
      },
    },
  });

  // El enlace inexistente se responde igual que los cuatro casos malos, y se responde **antes**
  // de mirar nada más: sin fila no hay ni asignación ni persona de donde sacar un dato.
  if (enlace === null) return rechazo(FRASE_ENLACE_NO_DISPONIBLE);

  const asignacion = enlace.asignacion;
  const ahora = new Date();

  // El contenido cuelga de la asignación directa o de la obligación que la generó, igual que en
  // la bandeja y que en la lectura de la página pública.
  const contenido = asignacion.contenido ?? asignacion.obligacion?.contenido ?? null;

  // **Las puertas del enlace, en orden** (P14: el bloqueo antes del documento). Lo decide el
  // módulo puro; acá sólo se ejecuta lo que decidió.
  const decision = decidirFirmaPorEnlace(
    {
      enlace,
      enviadoEn: enlace.enviadoEn,
      // La misma comprobación que usa la vía con sesión: un registro de realizado es lo que
      // vuelve cerrada a una asignación.
      asignacionCerrada: asignacion.registros.length > 0,
      documentoTecleado: datos.documentoFirmante,
      documentoGuardado: asignacion.persona.documentoIdentidad,
      intentosFallidos: enlace.intentosFallidos,
    },
    ahora,
  );

  const autor = autorDeBitacoraPorEnlace(enlace.codigo, enlace.correoDestino);
  const cabeceras = await headers();
  const ip = cabeceras.get('x-forwarded-for') ?? cabeceras.get('x-real-ip');
  const agente = cabeceras.get('user-agent');

  if (decision.clase === 'RECHAZO') {
    await anotarRechazo(decision, enlace.id, enlace.codigo, autor, ip, ahora);
    return rechazo(decision.mensaje);
  }

  // **El formulario se valida acá: después de las puertas del enlace y ANTES de contar el
  // intento.** Las dos mitades del orden importan.
  //
  // Después, porque validarlo antes convertiría la acción en el oráculo que P13 cierra: un token
  // inexistente contestaría «este enlace no está disponible» y uno existente pero bloqueado
  // contestaría «escriba su nombre completo», y esa diferencia dice que el token existe.
  //
  // Antes de contar, porque **un formulario incompleto no es un intento de suplantación**. Quien
  // manda el campo vacío no probó ningún documento, y gastarle uno de los cinco lo deja sin
  // enlace por un error de tecleo. Los cinco se reservan para documentos efectivamente probados.
  if (contenido === null || !contenido.exigeFirma || contenido.declaracion === null) {
    return rechazo(FRASE_ENLACE_NO_DISPONIBLE);
  }

  const errores = validarFirma({
    abrioElDocumento: datos.abrioElDocumento,
    acepto: datos.acepto,
    nombreFirmante: datos.nombreFirmante,
    documentoFirmante: datos.documentoFirmante,
    declaracion: contenido.declaracion,
  });
  if (errores.length > 0) return rechazo(`${errores.join('. ')}.`);

  if (decision.clase === 'INTENTO_FALLIDO') {
    await anotarIntentoFallido(decision, enlace.id, enlace.codigo, autor, ip, ahora);
    return rechazo(decision.mensaje);
  }

  // La versión vigente con su texto: es lo que la persona tuvo delante y de donde sale la huella
  // del documento (F3). Sin ella no se firma, que es el defecto que D6 cerró.
  const version = await prisma.versionContenido.findUnique({
    where: { contenidoId_version: { contenidoId: contenido.id, version: contenido.version } },
  });
  if (version === null) return rechazo(FRASE_ENLACE_NO_DISPONIBLE);

  // **P19 · cuándo se registró el correo personal, si consta.** Sale de la bitácora, que es el
  // único lugar donde ese hecho quedó fechado. Si el valor entró por una carga inicial no hay
  // fila, y entonces el acta dice que no consta en vez de inventar una fecha.
  const registroDelCorreo = await prisma.bitacora.findFirst({
    where: {
      tabla: 'persona',
      registroId: String(asignacion.personaId),
      campo: 'correo personal',
    },
    orderBy: { ocurridoEn: 'desc' },
    select: { ocurridoEn: true },
  });

  const asentada = await prisma.$transaction(async (tx) => {
    const firma = await asentarFirma(tx, {
      asignacion,
      contenido,
      version,
      datos,
      // **P16 · el autor dice la verdad.** No hubo sesión; hubo un enlace, con su código y la
      // dirección a la que se envió.
      autor,
      medio: 'ENLACE_CORREO_PERSONAL',
      canal: {
        // **Copiada al emitir**, no leída de la ficha: si la persona cambia su correo personal
        // después, el acta tiene que seguir diciendo a dónde fue el enlace (la doctrina de F2).
        correoPersonal: enlace.correoDestino,
        enlaceCodigo: enlace.codigo,
        // No es nulo: `decidirFirmaPorEnlace` rechaza el enlace que nunca se entregó, porque el
        // numeral 4 no puede declarar un envío que no ocurrió.
        enviadoEn: enlace.enviadoEn as Date,
        registradoEn: registroDelCorreo?.ocurridoEn ?? null,
      },
      ip,
      agente,
    });

    // **D-5 · el enlace se cierra en la MISMA transacción que la firma.** Fuera de ella, una
    // caída entre las dos escrituras dejaría un acta firmada y un enlace todavía vigente, que es
    // un segundo acta esperando a que alguien recargue la página.
    //
    // `updateMany` con `usadoEn: null` en el `where` y no un `update` por id: es la condición de
    // carrera de dos pestañas apretando «firmar» a la vez. La segunda no encuentra fila que
    // actualizar, `contador` vuelve 0 y la transacción se deshace entera —incluida el acta—, en
    // vez de sobrescribir el `actaId` de la primera y dejar un acta huérfana.
    const contador = await tx.enlaceFirma.updateMany({
      where: { id: enlace.id, usadoEn: null },
      data: { usadoEn: ahora, actaId: firma.actaId },
    });
    if (contador.count !== 1) {
      throw new Error('el enlace ya se había usado: la firma no se asienta dos veces');
    }

    // La bitácora del enlace, además de la que `asentarFirma` escribe para el acta. Son dos
    // hechos distintos —se generó un acta, y este enlace se consumió— y la trazabilidad de
    // REQ-SIG-19 se recorre en los dos sentidos: del código del enlace al acta, y del acta al
    // enlace. **Acá se puebla `ip`.**
    await registrar(tx, autor, [
      {
        tabla: 'enlace_firma',
        registroId: enlace.codigo,
        campo: 'uso',
        anterior: null,
        nuevo: `firmado · acta ${firma.codigo}`,
        motivo: 'firma electrónica simple por enlace al correo personal',
        ip,
      },
    ]);

    return firma;
  });

  // **Fuera de la transacción**, igual que en la vía con sesión: el cliente de Graph tiene 10 s
  // de timeout y una transacción esperándolo sostiene sus bloqueos todo ese tiempo. Si Graph está
  // caído, la firma se completa igual y el soporte queda PENDIENTE para el trabajo horario.
  publicarLuego(asentada.evidenciaId);

  // **Task 9 · P18 · la constancia, también fuera de la transacción.** Si el correo falla, la
  // firma ya ocurrió y es válida: deshacer un acta porque un servidor de correo no contestó sería
  // subordinar la evidencia a la disponibilidad de SMTP.
  await enviarConstancia(asentada.actaId, {
    nombre: asignacion.persona.nombre,
    documento: {
      codigo: contenido.codigo,
      titulo: version.titulo,
      version: contenido.version,
    },
    correoDestino: enlace.correoDestino,
    enlaceCodigo: enlace.codigo,
    contacto: enlace.emitidoPor,
  });

  return {
    ok: true,
    mensaje:
      `Su firma quedó registrada con el acta ${asentada.codigo}. Le enviamos la constancia a su ` +
      'correo personal, con el código del acta y su huella.',
    codigoActa: asentada.codigo,
  };
}

/// Un rechazo que además **cierra el enlace**, cuando corresponde.
///
/// `ENLACE_USADO` no escribe nada: el enlace ya está cerrado, y anotar una fila por cada vez que
/// alguien recarga su constancia llenaría la bitácora de ruido sobre un hecho que ya consta.
///
/// `ASIGNACION_CERRADA` sí: la asignación se cerró por la vía corporativa y este enlace quedó
/// vigente apuntando a algo que ya no hay que firmar. Se **revoca**, con su motivo, y así el
/// estado que la pantalla muestra a partir de entonces es uno de los cuatro que ya existen —no un
/// quinto (P13)— y quien atiende un reclamo ve en la pantalla de gestión por qué se cerró.
async function anotarRechazo(
  decision: Extract<DecisionDeFirmaPorEnlace, { clase: 'RECHAZO' }>,
  enlaceId: number,
  codigo: string,
  autor: string,
  ip: string | null,
  ahora: Date,
): Promise<void> {
  if (decision.motivo !== 'ASIGNACION_CERRADA') return;

  const motivo = 'la asignación ya se cerró por la vía con sesión corporativa';

  await prisma.$transaction(async (tx) => {
    const contador = await tx.enlaceFirma.updateMany({
      where: { id: enlaceId, revocadoEn: null, usadoEn: null },
      data: { revocadoEn: ahora, motivoRevocacion: motivo },
    });
    if (contador.count !== 1) return;

    await registrar(tx, autor, [
      {
        tabla: 'enlace_firma',
        registroId: codigo,
        campo: 'revocación',
        anterior: null,
        nuevo: ahora.toISOString(),
        motivo,
        ip,
      },
    ]);
  });
}

/// **P14 · el intento fallido se cuenta, y al quinto el enlace se cierra.**
///
/// El contador ya viene decidido por el módulo puro —incrementado— y acá sólo se guarda. Se
/// escribe el valor y no un `increment`, porque el valor es el que se evaluó: un `increment`
/// sobre una fila que cambió en el medio guardaría un número distinto del que decidió el bloqueo.
/// El `where` incluye el contador anterior justamente para que dos intentos simultáneos no se
/// pisen: el segundo no encuentra fila y no cuenta, en vez de sobrescribir al primero.
async function anotarIntentoFallido(
  decision: Extract<DecisionDeFirmaPorEnlace, { clase: 'INTENTO_FALLIDO' }>,
  enlaceId: number,
  codigo: string,
  autor: string,
  ip: string | null,
  ahora: Date,
): Promise<void> {
  const anterior = decision.intentosFallidos - 1;

  await prisma.$transaction(async (tx) => {
    const contador = await tx.enlaceFirma.updateMany({
      where: { id: enlaceId, intentosFallidos: anterior, bloqueadoEn: null },
      data: {
        intentosFallidos: decision.intentosFallidos,
        ...(decision.bloquear ? { bloqueadoEn: ahora } : {}),
      },
    });
    if (contador.count !== 1) return;

    // **P3 · lo que se anota es el código del enlace, nunca el token, y tampoco el número que se
    // tecleó.** Guardar el documento equivocado pondría en la bitácora los números que alguien
    // probó —que pueden ser los de otra persona— sin que eso ayude a nadie a atender el reclamo.
    await registrar(tx, autor, [
      {
        tabla: 'enlace_firma',
        registroId: codigo,
        campo: 'intento fallido',
        anterior,
        nuevo: decision.intentosFallidos,
        motivo: decision.bloquear
          ? 'documento de identidad que no coincide · se alcanzó el tope y el enlace queda bloqueado'
          : 'documento de identidad que no coincide',
        ip,
      },
    ]);
  });
}

interface DestinoDeLaConstancia {
  nombre: string;
  documento: { codigo: string; titulo: string; version: number };
  correoDestino: string;
  enlaceCodigo: string;
  contacto: string;
}

/// **Task 9 · P18 · la copia al correo personal.**
///
/// El código del acta, su huella y su fecha. Se **releen del acta guardada** en vez de rearmarse
/// acá: la constancia tiene que decir lo que quedó escrito, y un valor que se recalcula es un
/// valor que puede diferir del que está en la base.
///
/// No lanza. La firma ya ocurrió y es válida; un correo que no salió es un problema que se
/// atiende después, y no una razón para contarle a quien firmó que su firma falló.
async function enviarConstancia(actaId: number, destino: DestinoDeLaConstancia): Promise<void> {
  try {
    const acta = await prisma.actaAceptacion.findUnique({
      where: { id: actaId },
      select: { codigo: true, actaHash: true, aceptadoEn: true },
    });
    if (acta === null) return;

    const correo = correoDeConstanciaDeFirma({
      nombre: destino.nombre,
      documento: destino.documento,
      acta: { codigo: acta.codigo, huella: acta.actaHash, aceptadoEn: acta.aceptadoEn },
      enlaceCodigo: destino.enlaceCodigo,
      contacto: destino.contacto,
    });

    await enviarCorreo(destino.correoDestino, correo.asunto, correo.texto, correo.html);
  } catch (error) {
    // Sin token adentro: este bloque no lo tiene y nunca lo tuvo.
    console.error('[sig] no se pudo enviar la constancia de firma por enlace', error);
  }
}
