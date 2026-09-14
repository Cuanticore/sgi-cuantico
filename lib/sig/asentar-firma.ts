import 'server-only';

// lib/sig/asentar-firma.ts
//
// **REQ-SIG-19 · P15 · las cinco escrituras de la regla F7, en un solo lugar.**
//
// Hay dos vías para llegar a firmar —la sesión corporativa de siempre y el enlace público al
// correo personal— y las dos asientan exactamente lo mismo. Una segunda copia de este bloque se
// desincroniza en el primer cambio, y el defecto aparecería en las actas de una sola de las dos
// vías: el peor lugar donde puede aparecer, porque nadie compara actas entre vías hasta que un
// auditor lo hace.
//
// Lo que cambia entre las dos vías **no** son las escrituras: es **quién autoriza**. Por eso
// `asentarFirma` recibe al autor y al medio en vez de deducirlos, y la puerta de la sesión
// —`persona.correo !== sesion`— se queda arriba, en `firmarYAceptar`. Si bajara, la vía por
// enlace tendría que fingir un correo de sesión que nunca existió.
//
// **Por qué vive acá y no en `app/sig/acciones/firma.ts`, que es de donde salió.** Aquel archivo
// es `'use server'`, y en un archivo así **cada export es un endpoint**: exportar una función que
// recibe un `Prisma.TransactionClient` la volvería alcanzable desde afuera con un argumento que
// ningún cliente puede construir, y el resto de los tipos dejaría de poder exportarse sin
// convertirse también en superficie. La alternativa —copiar las cinco escrituras en la vía por
// enlace— es exactamente lo que P15 prohíbe. Así que el bloque compartido baja a `lib/`, con
// `server-only` para que no pueda terminar en un paquete del navegador, y las dos acciones lo
// importan.

import type { Prisma } from '@prisma/client';
import { registrar } from '@/lib/sgsi/bitacora';
import {
  codigoActa,
  generarActa,
  huella,
  type CanalDelActa,
  type MedioDelActa,
} from '@/lib/sig/firma';

export interface DatosFirma {
  /// F1 · lo pone la pantalla al abrir el documento. Llega del cliente y no se puede
  /// verificar en el servidor —abrir un documento no deja rastro— así que es una
  /// declaración de la interfaz, y así está dicho en la regla: se pide que el documento
  /// haya estado delante, no que se haya leído.
  abrioElDocumento: boolean;
  acepto: boolean;
  nombreFirmante: string;
  documentoFirmante: string;
  /// Notas de quien firma, si escribió alguna. No es parte del acta.
  nota?: string;
}

/// Lo que `asentarFirma` necesita de la asignación.
///
/// Se declara acá y no se importa de Prisma porque las dos vías leen la fila con `include`
/// distintos —la vía por enlace llega desde `EnlaceFirma` y no desde la sesión—, y lo único que
/// tienen que compartir es este mínimo. Pedir el tipo completo de Prisma obligaría a la otra vía
/// a cargar relaciones que no usa sólo para satisfacer al compilador.
export interface AsignacionParaAsentar {
  id: number;
  personaId: number;
  persona: {
    correo: string;
    cargo: { nombre: string } | null;
    area: { nombre: string } | null;
    tipoContrato: { nombre: string } | null;
  };
}

/// El contenido que se firma. `declaracion` llega anulable porque así vive en el esquema; que no
/// sea nula la comprueba `validarFirma` **antes** de llamar acá.
export interface ContenidoParaAsentar {
  id: number;
  codigo: string;
  version: number;
  declaracion: string | null;
}

/// La versión vigente con su texto: es lo que la persona tuvo delante y de donde sale la huella
/// del documento (F3).
export interface VersionParaAsentar {
  id: number;
  titulo: string;
  descripcion: string;
  documentoUrl: string | null;
}

