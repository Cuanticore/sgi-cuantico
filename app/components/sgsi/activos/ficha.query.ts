import 'server-only';

// app/components/sgsi/activos/ficha.query.ts
//
// The reads behind handoff v2.1 screens 3 and 4, "Ficha del activo". The server hands
// over raw material only: the three dimension values, the threat catalogue with its
// parametrized degradation and frequency, the stored risk rows and the scales. Every
// figure on the sheet — value, impact, inherent risk, residual, bands, zones, matrices
// and KPIs — is derived in the browser through lib/sgsi, because the sheet is one long
// what-if: moving a D, a degradation or a control's maturity has to move all of them at
// once and no round trip may sit in between.
//
// WHAT IS DELIBERATELY NOT QUERIED
//
// There is no value column, no level column and no band column, because none of them
// exists in the database. The asset's value is max(v_D, v_I, v_C) (MET-SIG-01 §7.2) and
// the bands are read against umbral_impacto / umbral_riesgo at render time.
//
// THE WHOLE THREAT CATALOGUE TRAVELS, NOT JUST THE ASSET'S THREATS
//
// The MAGERIT type is editable on the sheet, and changing it changes which threats the
// parameterisation pre-classifies — the handoff says so in the card itself ("Cambiarlo
// recalcula el conjunto de riesgos"). The "+ Agregar amenaza" popup needs the rest of
// the catalogue too. It is 36 threats with three degradations each, so shipping all of
// it costs less than a second query and lets the type select recompute the list live.

import { prisma } from '@/lib/db';

/// D, I and C. The other two dimensions of MAGERIT — Autenticidad and Trazabilidad —
/// exist in `dimension` with `activa = false`; the model in force values three.
export type Dim = 'D' | 'I' | 'C';

export const DIMENSIONES: readonly Dim[] = ['D', 'I', 'C'];

/// Prisma's Ternario. "Por definir" is not "no": the personal-data question under Ley
/// 1581 has to keep "not yet decided" tellable apart from a negative answer.
export type Ternario = 'SI' | 'NO' | 'POR_DEFINIR';

export interface OpcionCatalogo {
  id: number;
  nombre: string;
}

export interface AreaOpcion extends OpcionCatalogo {
  /// The three letters that open the asset code: EST, COM, PRY, TEC, TAL, FIN, SIG, SOP.
  prefijo: string;
}

export interface TipoOpcion extends OpcionCatalogo {
  codigo: string;
  /// The three letters in the middle of the asset code: RED, DAT, CLA, SER, APP…
  abreviatura: string;
}

export interface SubtipoOpcion extends OpcionCatalogo {
  tipoId: number;
  codigo: string;
}

export interface NivelValor {
  id: number;
  valor: number;
  etiqueta: string;
}

export interface NivelDegradacion {
  id: number;
  nombre: string;
  /// Decimal as string. A float would reintroduce the binary artefact that
  /// lib/sgsi/formulas.ts exists to avoid, right before a classification.
  factor: string;
  lectura: string | null;
}

export interface NivelFrecuencia {
  id: number;
  /// "Muy alta — ocurre a diario", verbatim from the scale.
  nombre: string;
  /// Just the grade, which is all a 112px column has room for.
  corto: string;
  vecesAno: string;
}

export interface NivelMadurez {
  id: number;
  nivel: number;
  nombre: string;
  eficacia: string;
}

export interface BandaRiesgo {
  nombre: string;
  desde: string;
  hasta: string;
  orden: number;
}

/// A band of umbral_impacto plus the midpoint of the band, which is what gives a matrix
/// cell its colour: a cell is a band of impact crossed with a point of frequency, so its
/// representative risk is the middle of the band times that frequency.
export interface BandaImpacto extends BandaRiesgo {
  medio: number;
}

/// A control mapped to a threat, with the maturity that decides the threat's efficacy.
export interface ControlDeAmenaza {
  codigo: string;
  nombre: string;
  /// Current CMM level, 0–5. Null when the control has no assessment yet — which is not
  /// the same as L0 and must not be averaged as one.
  nivel: number | null;
  aplica: boolean;
  peso: number;
  esPrincipal: boolean;
  /// Null while the pair has no relevance assigned. The pair still counts — it aggregates
  /// with weight 1 and no principal, which is the workbook's plain AVERAGE — so the sheet
  /// shows "sin asignar" rather than inventing a level.
  relevancia: string | null;
  evidencia: string;
}

