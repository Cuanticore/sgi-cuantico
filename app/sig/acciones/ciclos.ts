'use server';

// app/sig/acciones/ciclos.ts
//
// Registrar los pasos de vinculación y desvinculación de un colaborador.
//
// **El hueco que cierra.** Los pasos estaban sembrados (`paso_ciclo`), el módulo puro
// resolvía cuáles aplican (`lib/sig/ciclos.ts`), la ficha los dibujaba con su tilde… y no
// existía ninguna forma de marcarlos. `pasoDeColaborador` no aparecía en un solo archivo de
// la aplicación y la tabla tenía cero filas: la lista mostraba 0/7 para siempre, y el
// ingreso de un colaborador no se podía registrar. Una casilla que no se puede marcar es
// peor que ninguna casilla, porque parece que el trámite está sin hacer.
//
// **C4 · ningún paso depende de otro.** PRO-TAL-03 es explícito: «la revocación de accesos
// se ejecuta el mismo día de la terminación, SIN ESPERAR a la liquidación ni al paz y
// salvo». Por eso acá no hay prerrequisitos que validar —`dependeDeOtroPaso()` en el módulo
// puro devuelve `false` y tiene su prueba— y se puede marcar cualquiera en cualquier orden.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrarAlta, registrarBaja } from '@/lib/sgsi/bitacora';
import {
  autorConPermiso,
  ejecutar,
  exigirId,
  type Resultado,
} from '@/app/sgsi/acciones/sesion';

export interface ResultadoPaso extends Resultado {
  /// Cómo quedó el paso: `true` completado, `false` pendiente. La pantalla no lo adivina
  /// invirtiendo lo que tenía — si dos personas marcan a la vez, invertir da el estado
  /// contrario al real.
  completado: boolean;
}

/// Marca un paso como cumplido, o lo devuelve a pendiente.
///
/// Es una sola acción y no dos porque es el mismo hecho leído en dos sentidos: partirla
/// daría dos lugares donde escribir la misma regla y la misma entrada de bitácora.
///
/// **Desmarcar exige motivo.** Marcar registra algo que ocurrió; desmarcar dice que lo
/// registrado NO ocurrió, y eso borra una afirmación sobre un control de seguridad —el
/// acuerdo de confidencialidad, la inducción, la revocación de accesos—. Quien lo haga tiene
/// que dejar dicho por qué, y queda en la bitácora con quién y cuándo.
export async function alternarPaso(
  personaId: number,
  pasoId: number,
  motivo?: string,
): Promise<ResultadoPaso> {
  return ejecutar<ResultadoPaso>(async () => {
    const autor = await autorConPermiso('personas:administrar');

    const [persona, paso] = await Promise.all([
      prisma.persona.findUnique({ where: { id: personaId }, select: { id: true, nombre: true } }),
      prisma.pasoCiclo.findUnique({
        where: { id: pasoId },
        select: { id: true, codigo: true, texto: true, activo: true },
      }),
    ]);

    if (!persona) return { ok: false, mensaje: 'La persona no existe.', completado: false };
    if (!paso) return { ok: false, mensaje: 'El paso no existe.', completado: false };
    exigirId(persona.id, 'la persona');
    exigirId(paso.id, 'el paso');

    // Un paso retirado del procedimiento no se marca. Los ya marcados se conservan: son el
    // registro de lo que se exigía cuando esa persona entró, y reescribir eso sería cambiar
    // la historia porque el procedimiento cambió después.
    if (!paso.activo) {
      return {
        ok: false,
        mensaje: `${paso.codigo} ya no está vigente en el procedimiento; no se puede marcar.`,
        completado: false,
      };
    }

    // QUIEN lo dio por cumplido. `autorConPermiso` devuelve el correo de la sesion, y la
    // columna guarda una `Persona`: hay que resolverlo. Si esa persona no esta en el censo
    // —una cuenta de administracion que no es colaboradora— queda `null`, que es la verdad:
    // el correo igual queda en la bitacora, asi que el rastro no se pierde.
    const autorPersona = await prisma.persona.findUnique({
      where: { correo: autor.toLowerCase() },
      select: { id: true },
    });

    const existente = await prisma.pasoDeColaborador.findUnique({
      where: { personaId_pasoId: { personaId: persona.id, pasoId: paso.id } },
      select: { id: true },
    });

    const registroId = `${persona.id}:${paso.codigo}`;

    if (existente) {
      const razon = (motivo ?? '').trim();
      if (razon.length < 10) {
        return {
          ok: false,
          mensaje:
            'Decí por qué se desmarca: quitar el registro afirma que el paso NO se cumplió, ' +
            'y eso borra una constancia sobre un control de seguridad.',
          completado: true,
        };
      }

      await prisma.$transaction(async (tx) => {
        await tx.pasoDeColaborador.delete({ where: { id: existente.id } });
        await registrarBaja(tx, autor, 'paso_de_colaborador', registroId, razon);
      });

      revalidatePath(`/sig/colaboradores/${persona.id}`);
      return {
        ok: true,
        mensaje: `${paso.codigo} volvió a pendiente.`,
        completado: false,
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.pasoDeColaborador.create({
        data: {
          personaId: persona.id,
          pasoId: paso.id,
          completadoPorId: autorPersona?.id ?? null,
          nota: (motivo ?? '').trim() || null,
        },
      });
      await registrarAlta(tx, autor, 'paso_de_colaborador', registroId);
    });

    revalidatePath(`/sig/colaboradores/${persona.id}`);
    return { ok: true, mensaje: `${paso.codigo} quedó cumplido.`, completado: true };
  });
}