/// Lo que hay que asentar, además de la transacción de quien llame.
export interface EntradaAsentarFirma {
  asignacion: AsignacionParaAsentar;
  contenido: ContenidoParaAsentar;
  version: VersionParaAsentar;
  datos: DatosFirma;
  /// **P16 · quién queda como autor de la evidencia y de la bitácora.** Con sesión es el correo
  /// corporativo; en la vía pública es `enlace:ENL-… · correo`, que dice la verdad: no hubo
  /// sesión, hubo un enlace. Se recibe y no se deduce justamente para que ninguna vía tenga que
  /// inventar una sesión que no tuvo.
  autor: string;
  /// **P1 · el medio es un dato, no una deducción del texto del acta.**
  medio: MedioDelActa;
  /// Sólo la vía por enlace. `textoDelActa` rechaza la incoherencia entre los dos campos, así
  /// que no hace falta volver a comprobarla acá.
  canal?: CanalDelActa;
  ip: string | null;
  agente: string | null;
}

/// Lo que queda asentado: el código para mostrárselo a quien firmó, el id de la evidencia para
/// disparar la publicación **fuera** de la transacción (P10 de REQ-SIG-13), y el id del acta para
/// que la vía por enlace pueda enlazarla con su `EnlaceFirma`.
export interface FirmaAsentada {
  codigo: string;
  evidenciaId: number;
  actaId: number;
}

