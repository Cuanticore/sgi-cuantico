// app/sgsi/matrices/page.tsx
//
// Handoff v2.1 screen 7, "Matrices de riesgo".
//
// The prototype carries literal MATRIZ_INH / MATRIZ_RES arrays. They are a visual
// reference for the designer, NOT data: every count on this screen is derived at read
// time from the Riesgo rows. There is no stored matrix, no materialised view and no
// cached count — reintroducing one is what produced contradictory figures in v1.
//
// The whole risk set arrives in a single query. The 2256 rows are interned against the
// 122 assets and the 57 threats before crossing to the client, so the filters and the
// drill-down work on the real dataset without one round trip per cell.
//
// The axes are read from the parameter tables too. The impact rows are the bands of
// umbral_impacto and the frequency columns are the points of escala_frecuencia, so a
// change to the scales moves the matrix without touching this file.

import { prisma } from '@/lib/db';
import MatricesRiesgo, {
  type ActivoVista,
  type AmenazaVista,
  type BandaVista,
  type ColumnaFrecuencia,
  type FilaImpacto,
  type FilaRiesgo,
} from '@/app/components/sgsi/matrices/MatricesRiesgo';

export const dynamic = 'force-dynamic';

/// Interns a value into a catalogue and returns its index. −1 means absent, so the
/// client never has to tell an empty string apart from a missing one.
function indice(catalogo: string[], mapa: Map<string, number>, valor: string | null): number {
  if (valor === null || valor === '') return -1;
  const previo = mapa.get(valor);
  if (previo !== undefined) return previo;
  const i = catalogo.push(valor) - 1;
  mapa.set(valor, i);
  return i;
}

