// app/sig/calendario/page.tsx
//
// La malla mes/semana con las asignaciones en su fecha límite, tal como el lienzo:
// marcas por estado, chips de área y un aside con el día seleccionado.
//
// El área sale de la persona asignada, no de la obligación. El alcance de la obligación
// puede ser TODOS y aun así cada asignación cae en el área de quien la debe — que es lo
// que un líder filtra cuando quiere ver el mes de SU área.

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
      persona: { select: { nombre: true, area: { select: { nombre: true } } } },
      contenido: { select: { titulo: true, codigo: true, tipo: true } },
      obligacion: { include: { contenido: { select: { titulo: true, codigo: true, tipo: true } } } },
    },
  });

  const marcas = asignaciones.map((a) => ({
    id: a.id,
    fecha: a.fechaLimite.toISOString().slice(0, 10),
    estado: a.estado,
    persona: a.persona.nombre,
    area: a.persona.area?.nombre ?? null,
    titulo: a.contenido?.titulo ?? a.obligacion?.contenido.titulo ?? 'Puntual',
    codigo: a.contenido?.codigo ?? a.obligacion?.contenido.codigo ?? '—',
    periodo: a.periodo,
  }));

  // Las áreas que REALMENTE tienen asignaciones, no el catálogo entero: un chip que
  // siempre filtra a cero no es un filtro, es una decepción.
  const areas = [...new Set(marcas.map((m) => m.area).filter((a): a is string => a !== null))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  );

  return <CalendarioClient marcas={marcas} areas={areas} />;
}
