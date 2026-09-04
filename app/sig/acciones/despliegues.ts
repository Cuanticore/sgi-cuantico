'use server';

// app/sig/acciones/despliegues.ts
//
// Importar la exportación de ambientes, y asociar a mano lo que la importación no reconoció.
//
// **E6 · idempotente.** **E7 · lo que no reconoce su activo padre queda pendiente, visible y
// contado.** No se descarta en silencio, que es como se pierden los servicios olvidados —
// dos de los cuales el levantamiento encontró sirviendo el mismo dominio que producción
// desde otro servidor.
//
// **E5 · un despliegue no genera riesgos.** Esta acción no toca la tabla de riesgos ni la
// de activos: importar 130 despliegues deja el número de riesgos del sistema exactamente
// donde estaba, y ése es un criterio de aceptación de la spec.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, exigirId, type Resultado } from '@/app/sgsi/acciones/sesion';
import {
  llaveDeDespliegue,
  parsearCsvDeDespliegues,
  planificarImportacion,
  resolverActivoPadre,
} from '@/lib/sig/despliegues';

export interface ResultadoImportacion extends Resultado {
  importados: number;
  creados: number;
  actualizados: number;
  asociados: number;
  pendientes: number;
  duplicadasEnElArchivo: number;
}

const vacio: Omit<ResultadoImportacion, 'ok' | 'mensaje'> = {
  importados: 0,
  creados: 0,
  actualizados: 0,
  asociados: 0,
  pendientes: 0,
  duplicadasEnElArchivo: 0,
};

export async function importarDespliegues(csv: string): Promise<ResultadoImportacion> {
  return ejecutar<ResultadoImportacion>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');

    const { filas, problemas } = parsearCsvDeDespliegues(csv);
    if (filas.length === 0) {
      return {
        ok: false,
        mensaje: `No se leyó ninguna fila. ${problemas.join('; ')}`,
        ...vacio,
      };
    }

    const [existentes, activos] = await Promise.all([
      prisma.despliegue.findMany({
        select: { id: true, repoGithub: true, ambiente: true, servidor: true },
      }),
      prisma.activo.findMany({
        where: { activo: true },
        select: { id: true, nombre: true, codigo: true },
      }),
    ]);

    const idPorLlave = new Map(existentes.map((e) => [llaveDeDespliegue(e), e.id]));
    const plan = planificarImportacion(filas, new Set(idPorLlave.keys()));

    let asociados = 0;
    let pendientes = 0;

    await prisma.$transaction(
      async (tx) => {
        for (const f of plan.crear) {
          const activoId = resolverActivoPadre(f, activos);
          if (activoId === null) pendientes += 1;
          else asociados += 1;
          const creado = await tx.despliegue.create({ data: { ...f, activoId } });
          await registrarAlta(tx, autor, 'despliegue', String(creado.id));
        }
        for (const { llave, fila } of plan.actualizar) {
          const id = idPorLlave.get(llave);
          if (id === undefined) continue;
          // **La asociación manual NO se pisa.** Si alguien ya resolvió a mano a qué activo
          // pertenece este despliegue, reimportar no puede deshacerlo: `activoId` queda
          // fuera del update a propósito, y por eso una segunda importación no borra el
          // trabajo de la primera.
          await tx.despliegue.update({ where: { id }, data: { ...fila, activoId: undefined } });
        }
        await registrar(tx, autor, [
          {
            tabla: 'despliegue',
            registroId: 'importacion',
            campo: 'importación de ambientes',
            anterior: `${existentes.length} despliegues`,
            nuevo: `${plan.crear.length} creados · ${plan.actualizar.length} actualizados`,
            motivo: `archivo con ${filas.length} filas${plan.duplicadasEnElArchivo > 0 ? `, ${plan.duplicadasEnElArchivo} repetidas dentro del archivo` : ''}`,
          },
        ]);
      },
      // La importación real son 130 filas con su alta en bitácora cada una: el plazo por
      // omisión de Prisma no alcanza y la transacción se cortaría a la mitad.
      { timeout: 120_000 },
    );

    revalidatePath('/tecnologia/ambientes');
    return {
      ok: true,
      mensaje:
        `${filas.length} filas leídas: ${plan.crear.length} nuevas, ${plan.actualizar.length} actualizadas.` +
        (pendientes > 0 ? ` ${pendientes} quedaron sin activo padre y están contadas.` : '') +
        (problemas.length > 0 ? ` Problemas: ${problemas.join('; ')}.` : ''),
      importados: filas.length,
      creados: plan.crear.length,
      actualizados: plan.actualizar.length,
      asociados,
      pendientes,
      duplicadasEnElArchivo: plan.duplicadasEnElArchivo,
    };
  });
}

/// E7 · asociar a mano lo que la importación no pudo resolver. Es el trabajo que la lista de
/// pendientes existe para hacer visible.
export async function asociarDespliegue(id: number, activoId: number): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(id, 'el despliegue');
    exigirId(activoId, 'el activo');

    const [despliegue, activo] = await Promise.all([
      prisma.despliegue.findUnique({ where: { id }, select: { id: true, nombre: true } }),
      prisma.activo.findUnique({ where: { id: activoId }, select: { id: true, codigo: true, nombre: true } }),
    ]);
    if (!despliegue) return { ok: false, mensaje: 'El despliegue no existe.' };
    if (!activo) return { ok: false, mensaje: 'El activo no existe.' };

    await prisma.$transaction(async (tx) => {
      await tx.despliegue.update({ where: { id }, data: { activoId } });
      await registrar(tx, autor, [
        {
          tabla: 'despliegue',
          registroId: String(id),
          campo: 'activo padre',
          anterior: null,
          nuevo: activo.codigo ?? activo.nombre,
          motivo: `asociado a mano desde la lista de pendientes`,
        },
      ]);
    });

    revalidatePath('/tecnologia/ambientes');
    return { ok: true, mensaje: `${despliegue.nombre} quedó bajo ${activo.codigo ?? activo.nombre}.` };
  });
}
