'use server';

// app/sig/acciones/verificaciones.ts
//
// Registrar el resultado de una ejecución, y cambiar el anclaje de una verificación.
//
// Lo que NO hay acá: crear la verificación, generar sus ciclos, avisar del vencimiento ni
// cerrarlos. Todo eso es el motor de tareas del módulo A, que ya lo hace. Una verificación
// programada es una obligación con un contenido de tipo lista, y sus ejecuciones son
// asignaciones — «aquí se administran, no se ejecutan».

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import { autorConPermiso, ejecutar, exigirId, type Resultado } from '@/app/sgsi/acciones/sesion';
import { validarEjecucion, type ResultadoVerificacion } from '@/lib/sig/verificaciones';
import type { Anclaje } from '@/lib/sig/generacion';

/// El resultado de una ejecución. Cuelga de la asignación con `@unique`: **una ejecución
/// por ciclo, y no se sobrescribe**. Si ya hay una, se rechaza — el histórico de ciclos es
/// lo que esta pantalla existe para no perder.
export async function registrarEjecucion(
  asignacionId: number,
  datos: { resultado: ResultadoVerificacion; nota: string; codigoHallazgo?: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    exigirId(asignacionId, 'la ejecución');

    // El hallazgo llega por CÓDIGO y no por id: la pantalla no debería conocer los ids de
    // Mejora, y un código es lo que alguien tiene a mano. Que no exista es un error del
    // usuario con un mensaje propio, no un id nulo que pasa desapercibido.
    let hallazgoId: number | null = null;
    if (datos.codigoHallazgo !== undefined && datos.codigoHallazgo.trim() !== '') {
      const codigo = datos.codigoHallazgo.trim().toUpperCase();
      const hallazgo = await prisma.hallazgo.findUnique({
        where: { codigo },
        select: { id: true },
      });
      if (!hallazgo) {
        return { ok: false, mensaje: `No existe el hallazgo ${codigo}. Levantalo en Mejora primero.` };
      }
      hallazgoId = hallazgo.id;
    }

    const asignacion = await prisma.asignacion.findUnique({
      where: { id: asignacionId },
      select: { id: true, periodo: true, obligacionId: true, ejecucion: { select: { id: true } } },
    });
    if (!asignacion) return { ok: false, mensaje: 'La ejecución no existe.' };
    if (asignacion.ejecucion !== null) {
      return {
        ok: false,
        mensaje: 'Este ciclo ya tiene su resultado registrado; el histórico no se sobrescribe.',
      };
    }

    const errores = validarEjecucion({
      resultado: datos.resultado,
      nota: datos.nota,
      hallazgoId,
    });
    if (errores.length > 0) return { ok: false, mensaje: errores.join('. ') };

    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      const creada = await tx.ejecucionVerificacion.create({
        data: {
          asignacionId,
          resultado: datos.resultado,
          nota: datos.nota.trim(),
          hallazgoId,
          registradoPorId: persona?.id ?? null,
        },
      });
      // El cierre de la asignación va en la MISMA transacción que el resultado: un ciclo
      // con resultado y sin cerrar seguiría contando como deuda en Mi SIG, y uno cerrado
      // sin resultado sería un ciclo que nadie puede explicar.
      await tx.asignacion.update({
        where: { id: asignacionId },
        data: { estado: 'REALIZADA', fechaCierre: new Date(), cerradaPor: persona?.id ?? null },
      });
      await registrarAlta(tx, autor, 'ejecucion_verificacion', String(creada.id));
      await registrar(tx, autor, [
        {
          tabla: 'ejecucion_verificacion',
          registroId: asignacion.periodo,
          campo: 'resultado',
          anterior: null,
          nuevo: datos.resultado,
          motivo: datos.nota.trim(),
        },
      ]);
    });

    revalidatePath('/sgsi/verificaciones');
    return { ok: true, mensaje: 'Ejecución registrada y ciclo cerrado.' };
  });
}

/// R12 · cambiar el anclaje.
///
/// **Sólo afecta a lo que se genere de acá en adelante.** Los ciclos ya abiertos no se
/// mueven ni se borran: cada uno puede tener un resultado detrás, y reescribir el
/// calendario del pasado para que cuadre con la decisión de hoy es exactamente lo que un
/// histórico no debe permitir.
export async function cambiarAnclaje(obligacionId: number, anclaje: Anclaje): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    exigirId(obligacionId, 'la verificación');

    const obligacion = await prisma.obligacion.findUnique({
      where: { id: obligacionId },
      select: { id: true, anclaje: true, contenido: { select: { titulo: true } } },
    });
    if (!obligacion) return { ok: false, mensaje: 'La verificación no existe.' };
    if (obligacion.anclaje === anclaje) return { ok: true, mensaje: 'Ya tenía ese anclaje.' };

    await prisma.$transaction(async (tx) => {
      await tx.obligacion.update({ where: { id: obligacionId }, data: { anclaje } });
      await registrar(tx, autor, [
        {
          tabla: 'obligacion',
          registroId: String(obligacionId),
          campo: 'anclaje',
          anterior: obligacion.anclaje,
          nuevo: anclaje,
          motivo:
            anclaje === 'FLOTANTE'
              ? 'pasa a generar al cerrarse el ciclo previo; si nadie cierra, deja de generar'
              : 'pasa a generar contra el calendario; la deuda se acumula a la vista',
        },
      ]);
    });

    revalidatePath('/sgsi/verificaciones');
    return {
      ok: true,
      mensaje:
        anclaje === 'FLOTANTE'
          ? 'Anclaje flotante. Los ciclos ya abiertos no se mueven; el próximo nace al cerrar el actual.'
          : 'Anclaje al calendario. Los ciclos ya abiertos no se mueven; los próximos nacen con el periodo.',
    };
  });
}
