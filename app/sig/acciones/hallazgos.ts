'use server';

// app/sig/acciones/hallazgos.ts
//
// B3 cualquiera reporta; solo el líder clasifica. B4 nadie cierra su propio hallazgo.
// B9 anular exige motivo y administrador. Todo en transacciones con bitácora.

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { autorActual, autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import { registrar, registrarAlta, registrarBaja } from '@/lib/sgsi/bitacora';
import { codigoHallazgo } from '@/lib/sig/hallazgos';

export interface DatosReporte {
  origen:
    | 'AUDITORIA_INTERNA'
    | 'AUDITORIA_EXTERNA'
    | 'QUEJA'
    | 'INDICADOR'
    | 'REVISION_DIRECCION'
    | 'SGSI'
    | 'OTRO';
  origenReferencia: string;
  descripcion: string;
  requisitoIncumplido: string;
  evidenciaObjetiva: string;
  areaId: number;
  fechaDeteccion: Date;
}

/// B3: cualquiera reporta. El hallazgo nace SIN clasificar y no consume plazos.
export async function reportarHallazgo(datos: DatosReporte): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorActual();
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada en el SIG.' };

    const anio = new Date().getUTCFullYear();
    await prisma.$transaction(async (tx) => {
      const contador = await tx.contadorHallazgo.upsert({
        where: { anio },
        update: { ultimoValor: { increment: 1 } },
        create: { anio, ultimoValor: 1 },
      });
      const creado = await tx.hallazgo.create({
        data: {
          codigo: codigoHallazgo(anio, contador.ultimoValor),
          tipo: 'NC_MENOR',
          origen: datos.origen,
          origenReferencia: datos.origenReferencia,
          descripcion: datos.descripcion,
          requisitoIncumplido: datos.requisitoIncumplido,
          evidenciaObjetiva: datos.evidenciaObjetiva,
          areaId: datos.areaId,
          detectadoPorId: persona.id,
          fechaDeteccion: datos.fechaDeteccion,
        },
      });
      await registrarAlta(tx, autor, 'hallazgo', String(creado.id));
    });
    return { ok: true, mensaje: 'Hallazgo reportado. El líder del SIG lo clasifica.' };
  });
}

export interface DatosClasificacion {
  tipo: 'NC_MAYOR' | 'NC_MENOR' | 'OBSERVACION' | 'OPORTUNIDAD';
  responsableId: number;
  fechaCompromiso: Date;
  hallazgoAnteriorId?: number;
}

/// B3: solo el líder clasifica. La reclasificación (B2) usa esta misma acción: el
/// código no cambia y los pasos que el nuevo tipo exige quedan pendientes.
export async function clasificarHallazgo(
  codigo: string,
  datos: DatosClasificacion,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:escribir');
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };

    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada en el SIG.' };

    await prisma.$transaction(async (tx) => {
      const anterior = hallazgo.tipo;
      await tx.hallazgo.update({
        where: { id: hallazgo.id },
        data: {
          tipo: datos.tipo,
          responsableId: datos.responsableId,
          fechaCompromiso: datos.fechaCompromiso,
          clasificadoPorId: persona.id,
          fechaClasificacion: new Date(),
          ...(datos.hallazgoAnteriorId ? { hallazgoAnteriorId: datos.hallazgoAnteriorId } : {}),
        },
      });
      await registrar(tx, autor, [
        {
          tabla: 'hallazgo',
          registroId: String(hallazgo.id),
          campo: 'tipo',
          anterior,
          nuevo: datos.tipo,
          motivo: anterior === datos.tipo ? 'clasificación del hallazgo' : 'reclasificación del hallazgo',
        },
      ]);
    });
    return {
      ok: true,
      mensaje: 'Hallazgo clasificado. Los pasos que el tipo exige quedan pendientes.',
    };
  });
}

export async function guardarCorreccion(
  codigo: string,
  datos: { descripcion: string; responsableId: number; fecha: Date },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:escribir');
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };
    const { exigeTabla } = await import('@/lib/sig/hallazgos');
    const exige = exigeTabla(hallazgo.tipo);
    if (exige.correccion === 'NO') {
      return { ok: false, mensaje: 'Este tipo de hallazgo no exige corrección.' };
    }

    await prisma.$transaction(async (tx) => {
      const correccion = await tx.correccionHallazgo.upsert({
        where: { hallazgoId: hallazgo.id },
        update: {
          descripcion: datos.descripcion,
          responsableId: datos.responsableId,
          fecha: datos.fecha,
        },
        create: {
          hallazgoId: hallazgo.id,
          descripcion: datos.descripcion,
          responsableId: datos.responsableId,
          fecha: datos.fecha,
        },
      });
      await registrar(tx, autor, [
        {
          tabla: 'correccion_hallazgo',
          registroId: String(correccion.id),
          campo: 'descripcion',
          anterior: null,
          nuevo: datos.descripcion,
          motivo: 'corrección inmediata del hallazgo',
        },
      ]);
    });
    return { ok: true, mensaje: 'Corrección guardada. Contiene el efecto; no cierra el hallazgo.' };
  });
}

