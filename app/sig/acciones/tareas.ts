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
import {
  validarDatosObligacion,
  type DatosObligacion,
} from '@/lib/sig/obligacion-validacion';
import { registrar } from '@/lib/sgsi/bitacora';
import {
  periodoDeFechaLimite,
  validarAsignacionManual,
  type DatosAsignacionManual,
} from '@/lib/sig/asignacion-manual';
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

import {
  validarCierre,
  cierraLaAsignacion,
  elCursoCierraSolo,
  esExtemporaneo,
  aprobadoDe,
  type RespuestaCierre,
} from '@/lib/sig/cierre';
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

/// REQ-SIG-26 · `crearContenido` devuelve además QUÉ creó. El alta de un curso virtual de
/// clase paquete encadena `crearContenido` + `subirPaqueteScorm`, y la segunda necesita el
/// id de la primera; el código, además, es lo que el aviso nombra cuando el zip no pasa y
/// el contenido sí quedó.
export interface ResultadoCreacion extends Resultado {
  id?: number;
  codigo?: string;
}

export interface ResultadoCierre extends Resultado {
  extemporaneo: boolean;
  administrativo: boolean;
  /// Un cierre puede ser válido y aun así no cerrar: capacitación reprobada registra el
  /// intento y deja la asignación abierta. `ok` dice que se aceptó; esto, si quedó cerrada.
  cerrada: boolean;
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
    if (!asignacion) return { ok: false, mensaje: 'La asignación no existe.', extemporaneo: false, administrativo: false, cerrada: false };

    const contenido = asignacion.contenido ?? asignacion.obligacion?.contenido;
    if (!contenido) return { ok: false, mensaje: 'La asignación no tiene contenido.', extemporaneo: false, administrativo: false, cerrada: false };

    const esAdministrativo = asignacion.persona.correo !== sesion;
    if (esAdministrativo) {
      await autorConPermiso('operacion:administrar');
      if (!datos.motivo?.trim()) {
        return { ok: false, mensaje: 'El cierre administrativo exige motivo.', extemporaneo: false, administrativo: true, cerrada: false };
      }
    }

    // P14 · la compuerta real va en el servidor. Retirar el formulario de la pantalla no
    // alcanza: la acción es invocable desde el navegador, y una capacitación con paquete
    // tiene que ser incerrable a mano por quien la debe hacer.
    //
    // Se exige `!esAdministrativo` y no `puede(rol, 'operacion:administrar')` porque el
    // cierre administrativo de una CAPACITACION **sí manda `asistio`**: `validarCierre` lo
    // exige (`lib/sig/cierre.ts:62-68`), así que un cierre administrativo sin ese campo se
    // rechazaría por otra razón. Condicionar sólo por `datos.asistio !== undefined`, como
    // decía el plan, habría cerrado también el camino de R5. Y `esAdministrativo` ya pasó
    // por `autorConPermiso('operacion:administrar')` unas líneas arriba, de modo que la
    // excepción no la puede tomar cualquiera.
    //
    // REQ-SIG-26 §6.3 · ANTES ESTA COMPUERTA SÓLO MIRABA `CAPACITACION`, y el tipo nuevo
    // pasaba de largo: `validarCierre` tampoco tenía caso para `CURSO_VIRTUAL`, así que un
    // POST vacío desde el navegador cerraba un curso que nadie abrió. La regla se mudó a
    // `elCursoCierraSolo` —pura y probada— y acá queda sólo la compuerta.
    //
    // Se quitó también la condición `datos.asistio !== undefined`. Para una CAPACITACION no
    // hacía daño porque `validarCierre` exige la asistencia y el cierre caía ahí igual; para
    // un curso virtual habría sido la fuga entera, porque de ése no se exige ningún campo.
    if (!esAdministrativo) {
      const conPaquete = await prisma.paqueteScorm.findFirst({
        where: { contenidoId: contenido.id },
        select: { id: true },
      });
      if (
        elCursoCierraSolo({
          tipo: contenido.tipo,
          claseCurso: contenido.claseCurso,
          tienePaquete: conPaquete !== null,
        })
      ) {
        return {
          ok: false,
          // El mensaje dice qué hacer, no sólo que no. Y distingue el curso que todavía no
          // se puede hacer del que sí: mandar a «Abrir el curso» a alguien cuyo curso no
          // tiene paquete cargado es mandarlo a una puerta que no existe.
          mensaje:
            conPaquete === null
              ? 'Este curso todavía no tiene el paquete cargado, así que no hay nada que ' +
                'hacer ni que declarar. Avisale a quien lo publicó.'
              : 'Este contenido es un curso en línea: se cierra con el curso, no declarando ' +
                'asistencia. Abrilo desde «Abrir el curso».',
          extemporaneo: false,
          administrativo: false,
          cerrada: false,
        };
      }
    }

