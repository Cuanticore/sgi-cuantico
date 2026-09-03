// app/sgsi/eventos/[codigo]/page.tsx
//
// La ficha del evento, con sus cuatro etapas: Evaluación, Clasificación, Tratamiento y
// Cierre.
//
// **O4 · las tres últimas se atenúan si el veredicto no es incidente.** Con observación o
// falso positivo el evento se archivó en la evaluación y no hay nada más que hacer — pero
// las etapas se siguen dibujando, atenuadas, para que se vea que existen y por qué no
// aplican. Ocultarlas haría parecer que un archivado y un incidente son el mismo objeto con
// distinta suerte.

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import {
  correspondeLevantarHallazgo,
  estadoDelEvento,
  horasHastaEvaluar,
  severidad,
  type Impacto,
} from '@/lib/sig/eventos';
import EventoClient from './Evento.client';

export const dynamic = 'force-dynamic';

export default async function FichaEventoPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;

  const [evento, categorias, motivaciones, activos] = await Promise.all([
    prisma.eventoSeguridad.findUnique({
      where: { codigo: decodeURIComponent(codigo) },
      include: {
        reportadoPor: { select: { nombre: true } },
        evaluadoPor: { select: { nombre: true } },
        cerradoPor: { select: { nombre: true } },
        donde: { select: { nombre: true } },
        motivacion: { select: { nombre: true } },
        impactos: true,
        categorias: { include: { categoria: { select: { id: true, nombre: true } } } },
        activos: { include: { activo: { select: { id: true, codigo: true, nombre: true } } } },
        acciones: { include: { autor: { select: { nombre: true } } }, orderBy: { momento: 'asc' } },
      },
    }),
    prisma.categoriaIncidente.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
    prisma.motivacionIncidente.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
    prisma.activo.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true },
      orderBy: { codigo: 'asc' },
      take: 400,
    }),
  ]);
  if (!evento) notFound();

  const impactos: Impacto[] = evento.impactos.map((i) => ({ dimension: i.dimension, nivel: i.nivel }));

  return (
    <EventoClient
      evento={{
        codigo: evento.codigo,
        descripcion: evento.descripcion,
        fechaOcurrencia: evento.fechaOcurrencia.toISOString().slice(0, 10),
        enCurso: evento.enCurso,
        donde: evento.donde?.nombre ?? null,
        otrosEnterados: evento.otrosEnterados,
        reportadoPor: evento.reportadoPor.nombre,
        creadoEn: evento.creadoEn.toISOString().slice(0, 16).replace('T', ' '),
        veredicto: evento.veredicto,
        justificacion: evento.justificacion,
        evaluadoPor: evento.evaluadoPor?.nombre ?? null,
        fechaEvaluacion: evento.fechaEvaluacion?.toISOString().slice(0, 16).replace('T', ' ') ?? null,
        motivacion: evento.motivacion?.nombre ?? null,
        causaRaiz: evento.causaRaiz,
        leccionAprendida: evento.leccionAprendida,
        costoRecuperacion: evento.costoRecuperacion === null ? null : Number(evento.costoRecuperacion),
        costoImpacto: evento.costoImpacto === null ? null : Number(evento.costoImpacto),
        fechaCierre: evento.fechaCierre?.toISOString().slice(0, 10) ?? null,
        cerradoPor: evento.cerradoPor?.nombre ?? null,
        // Los tres derivados.
        estado: estadoDelEvento({ veredicto: evento.veredicto, fechaCierre: evento.fechaCierre }),
        severidad: severidad(impactos),
        horasHastaEvaluar: horasHastaEvaluar(evento.creadoEn, evento.fechaEvaluacion),
        correspondeHallazgo: correspondeLevantarHallazgo(evento.veredicto, impactos),
      }}
      impactos={impactos}
      categoriasElegidas={evento.categorias.map((c) => c.categoria.id)}
      activosAfectados={evento.activos.map((a) => ({
        id: a.activo.id,
        etiqueta: `${a.activo.codigo ?? `#${a.activo.id}`} · ${a.activo.nombre}`,
      }))}
      acciones={evento.acciones.map((a) => ({
        id: a.id,
        fase: a.fase,
        momento: a.momento.toISOString().slice(0, 16).replace('T', ' '),
        texto: a.texto,
        autor: a.autor?.nombre ?? null,
      }))}
      catalogos={{
        categorias: categorias.map((c) => ({ id: c.id, nombre: c.nombre })),
        motivaciones: motivaciones.map((m) => ({ id: m.id, nombre: m.nombre })),
        activos: activos.map((a) => ({ id: a.id, etiqueta: `${a.codigo ?? `#${a.id}`} · ${a.nombre}` })),
      }}
    />
  );
}
