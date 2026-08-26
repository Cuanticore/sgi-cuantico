// app/sgsi/metodologia/page.tsx
//
// Handoff v2.1 screen 10, "Metodología". MET-SIG-01 v3.0, the approved method, rendered
// as a readable document.
//
// The prose is the document's. Every REFERENCE TABLE in it is read from the database
// instead of being transcribed, and so are the two declared deviations, the worked
// example of §7.5 and the risk matrix of §6.6. A methodology screen whose tables are
// typed into the page is a methodology that silently stops describing the engine the
// first time the Committee moves a threshold — and the auditor reads the screen, not the
// migration.
//
// The worked example is not narrated: it is recomputed through lib/sgsi/formulas, the
// same module every risk in the application goes through, from A.24's own degradation and
// frequency rows.

import { prisma } from '@/lib/db';
import { calcularRiesgo, Decimal } from '@/lib/sgsi/formulas';
import { clasificar } from '@/lib/sgsi/clasificar';
import DocumentoMetodologia, {
  type MetodologiaVista,
} from '@/app/components/sgsi/metodologia/DocumentoMetodologia';

export const dynamic = 'force-dynamic';

function n(valor: { toString(): string }): number {
  return Number(valor.toString());
}

/// The asset of the worked example in MET-SIG-01 §7.5: a production database server
/// valued 5 in Availability, 5 in Integrity and 4 in Confidentiality, analysed against
/// A.24 with its controls at L3. The valuation and the control level are the document's
/// scenario; the degradation, the frequency, the efficacy and every band come from the
/// rows the engine reads.
const EJEMPLO_VALORES = { D: 5, I: 5, C: 4 } as const;
const EJEMPLO_NIVEL_CONTROL = 3;
const EJEMPLO_AMENAZA = 'A.24';

