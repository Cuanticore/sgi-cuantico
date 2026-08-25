// app/sgsi/amenazas/page.tsx
//
// Handoff v2.1 screen 6, "Amenazas y tipos".
//
// The parametrisation that GENERATES the risks: which MAGERIT threats are
// pre-classified for each asset type, and with what degradation and frequency they
// arrive at the asset's file.
//
// Two facts from the domain shape this whole screen and are worth stating once, here,
// where the query is built:
//
//  1. Degradation is an attribute of the THREAT, not of the pair and not of the risk
//     (MET-SIG-01 section 7.4). AmenazaDegradacion is keyed by amenaza + dimensión —
//     the type is nowhere in that key. So the type selector only scopes what is shown;
//     editing a degradation reaches every type the threat applies to. The view carries
//     the whole applicability map per threat precisely so the client can count that
//     blast radius before the user acts.
//
//  2. Applicability is RECORDED for all ten types, not inferred from absence: the
//     workbook says Sí or — on every cell, so `aplica: false` means "explicitly not
//     applicable", a different fact from "nobody said". That is why the query takes
//     every AmenazaTipo row and not only the ones that apply.

import { prisma } from '@/lib/db';
import AmenazasTipos, {
  type AmenazaVista,
  type DimensionVista,
  type GradoDegradacion,
  type GradoFrecuencia,
  type TipoVista,
} from '@/app/components/sgsi/amenazas/AmenazasTipos';

export const dynamic = 'force-dynamic';

/// MAGERIT order, which is neither alphabetical nor numeric: the four groups in the
/// catalogue's own sequence, then the ordinal inside each. `N.*` and `I.*` carry a
/// LITERAL asterisk in `codigo` — it is the code of the catch-all threat of the group,
/// not a wildcard — and the catalogue prints it last in its group.
const ORDEN_GRUPO: Record<string, number> = { N: 0, I: 1, E: 2, A: 3 };

function ordenCodigo(codigo: string): [number, number] {
  const [prefijo, sufijo = ''] = codigo.split('.');
  const grupo = ORDEN_GRUPO[prefijo] ?? 9;
  const ordinal = sufijo === '*' ? Number.MAX_SAFE_INTEGER : Number(sufijo);
  return [grupo, Number.isNaN(ordinal) ? Number.MAX_SAFE_INTEGER : ordinal];
}

export default async function AmenazasPage() {
  const [amenazas, tipos, gradosDegradacion, gradosFrecuencia, dimensiones] = await Promise.all([
    prisma.amenaza.findMany({
      where: { activa: true },
      include: {
        frecuencia: true,
        tipos: { include: { tipo: true } },
        degradacion: { include: { dimension: true, degradacion: true } },
      },
    }),
    prisma.tipoMagerit.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
    prisma.escalaDegradacion.findMany({ orderBy: { orden: 'asc' } }),
    prisma.escalaFrecuencia.findMany({ orderBy: { orden: 'asc' } }),
    // All five, not only the active ones: Cuantico works with three dimensions, but
    // `reasignadaDesde` points at Autenticidad and Trazabilidad and the screen has to
    // name them for the auditor who asks where those threats went.
    prisma.dimension.findMany({ orderBy: { orden: 'asc' } }),
  ]);

  const vista: AmenazaVista[] = amenazas
    .map((a) => {
      const degradacion: Record<string, string> = {};
      let reasignada: AmenazaVista['reasignada'] = null;

      for (const d of a.degradacion) {
        degradacion[d.dimension.codigo] = d.degradacion.nombre;
        if (d.reasignadaDesde) {
          reasignada = { dimension: d.dimension.codigo, desde: d.reasignadaDesde };
        }
      }

      return {
        codigo: a.codigo,
        nombre: a.nombre,
        grupo: a.grupo,
        nota: a.notaAplicacion,
        frecuencia: a.frecuencia.nombre,
        degradacion,
        reasignada,
        // The full map, both branches: the client needs the false ones to offer
        // «+ Relacionar amenaza con este tipo», and needs the true ones to count the
        // blast radius of a degradation change.
        tipos: Object.fromEntries(a.tipos.map((t) => [t.tipo.codigo, t.aplica])),
      };
    })
    .sort((x, y) => {
      const [gx, ox] = ordenCodigo(x.codigo);
      const [gy, oy] = ordenCodigo(y.codigo);
      return gx - gy || ox - oy;
    });

  const tiposVista: TipoVista[] = tipos.map((t) => ({
    codigo: t.codigo,
    nombre: t.nombre,
    abreviatura: t.abreviatura,
  }));

  // Prisma returns Decimal; the client does arithmetic and formatting on plain numbers.
  const degradacionVista: GradoDegradacion[] = gradosDegradacion.map((g) => ({
    nombre: g.nombre,
    factor: Number(g.factor),
    lectura: g.lectura,
  }));

  const frecuenciaVista: GradoFrecuencia[] = gradosFrecuencia.map((f) => ({
    nombre: f.nombre,
    vecesAno: Number(f.vecesAno),
  }));

  // The columns are the active dimensions; the lookup covers all five so a reassigned
  // row can say "desde Trazabilidad" instead of "desde T".
  const dimensionesVista: DimensionVista[] = dimensiones
    .filter((d) => d.activa)
    .map((d) => ({ codigo: d.codigo, nombre: d.nombre }));

  const nombresDimension = Object.fromEntries(dimensiones.map((d) => [d.codigo, d.nombre]));

  return (
    <AmenazasTipos
      amenazas={vista}
      tipos={tiposVista}
      gradosDegradacion={degradacionVista}
      gradosFrecuencia={frecuenciaVista}
      dimensiones={dimensionesVista}
      nombresDimension={nombresDimension}
    />
  );
}
