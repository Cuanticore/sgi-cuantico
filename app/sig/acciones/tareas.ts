'use server';

// app/sig/acciones/tareas.ts
//
// Aplica contra la base los planes que decidieron los módulos puros de lib/sig/. Acá no
// hay reglas de negocio: si una decisión se puede probar, vive en el módulo puro.
//
// Todo ocurre en una transacción con la bitácora adentro (regla transversal 07): una
// generación a medias que no dejó rastro es exactamente el artefacto que una auditoría
// busca.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, exigirId, idOpcional, type Resultado } from '@/app/sgsi/acciones/sesion';
import { correrTrabajo } from '@/lib/sig/trabajos';

export interface ResultadoGeneracion extends Resultado {
  creadas: number;
}

/// El botón «Generar asignaciones» de la pantalla de obligaciones.
///
/// El cuerpo vive en `lib/sig/trabajos.ts`, que es el mismo núcleo que corre el cron: una
/// segunda implementación de la generación es una que mañana abre periodos distintos según
/// quién la haya disparado. Acá queda la compuerta de permiso, que es lo que esta capa
/// aporta y lo que el cron no necesita porque ya se autenticó con su secreto.
///
/// Queda registrado como ejecución igual que la corrida automática, con `invocadoPor` en el
/// correo de quien apretó: un trabajo corrido a mano y uno del cron se tienen que poder
/// distinguir cuando algo salió mal.
export async function generarAsignaciones(): Promise<ResultadoGeneracion> {
  return ejecutar<ResultadoGeneracion>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    const corrida = await correrTrabajo('generar-asignaciones', autor, autor);
    if (corrida.resultado !== 'EXITOSO') {
      return {
        ok: false,
        mensaje: `La generación falló: ${corrida.error ?? 'sin detalle'}`,
        creadas: 0,
      };
    }
    revalidatePath('/sig/obligaciones');
    return {
      ok: true,
      mensaje:
        corrida.creados === 0
          ? 'No hay asignaciones nuevas por generar.'
          : `Generación completada: ${corrida.creados} asignación(es) nueva(s).`,
      creadas: corrida.creados,
    };
  });
}

import { validarCierre, esExtemporaneo, aprobadoDe, type RespuestaCierre } from '@/lib/sig/cierre';
import { autorActual } from '@/app/sgsi/acciones/sesion';
import { registrarBaja } from '@/lib/sgsi/bitacora';

