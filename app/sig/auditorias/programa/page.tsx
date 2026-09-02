// app/sig/auditorias/programa/page.tsx
//
// FOR-CAL-04: el programa anual de auditoría. Esta pantalla NO existía.
//
// `/sig/auditorias` es la lista plana de auditorías ejecutadas; el lienzo Programa pide
// otra cosa: el programa del año con su alcance, objetivo, criterios y métodos, y la
// matriz de procesos por mes. Los dos modelos estaban —`ProgramaAuditoria` y
// `AuditoriaProgramada`— y las tres acciones que los escriben no tenían quien las llamara.
//
// Y el corte era más profundo: `crearAuditoria` exige un perfil de auditor aprobado (C3) y
// `aprobarPerfilAuditor` tampoco tenía llamador. Con el primer eslabón roto, NINGUNA
// auditoría interna se podía crear desde la aplicación.

import { prisma } from '@/lib/db';
import ProgramaClient from './Programa.client';

export const dynamic = 'force-dynamic';

export default async function ProgramaPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>;
}) {
  const { anio: anioParam } = await searchParams;
  const pedido = Number(anioParam);
  const anio =
    Number.isInteger(pedido) && pedido >= 2000 && pedido <= 2100
      ? pedido
      : new Date().getUTCFullYear();

  const [programa, personas, areas, perfiles, aniosConPrograma] = await Promise.all([
    prisma.programaAuditoria.findUnique({
      where: { anio },
      include: {
        aprobadoPor: { select: { nombre: true } },
        programadas: {
          include: {
            responsable: { select: { id: true, nombre: true } },
            auditorias: {
              select: { id: true, emitidoEn: true, cerradaEn: true, fechaInicio: true },
            },
          },
        },
      },
    }),
    prisma.persona.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.area.findMany({
      where: { activa: true },
      select: { nombre: true },
      orderBy: { orden: 'asc' },
    }),
    // Los perfiles aprobados son la puerta de C3: sin uno, `crearAuditoria` rechaza.
    prisma.perfilAuditor.findMany({
      orderBy: { id: 'desc' },
      include: {
        persona: { select: { id: true, nombre: true } },
        aprobadoPor: { select: { nombre: true } },
      },
    }),
    prisma.programaAuditoria.findMany({ select: { anio: true }, orderBy: { anio: 'desc' } }),
  ]);

  const filas = (programa?.programadas ?? []).map((p) => {
    // Los meses se guardan como texto —«2» o «2,8»— porque una auditoría puede programarse
    // más de una vez al año. Se parsea acá y lo que no sea un mes del 1 al 12 se descarta
    // en silencio: la matriz no puede pintar una columna que no existe.
    const meses = p.meses
      .split(/[,;\s]+/)
      .map((m) => Number(m))
      .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
    const ejecutada = p.auditorias.find((a) => a.emitidoEn !== null);
    const abierta = p.auditorias.find((a) => a.emitidoEn === null);
    return {
      id: p.id,
      proceso: p.procesoRef,
      meses,
      tipo: p.tipo,
      responsable: p.responsable.nombre,
      plazoInformeDias: p.plazoInformeDias,
      estado: ejecutada ? 'EJECUTADA' : abierta ? 'EN_CURSO' : 'PLANEADA',
      auditoriaId: (ejecutada ?? abierta)?.id ?? null,
    };
  });

  return (
    <ProgramaClient
      anio={anio}
      aniosConPrograma={aniosConPrograma.map((a) => a.anio)}
      programa={
        programa
          ? {
              id: programa.id,
              alcance: programa.alcance,
              objetivo: programa.objetivo,
              criterios: programa.criterios,
              metodos: programa.metodos,
              aprobadoPor: programa.aprobadoPor?.nombre ?? null,
              fechaAprobacion: programa.fechaAprobacion?.toISOString().slice(0, 10) ?? null,
            }
          : null
      }
      filas={filas}
      personas={personas}
      procesos={areas.map((a) => a.nombre)}
      perfiles={perfiles.map((p) => ({
        id: p.id,
        nombre: p.persona?.nombre ?? p.nombreExterno ?? '—',
        personaId: p.persona?.id ?? null,
        externo: p.persona === null,
        certificacion: p.certificacion,
        entidadCertificadora: p.entidadCertificadora,
        vigencia: p.vigencia.toISOString().slice(0, 10),
        experienciaAnios: p.experienciaAnios,
        aprobadoPor: p.aprobadoPor?.nombre ?? null,
        aprobadoEn: p.aprobadoEn?.toISOString().slice(0, 10) ?? null,
      }))}
    />
  );
}