    // R4: los flags de obligatoriedad salen del contenido, no del cliente. Un ítem que
    // no pertenece a la verificación se rechaza antes de validar.
    let respuestasValidadas: RespuestaCierre[] | undefined;
    if (contenido.tipo === 'VERIFICACION') {
      const items = await prisma.itemVerificacion.findMany({
        where: { contenidoId: contenido.id },
        orderBy: { orden: 'asc' },
      });
      const porItem = new Map(items.map((i) => [i.id, i]));
      const ajenos = (datos.respuestas ?? []).filter((r) => !porItem.has(r.itemId));
      if (ajenos.length > 0) {
        return {
          ok: false,
          mensaje: 'Hay respuestas para ítems que no pertenecen a esta verificación.',
          extemporaneo: false,
          administrativo: esAdministrativo,
          cerrada: false,
        };
      }
      // **R4 era código muerto.** El conjunto a validar se armaba con las respuestas QUE
      // LLEGARON, y el cliente sólo envía las respondidas: un ítem obligatorio sin
      // responder no estaba en el arreglo, así que la rama `if (!r.respuesta)` de
      // `validarCierre` no podía dispararse nunca. Una verificación se cerraba con todos
      // sus obligatorios en blanco y el servidor la aceptaba.
      //
      // Se arma desde los ÍTEMS y se rellena con lo que llegó. Así el conjunto describe la
      // verificación completa —que es lo que la regla dice— y no el subconjunto que el
      // navegador decidió mandar. Una regla que depende de lo que el cliente envíe no es
      // una regla del servidor.
      const enviadas = new Map((datos.respuestas ?? []).map((r) => [r.itemId, r]));
      respuestasValidadas = items.map((item, n) => {
        const r = enviadas.get(item.id);
        return {
          itemId: item.id,
          // El NÚMERO que se ve en pantalla. El mensaje decía «el ítem 47 es obligatorio»
          // con el id de la base, que en la pantalla no aparece en ninguna parte: quien lo
          // leía no tenía cómo saber cuál de los ocho ítems le faltaba.
          numero: n + 1,
          obligatorio: item.obligatorio,
          permiteNoAplica: item.permiteNoAplica,
          respuesta: r?.respuesta,
          nota: r?.nota,
        };
      });
    }

    const datosCierre = {
      tipo: contenido.tipo,
      versionLeida: datos.versionLeida,
      asistio: datos.asistio,
      calificacion: datos.calificacion,
      exigeEvaluacion: contenido.exigeEvaluacion,
      notaMinima: contenido.notaMinima ? Number(contenido.notaMinima) : null,
      nota: datos.nota,
      respuestas: respuestasValidadas,
    };

    const errores = validarCierre(datosCierre);
    if (errores.length > 0) {
      return { ok: false, mensaje: errores.join('. '), extemporaneo: false, administrativo: esAdministrativo, cerrada: false };
    }

    // Válido no es lo mismo que cerrado: una capacitación reprobada registra el intento y
    // deja la asignación abierta para repetir la evaluación.
    const cierra = cierraLaAsignacion(datosCierre);

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

      // El registro de arriba ya quedó escrito con su nota: ES el intento fallido que la
      // regla manda conservar. Lo único que no ocurre al reprobar es el cierre, así que la
      // asignación no se toca y no hay cambio de estado que anotar en bitácora.
      if (!cierra) return;

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

