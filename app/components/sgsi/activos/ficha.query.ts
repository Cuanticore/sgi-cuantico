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
import { parsearOrigen } from '@/lib/sgsi/origen-plan';

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

/// REQ-SIG-20 §11 (P9) · un nivel del catálogo `CriticidadNegocio`. `rtoMinutos`/
/// `rpoMinutos` viajan como número, no como texto: «≤ 4 h» es presentación y el minuto es
/// el dato — es lo que permite ordenar por criticidad y compararla, nunca leerla de vuelta.
/// `null` en cualquiera de los dos es C5, «sin SLA», un valor declarado y no una ausencia.
export interface NivelCriticidad {
  id: number;
  codigo: string;
  nombre: string;
  rtoMinutos: number | null;
  rpoMinutos: number | null;
  /// Qué exige el nivel en términos de arquitectura («réplica síncrona», «respaldo diario»).
  /// Viaja a la ficha para que el nivel se explique JUNTO al select que lo elige, y no en
  /// un `title` que hay que descubrir pasando el mouse. Nullable en la base: un nivel sin
  /// describir se pinta solo con su RTO/RPO antes que con un texto inventado.
  descripcion: string | null;
}

/// E1 · un nodo de la jerarquía del inventario (`NivelActivo`). Es una jerarquía de verdad,
/// no tres columnas sueltas: el `padreId` es lo que impide que un nivel 2 aparezca bajo una
/// raíz que no le corresponde.
export interface NivelJerarquia {
  id: number;
  /// 1, 2 o 3. El activo solo puede apuntar a uno de grado 3.
  grado: number;
  nombre: string;
  /// Nulo solo en grado 1.
  padreId: number | null;
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
  soa: 'si' | 'parcial' | 'no';
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
  /// REQ-SIG-20 §11 (P9) · declarada por el negocio, nunca derivada del residual. `null`
  /// para todo activo que FOR-SIG-12 columna 26 todavía no clasificó.
  criticidadId: number | null;
  /// E2 · apunta al NIVEL 3 de la jerarquía, el más específico. Los grados 1 y 2 se derivan
  /// subiendo por `padreId` — guardar los tres sería guardar lo derivable y permitiría que
  /// un activo dijera estar en una rama mientras su nivel 3 cuelga de otra.
  nivelId: number | null;
  datosCliente: Ternario;
  datosPersonales: Ternario;
  expuestoInternet: Ternario;
  cantidad: number;
  valores: Record<Dim, number>;
  riesgos: RiesgoGuardado[];
  /// Threats removed from this asset by hand, so the sheet can keep them off the live
  /// list and offer the undo the handoff asks for instead of showing them as active.
  amenazasExcluidas: AmenazaExcluida[];
  /// Los planes activos que ya cubren riesgos de este activo, por amenaza. Vacío cuando
  /// ninguno: la ficha ofrece crearlo en vez de afirmar que existe.
  planes: PlanDeAmenaza[];
  /// Las cuentas del dominio que este activo encarna. Vacío para todo activo que no sea
  /// `[P] Personal`, y también para uno que lo sea y todavía no las haya declarado.
  cuentas: CuentaDelActivo[];
}

/// REQ-SIG-20 §7.2 · un plan de tratamiento ACTIVO que ya cubre un riesgo de este activo.
///
/// El vínculo plan↔riesgo no es una columna: la unidad del plan sigue siendo el CONTROL, y
/// de qué activo y qué amenaza nació viaja en el prefijo verificable de `AccionPlan.origen`
/// (`lib/sgsi/origen-plan.ts`). Por eso acá se parsea en vez de consultarse: un plan creado
/// por otro camino no trae el prefijo y, con razón, no cubre a nadie.
export interface PlanDeAmenaza {
  /// La amenaza que el plan cubre EN ESTE ACTIVO.
  amenazaCodigo: string;
  /// `AccionPlan.codigo`, PT-001 — con el que se lo busca en /sgsi/planes.
  codigo: string;
  accion: string;
  estado: string;
}

