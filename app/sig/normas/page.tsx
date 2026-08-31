// app/sig/normas/page.tsx
//
// El catálogo de numerales (decisión 3.1.1): norma, auditable, veces auditado.

import { prisma } from '@/lib/db';
import NormasClient from './Normas.client';

export const dynamic = 'force-dynamic';

export default async function NormasPage() {
  const [normas, celdas] = await Promise.all([
    prisma.normaAuditable.findMany({
      orderBy: { codigo: 'asc' },
      include: {
        requisitos: {
          include: { _count: { select: { celdas: true } } },
        },
      },
    }),
    prisma.celdaPlan.findMany({ select: { id: true, auditoriaId: true } }),
  ]);

  const auditoriasConCelda = new Set(celdas.map((c) => c.auditoriaId)).size;
  const filas = normas.map((n) => ({
    id: n.id,
    codigo: n.codigo,
    nombre: n.nombre,
    requisitos: n.requisitos.map((r) => ({
      id: r.id,
      numeral: r.numeral,
      titulo: r.titulo,
      auditable: r.auditable,
      veces: r._count.celdas,
      enAuditorias: new Set(celdas.filter((c) => c.id !== -1).map((c) => c.auditoriaId)).size,
    })),
  }));

  return <NormasClient filas={filas} totalAuditorias={auditoriasConCelda} />;
}