    if (!cierra) {
      const minima = contenido.notaMinima ? Number(contenido.notaMinima) : null;
      return {
        ok: true,
        mensaje: `Intento registrado con ${datos.calificacion}${
          minima === null ? '' : ` sobre la nota mínima de ${minima}`
        }. La asignación sigue abierta: se refuerza la información y se repite la evaluación.`,
        extemporaneo,
        administrativo: esAdministrativo,
        cerrada: false,
      };
    }

    return {
      ok: true,
      mensaje: esAdministrativo
        ? `Cierre administrativo registrado${extemporaneo ? ' (extemporáneo)' : ''}.`
        : `Cierre registrado${extemporaneo ? ' (extemporáneo)' : ''}.`,
      extemporaneo,
      administrativo: esAdministrativo,
      cerrada: true,
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

/// R9 desde el censo: toda la carga abierta de una persona pasa a otra, de una vez.
///
/// La pantalla de Personas reasigna a la PERSONA, no una asignación suelta —quien salió del
/// Directorio deja N pendientes—, y por eso necesita su propia acción: `reasignarAsignacion`
/// recibe el id de UNA asignación, así que llamarla con el id de la persona movía la
/// asignación que casualmente tuviera ese número, de cualquier otro. Ese era el defecto.
///
/// Va en UNA transacción con la bitácora adentro: mover tres de seis y fallar deja un censo
/// donde nadie puede decir cuáles faltan, que es justo lo que R9 quiere evitar.
export async function reasignarPendientesDe(
  personaId: number,
  nuevaPersonaId: number,
  motivo: string,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    exigirId(personaId, 'la persona cuya carga se reasigna');
    exigirId(nuevaPersonaId, 'la persona a la que se reasigna');
    if (!motivo.trim()) return { ok: false, mensaje: 'La reasignación exige motivo.' };
    if (personaId === nuevaPersonaId) {
      return { ok: false, mensaje: 'El destino es la misma persona.' };
    }

    const persona = await prisma.persona.findUnique({ where: { id: nuevaPersonaId } });
    if (!persona) return { ok: false, mensaje: 'La persona destino no existe.' };
    if (!persona.activa) return { ok: false, mensaje: 'La persona destino está inactiva.' };

    const abiertas = await prisma.asignacion.findMany({
      where: { personaId, estado: 'PENDIENTE' },
      select: { id: true },
    });
    if (abiertas.length === 0) {
      return { ok: false, mensaje: 'Esa persona no tiene pendientes abiertos.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.asignacion.updateMany({
        where: { id: { in: abiertas.map((a) => a.id) } },
        data: { personaId: nuevaPersonaId },
      });
      await registrar(
        tx,
        autor,
        abiertas.map((a) => ({
          tabla: 'asignacion',
          registroId: String(a.id),
          campo: 'persona_id',
          anterior: personaId,
          nuevo: nuevaPersonaId,
          motivo,
        })),
      );
    });

    revalidatePath('/sig/personas');
    return {
      ok: true,
      mensaje: `${abiertas.length} ${abiertas.length === 1 ? 'asignación reasignada' : 'asignaciones reasignadas'} a ${persona.nombre}.`,
      cambios: abiertas.length,
    };
  });
}

