// app/sig/auditorias/externas/page.tsx
//
// C8: las externas y a proveedores se registran — entidad, fechas, alcance e informe.

import { prisma } from '@/lib/db';
import ExternasClient from './Externas.client';

export const dynamic = 'force-dynamic';

export default async function ExternasPage() {
  const externas = await prisma.auditoria.findMany({
    where: { tipo: { in: ['EXTERNA', 'PROVEEDOR'] } },
    orderBy: { fechaInicio: 'desc' },
    include: {
      auditorLider: { select: { nombre: true } },
      celdas: { include: { notas: true } },
    },
  });

  const filas = externas.map((a) => ({
    id: a.id,
    entidad: a.entidadAuditora ?? '—',
    tipo: a.tipo,
    fechaInicio: a.fechaInicio.toISOString().slice(0, 10),
    fechaFin: a.fechaFin?.toISOString().slice(0, 10) ?? null,
    alcance: a.alcance,
    objeto: a.objeto,
    lider: a.auditorLider.nombre,
    cerrada: a.cerradaEn !== null || a.emitidoEn !== null,
    hallazgos: a.celdas.flatMap((c) => c.notas.filter((n) => n.hallazgoId !== null)).length,
  }));

  // Quién responde por la auditoría del lado de Cuántico. Se lee en el servidor: es un
  // catálogo, no estado de la pantalla.
  const personas = await prisma.persona.findMany({
    where: { activa: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });

  return <ExternasClient filas={filas} personas={personas} />;
}