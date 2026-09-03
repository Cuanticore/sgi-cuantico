// app/sgsi/verificaciones/page.tsx
//
// Verificaciones programadas. La lista y la ficha en una sola ruta, como el lienzo.
//
// **Una verificación programada NO es una entidad nueva.** Es una `Obligacion` cuyo
// contenido es una lista de verificación: los `ItemVerificacion` del contenido son los
// puntos, las `Asignacion` son los ciclos, y lo único propio es el resultado de cada uno.
// Por eso esta consulta arranca en `obligacion` y no en una tabla de verificaciones que no
// existe — construirla habría duplicado el calendario, los vencimientos y los avisos.

import { prisma } from '@/lib/db';
import { estadoDeVerificacion } from '@/lib/sig/verificaciones';
import VerificacionesClient from './Verificaciones.client';

export const dynamic = 'force-dynamic';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function VerificacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const hoy = new Date();

  const obligaciones = await prisma.obligacion.findMany({
    where: { activa: true, contenido: { tipo: 'VERIFICACION' } },
    include: {
      contenido: {
        select: {
          titulo: true,
          descripcion: true,
          items: { select: { id: true, orden: true, texto: true }, orderBy: { orden: 'asc' } },
        },
      },
      responsableSeguimiento: { select: { nombre: true } },
      asignaciones: {
        orderBy: { fechaApertura: 'desc' },
        include: {
          persona: { select: { nombre: true } },
          ejecucion: {
            include: {
              hallazgo: { select: { codigo: true } },
              registradoPor: { select: { nombre: true } },
            },
          },
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  const lista = obligaciones.map((o) => ({
    id: o.id,
    titulo: o.contenido.titulo,
    control: o.controlAnexoA,
    responsable: o.responsableSeguimiento.nombre,
    periodicidad: o.periodicidad,
    anclaje: o.anclaje,
    esProveedor: o.esProveedor,
    // Derivado al leer: no hay columna «estado» en la obligación, y no debe haberla —
    // cambiaría sola al pasar un día y quedaría vieja.
    estado: estadoDeVerificacion(
      o.asignaciones.map((a) => ({ fechaLimite: a.fechaLimite, fechaCierre: a.fechaCierre })),
      hoy,
      o.diasAviso,
    ),
  }));

  const elegidaId = v !== undefined && /^\d+$/.test(v) ? Number(v) : (obligaciones[0]?.id ?? null);
  const elegida = obligaciones.find((o) => o.id === elegidaId) ?? obligaciones[0] ?? null;

  return (
    <VerificacionesClient
      lista={lista}
      elegidaId={elegida?.id ?? null}
      ficha={
        elegida === null
          ? null
          : {
              id: elegida.id,
              titulo: elegida.contenido.titulo,
              descripcion: elegida.contenido.descripcion,
              control: elegida.controlAnexoA,
              responsable: elegida.responsableSeguimiento.nombre,
              periodicidad: elegida.periodicidad,
              anclaje: elegida.anclaje,
              esProveedor: elegida.esProveedor,
              puntos: elegida.contenido.items.map((i) => ({ id: i.id, texto: i.texto })),
              ejecuciones: elegida.asignaciones.map((a) => ({
                asignacionId: a.id,
                periodo: a.periodo,
                fechaLimite: iso(a.fechaLimite),
                fechaCierre: a.fechaCierre === null ? null : iso(a.fechaCierre),
                asignadaA: a.persona.nombre,
                resultado: a.ejecucion?.resultado ?? null,
                nota: a.ejecucion?.nota ?? null,
                autor: a.ejecucion?.registradoPor?.nombre ?? null,
                hallazgo: a.ejecucion?.hallazgo?.codigo ?? null,
              })),
            }
      }
      hoy={iso(hoy)}
    />
  );
}
