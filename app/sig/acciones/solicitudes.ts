'use server';

// app/sig/acciones/solicitudes.ts
//
// Los tres pasos: pide, autoriza, ejecuta. **De las tres cosas queda fecha**, y ninguna de
// las tres se puede reescribir después.
//
// Es el control más citado en los procedimientos y el que hoy vive en correos. Un correo no
// deja constancia de quién autorizó ni cuándo — deja constancia de que alguien escribió algo.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import {
  autorActual,
  autorConPermiso,
  ejecutar,
  exigirId,
  idOpcional,
  type Resultado,
} from '@/app/sgsi/acciones/sesion';
import { codigoSolicitud, puedeAutorizar } from '@/lib/sig/accesos';
import type { TipoSolicitud } from '@prisma/client';

export interface ResultadoSolicitud extends Resultado {
  codigo: string | null;
}

export interface DatosSolicitud {
  tipo: TipoSolicitud;
  titulo: string;
  detalle: string;
  justificacion: string;
  /// Sólo en permisos temporales (O14). Los dos o ninguno.
  vigenciaDesde?: Date;
  vigenciaHasta?: Date;
  esEmergencia?: boolean;
}

/// Paso 1 · pedir. **Abierto a cualquier persona autenticada**: pedir no es decidir, y
/// exigir permiso para pedir convierte la solicitud en el correo que esto viene a reemplazar.
export async function crearSolicitud(datos: DatosSolicitud): Promise<ResultadoSolicitud> {
  return ejecutar<ResultadoSolicitud>(async () => {
    const autor = await autorActual();
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.', codigo: null };

    if (datos.titulo.trim() === '') {
      return { ok: false, mensaje: 'Falta el título.', codigo: null };
    }
    if (datos.detalle.trim().length < 10) {
      return { ok: false, mensaje: 'Contá qué se pide, con detalle suficiente para autorizarlo.', codigo: null };
    }
    // **La justificación es obligatoria.** Quien autoriza decide sobre el porqué, no sobre
    // el qué: sin justificación la autorización es una firma en blanco.
    if (datos.justificacion.trim().length < 10) {
      return {
        ok: false,
        mensaje: 'Falta la justificación: quien autoriza decide sobre el porqué, no sobre el qué.',
        codigo: null,
      };
    }
    // Una vigencia a medias no es un permiso temporal: es un permiso permanente con una
    // fecha suelta que nadie va a mirar.
    if ((datos.vigenciaDesde === undefined) !== (datos.vigenciaHasta === undefined)) {
      return {
        ok: false,
        mensaje: 'Un permiso temporal necesita las dos fechas: desde cuándo y hasta cuándo.',
        codigo: null,
      };
    }
    if (
      datos.vigenciaDesde !== undefined &&
      datos.vigenciaHasta !== undefined &&
      datos.vigenciaHasta < datos.vigenciaDesde
    ) {
      return { ok: false, mensaje: 'La vigencia termina antes de empezar.', codigo: null };
    }

    const anio = new Date().getUTCFullYear();
    let codigo = '';
    await prisma.$transaction(async (tx) => {
      // Sin tabla de contador propia: el consecutivo sale del mayor código del año. Es la
      // misma numeración por año que el resto del sistema, y crear una tabla de contador
      // para esto sería una tabla que sólo existiría por simetría.
      const ultima = await tx.solicitud.findFirst({
        where: { codigo: { startsWith: `SOL-${anio}-` } },
        orderBy: { codigo: 'desc' },
        select: { codigo: true },
      });
      const siguiente = ultima === null ? 1 : Number(ultima.codigo.slice(-4)) + 1;
      codigo = codigoSolicitud(anio, siguiente);

      const creada = await tx.solicitud.create({
        data: {
          codigo,
          tipo: datos.tipo,
          titulo: datos.titulo.trim(),
          detalle: datos.detalle.trim(),
          justificacion: datos.justificacion.trim(),
          solicitanteId: persona.id,
          vigenciaDesde: datos.vigenciaDesde ?? null,
          vigenciaHasta: datos.vigenciaHasta ?? null,
          esEmergencia: datos.esEmergencia ?? false,
        },
      });
      await registrarAlta(tx, autor, 'solicitud', String(creada.id));
    });

    revalidatePath('/sgsi/solicitudes');
    return { ok: true, mensaje: `Creada como ${codigo}. Queda pendiente de autorización.`, codigo };
  });
}

