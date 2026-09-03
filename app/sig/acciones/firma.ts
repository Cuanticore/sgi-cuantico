'use server';

// app/sig/acciones/firma.ts
//
// Firmar y aceptar. **F7 · todo en una transacción**: acta, artefacto, registro de
// realizado, cierre de la asignación y bitácora. Un acta sin su registro, o un registro sin
// su acta, es peor que no tener ninguno de los dos — el primero afirma que alguien firmó
// una tarea que sigue abierta, y el segundo cierra una tarea sin la evidencia que la
// sostiene.

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { autorActual, ejecutar, exigirId, type Resultado } from '@/app/sgsi/acciones/sesion';
import { codigoActa, generarActa, huella, validarFirma } from '@/lib/sig/firma';

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

export interface ResultadoFirma extends Resultado {
  codigoActa: string | null;
}

export async function firmarYAceptar(
  asignacionId: number,
  datos: DatosFirma,
): Promise<ResultadoFirma> {
  return ejecutar<ResultadoFirma>(async () => {
    const sesion = await autorActual();
    exigirId(asignacionId, 'la asignación');

    const asignacion = await prisma.asignacion.findUnique({
      where: { id: asignacionId },
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
    });
    if (!asignacion) {
      return { ok: false, mensaje: 'La asignación no existe.', codigoActa: null };
    }

    // **Firma cada persona, y nadie por ella** (§6 de la spec). No hay cierre
    // administrativo de una firma: un acta firmada por otro no es una firma, es una
    // falsificación con permisos.
    if (asignacion.persona.correo !== sesion) {
      return {
        ok: false,
        mensaje: 'Sólo la persona asignada puede firmar. No hay firma por delegación.',
        codigoActa: null,
      };
    }
    if (asignacion.registros.length > 0) {
      return { ok: false, mensaje: 'Esta asignación ya se cerró.', codigoActa: null };
    }

    const contenido = asignacion.contenido ?? asignacion.obligacion?.contenido;
    if (!contenido) {
      return { ok: false, mensaje: 'La asignación no tiene contenido.', codigoActa: null };
    }
    if (!contenido.exigeFirma) {
      return {
        ok: false,
        mensaje: 'Este contenido no exige firma; se cierra por la vía normal.',
        codigoActa: null,
      };
    }

    const errores = validarFirma({
      abrioElDocumento: datos.abrioElDocumento,
      acepto: datos.acepto,
      nombreFirmante: datos.nombreFirmante,
      documentoFirmante: datos.documentoFirmante,
      declaracion: contenido.declaracion,
    });
    if (errores.length > 0) {
      return { ok: false, mensaje: errores.join('. '), codigoActa: null };
    }

    // La versión vigente, con su texto. Es lo que la persona tenía delante, y de ahí sale
    // la huella del documento (F3): sin ella, «acepté la versión 2» no prueba nada.
    const version = await prisma.versionContenido.findUnique({
      where: {
        contenidoId_version: { contenidoId: contenido.id, version: contenido.version },
      },
    });
    if (!version) {
      // No se firma contra un documento cuyo texto no existe. Es el defecto que D6 cerró y
      // acá se rechaza en vez de generar un acta que no se puede verificar.
      return {
        ok: false,
        mensaje:
          'El contenido no tiene guardada su versión vigente, así que no hay texto contra el ' +
          'cual verificar la firma.',
        codigoActa: null,
      };
    }

    // La huella del documento se calcula sobre el TEXTO de la versión, que es lo que la
    // pantalla muestra. Si algún día el documento se sirve como archivo, se calcula sobre
    // sus bytes — la regla es la misma: la huella es de lo que se mostró.
    const documentoHash = huella(`${version.titulo}\n${version.descripcion}`);

    const cabeceras = await headers();
    const anio = new Date().getUTCFullYear();
    let codigo = '';

    await prisma.$transaction(async (tx) => {
      const contador = await tx.contadorActa.upsert({
        where: { anio },
        update: { ultimoValor: { increment: 1 } },
        create: { anio, ultimoValor: 1 },
      });
      codigo = codigoActa(anio, contador.ultimoValor);

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
          ip: cabeceras.get('x-forwarded-for') ?? cabeceras.get('x-real-ip'),
          agente: cabeceras.get('user-agent'),
          sesionId: null,
          asignacionId: asignacion.id,
        },
      });

      // F5 · el artefacto se genera ACÁ y se guarda. No se rearma al consultar.
      const evidencia = await tx.evidencia.create({
        data: {
          registroId: registro.id,
          tipo: 'ARCHIVO',
          texto: `${codigo}.txt`,
          creadaPor: sesion,
          archivoNombre: `${codigo}.txt`,
          archivoMime: 'text/plain; charset=utf-8',
          archivoTamano: Buffer.byteLength(acta.texto, 'utf8'),
          archivoSha256: acta.hash,
          archivoVersion: 1,
          archivo: { create: { bytes: Buffer.from(acta.texto, 'utf8') } },
        },
      });

      await tx.actaAceptacion.create({
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
          ip: cabeceras.get('x-forwarded-for') ?? cabeceras.get('x-real-ip'),
          agente: cabeceras.get('user-agent'),
          pdfId: evidencia.id,
          actaHash: acta.hash,
        },
      });

      await tx.asignacion.update({
        where: { id: asignacion.id },
        data: { estado: 'REALIZADA', fechaCierre: aceptadoEn, cerradaPor: asignacion.personaId },
      });

      await registrar(tx, sesion, [
        {
          tabla: 'acta_aceptacion',
          registroId: codigo,
          campo: 'alta',
          anterior: null,
          nuevo: `${contenido.codigo} v${contenido.version} · ${acta.hash.slice(0, 12)}`,
          motivo: 'firma electrónica simple de aceptación',
        },
      ]);
    });

    revalidatePath('/mi-sig');
    revalidatePath('/mi-sig/historial');
    return {
      ok: true,
      mensaje: `Acta ${codigo} generada. Queda en tu historial con su huella.`,
      codigoActa: codigo,
    };
  });
}