export interface DatosCerrar {
  versionLeida?: string;
  asistio?: boolean;
  calificacion?: number;
  nota?: string;
  respuestas?: { itemId: number; respuesta: 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA'; nota?: string }[];
  /// Motivo obligatorio en el cierre administrativo (R5).
  motivo?: string;
  /// Anexo opcional (TAREA y CAPACITACION): se guarda como Evidencia con registroId.
  archivo?: { nombre: string; mime: string; bytes: number[] };
}

export interface ResultadoCierre extends Resultado {
  extemporaneo: boolean;
  administrativo: boolean;
}

/// La persona asignada cierra lo suyo; un miembro de `operacion:administrar` puede
/// cerrar cualquier asignación, con motivo (R5). El registro es inmutable: se crea,
/// nunca se edita.
export async function cerrarAsignacion(
  id: number,
  datos: DatosCerrar,
): Promise<ResultadoCierre> {
  return ejecutar<ResultadoCierre>(async () => {
    const sesion = await autorActual();
    const asignacion = await prisma.asignacion.findUnique({
      where: { id },
      include: {
        contenido: true,
        persona: true,
        obligacion: { include: { contenido: true } },
      },
    });
    if (!asignacion) return { ok: false, mensaje: 'La asignación no existe.', extemporaneo: false, administrativo: false };

    const contenido = asignacion.contenido ?? asignacion.obligacion?.contenido;
    if (!contenido) return { ok: false, mensaje: 'La asignación no tiene contenido.', extemporaneo: false, administrativo: false };

    const esAdministrativo = asignacion.persona.correo !== sesion;
    if (esAdministrativo) {
      await autorConPermiso('operacion:administrar');
      if (!datos.motivo?.trim()) {
        return { ok: false, mensaje: 'El cierre administrativo exige motivo.', extemporaneo: false, administrativo: true };
      }
    }

    // R4: los flags de obligatoriedad salen del contenido, no del cliente. Un ítem que
    // no pertenece a la verificación se rechaza antes de validar.
    let respuestasValidadas: RespuestaCierre[] | undefined;
    if (contenido.tipo === 'VERIFICACION') {
      const items = await prisma.itemVerificacion.findMany({ where: { contenidoId: contenido.id } });
      const porItem = new Map(items.map((i) => [i.id, i]));
      const ajenos = (datos.respuestas ?? []).filter((r) => !porItem.has(r.itemId));
      if (ajenos.length > 0) {
        return {
          ok: false,
          mensaje: 'Hay respuestas para ítems que no pertenecen a esta verificación.',
          extemporaneo: false,
          administrativo: esAdministrativo,
        };
      }
      respuestasValidadas = (datos.respuestas ?? []).map((r) => {
        const item = porItem.get(r.itemId)!;
        return {
          itemId: r.itemId,
          obligatorio: item.obligatorio,
          permiteNoAplica: item.permiteNoAplica,
          respuesta: r.respuesta,
          nota: r.nota,
        };
      });
    }

    const errores = validarCierre({
      tipo: contenido.tipo,
      versionLeida: datos.versionLeida,
      asistio: datos.asistio,
      calificacion: datos.calificacion,
      exigeEvaluacion: contenido.exigeEvaluacion,
      notaMinima: contenido.notaMinima ? Number(contenido.notaMinima) : null,
      nota: datos.nota,
      respuestas: respuestasValidadas,
    });
    if (errores.length > 0) {
      return { ok: false, mensaje: errores.join('. '), extemporaneo: false, administrativo: esAdministrativo };
    }

    const ahora = new Date();
    const extemporaneo = esExtemporaneo(ahora, asignacion.fechaLimite);

    await prisma.$transaction(async (tx) => {
      const personaQueCierra = esAdministrativo
        ? await tx.persona.findUnique({ where: { correo: sesion }, select: { id: true } })
        : null;

      const registro = await tx.registroRealizado.create({
        data: {
          asignacionId: asignacion.id,
          nota: datos.nota,
          versionLeida: contenido.tipo === 'LECTURA' ? datos.versionLeida : null,
          // D6 · el acuse apunta a la FILA de la versión, no a su número. Con sólo el
          // número, «leí la versión 1» era una afirmación que nadie podía verificar
          // porque el texto de la 1 se había sobreescrito. Se resuelve contra la versión
          // VIGENTE del contenido al cerrar, que es la que la persona tenía delante.
          versionContenidoId:
            contenido.tipo === 'LECTURA'
              ? (
                  await tx.versionContenido.findUnique({
                    where: {
                      contenidoId_version: { contenidoId: contenido.id, version: contenido.version },
                    },
                    select: { id: true },
                  })
                )?.id ?? null
              : null,
          asistio: contenido.tipo === 'CAPACITACION' ? datos.asistio : null,
          calificacion: contenido.tipo === 'CAPACITACION' ? datos.calificacion : null,
          aprobado:
            contenido.tipo === 'CAPACITACION'
              ? aprobadoDe(datos.calificacion, contenido.notaMinima ? Number(contenido.notaMinima) : null)
              : null,
          respuestas:
            contenido.tipo === 'VERIFICACION' && datos.respuestas
              ? {
                  create: datos.respuestas.map((r) => ({
                    itemId: r.itemId,
                    respuesta: r.respuesta,
                    nota: r.nota,
                  })),
                }
              : undefined,
        },
      });

      // Anexo del SIG: reusa Evidencia con registroId (decisión 3.8.2), en la misma
      // transacción — un cierre con anexo no puede quedar a medias.
      if (datos.archivo) {
        await tx.evidencia.create({
          data: {
            registroId: registro.id,
            tipo: 'ARCHIVO',
            texto: datos.archivo.nombre,
            creadaPor: sesion,
            archivoNombre: datos.archivo.nombre,
            archivoMime: datos.archivo.mime,
            archivoTamano: datos.archivo.bytes.length,
            archivoSha256: null,
            archivoVersion: 1,
            archivo: {
              create: { bytes: Buffer.from(datos.archivo.bytes) },
            },
          },
        });
      }

      await tx.asignacion.update({
        where: { id: asignacion.id },
        data: {
          estado: 'REALIZADA',
          fechaCierre: ahora,
          cerradaPor: personaQueCierra?.id ?? asignacion.personaId,
          motivo: esAdministrativo ? datos.motivo : null,
        },
      });

      await registrar(tx, sesion, [
        {
          tabla: 'asignacion',
          registroId: String(asignacion.id),
          campo: 'estado',
          anterior: 'PENDIENTE',
          nuevo: 'REALIZADA',
          motivo: esAdministrativo ? `cierre administrativo · ${datos.motivo}` : 'cierre propio',
        },
      ]);
    });

    return {
      ok: true,
      mensaje: esAdministrativo
        ? `Cierre administrativo registrado${extemporaneo ? ' (extemporáneo)' : ''}.`
        : `Cierre registrado${extemporaneo ? ' (extemporáneo)' : ''}.`,
      extemporaneo,
      administrativo: esAdministrativo,
    };
  });
}

/// R8: reabrir no sobrescribe. El registro anterior se conserva; el próximo cierre crea
/// uno nuevo. Exige motivo y bitácora con el valor anterior.
export async function reabrirAsignacion(id: number, motivo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    if (!motivo.trim()) return { ok: false, mensaje: 'La reapertura exige motivo.' };

    const asignacion = await prisma.asignacion.findUnique({ where: { id } });
    if (!asignacion) return { ok: false, mensaje: 'La asignación no existe.' };
    if (asignacion.estado !== 'REALIZADA') {
      return { ok: false, mensaje: 'Solo se reabre una asignación realizada.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.asignacion.update({
        where: { id },
        data: { estado: 'PENDIENTE', fechaCierre: null, cerradaPor: null, motivo: null },
      });
      await registrar(tx, autor, [
        {
          tabla: 'asignacion',
          registroId: String(id),
          campo: 'estado',
          anterior: 'REALIZADA',
          nuevo: 'PENDIENTE',
          motivo,
        },
      ]);
    });

    return { ok: true, mensaje: 'Asignación reabierta. El registro anterior se conserva.' };
  });
}

