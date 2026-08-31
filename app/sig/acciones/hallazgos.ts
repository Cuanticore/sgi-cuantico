'use server';

// app/sig/acciones/hallazgos.ts
//
// B3 cualquiera reporta; solo el líder clasifica. B4 nadie cierra su propio hallazgo.
// B9 anular exige motivo y administrador. Todo en transacciones con bitácora.

import { prisma } from '@/lib/db';
import { autorActual, autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
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
    desarrollo: unknown;
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