export interface AmenazaCatalogo {
  id: number;
  codigo: string;
  nombre: string;
  grupo: string;
  nota: string | null;
  frecuenciaId: number;
  /// The threat's parametrized degradation per dimension, as ids of escala_degradacion.
  /// DEGRADATION IS AN ATTRIBUTE OF THE THREAT, not of the risk (MET-SIG-01 §7.4).
  degradacion: Record<Dim, number>;
  /// Ids of the MAGERIT types the parameterisation pre-classifies this threat for. The
  /// client filters by the type currently selected on the sheet, which is the same
  /// predicate lib/sgsi/riesgos.ts uses when it generates.
  tipos: number[];
  controles: ControlDeAmenaza[];
}

/// A per-risk degradation override. It exists in the schema, and the methodology says
/// the limiting effect belongs to the threat — so a row here is an EXCEPTION and its
/// `justificacion` is NOT NULL for that reason.
export interface DegradacionDeRiesgo {
  dimension: Dim;
  degradacionId: number;
  justificacion: string;
}

export interface RiesgoGuardado {
  codigo: string;
  amenazaId: number;
  /// The four derived decimals, as strings. Null means not calculated — never zero.
  impacto: string | null;
  riesgoPotencial: string | null;
  frecuenciaResidual: string | null;
  riesgoResidual: string | null;
  /// Per-risk frequency override. Null means the threat's own frequency applies.
  frecuenciaId: number | null;
  madurezId: number | null;
  tratamientoId: number | null;
  estadoId: number | null;
  responsableId: number | null;
  observacion: string | null;
  justificacion: string | null;
  origen: string;
  degradacion: DegradacionDeRiesgo[];
}

/// A threat taken out of the analysis for this asset by hand: `quitarAmenazaDelActivo`
/// marks its risk `obsoleto` and `excluidoManual`, and nothing is deleted. It is NOT in
/// `riesgos` — that list is the live analysis — but the sheet needs it to show the undo
/// band and to call `restaurarAmenaza` with the risk's code.
export interface AmenazaExcluida {
  amenazaId: number;
  codigoRiesgo: string;
}

export interface ActivoFicha {
  id: number;
  /// AAA-TTT-NNNN. Immutable, never reused, never editable. Changing the asset's area or
  /// type does NOT change it: the change goes to the bitácora.
  codigo: string;
  codigoHeredado: string | null;
  nombre: string;
  descripcion: string | null;
  areaId: number;
  tipoId: number;
  subtipoId: number;
  propietarioId: number | null;
  custodioId: number | null;
  ubicacionId: number | null;
  entornoId: number | null;
  proveedorId: number | null;
  superiorId: number | null;
  datosCliente: Ternario;
  datosPersonales: Ternario;
  expuestoInternet: Ternario;
  cantidad: number;
  valores: Record<Dim, number>;
  riesgos: RiesgoGuardado[];
  /// Threats removed from this asset by hand, so the sheet can keep them off the live
  /// list and offer the undo the handoff asks for instead of showing them as active.
  amenazasExcluidas: AmenazaExcluida[];
}

/// One row of the "activo superior" search popup.
export interface ActivoBreve {
  id: number;
  codigo: string;
  nombre: string;
  area: string;
  subtipo: string;
}

/// The (area, type) consecutive, so the creation preview can show the number the asset
/// would actually get instead of a made-up one. The counter is authoritative because
/// codes are never reused and deletes are logical: MAX()+1 would hand out a retired
/// number.
export interface ContadorCodigo {
  areaId: number;
  tipoId: number;
  ultimoValor: number;
}

