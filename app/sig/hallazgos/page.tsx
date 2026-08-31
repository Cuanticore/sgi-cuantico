// app/sig/hallazgos/page.tsx
//
// La grilla del artboard Main.bcd: KPIs arriba, chips de tipo, toggles de vencidos y
// reincidentes, y la tabla con el semáforo del plazo. El estado se calcula (B3, B8).

import { prisma } from '@/lib/db';
import { estadoCalculado, vencidoContra } from '@/lib/sig/hallazgos';
import GrillaClient from './Grilla.client';

export const dynamic = 'force-dynamic';

export default async function HallazgosPage() {
  const hallazgos = await prisma.hallazgo.findMany({
    orderBy: [{ fechaDeteccion: 'desc' }],
    include: {
      area: { select: { nombre: true } },
      responsable: { select: { nombre: true } },
      detectadoPor: { select: { nombre: true } },
      analisis: true,
      acciones: { include: { asignacion: { select: { estado: true } } } },
      verificaciones: { select: { resultado: true } },
      hallazgoAnterior: { select: { codigo: true } },
    },
  });

  const hoy = new Date();
  const filas = hallazgos.map((h) => {
    const accionesAbiertas = h.acciones.filter((a) => a.asignacion.estado === 'PENDIENTE').length;
    const verificacionEficaz = h.verificaciones.some((v) => v.resultado === 'EFICAZ');
    const verificacionPendiente = h.acciones.some(
      (a) => a.papel === 'VERIFICACION' && a.asignacion.estado === 'PENDIENTE',
    );
    const estado = estadoCalculado({
      anuladoEn: h.anuladoEn,
      fechaCierre: h.fechaCierre,
      tieneAnalisis: h.analisis !== null,
      accionesAbiertas,
      verificacionEficaz,
      verificacionPendiente,
    });
    const vencido =
      estado === 'ABIERTO' || estado === 'EN_ANALISIS' || estado === 'EN_EJECUCION'
        ? vencidoContra(h.fechaCompromiso, hoy)
        : false;
    const dias = h.fechaCompromiso
      ? Math.round((h.fechaCompromiso.getTime() - hoy.getTime()) / 86400000)
      : null;
    return {
      id: h.id,
      codigo: h.codigo,
      descripcion: h.descripcion,
      requisito: h.requisitoIncumplido,
      tipo: h.tipo,
      origen: h.origen,
      origenReferencia: h.origenReferencia,
      responsable: h.responsable?.nombre ?? null,
      area: h.area?.nombre ?? null,
      reincidente: h.hallazgoAnteriorId !== null,
      estado,
      vencido,
      dias,
    };
  });

  const abiertos = filas.filter((f) => !['CERRADO', 'ANULADO'].includes(f.estado));
  const vencidos = abiertos.filter((f) => f.vencido);
  const verificadas = hallazgos.filter((h) => h.verificaciones.length > 0);
  const eficaces = verificadas.filter((h) =>
    h.verificaciones.some((v) => v.resultado === 'EFICAZ'),
  );

  const kpis = {
    abiertos: abiertos.length,
    totalAnio: hallazgos.length,
    vencidos: vencidos.length,
    masViejoDias:
      vencidos.length === 0
        ? 0
        : Math.max(...vencidos.map((f) => Math.abs(f.dias ?? 0))),
    tasaEficacia:
      verificadas.length === 0 ? null : Math.round((eficaces.length / verificadas.length) * 100),
    eficaciaDetalle: `${eficaces.length} de ${verificadas.length} verificadas`,
    reincidencia:
      hallazgos.length === 0
        ? 0
        : Math.round((filas.filter((f) => f.reincidente).length / hallazgos.length) * 100),
    reincidenciaDetalle: `${filas.filter((f) => f.reincidente).length} con antecesor`,
  };

  return <GrillaClient filas={filas} kpis={kpis} />;
}