/// R6: prorrogar deja huella. Cambia la fecha límite con motivo obligatorio y valor
/// anterior en bitácora: el hecho de haber prorrogado no desaparece.
export async function prorrogarAsignacion(
  id: number,
  nuevaFechaLimite: Date,
  motivo: string,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    if (!motivo.trim()) return { ok: false, mensaje: 'La prórroga exige motivo.' };

    const asignacion = await prisma.asignacion.findUnique({ where: { id } });
    if (!asignacion) return { ok: false, mensaje: 'La asignación no existe.' };
    if (asignacion.estado !== 'PENDIENTE') {
      return { ok: false, mensaje: 'Solo se prorroga una asignación pendiente.' };
    }
    if (nuevaFechaLimite <= asignacion.fechaLimite) {
      return { ok: false, mensaje: 'La nueva fecha límite debe ser posterior a la actual.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.asignacion.update({
        where: { id },
        data: { fechaLimite: nuevaFechaLimite },
      });
      await registrar(tx, autor, [
        {
          tabla: 'asignacion',
          registroId: String(id),
          campo: 'fecha_limite',
          anterior: asignacion.fechaLimite,
          nuevo: nuevaFechaLimite,
          motivo,
        },
      ]);
    });

    return { ok: true, mensaje: 'Fecha límite prorrogada.' };
  });
}

/// R7: anular exige motivo. Nunca hay borrado físico.
export async function anularAsignacion(id: number, motivo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    if (!motivo.trim()) return { ok: false, mensaje: 'La anulación exige motivo.' };

    const asignacion = await prisma.asignacion.findUnique({ where: { id } });
    if (!asignacion) return { ok: false, mensaje: 'La asignación no existe.' };
    if (asignacion.estado !== 'PENDIENTE') {
      return { ok: false, mensaje: 'Solo se anula una asignación pendiente.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.asignacion.update({
        where: { id },
        data: { estado: 'ANULADA', motivo },
      });
      await registrar(tx, autor, [
        {
          tabla: 'asignacion',
          registroId: String(id),
          campo: 'estado',
          anterior: 'PENDIENTE',
          nuevo: 'ANULADA',
          motivo,
        },
      ]);
    });

    return { ok: true, mensaje: 'Asignación anulada.' };
  });
}

/// R7: «no aplica» exige motivo. Lo pide quien tiene la asignación o quien escribe en
/// Operación.
export async function noAplicaAsignacion(id: number, motivo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const sesion = await autorActual();
    const asignacion = await prisma.asignacion.findUnique({
      where: { id },
      include: { persona: true },
    });
    if (!asignacion) return { ok: false, mensaje: 'La asignación no existe.' };
    if (asignacion.estado !== 'PENDIENTE') {
      return { ok: false, mensaje: 'Solo una asignación pendiente puede marcarse como no aplica.' };
    }
    if (asignacion.persona.correo !== sesion) {
      await autorConPermiso('operacion:escribir');
    }
    if (!motivo.trim()) return { ok: false, mensaje: 'El motivo es obligatorio.' };

    await prisma.$transaction(async (tx) => {
      await tx.asignacion.update({
        where: { id },
        data: { estado: 'NO_APLICA', motivo },
      });
      await registrar(tx, sesion, [
        {
          tabla: 'asignacion',
          registroId: String(id),
          campo: 'estado',
          anterior: 'PENDIENTE',
          nuevo: 'NO_APLICA',
          motivo,
        },
      ]);
    });

    return { ok: true, mensaje: 'Asignación marcada como no aplica.' };
  });
}