export interface Catalogos {
  areas: AreaOpcion[];
  tipos: TipoOpcion[];
  subtipos: SubtipoOpcion[];
  /// The whole position catalogue, for anything that is neither owner nor custodian.
  cargos: OpcionCatalogo[];
  /// The two lists the asset sheet offers, curated independently through the
  /// `esPropietario` / `esCustodio` flags. One position, two views — see the schema.
  cargosPropietario: OpcionCatalogo[];
  cargosCustodio: OpcionCatalogo[];
  ubicaciones: OpcionCatalogo[];
  entornos: OpcionCatalogo[];
  proveedores: OpcionCatalogo[];
  escalaValor: NivelValor[];
  escalaDegradacion: NivelDegradacion[];
  escalaFrecuencia: NivelFrecuencia[];
  escalaMadurez: NivelMadurez[];
  bandasImpacto: BandaImpacto[];
  bandasRiesgo: BandaRiesgo[];
  tratamientos: OpcionCatalogo[];
  estados: OpcionCatalogo[];
  contadores: ContadorCodigo[];
  activos: ActivoBreve[];
  /// `umbral_valoracion`, 4 today: an asset enters the analysis when its value reaches it.
  umbralValoracion: number;
  /// `delta_techo_eficacia`, 0.05 today: how far the weighted mean may exceed the
  /// efficacy of the principal control before the cap of MET-SIG-01 §7.4 bites.
  deltaTechoEficacia: number;
}

/// The inventory's order, so Atrás / Siguiente in the fixed bottom bar walk the same
/// sequence the inventory screen shows and the "n de N" counter agrees with it.
export interface Navegacion {
  codigos: string[];
}

function corto(nombre: string): string {
  return nombre.split('—')[0].trim();
}

export async function cargarCatalogos(): Promise<Catalogos> {
  const [
    areas,
    tipos,
    subtipos,
    cargos,
    ubicaciones,
    entornos,
    proveedores,
    escalaValor,
    escalaDegradacion,
    escalaFrecuencia,
    escalaMadurez,
    umbralesImpacto,
    umbralesRiesgo,
    tratamientos,
    estados,
    contadores,
    activos,
    parametros,
  ] = await Promise.all([
    prisma.area.findMany({ where: { activa: true }, orderBy: { orden: 'asc' } }),
    prisma.tipoMagerit.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
    prisma.subtipoMagerit.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.cargoResponsable.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
    prisma.ubicacion.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.entorno.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.proveedor.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.escalaValor.findMany({ orderBy: { orden: 'asc' } }),
    prisma.escalaDegradacion.findMany({ orderBy: { orden: 'asc' } }),
    prisma.escalaFrecuencia.findMany({ orderBy: { orden: 'asc' } }),
    prisma.escalaMadurez.findMany({ orderBy: { nivel: 'asc' } }),
    prisma.umbralImpacto.findMany({ orderBy: { orden: 'asc' } }),
    prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
    prisma.tratamientoRiesgo.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
    prisma.estadoTratamiento.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
    prisma.contadorCodigo.findMany(),
    prisma.activo.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        area: { select: { nombre: true } },
        subtipo: { select: { codigo: true, nombre: true } },
      },
    }),
    prisma.parametro.findMany({
      where: { clave: { in: ['umbral_valoracion', 'delta_techo_eficacia'] } },
    }),
  ]);

  const parametro = (clave: string, porDefecto: number) => {
    const fila = parametros.find((p) => p.clave === clave);
    return fila ? Number(fila.valor) : porDefecto;
  };

  return {
    areas: areas.map((a) => ({ id: a.id, nombre: a.nombre, prefijo: a.prefijo })),
    tipos: tipos.map((t) => ({
      id: t.id,
      codigo: t.codigo,
      nombre: t.nombre,
      abreviatura: t.abreviatura,
    })),
    subtipos: subtipos.map((s) => ({
      id: s.id,
      tipoId: s.tipoId,
      codigo: s.codigo,
      nombre: s.nombre,
    })),
    cargos: cargos.map((c) => ({ id: c.id, nombre: c.nombre })),
    cargosPropietario: cargos
      .filter((c) => c.esPropietario)
      .map((c) => ({ id: c.id, nombre: c.nombre })),
    cargosCustodio: cargos
      .filter((c) => c.esCustodio)
      .map((c) => ({ id: c.id, nombre: c.nombre })),
    ubicaciones: ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre })),
    entornos: entornos.map((e) => ({ id: e.id, nombre: e.nombre })),
    proveedores: proveedores.map((p) => ({ id: p.id, nombre: p.nombre })),
    escalaValor: escalaValor.map((e) => ({ id: e.id, valor: e.valor, etiqueta: e.etiqueta })),
    escalaDegradacion: escalaDegradacion.map((d) => ({
      id: d.id,
      nombre: d.nombre,
      factor: d.factor.toString(),
      lectura: d.lectura,
    })),
    escalaFrecuencia: escalaFrecuencia.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      corto: corto(f.nombre),
      vecesAno: f.vecesAno.toString(),
    })),
    escalaMadurez: escalaMadurez.map((m) => ({
      id: m.id,
      nivel: m.nivel,
      nombre: m.nombre,
      eficacia: m.eficacia.toString(),
    })),
    bandasImpacto: umbralesImpacto.map((u) => {
      const desde = Number(u.desde);
      const hasta = Number(u.hasta);
      return {
        nombre: u.nombre,
        desde: u.desde.toString(),
        hasta: u.hasta.toString(),
        orden: u.orden,
        medio: (desde + hasta) / 2,
      };
    }),
    bandasRiesgo: umbralesRiesgo.map((u) => ({
      nombre: u.nombre,
      desde: u.desde.toString(),
      hasta: u.hasta.toString(),
      orden: u.orden,
    })),
    tratamientos: tratamientos.map((t) => ({ id: t.id, nombre: t.nombre })),
    estados: estados.map((e) => ({ id: e.id, nombre: e.nombre })),
    contadores: contadores.map((c) => ({
      areaId: c.areaId,
      tipoId: c.tipoId,
      ultimoValor: c.ultimoValor,
    })),
    activos: activos.map((a) => ({
      id: a.id,
      codigo: a.codigo ?? '—',
      nombre: a.nombre,
      area: a.area.nombre,
      subtipo: `${a.subtipo.codigo} ${a.subtipo.nombre}`,
    })),
    umbralValoracion: parametro('umbral_valoracion', 4),
    deltaTechoEficacia: parametro('delta_techo_eficacia', 0.05),
  };
}

