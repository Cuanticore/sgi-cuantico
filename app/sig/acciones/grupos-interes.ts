'use server';

// app/sig/acciones/grupos-interes.ts
//
// La administración de los grupos de interés DESDE EL GRUPO: alta de un grupo y la lista de
// personas que le corresponden.
//
// El otro lado —las casillas de grupos dentro del popup de una persona— ya existe en
// `personas-edicion.ts`. Los dos escriben la misma tabla y las dos comparten las reglas,
// que viven en `lib/sig/grupos.ts` y no acá: qué se abre, qué se cierra y por qué un grupo
// derivado no admite miembros se decide en un módulo puro, y estas acciones sólo ejecutan
// el plan.
//
// POR QUÉ HACE FALTA EL LADO DEL GRUPO. Marcar «Mintrace» a quince personas desde el popup
// son quince popups, y ninguna pantalla contesta «quién está en Mintrace» sin recorrer el
// censo entero. Es la misma información, pero la pregunta que se hace desde acá es la que
// nadie podía hacer.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar } from '@/lib/sgsi/bitacora';
import { planificarMiembros } from '@/lib/sig/grupos';
import { autorConPermiso, ejecutar, exigirId, type Resultado } from '@/app/sgsi/acciones/sesion';

function revalidar(): void {
  revalidatePath('/sig/grupos-interes');
  revalidatePath('/sig/personas');
  revalidatePath('/sig/obligaciones');
}

/// El día sin hora: `desde` y `hasta` son columnas de fecha, no instantes.
function hoySinHora(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/// Crea un grupo de interés.
///
/// NUNCA CREA UNO DERIVADO. «Todos» es el único y su pertenencia se calcula; permitir un
/// segundo grupo derivado desde la pantalla obligaría a escribir en algún lado la regla que
/// lo calcula, y no hay dónde. Los que se crean acá tienen miembros explícitos.
export async function crearGrupoInteres(
  nombre: string,
  descripcion: string,
): Promise<Resultado & { id?: number }> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('personas:administrar');

    const limpio = nombre.trim();
    if (limpio === '') return { ok: false, mensaje: 'El grupo necesita un nombre.' };

    // El código sale del nombre, en mayúsculas y sin acentos — `TODOS`, `DESARROLLADORES`,
    // `MINTRACE`—, que es la convención que el catálogo ya trae. Se deriva y no se pide:
    // un código escrito a mano es un código que alguien va a escribir distinto.
    const codigo = limpio
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (codigo === '') {
      return { ok: false, mensaje: 'El nombre no deja ninguna letra con la que formar un código.' };
    }

    const existente = await prisma.grupoInteres.findUnique({ where: { codigo } });
    if (existente) {
      return { ok: false, mensaje: `Ya existe un grupo con el código ${codigo}: «${existente.nombre}».` };
    }

    const ultimo = await prisma.grupoInteres.aggregate({ _max: { orden: true } });

    const creado = await prisma.$transaction(async (tx) => {
      const g = await tx.grupoInteres.create({
        data: {
          codigo,
          nombre: limpio,
          descripcion: descripcion.trim() === '' ? null : descripcion.trim(),
          derivado: false,
          orden: (ultimo._max.orden ?? 0) + 1,
        },
      });
      await registrar(tx, autor, [
        {
          tabla: 'grupo_interes',
          registroId: codigo,
          campo: 'alta',
          anterior: null,
          nuevo: limpio,
        },
      ]);
      return g;
    });

    revalidar();
    return { ok: true, mensaje: `Se creó el grupo «${limpio}» (${codigo}).`, id: creado.id };
  });
}

/// Reemplaza la lista de miembros VIGENTES de un grupo por la que llega.
///
/// Llega la lista entera y no un alta o una baja sueltas, por lo mismo que las casillas del
/// popup: la pantalla edita un conjunto, y mandar el conjunto es lo que permite que el
/// servidor decida qué cambió en vez de creerle a quien llama.
export async function guardarMiembrosDelGrupo(
  grupoId: number,
  personaIds: number[],
): Promise<Resultado> {
  return ejecutar(async () => {
    const autor = await autorConPermiso('personas:administrar');
    exigirId(grupoId, 'el grupo');

    const grupo = await prisma.grupoInteres.findUnique({ where: { id: grupoId } });
    if (!grupo) return { ok: false, mensaje: 'El grupo no existe.' };

    const vigentes = await prisma.miembroGrupoInteres.findMany({
      where: { grupoId, hasta: null },
      select: { id: true, personaId: true, desde: true },
    });

    const plan = planificarMiembros(
      vigentes,
      personaIds,
      { id: grupo.id, nombre: grupo.nombre, derivado: grupo.derivado },
      hoySinHora(),
    );
    if (plan.errores.length > 0) return { ok: false, mensaje: plan.errores.join(' ') };
    if (plan.crear.length === 0 && plan.cerrar.length === 0) {
      return { ok: true, mensaje: 'No había cambios que guardar.' };
    }

    // Los nombres para la bitácora: un id suelto dentro de un año no lo resuelve nadie.
    const tocadas = [...plan.crear.map((m) => m.personaId), ...plan.cerrar.map((m) => m.personaId)];
    const personas = await prisma.persona.findMany({
      where: { id: { in: tocadas } },
      select: { id: true, nombre: true, correo: true },
    });
    const nombreDe = new Map(personas.map((p) => [p.id, `${p.nombre} <${p.correo}>`]));

    await prisma.$transaction(async (tx) => {
      // Se CIERRA, no se borra: «quién estaba en Mintrace en marzo» es una pregunta de
      // auditoría, y una fila borrada no la contesta.
      for (const m of plan.cerrar) {
        await tx.miembroGrupoInteres.update({ where: { id: m.id }, data: { hasta: m.hasta } });
      }
      // Una membresía cerrada ocupa el lugar de la nueva por la única `(grupo, persona)`, así
      // que volver a agregar a alguien que salió REABRE su fila con el `desde` de hoy — que
      // es lo que P16 pide: la pertenencia arranca ahora, no cuando arrancó la anterior.
      for (const m of plan.crear) {
        await tx.miembroGrupoInteres.upsert({
          where: { grupoId_personaId: { grupoId, personaId: m.personaId } },
          create: { grupoId, personaId: m.personaId, desde: m.desde },
          update: { desde: m.desde, hasta: null },
        });
      }

      await registrar(
        tx,
        autor,
        [
          ...plan.crear.map((m) => ({
            tabla: 'miembro_grupo_interes',
            registroId: grupo.codigo,
            campo: 'miembro',
            anterior: null,
            nuevo: nombreDe.get(m.personaId) ?? String(m.personaId),
          })),
          ...plan.cerrar.map((m) => ({
            tabla: 'miembro_grupo_interes',
            registroId: grupo.codigo,
            campo: 'miembro',
            anterior: nombreDe.get(m.personaId) ?? String(m.personaId),
            nuevo: null,
          })),
        ],
      );
    });

    revalidar();
    const partes: string[] = [];
    if (plan.crear.length > 0) partes.push(`${plan.crear.length} agregada(s)`);
    if (plan.cerrar.length > 0) partes.push(`${plan.cerrar.length} retirada(s)`);
    return { ok: true, mensaje: `«${grupo.nombre}»: ${partes.join(' y ')}.` };
  });
}
