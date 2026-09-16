'use server';

// app/sig/acciones/sentinel.ts
//
// **Promover un incidente del espejo de Sentinel a un `EventoSeguridad` real.** Es una
// decisión del SGSI, no una observación espontánea — a diferencia de `reportarEvento`
// (`app/sig/acciones/eventos.ts`, O1), que sigue abierto a cualquier persona autenticada sin
// permiso previo y que esta acción NO toca ni reemplaza.
//
// Por eso acá SÍ se exige `sgsi:escribir`: promover afirma que Sentinel vio algo real, y esa
// afirmación la firma una persona con permiso, no cualquiera que tenga sesión.

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import { autorConPermiso, idOpcional, ejecutar } from '@/app/sgsi/acciones/sesion';
import { codigoEvento } from '@/lib/sig/eventos';
import { claveIncidente, descripcionPromovida } from '@/lib/sig/sentinel';
import type { ResultadoEvento } from '@/app/sig/acciones/eventos';

export interface DatosPromocion {
  /// Lo declara quien promueve; el espejo sólo lo sugiere (D8) — un incidente abierto en la
  /// bandeja de triage de Sentinel no es lo mismo que un ataque en curso.
  enCurso: boolean;
  dondeId?: number;
}

/// Promueve un incidente ya sincronizado en el espejo. Falla sin crear nada si:
/// - quien llama no tiene `sgsi:escribir`;
/// - el incidente no está en el espejo (hay que sincronizar primero);
/// - el incidente ya fue promovido (una sola promoción por incidente, D2 + el índice único
///   `evento_origen_unico`).
export async function promoverIncidenteSentinel(
  numeroIncidente: string,
  datos: DatosPromocion,
): Promise<ResultadoEvento> {
  return ejecutar<ResultadoEvento>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    // Un `<select>` de lugares vacío manda `undefined`; sin esto, ese valor viajaría hasta
    // Prisma y la pantalla mostraría un error crudo de base de datos (sesion.ts:29-34).
    const dondeId = idOpcional(datos.dondeId, 'el lugar');

    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.', codigo: null };

    // La clave se normaliza con la MISMA función que usa el trabajo de sincronización: si
    // cada lado normalizara distinto, la clave del upsert se bifurcaría entre los dos.
    const clave = claveIncidente(numeroIncidente);
    const espejo = await prisma.incidenteSentinel.findUnique({
      where: { numeroIncidente: clave },
    });
    if (!espejo) {
      return {
        ok: false,
        mensaje:
          'Este incidente no está en el espejo todavía: hay que esperar a que el trabajo de ' +
          'sincronización lo traiga antes de poder promoverlo.',
        codigo: null,
      };
    }

    // La consulta es sólo para el mensaje; la garantía real es el índice único
    // `evento_origen_unico` — el `P2002` de más abajo la respalda ante un doble clic.
    const yaPromovido = await prisma.eventoSeguridad.findFirst({
      where: { origenSistema: 'SENTINEL', origenIdExterno: clave },
      select: { codigo: true },
    });
    if (yaPromovido) {
      return {
        ok: false,
        mensaje: `Este incidente ya fue promovido como ${yaPromovido.codigo}.`,
        codigo: yaPromovido.codigo,
      };
    }

    const anio = new Date().getUTCFullYear();
    let codigo = '';
    try {
      await prisma.$transaction(async (tx) => {
        const contador = await tx.contadorEvento.upsert({
          where: { anio },
          update: { ultimoValor: { increment: 1 } },
          create: { anio, ultimoValor: 1 },
        });
        codigo = codigoEvento(anio, contador.ultimoValor);

        const creado = await tx.eventoSeguridad.create({
          data: {
            codigo,
            // O15 · se compone UNA sola vez, acá, y nunca se reescribe: un re-sync
            // posterior actualiza el espejo, no este evento.
            descripcion: descripcionPromovida(espejo.titulo, espejo.descripcion),
            // Cuándo ocurrió, no cuándo Sentinel se enteró. El respaldo es obligatorio
            // porque `FirstActivityTime` puede venir nula.
            fechaOcurrencia: espejo.primeraActividad ?? espejo.creadoEnSentinel,
            enCurso: datos.enCurso,
            dondeId: dondeId ?? null,
            reportadoPorId: persona.id,
            // Prohibido mapear `Classification` a veredicto/justificación (O3) y
            // `Severity` a la severidad del SGSI (O5): las dos quedan sin tocar, en null.
            origenSistema: 'SENTINEL',
            origenIdExterno: clave,
            origenUrl: espejo.url,
          },
        });

        await registrarAlta(tx, autor, 'evento_seguridad', String(creado.id));
        // Sin esta segunda entrada, el rastro no dice QUIÉN decidió que esto entrara al
        // SGSI — el alta sola sólo dice que el evento existe.
        await registrar(tx, autor, [
          {
            tabla: 'evento_seguridad',
            registroId: codigo,
            campo: 'promoción',
            anterior: null,
            nuevo: `Microsoft Sentinel · ${clave}`,
            motivo: 'promoción del espejo de Sentinel',
          },
        ]);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return {
          ok: false,
          mensaje: 'Este incidente ya fue promovido (doble clic): no se creó un segundo evento.',
          codigo: null,
        };
      }
      throw e;
    }

    revalidatePath('/sgsi/sentinel');
    revalidatePath('/sgsi/eventos');
    return { ok: true, mensaje: `Promovido como ${codigo}.`, codigo };
  });
}
