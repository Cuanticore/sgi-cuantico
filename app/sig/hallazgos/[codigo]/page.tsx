// app/sig/hallazgos/[codigo]/page.tsx
//
// La ficha de cinco pestañas del artboard Hallazgo.bcd, con las marcas EXIGE del flujo
// escalonado. Las pestañas que el tipo no exige se atenúan, no se ocultan.

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { estadoCalculado, vencidoContra, exigeTabla } from '@/lib/sig/hallazgos';
import FichaClient from './Ficha.client';

export const dynamic = 'force-dynamic';

export default async function FichaHallazgoPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const h = await prisma.hallazgo.findUnique({
    where: { codigo },
    include: {
      area: { select: { nombre: true } },
      detectadoPor: { select: { nombre: true } },
      clasificadoPor: { select: { nombre: true } },
      responsable: { select: { id: true, nombre: true } },
      hallazgoAnterior: { select: { codigo: true, tipo: true } },
      analisis: { include: { realizadoPor: { select: { nombre: true } } } },
      extension: true,
      correccion: { include: { responsable: { select: { nombre: true } } } },
      acciones: {
        include: {
          asignacion: { include: { persona: { select: { nombre: true } } } },
        },
      },
      verificaciones: { include: { verificadoPor: { select: { nombre: true } } } },
    },
  });
  if (!h) notFound();

  const hoy = new Date();
  const estado = estadoCalculado({
    anuladoEn: h.anuladoEn,
    fechaCierre: h.fechaCierre,
    tieneAnalisis: h.analisis !== null,
    accionesAbiertas: h.acciones.filter((a) => a.asignacion.estado === 'PENDIENTE').length,
    verificacionEficaz: h.verificaciones.some((v) => v.resultado === 'EFICAZ'),
    verificacionPendiente: h.acciones.some(
      (a) => a.papel === 'VERIFICACION' && a.asignacion.estado === 'PENDIENTE',
    ),
  });
  const vencido = vencidoContra(h.fechaCompromiso, hoy);
  const exige = exigeTabla(h.tipo);
  const huboAccion = h.acciones.filter((a) => a.papel !== 'VERIFICACION').length > 0;
  const verificacionEficaz = h.verificaciones.some((v) => v.resultado === 'EFICAZ');

  return (
    <FichaClient
      hallazgo={{
        id: h.id,
        codigo: h.codigo,
        tipo: h.tipo,
        origen: h.origen,
        origenReferencia: h.origenReferencia,
        descripcion: h.descripcion,
        requisitoIncumplido: h.requisitoIncumplido,
        evidenciaObjetiva: h.evidenciaObjetiva,
        area: h.area?.nombre ?? '—',
        detectadoPor: h.detectadoPor?.nombre ?? '—',
        fechaDeteccion: h.fechaDeteccion.toISOString().slice(0, 10),
        responsable: h.responsable ?? null,
        fechaCompromiso: h.fechaCompromiso?.toISOString().slice(0, 10) ?? null,
        hallazgoAnterior: h.hallazgoAnterior ?? null,
        estado,
        vencido,
        exige,
        correccion: h.correccion
          ? { descripcion: h.correccion.descripcion, fecha: h.correccion.fecha.toISOString().slice(0, 10) }
          : null,
        analisis: h.analisis
          ? {
              metodo: h.analisis.metodo,
              desarrollo: h.analisis.desarrollo,
              causaRaiz: h.analisis.causaRaiz,
            }
          : null,
        extension: h.extension
          ? { existeEnOtraParte: h.extension.existeEnOtraParte, analisis: h.extension.analisis }
          : null,
        acciones: h.acciones.map((a) => ({
          id: a.id,
          papel: a.papel,
          titulo: a.asignacion.titulo ?? 'Acción',
          responsable: a.asignacion.persona.nombre,
          fechaLimite: a.asignacion.fechaLimite.toISOString().slice(0, 10),
          estado: a.asignacion.estado,
        })),
        verificaciones: h.verificaciones.map((v) => ({
          resultado: v.resultado,
          nota: v.nota ?? null,
          fecha: v.fecha.toISOString().slice(0, 10),
          verificadoPor: v.verificadoPor.nombre,
        })),
        huboAccion,
        verificacionEficaz,
      }}
    />
  );
}