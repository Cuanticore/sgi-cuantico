// app/estrategico/dofa/page.tsx
//
// Los cuatro cuadrantes con el año y el acta que los aprueba. Cada entrada muestra
// cuántos riesgos originó (D2: la referencia, no el texto).

import { prisma } from '@/lib/db';
import DofaClient from './Dofa.client';
import { catalogosDeRiesgo } from '@/app/estrategico/catalogos';
import { riesgosPorEntrada } from '@/app/estrategico/trazabilidad';

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

  // El botón que el comentario de cabecera del cliente prometía —«+ Originar un riesgo
  // desde aquí»— no existía, y `crearRiesgoOrganizacional` estaba importada ahí sin
  // invocarse. Los catálogos que pide vienen de un solo lugar.
  const [catalogos, porEntrada] = await Promise.all([catalogosDeRiesgo(), riesgosPorEntrada('DOFA')]);

  const vigente = analisis.find((a) => a.vigente) ?? analisis[0] ?? null;
  const entradas = (vigente?.entradas ?? []).map((e) => ({
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
      analisisId={vigente?.id ?? null}
      anio={vigente?.anio ?? null}
      acta={vigente?.actaReferencia ?? null}
      aprobadoPor={vigente?.aprobadoPor?.nombre ?? null}
      entradas={entradas}
      catalogos={catalogos}
    />
  );
}