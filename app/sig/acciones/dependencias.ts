'use server';

// app/sig/acciones/dependencias.ts
//
// **E3 · la validación del ciclo vive ACÁ, no en la pantalla.** La interfaz ayuda —oculta
// los que ya están relacionados, muestra el aviso— pero no decide. Una regla que sólo vive
// en el cliente se salta con una petición, y ésta en particular protege al recorrido del
// mapa de no terminar nunca.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, exigirId, type Resultado } from '@/app/sgsi/acciones/sesion';
import {
  caminoDelCiclo,
  ETIQUETA_TIPO_DEPENDENCIA,
  type Arista,
  type TipoDependencia,
} from '@/lib/sig/dependencias';

export interface ResultadoDependencias extends Resultado {
  agregadas: number;
  /// Los que no se pudieron agregar, con su porqué. Se devuelven TODOS en vez de cortar en
  /// el primero: quien marcó nueve activos merece saber cuáles nueve fallaron, no
  /// descubrirlo de a uno.
  rechazados: { activoId: number; motivo: string }[];
}

/// Agrega varias dependencias de una vez, que es como la pantalla las declara.
///
/// Las que cerrarían un ciclo se rechazan **con el camino a la vista**. Las demás se
/// guardan: descartar el lote entero por una arista mala haría perder ocho declaraciones
/// buenas por una equivocada.
export async function agregarDependencias(
  activoId: number,
  dependeDeIds: readonly number[],
  tipo: TipoDependencia,
): Promise<ResultadoDependencias> {
  return ejecutar<ResultadoDependencias>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(activoId, 'el activo base');
    if (dependeDeIds.length === 0) {
      return { ok: false, mensaje: 'No marcaste ningún activo.', agregadas: 0, rechazados: [] };
    }

    const [base, existentes] = await Promise.all([
      prisma.activo.findUnique({ where: { id: activoId }, select: { id: true, nombre: true } }),
      prisma.dependenciaActivo.findMany({
        select: { activoId: true, dependeDeId: true, tipo: true },
      }),
    ]);
    if (!base) return { ok: false, mensaje: 'El activo base no existe.', agregadas: 0, rechazados: [] };

    // El grafo se lee UNA vez y se va acumulando en memoria: si se releyera por arista,
    // dos aristas del mismo lote podrían cerrar un ciclo entre ellas sin que nadie lo
    // notara hasta la siguiente lectura.
    const grafo: Arista[] = existentes.map((e) => ({
      activoId: e.activoId,
      dependeDeId: e.dependeDeId,
      tipo: e.tipo,
    }));

    const nombres = new Map(
      (
        await prisma.activo.findMany({
          where: { id: { in: [...dependeDeIds, ...grafo.flatMap((g) => [g.activoId, g.dependeDeId])] } },
          select: { id: true, nombre: true, codigo: true },
        })
      ).map((a) => [a.id, a.codigo ?? a.nombre]),
    );

    const rechazados: { activoId: number; motivo: string }[] = [];
    const aCrear: number[] = [];

    for (const destinoId of dependeDeIds) {
      if (grafo.some((g) => g.activoId === activoId && g.dependeDeId === destinoId && g.tipo === tipo)) {
        rechazados.push({ activoId: destinoId, motivo: 'ya estaba declarada con ese tipo' });
        continue;
      }
      const camino = caminoDelCiclo(activoId, destinoId, grafo);
      if (camino !== null) {
        rechazados.push({
          activoId: destinoId,
          motivo: `cerraría un ciclo: ${camino.map((id) => nombres.get(id) ?? `#${id}`).join(' → ')} → ${nombres.get(activoId) ?? `#${activoId}`}`,
        });
        continue;
      }
      aCrear.push(destinoId);
      grafo.push({ activoId, dependeDeId: destinoId, tipo });
    }

    if (aCrear.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const dependeDeId of aCrear) {
          const creada = await tx.dependenciaActivo.create({
            data: { activoId, dependeDeId, tipo },
          });
          await registrarAlta(tx, autor, 'dependencia_activo', String(creada.id));
        }
        await registrar(tx, autor, [
          {
            tabla: 'dependencia_activo',
            registroId: String(activoId),
            campo: 'dependencias',
            anterior: null,
            nuevo: `${aCrear.length} · ${ETIQUETA_TIPO_DEPENDENCIA[tipo]}`,
            motivo: `declaradas desde la pantalla de dependencias`,
          },
        ]);
      });
    }

    revalidatePath('/tecnologia/dependencias');
    revalidatePath('/tecnologia/impacto');
    return {
      ok: aCrear.length > 0,
      mensaje:
        aCrear.length === 0
          ? `Ninguna se pudo agregar. ${rechazados[0]?.motivo ?? ''}`
          : `${aCrear.length} dependencia(s) declarada(s)${rechazados.length > 0 ? `, ${rechazados.length} rechazada(s)` : ''}.`,
      agregadas: aCrear.length,
      rechazados,
    };
  });
}

/// Quita una dependencia. **Borrado físico, y es la excepción deliberada** a la baja lógica
/// del resto del sistema: una arista mal declarada no es historia que preservar, es un dato
/// equivocado, y dejarla marcada como inactiva obligaría a filtrarla en cada recorrido del
/// grafo — donde olvidarse una vez reintroduce el ciclo. La bitácora conserva el hecho.
export async function quitarDependencia(id: number): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('tecnologia:escribir');
    exigirId(id, 'la dependencia');
    const fila = await prisma.dependenciaActivo.findUnique({
      where: { id },
      include: {
        activo: { select: { codigo: true, nombre: true } },
        dependeDe: { select: { codigo: true, nombre: true } },
      },
    });
    if (!fila) return { ok: false, mensaje: 'La dependencia no existe.' };

    await prisma.$transaction(async (tx) => {
      await tx.dependenciaActivo.delete({ where: { id } });
      // NO se usa `registrarBaja`: esa función escribe «baja lógica · dado de baja», y acá
      // la fila desaparece de verdad. Decir «dado de baja» sobre un borrado físico haría
      // que un auditor buscara una fila inactiva que no existe.
      await registrar(tx, autor, [
        {
          tabla: 'dependencia_activo',
          registroId: String(fila.activoId),
          campo: 'dependencia retirada',
          anterior: `${fila.activo.codigo ?? fila.activo.nombre} ${ETIQUETA_TIPO_DEPENDENCIA[fila.tipo]} ${fila.dependeDe.codigo ?? fila.dependeDe.nombre}`,
          nuevo: null,
          motivo: 'retirada desde la pantalla de dependencias',
        },
      ]);
    });

    revalidatePath('/tecnologia/dependencias');
    revalidatePath('/tecnologia/impacto');
    return { ok: true, mensaje: 'Dependencia retirada.' };
  });
}
