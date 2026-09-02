// app/estrategico/legal/page.tsx
//
// La grilla de requisitos legales con el semáforo de revisión vencida y el panel
// lateral del historial de evaluaciones (decisión 4 del plan).

import { prisma } from '@/lib/db';
import LegalClient from './Legal.client';

export const dynamic = 'force-dynamic';

export default async function LegalPage() {
  const requisitos = await prisma.requisitoLegal.findMany({
    orderBy: { consecutivo: 'asc' },
    include: {
      responsable: { select: { nombre: true } },
      evaluaciones: {
        orderBy: { fecha: 'desc' },
        include: { evaluadoPor: { select: { nombre: true } } },
      },
    },
  });

  const filas = requisitos.map((r) => {
    const ultima = r.evaluaciones[0];
    return {
      id: r.id,
      consecutivo: r.consecutivo,
      normatividad: r.normatividad,
      objeto: r.objeto,
      tipo: r.tipo,
      sistemaGestion: r.sistemaGestion,
      proceso: r.procesoEncargado ?? null,
      responsable: r.responsable?.nombre ?? null,
      periodicidad: r.periodicidadRevision,
      vigente: r.vigente,
      derogadoPor: r.normaQueDeroga,
      ultimoResultado: ultima?.resultado ?? null,
      evaluaciones: r.evaluaciones.map((e) => ({
        fecha: e.fecha.toISOString().slice(0, 10),
        resultado: e.resultado,
        evidencia: e.evidencia ?? null,
        evaluadoPor: e.evaluadoPor.nombre,
      })),
    };
  });

  // El formulario de alta necesita a quién asignar y qué proceso encargar. Se leen acá,
  // en el servidor, y no en el cliente: son catálogos, no estado de la pantalla.
  const [personas, areas] = await Promise.all([
    prisma.persona.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.area.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: { orden: 'asc' },
    }),
  ]);

  return <LegalClient filas={filas} personas={personas} areas={areas} />;
}