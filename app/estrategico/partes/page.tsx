// app/estrategico/partes/page.tsx
//
// MAT-EST-02: la grilla agrupada por tipo con el mapa poder×interés y la ficha de
// cada necesidad con su seguimiento año por año.

import { prisma } from '@/lib/db';
import PartesClient from './Partes.client';

export const dynamic = 'force-dynamic';

export default async function PartesPage() {
  const partes = await prisma.parteInteresada.findMany({
    where: { activa: true },
    orderBy: { descripcion: 'asc' },
    include: {
      necesidades: {
        include: { seguimiento: { orderBy: { anio: 'desc' } }, responsable: { select: { nombre: true } } },
      },
    },
  });

  const filas = partes.map((p) => ({
    id: p.id,
    tipo: p.tipo,
    descripcion: p.descripcion,
    necesidades: p.necesidades.map((n) => ({
      id: n.id,
      texto: n.texto,
      clase: n.clase,
      poder: n.poder,
      interes: n.interes,
      banderas: [
        n.generaRequisitosSgsi ? 'SGSI' : null,
        n.requisitoCambioClimatico ? 'CLIMA' : null,
        n.requiereCambioAlcanceSig ? 'ALC' : null,
      ].filter(Boolean) as string[],
      responsable: n.responsable?.nombre ?? null,
      seguimiento: n.seguimiento.map((s) => ({
        anio: s.anio,
        planAccion: s.planAccion ?? '',
        seguimiento: s.seguimiento ?? '',
        evidencia: s.evidencia ?? '',
      })),
    })),
  }));

  return <PartesClient filas={filas} />;
}