export default async function MatricesPage() {
  const [riesgos, umbralesImpacto, umbralesRiesgo, frecuencias] = await Promise.all([
    // One pass over the risks. Everything the matrices, the filters and the drill-down
    // need travels in this projection; nothing is queried again per cell.
    prisma.riesgo.findMany({
      where: { obsoleto: false },
      orderBy: { codigo: 'asc' },
      select: {
        codigo: true,
        impacto: true,
        riesgoPotencial: true,
        frecuenciaResidual: true,
        riesgoResidual: true,
        // Per-risk frequency override; when absent the threat's own frequency applies,
        // which is exactly what lib/sgsi/riesgos.ts does when it calculates.
        frecuencia: { select: { vecesAno: true } },
        responsable: { select: { nombre: true } },
        amenaza: {
          select: { codigo: true, nombre: true, frecuencia: { select: { vecesAno: true } } },
        },
        activo: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            area: { select: { nombre: true } },
            tipo: { select: { codigo: true, nombre: true } },
            propietario: { select: { nombre: true } },
            custodio: { select: { nombre: true } },
          },
        },
      },
    }),
    prisma.umbralImpacto.findMany({ orderBy: { orden: 'asc' } }),
    prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
    prisma.escalaFrecuencia.findMany({ orderBy: { vecesAno: 'asc' } }),
  ]);

  // --- Axes -----------------------------------------------------------------------
  //
  // The row's midpoint is what gives the cell its colour: a cell is a band of impact
  // crossed with a point of frequency, so its representative risk is the middle of the
  // band times the frequency. Derived, not written down — it reproduces the prototype's
  // IMP_MID = [4.75, 3.75, 2.25, 1.0, 0.25] from the thresholds themselves.
  const filasImpacto: FilaImpacto[] = umbralesImpacto.map((u) => {
    const desde = Number(u.desde);
    const hasta = Number(u.hasta);
    return { nombre: u.nombre, desde, hasta, medio: (desde + hasta) / 2 };
  });

  // "Muy alta — ocurre a diario" is the scale's label; the column header only has room
  // for the grade, and the reading stays available in the title attribute.
  const columnas: ColumnaFrecuencia[] = frecuencias.map((f) => ({
    nombre: f.nombre.split('—')[0].trim(),
    lectura: f.nombre,
    vecesAno: Number(f.vecesAno),
  }));

  const bandas: BandaVista[] = umbralesRiesgo.map((u) => ({
    nombre: u.nombre,
    desde: Number(u.desde),
    hasta: Number(u.hasta),
  }));

  // --- Interning ---------------------------------------------------------------------
  const procesos: string[] = [];
  const responsables: string[] = [];
  const categorias: string[] = [];
  const mapaProcesos = new Map<string, number>();
  const mapaResponsables = new Map<string, number>();
  const mapaCategorias = new Map<string, number>();

  const activos: ActivoVista[] = [];
  const mapaActivos = new Map<number, number>();

  const amenazas: AmenazaVista[] = [];
  const mapaAmenazas = new Map<string, number>();

  const filas: FilaRiesgo[] = [];
  let sinUbicar = 0;

  for (const r of riesgos) {
    // A risk without a calculated impact cannot be placed on the impact axis. It is
    // counted and reported rather than silently dropped into the lowest band.
    if (r.impacto === null || r.riesgoPotencial === null) {
      sinUbicar++;
      continue;
    }

    let iActivo = mapaActivos.get(r.activo.id);
    if (iActivo === undefined) {
      // The workbook's "Propietario del activo" column is empty for all 234 assets, so
      // the custodian stands in as the responsible party. The screen says RESPONSABLE
      // rather than PROPIETARIO for exactly that reason: a column of dashes under
      // "Propietario" would be worse than naming who actually answers for the asset.
      const responsable = r.activo.propietario?.nombre ?? r.activo.custodio?.nombre ?? null;
      iActivo =
        activos.push({
          codigo: r.activo.codigo ?? '—',
          nombre: r.activo.nombre,
          proceso: indice(procesos, mapaProcesos, r.activo.area.nombre),
          responsable: indice(responsables, mapaResponsables, responsable),
          categoria: indice(
            categorias,
            mapaCategorias,
            `${r.activo.tipo.codigo} ${r.activo.tipo.nombre}`,
          ),
        }) - 1;
      mapaActivos.set(r.activo.id, iActivo);
    }

    let iAmenaza = mapaAmenazas.get(r.amenaza.codigo);
    if (iAmenaza === undefined) {
      iAmenaza = amenazas.push({ codigo: r.amenaza.codigo, nombre: r.amenaza.nombre }) - 1;
      mapaAmenazas.set(r.amenaza.codigo, iAmenaza);
    }

    const aro = Number(r.frecuencia?.vecesAno ?? r.amenaza.frecuencia.vecesAno);

    filas.push({
      codigo: r.codigo,
      activo: iActivo,
      amenaza: iAmenaza,
      // −1 inherits the asset's. The risk-level responsible is an override, and today
      // it is unset on every row.
      responsable: indice(responsables, mapaResponsables, r.responsable?.nombre ?? null),
      impacto: Number(r.impacto),
      aro,
      riesgo: Number(r.riesgoPotencial),
      // Null on purpose and null all the way to the screen: no threat has controls with
      // a relevance assigned yet, so the efficacy is UNKNOWN, not zero. Substituting
      // zero here would draw a residual matrix identical to the inherent one — the
      // report that is arithmetically consistent with its inputs and completely wrong.
      aroResidual: r.frecuenciaResidual === null ? null : Number(r.frecuenciaResidual),
      riesgoResidual: r.riesgoResidual === null ? null : Number(r.riesgoResidual),
    });
  }

  const orden = (a: string, b: string) => a.localeCompare(b, 'es');
  procesos.sort(orden);
  responsables.sort(orden);
  categorias.sort(orden);

  // Sorting the catalogues invalidated the indices, so they are remapped once. Cheaper
  // than sorting on every render in the browser, and the option lists read alphabetically.
  const remapa = (lista: string[], mapa: Map<string, number>) => {
    const nuevo = new Map<number, number>();
    for (const [valor, viejo] of mapa) nuevo.set(viejo, lista.indexOf(valor));
    return nuevo;
  };
  const rProcesos = remapa(procesos, mapaProcesos);
  const rResponsables = remapa(responsables, mapaResponsables);
  const rCategorias = remapa(categorias, mapaCategorias);
  const mover = (mapa: Map<number, number>, i: number) => (i < 0 ? -1 : (mapa.get(i) ?? -1));

  for (const a of activos) {
    a.proceso = mover(rProcesos, a.proceso);
    a.responsable = mover(rResponsables, a.responsable);
    a.categoria = mover(rCategorias, a.categoria);
  }
  for (const f of filas) f.responsable = mover(rResponsables, f.responsable);

  return (
    <MatricesRiesgo
      filas={filas}
      activos={activos}
      amenazas={amenazas}
      procesos={procesos}
      responsables={responsables}
      categorias={categorias}
      filasImpacto={filasImpacto}
      columnas={columnas}
      bandas={bandas}
      sinUbicar={sinUbicar}
    />
  );
}