export async function guardarCausaRaiz(
  codigo: string,
  datos: {
    metodo: 'CINCO_PORQUES' | 'ISHIKAWA' | 'LIBRE';
    desarrollo: Prisma.InputJsonValue;
    causaRaiz: string;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:escribir');
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };

    const { exigeTabla } = await import('@/lib/sig/hallazgos');
    const exige = exigeTabla(hallazgo.tipo);
    if (exige.causa === 'NO') return { ok: false, mensaje: 'Este tipo no exige causa raíz.' };
    if (exige.causa === 'METODO' && datos.metodo === 'LIBRE') {
      return {
        ok: false,
        mensaje: 'La NC mayor exige un método declarado (cinco porqués o Ishikawa).',
      };
    }

    await prisma.$transaction(async (tx) => {
      const analisis = await tx.analisisCausa.upsert({
        where: { hallazgoId: hallazgo.id },
        update: {
          metodo: datos.metodo,
          desarrollo: datos.desarrollo,
          causaRaiz: datos.causaRaiz,
          realizadoPorId: persona.id,
        },
        create: {
          hallazgoId: hallazgo.id,
          metodo: datos.metodo,
          desarrollo: datos.desarrollo,
          causaRaiz: datos.causaRaiz,
          realizadoPorId: persona.id,
        },
      });
      await registrar(tx, autor, [
        {
          tabla: 'analisis_causa',
          registroId: String(analisis.id),
          campo: 'causa_raiz',
          anterior: null,
          nuevo: datos.causaRaiz,
          motivo: `análisis de causa con método ${datos.metodo}`,
        },
      ]);
    });
    return { ok: true, mensaje: 'Causa raíz guardada.' };
  });
}

export async function guardarExtension(
  codigo: string,
  datos: { existeEnOtraParte: boolean; analisis: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:escribir');
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };
    const { exigeTabla } = await import('@/lib/sig/hallazgos');
    if (!exigeTabla(hallazgo.tipo).extension) {
      return { ok: false, mensaje: 'Este tipo no exige la evaluación de extensión.' };
    }

    await prisma.$transaction(async (tx) => {
      const extension = await tx.extensionProblema.upsert({
        where: { hallazgoId: hallazgo.id },
        update: { existeEnOtraParte: datos.existeEnOtraParte, analisis: datos.analisis },
        create: { hallazgoId: hallazgo.id, existeEnOtraParte: datos.existeEnOtraParte, analisis: datos.analisis },
      });
      await registrar(tx, autor, [
        {
          tabla: 'extension_problema',
          registroId: String(extension.id),
          campo: 'existe_en_otra_parte',
          anterior: null,
          nuevo: String(datos.existeEnOtraParte),
          motivo: 'evaluación de extensión (ISO 9001 §10.2.1 d)',
        },
      ]);
    });
    return { ok: true, mensaje: 'Evaluación de extensión guardada.' };
  });
}

export interface DatosAccionHallazgo {
  papel: 'CORRECCION' | 'CORRECTIVA' | 'MEJORA';
  titulo: string;
  descripcion: string;
  responsableId: number;
  fechaLimite: Date;
}

/// B12: la acción se crea como asignación PUNTUAL del motor de A — sin contenido,
/// con título y descripción propios — y el puente la enlaza al hallazgo.
export async function agregarAccionHallazgo(
  codigo: string,
  datos: DatosAccionHallazgo,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:escribir');
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };
    if (!datos.titulo.trim()) return { ok: false, mensaje: 'La acción necesita un título.' };

    await prisma.$transaction(async (tx) => {
      const asignacion = await tx.asignacion.create({
        data: {
          obligacionId: null,
          contenidoId: null,
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          personaId: datos.responsableId,
          periodo: hallazgo.codigo,
          fechaApertura: new Date(),
          fechaLimite: datos.fechaLimite,
        },
      });
      await tx.hallazgoAccion.create({
        data: { hallazgoId: hallazgo.id, asignacionId: asignacion.id, papel: datos.papel },
      });
      await registrarAlta(tx, autor, 'hallazgo_accion', String(asignacion.id));
    });
    return { ok: true, mensaje: 'Acción creada: aparece en Mi SIG del responsable.' };
  });
}

