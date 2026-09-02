// app/sig/normas/page.tsx
//
// El catálogo de numerales (decisión 3.1.1): norma, auditable, veces auditado y cuándo
// fue la última vez.
//
// «Última vez» faltaba, y en su lugar había un campo `enAuditorias` que se calculaba así:
//
//     new Set(celdas.filter((c) => c.id !== -1).map((c) => c.auditoriaId)).size
//
// `c.id !== -1` es siempre cierto —ninguna celda tiene id −1—, así que el filtro no
// filtraba nada y CADA numeral recibía el mismo número: el total de auditorías con
// cualquier celda. Además nadie lo leía en el cliente. Se reemplaza por el dato que el
// lienzo pide, que sí es por numeral.

import { prisma } from '@/lib/db';
import NormasClient from './Normas.client';

export const dynamic = 'force-dynamic';

export default async function NormasPage() {
  const [normas, celdas] = await Promise.all([
    prisma.normaAuditable.findMany({
      orderBy: { codigo: 'asc' },
      include: {
        requisitos: {
          orderBy: { orden: 'asc' },
          include: { _count: { select: { celdas: true } } },
        },
      },
    }),
    prisma.celdaPlan.findMany({
      select: {
        auditoriaId: true,
        requisitoNormaId: true,
        auditoria: { select: { fechaInicio: true } },
        notas: { select: { hallazgoId: true } },
      },
    }),
  ]);

  // La última auditoría de cada numeral. Se calcula al leer: guardarla obligaría a
  // recordar actualizarla cada vez que se agrega una celda al plan, y ese es el tipo de
  // campo que queda viejo sin que nadie se entere.
  const ultimaPorRequisito = new Map<number, string>();
  for (const c of celdas) {
    const fecha = c.auditoria.fechaInicio.toISOString().slice(0, 10);
    const previa = ultimaPorRequisito.get(c.requisitoNormaId);
    if (previa === undefined || fecha > previa) {
      ultimaPorRequisito.set(c.requisitoNormaId, fecha);
    }
  }

  // Los hallazgos de cada numeral: notas de sus celdas que se promovieron a Mejora. La
  // columna existia con un «—» fijo en el cliente.
  const hallazgosPorRequisito = new Map<number, number>();
  for (const c of celdas) {
    const n = c.notas.filter((x) => x.hallazgoId !== null).length;
    if (n > 0) {
      hallazgosPorRequisito.set(c.requisitoNormaId, (hallazgosPorRequisito.get(c.requisitoNormaId) ?? 0) + n);
    }
  }

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
      ultimaVez: ultimaPorRequisito.get(r.id) ?? null,
      hallazgos: hallazgosPorRequisito.get(r.id) ?? 0,
    })),
  }));

  return <NormasClient filas={filas} totalAuditorias={auditoriasConCelda} />;
}