/// R9: reasignar no cierra nada: la asignación abierta pasa a otra persona, con motivo.
export async function reasignarAsignacion(
  id: number,
  nuevaPersonaId: number,
  motivo: string,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    exigirId(nuevaPersonaId, 'la persona a la que se reasigna');
    if (!motivo.trim()) return { ok: false, mensaje: 'La reasignación exige motivo.' };

    const asignacion = await prisma.asignacion.findUnique({ where: { id } });
    if (!asignacion) return { ok: false, mensaje: 'La asignación no existe.' };
    if (asignacion.estado !== 'PENDIENTE') {
      return { ok: false, mensaje: 'Solo se reasigna una asignación pendiente.' };
    }
    const persona = await prisma.persona.findUnique({ where: { id: nuevaPersonaId } });
    if (!persona) return { ok: false, mensaje: 'La persona destino no existe.' };
    if (!persona.activa) return { ok: false, mensaje: 'La persona destino está inactiva.' };

    await prisma.$transaction(async (tx) => {
      await tx.asignacion.update({
        where: { id },
        data: { personaId: nuevaPersonaId },
      });
      await registrar(tx, autor, [
        {
          tabla: 'asignacion',
          registroId: String(id),
          campo: 'persona_id',
          anterior: asignacion.personaId,
          nuevo: nuevaPersonaId,
          motivo,
        },
      ]);
    });

    return { ok: true, mensaje: 'Asignación reasignada.' };
  });
}

import { registrarAlta } from '@/lib/sgsi/bitacora';
import {
  cambiaElTexto,
  planificarItems,
  versionTrasEditar,
  type ItemPropuesto,
} from '@/lib/sig/contenidos';

/// El prefijo del código por tipo. `VERIFICACION` es `LVE` —lista de verificación— y no
/// `VER`, porque así se nombran en el repositorio documental de Cuántico.
const PREFIJO_CODIGO: Record<DatosContenido['tipo'], string> = {
  CAPACITACION: 'CAP',
  LECTURA: 'LEC',
  VERIFICACION: 'LVE',
  TAREA: 'TAR',
};

export interface DatosContenido {
  tipo: 'CAPACITACION' | 'LECTURA' | 'VERIFICACION' | 'TAREA';
  titulo: string;
  descripcion: string;
  procedimientoOrigen?: string;
  documentoCodigo?: string;
  documentoNombre?: string;
  documentoVersion?: string;
  documentoUrl?: string;
  duracionHoras?: number;
  modalidad?: string;
  exigeEvaluacion?: boolean;
  notaMinima?: number;
  items?: { texto: string; obligatorio: boolean; permiteNoAplica: boolean }[];
}

function validarDatosContenido(datos: DatosContenido): string[] {
  const errores: string[] = [];
  if (!datos.titulo.trim()) errores.push('el título es obligatorio');
  if (datos.tipo === 'LECTURA' && !datos.documentoVersion?.trim()) {
    errores.push('la versión del documento es obligatoria');
  }
  if (datos.tipo === 'VERIFICACION' && (!datos.items || datos.items.length === 0)) {
    errores.push('una verificación necesita al menos un ítem');
  }
  return errores;
}

