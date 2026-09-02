'use server';

// app/sig/acciones/personas.ts
//
// Aplica contra la base el plan que decidió `lib/sig/personas.ts`. Acá no hay lógica de
// negocio: si una regla se puede probar, vive en el módulo puro y no en esta acción.
//
// Todo ocurre en una transacción con la bitácora adentro: una sincronización a medias que
// dejó gente inactiva sin registrar por qué es exactamente el artefacto que una auditoría
// busca.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta, registrarBaja } from '@/lib/sgsi/bitacora';
import { explicarFallo, leerDirectorioCompleto } from '@/lib/sgsi/directorio';
import { planificarSincronizacion } from '@/lib/sig/personas';
import { autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';

export interface ResultadoSincronizacion extends Resultado {
  altas: number;
  actualizadas: number;
  inactivadas: number;
  reactivadas: number;
  ignoradas: number;
}

const VACIO = { altas: 0, actualizadas: 0, inactivadas: 0, reactivadas: 0, ignoradas: 0 };

export async function sincronizarDirectorio(): Promise<ResultadoSincronizacion> {
  return ejecutar<ResultadoSincronizacion>(async () => {
    const autor = await autorConPermiso('personas:administrar');

    // El mensaje decía «no está configurado O no respondió» porque no sabía cuál de las
    // dos era. Ahora la consulta trae la causa, así que se dice: falta tal variable, el
    // secreto está vencido, falta tal permiso, o no hubo salida a internet.
    const directorio = await leerDirectorioCompleto();
    if (!directorio.ok) {
      return {
        ok: false,
        mensaje: `${explicarFallo(directorio.fallo)} No se cambió nada.`,
        ...VACIO,
      };
    }

    const existentes = await prisma.persona.findMany({
      select: { oid: true, nombre: true, correo: true, activa: true },
    });

    const plan = planificarSincronizacion(directorio.datos, existentes);
    if (plan.abortado) {
      return { ok: false, mensaje: plan.motivo as string, ...VACIO };
    }

    const ahora = new Date();

    await prisma.$transaction(async (tx) => {
      for (const alta of plan.altas) {
        const creada = await tx.persona.create({
          data: {
            oid: alta.oid,
            nombre: alta.nombre,
            correo: alta.correo,
            activa: true,
            sincronizadaEn: ahora,
          },
        });
        await registrarAlta(tx, autor, 'persona', String(creada.id));
      }

      for (const cambio of plan.cambios) {
        // Escrito con la condición explícita y no con `{ [cambio.campo]: ... }`: una clave
        // computada se ensancha a `{ [x: string]: string }` y Prisma rechaza el tipo.
        const persona = await tx.persona.update({
          where: { oid: cambio.oid },
          data:
            cambio.campo === 'nombre'
              ? { nombre: cambio.nuevo, sincronizadaEn: ahora }
              : { correo: cambio.nuevo, sincronizadaEn: ahora },
        });
        await registrar(tx, autor, [
          {
            tabla: 'persona',
            registroId: String(persona.id),
            campo: cambio.campo,
            anterior: cambio.anterior,
            nuevo: cambio.nuevo,
            motivo: 'sincronización con el Directorio Activo',
          },
        ]);
      }

      for (const baja of plan.inactivaciones) {
        const persona = await tx.persona.update({
          where: { oid: baja.oid },
          data: { activa: false, sincronizadaEn: ahora },
        });
        await registrarBaja(
          tx,
          autor,
          'persona',
          String(persona.id),
          'ya no figura en el Directorio Activo',
        );
      }

      for (const alta of plan.reactivaciones) {
        const persona = await tx.persona.update({
          where: { oid: alta.oid },
          data: { activa: true, sincronizadaEn: ahora },
        });
        await registrar(tx, autor, [
          {
            tabla: 'persona',
            registroId: String(persona.id),
            campo: 'baja lógica',
            anterior: 'dado de baja',
            nuevo: 'vigente',
            motivo: 'reapareció en el Directorio Activo',
          },
        ]);
      }
    });

    revalidatePath('/sig/personas');

    return {
      ok: true,
      mensaje:
        `Directorio sincronizado: ${plan.altas.length} alta(s), ${plan.cambios.length} ` +
        `actualización(es), ${plan.inactivaciones.length} inactivación(es), ` +
        `${plan.reactivaciones.length} reactivación(es).`,
      altas: plan.altas.length,
      actualizadas: plan.cambios.length,
      inactivadas: plan.inactivaciones.length,
      reactivadas: plan.reactivaciones.length,
      ignoradas: plan.ignoradas,
    };
  });
}