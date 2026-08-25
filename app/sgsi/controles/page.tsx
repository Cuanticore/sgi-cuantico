// app/sgsi/controles/page.tsx
//
// Handoff v2.1 screen 5, "Controles y madurez".
//
// The server reads; the arithmetic lives in lib/sgsi/madurez.ts and runs again in the
// browser, so dragging a maturity select recomputes the header, the six filter cards
// and both analysis cards without a round trip — and both sides use one implementation.

import { prisma } from '@/lib/db';
import ControlesMadurez, {
  type ControlVista,
} from '@/app/components/sgsi/controles/ControlesMadurez';

export const dynamic = 'force-dynamic';

export default async function ControlesPage() {
  const [controles, capacidades, dominios] = await Promise.all([
    prisma.control.findMany({
      orderBy: { codigo: 'asc' },
      include: {
        dominio: true,
        capacidad: true,
        lineaBase: true,
        actual: true,
        objetivo: true,
        amenazas: { include: { amenaza: true } },
        acciones: { where: { activa: true }, select: { codigo: true, estado: true } },
        evidencias: { orderBy: [{ esBase: 'desc' }, { orden: 'asc' }] },
      },
    }),
    prisma.capacidadOperativa.findMany({ orderBy: { orden: 'asc' } }),
    prisma.dominioAnexoA.findMany({ orderBy: { orden: 'asc' } }),
  ]);

  const vista: ControlVista[] = controles.map((c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    dominio: c.dominio.nombre,
    capacidad: c.capacidad.nombre,
    // The 164px column cannot fit the full ISO name, but the filter still matches on
    // the long one, so the view carries both.
    capacidadCorta: c.capacidad.nombreCorto,
    aplica: c.aplica,
    lineaBase: c.lineaBase?.nivel ?? null,
    actual: c.actual?.nivel ?? null,
    objetivo: c.objetivo?.nivel ?? null,
    evidencias: c.evidencias.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      texto: e.texto,
      // The base entry is the one that justified the rating; it carries no delete button.
      esBase: e.esBase,
      creadaPor: e.creadaPor,
    })),
    amenazas: c.amenazas.map((a) => ({ codigo: a.amenaza.codigo, nombre: a.amenaza.nombre })),
    accion: c.acciones[0] ? { codigo: c.acciones[0].codigo, estado: c.acciones[0].estado } : null,
    justificacion: c.aplica ? null : c.evidencia,
  }));

  return (
    <ControlesMadurez
      controles={vista}
      capacidades={capacidades.map((c) => c.nombre)}
      dominios={dominios.map((d) => d.nombre)}
    />
  );
}
