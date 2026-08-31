'use server';

// app/sig/acciones/tareas.ts
//
// Aplica contra la base los planes que decidieron los módulos puros de lib/sig/. Acá no
// hay reglas de negocio: si una decisión se puede probar, vive en el módulo puro.
//
// Todo ocurre en una transacción con la bitácora adentro (regla transversal 07): una
// generación a medias que no dejó rastro es exactamente el artefacto que una auditoría
// busca.

import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import { planificarGeneracion } from '@/lib/sig/generacion';

export interface ResultadoGeneracion extends Resultado {
  creadas: number;
}

export async function generarAsignaciones(): Promise<ResultadoGeneracion> {
  return ejecutar<ResultadoGeneracion>(async () => {
    const autor = await autorConPermiso('operacion:escribir');

    const [obligaciones, personas, existentes] = await Promise.all([
      prisma.obligacion.findMany({
        select: {
          id: true,
          contenidoId: true,
          alcance: true,
          alcancePersonaId: true,
          alcanceCargoId: true,
          alcanceAreaId: true,
          periodicidad: true,
          fechaInicio: true,
          plazoDias: true,
          activa: true,
        },
      }),
      prisma.persona.findMany({
        select: { id: true, activa: true, areaId: true, cargoId: true },
      }),
      prisma.asignacion.findMany({
        select: { obligacionId: true, personaId: true, periodo: true },
      }),
    ]);

    const plan = planificarGeneracion(obligaciones, personas, existentes, new Date());
    if (plan.crear.length === 0) {
      return { ok: true, mensaje: 'No hay asignaciones nuevas por generar.', creadas: 0 };
    }

    const ahora = new Date();
    await prisma.$transaction(async (tx) => {
      for (const a of plan.crear) {
        const creada = await tx.asignacion.create({
          data: {
            obligacionId: a.obligacionId,
            contenidoId: a.contenidoId,
            personaId: a.personaId,
            periodo: a.periodo,
            fechaApertura: a.fechaApertura,
            fechaLimite: a.fechaLimite,
          },
        });
        await registrar(tx, autor, [
          {
            tabla: 'asignacion',
            registroId: String(creada.id),
            campo: 'alta',
            anterior: null,
            nuevo: `generada · ${a.periodo}`,
            motivo: 'generación idempotente de asignaciones',
          },
        ]);
      }
    });

    return {
      ok: true,
      mensaje: `Generación completada: ${plan.crear.length} asignación(es) nueva(s).`,
      creadas: plan.crear.length,
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

      await tx.registroRealizado.create({
        data: {
          asignacionId: asignacion.id,
          nota: datos.nota,
          versionLeida: contenido.tipo === 'LECTURA' ? datos.versionLeida : null,
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