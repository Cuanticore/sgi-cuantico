// app/sig/personas/page.tsx
//
// El censo con su rol derivado de los grupos (la aplicación no guarda roles), el estado,
// la última sincronización y el botón de sincronizar (A1) solo para quien administra.

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/lib/db';
import { puede, rolDesdeGrupos } from '@/lib/sgsi/permisos';
import { esVencida } from '@/lib/sig/cierre';
import PersonasClient from './Personas.client';

export const dynamic = 'force-dynamic';

export default async function PersonasPage() {
  const session = await getServerSession(authOptions);
  const rol = rolDesdeGrupos(session?.user?.grupos, session?.user?.email);
  const administra = puede(rol, 'personas:administrar');

  const [personas, pendientes] = await Promise.all([
    prisma.persona.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        area: { select: { nombre: true } },
        cargo: { select: { nombre: true } },
      },
    }),
    prisma.asignacion.findMany({
      where: { estado: 'PENDIENTE' },
      select: { personaId: true, fechaLimite: true },
    }),
  ]);

  const hoy = new Date();
  const porPersona = new Map<number, number>();
  for (const p of pendientes) {
    if (esVencida('PENDIENTE', p.fechaLimite, hoy)) {
      porPersona.set(p.personaId, (porPersona.get(p.personaId) ?? 0) + 1);
    }
  }

  const filas = personas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    correo: p.correo,
    area: p.area?.nombre ?? null,
    cargo: p.cargo?.nombre ?? null,
    activa: p.activa,
    sincronizadaEn: p.sincronizadaEn?.toISOString() ?? null,
    pendientes: porPersona.get(p.id) ?? 0,
  }));

  return <PersonasClient filas={filas} administra={administra} />;
}