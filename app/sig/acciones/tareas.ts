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