/// Asignarle algo a una persona desde su popup: un contenido del catálogo, o una tarea
/// puntual.
///
/// **Vive junto a las reasignaciones y no en un archivo nuevo** porque crear carga y moverla
/// son la misma clase de acto sobre el trabajo de alguien, con el mismo permiso y la misma
/// bitácora. Separarlas habría duplicado las dos cosas.
///
/// Las reglas que se pueden decidir mirando sólo el formulario están en
/// `lib/sig/asignacion-manual.ts`, donde se pueden probar. Acá queda lo que necesita la base:
/// que la persona exista y esté activa, y que el contenido esté vigente.
///
/// **El periodo es el mes de la fecha límite**, y eso sólo es posible desde la migración
/// 20260918120000_asignacion_manual: antes, el índice único con NULLS NOT DISTINCT hacía que
/// una persona sólo pudiera tener UNA asignación manual por periodo.
export async function asignarAPersona(
  personaId: number,
  datos: DatosAsignacionManual,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    const id = exigirId(personaId, 'la persona a la que se asigna');

    const errores = validarAsignacionManual(datos, new Date());
    if (errores.length > 0) return { ok: false, mensaje: errores.join(' ') };

    const persona = await prisma.persona.findUnique({
      where: { id },
      select: { nombre: true, activa: true },
    });
    if (!persona) return { ok: false, mensaje: 'La persona no existe.' };
    // Asignarle trabajo a quien ya no está en el Directorio abre una tarea que nadie va a
    // poder cerrar: la persona no entra a la aplicación. Lo que sí sigue exigible es lo que
    // ya tenía, y para eso está la reasignación.
    if (!persona.activa) {
      return {
        ok: false,
        mensaje: `${persona.nombre} está inactiva: no puede entrar a cerrar lo que se le asigne.`,
      };
    }

    const contenidoId = idOpcional(datos.contenidoId ?? undefined, 'el contenido');
    let titulo: string | null = null;
    let descripcion: string | null = null;

    if (contenidoId !== undefined) {
      const contenido = await prisma.contenidoSig.findUnique({
        where: { id: contenidoId },
        select: { titulo: true, activo: true },
      });
      if (!contenido) return { ok: false, mensaje: 'El contenido no existe.' };
      if (!contenido.activo) {
        return { ok: false, mensaje: `«${contenido.titulo}» está inactivo y no se puede asignar.` };
      }
    } else {
      // Con contenido, el modelo IGNORA estos dos campos; sin él, son obligatorios. La
      // validación pura ya rechazó que vengan los dos, así que acá sólo se copian.
      titulo = (datos.titulo ?? '').trim();
      descripcion = (datos.descripcion ?? '').trim();
    }

    const motivo = datos.motivo.trim();
    const fechaLimite = new Date(`${datos.fechaLimite}T00:00:00.000Z`);

    await prisma.$transaction(async (tx) => {
      const fila = await tx.asignacion.create({
        data: {
          // Sin obligación: es lo que la hace manual, y lo que la deja fuera del índice
          // parcial de idempotencia. El cron no la va a tocar ni la va a duplicar.
          obligacionId: null,
          contenidoId: contenidoId ?? null,
          titulo,
          descripcion,
          personaId: id,
          periodo: periodoDeFechaLimite(datos.fechaLimite),
          fechaApertura: new Date(),
          fechaLimite,
        },
        select: { id: true },
      });

      // **`'asignada a mano'` y no `'generada · <periodo>'`**, que es lo que escribe la
      // generación automática. La franja de la última corrida del censo se arma leyendo esta
      // misma tabla (`censo.query.ts`), y P28 ya documenta la trampa: sin distinguirlas, una
      // asignación hecha a mano se leería como una sincronización que nunca ocurrió.
      await registrar(tx, autor, [
        {
          tabla: 'asignacion',
          registroId: String(fila.id),
          campo: 'alta',
          anterior: null,
          nuevo: `asignada a mano · ${persona.nombre}`,
          motivo,
        },
      ]);

      return fila;
    });

    revalidatePath('/sig/personas');
    return {
      ok: true,
      mensaje: `Asignada a ${persona.nombre}: aparece en su bandeja de Mi SIG.`,
      cambios: 1,
    };
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
  // `CUR` y no `CV`: tres letras como los otros cuatro, para que los códigos sigan
  // alineándose en columna en las listas y en el repositorio documental.
  CURSO_VIRTUAL: 'CUR',
};

export interface DatosContenido {
  tipo: 'CAPACITACION' | 'LECTURA' | 'VERIFICACION' | 'TAREA' | 'CURSO_VIRTUAL';
  titulo: string;
  descripcion: string;
  /// REQ-SIG-26 · sólo para `CURSO_VIRTUAL`, y obligatoria ahí. `PAQUETE` se recorre dentro
  /// de la aplicación y lo cierra el curso; `ENLACE` se abre en la plataforma del proveedor
  /// y lo cierra la declaración de la persona.
  claseCurso?: 'PAQUETE' | 'ENLACE';
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

