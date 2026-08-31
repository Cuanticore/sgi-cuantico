// app/sig/tareas/page.tsx
//
// La lista plana de asignaciones con la banda de acciones masivas: reasignar, prorrogar
// y anular, cada una con su motivo obligatorio en el servidor (R6, R7, R9).

import { prisma } from '@/lib/db';
import TareasClient from './Tareas.client';

export const dynamic = 'force-dynamic';

export default async function TareasPage() {
  const [asignaciones, personas] = await Promise.all([
    prisma.asignacion.findMany({
      orderBy: [{ fechaLimite: 'asc' }],
      include: {
        persona: { select: { nombre: true } },
        contenido: { select: { titulo: true, codigo: true, tipo: true } },
        obligacion: {
          include: {
            contenido: { select: { titulo: true, codigo: true, tipo: true, procedimientoOrigen: true } },
          },
        },
      },
    }),
    prisma.persona.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ]);

  const hoyIso = new Date().toISOString().slice(0, 10);

  const filas = asignaciones.map((a) => ({
    id: a.id,
    codigo: a.contenido?.codigo ?? a.obligacion?.contenido.codigo ?? '—',
    titulo: a.contenido?.titulo ?? a.obligacion?.contenido.titulo ?? a.titulo ?? 'Puntual',
    tipo: a.contenido?.tipo ?? a.obligacion?.contenido.tipo ?? 'TAREA',
    origen: a.obligacion?.contenido.procedimientoOrigen ?? null,
    persona: a.persona.nombre,
    periodo: a.periodo,
    fechaLimite: a.fechaLimite.toISOString().slice(0, 10),
    estado: a.estado,
    vencida: a.estado === 'PENDIENTE' && a.fechaLimite.toISOString().slice(0, 10) < hoyIso,
  }));

  return <TareasClient filas={filas} personas={personas} />;
}