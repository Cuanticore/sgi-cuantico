// app/sgsi/eventos/page.tsx
//
// Eventos e incidentes de seguridad. La lista y el reporte.
//
// Vive bajo `/sgsi` porque es una sección de esa pestaña —«Operación del SGSI»— y no una
// pestaña propia: «operación» ya estaba tomada tres veces y por eso la pestaña se llama
// Actividades. Acá conserva su nombre porque ya no colisiona.

import { prisma } from '@/lib/db';
import { estadoDelEvento, horasHastaEvaluar, severidad, type Impacto } from '@/lib/sig/eventos';
import EventosClient from './Eventos.client';

export const dynamic = 'force-dynamic';

export default async function EventosPage() {
  const [eventos, lugares] = await Promise.all([
    prisma.eventoSeguridad.findMany({
      orderBy: { creadoEn: 'desc' },
      include: {
        reportadoPor: { select: { nombre: true } },
        donde: { select: { nombre: true } },
        impactos: true,
        categorias: { include: { categoria: { select: { nombre: true } } } },
        activos: { select: { activoId: true } },
      },
    }),
    prisma.lugarEvento.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
  ]);

  const filas = eventos.map((e) => {
    const impactos: Impacto[] = e.impactos.map((i) => ({ dimension: i.dimension, nivel: i.nivel }));
    return {
      codigo: e.codigo,
      descripcion: e.descripcion,
      fechaOcurrencia: e.fechaOcurrencia.toISOString().slice(0, 10),
      enCurso: e.enCurso,
      donde: e.donde?.nombre ?? null,
      reportadoPor: e.reportadoPor.nombre,
      creadoEn: e.creadoEn.toISOString().slice(0, 16).replace('T', ' '),
      veredicto: e.veredicto,
      // Los tres derivados. Ninguno está en la tabla.
      estado: estadoDelEvento({ veredicto: e.veredicto, fechaCierre: e.fechaCierre }),
      severidad: severidad(impactos),
      horasHastaEvaluar: horasHastaEvaluar(e.creadoEn, e.fechaEvaluacion),
      categorias: e.categorias.map((c) => c.categoria.nombre),
      activosAfectados: e.activos.length,
    };
  });

  return <EventosClient filas={filas} lugares={lugares.map((l) => ({ id: l.id, nombre: l.nombre }))} />;
}