  // REQ-SIG-26 · el invariante de `claseCurso`: existe si y sólo si el contenido es un
  // curso virtual. La base no lo impone —la columna es opcional y sin default, porque un
  // `DEFAULT 'PAQUETE'` le pondría clase de curso a las lecturas— así que lo sostiene esta
  // función, que es la única puerta por la que se crean y editan contenidos.
  if (datos.tipo === 'CURSO_VIRTUAL') {
    if (!datos.claseCurso) {
      errores.push('un curso virtual tiene que declarar si es paquete SCORM o enlace externo');
    }
    // Un curso de enlace sin enlace no es un curso incompleto: es un curso que no existe.
    // El de paquete SÍ puede nacer vacío —el zip se sube después, y a veces el proveedor
    // todavía no lo entregó—, y la pantalla avisa que nadie podrá iniciarlo hasta entonces.
    if (datos.claseCurso === 'ENLACE') {
      const url = datos.documentoUrl?.trim() ?? '';
      if (!url) {
        errores.push('un curso de enlace externo necesita el enlace');
      } else if (!url.startsWith('https://')) {
        // No es cosmético: la pestaña se abre desde una sesión autenticada del SIG.
        errores.push('el enlace del curso tiene que empezar por https://');
      }
    }
  } else if (datos.claseCurso !== undefined) {
    // Se rechaza en vez de ignorarse en silencio. Un campo que el servidor descarta sin
    // decirlo es la clase de cosa que alguien da por guardada durante meses.
    errores.push('sólo un curso virtual puede declarar clase de curso');
  }

  return errores;
}