/// Una cuenta del dominio que este activo ENCARNA (`ActivoPersona`).
///
/// No es el custodio. El custodio persona dice quién tiene el activo en la mano; esto dice
/// de quién está HECHO el activo cuando es de tipo `[P] Personal`.
export interface CuentaDelActivo {
  personaId: number;
  nombre: string;
  correo: string;
  /// Una cuenta inactiva atada sigue mostrándose: que alguien haya salido de la
  /// organización es justamente lo que hay que ver, no algo que esconder.
  activa: boolean;
}

/// Una persona del directorio, para el buscador que ata cuentas al activo.
export interface PersonaOpcion {
  id: number;
  nombre: string;
  correo: string;
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
  /// REQ-SIG-20 §11 (P9) · los cinco niveles fijos, en orden C1..C5.
  criticidades: NivelCriticidad[];
  /// E1/E2 · la jerarquía de tres grados, plana y entera. Viaja completa porque los tres
  /// selects de la ficha se encadenan en el cliente —elegir el nivel 1 filtra el 2, y el 2
  /// filtra el 3— y hacerlo con un viaje al servidor por cada paso sería pedirle a la red
  /// lo que ya cabe en memoria: son decenas de filas, no miles.
  niveles: NivelJerarquia[];
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
  /// El directorio activo, para atar cuentas a un activo `[P] Personal`. Sólo las activas:
  /// atar a alguien que ya salió de la organización sería declarar algo que dejó de ser
  /// cierto — las que YA estaban atadas siguen viéndose aunque se inactiven.
  personas: PersonaOpcion[];
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
    criticidades,
    personas,
    niveles,
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
    prisma.criticidadNegocio.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
    prisma.persona.findMany({
      where: { activa: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, correo: true },
    }),
    // Los tres grados de una vez. `orden` primero porque la jerarquía tiene un orden
    // declarado por quien la administra, y el nombre solo desempata.
    prisma.nivelActivo.findMany({
      where: { activo: true },
      orderBy: [{ grado: 'asc' }, { orden: 'asc' }, { nombre: 'asc' }],
      select: { id: true, grado: true, nombre: true, padreId: true },
    }),
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
    criticidades: criticidades.map((c) => ({
      id: c.id,
      codigo: c.codigo,
      nombre: c.nombre,
      rtoMinutos: c.rtoMinutos,
      rpoMinutos: c.rpoMinutos,
      descripcion: c.descripcion,
    })),
    personas: personas.map((p) => ({ id: p.id, nombre: p.nombre, correo: p.correo })),
    niveles: niveles.map((n) => ({
      id: n.id,
      grado: n.grado,
      nombre: n.nombre,
      padreId: n.padreId,
    })),
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
                soa: true,
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
        soa: c.control.soa === 'PARCIAL' ? 'parcial' : c.control.soa === 'NO' ? 'no' : 'si',
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

/// Un código RETIRADO sigue llevando a su activo.
///
/// Cuando un activo cambia de proceso su código se reemite, y todo lo ya emitido —actas,
/// informes, el propio libro V19, un enlace que alguien guardó— sigue citando el anterior.
/// La bitácora es la que sabe: el guardado que reemitió dejó un renglón `campo = 'codigo'`
/// con el viejo en `valorAnterior` y el nuevo en `valorNuevo`. Se camina esa cadena hacia
/// adelante —un activo puede haberse mudado más de una vez— hasta llegar al código que hoy
/// existe.
///
/// No se guarda ningún índice de códigos previos: sería duplicar lo que la bitácora ya
/// registra, y una segunda fuente de verdad sobre la identidad del activo es exactamente lo
/// que no queremos tener.
async function resolverCodigoRetirado(codigo: string): Promise<string | null> {
  const vistos = new Set<string>([codigo]);
  let actual = codigo;

  // Un tope: la cadena es cortísima en la práctica, y un ciclo —imposible por construcción,
  // porque los códigos no se reasignan— no puede colgar la pantalla.
  for (let saltos = 0; saltos < 10; saltos++) {
    const renglon = await prisma.bitacora.findFirst({
      where: { tabla: 'activo', campo: 'codigo', valorAnterior: actual },
      orderBy: { id: 'desc' },
      select: { valorNuevo: true },
    });
    if (renglon === null) return null;
    const siguiente = renglon.valorNuevo;
    if (siguiente === null || vistos.has(siguiente)) return null;
    vistos.add(siguiente);

    const existe = await prisma.activo.findUnique({
      where: { codigo: siguiente },
      select: { codigo: true },
    });
    if (existe !== null) return siguiente;
    actual = siguiente;
  }
  return null;
}

export async function cargarActivo(codigo: string): Promise<ActivoFicha | null> {
  const vigente = await prisma.activo.findUnique({
    where: { codigo },
    select: { id: true },
  });
  if (vigente === null) {
    const reemplazo = await resolverCodigoRetirado(codigo);
    if (reemplazo !== null) return cargarActivo(reemplazo);
  }

  const activo = await prisma.activo.findUnique({
    where: { codigo },
    include: {
      personasDelActivo: {
        include: { persona: { select: { nombre: true, correo: true, activa: true } } },
        orderBy: { persona: { nombre: 'asc' } },
      },
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

  // REQ-SIG-20 §7.2 · qué riesgos de este activo ya tienen plan. Se traen TODAS las
  // acciones activas y se filtran en memoria: el vínculo vive dentro del texto de `origen`,
  // así que no hay índice que consultar, y son decenas de filas — no las 2256 de riesgos.
  // Una acción sin el prefijo no cubre nada y `parsearOrigen` devuelve null, que es
  // justamente el caso de los planes nacidos desde la pantalla de controles.
  const acciones = await prisma.accionPlan.findMany({
    where: { activa: true },
    select: { codigo: true, accion: true, estado: true, origen: true },
    orderBy: { codigo: 'asc' },
  });
  const planes: PlanDeAmenaza[] = [];
  for (const a of acciones) {
    const origen = parsearOrigen(a.origen);
    if (origen === null || origen.activoCodigo !== activo.codigo) continue;
    planes.push({
      amenazaCodigo: origen.amenazaCodigo,
      codigo: a.codigo,
      accion: a.accion,
      estado: a.estado,
    });
  }

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
    criticidadId: activo.criticidadId,
    nivelId: activo.nivelId,
    cuentas: activo.personasDelActivo.map((v) => ({
      personaId: v.personaId,
      nombre: v.persona.nombre,
      correo: v.persona.correo,
      activa: v.persona.activa,
    })),
    datosCliente: activo.datosCliente,
    datosPersonales: activo.datosPersonales,
    expuestoInternet: activo.expuestoInternet,
    cantidad: activo.cantidad,
    valores,
    amenazasExcluidas: excluidos.map((r) => ({
      amenazaId: r.amenazaId,
      codigoRiesgo: r.codigo,
    })),
    planes,
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

/// Lo que el overlay (REQ-SIG-20 §6, D1) necesita para renderizar la MISMA `FichaActivo`
/// que la página completa: el activo, el catálogo completo y la materia prima de amenazas.
/// Sin `Navegacion` — el overlay no participa del recorrido Atrás/Siguiente del inventario.
///
/// El fetch que arma este tipo (`abrirOverlayActivo`) NO vive en este archivo: este módulo
/// es `server-only` — de lectura directa desde Server Components, como `page.tsx` — y un
/// `Client Component` como `OverlayActivo` no puede importar una función de acá como valor
/// sin arrastrar todo el módulo (Prisma incluido) al bundle del navegador. Por eso
/// `abrirOverlayActivo` vive en `app/sgsi/acciones/activos.ts`, con `'use server'` de
/// archivo — la única forma, según la documentación de Next empaquetada en
/// `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`, de
/// exponer una función de servidor que un Client Component pueda llamar directamente.
/// Import de solo tipo, como el de acá abajo, no tiene ese problema: se borra en
/// compilación.
export interface DatosOverlayActivo {
  activo: ActivoFicha;
  catalogos: Catalogos;
  amenazas: AmenazaCatalogo[];
}
