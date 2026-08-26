// app/sgsi/parametros/page.tsx
//
// Handoff v2.1 screen 9, "Configuración del modelo".
//
// Every figure on this screen is READ from the table that the engine itself reads. That
// is the whole point of the scales being parametrizable: if the screen carried its own
// copy of "0.90 for L3" or "riesgo crítico ≥ 25", the page would keep saying so after
// the Committee changed the row, and the tool would be lying about its own configuration.
//
// The only literals that survive here are the ones with no table behind them: the six
// methodology roles of MET-SIG-01 §13 and the wording of the zone rules, both flagged in
// the component.

import { prisma } from '@/lib/db';
import { media } from '@/lib/sgsi/madurez';
import ParametrosModelo, {
  type ParametrosVista,
} from '@/app/components/sgsi/parametros/ParametrosModelo';

export const dynamic = 'force-dynamic';

/// Prisma Decimal does not cross the server/client boundary. Every decimal is narrowed
/// here, once, rather than in each card.
function n(valor: { toString(): string }): number {
  return Number(valor.toString());
}

function fecha(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export default async function ParametrosPage() {
  const [
    parametros,
    dimensiones,
    valores,
    degradaciones,
    frecuencias,
    madureces,
    umbralesImpacto,
    umbralesRiesgo,
    relevancias,
    tipos,
    subtiposTotal,
    amenazasTotal,
    areas,
    ubicaciones,
    entornos,
    proveedores,
    tratamientos,
    estadosTratamiento,
    capacidades,
    cargos,
    gruposAmenaza,
    evidenciasPorTipo,
    funcionesControl,
    porDatosCliente,
    porDatosPersonales,
    porExpuesto,
    lineaBase,
    activosTotal,
  ] = await Promise.all([
    prisma.parametro.findMany({ orderBy: { clave: 'asc' } }),
    prisma.dimension.findMany({ orderBy: { orden: 'asc' } }),
    prisma.escalaValor.findMany({ orderBy: { orden: 'asc' } }),
    prisma.escalaDegradacion.findMany({ orderBy: { orden: 'asc' } }),
    prisma.escalaFrecuencia.findMany({ orderBy: { orden: 'asc' } }),
    prisma.escalaMadurez.findMany({ orderBy: { nivel: 'asc' } }),
    prisma.umbralImpacto.findMany({ orderBy: { orden: 'asc' } }),
    prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' }, include: { criterio: true } }),
    prisma.relevanciaControl.findMany({ orderBy: { orden: 'asc' } }),
    prisma.tipoMagerit.findMany({
      orderBy: { orden: 'asc' },
      include: {
        _count: { select: { subtipos: true, activos: true } },
        // A filtered relation count would do, but the list is ten rows deep: reading the
        // pairs and counting them here keeps the query portable.
        amenazas: { where: { aplica: true }, select: { amenazaId: true } },
      },
    }),
    prisma.subtipoMagerit.count(),
    prisma.amenaza.count({ where: { activa: true } }),
    prisma.area.findMany({
      orderBy: { orden: 'asc' },
      include: { liderCargo: true, _count: { select: { activos: true } } },
    }),
    prisma.ubicacion.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { activos: true } } },
    }),
    prisma.entorno.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { activos: true } } },
    }),
    prisma.proveedor.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { activos: true } } },
    }),
    prisma.tratamientoRiesgo.findMany({
      orderBy: { orden: 'asc' },
      include: { _count: { select: { riesgos: true } } },
    }),
    prisma.estadoTratamiento.findMany({
      orderBy: { orden: 'asc' },
      include: { _count: { select: { riesgos: true } } },
    }),
    prisma.capacidadOperativa.findMany({
      orderBy: { orden: 'asc' },
      include: {
        controles: {
          select: {
            soa: true,
            actual: { select: { nivel: true, eficacia: true } },
            objetivo: { select: { nivel: true } },
          },
        },
      },
    }),
    prisma.cargoResponsable.findMany({
      orderBy: { orden: 'asc' },
      include: {
        _count: {
          select: {
            activosPropietario: true,
            activosCustodio: true,
            controles: true,
            riesgos: true,
            accionesResponsable: true,
            accionesAprueba: true,
            areasLideradas: true,
          },
        },
      },
    }),
    prisma.amenaza.groupBy({
      by: ['grupo'],
      where: { activa: true },
      _count: { _all: true },
      orderBy: { grupo: 'asc' },
    }),
    prisma.evidencia.groupBy({ by: ['tipo'], _count: { _all: true } }),
    prisma.control.groupBy({ by: ['funcionControl'], _count: { _all: true } }),
    prisma.activo.groupBy({
      by: ['datosCliente'],
      where: { activo: true },
      _count: { _all: true },
    }),
    prisma.activo.groupBy({
      by: ['datosPersonales'],
      where: { activo: true },
      _count: { _all: true },
    }),
    prisma.activo.groupBy({
      by: ['expuestoInternet'],
      where: { activo: true },
      _count: { _all: true },
    }),
    prisma.lineaBase.findFirst({ orderBy: { fecha: 'desc' } }),
    prisma.activo.count({ where: { activo: true } }),
  ]);

  // The zone cuts are NOT constants: MAGERIT's "impacto alto" is the lower bound of the
  // Alto impact band, "impacto bajo" the lower bound of Medio, and "ocurre al menos una
  // vez al año" the annual rate of the Media frequency. Reading them from the same rows
  // the engine reads is what keeps the zones true after a rescale. When a band is missing
  // the cut travels as null and the card says so rather than inventing a number.
  const bandaAlto = umbralesImpacto.find((u) => u.nombre.toLowerCase().startsWith('alto'));
  const bandaMedio = umbralesImpacto.find((u) => u.nombre.toLowerCase().startsWith('medio'));
  const frecuenciaAnual = frecuencias.find((f) => f.nombre.toLowerCase().startsWith('media'));

  const vista: ParametrosVista = {
    parametros: parametros.map((p) => ({
      clave: p.clave,
      valor: p.valor,
      descripcion: p.descripcion,
      actualizado: fecha(p.actualizado),
    })),

    dimensiones: dimensiones.map((d) => ({ codigo: d.codigo, nombre: d.nombre, activa: d.activa })),

    valores: valores.map((v) => ({ valor: v.valor, etiqueta: v.etiqueta })),
    degradaciones: degradaciones.map((d) => ({
      nombre: d.nombre,
      factor: n(d.factor),
      lectura: d.lectura,
    })),
    frecuencias: frecuencias.map((f) => ({ nombre: f.nombre, vecesAno: n(f.vecesAno) })),
    madureces: madureces.map((m) => ({
      nivel: m.nivel,
      nombre: m.nombre,
      eficacia: n(m.eficacia),
      lectura: m.lectura,
    })),

    umbralesImpacto: umbralesImpacto.map((u) => ({
      nombre: u.nombre,
      desde: n(u.desde),
      hasta: n(u.hasta),
    })),
    umbralesRiesgo: umbralesRiesgo.map((u) => ({
      nombre: u.nombre,
      desde: n(u.desde),
      hasta: n(u.hasta),
    })),

    criterios: umbralesRiesgo
      .filter((u) => u.criterio !== null)
      .map((u) => ({
        umbral: u.nombre,
        decision: u.criterio!.decision,
        plazoPlan: u.criterio!.plazoPlan,
        plazoEjecucion: u.criterio!.plazoEjecucion,
        aprueba: u.criterio!.aprueba,
        ratificado: u.criterio!.ratificado,
      })),

    relevancias: relevancias.map((r) => ({
      nombre: r.nombre,
      peso: r.peso,
      esPrincipal: r.esPrincipal,
      criterio: r.criterio,
    })),

    cortesZona: {
      impactoAlto: bandaAlto ? n(bandaAlto.desde) : null,
      impactoBajo: bandaMedio ? n(bandaMedio.desde) : null,
      aroFrecuente: frecuenciaAnual ? n(frecuenciaAnual.vecesAno) : null,
    },

    tipos: tipos.map((t) => ({
      codigo: t.codigo,
      nombre: t.nombre,
      abreviatura: t.abreviatura,
      subtipos: t._count.subtipos,
      activos: t._count.activos,
      amenazas: t.amenazas.length,
    })),
    subtiposTotal,
    amenazasTotal,

    areas: areas.map((a) => ({
      id: a.id,
      prefijo: a.prefijo,
      nombre: a.nombre,
      lider: a.liderCargo?.nombre ?? null,
      activos: a._count.activos,
      activa: a.activa,
    })),

    ubicaciones: ubicaciones.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      protegido: u.protegido,
      activo: u.activo,
      usos: u._count.activos,
    })),
    entornos: entornos.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      protegido: e.protegido,
      activo: e.activo,
      usos: e._count.activos,
    })),
    proveedores: proveedores.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      protegido: p.protegido,
      activo: p.activo,
      usos: p._count.activos,
    })),

    // Both catalogues are reachable from the risk through a NULLABLE foreign key, so a
    // retired value leaves no risk without a decision: the count is what already chose it.
    tratamientos: tratamientos.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      protegido: false,
      activo: t.activo,
      usos: t._count.riesgos,
    })),
    estadosTratamiento: estadosTratamiento.map((e) => ({
      id: e.id,
      nombre: e.nombre,
      protegido: false,
      activo: e.activo,
      usos: e._count.riesgos,
    })),

    gruposAmenaza: gruposAmenaza.map((g) => ({ nombre: g.grupo, conteo: g._count._all })),
    tiposEvidencia: evidenciasPorTipo.map((e) => ({ nombre: e.tipo, conteo: e._count._all })),
    funcionesControl: funcionesControl.map((f) => ({
      nombre: f.funcionControl,
      conteo: f._count._all,
    })),

    contenidoSensible: [
      {
        campo: 'Contiene datos de cliente',
        reparto: porDatosCliente.map((r) => ({ nombre: r.datosCliente, conteo: r._count._all })),
      },
      {
        campo: 'Contiene datos personales (Ley 1581)',
        reparto: porDatosPersonales.map((r) => ({
          nombre: r.datosPersonales,
          conteo: r._count._all,
        })),
      },
      {
        campo: 'Expuesto a Internet',
        reparto: porExpuesto.map((r) => ({ nombre: r.expuestoInternet, conteo: r._count._all })),
      },
    ],

    capacidades: capacidades.map((c) => {
      const aplicables = c.controles.filter((k) => k.soa !== 'NO');
      const eficacias = aplicables
        .map((k) => (k.actual ? n(k.actual.eficacia) : null))
        .filter((e): e is number => e !== null);
      const objetivos = aplicables
        .map((k) => k.objetivo?.nivel ?? null)
        .filter((o): o is number => o !== null);

      return {
        id: c.id,
        nombre: c.nombre,
        nombreCorto: c.nombreCorto,
        controles: c.controles.length,
        aplicables: aplicables.length,
        // Efficacy is a ratio scale and averages legitimately; the LEVEL is ordinal, so
        // its mean travels only as the target reference the plan commits to.
        eficaciaMedia: eficacias.length > 0 ? media(eficacias) * 100 : null,
        objetivoMedio: objetivos.length > 0 ? media(objetivos) : null,
      };
    }),

    cargos: cargos.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      activo: c.activo,
      // Every relation that points at the cargo, so "cero referencias, candidato a baja"
      // is a claim the count can actually support.
      usos:
        c._count.activosPropietario +
        c._count.activosCustodio +
        c._count.controles +
        c._count.riesgos +
        c._count.accionesResponsable +
        c._count.accionesAprueba +
        c._count.areasLideradas,
    })),

    lineaBase: lineaBase ? { nombre: lineaBase.nombre, fecha: fecha(lineaBase.fecha) } : null,
    activosTotal,
  };

  return <ParametrosModelo datos={vista} />;
}