/// R10: editar un contenido que ya generó asignaciones sube su versión; los registros
/// cerrados conservan la versión que se realizó.
export async function crearContenido(datos: DatosContenido): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    const errores = validarDatosContenido(datos);
    if (errores.length > 0) return { ok: false, mensaje: errores.join('. ') };

    // Quién publica la versión. `null` cuando la cuenta que edita no está en el censo: es
    // un dato que falta, y poner a otro sería firmar el documento en su nombre.
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      const contador = await tx.contadorContenido.upsert({
        where: { tipo: datos.tipo },
        update: { ultimoValor: { increment: 1 } },
        create: { tipo: datos.tipo, ultimoValor: 1 },
      });
      const codigo = `${PREFIJO_CODIGO[datos.tipo]}-${String(contador.ultimoValor).padStart(3, '0')}`;

      const creado = await tx.contenidoSig.create({
        data: {
          codigo,
          tipo: datos.tipo,
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          procedimientoOrigen: datos.procedimientoOrigen ?? null,
          documentoCodigo: datos.documentoCodigo ?? null,
          documentoNombre: datos.documentoNombre ?? null,
          documentoVersion: datos.documentoVersion ?? null,
          documentoUrl: datos.documentoUrl ?? null,
          duracionHoras: datos.duracionHoras ?? null,
          modalidad: datos.modalidad ?? null,
          exigeEvaluacion: datos.exigeEvaluacion ?? false,
          notaMinima: datos.notaMinima ?? null,
          items:
            datos.tipo === 'VERIFICACION'
              ? {
                  create: (datos.items ?? []).map((item, i) => ({
                    orden: i + 1,
                    texto: item.texto,
                    obligatorio: item.obligatorio,
                    permiteNoAplica: item.permiteNoAplica,
                  })),
                }
              : undefined,
        },
      });
      // La v1 nace con el contenido, en la MISMA transacción. Un contenido sin fila de
      // versión es uno cuyo primer acuse de lectura no tendría contra qué verificarse, y
      // eso no se descubre hasta la auditoría.
      await tx.versionContenido.create({
        data: {
          contenidoId: creado.id,
          version: creado.version,
          titulo: creado.titulo,
          descripcion: creado.descripcion,
          documentoCodigo: creado.documentoCodigo,
          documentoNombre: creado.documentoNombre,
          documentoVersion: creado.documentoVersion,
          documentoUrl: creado.documentoUrl,
          publicadaPorId: persona?.id ?? null,
        },
      });
      await registrarAlta(tx, autor, 'contenido_sig', String(creado.id));
    });

    return { ok: true, mensaje: 'Contenido creado.' };
  });
}

export interface DatosEditarContenido extends Omit<Partial<DatosContenido>, 'items'> {
  /// Los ítems COMPLETOS de la lista, en el orden que quedan. Con `id` se edita el que
  /// existe; sin `id` se crea. Lo que no venga se borra —si nadie lo respondió.
  items?: ItemPropuesto[];
}

