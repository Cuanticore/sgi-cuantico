// app/tecnologia/equipos/page.tsx
//
// **La consulta arranca en PERSONAS, no en activos.** Es la decisión entera de la pantalla:
// si partiera del inventario, quien no tiene nada asignado sencillamente no aparecería — y
// ése es justo el hueco que hace que un inventario de equipos no sirva.
//
// E9 · `personaId` es el custodio PERSONA; `custodioId` sigue siendo el cargo. Son dos cosas
// distintas: el cargo dice quién responde en el organigrama, la persona dice quién lo tiene
// en la mano. Esta pantalla lee la segunda.

import { prisma } from '@/lib/db';
import EquiposClient from './Equipos.client';

export const dynamic = 'force-dynamic';

export default async function EquiposPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const { f } = await searchParams;

  const [personas, sinCustodio] = await Promise.all([
    prisma.persona.findMany({
      where: { activa: true },
      select: {
        id: true,
        nombre: true,
        area: { select: { nombre: true } },
        activosACargo: {
          where: { activo: true },
          select: {
            id: true,
            codigo: true,
            nombre: true,
            tipo: { select: { nombre: true } },
          },
          orderBy: { codigo: 'asc' },
        },
      },
      orderBy: { nombre: 'asc' },
    }),
    // Los activos vigentes que no tienen custodio persona. No es lo mismo que «nadie los
    // usa»: es que nadie quedó registrado teniéndolos, y son los que no aparecerían en
    // ninguna fila de esta pantalla si no se contaran aparte.
    prisma.activo.count({ where: { activo: true, personaId: null } }),
  ]);

  return (
    <EquiposClient
      filtro={f ?? 'todas'}
      sinCustodio={sinCustodio}
      personas={personas.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        area: p.area?.nombre ?? null,
        activos: p.activosACargo.map((a) => ({
          id: a.id,
          codigo: a.codigo,
          nombre: a.nombre,
          tipo: a.tipo.nombre,
        })),
      }))}
    />
  );
}
