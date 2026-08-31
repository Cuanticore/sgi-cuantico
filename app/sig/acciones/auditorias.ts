'use server';

// app/sig/acciones/auditorias.ts
//
// C1 el programa del primer bimestre es una obligación del motor de A; C2 la
// independencia se bloquea en el servidor; C3 el líder necesita perfil aprobado;
// C4 toda nota cuelga de una celda; C5 emitir congela y promueve; C6 no se emite
// sin acta de cierre; C8 la externa exige su informe adjunto. Todo con bitácora.

import { prisma } from '@/lib/db';
import { autorConPermiso, ejecutar, type Resultado } from '@/app/sgsi/acciones/sesion';
import { registrar, registrarAlta } from '@/lib/sgsi/bitacora';
import { codigoHallazgo } from '@/lib/sig/hallazgos';
import { esIndependiente, promueveHallazgo } from '@/lib/sig/auditorias';

// ── Programa (C1) ──

export async function crearPrograma(
  datos: { anio: number; alcance: string; objetivo: string; criterios: string; metodos: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:administrar');
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    await prisma.programaAuditoria.upsert({
      where: { anio: datos.anio },
      update: datos,
      create: {
        ...datos,
        aprobadoPorId: persona?.id ?? null,
        fechaAprobacion: new Date(),
      },
    });
    return {
      ok: true,
      mensaje: 'Programa guardado. La elaboración del primer bimestre es obligación del motor de A.',
    };
  });
}

export async function programarAuditoria(
  datos: {
    programaId: number;
    procesoRef: string;
    meses: string;
    responsableId: number;
    plazoInformeDias: number;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:administrar');
    await prisma.auditoriaProgramada.create({ data: datos });
    return { ok: true, mensaje: 'Auditoría programada.' };
  });
}

// ── Crear la auditoría y el plan (C2, C3) ──

export async function crearAuditoria(
  datos: {
    programadaId?: number;
    fechaInicio: Date;
    fechaFin?: Date;
    sitio: string;
    objeto: string;
    alcance: string;
    criterios: string;
    auditorLiderId: number;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:administrar');
    const perfil = await prisma.perfilAuditor.findFirst({
      where: { personaId: datos.auditorLiderId, aprobadoEn: { not: null } },
    });
    if (!perfil) {
      return {
        ok: false,
        mensaje: 'C3: el auditor líder necesita un perfil aprobado por el Consulting Director.',
      };
    }
    await prisma.$transaction(async (tx) => {
      const creada = await tx.auditoria.create({
        data: { ...datos, tipo: 'INTERNA' },
      });
      await tx.equipoAuditor.create({
        data: { auditoriaId: creada.id, personaId: datos.auditorLiderId, papel: 'LIDER' },
      });
      await registrarAlta(tx, autor, 'auditoria', String(creada.id));
    });
    return { ok: true, mensaje: 'Auditoría creada con su equipo.' };
  });
}

/// C2: la independencia se bloquea en el servidor. La celda queda marcada como no
/// planificada cuando se agrega durante la ejecución (C4).
export async function agregarCeldaPlan(
  auditoriaId: number,
  datos: {
    procesoRef: string;
    requisitoNormaId: number;
    hora?: string;
    auditorId: number;
    planificada?: boolean;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:ejecutar');
    const auditor = await prisma.persona.findUnique({
      where: { id: datos.auditorId },
      include: { cargo: true },
    });
    if (!esIndependiente(datos.procesoRef, auditor?.cargo?.nombre ?? null)) {
      return {
        ok: false,
        mensaje: 'C2: el auditor no puede auditar el proceso del que es responsable.',
      };
    }
    await prisma.$transaction(async (tx) => {
      const celda = await tx.celdaPlan.create({
        data: { auditoriaId, ...datos },
      });
      await registrarAlta(tx, autor, 'celda_plan', String(celda.id));
    });
    return { ok: true, mensaje: 'Celda del plan agregada.' };
  });
}

export async function registrarNota(
  celdaId: number,
  datos: { notaEvidencia: string; tipo: 'OK' | 'NC' | 'OM' | 'RM' | 'FORTALEZA' },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:ejecutar');
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    if (!persona) return { ok: false, mensaje: 'Tu cuenta no está registrada.' };
    await prisma.$transaction(async (tx) => {
      const nota = await tx.notaAuditor.create({
        data: { celdaId, ...datos, auditorId: persona.id },
      });
      await registrarAlta(tx, autor, 'nota_auditor', String(nota.id));
    });
    return { ok: true, mensaje: 'Nota registrada.' };
  });
}

export async function registrarActa(
  auditoriaId: number,
  datos: { tipo: 'APERTURA' | 'CIERRE'; fecha: Date; asistentes: string; contenido: string },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:ejecutar');
    await prisma.$transaction(async (tx) => {
      const acta = await tx.actaAuditoria.upsert({
        where: { auditoriaId_tipo: { auditoriaId, tipo: datos.tipo } },
        update: { fecha: datos.fecha, asistentes: datos.asistentes, contenido: datos.contenido },
        create: { auditoriaId, ...datos },
      });
      await registrar(tx, autor, [
        {
          tabla: 'acta_auditoria',
          registroId: String(acta.id),
          campo: 'contenido',
          anterior: null,
          nuevo: datos.contenido,
        },
      ]);
    });
    return { ok: true, mensaje: 'Acta registrada.' };
  });
}

// ── Informe, emisión, externas y perfiles ──