/// R10: si el contenido ya tiene asignaciones, la edición sube la versión; los acuses
/// previos conservan la versión que se realizó.
export async function editarContenido(id: number, datos: DatosEditarContenido): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    exigirId(id, 'el contenido');
    const contenido = await prisma.contenidoSig.findUnique({
      where: { id },
      include: {
        _count: { select: { obligaciones: true } },
        items: {
          orderBy: { orden: 'asc' },
          include: { _count: { select: { respuestas: true } } },
        },
      },
    });
    if (!contenido) return { ok: false, mensaje: 'El contenido no existe.' };

    // D6 · el versionado no invalida. La versión sube sólo si el contenido ya generó
    // obligaciones (R10) Y si cambió algo que la persona LEE: si sólo cambió la modalidad o
    // la duración, el texto leído es el mismo y pedir un acuse nuevo sobre un documento
    // idéntico es ruido que entrena a la gente a firmar sin leer.
    const conAsignaciones = contenido._count.obligaciones > 0;
    const textoCambio = cambiaElTexto(contenido, datos);
    const version = versionTrasEditar(contenido.version, conAsignaciones && textoCambio);
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });

    // Los ítems los decide el módulo puro. La regla que protege es que un ítem ya
    // respondido no se borra: esa respuesta es la evidencia de que la verificación se
    // hizo, y sin el ítem la lista deja de explicar qué se verificó.
    const plan =
      datos.items === undefined
        ? null
        : planificarItems(
            contenido.items.map((i) => ({
              id: i.id,
              orden: i.orden,
              texto: i.texto,
              obligatorio: i.obligatorio,
              permiteNoAplica: i.permiteNoAplica,
              respuestas: i._count.respuestas,
            })),
            datos.items,
          );
    if (plan && plan.errores.length > 0) {
      return { ok: false, mensaje: plan.errores.join('. ') };
    }

    await prisma.$transaction(async (tx) => {
      const nuevoTexto = {
        titulo: datos.titulo ?? contenido.titulo,
        descripcion: datos.descripcion ?? contenido.descripcion,
        documentoCodigo: datos.documentoCodigo ?? contenido.documentoCodigo,
        documentoNombre: datos.documentoNombre ?? contenido.documentoNombre,
        documentoVersion: datos.documentoVersion ?? contenido.documentoVersion,
        documentoUrl: datos.documentoUrl ?? contenido.documentoUrl,
      };

      if (version > contenido.version) {
        // Nace una fila NUEVA. Las anteriores no se tocan: es lo que hace que un acuse de
        // hace seis meses siga siendo verificable contra el texto que esa persona leyó, y
        // por eso el `update` de abajo ya no destruye nada.
        await tx.versionContenido.create({
          data: { contenidoId: id, version, ...nuevoTexto, publicadaPorId: persona?.id ?? null },
        });
      } else {
        // Corrección de la versión vigente: un contenido sin obligaciones, o un cambio que
        // no toca el texto. Publicar una v1 idéntica dos veces llenaría el historial de
        // versiones que nadie leyó y que no se distinguen entre sí.
        //
        // `upsert` y no `update`: un contenido cargado antes de esta migración podría no
        // tener su fila si la migración corrió a medias, y un fallo acá dejaría el
        // contenido editado sin versión — el defecto que este cambio vino a cerrar.
        await tx.versionContenido.upsert({
          where: { contenidoId_version: { contenidoId: id, version } },
          update: nuevoTexto,
          create: { contenidoId: id, version, ...nuevoTexto, publicadaPorId: persona?.id ?? null },
        });
      }

      await tx.contenidoSig.update({
        where: { id },
        data: {
          ...(datos.titulo !== undefined && { titulo: datos.titulo }),
          ...(datos.descripcion !== undefined && { descripcion: datos.descripcion }),
          ...(datos.procedimientoOrigen !== undefined && { procedimientoOrigen: datos.procedimientoOrigen }),
          ...(datos.documentoCodigo !== undefined && { documentoCodigo: datos.documentoCodigo }),
          ...(datos.documentoNombre !== undefined && { documentoNombre: datos.documentoNombre }),
          ...(datos.documentoVersion !== undefined && { documentoVersion: datos.documentoVersion }),
          ...(datos.documentoUrl !== undefined && { documentoUrl: datos.documentoUrl }),
          ...(datos.duracionHoras !== undefined && { duracionHoras: datos.duracionHoras }),
          ...(datos.modalidad !== undefined && { modalidad: datos.modalidad }),
          ...(datos.exigeEvaluacion !== undefined && { exigeEvaluacion: datos.exigeEvaluacion }),
          ...(datos.notaMinima !== undefined && { notaMinima: datos.notaMinima }),
          version,
        },
      });

      if (plan) {
        // El orden se libera antes de reasignarlo. La unique (contenidoId, orden) no
        // deja pasar un intercambio directo: mover el 2 al 1 choca con el 1 que todavía
        // está ahí, y un `update` por ítem falla a mitad de camino. Los negativos son
        // libres porque `orden` siempre se escribe positivo.
        for (const a of plan.actualizar) {
          await tx.itemVerificacion.update({ where: { id: a.id }, data: { orden: -a.orden } });
        }
        for (const idBorrar of plan.borrar) {
          await tx.itemVerificacion.delete({ where: { id: idBorrar } });
        }
        for (const a of plan.actualizar) {
          await tx.itemVerificacion.update({
            where: { id: a.id },
            data: {
              orden: a.orden,
              texto: a.texto,
              obligatorio: a.obligatorio,
              permiteNoAplica: a.permiteNoAplica,
            },
          });
        }
        for (const c of plan.crear) {
          await tx.itemVerificacion.create({ data: { contenidoId: id, ...c } });
        }
      }

      await registrar(tx, autor, [
        {
          tabla: 'contenido_sig',
          registroId: String(id),
          campo: 'version',
          anterior: contenido.version,
          nuevo: version,
          motivo: conAsignaciones
            ? 'edición de contenido publicado: sube la versión'
            : 'edición sin asignaciones: la versión no cambia',
        },
        ...(plan && plan.crear.length + plan.borrar.length > 0
          ? [
              {
                tabla: 'contenido_sig',
                registroId: String(id),
                campo: 'items',
                anterior: contenido.items.length,
                nuevo: plan.actualizar.length + plan.crear.length,
                motivo: `${plan.crear.length} ítem(s) agregado(s), ${plan.borrar.length} quitado(s)`,
              },
            ]
          : []),
      ]);
    });

    const itemsDichos =
      plan && plan.crear.length + plan.borrar.length > 0
        ? ` ${plan.crear.length} ítem(s) agregado(s), ${plan.borrar.length} quitado(s).`
        : '';
    return {
      ok: true,
      mensaje:
        (conAsignaciones ? 'Contenido editado: la versión subió.' : 'Contenido editado.') +
        itemsDichos,
    };
  });
}

