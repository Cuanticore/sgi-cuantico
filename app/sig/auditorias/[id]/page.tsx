// app/sig/auditorias/[id]/page.tsx
//
// La ficha de cuatro pestañas: Plan (matriz proceso × numeral), Ejecución (notas por
// tipo), Actas y Informe (preliminar/final con la emisión que promueve a Mejora).

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { estadoAuditoria } from '@/lib/sig/auditorias';
import AuditoriaClient from './Auditoria.client';

export const dynamic = 'force-dynamic';

export default async function FichaAuditoriaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const a = await prisma.auditoria.findUnique({
    where: { id: Number(id) },
    include: {
      auditorLider: { select: { nombre: true } },
      programada: { include: { responsable: { select: { nombre: true } } } },
      celdas: {
        include: { notas: { include: { auditor: { select: { nombre: true } } } }, requisito: true },
      },
      actas: true,
      informes: true,
      equipo: { include: { persona: { select: { nombre: true } } } },
    },
  });
  if (!a) notFound();

  const notas = a.celdas.flatMap((c) =>
    c.notas.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      texto: n.notaEvidencia,
      numeral: c.requisito.numeral,
      proceso: c.procesoRef,
      auditor: n.auditor.nombre,
      hallazgo: n.hallazgoId !== null,
    })),
  );

  const estado = estadoAuditoria({
    emitidoEn: a.emitidoEn,
    cerradaEn: a.cerradaEn,
    notas: notas.length,
    preliminar: a.informes.some((i) => i.version === 'PRELIMINAR'),
  });

  const conteos = {
    notas: notas.length,
    NC: notas.filter((n) => n.tipo === 'NC').length,
    OM: notas.filter((n) => n.tipo === 'OM').length,
    RM: notas.filter((n) => n.tipo === 'RM').length,
    FORTALEZA: notas.filter((n) => n.tipo === 'FORTALEZA').length,
  };

  return (
    <AuditoriaClient
      auditoria={{
        id: a.id,
        objeto: a.objeto,
        alcance: a.alcance,
        sitio: a.sitio,
        fechaInicio: a.fechaInicio.toISOString().slice(0, 10),
        fechaFin: a.fechaFin?.toISOString().slice(0, 10) ?? null,
        lider: a.auditorLider.nombre,
        equipo: a.equipo.map((e) => e.persona?.nombre ?? e.nombreExterno ?? ''),
        estado,
        emitido: a.emitidoEn !== null,
        conteos,
        notas,
        celdas: a.celdas.map((c) => ({
          id: c.id,
          proceso: c.procesoRef,
          numeral: c.requisito.numeral,
          hora: c.hora ?? null,
          planificada: c.planificada,
        })),
        actas: a.actas.map((x) => ({
          tipo: x.tipo,
          fecha: x.fecha.toISOString().slice(0, 10),
          asistentes: x.asistentes,
          contenido: x.contenido,
        })),
        informes: a.informes.map((i) => ({
          version: i.version,
          conclusiones: i.conclusiones,
          recomendaciones: i.recomendaciones,
          emitido: i.emitidoEn !== null,
        })),
      }}
    />
  );
}