// app/tecnologia/niveles/page.tsx
//
// Administración de la jerarquía de tres grados y de las plantillas por clase.
//
// **Esta pantalla no tiene lienzo.** La spec la lista como pantalla propia (§5) pero el
// paquete de diseño no la trae, así que se construyó desde el texto de la especificación.
// Queda anotado: si aparece un lienzo, esta pantalla es la primera candidata a revisarse.

import { prisma } from '@/lib/db';
import NivelesClient from './Niveles.client';

export const dynamic = 'force-dynamic';

export default async function NivelesPage() {
  const [niveles, conteos, plantilla, sinClasificar] = await Promise.all([
    prisma.nivelActivo.findMany({
      select: { id: true, grado: true, nombre: true, padreId: true, clase: true, activo: true },
      orderBy: [{ grado: 'asc' }, { orden: 'asc' }, { id: 'asc' }],
    }),
    prisma.activo.groupBy({ by: ['nivelId'], where: { activo: true }, _count: { _all: true } }),
    prisma.plantillaNivel.findMany({ orderBy: [{ claseNivel: 'asc' }, { orden: 'asc' }] }),
    // Los activos vigentes sin nivel. La migración NO los repartió a propósito —nadie dijo
    // a cuál pertenece cada uno— así que este número es el trabajo que falta, no un defecto.
    prisma.activo.count({ where: { activo: true, nivelId: null } }),
  ]);

  const porNivel = new Map<number, number>();
  for (const c of conteos) if (c.nivelId !== null) porNivel.set(c.nivelId, c._count._all);

  return (
    <NivelesClient
      niveles={niveles.map((n) => ({ ...n, activos: porNivel.get(n.id) ?? 0 }))}
      plantilla={plantilla.map((p) => ({
        claseNivel: p.claseNivel,
        nombreNivel3: p.nombreNivel3,
        activoEsperado: p.activoEsperado,
        obligatorio: p.obligatorio,
      }))}
      sinClasificar={sinClasificar}
    />
  );
}
