// app/estrategico/pestel/page.tsx
//
// Las seis dimensiones con el efecto de cada entrada y sus riesgos originados. La
// dimensión sin riesgos queda señalada: suele significar que se llenó por cumplir.

import { prisma } from '@/lib/db';
import PestelClient from './Pestel.client';
import { catalogosDeRiesgo } from '@/app/estrategico/catalogos';

export const dynamic = 'force-dynamic';

export default async function PestelPage() {
  const analisis = await prisma.analisisContexto.findMany({
    where: { tipo: 'PESTEL' },
    orderBy: { anio: 'desc' },
    include: {
      aprobadoPor: { select: { nombre: true } },
      entradas: {
        include: { _count: { select: { riesgos: true } } },
      },
    },
  });

  const catalogos = await catalogosDeRiesgo();

  const vigente = analisis.find((a) => a.vigente) ?? analisis[0] ?? null;
  const entradas = (vigente?.entradas ?? []).map((e) => ({
    id: e.id,
    casilla: e.casilla,
    texto: e.texto,
    efecto: e.efecto,
    riesgos: e._count.riesgos,
  }));

  return (
    <PestelClient
      analisisId={vigente?.id ?? null}
      anio={vigente?.anio ?? null}
      acta={vigente?.actaReferencia ?? null}
      entradas={entradas}
      catalogos={catalogos}
    />
  );
}