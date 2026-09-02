// app/estrategico/dofa/page.tsx
//
// Los cuatro cuadrantes con el año y el acta que los aprueba. Cada entrada muestra
// cuántos riesgos originó (D2: la referencia, no el texto).
//
// El año se elige con `?anio=`. Antes esta consulta traía TODOS los años y descartaba
// todo menos el vigente: el DOFA del año pasado viajaba hasta acá y no había forma de
// abrirlo. El acta de un análisis de contexto es evidencia de auditoría.

import { prisma } from '@/lib/db';
import DofaClient from './Dofa.client';
import { catalogosDeRiesgo } from '@/app/estrategico/catalogos';
import { riesgosPorEntrada } from '@/app/estrategico/trazabilidad';

export const dynamic = 'force-dynamic';

export default async function DofaPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>;
}) {
  const { anio: anioParam } = await searchParams;

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

  // Sin `?anio=` se muestra el vigente, que es lo que hacía antes. El año calendario NO
  // sirve de respaldo: si el vigente es el de 2025 y hoy es 2026, abrir la pantalla en un
  // año vacío haría parecer que el análisis no existe.
  const pedido = Number(anioParam);
  const vigente = analisis.find((a) => a.vigente) ?? analisis[0] ?? null;
  const anioMostrado =
    Number.isInteger(pedido) && pedido >= 2000 && pedido <= 2100
      ? pedido
      : (vigente?.anio ?? new Date().getUTCFullYear());

  const delAnio = analisis.find((a) => a.anio === anioMostrado) ?? null;

  // El botón que el comentario de cabecera del cliente prometía —«+ Originar un riesgo
  // desde aquí»— no existía, y `crearRiesgoOrganizacional` estaba importada ahí sin
  // invocarse. Los catálogos que pide vienen de un solo lugar.
  const [catalogos, porEntrada] = await Promise.all([catalogosDeRiesgo(), riesgosPorEntrada('DOFA')]);

  const entradas = (delAnio?.entradas ?? []).map((e) => ({
    id: e.id,
    casilla: e.casilla,
    texto: e.texto,
    orden: e.orden,
    riesgos: e._count.riesgos,
    // Los riesgos concretos, no solo el conteo: es el camino inverso que pide el lienzo.
    originados: porEntrada.get(e.id) ?? [],
  }));

  return (
    <DofaClient
      analisisId={delAnio?.id ?? null}
      anio={delAnio?.anio ?? null}
      anioMostrado={anioMostrado}
      aniosConAnalisis={analisis.map((a) => a.anio).sort((x, y) => y - x)}
      acta={delAnio?.actaReferencia ?? null}
      aprobadoPor={delAnio?.aprobadoPor?.nombre ?? null}
      entradas={entradas}
      catalogos={catalogos}
    />
  );
}
