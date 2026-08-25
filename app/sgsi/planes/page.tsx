// app/sgsi/planes/page.tsx
//
// Handoff v2.1 screen 8, "Planes de tratamiento". PLA-SIG-02, ISO/IEC 27001:2022
// clauses 6.1.3 and 8.3.
//
// One row per ACTION, never per risk: the unit of management is the improvement of a
// control, because raising its maturity lowers every risk that control mitigates at
// once. Modelling it per risk would duplicate the same decision hundreds of times.

import { prisma } from '@/lib/db';
import PlanesTratamiento, {
  type AccionVista,
} from '@/app/components/sgsi/planes/PlanesTratamiento';

export const dynamic = 'force-dynamic';

export default async function PlanesPage() {
  const [acciones, paresMapeados, controles, cargos, madurez] = await Promise.all([
    prisma.accionPlan.findMany({
      where: { activa: true },
      orderBy: { codigo: 'asc' },
      include: {
        responsable: true,
        aprueba: true,
        madurezAlcanzada: true,
        control: {
          include: { capacidad: true, lineaBase: true, actual: true, objetivo: true },
        },
      },
    }),
    // The count of risks an action moves comes from the control's threat mappings,
    // recomputed against the real inventory — never imported from the prototype, whose
    // figures were calculated over a 17-asset sample.
    prisma.controlAmenaza.count(),
    // The popup's control combo shows code and name together, which is the form an
    // auditor reads.
    prisma.control.findMany({
      where: { aplica: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
    prisma.cargoResponsable.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.escalaMadurez.findMany({ orderBy: { nivel: 'asc' } }),
  ]);

  // With no relevance assigned the junction is empty, so the reach of an action is
  // unknown rather than zero. Rendering zero would understate every action in the plan.
  const alcanceCalculable = paresMapeados > 0;

  const riesgosPorControl = new Map<number, number>();
  if (alcanceCalculable) {
    const filas = await prisma.$queryRaw<{ control_id: number; n: bigint }[]>`
      select ca.control_id, count(distinct r.id) as n
      from control_amenaza ca
      join riesgo r on r.amenaza_id = ca.amenaza_id and r.obsoleto = false
      group by ca.control_id`;
    for (const f of filas) riesgosPorControl.set(f.control_id, Number(f.n));
  }

  const vista: AccionVista[] = acciones.map((a) => ({
    codigo: a.codigo,
    accion: a.accion,
    tipo: a.tipo,
    origen: a.origen,
    responsable: a.responsable.nombre,
    aprueba: a.aprueba.nombre,
    fechaObjetivo: a.fechaObjetivo?.toISOString().slice(0, 10) ?? null,
    fechaAprobacion: a.fechaAprobacion?.toISOString().slice(0, 10) ?? null,
    estado: a.estado,
    avance: a.avance,
    verificacion: a.verificacion,
    observacion: a.observacion,
    recursos: a.recursos,
    madurezAlcanzada: a.madurezAlcanzada?.nivel ?? null,
    justificacionAceptacion: a.justificacionAceptacion,
    control: a.control
      ? {
          codigo: a.control.codigo,
          nombre: a.control.nombre,
          capacidad: a.control.capacidad.nombre,
          lineaBase: a.control.lineaBase?.nivel ?? null,
          actual: a.control.actual?.nivel ?? null,
          objetivo: a.control.objetivo?.nivel ?? null,
        }
      : null,
    riesgosQueMueve: a.control ? (riesgosPorControl.get(a.control.id) ?? null) : null,
    // Ids for the edit popup's selects. The labels above are for reading; these are for
    // sending back.
    controlId: a.controlId,
    responsableId: a.responsableId,
    apruebaId: a.apruebaId,
    madurezAlcanzadaId: a.madurezAlcanzadaId,
    instrumento: a.instrumento,
    riesgoRemanente: a.riesgoRemanente,
    fechaRevisionAceptacion: a.fechaRevisionAceptacion?.toISOString().slice(0, 10) ?? null,
  }));

  return (
    <PlanesTratamiento
      acciones={vista}
      alcanceCalculable={alcanceCalculable}
      controles={controles}
      cargos={cargos.map((c) => ({ id: c.id, nombre: c.nombre }))}
      madurez={madurez.map((m) => ({ id: m.id, nivel: m.nivel, nombre: m.nombre }))}
    />
  );
}