/// The whole MAGERIT threat catalogue, with the types it is pre-classified for and the
/// controls mapped to it. `ControlAmenaza` is empty today, so `controles` comes back
/// empty for every threat and the sheet says the efficacy is unknown rather than zero.
export async function cargarAmenazas(): Promise<AmenazaCatalogo[]> {
  const [amenazas, sinDegradar] = await Promise.all([
    prisma.amenaza.findMany({
      where: { activa: true },
      orderBy: { codigo: 'asc' },
      include: {
        tipos: { where: { aplica: true }, select: { tipoId: true } },
        degradacion: {
          select: { degradacionId: true, dimension: { select: { codigo: true } } },
        },
        controles: {
          select: {
            relevancia: { select: { nombre: true, peso: true, esPrincipal: true } },
            control: {
              select: {
                codigo: true,
                nombre: true,
                aplica: true,
                evidencia: true,
                actual: { select: { nivel: true } },
              },
            },
          },
        },
      },
    }),
    // "No aplica", factor 0.00: the fallback when a threat has no row for a dimension.
    // A missing row means the threat does not touch that dimension, which is a zero
    // factor and not a missing number.
    prisma.escalaDegradacion.findFirst({ where: { factor: 0 } }),
  ]);

  const idNoAplica = sinDegradar?.id ?? 0;

  return amenazas.map((a) => {
    const porDimension = new Map(a.degradacion.map((d) => [d.dimension.codigo, d.degradacionId]));
    const degradacion = {} as Record<Dim, number>;
    for (const d of DIMENSIONES) degradacion[d] = porDimension.get(d) ?? idNoAplica;

    return {
      id: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      grupo: a.grupo,
      nota: a.notaAplicacion,
      frecuenciaId: a.frecuenciaId,
      degradacion,
      tipos: a.tipos.map((t) => t.tipoId),
      controles: a.controles.map((c) => ({
        codigo: c.control.codigo,
        nombre: c.control.nombre,
        nivel: c.control.actual?.nivel ?? null,
        aplica: c.control.aplica,
        // No relevance yet: weight 1 and no principal, which is the workbook's plain
        // AVERAGE. `relevancia` stays null so the sheet can say so instead of showing a
        // level nobody assigned.
        peso: c.relevancia?.peso ?? 1,
        esPrincipal: c.relevancia?.esPrincipal ?? false,
        relevancia: c.relevancia?.nombre ?? null,
        evidencia: c.control.evidencia,
      })),
    };
  });
}

