import 'server-only';

// app/estrategico/catalogos.ts
//
// Los catálogos que pide originar un riesgo desde una entrada del contexto. DOFA y PESTEL
// necesitan exactamente los mismos cinco, y dos páginas con las mismas cinco consultas
// escritas a mano es cómo terminan mostrando listas distintas.

import { prisma } from '@/lib/db';
import type { CatalogosRiesgo } from './OriginarRiesgo.client';

export async function catalogosDeRiesgo(): Promise<CatalogosRiesgo> {
  const [factores, probabilidades, impactos, personas, areas] = await Promise.all([
    prisma.factorRiesgo.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.escalaProbabilidad.findMany({
      select: { id: true, valor: true, etiqueta: true },
      orderBy: { valor: 'asc' },
    }),
    prisma.escalaImpactoRiesgo.findMany({
      select: { id: true, valor: true, etiqueta: true },
      orderBy: { valor: 'asc' },
    }),
    prisma.persona.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.area.findMany({
      where: { activa: true },
      select: { nombre: true },
      orderBy: { orden: 'asc' },
    }),
  ]);

  return { factores, probabilidades, impactos, personas, procesos: areas.map((a) => a.nombre) };
}
