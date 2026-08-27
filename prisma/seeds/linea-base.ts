// prisma/seeds/linea-base.ts
//
// The GAP Análisis ISO/IEC 27001:2022 · CUANTICO · 2 de marzo de 2026: the baseline the
// whole iteration reads against. It is data, not a literal in the UI: the sidebar, the
// hero card, the comparison axis, the radar legend and the control popup all render the
// label from this row, so a future cut only changes this file.

import type { PrismaClient } from '@prisma/client';

export const LINEA_BASE = {
  nombre: 'GAP 2 mar 2026',
  fecha: '2026-03-02',
} as const;

export async function seedLineaBase(prisma: PrismaClient): Promise<void> {
  await prisma.lineaBase.upsert({
    where: { nombre: LINEA_BASE.nombre },
    update: { fecha: new Date(LINEA_BASE.fecha + 'T00:00:00.000Z') },
    create: {
      id: 1,
      nombre: LINEA_BASE.nombre,
      fecha: new Date(LINEA_BASE.fecha + 'T00:00:00.000Z'),
      creadaPor: 'semilla',
      snapshot: {},
    },
  });
}