/// «Duplicar» del lienzo: copia el contenido con un código nuevo y la versión en 1.
///
/// No copia las obligaciones. Duplicar sirve para partir de algo parecido —una lista de
/// verificación de respaldos que se adapta a otro sistema—, y un duplicado que arrastra
/// las obligaciones del original le generaría asignaciones a gente que nadie decidió
/// incluir. La copia nace sin asignar.
export async function duplicarContenido(id: number): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    exigirId(id, 'el contenido');

    const original = await prisma.contenidoSig.findUnique({
      where: { id },
      include: { items: { orderBy: { orden: 'asc' } } },
    });
    if (!original) return { ok: false, mensaje: 'El contenido no existe.' };

    let codigo = '';
    await prisma.$transaction(async (tx) => {
      const contador = await tx.contadorContenido.upsert({
        where: { tipo: original.tipo },
        update: { ultimoValor: { increment: 1 } },
        create: { tipo: original.tipo, ultimoValor: 1 },
      });
      codigo = `${PREFIJO_CODIGO[original.tipo]}-${String(contador.ultimoValor).padStart(3, '0')}`;

      const copia = await tx.contenidoSig.create({
        data: {
          codigo,
          tipo: original.tipo,
          // El título dice que es una copia. Dos filas con el mismo título en una lista de
          // 24 es la forma más rápida de editar la equivocada.
          titulo: `${original.titulo} (copia)`,
          descripcion: original.descripcion,
          procedimientoOrigen: original.procedimientoOrigen,
          documentoCodigo: original.documentoCodigo,
          documentoNombre: original.documentoNombre,
          documentoVersion: original.documentoVersion,
          documentoUrl: original.documentoUrl,
          duracionHoras: original.duracionHoras,
          modalidad: original.modalidad,
          exigeEvaluacion: original.exigeEvaluacion,
          notaMinima: original.notaMinima,
          items: {
            create: original.items.map((i) => ({
              orden: i.orden,
              texto: i.texto,
              obligatorio: i.obligatorio,
              permiteNoAplica: i.permiteNoAplica,
            })),
          },
        },
      });
      await registrarAlta(tx, autor, 'contenido_sig', String(copia.id));
      await registrar(tx, autor, [
        {
          tabla: 'contenido_sig',
          registroId: String(copia.id),
          campo: 'codigo',
          anterior: original.codigo,
          nuevo: codigo,
          motivo: `duplicado de ${original.codigo}`,
        },
      ]);
    });

    return { ok: true, mensaje: `Creado ${codigo} como copia de ${original.codigo}.` };
  });
}

export interface DatosObligacion {
  contenidoId: number;
  alcance: 'PERSONA' | 'CARGO' | 'AREA' | 'TODOS' | 'ACTIVO' | 'TIPO_ACTIVO' | 'NIVEL_ACTIVO';
  alcancePersonaId?: number;
  alcanceCargoId?: number;
  alcanceAreaId?: number;
  alcanceActivoId?: number;
  alcanceTipoActivoId?: number;
  alcanceNivelActivoId?: number;
  periodicidad: 'UNICA' | 'DIARIA' | 'SEMANAL' | 'MENSUAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';
  fechaInicio: Date;
  plazoDias: number;
  diasAviso: number;
  notificar?: boolean;
  responsableSeguimientoId: number;
}