export interface DatosVerificacion {
  resultado: 'EFICAZ' | 'NO_EFICAZ';
  nota?: string;
  evidencia?: { nombre: string; mime: string; bytes: number[] };
}

/// La verificación de eficacia queda en el historial (son varias, no una). Si resulta
/// NO_EFICAZ (B6) el hallazgo no se cierra ni se anula: vuelve a exigir acción y el
/// historial conserva la verificación fallida.
export async function verificarEficacia(
  codigo: string,
  datos: DatosVerificacion,
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:cerrar');
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };

    await prisma.$transaction(async (tx) => {
      const verificacion = await tx.verificacionEficaciaHallazgo.create({
        data: {
          hallazgoId: hallazgo.id,
          verificadoPorId: persona.id,
          resultado: datos.resultado,
          nota: datos.nota,
        },
      });
      await registrar(tx, autor, [
        {
          tabla: 'verificacion_eficacia_hallazgo',
          registroId: String(verificacion.id),
          campo: 'resultado',
          anterior: null,
          nuevo: datos.resultado,
          motivo:
            datos.resultado === 'NO_EFICAZ'
              ? 'la causa raíz probablemente no era la causa'
              : 'verificación de eficacia',
        },
      ]);
      if (datos.evidencia) {
        await tx.evidencia.create({
          data: {
            hallazgoId: hallazgo.id,
            tipo: 'ARCHIVO',
            texto: datos.evidencia.nombre,
            creadaPor: autor,
            archivoNombre: datos.evidencia.nombre,
            archivoMime: datos.evidencia.mime,
            archivoTamano: datos.evidencia.bytes.length,
            archivoVersion: 1,
            archivo: { create: { bytes: Buffer.from(datos.evidencia.bytes) } },
          },
        });
      }
    });
    return {
      ok: true,
      mensaje:
        datos.resultado === 'EFICAZ'
          ? 'Verificación eficaz registrada. Ya se puede cerrar.'
          : 'Verificación NO eficaz: el hallazgo sigue abierto y vuelve a exigir acción.',
    };
  });
}

/// B4: nadie cierra su propio hallazgo (cerradoPor ≠ responsable). B5: no se cierra
/// sin verificación eficaz cuando el tipo la exige. Todo validado en el servidor.
export async function cerrarHallazgo(codigo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:cerrar');
    const hallazgo = await prisma.hallazgo.findUnique({
      where: { codigo },
      include: { acciones: true, verificaciones: true },
    });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };
    if (hallazgo.anuladoEn) return { ok: false, mensaje: 'El hallazgo está anulado.' };
    if (hallazgo.fechaCierre) return { ok: false, mensaje: 'El hallazgo ya está cerrado.' };

    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };
    if (hallazgo.responsableId === persona.id) {
      return {
        ok: false,
        mensaje: 'Nadie cierra su propio hallazgo (separación de funciones).',
      };
    }

    const { exigeTabla } = await import('@/lib/sig/hallazgos');
    const exige = exigeTabla(hallazgo.tipo);
    const huboAccion = hallazgo.acciones.filter((a) => a.papel !== 'VERIFICACION').length > 0;
    if (exige.verificacion === 'SI' || (exige.verificacion === 'CONDICIONAL' && huboAccion)) {
      const eficaz = hallazgo.verificaciones.some((v) => v.resultado === 'EFICAZ');
      if (!eficaz) {
        return { ok: false, mensaje: 'No se cierra sin verificación eficaz.' };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.hallazgo.update({
        where: { id: hallazgo.id },
        data: { fechaCierre: new Date(), cerradoPorId: persona.id },
      });
      await registrar(tx, autor, [
        {
          tabla: 'hallazgo',
          registroId: String(hallazgo.id),
          campo: 'estado',
          anterior: 'abierto',
          nuevo: 'cerrado',
          motivo: `cierre por ${autor}`,
        },
      ]);
    });
    return { ok: true, mensaje: 'Hallazgo cerrado.' };
  });
}

/// B9: anular exige motivo y rol administrador. Nunca hay borrado físico.
export async function anularHallazgo(codigo: string, motivo: string): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('mejora:cerrar');
    if (!motivo.trim()) return { ok: false, mensaje: 'La anulación exige motivo.' };
    const hallazgo = await prisma.hallazgo.findUnique({ where: { codigo } });
    if (!hallazgo) return { ok: false, mensaje: 'El hallazgo no existe.' };

    await prisma.$transaction(async (tx) => {
      await tx.hallazgo.update({
        where: { id: hallazgo.id },
        data: { anuladoEn: new Date(), motivoAnulacion: motivo },
      });
      await registrarBaja(tx, autor, 'hallazgo', String(hallazgo.id), motivo);
    });
    return { ok: true, mensaje: 'Hallazgo anulado.' };
  });
}