/// Paso 2 · autorizar o rechazar. **O11 · quien autoriza no puede ser quien pide**, con la
/// única excepción del cambio de emergencia — que se marca como tal y queda contable.
export async function decidirSolicitud(
  codigo: string,
  datos: { autoriza: boolean; nota: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    const solicitud = await prisma.solicitud.findUnique({ where: { codigo } });
    if (!solicitud) return { ok: false, mensaje: 'La solicitud no existe.' };

    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };

    // La regla vive en el módulo puro y se consulta acá: la pantalla la muestra, el
    // servidor la impone. Una regla que sólo vive en la pantalla no es una regla.
    const veredicto = puedeAutorizar(
      {
        solicitanteId: solicitud.solicitanteId,
        esEmergencia: solicitud.esEmergencia,
        rechazada: solicitud.rechazada,
        fechaAutorizacion: solicitud.fechaAutorizacion,
      },
      persona.id,
    );
    if (!veredicto.puede) return { ok: false, mensaje: `No se puede: ${veredicto.motivo}.` };

    // **El rechazo exige motivo; la autorización también.** Una autorización sin nota no
    // se distingue de un clic, y es justo lo que un auditor va a pedir explicado.
    if (datos.nota.trim().length < 10) {
      return {
        ok: false,
        mensaje: datos.autoriza
          ? 'Escribí sobre qué autorizás: una autorización sin nota no se distingue de un clic.'
          : 'Un rechazo sin motivo deja a quien pidió sin saber qué hacer distinto.',
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.solicitud.update({
        where: { id: solicitud.id },
        data: datos.autoriza
          ? {
              autorizadoPorId: persona.id,
              fechaAutorizacion: new Date(),
              notaAutorizacion: datos.nota.trim(),
            }
          : {
              rechazada: true,
              autorizadoPorId: persona.id,
              fechaAutorizacion: new Date(),
              notaAutorizacion: datos.nota.trim(),
            },
      });
      await registrar(tx, autor, [
        {
          tabla: 'solicitud',
          registroId: solicitud.codigo,
          campo: 'autorización',
          anterior: null,
          nuevo: datos.autoriza ? 'AUTORIZADA' : 'RECHAZADA',
          motivo: datos.nota.trim(),
        },
      ]);
    });

    revalidatePath('/sgsi/solicitudes');
    return {
      ok: true,
      mensaje: datos.autoriza ? 'Autorizada. Queda pendiente de ejecución.' : 'Rechazada, con su motivo.',
    };
  });
}

/// Paso 3 · ejecutar. **No se ejecuta lo que no está autorizado**, ni lo rechazado. Es el
/// paso donde la separación de funciones deja de ser una intención y se vuelve una fecha.
export async function ejecutarSolicitud(
  codigo: string,
  datos: { nota: string; accesoPersonaId?: number; perfilId?: number },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    idOpcional(datos.accesoPersonaId, 'la persona del acceso');
    idOpcional(datos.perfilId, 'el perfil');

    const solicitud = await prisma.solicitud.findUnique({ where: { codigo } });
    if (!solicitud) return { ok: false, mensaje: 'La solicitud no existe.' };
    if (solicitud.rechazada) return { ok: false, mensaje: 'Está rechazada: no se ejecuta.' };
    if (solicitud.fechaAutorizacion === null) {
      return { ok: false, mensaje: 'Todavía no está autorizada. Primero autoriza quien corresponda.' };
    }
    if (solicitud.fechaEjecucion !== null) return { ok: false, mensaje: 'Ya está ejecutada.' };
    if (datos.nota.trim().length < 5) {
      return { ok: false, mensaje: 'Escribí qué se hizo al ejecutarla.' };
    }

    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.solicitud.update({
        where: { id: solicitud.id },
        data: {
          ejecutadoPorId: persona?.id ?? null,
          fechaEjecucion: new Date(),
          notaEjecucion: datos.nota.trim(),
        },
      });

      // **La solicitud de acceso crea la relación con vigencia** (O12), en la misma
      // transacción y con la solicitud como sustento. Es lo que hace que el acceso NO
      // aparezca después como «sin sustento» en la revisión (O13): el sustento nace acá,
      // no se le agrega después a mano.
      if (datos.accesoPersonaId !== undefined && datos.perfilId !== undefined) {
        exigirId(datos.accesoPersonaId, 'la persona del acceso');
        exigirId(datos.perfilId, 'el perfil');
        await tx.accesoPersona.create({
          data: {
            personaId: datos.accesoPersonaId,
            perfilId: datos.perfilId,
            // La vigencia del permiso temporal viaja al acceso: O14, «se retira solo al
            // vencer». Sin `vigenciaHasta` el acceso es permanente por diseño, que no es
            // lo mismo que un temporal al que se le olvidó la fecha.
            desde: solicitud.vigenciaDesde ?? new Date(),
            hasta: solicitud.vigenciaHasta ?? null,
            solicitudId: solicitud.id,
          },
        });
      }

      await registrar(tx, autor, [
        {
          tabla: 'solicitud',
          registroId: solicitud.codigo,
          campo: 'ejecución',
          anterior: null,
          nuevo: 'EJECUTADA',
          motivo: datos.nota.trim(),
        },
      ]);
    });

    revalidatePath('/sgsi/solicitudes');
    revalidatePath('/sgsi/accesos');
    return {
      ok: true,
      mensaje:
        datos.accesoPersonaId !== undefined && datos.perfilId !== undefined
          ? 'Ejecutada. El acceso quedó creado con esta solicitud como sustento.'
          : 'Ejecutada, con su fecha y su nota.',
    };
  });
}
