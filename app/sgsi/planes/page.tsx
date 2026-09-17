// app/sgsi/planes/page.tsx
//
// Handoff v2.1 screen 8, "Planes de tratamiento". PLA-SIG-02, ISO/IEC 27001:2022
// clauses 6.1.3 and 8.3.
//
// One row per ACTION, never per risk: the unit of management is the improvement of a
// control, because raising its maturity lowers every risk that control mitigates at
// once. Modelling it per risk would duplicate the same decision hundreds of times.

import { prisma } from '@/lib/db';
import { leerDeudaPlanes } from '@/lib/sgsi/deuda-planes-lectura';
import { alcanceDelPlan, type RiesgoDelAlcance } from '@/lib/sgsi/alcance-plan';
import PlanesTratamiento, {
  type AccionVista,
} from '@/app/components/sgsi/planes/PlanesTratamiento';

export const dynamic = 'force-dynamic';

export default async function PlanesPage() {
  const [acciones, paresMapeados, controles, cargos, madurez, deuda] = await Promise.all([
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
    // auditor reads. Only applicable controls can carry an action ("no aplica" has no
    // maturity by constraint), and PARCIAL counts as applicable.
    prisma.control.findMany({
      where: { soa: { not: 'NO' } },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombre: true },
    }),
    prisma.cargoResponsable.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.escalaMadurez.findMany({ orderBy: { nivel: 'asc' } }),
    // REQ-SIG-20 §7.3 (tarea 4.17) — la franja nombrada de residuales críticos sin plan.
    leerDeudaPlanes(),
  ]);

  // With no relevance assigned the junction is empty, so the reach of an action is
  // unknown rather than zero. Rendering zero would understate every action in the plan.
  const alcanceCalculable = paresMapeados > 0;

  // ── QUÉ MITIGA CADA PLAN ────────────────────────────────────────────────────────────
  //
  // Sólo las amenazas de la VALORACIÓN cuyo control PRINCIPAL es éste. La consulta anterior
  // contaba toda amenaza donde el control apareciera con cualquier relevancia, así que un
  // plan sobre un control «de apoyo» se anotaba riesgos que no contiene: A.8.11 decía 244
  // riesgos cuando como principal no contiene ninguno. Es el mismo eje que usa la exigencia
  // para decidir si hay brecha — la compuerta y su cierre tienen que hablar del mismo control.
  const riesgosPorControl = new Map<number, RiesgoDelAlcance[]>();
  if (alcanceCalculable) {
    const filas = await prisma.controlAmenaza.findMany({
      where: { relevancia: { esPrincipal: true } },
      select: {
        controlId: true,
        amenaza: {
          select: {
            codigo: true,
            nombre: true,
            riesgos: {
              where: { obsoleto: false },
              select: { activo: { select: { codigo: true } } },
            },
          },
        },
      },
    });
    for (const f of filas) {
      const previo = riesgosPorControl.get(f.controlId) ?? [];
      for (const r of f.amenaza.riesgos) {
        previo.push({
          amenazaCodigo: f.amenaza.codigo,
          amenazaNombre: f.amenaza.nombre,
          activoCodigo: r.activo.codigo ?? '(sin código)',
        });
      }
      riesgosPorControl.set(f.controlId, previo);
    }
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
    fechaCierre: a.fechaCierre?.toISOString().slice(0, 10) ?? null,
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
    // Qué mitiga: el control, sus amenazas de la valoración y a cuántos riesgos y activos
    // llega. `null` mientras no haya ninguna relevancia asignada — desconocido, no cero.
    alcance: alcanceCalculable
      ? alcanceDelPlan(
          a.control
            ? {
                codigo: a.control.codigo,
                nombre: a.control.nombre,
                nivel: a.control.actual?.nivel ?? null,
                objetivo: a.control.objetivo?.nivel ?? null,
              }
            : null,
          a.control ? (riesgosPorControl.get(a.control.id) ?? []) : [],
        )
      : null,
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

  const sinPlan = deuda.filas.map((f) => ({
    activoCodigo: f.activoCodigo,
    activoNombre: f.activoNombre,
    amenazaCodigo: f.amenazaCodigo,
    amenazaNombre: f.amenazaNombre,
    diasPendiente: f.diasPendiente,
    escalado: f.escalado,
  }));

  return (
    <PlanesTratamiento
      acciones={vista}
      alcanceCalculable={alcanceCalculable}
      controles={controles}
      cargos={cargos.map((c) => ({ id: c.id, nombre: c.nombre }))}
      madurez={madurez.map((m) => ({ id: m.id, nivel: m.nivel, nombre: m.nombre }))}
      sinPlan={sinPlan}
    />
  );
}