export async function cargarActivo(codigo: string): Promise<ActivoFicha | null> {
  const activo = await prisma.activo.findUnique({
    where: { codigo },
    include: {
      valores: {
        select: { dimension: { select: { codigo: true } }, valor: { select: { valor: true } } },
      },
      // Obsolete risks are out of scope by definition: the threat no longer applies to
      // the asset's type. They are excluded from the live analysis and reappear on their
      // own if the parameterisation brings the threat back.
      //
      // The ones excluded BY HAND come along anyway. `quitarAmenazaDelActivo` leaves them
      // obsolete with `excluidoManual`, and a sheet that could not see them would show
      // the threat as active again — the parameterisation still pre-classifies it — and
      // offer no way to undo the removal. They are split apart below.
      riesgos: {
        where: { OR: [{ obsoleto: false }, { excluidoManual: true }] },
        orderBy: { amenaza: { codigo: 'asc' } },
        select: {
          codigo: true,
          amenazaId: true,
          obsoleto: true,
          impacto: true,
          riesgoPotencial: true,
          frecuenciaResidual: true,
          riesgoResidual: true,
          frecuenciaId: true,
          madurezId: true,
          tratamientoId: true,
          estadoId: true,
          responsableId: true,
          observacion: true,
          justificacion: true,
          origen: true,
          degradacion: {
            select: {
              degradacionId: true,
              justificacion: true,
              dimension: { select: { codigo: true } },
            },
          },
        },
      },
    },
  });

  if (activo === null || !activo.activo || activo.codigo === null) return null;

  // A dimension with no row is a 0, not a hole: the workbook leaves the cell blank when
  // the dimension does not apply, and 0 is exactly what "Irrelevante" means.
  const porDimension = new Map(activo.valores.map((v) => [v.dimension.codigo, v.valor.valor]));
  const valores = {} as Record<Dim, number>;
  for (const d of DIMENSIONES) valores[d] = porDimension.get(d) ?? 0;

  // The live analysis and the removals, kept apart: `riesgos` means exactly what it meant
  // before this split, and the removed ones travel only so the undo band can exist.
  const vivos = activo.riesgos.filter((r) => !r.obsoleto);
  const excluidos = activo.riesgos.filter((r) => r.obsoleto);

  return {
    id: activo.id,
    codigo: activo.codigo,
    codigoHeredado: activo.codigoHeredado,
    nombre: activo.nombre,
    descripcion: activo.descripcion,
    areaId: activo.areaId,
    tipoId: activo.tipoId,
    subtipoId: activo.subtipoId,
    propietarioId: activo.propietarioId,
    custodioId: activo.custodioId,
    ubicacionId: activo.ubicacionId,
    entornoId: activo.entornoId,
    proveedorId: activo.proveedorId,
    superiorId: activo.superiorId,
    datosCliente: activo.datosCliente,
    datosPersonales: activo.datosPersonales,
    expuestoInternet: activo.expuestoInternet,
    cantidad: activo.cantidad,
    valores,
    amenazasExcluidas: excluidos.map((r) => ({
      amenazaId: r.amenazaId,
      codigoRiesgo: r.codigo,
    })),
    riesgos: vivos.map((r) => ({
      codigo: r.codigo,
      amenazaId: r.amenazaId,
      impacto: r.impacto?.toString() ?? null,
      riesgoPotencial: r.riesgoPotencial?.toString() ?? null,
      // Null on every risk today, and null all the way to the screen. No threat has
      // controls with a relevance assigned, so the efficacy is UNKNOWN, not zero: a
      // residual equal to the inherent one is a defect this domain has already paid for.
      frecuenciaResidual: r.frecuenciaResidual?.toString() ?? null,
      riesgoResidual: r.riesgoResidual?.toString() ?? null,
      frecuenciaId: r.frecuenciaId,
      madurezId: r.madurezId,
      tratamientoId: r.tratamientoId,
      estadoId: r.estadoId,
      responsableId: r.responsableId,
      observacion: r.observacion,
      justificacion: r.justificacion,
      origen: r.origen,
      degradacion: r.degradacion
        .filter((d): d is typeof d & { dimension: { codigo: Dim } } =>
          (DIMENSIONES as readonly string[]).includes(d.dimension.codigo),
        )
        .map((d) => ({
          dimension: d.dimension.codigo,
          degradacionId: d.degradacionId,
          justificacion: d.justificacion,
        })),
    })),
  };
}

export async function cargarNavegacion(): Promise<Navegacion> {
  const activos = await prisma.activo.findMany({
    where: { activo: true, codigo: { not: null } },
    orderBy: { codigo: 'asc' },
    select: { codigo: true },
  });
  return { codigos: activos.map((a) => a.codigo as string) };
}
