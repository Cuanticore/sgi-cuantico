// app/estrategico/dofa/page.tsx
//
// Los cuatro cuadrantes con el año y el acta que los aprueba. Cada entrada muestra
// cuántos riesgos originó (D2: la referencia, no el texto).

import { prisma } from '@/lib/db';
import DofaClient from './Dofa.client';

export const dynamic = 'force-dynamic';

export default async function DofaPage() {
  const analisis = await prisma.analisisContexto.findMany({
    where: { tipo: 'DOFA' },
    orderBy: { anio: 'desc' },
    include: {
      aprobadoPor: { select: { nombre: true } },
      entradas: {
        include: { _count: { select: { riesgos: true } } },
      },
    },
  });

  const vigente = analisis.find((a) => a.vigente) ?? analisis[0] ?? null;
  const entradas = (vigente?.entradas ?? []).map((e) => ({
    id: e.id,
    casilla: e.casilla,
    texto: e.texto,
    orden: e.orden,
    riesgos: e._count.riesgos,
  }));

  return (
    <DofaClient
      anio={vigente?.anio ?? null}
      acta={vigente?.actaReferencia ?? null}
      aprobadoPor={vigente?.aprobadoPor?.nombre ?? null}
      entradas={entradas}
    />
  );
}