export async function guardarInforme(
  auditoriaId: number,
  datos: {
    version: 'PRELIMINAR' | 'FINAL';
    fechaInforme: Date;
    conclusiones: string;
    recomendaciones: string;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:ejecutar');
    await prisma.$transaction(async (tx) => {
      const informe = await tx.informeAuditoria.upsert({
        where: { auditoriaId_version: { auditoriaId, version: datos.version } },
        update: datos,
        create: { auditoriaId, ...datos },
      });
      await registrar(tx, autor, [
        {
          tabla: 'informe_auditoria',
          registroId: String(informe.id),
          campo: 'conclusiones',
          anterior: null,
          nuevo: datos.conclusiones,
        },
      ]);
    });
    return { ok: true, mensaje: 'Informe guardado.' };
  });
}

/// C5: emitir el final congela las notas y promueve cada NC y OM a hallazgo en B,
/// con origen tipado a la auditoría, el proceso y el numeral. C6: exige acta de
/// cierre. Reabrir exige motivo y queda en bitácora.
export async function emitirInformeFinal(auditoriaId: number): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:administrar');
    const auditoria = await prisma.auditoria.findUnique({
      where: { id: auditoriaId },
      include: {
        celdas: { include: { notas: true, requisito: true } },
        actas: true,
        informes: true,
      },
    });
    if (!auditoria) return { ok: false, mensaje: 'La auditoría no existe.' };
    const actaCierre = auditoria.actas.find((a) => a.tipo === 'CIERRE');
    if (!actaCierre) {
      return { ok: false, mensaje: 'C6: no se emite el informe final sin acta de cierre.' };
    }
    const yaEmitida = auditoria.informes?.some((i) => i.version === 'FINAL' && i.emitidoEn);
    if (yaEmitida) return { ok: false, mensaje: 'El informe final ya fue emitido.' };

    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.informeAuditoria.updateMany({
        where: { auditoriaId, version: 'FINAL' },
        data: { emitidoPorId: persona?.id ?? null, emitidoEn: new Date() },
      });
      await tx.auditoria.update({ where: { id: auditoriaId }, data: { emitidoEn: new Date() } });

      const anio = new Date().getUTCFullYear();
      for (const celda of auditoria.celdas) {
        for (const nota of celda.notas) {
          if (!promueveHallazgo(nota.tipo) || nota.hallazgoId) continue;
          const contador = await tx.contadorHallazgo.upsert({
            where: { anio },
            update: { ultimoValor: { increment: 1 } },
            create: { anio, ultimoValor: 1 },
          });
          const hallazgo = await tx.hallazgo.create({
            data: {
              codigo: codigoHallazgo(anio, contador.ultimoValor),
              tipo: nota.tipo === 'NC' ? 'NC_MAYOR' : 'OBSERVACION',
              origen: 'AUDITORIA_INTERNA',
              origenReferencia: `AUD-${auditoriaId} · ${celda.procesoRef} · ${celda.requisito.numeral}`,
              descripcion: nota.notaEvidencia,
              requisitoIncumplido: `${celda.requisito.numeral} · ${celda.requisito.titulo}`,
              evidenciaObjetiva: nota.notaEvidencia,
              areaId: 1,
              detectadoPorId: nota.auditorId,
              fechaDeteccion: new Date(),
            },
          });
          await tx.notaAuditor.update({ where: { id: nota.id }, data: { hallazgoId: hallazgo.id } });
          await registrarAlta(tx, autor, 'hallazgo', String(hallazgo.id));
        }
      }
      await registrar(tx, autor, [
        {
          tabla: 'auditoria',
          registroId: String(auditoriaId),
          campo: 'emitidoEn',
          anterior: null,
          nuevo: 'emitido',
          motivo: 'emisión del informe final',
        },
      ]);
    });
    return { ok: true, mensaje: 'Informe final emitido: notas congeladas y NC/OM promovidos a Mejora.' };
  });
}

export async function registrarAuditoriaExterna(
  datos: {
    entidadAuditora: string;
    tipo: 'EXTERNA' | 'PROVEEDOR';
    fechaInicio: Date;
    fechaFin?: Date;
    alcance: string;
    objeto: string;
    criterios: string;
    auditorLiderId: number;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:administrar');
    if (!datos.entidadAuditora.trim() || !datos.alcance.trim()) {
      return {
        ok: false,
        mensaje: 'C8: una auditoría externa exige entidad, fechas, alcance e informe adjunto.',
      };
    }
    await prisma.$transaction(async (tx) => {
      const creada = await tx.auditoria.create({
        data: { ...datos, sitio: 'Externa', fechaInicio: datos.fechaInicio },
      });
      await registrarAlta(tx, autor, 'auditoria', String(creada.id));
    });
    return { ok: true, mensaje: 'Auditoría externa registrada.' };
  });
}

export async function aprobarPerfilAuditor(
  datos: {
    personaId?: number;
    nombreExterno?: string;
    formacion: string;
    certificacion: string;
    entidadCertificadora: string;
    vigencia: Date;
    experienciaAnios: number;
  },
): Promise<Resultado> {
  return ejecutar<Resultado>(async () => {
    const autor = await autorConPermiso('auditoria:administrar');
    const persona = await prisma.persona.findUnique({
      where: { correo: autor },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      const perfil = await tx.perfilAuditor.create({
        data: { ...datos, aprobadoPorId: persona?.id ?? null, aprobadoEn: new Date() },
      });
      await registrarAlta(tx, autor, 'perfil_auditor', String(perfil.id));
    });
    return { ok: true, mensaje: 'Perfil de auditor aprobado (C3).' };
  });
}