/// R10: editar un contenido que ya generó asignaciones sube su versión; los registros
/// cerrados conservan la versión que se realizó.
export async function crearContenido(datos: DatosContenido): Promise<ResultadoCreacion> {
  return ejecutar<ResultadoCreacion>(async () => {
    const autor = await autorConPermiso('operacion:escribir');
    const errores = validarDatosContenido(datos);
    if (errores.length > 0) return { ok: false, mensaje: errores.join('. ') };

    // Quién publica la versión. `null` cuando la cuenta que edita no está en el censo: es
    // un dato que falta, y poner a otro sería firmar el documento en su nombre.
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });

    // REQ-SIG-26 · el id SALE de la transacción porque el alta de un curso virtual de clase
    // paquete son DOS pasos: éste emite el código, y sólo entonces `subirPaqueteScorm`
    // tiene a qué colgar el zip. Sin el id, el formulario tendría que buscar «el contenido
    // que acabo de crear» por título, que es adivinar.
    const nacido = await prisma.$transaction(async (tx) => {
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
          claseCurso: datos.tipo === 'CURSO_VIRTUAL' ? (datos.claseCurso ?? null) : null,
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
      return { id: creado.id, codigo: creado.codigo };
    });

    return {
      ok: true,
      // El código va en el mensaje, no sólo en el campo: cuando el alta de un curso encadena
      // la subida del paquete y el zip falla, esto es lo único que le dice a la persona qué
      // contenido quedó creado — y por lo tanto que no tiene que crearlo otra vez.
      mensaje: `Contenido ${nacido.codigo} creado.`,
      id: nacido.id,
      codigo: nacido.codigo,
    };
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
    // REQ-SIG-26 · D-2 · el tipo decide qué cuenta como «texto que la persona lee». En un
    // curso virtual, el enlace es dónde está el curso y no qué dice: corregir una URL rota
    // no publica una versión nueva ni le pide un acuse a quien ya lo hizo.
    const textoCambio = cambiaElTexto(contenido, datos, contenido.tipo);
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

    // P2 · un registro contra «Codificación Segura v2» tiene que seguir apuntando al
    // paquete que se ejecutó, aunque mañana se suba una v3. Sin esto el historial de
    // capacitación deja de ser verificable en el momento en que alguien actualiza un curso.
    const paqueteVigente = await prisma.paqueteScorm.findFirst({
      where: { contenidoId: id },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    const paqueteVigenteId = paqueteVigente?.id ?? null;

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
          data: {
            contenidoId: id,
            version,
            ...nuevoTexto,
            paqueteScormId: paqueteVigenteId,
            publicadaPorId: persona?.id ?? null,
          },
        });
      } else {
        // Corrección de la versión vigente: un contenido sin obligaciones, o un cambio que
        // no toca el texto. Publicar una v1 idéntica dos veces llenaría el historial de
        // versiones que nadie leyó y que no se distinguen entre sí.
        //
        // `upsert` y no `update`: un contenido cargado antes de esta migración podría no
        // tener su fila si la migración corrió a medias, y un fallo acá dejaría el
        // contenido editado sin versión — el defecto que este cambio vino a cerrar.
        //
        // P2 · el paquete se congela al CREAR la fila, no al corregirla: la rama `update`
        // deja `paqueteScormId` como estaba a propósito. Reescribirlo en cada corrección
        // haría que una versión ya publicada —contra la que alguien pudo cerrar— cambiara
        // de paquete al vuelo, que es exactamente lo que congelar viene a impedir.
        await tx.versionContenido.upsert({
          where: { contenidoId_version: { contenidoId: id, version } },
          update: nuevoTexto,
          create: {
            contenidoId: id,
            version,
            ...nuevoTexto,
            paqueteScormId: paqueteVigenteId,
            publicadaPorId: persona?.id ?? null,
          },
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
          // REQ-SIG-26 · cambiar de clase se permite, y NO borra nada: un curso que pasa de
          // enlace a paquete conserva su `documentoUrl`, que es el rastro de dónde estuvo
          // antes y lo que explica los registros cerrados contra la clase anterior.
          ...(datos.claseCurso !== undefined && { claseCurso: datos.claseCurso }),
          version,
        },
      });

      // El cambio de clase deja rastro aparte. Es la clase de cambio que después hay que
      // poder explicar: de él depende si el registro de una persona es evidencia de que
      // hizo el curso —lo reportó el reproductor— o la declaración de que lo hizo.
      if (datos.claseCurso !== undefined && datos.claseCurso !== contenido.claseCurso) {
        await registrar({ bitacora: tx.bitacora }, autor, [
          {
            tabla: 'contenido_sig',
            registroId: String(id),
            campo: 'clase_curso',
            anterior: contenido.claseCurso,
            nuevo: datos.claseCurso,
            motivo:
              datos.claseCurso === 'ENLACE'
                ? 'pasa a enlace externo · el cierre vuelve a ser una declaración de la persona'
                : 'pasa a paquete SCORM · el cierre lo hace el curso',
          },
        ]);
      }

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

// `DatosObligacion` y `validarDatosObligacion` vivían acá y ahora viven en
// `lib/sig/obligacion-validacion.ts`. Este archivo es `'use server'`, así que la función no
// se podía exportar sin volverla una server action invocable desde el navegador — y por eso
// ninguna prueba la tocaba. REQ-SIG-17 §3 necesita las mismas guardas desde la semilla, y
// dos copias de una regla son dos reglas: la que se rompe en silencio es la de la semilla,
// porque nadie la mira. Se re-exporta el tipo para no romper a quien lo importa de acá.
export type { DatosObligacion };

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
          // REQ-SIG-15 P11. **Faltaba, y el tipo no lo notaba**: `DatosObligacion` ya lo
          // declaraba y `validarDatosObligacion` ya lo contaba como destino, así que una
          // obligación por grupo pasaba todas las guardas y se creaba con la columna en
          // `null` — `alcance: 'GRUPO_INTERES'` sin grupo. El generador no le habría dirigido
          // nada a nadie, en silencio, que es el mismo modo de falla que `NIVEL_ACTIVO` tuvo.
          alcanceGrupoInteresId: datos.alcanceGrupoInteresId ?? null,
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