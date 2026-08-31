// app/estrategico/materializaciones/page.tsx
//
// FOR-CAL-08: los riesgos que dejaron de ser hipótesis, con su hallazgo en Mejora.

import { prisma } from '@/lib/db';
import MaterializacionesClient from './Materializaciones.client';

export const dynamic = 'force-dynamic';

export default async function MaterializacionesPage() {
  const [materializaciones, riesgos] = await Promise.all([
    prisma.materializacionRiesgo.findMany({
      orderBy: { fecha: 'desc' },
      include: {
        riesgo: { select: { codigo: true, descripcion: true, proceso: true } },
        reportante: { select: { nombre: true } },
        hallazgo: { select: { codigo: true, fechaCierre: true } },
      },
    }),
    prisma.riesgoOrganizacional.findMany({ where: { activo: true }, select: { id: true } }),
  ]);

  const filas = materializaciones.map((m) => ({
    id: m.id,
    riesgoCodigo: m.riesgo.codigo,
    riesgoDescripcion: m.riesgo.descripcion,
    proceso: m.riesgo.proceso,
    fecha: m.fecha.toISOString().slice(0, 10),
    evento: m.descripcionEvento,
    impacto: m.impactoGenerado,
    causaRaiz: m.causaRaiz,
    reportante: m.reportante.nombre,
    hallazgo: m.hallazgo
      ? { codigo: m.hallazgo.codigo, cerrado: m.hallazgo.fechaCierre !== null }
      : null,
  }));

  const conHallazgoAbierto = filas.filter((f) => f.hallazgo && !f.hallazgo.cerrado).length;
  const reincidentes = new Set(
    materializaciones.map((m) => m.riesgo.codigo).filter((c, i, arr) => arr.indexOf(c) !== i),
  );

  return (
    <MaterializacionesClient
      filas={filas}
      totalRiesgos={riesgos.length}
      conHallazgoAbierto={conHallazgoAbierto}
      reincidentes={[...reincidentes]}
    />
  );
}