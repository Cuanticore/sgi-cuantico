'use server';

// app/sig/acciones/eventos.ts
//
// **O1 · reportar está abierto a cualquier persona autenticada, sin permiso previo.** Mismo
// patrón que `reportarHallazgo`: la acción verifica SESIÓN, no permiso. Un mecanismo de
// reporte que primero pide permiso es un mecanismo que no se usa.
//
// Evaluar y cerrar sí exigen permiso: son decisiones del SGSI, no observaciones.

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import {
  autorActual,
  autorConPermiso,
  ejecutar,
  exigirId,
  type Resultado,
} from '@/app/sgsi/acciones/sesion';
import {
  codigoEvento,
  severidad,
  validarCierreEvento,
  validarEvaluacion,
  type Impacto,
  type Veredicto,
} from '@/lib/sig/eventos';

export interface DatosReporteEvento {
  descripcion: string;
  fechaOcurrencia: Date;
  enCurso: boolean;
  dondeId?: number;
  otrosEnterados?: string;
}

export interface ResultadoEvento extends Resultado {
  codigo: string | null;
}

/// El reporte. **O2 · no pide gravedad, categoría, activos, impacto ni causa raíz**: eso lo
/// decide la evaluación, y pedírselo a quien reporta es la forma más eficaz de que no
/// reporte.
export async function reportarEvento(datos: DatosReporteEvento): Promise<ResultadoEvento> {
  return ejecutar<ResultadoEvento>(async () => {
    const autor = await autorActual();
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.', codigo: null };

    if (datos.descripcion.trim().length < 15) {
      return {
        ok: false,
        mensaje: 'Contá qué pasó con un poco más de detalle: es lo único que se te va a pedir.',
        codigo: null,
      };
    }

    const anio = new Date().getUTCFullYear();
    let codigo = '';
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
          descripcion: datos.descripcion.trim(),
          fechaOcurrencia: datos.fechaOcurrencia,
          enCurso: datos.enCurso,
          dondeId: datos.dondeId ?? null,
          otrosEnterados: datos.otrosEnterados?.trim() || null,
          reportadoPorId: persona.id,
        },
      });
      await registrarAlta(tx, autor, 'evento_seguridad', String(creado.id));
    });

    revalidatePath('/sgsi/eventos');
    return {
      ok: true,
      mensaje: `Reportado como ${codigo}. Alguien del SIG lo evalúa; no tenés que clasificarlo.`,
      codigo,
    };
  });
}

export interface DatosEvaluacion {
  veredicto: Veredicto;
  justificacion: string;
  categorias?: number[];
  impactos?: Impacto[];
  activos?: number[];
  motivacionId?: number;
}

/// La evaluación: veredicto, justificación y —sólo si es incidente— la clasificación.
///
/// **O4 · sólo `INCIDENTE` abre el ciclo completo.** Con observación o falso positivo el
/// evento se archiva acá mismo, y la clasificación se ignora aunque venga: guardarla
/// llenaría la estadística de categorías con eventos que se decidió que no lo eran.
export async function evaluarEvento(
  codigo: string,
  datos: DatosEvaluacion,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    const evento = await prisma.eventoSeguridad.findUnique({ where: { codigo } });
    if (!evento) return { ok: false, mensaje: 'El evento no existe.' };
    if (evento.veredicto !== null) {
      return { ok: false, mensaje: 'Este evento ya fue evaluado; el veredicto no se reescribe.' };
    }

    const errores = validarEvaluacion(datos);
    if (errores.length > 0) return { ok: false, mensaje: errores.join('. ') };

    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    const esIncidente = datos.veredicto === 'INCIDENTE';

    await prisma.$transaction(async (tx) => {
      await tx.eventoSeguridad.update({
        where: { id: evento.id },
        data: {
          veredicto: datos.veredicto,
          justificacion: datos.justificacion.trim(),
          evaluadoPorId: persona?.id ?? null,
          fechaEvaluacion: new Date(),
          motivacionId: esIncidente ? (datos.motivacionId ?? null) : null,
        },
      });

      if (esIncidente) {
        for (const categoriaId of datos.categorias ?? []) {
          await tx.eventoCategoria.create({ data: { eventoId: evento.id, categoriaId } });
        }
        for (const i of datos.impactos ?? []) {
          await tx.impactoEvento.create({
            data: { eventoId: evento.id, dimension: i.dimension, nivel: i.nivel },
          });
        }
        for (const activoId of datos.activos ?? []) {
          await tx.activoAfectado.create({ data: { eventoId: evento.id, activoId } });
        }
      }

      await registrar(tx, autor, [
        {
          tabla: 'evento_seguridad',
          registroId: codigo,
          campo: 'veredicto',
          anterior: null,
          nuevo: datos.veredicto,
          motivo: datos.justificacion.trim(),
        },
      ]);
    });

    revalidatePath(`/sgsi/eventos/${codigo}`);
    return {
      ok: true,
      mensaje: esIncidente
        ? 'Evaluado como incidente. Sigue el tratamiento.'
        : `Archivado como ${datos.veredicto === 'OBSERVACION' ? 'observación' : 'falso positivo'}, con su justificación.`,
    };
  });
}

