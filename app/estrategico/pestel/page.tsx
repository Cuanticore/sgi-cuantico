// app/estrategico/pestel/page.tsx
//
// Las seis dimensiones con el efecto de cada entrada y sus riesgos originados. La
// dimensión sin riesgos queda señalada: suele significar que se llenó por cumplir.
//
// El año se elige con `?anio=`. Antes traía todos los años y descartaba todo menos el
// vigente: el PESTEL del año pasado viajaba hasta acá y no había forma de abrirlo.

import { prisma } from '@/lib/db';
import PestelClient from './Pestel.client';
import { catalogosDeRiesgo } from '@/app/estrategico/catalogos';
import { riesgosPorEntrada } from '@/app/estrategico/trazabilidad';

export const dynamic = 'force-dynamic';

export default async function PestelPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>;
}) {
  const { anio: anioParam } = await searchParams;

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

  const [catalogos, porEntrada] = await Promise.all([catalogosDeRiesgo(), riesgosPorEntrada('PESTEL')]);

  // Sin `?anio=` se muestra el vigente. El año calendario NO sirve de respaldo: con el
  // vigente en 2025 y hoy en 2026, abrir en un año vacío haría parecer que no existe.
  const pedido = Number(anioParam);
  const vigente = analisis.find((a) => a.vigente) ?? analisis[0] ?? null;
  const anioMostrado =
    Number.isInteger(pedido) && pedido >= 2000 && pedido <= 2100
      ? pedido
      : (vigente?.anio ?? new Date().getUTCFullYear());
  const delAnio = analisis.find((a) => a.anio === anioMostrado) ?? null;

  const entradas = (delAnio?.entradas ?? []).map((e) => ({
    id: e.id,
    casilla: e.casilla,
    texto: e.texto,
    efecto: e.efecto,
    riesgos: e._count.riesgos,
    originados: porEntrada.get(e.id) ?? [],
  }));

  return (
    <PestelClient
      analisisId={delAnio?.id ?? null}
      anio={delAnio?.anio ?? null}
      anioMostrado={anioMostrado}
      aniosConAnalisis={analisis.map((a) => a.anio).sort((x, y) => y - x)}
      acta={delAnio?.actaReferencia ?? null}
      entradas={entradas}
      catalogos={catalogos}
    />
  );
}