/// El tipo dice que `contenidoId` y `responsableSeguimientoId` son obligatorios, pero eso
/// solo vale en compilación: los datos llegan de un formulario, y un `<select>` sin opciones
/// —porque el catálogo está vacío— manda `undefined`. Sin esta comprobación ese `undefined`
/// viajaba hasta Prisma, que respondía «Argument `id` is missing» con el nombre del módulo
/// empaquetado a cuestas. Un error de base de datos crudo en pantalla no le dice a nadie que
/// primero hay que crear un contenido.
function validarDatosObligacion(datos: DatosObligacion): string[] {
  const errores: string[] = [];
  if (!Number.isInteger(datos.contenidoId) || datos.contenidoId <= 0) {
    errores.push('elegí el contenido de la obligación');
  }
  if (!Number.isInteger(datos.responsableSeguimientoId) || datos.responsableSeguimientoId <= 0) {
    errores.push('elegí quién responde por el seguimiento');
  }
  if (!(datos.fechaInicio instanceof Date) || Number.isNaN(datos.fechaInicio.getTime())) {
    errores.push('la fecha de inicio no es válida');
  }
  if (!Number.isFinite(datos.plazoDias) || datos.plazoDias <= 0) {
    errores.push('el plazo debe ser positivo');
  }
  if (!Number.isFinite(datos.diasAviso) || datos.diasAviso < 0) {
    errores.push('los días de aviso no pueden ser negativos');
  }
  // R4: exactamente UN destino, y ahora hay seis columnas donde puede estar. Contarlas
  // todas juntas es lo que impide que una obligación quede con dos destinos —por ejemplo,
  // un área Y un tipo de activo— y que la generación tenga que elegir uno en silencio.
  const destinos = [
    datos.alcancePersonaId,
    datos.alcanceCargoId,
    datos.alcanceAreaId,
    datos.alcanceActivoId,
    datos.alcanceTipoActivoId,
    datos.alcanceNivelActivoId,
  ].filter((v) => v !== undefined);
  if (datos.alcance !== 'TODOS' && destinos.length !== 1) {
    errores.push('el alcance exige exactamente un destino');
  }
  if (datos.alcance === 'TODOS' && destinos.length !== 0) {
    errores.push('el alcance TODOS no lleva destino');
  }
  // Y el destino tiene que ser el de SU columna. Sin esto, un alcance `TIPO_ACTIVO` con
  // `alcanceAreaId` puesto pasaba la cuenta de arriba y la generación no encontraba
  // ningún activo: la obligación quedaba creada y sin generar nada, en silencio.
  const columnaDe: Record<string, number | undefined> = {
    PERSONA: datos.alcancePersonaId,
    CARGO: datos.alcanceCargoId,
    AREA: datos.alcanceAreaId,
    ACTIVO: datos.alcanceActivoId,
    TIPO_ACTIVO: datos.alcanceTipoActivoId,
    NIVEL_ACTIVO: datos.alcanceNivelActivoId,
  };
  if (datos.alcance !== 'TODOS' && columnaDe[datos.alcance] === undefined) {
    errores.push(`el alcance ${datos.alcance} exige su propio destino, no el de otro alcance`);
  }
  // `NivelActivo` es de REQ-SIG-06 y no existe. Se rechaza al CREAR y no sólo al generar:
  // una obligación que nunca va a producir nada no debería poder guardarse.
  if (datos.alcance === 'NIVEL_ACTIVO') {
    errores.push(
      'el alcance por nivel de activo necesita la jerarquía de niveles (REQ-SIG-06), que ' +
        'todavía no está construida',
    );
  }
  return errores;
}

export async function crearObligacion(datos: DatosObligacion): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    const errores = validarDatosObligacion(datos);
    if (errores.length > 0) return { ok: false, mensaje: errores.join('. ') };

    const contenido = await prisma.contenidoSig.findUnique({ where: { id: datos.contenidoId } });
    if (!contenido) return { ok: false, mensaje: 'El contenido no existe.' };

    await prisma.$transaction(async (tx) => {
      const creada = await tx.obligacion.create({
        data: {
          contenidoId: datos.contenidoId,
          alcance: datos.alcance,
          alcancePersonaId: datos.alcancePersonaId ?? null,
          alcanceCargoId: datos.alcanceCargoId ?? null,
          alcanceAreaId: datos.alcanceAreaId ?? null,
          alcanceActivoId: datos.alcanceActivoId ?? null,
          alcanceTipoActivoId: datos.alcanceTipoActivoId ?? null,
          alcanceNivelActivoId: datos.alcanceNivelActivoId ?? null,
          periodicidad: datos.periodicidad,
          fechaInicio: datos.fechaInicio,
          plazoDias: datos.plazoDias,
          diasAviso: datos.diasAviso,
          notificar: datos.notificar ?? true,
          responsableSeguimientoId: datos.responsableSeguimientoId,
        },
      });
      await registrarAlta(tx, autor, 'obligacion', String(creada.id));
    });

    return { ok: true, mensaje: 'Obligación creada. Genera asignaciones en la próxima corrida.' };
  });
}

/// R11: desactivar deja de generar periodos nuevos y no toca los ya generados.
export async function desactivarObligacion(id: number, motivo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    exigirId(id, 'la obligación');
    if (!motivo.trim()) return { ok: false, mensaje: 'La desactivación exige motivo.' };

    const obligacion = await prisma.obligacion.findUnique({ where: { id } });
    if (!obligacion) return { ok: false, mensaje: 'La obligación no existe.' };

    await prisma.$transaction(async (tx) => {
      await tx.obligacion.update({ where: { id }, data: { activa: false } });
      await registrarBaja(tx, autor, 'obligacion', String(id), motivo);
    });

    return { ok: true, mensaje: 'Obligación desactivada. Las asignaciones ya generadas no cambian.' };
  });
}