/// El cierre. **O6 · sin lección aprendida no se cierra** (A.5.27), y **O7 · con impacto alto
/// tampoco sin causa raíz**.
export async function cerrarEvento(
  codigo: string,
  datos: { leccionAprendida: string; causaRaiz?: string; costoRecuperacion?: number; costoImpacto?: number },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    const evento = await prisma.eventoSeguridad.findUnique({
      where: { codigo },
      include: { impactos: true },
    });
    if (!evento) return { ok: false, mensaje: 'El evento no existe.' };
    if (evento.fechaCierre !== null) return { ok: false, mensaje: 'Ya está cerrado.' };

    const errores = validarCierreEvento({
      veredicto: evento.veredicto,
      impactos: evento.impactos.map((i) => ({ dimension: i.dimension, nivel: i.nivel })),
      leccionAprendida: datos.leccionAprendida,
      causaRaiz: datos.causaRaiz ?? null,
    });
    if (errores.length > 0) return { ok: false, mensaje: errores.join('. ') };

    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.eventoSeguridad.update({
        where: { id: evento.id },
        data: {
          leccionAprendida: datos.leccionAprendida.trim(),
          causaRaiz: datos.causaRaiz?.trim() || null,
          // Cero se guarda como cero: dice que se contuvo. `undefined` deja el nulo, que
          // dice que no se calculó.
          costoRecuperacion: datos.costoRecuperacion ?? null,
          costoImpacto: datos.costoImpacto ?? null,
          fechaCierre: new Date(),
          cerradoPorId: persona?.id ?? null,
        },
      });
      await registrar(tx, autor, [
        {
          tabla: 'evento_seguridad',
          registroId: codigo,
          campo: 'cierre',
          anterior: null,
          nuevo: `severidad ${severidad(evento.impactos.map((i) => ({ dimension: i.dimension, nivel: i.nivel }))) ?? 'sin evaluar'}`,
          motivo: datos.leccionAprendida.trim(),
        },
      ]);
    });

    revalidatePath(`/sgsi/eventos/${codigo}`);
    return { ok: true, mensaje: 'Incidente cerrado con su lección aprendida.' };
  });
}

/// Una acción de la línea de tiempo.
export async function registrarAccion(
  codigo: string,
  datos: { fase: string; momento: Date; texto: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('sgsi:escribir');
    const evento = await prisma.eventoSeguridad.findUnique({ where: { codigo }, select: { id: true } });
    if (!evento) return { ok: false, mensaje: 'El evento no existe.' };
    exigirId(evento.id, 'el evento');
    if (datos.texto.trim().length < 5) return { ok: false, mensaje: 'Escribí qué se hizo.' };

    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    await prisma.accionIncidente.create({
      data: {
        eventoId: evento.id,
        fase: datos.fase as never,
        momento: datos.momento,
        texto: datos.texto.trim(),
        autorId: persona?.id ?? null,
      },
    });

    revalidatePath(`/sgsi/eventos/${codigo}`);
    return { ok: true, mensaje: 'Acción registrada en la línea de tiempo.' };
  });
}
