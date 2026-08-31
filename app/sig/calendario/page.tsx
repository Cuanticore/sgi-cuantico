// app/sig/calendario/page.tsx
//
// La malla mes/semana con las asignaciones en su fecha límite, tal como el lienzo:
// marcas por estado y un aside con el día seleccionado.

import { prisma } from '@/lib/db';
import CalendarioClient from './Calendario.client';

export const dynamic = 'force-dynamic';

export default async function CalendarioPage() {
  const asignaciones = await prisma.asignacion.findMany({
    select: {
      id: true,
      periodo: true,
      fechaLimite: true,
      estado: true,
      persona: { select: { nombre: true } },
      contenido: { select: { titulo: true, codigo: true, tipo: true } },
      obligacion: { include: { contenido: { select: { titulo: true, codigo: true, tipo: true } } } },
    },
  });

  const marcas = asignaciones.map((a) => ({
    id: a.id,
    fecha: a.fechaLimite.toISOString().slice(0, 10),
    estado: a.estado,
    persona: a.persona.nombre,
    titulo: a.contenido?.titulo ?? a.obligacion?.contenido.titulo ?? 'Puntual',
    codigo: a.contenido?.codigo ?? a.obligacion?.contenido.codigo ?? '—',
    periodo: a.periodo,
  }));

  return <CalendarioClient marcas={marcas} />;
}