/// **Las cinco escrituras de la regla F7, en la transacción de quien llame.**
///
/// Consecutivo y código, registro de realizado, evidencia con el artefacto congelado, acta, cola
/// de publicación, cierre de la asignación y bitácora: ocurren juntas o no ocurre ninguna. Quien
/// llama abre la transacción; acá no se abre otra, porque anidar transacciones rompería
/// exactamente la atomicidad que esta función existe para garantizar.
///
/// **Recibe al AUTOR y al MEDIO en vez de deducirlos**: es lo que permite que las dos vías
/// compartan esto sin que ninguna finja una sesión que no tuvo (P15, P16).
///
/// No valida nada. Las puertas —que la asignación exista, que no esté cerrada, que el contenido
/// exija firma y tenga su versión, y **quién está autorizado a firmarla**— son de quien llama, y
/// la última es distinta en cada vía: eso es todo lo que las separa.
export async function asentarFirma(
  tx: Prisma.TransactionClient,
  e: EntradaAsentarFirma,
): Promise<FirmaAsentada> {
  const { asignacion, contenido, version, datos } = e;

  // La huella del documento se calcula sobre el TEXTO de la versión, que es lo que la
  // pantalla muestra. Si algún día el documento se sirve como archivo, se calcula sobre
  // sus bytes — la regla es la misma: la huella es de lo que se mostró.
  const documentoHash = huella(`${version.titulo}\n${version.descripcion}`);

  const anio = new Date().getUTCFullYear();
  const contador = await tx.contadorActa.upsert({
    where: { anio },
    update: { ultimoValor: { increment: 1 } },
    create: { anio, ultimoValor: 1 },
  });
  const codigo = codigoActa(anio, contador.ultimoValor);

  const registro = await tx.registroRealizado.create({
    data: {
      asignacionId: asignacion.id,
      nota: datos.nota,
      versionLeida: String(contenido.version),
      versionContenidoId: version.id,
    },
  });

  const aceptadoEn = new Date();
  const acta = generarActa({
    codigo,
    firmante: {
      nombre: datos.nombreFirmante.trim(),
      documento: datos.documentoFirmante.trim(),
      cargo: asignacion.persona.cargo?.nombre ?? null,
      area: asignacion.persona.area?.nombre ?? null,
      correo: asignacion.persona.correo,
      vinculacion: asignacion.persona.tipoContrato?.nombre ?? null,
    },
    documento: {
      codigo: contenido.codigo,
      nombre: version.titulo,
      version: contenido.version,
      hash: documentoHash,
      ubicacion: version.documentoUrl,
    },
    // F2 · la declaración se COPIA. `contenido.declaracion` puede cambiar mañana; esta
    // acta conserva la que se aceptó.
    declaracion: contenido.declaracion as string,
    constancia: {
      aceptadoEn,
      ip: e.ip,
      agente: e.agente,
      sesionId: null,
      asignacionId: asignacion.id,
    },
    medio: e.medio,
    canal: e.canal,
  });

  // F5 · el artefacto se genera ACÁ y se guarda. No se rearma al consultar.
  const evidencia = await tx.evidencia.create({
    data: {
      registroId: registro.id,
      tipo: 'ARCHIVO',
      texto: `${codigo}.txt`,
      creadaPor: e.autor,
      archivoNombre: `${codigo}.txt`,
      archivoMime: 'text/plain; charset=utf-8',
      archivoTamano: Buffer.byteLength(acta.texto, 'utf8'),
      archivoSha256: acta.hash,
      archivoVersion: 1,
      archivo: { create: { bytes: Buffer.from(acta.texto, 'utf8') } },
    },
  });

  const actaGuardada = await tx.actaAceptacion.create({
    data: {
      codigo,
      personaId: asignacion.personaId,
      contenidoId: contenido.id,
      contenidoVersion: contenido.version,
      versionContenidoId: version.id,
      registroId: registro.id,
      declaracion: contenido.declaracion as string,
      documentoHash,
      nombreFirmante: datos.nombreFirmante.trim(),
      documentoFirmante: datos.documentoFirmante.trim(),
      aceptadoEn,
      ip: e.ip,
      agente: e.agente,
      pdfId: evidencia.id,
      actaHash: acta.hash,
      // REQ-SIG-19 · el medio queda como COLUMNA y no como algo que haya que leer del texto del
      // acta. `SESION_CORPORATIVA` es el valor por defecto del esquema, así que la vía de
      // siempre escribe exactamente lo que ya venía escribiendo.
      medioIdentificacion: e.medio,
      correoNotificacion: e.canal?.correoPersonal ?? null,
      enlaceCodigo: e.canal?.enlaceCodigo ?? null,
    },
  });

  // REQ-SIG-13 · la fila de la cola se crea DENTRO de la transacción, junto al acta:
  // si la firma se deshace, no queda un soporte encolado que no existe. Las dos vías publican
  // su acta en SharePoint — una firma por enlace no es menos auditable.
  await tx.publicacionSoporte.create({
    data: { evidenciaId: evidencia.id, personaId: asignacion.personaId },
  });

  await tx.asignacion.update({
    where: { id: asignacion.id },
    data: { estado: 'REALIZADA', fechaCierre: aceptadoEn, cerradaPor: asignacion.personaId },
  });

  await registrar(tx, e.autor, [
    {
      tabla: 'acta_aceptacion',
      registroId: codigo,
      campo: 'alta',
      anterior: null,
      nuevo: `${contenido.codigo} v${contenido.version} · ${acta.hash.slice(0, 12)}`,
      motivo: 'firma electrónica simple de aceptación',
    },
  ]);

  return { codigo, evidenciaId: evidencia.id, actaId: actaGuardada.id };
}

/// **P10 · ninguna llamada a Graph dentro de la transacción.** El cliente HTTP tiene 10 s de
/// timeout: una transacción esperando a Graph sostiene sus bloqueos todo ese tiempo, y la
/// firma —que es lo que le importa a la persona— quedaría a merced de la disponibilidad
/// de Microsoft. Si Graph está caído, la firma se completa igual y el soporte queda
/// PENDIENTE: el trabajo horario lo publica después.
export function publicarLuego(evidenciaId: number): void {
  void import('@/lib/sig/publicador-soportes')
    .then((m) => m.publicarPorEvidencia(evidenciaId))
    .catch(() => {
      // El fallo ya quedó anotado en la fila con su causa; acá no hay a quién avisarle.
    });
}