export default async function MetodologiaPage() {
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
    amenazas,
    reasignadas,
    controlesTotal,
    controlesAplicables,
    capacidadesTotal,
    dominios,
    activosTotal,
    riesgosTotal,
    amenazaEjemplo,
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
      include: { _count: { select: { subtipos: true } }, subtipos: { take: 6, orderBy: { id: 'asc' } } },
    }),
    prisma.subtipoMagerit.count(),
    prisma.amenaza.findMany({ where: { activa: true }, orderBy: { id: 'asc' } }),
    // The first declared deviation, recorded on the row rather than described in prose:
    // the threats MAGERIT aims at Autenticidad or Trazabilidad and Cuantico reassigns.
    prisma.amenazaDegradacion.findMany({
      where: { reasignadaDesde: { not: null } },
      include: { amenaza: true, dimension: true },
    }),
    prisma.control.count(),
    prisma.control.count({ where: { soa: { not: 'NO' } } }),
    prisma.capacidadOperativa.count(),
    prisma.dominioAnexoA.findMany({ orderBy: { orden: 'asc' } }),
    prisma.activo.count({ where: { activo: true } }),
    prisma.riesgo.count({ where: { obsoleto: false } }),
    prisma.amenaza.findUnique({
      where: { codigo: EJEMPLO_AMENAZA },
      include: {
        frecuencia: true,
        degradacion: { include: { dimension: true, degradacion: true } },
      },
    }),
  ]);

  const umbralesRiesgoPlano = umbralesRiesgo.map((u) => ({
    nombre: u.nombre,
    desde: n(u.desde),
    hasta: n(u.hasta),
  }));
  const umbralesImpactoPlano = umbralesImpacto.map((u) => ({
    nombre: u.nombre,
    desde: n(u.desde),
    hasta: n(u.hasta),
  }));

  // §6.6, derived rather than drawn. A band is a RANGE, so a cell is evaluated at both
  // ends of its impact band: when the two ends land in different risk levels the cell says
  // so instead of picking one and hiding the fact. Every level comes from clasificar(),
  // the same function the risk grid uses.
  const matriz = umbralesImpactoPlano.map((banda) => ({
    impacto: banda.nombre,
    celdas: frecuencias.map((f) => {
      const aro = n(f.vecesAno);
      const bajo = clasificar(new Decimal(banda.desde).times(aro), umbralesRiesgoPlano);
      const alto = clasificar(new Decimal(banda.hasta).times(aro), umbralesRiesgoPlano);
      return {
        frecuencia: f.nombre,
        desde: bajo,
        hasta: alto,
      };
    }),
  }));

  // §7.5 recomputed. Without A.24 in the catalogue the card is omitted rather than
  // narrated from memory.
  let ejemplo: MetodologiaVista['ejemplo'] = null;
  const nivelEjemplo = madureces.find((m) => m.nivel === EJEMPLO_NIVEL_CONTROL);

  if (amenazaEjemplo && nivelEjemplo) {
    const porCodigo = new Map(
      amenazaEjemplo.degradacion.map((d) => [d.dimension.codigo, n(d.degradacion.factor)]),
    );
    const degradaciones: Record<'D' | 'I' | 'C', number> = {
      D: porCodigo.get('D') ?? 0,
      I: porCodigo.get('I') ?? 0,
      C: porCodigo.get('C') ?? 0,
    };
    const eficacia = n(nivelEjemplo.eficacia);
    const aro = n(amenazaEjemplo.frecuencia.vecesAno);

    const salida = calcularRiesgo({
      valores: { ...EJEMPLO_VALORES },
      degradaciones,
      aro,
      eficacia,
    });

    ejemplo = {
      amenaza: { codigo: amenazaEjemplo.codigo, nombre: amenazaEjemplo.nombre },
      valores: { ...EJEMPLO_VALORES },
      degradaciones,
      frecuencia: { nombre: amenazaEjemplo.frecuencia.nombre, vecesAno: aro },
      nivelControl: { nivel: nivelEjemplo.nivel, nombre: nivelEjemplo.nombre, eficacia },
      valorActivo: Math.max(EJEMPLO_VALORES.D, EJEMPLO_VALORES.I, EJEMPLO_VALORES.C),
      impacto: n(salida.impacto),
      nivelImpacto: clasificar(salida.impacto, umbralesImpactoPlano),
      riesgoPotencial: n(salida.riesgoPotencial),
      nivelPotencial: clasificar(salida.riesgoPotencial, umbralesRiesgoPlano),
      frecuenciaResidual: n(salida.frecuenciaResidual),
      riesgoResidual: n(salida.riesgoResidual),
      nivelResidual: clasificar(salida.riesgoResidual, umbralesRiesgoPlano),
    };
  }

  const bandaAlto = umbralesImpactoPlano.find((u) => u.nombre.toLowerCase().startsWith('alto'));
  const bandaMedio = umbralesImpactoPlano.find((u) => u.nombre.toLowerCase().startsWith('medio'));
  const frecuenciaAnual = frecuencias.find((f) => f.nombre.toLowerCase().startsWith('media'));

  const vista: MetodologiaVista = {
    parametros: Object.fromEntries(parametros.map((p) => [p.clave, p.valor])),

    dimensiones: dimensiones.map((d) => ({ codigo: d.codigo, nombre: d.nombre, activa: d.activa })),
    reasignadas: reasignadas.map((r) => ({
      codigo: r.amenaza.codigo,
      nombre: r.amenaza.nombre,
      desde: r.reasignadaDesde,
      hacia: r.dimension.nombre,
      haciaCodigo: r.dimension.codigo,
    })),

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
    umbralesImpacto: umbralesImpactoPlano,
    umbralesRiesgo: umbralesRiesgoPlano,
    relevancias: relevancias.map((r) => ({
      nombre: r.nombre,
      peso: r.peso,
      esPrincipal: r.esPrincipal,
      criterio: r.criterio,
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

    cortesZona: {
      impactoAlto: bandaAlto?.desde ?? null,
      impactoBajo: bandaMedio?.desde ?? null,
      aroFrecuente: frecuenciaAnual ? n(frecuenciaAnual.vecesAno) : null,
    },

    matriz,

    tipos: tipos.map((t) => ({
      codigo: t.codigo,
      nombre: t.nombre,
      abreviatura: t.abreviatura,
      subtipos: t._count.subtipos,
      ejemplos: t.subtipos.map((s) => s.nombre),
    })),
    subtiposTotal,

    amenazas: amenazas.map((a) => ({ codigo: a.codigo, nombre: a.nombre, grupo: a.grupo })),

    ejemplo,

    controlesTotal,
    controlesAplicables,
    capacidadesTotal,
    dominios: dominios.map((d) => d.nombre),
    activosTotal,
    riesgosTotal,
  };

  return <DocumentoMetodologia datos={vista} />;
}
