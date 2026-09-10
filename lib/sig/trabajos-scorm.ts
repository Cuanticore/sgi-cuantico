import 'server-only';

// lib/sig/trabajos-scorm.ts
//
// El trabajo que recoge los intentos colgados. Vive aparte de `trabajos.ts` por el mismo
// criterio que `trabajos-notificaciones.ts`: el núcleo despacha, cada trabajo se lee solo.

import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { estaAbandonado, umbralDeAbandono } from '@/lib/sig/scorm-abandono';

export async function abandonarIntentosScorm(
  autor: string,
  hoy: Date,
): Promise<{ creados: number; detalle: string }> {
  const umbral = umbralDeAbandono(process.env.SCORM_INTENTO_ABANDONO_MINUTOS);

  const abiertos = await prisma.intentoScorm.findMany({
    where: { estado: 'EN_CURSO' },
    select: { id: true, ultimaActividadEn: true, completionStatus: true },
  });

  const colgados = abiertos.filter((i) => estaAbandonado(i.ultimaActividadEn, hoy, umbral));
  if (colgados.length === 0) {
    return { creados: 0, detalle: `${abiertos.length} intentos abiertos, ninguno colgado` };
  }

  for (const i of colgados) {
    // El cambio y su línea de bitácora van en la MISMA transacción, como manda
    // `lib/sgsi/bitacora.ts`: «una traza que se puede escribir aparte es una traza que
    // puede faltar». Con dos escrituras sueltas, un fallo entre ambas dejaría un intento
    // marcado ABANDONADO sin nada que dijera quién lo marcó ni por qué.
    await prisma.$transaction(async (tx) => {
      // Se marca el estado y NADA más: lo que el curso ya comprometió —`location`,
      // `suspend_data`, objetivos, interacciones— se conserva intacto, porque el próximo
      // intento no debería costarle a la persona lo que ya avanzó.
      await tx.intentoScorm.update({
        where: { id: i.id },
        data: { estado: 'ABANDONADO', exit: 'time-out' },
      });
      await registrar(tx, autor, [
        {
          tabla: 'intento_scorm',
          registroId: String(i.id),
          campo: 'estado',
          anterior: 'EN_CURSO',
          nuevo: 'ABANDONADO',
          motivo: `sin actividad por más de ${Math.round(umbral / 60_000)} minutos`,
        },
      ]);
    });
  }

  return {
    creados: colgados.length,
    detalle: `${colgados.length} intentos marcados ABANDONADO de ${abiertos.length} abiertos`,
  };
}
