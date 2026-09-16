'use client';

// app/components/sgsi/activos/FichaActivo.tsx
//
// Handoff v2.1 screens 3 and 4, "Ficha del activo" — creation mode and edit mode, three
// tabs, one fixed bottom bar.
//
// This is the sheet where the whole model becomes visible at once, so nothing on it is
// read from a stored aggregate. Moving a dimension moves the value, the impacts, the
// inherent risk, the row colours, the matrices, the KPIs and the orange band; moving a
// degradation or a frequency moves the row and the matrices; moving a control's maturity
// moves the group's average, the efficacy, the residual frequency and the residual. All
// of it goes through lib/sgsi — clasificar, formulas, madurez — because a second
// implementation of a formula is a second place a figure can be wrong.
//
// FIVE RULES THIS FILE OBEYS AND THE READER SHOULD NOT "FIX"
//
// 1. The asset's value is max(v_D, v_I, v_C). It is DERIVED. No field, no column, never
//    captured — MET-SIG-01 §7.2.
//
// 2. There is no residual impact. Efficacy reduces FREQUENCY, nothing else. Controls
//    that limit damage are reflected by lowering the THREAT's degradation, so there is
//    one judgement per row and not two — MET-SIG-01 §7.4.
//
// 3. Degradation is an attribute of the THREAT. The per-risk override table exists
//    (`RiesgoDegradacion`), and its NOT NULL `justificacion` is the point: changing a
//    degradation on one risk is an EXCEPTION. It is marked in the warn colour and it
//    will not save without a written reason.
//
// 4. `riesgoResidual` is NULL on every risk today. No control–threat relevance is
//    assigned, so the efficacy is UNKNOWN, not zero. Everywhere a residual would go the
//    sheet says "sin calcular". Never 0, never a bare dash. A residual equal to the
//    inherent is a defect this domain has already paid for.
//
// 5. The asset code is immutable and never reused. Changing the area or the type does
//    NOT change it — that change goes to the bitácora. It is never rendered as an input.
//
// PERSISTENCE
//
// The sheet is wired to the server actions. An edit is still held in client state — the
// whole screen is one long what-if and no round trip may sit between moving a D and
// seeing the risk move — but Save now diffs that state against what the SERVER sent and
// calls one action per kind of change:
//
//   guardarDatosGenerales   the general-data card
//   guardarValoracion       the three dimensions
//   excepcionDegradacion    a per-risk degradation, and the return to inheritance
//   excepcionFrecuencia     a per-risk frequency, and the return to inheritance
//   guardarTratamiento      treatment, responsible, state and observations
//   quitarAmenazaDelActivo  the logical removal of a threat, with its reason
//   restaurarAmenaza        the undo of that removal
//   darDeBajaActivo         the logical delete of the asset, with its reason
//
// Two rules of those actions are enforced HERE as well, so the user is warned instead of
// rejected: an exception needs a written justification — including when it is cleared,
// because going back to the inherited value is also a change an auditor asks about — and
// a treatment stored while the residual is uncalculated is an override by definition, so
// it needs text in `observacion`. `riesgoResidual` is null on every risk today, so that
// second rule bites on the FIRST treatment saved on any risk.
//
// After a successful save the screen re-reads with `router.refresh()`: the actions run
// `generarRiesgos` server-side, so the figures the sheet is holding are stale by then and
// trusting its own copy is how a report ends up contradicting itself.
//
// WHAT IS STILL NOT PERSISTED, AND WHY
//
// The control maturity, the "Previene / Limita" effect, taking a control out of a threat's
// group and adding a threat from the rest of the catalogue have no action in this
// repository. They stay as a what-if: they move the figures on screen, they are listed as
// a simulation in the bottom bar, and they are NOT counted as unsaved changes, so the
// indicator never claims to have saved something it did not.

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  crearActivo,
  darDeBajaActivo,
  vincularCuentaAlActivo,
  guardarDatosGenerales,
  guardarValoracion,
  recalcularRiesgosDelActivo,
  type CambioValoracion,
  type DatosGenerales as DatosGeneralesActivo,
} from '@/app/sgsi/acciones/activos';
import {
  guardarSesionRiesgo,
  guardarTratamiento,
  quitarAmenazaDelActivo,
  restaurarAmenaza,
  type BorradorSesionRiesgo,
  type DecisionTratamiento,
} from '@/app/sgsi/acciones/riesgos';
import { clasificar, clasificarZona, tratamientoSugerido, type Zona } from '@/lib/sgsi/clasificar';
import { Decimal, entraAlAnalisis, valorActivo, type ValoresDimension } from '@/lib/sgsi/formulas';
import { resolverEcuacion, type EcuacionResuelta } from '@/lib/sgsi/ecuacion';
import { esCriticidadSospechosa } from '@/lib/sgsi/criticidad-coherencia';
import {
  catalogoDeClase,
  claseDeControl,
  CLASES_RELEVANCIA,
  type AporteClase,
  type ClaseRelevancia,
} from '@/lib/sgsi/madurez';
import { rotuloClase, TONO_CLASE } from './clases-relevancia';
import { formatearSla } from '@/lib/sgsi/criticidad-sla';
import { cadenaDeNivel } from '@/lib/sig/niveles';
import type { Catalogo } from '@/lib/sgsi/catalogos';
import PopupCatalogo from '@/app/components/sgsi/parametros/PopupCatalogo';
import PopupControlesAmenaza from './PopupControlesAmenaza';
import PopupPlanCritico from './PopupPlanCritico';
import PestanaEcuacion from './PestanaEcuacion';
import type {
  ActivoBreve,
  ActivoFicha,
  AmenazaCatalogo,
  Catalogos,
  ControlDeAmenaza,
  Dim,
  Navegacion,
  NivelCriticidad,
  CuentaDelActivo,
  NivelJerarquia,
  PersonaOpcion,
  NivelValor,
  PlanDeAmenaza,
  RiesgoGuardado,
  Ternario,
} from './ficha.query';

export type { ActivoFicha, AmenazaCatalogo, Catalogos, Navegacion };

export type Pestana = 'valoracion' | 'amenazas' | 'resumen' | 'ecuacion';

interface Props {
  /// Null in creation mode. There is no separate creation screen in v2.1: the sheet
  /// itself has a creation mode.
  activo: ActivoFicha | null;
  catalogos: Catalogos;
  amenazas: AmenazaCatalogo[];
  navegacion: Navegacion;
  pestanaInicial?: Pestana;
  /// A threat code to open expanded, so the drill-down of the matrices lands on the exact
  /// row it was clicked from.
  amenazaInicial?: string | null;
}

const DIMS: readonly Dim[] = ['D', 'I', 'C'];

const NOMBRE_DIM: Record<Dim, string> = {
  D: 'Disponibilidad',
  I: 'Integridad',
  C: 'Confidencialidad',
};

// ===========================================================================
// The manual's examples per dimension and level
// ===========================================================================
//
// MET-SIG-01's valuation criteria. They live in code and not in the database because
// there is no table for them: `escala_valor` holds the label and the number only. They
// belong in a parameter table the day the SIG lead needs to reword them without a
// deployment; hiding them instead would make the valuation less comparable between
// processes, which is the whole reason the handoff puts them on the card.
const EJEMPLOS: Record<Dim, Record<number, string>> = {
  D: {
    5: 'Su indisponibilidad detiene un servicio a cliente en menos de una hora y activa el plan de continuidad.',
    4: 'Su indisponibilidad interrumpe un proceso crítico durante la jornada; hay incumplimiento contractual si supera el día.',
    3: 'Su indisponibilidad afecta un proceso interno y existe alternativa manual conocida.',
    2: 'Su indisponibilidad se tolera varios días sin efecto visible para el cliente.',
    1: 'Su indisponibilidad no afecta ningún proceso en curso.',
    0: 'El activo no se requiere para operar.',
  },
  I: {
    5: 'Un dato alterado sin detectar produce un reporte oficial o una decisión de dirección erróneos.',
    4: 'Una alteración obliga a rehacer trabajo y a notificar a un cliente o a una autoridad.',
    3: 'Una alteración se detecta y corrige dentro del propio proceso, con reproceso menor.',
    2: 'Una alteración tiene efecto menor y es reversible sin reproceso.',
    1: 'La exactitud no es relevante para el uso que se le da al activo.',
    0: 'El activo no contiene información que deba ser exacta.',
  },
  C: {
    5: 'Su divulgación expone datos personales sensibles, secretos contractuales o credenciales de producción.',
    4: 'Su divulgación afecta a un cliente identificable o da ventaja a un competidor.',
    3: 'Su divulgación es indeseable pero no causa daño externo demostrable.',
    2: 'Información de circulación interna amplia, sin restricción entre colaboradores.',
    1: 'Información que puede compartirse con terceros sin restricción.',
    0: 'Información pública por diseño.',
  },
};

const TERNARIOS: { valor: Ternario; etiqueta: string }[] = [
  { valor: 'SI', etiqueta: 'Sí' },
  { valor: 'NO', etiqueta: 'No' },
  { valor: 'POR_DEFINIR', etiqueta: 'Por definir' },
];

// ===========================================================================
// The eleven columns of the threat grid
// ===========================================================================
//
// Verbatim from the handoff, in one constant so the header and every row can never drift
// apart. The min-width is the rule the handoff marks as the cause of repeated defects:
// it must be at least the sum of the columns plus the row's padding. The fixed columns
// add up to 778px, the flexible one has an 85px floor and the row pads 14px on each
// side — 891px. The handoff's 1120px clears that and leaves the flexible column room,
// which is what lets the residual column in without a second scroll.
const COLUMNAS_AMENAZAS =
  '54px minmax(85px, 0.5fr) 72px 72px 72px 104px 112px 52px 104px 104px 32px';
const ANCHO_MINIMO_AMENAZAS = 1120;

/// El nombre del control es la única columna elástica y la que decide si la fila se lee. Con
/// el diálogo topado en `max-w-4xl` le quedaban ~90px y «Seguridad de la información para el
/// uso de servicios en la nube» se partía en CUATRO líneas, con lo cual cada fila medía lo que
/// midiera su nombre y la tabla dejaba de leerse como tabla.
///
/// El piso de 300px es el que hace caber en una línea al nombre más largo del catálogo ISO a
/// 12px. Las columnas fijas suman 66+214+228+92+30 = 630px más 24px de padding de fila, así
/// que el mínimo total es 954 y el diálogo se ensanchó a 1344px (`ANCHO_DIALOGO_AMENAZA`)
/// para dárselos con holgura.
const COLUMNAS_CONTROLES = '66px minmax(300px, 1fr) 214px 228px 92px 30px';
const ANCHO_MINIMO_CONTROLES = 954;

/// 1344px — un 50 % más que el `max-w-4xl` (896px) que el diálogo tenía. No es una cifra
/// estética: es lo que necesita `COLUMNAS_CONTROLES` para que el nombre del control quepa en
/// una línea sin comerse las dos columnas que mueven el cálculo (madurez y efecto).
const ANCHO_DIALOGO_AMENAZA = 1344;

/// Severity ramp, most severe first. Indexed by the band's POSITION in umbral_riesgo
/// rather than by its name, so renaming a band never silently turns it grey.
const RAMPA_RIESGO = [
  { bg: 'var(--hf-risk-critico-bg)', fg: 'var(--hf-risk-critico-fg)' },
  { bg: 'var(--hf-risk-alto-bg)', fg: 'var(--hf-risk-alto-fg)' },
  { bg: 'var(--hf-risk-medio-bg)', fg: 'var(--hf-risk-medio-fg)' },
  { bg: 'var(--hf-risk-bajo-bg)', fg: 'var(--hf-risk-bajo-fg)' },
];

const ABREVIATURA_RIESGO: Record<string, string> = {
  Crítico: 'CRÍT',
  Alto: 'ALTO',
  Medio: 'MED',
  Bajo: 'BAJO',
};

function colorRiesgo(indice: number) {
  return RAMPA_RIESGO[Math.min(Math.max(indice, 0), RAMPA_RIESGO.length - 1)];
}

function abreviarRiesgo(nombre: string): string {
  return ABREVIATURA_RIESGO[nombre] ?? nombre.slice(0, 4).toUpperCase();
}

/// Value badges, Muy Alto down to Muy Bajo, keyed by the NUMBER exactly as the inventory
/// grid keys them: the label is data and the organisation may reword it, the number is
/// not. 0 — Irrelevante shares the faintest badge with 1.
function colorDeValor(valor: number) {
  const i = Math.min(5, Math.max(1, valor));
  return { bg: `var(--hf-level-${i}-bg)`, fg: `var(--hf-level-${i}-fg)` };
}

/// Impact badges, indexed by the band's POSITION in `umbral_impacto` — which arrives
/// worst-first — so renaming a band never changes its colour. `total` is the number of
/// bands: with the five in use, position 0 takes the top badge and position 4 the bottom.
function colorDeBandaImpacto(indice: number, total: number) {
  const i = Math.min(5, Math.max(1, total - indice));
  return { bg: `var(--hf-level-${i}-bg)`, fg: `var(--hf-level-${i}-fg)` };
}

/// CMM traffic light: L0–L1 red, L2–L3 orange, L4–L5 green. L3 is ORANGE — a defined
/// process is not yet the target. Null is a fourth state and it is not L0.
function semaforo(nivel: number | null) {
  if (nivel === null) {
    return { fg: 'var(--hf-cmm-nulo-fg)', bg: 'var(--hf-cmm-nulo-bg)', bd: 'var(--hf-cmm-nulo-bd)' };
  }
  if (nivel <= 1) {
    return { fg: 'var(--hf-cmm-rojo-fg)', bg: 'var(--hf-cmm-rojo-bg)', bd: 'var(--hf-cmm-rojo-bd)' };
  }
  if (nivel <= 3) {
    return {
      fg: 'var(--hf-cmm-naranja-fg)',
      bg: 'var(--hf-cmm-naranja-bg)',
      bd: 'var(--hf-cmm-naranja-bd)',
    };
  }
  return {
    fg: 'var(--hf-cmm-verde-fg)',
    bg: 'var(--hf-cmm-verde-bg)',
    bd: 'var(--hf-cmm-verde-bd)',
  };
}

/// Thousands with a point, written out rather than delegated to toLocaleString so the
/// server and the browser produce the same markup.
function miles(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/// Whole numbers above a hundred, four decimals below a hundredth so a residual
/// frequency of 0,0010 does not print as 0, two decimals in between.
function cifra(n: number): string {
  if (n === 0) return '0';
  if (Math.abs(n) >= 100) return miles(n);
  if (Math.abs(n) < 0.01) return n.toFixed(4).replace('.', ',');
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}

function porcentaje(fraccion: number): string {
  return `${Math.round(fraccion * 100)}%`;
}

/// "L3", never "L3,0". The decimal survives only when it is not zero.
function nivelTexto(nivel: number | null): string {
  if (nivel === null) return 'sin evaluar';
  const redondeado = Math.round(nivel * 10) / 10;
  return `L${redondeado.toString().replace('.', ',')}`;
}

/// "4 — Alto" reads as "Alto" once the number is already on screen beside it.
function etiquetaCorta(etiqueta: string): string {
  return etiqueta.split('— ')[1] ?? etiqueta;
}

/// The actions' messages, joined. They are written to be read by a person, so they are
/// shown verbatim; a save that fired six of them is capped so the banner stays a banner.
function resumen(mensajes: string[]): string {
  if (mensajes.length === 0) return 'No había cambios que guardar.';
  if (mensajes.length <= 3) return mensajes.join(' · ');
  return `${mensajes.slice(0, 3).join(' · ')} · y ${mensajes.length - 3} mensajes más.`;
}

/// A band name plus its position in the ordered threshold list, which is what the colour
/// ramps are indexed by. Null when nothing classifies the figure.
interface BandaEnPosicion {
  nombre: string;
  indice: number;
}

function indiceBanda(
  nombre: string | null,
  bandas: readonly { nombre: string }[],
): BandaEnPosicion | null {
  if (nombre === null) return null;
  const indice = bandas.findIndex((b) => b.nombre === nombre);
  return { nombre, indice: indice < 0 ? bandas.length - 1 : indice };
}

// ===========================================================================
// Editable state
// ===========================================================================

/// The general-data fields. Ids, never names: the sheet edits foreign keys, and null is a
/// real value — `propietario` is empty on all 234 assets of the workbook, `superior` on
/// all 234 and `proveedor` on 233.
interface Edicion {
  nombre: string;
  descripcion: string;
  areaId: number;
  tipoId: number;
  subtipoId: number;
  propietarioId: number | null;
  custodioId: number | null;
  ubicacionId: number | null;
  entornoId: number | null;
  proveedorId: number | null;
  superiorId: number | null;
  /// REQ-SIG-20 §11 (P9) · declarada por el negocio, nunca derivada del residual.
  criticidadId: number | null;
  /// E2 · el nivel 3 de la jerarquía. Los grados 1 y 2 NO se editan acá porque no se
  /// guardan: los selects de la cabecera solo sirven para llegar al 3.
  nivelId: number | null;
  /// V21 · cuántas unidades representa el activo.
  cantidad: number;
  datosCliente: Ternario;
  datosPersonales: Ternario;
  expuestoInternet: Ternario;
}

/// A per-risk degradation exception: the level chosen and the reason it deviates from the
/// threat's parametrized value. `RiesgoDegradacion.justificacion` is NOT NULL, so an
/// empty reason blocks the save instead of being written as an empty string.
///
/// `degradacionId: null` is the pending RETURN to the threat's parameterisation.
/// `excepcionDegradacion` removes the override row for that, and it asks for a
/// justification just the same — inheriting again is a change an auditor will also ask
/// about — so the entry stays in state with its reason instead of simply vanishing.
interface Excepcion {
  degradacionId: number | null;
  justificacion: string;
}

interface Tratamiento {
  tratamientoId?: number | null;
  estadoId?: number | null;
  responsableId?: number | null;
  observacion?: string;
}

type Sync = 'limpio' | 'pendiente' | 'guardando' | 'sincronizado';

/// What a control does to the risk. Informational on this sheet: MET-SIG-01 §7.4 models
/// only the preventive effect, so "Limita" changes no arithmetic here — a control that
/// limits damage is reflected by lowering the THREAT's degradation instead. There is no
/// column for it yet; `Control.funcionControl` is the nearest field and the schema
/// documents it as present and unused.
type EfectoControl = 'Previene' | 'Limita';

interface ControlEnFila extends Omit<ControlDeAmenaza, 'nivel'> {
  nivel: number | null;
  efecto: EfectoControl;
}

/// One threat of the asset with every figure it carries, all derived. This is the shape
/// the three tabs read; nothing on the sheet computes a risk figure of its own.
interface FilaAmenaza {
  amenaza: AmenazaCatalogo;
  /// False when the threat was added from the rest of the catalogue — an exception to the
  /// type's parameterisation, which is what `OrigenRiesgo.EXCEPCION` records.
  preclasificada: boolean;
  guardado: RiesgoGuardado | undefined;
  degradacionId: Record<Dim, number>;
  desviada: Record<Dim, boolean>;
  justificacion: Record<Dim, string>;
  /// What the save would WRITE for this dimension: an id, or null for "no override row,
  /// inherit the threat's value". Null is also what `excepcionDegradacion` takes to remove
  /// the row, so this is the argument, not a display value.
  objetivoDegradacion: Record<Dim, number | null>;
  /// True when `objetivoDegradacion` differs from what is stored, which is the only case
  /// that needs a call — and therefore the only case that needs a justification.
  degradacionPendiente: Record<Dim, boolean>;
  frecuenciaId: number;
  frecuenciaDesviada: boolean;
  /// Same pair for the frequency. Null means the risk goes back to inheriting the ARO of
  /// its threat, which `excepcionFrecuencia` also refuses without a justification.
  objetivoFrecuencia: number | null;
  frecuenciaPendiente: boolean;
  justificacionFrecuencia: string;
  /// REQ-SIG-20 §10 (D5, tarea 4.15) · la excepción de madurez del RIESGO —`Riesgo.
  /// madurezId`, D5's first writer—, distinta de la madurez del control. `null` cuando el
  /// riesgo hereda de los controles.
  madurezRiesgoId: number | null;
  madurezRiesgoDesviada: boolean;
  /// Mismo par que `objetivoFrecuencia`: `null` = vuelve a heredar, un id = la excepción.
  objetivoMadurezRiesgo: number | null;
  madurezRiesgoPendiente: boolean;
  /// The treatment fields that changed against what the server sent, and whether the
  /// action will read the result as an override. With the residual uncalculated there is
  /// no band to back any decision, so ANY stored treatment is an override and
  /// `guardarTratamiento` demands text in `observacion`.
  tratamiento: Tratamiento;
  cambiosTratamiento: DecisionTratamiento;
  tratamientoPendiente: boolean;
  sobrescribeTratamiento: boolean;
  faltaObservacion: boolean;
  /// The code of the stored risk, which every action on this row needs. Null while the
  /// risk does not exist yet: the asset is below the threshold, or the threat was added in
  /// this session and no action creates that row.
  codigoRiesgo: string | null;
  aro: number;
  impacto: number;
  bandaImpacto: BandaEnPosicion | null;
  riesgo: number;
  bandaRiesgo: BandaEnPosicion | null;
  zona: Zona;
  controles: ControlEnFila[];
  /// Rounded mean of the group's CMM levels — the figure the expanded card leads with.
  /// Null when no control has an assessment, which is not L0.
  madurezGrupo: number | null;
  /// Null when unknown. NOT zero: that distinction is the whole point.
  eficacia: number | null;
  frecuenciaResidual: number | null;
  residual: number | null;
  bandaResidual: BandaEnPosicion | null;
  /// The seven-step resolution (D3, REQ-SIG-20 tarea 2.2) that produced `impacto`,
  /// `riesgo`, `eficacia` and `residual` above. The live arithmetic in this row and the
  /// Ecuación tab both read this SAME object — there is no second calculation of any of
  /// these figures anywhere in this file (spec risk-equation-traceability, "Single
  /// arithmetic source").
  ecuacion: EcuacionResuelta;
}

export default function FichaActivo({
  activo,
  catalogos,
  amenazas,
  navegacion,
  pestanaInicial = 'valoracion',
  amenazaInicial = null,
}: Props) {
  const nuevo = activo === null;

  // --- What the server sent -------------------------------------------------------
  //
  // The baseline every edit is diffed against. It is recomputed from the props, so after
  // `router.refresh()` the pending changes disappear on their own: the state and the
  // baseline agree again, which is exactly what "guardado" has to mean.
  const baseEdicion = useMemo(() => inicial(activo, catalogos), [activo, catalogos]);
  const baseValores = useMemo<ValoresDimension>(
    () => activo?.valores ?? { D: 0, I: 0, C: 0 },
    [activo],
  );
  const baseDegOv = useMemo(() => excepcionesGuardadas(activo, amenazas), [activo, amenazas]);
  const baseFrecOv = useMemo(() => frecuenciasGuardadas(activo, amenazas), [activo, amenazas]);
  const baseTrat = useMemo(() => tratamientosGuardados(activo, amenazas), [activo, amenazas]);

  // --- Editable state -------------------------------------------------------------
  const [edicion, setEdicion] = useState<Edicion>(() => inicial(activo, catalogos));
  const [valores, setValores] = useState<ValoresDimension>(
    () => activo?.valores ?? { D: 0, I: 0, C: 0 },
  );
  const [degOv, setDegOv] = useState<Record<string, Partial<Record<Dim, Excepcion>>>>(() =>
    excepcionesGuardadas(activo, amenazas),
  );
  const [frecOv, setFrecOv] = useState<Record<string, number>>(() =>
    frecuenciasGuardadas(activo, amenazas),
  );
  /// The justification of a frequency exception, keyed by threat code. It has no column of
  /// its own on the risk when the exception is cleared — `excepcionFrecuencia` nulls
  /// `justificacion` then and the reason survives in the bitácora — so it is held here and
  /// travels as the action's argument.
  const [justFrec, setJustFrec] = useState<Record<string, string>>(() =>
    justificacionesFrecuencia(activo, amenazas),
  );
  const [madOv, setMadOv] = useState<Record<string, number>>({});
  /// REQ-SIG-20 §10 (D5, tarea 4.15) · la excepción de madurez del RIESGO —`Riesgo.
  /// madurezId`, distinta de `madOv` de arriba, que es la madurez del CONTROL y sigue sin
  /// acción propia. Clave = código de amenaza; ausente = sin tocar esta sesión, `null` =
  /// vuelve a heredar de los controles, un id = la excepción elegida. A diferencia de
  /// `frecOv`, acá SÍ hace falta un `null` explícito: no hay ningún id de `EscalaMadurez`
  /// que signifique por sí mismo "sin excepción".
  const [madurezRiesgoOv, setMadurezRiesgoOv] = useState<Record<string, number | null>>({});
  const [efectos, setEfectos] = useState<Record<string, EfectoControl>>({});
  const [ctlEliminados, setCtlEliminados] = useState<string[]>([]);
  const [eliminadas, setEliminadas] = useState<Record<string, string>>({});
  const [agregadas, setAgregadas] = useState<string[]>([]);
  const [trat, setTrat] = useState<Record<string, Tratamiento>>(() =>
    tratamientosGuardados(activo, amenazas),
  );
  const [baja, setBaja] = useState<string | null>(null);

  // --- Interface state ------------------------------------------------------------
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial);
  const [abierta, setAbierta] = useState<string | null>(amenazaInicial);
  const [popup, setPopup] = useState<'superior' | 'amenaza' | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [soloSinGestionar, setSoloSinGestionar] = useState(false);
  const [sync, setSync] = useState<Sync>('limpio');
  /// What the last save said, in the action's own words. The actions write their messages
  /// to be read by a person, so they are shown verbatim rather than replaced.
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, iniciarGuardado] = useTransition();
  const router = useRouter();

  // REQ-SIG-20 §10 (D5, tarea 4.15) · el guardado de fin de sesión. Mientras se edita, los
  // cambios de degradación/frecuencia/madurez del riesgo se acumulan sin pedir nada (`plan.
  // pendientes`, más abajo, ya cuenta con ellos); al guardar, si hay al menos uno, este
  // diálogo pide la nota ÚNICA obligatoria antes de dejar seguir — el único bloqueo
  // deliberado de D17 en este cambio.
  const [dialogoNotas, setDialogoNotas] = useState(false);
  const [nota, setNota] = useState('');

  // REQ-SIG-20 §7 (D4, tarea 4.16) · la cola de residuales que quedaron en banda Crítico
  // tras el guardado — uno por amenaza — para abrir `PopupPlanCritico` uno a la vez. El
  // guardado que la llenó YA tuvo éxito: D17 exige el plan, nunca condiciona el guardado.
  const [colaCritica, setColaCritica] = useState<{ activoCodigo: string; amenazaCodigo: string }[]>(
    [],
  );

  /// Every mutating handler funnels through this, so the indicator can never disagree
  /// with whether something was touched.
  const tocar = () => setSync((s) => (s === 'guardando' ? s : 'pendiente'));

  const editar = <K extends keyof Edicion>(campo: K, valor: Edicion[K]) => {
    setEdicion((e) => ({ ...e, [campo]: valor }));
    tocar();
  };

  // --- Catalogue lookups ----------------------------------------------------------
  const porId = useMemo(
    () => ({
      area: new Map(catalogos.areas.map((a) => [a.id, a])),
      tipo: new Map(catalogos.tipos.map((t) => [t.id, t])),
      degradacion: new Map(catalogos.escalaDegradacion.map((d) => [d.id, d])),
      frecuencia: new Map(catalogos.escalaFrecuencia.map((f) => [f.id, f])),
      activo: new Map(catalogos.activos.map((a) => [a.id, a])),
    }),
    [catalogos],
  );

  const area = porId.area.get(edicion.areaId);
  const tipo = porId.tipo.get(edicion.tipoId);
  const subtiposDelTipo = useMemo(
    () => catalogos.subtipos.filter((s) => s.tipoId === edicion.tipoId),
    [catalogos.subtipos, edicion.tipoId],
  );

  // --- The value, and whether the asset enters the analysis ------------------------
  const valor = valorActivo(valores).toNumber();
  const entra = entraAlAnalisis(valores, catalogos.umbralValoracion);
  const nivelValor = catalogos.escalaValor.find((e) => e.valor === valor);
  const nombreNivel = nivelValor ? etiquetaCorta(nivelValor.etiqueta) : String(valor);

  // --- The asset's threats --------------------------------------------------------
  //
  // The same predicate lib/sgsi/riesgos.ts uses when it generates: the threats the
  // parameterisation pre-classifies for the asset's TYPE (`AmenazaTipo.aplica`). Risks
  // are the cartesian product and are never hand-picked. A threat removed from this
  // asset is a logical exception and drops out here; one added from the rest of the
  // catalogue comes in flagged as an exception too.
  const preclasificadas = useMemo(
    () => amenazas.filter((a) => a.tipos.includes(edicion.tipoId)),
    [amenazas, edicion.tipoId],
  );

  // Threats already taken out of this asset on the server. The parameterisation still
  // pre-classifies them, so without this the row would come back looking active the moment
  // the sheet re-read — and the removal would look like it had not been saved.
  const excluidasEnServidor = useMemo(() => {
    const porId = new Map(amenazas.map((a) => [a.id, a.codigo]));
    const mapa = new Map<string, string>();
    for (const e of activo?.amenazasExcluidas ?? []) {
      const codigo = porId.get(e.amenazaId);
      if (codigo !== undefined) mapa.set(codigo, e.codigoRiesgo);
    }
    return mapa;
  }, [activo, amenazas]);

  const listaAmenazas = useMemo(() => {
    const codigosPre = new Set(preclasificadas.map((a) => a.codigo));
    return [
      ...preclasificadas
        .filter((a) => eliminadas[a.codigo] === undefined && !excluidasEnServidor.has(a.codigo))
        .map((a) => ({ amenaza: a, preclasificada: true })),
      ...amenazas
        .filter((a) => agregadas.includes(a.codigo) && !codigosPre.has(a.codigo))
        .map((a) => ({ amenaza: a, preclasificada: false })),
    ];
  }, [amenazas, preclasificadas, agregadas, eliminadas, excluidasEnServidor]);

  const guardadoPorAmenaza = useMemo(
    () => new Map((activo?.riesgos ?? []).map((r) => [r.amenazaId, r])),
    [activo],
  );

  /// Threat code → the code of its stored risk. Every action in acciones/riesgos.ts is
  /// addressed by that code, and a threat with no row has no risk to change.
  const codigoRiesgoPorAmenaza = useMemo(() => {
    const porId = new Map(amenazas.map((a) => [a.id, a.codigo]));
    const mapa = new Map<string, string>();
    for (const r of activo?.riesgos ?? []) {
      const codigo = porId.get(r.amenazaId);
      if (codigo !== undefined) mapa.set(codigo, r.codigo);
    }
    return mapa;
  }, [activo, amenazas]);

  // REQ-SIG-20 §7.2 · amenaza → plan de tratamiento activo que ya la cubre en este activo.
  // El servidor ya resolvió el vínculo leyendo el prefijo de `AccionPlan.origen`; acá solo
  // se indexa para que cada renglón pregunte por el suyo sin recorrer la lista entera.
  // Un plan por riesgo: `registrarPlanCritico` lo impide desde el servidor. Si aun así
  // llegaran dos —un plan viejo, anterior a esa regla—, gana el de código menor y no «el
  // último que se leyó»: el enlace tiene que llevar siempre al mismo lado.
  const planesPorAmenaza = useMemo(() => {
    const mapa = new Map<string, PlanDeAmenaza>();
    for (const p of activo?.planes ?? []) {
      if (!mapa.has(p.amenazaCodigo)) mapa.set(p.amenazaCodigo, p);
    }
    return mapa;
  }, [activo]);

  // --- The single derivation pass -------------------------------------------------
  //
  // Every figure the three tabs show comes out of here: one pass, one arithmetic path
  // through lib/sgsi/formulas.ts, and therefore one place a number can be wrong.
  //
  // BELOW THE THRESHOLD, THE PASS DOES NOT RUN (D-5, REQ-SIG-20 §3.1). It is not enough
  // to hide the result: `generarRiesgos` on the server never creates a `Riesgo` for these
  // assets either, so a client that still computed one would show a figure with nothing
  // behind it. `entra` short-circuits before a single row is mapped.
  const filas = useMemo<FilaAmenaza[]>(
    () =>
      !entra
        ? []
        : listaAmenazas.map(({ amenaza, preclasificada }) => {
        const ov = degOv[amenaza.codigo] ?? {};

        // Degradation is an attribute of the THREAT. The override is read first only so
        // the exception is visible; the parametrized value is the default and the one the
        // row returns to when the exception is undone.
        const base = baseDegOv[amenaza.codigo] ?? {};
        const degradacionId = {} as Record<Dim, number>;
        const desviada = {} as Record<Dim, boolean>;
        const justificacion = {} as Record<Dim, string>;
        const objetivoDegradacion = {} as Record<Dim, number | null>;
        const degradacionPendiente = {} as Record<Dim, boolean>;
        const factores = {} as Record<Dim, string>;
        for (const d of DIMS) {
          const excepcion = ov[d];
          degradacionId[d] = excepcion?.degradacionId ?? amenaza.degradacion[d];
          desviada[d] =
            excepcion?.degradacionId != null &&
            excepcion.degradacionId !== amenaza.degradacion[d];
          justificacion[d] = excepcion?.justificacion ?? '';
          // Choosing exactly the threat's own value is inheritance, not an exception —
          // `excepcionDegradacion` would store a permanent mark on a row that agrees with
          // the parameterisation — so it resolves to "no override row" like an explicit
          // return does.
          objetivoDegradacion[d] = desviada[d] ? degradacionId[d] : null;
          degradacionPendiente[d] = objetivoDegradacion[d] !== (base[d]?.degradacionId ?? null);
          factores[d] = porId.degradacion.get(degradacionId[d])?.factor ?? '0';
        }

        const frecuenciaId = frecOv[amenaza.codigo] ?? amenaza.frecuenciaId;
        const aro = Number(porId.frecuencia.get(frecuenciaId)?.vecesAno ?? 0);
        const frecuenciaDesviada = frecuenciaId !== amenaza.frecuenciaId;
        const objetivoFrecuencia = frecuenciaDesviada ? frecuenciaId : null;
        const frecuenciaPendiente = objetivoFrecuencia !== (baseFrecOv[amenaza.codigo] ?? null);

        // REQ-SIG-20 §10 (D5, tarea 4.15) · la excepción de madurez del RIESGO. Ausente en
        // `madurezRiesgoOv` = sin tocar esta sesión, y entonces se lee lo guardado
        // (`guardado?.madurezId`); presente (incluido `null`, "vuelve a heredar") = lo que
        // esta sesión eligió.
        const guardadoDelRiesgo = guardadoPorAmenaza.get(amenaza.id);
        const madurezRiesgoBase = guardadoDelRiesgo?.madurezId ?? null;
        const madurezRiesgoId =
          amenaza.codigo in madurezRiesgoOv ? madurezRiesgoOv[amenaza.codigo] : madurezRiesgoBase;
        const madurezRiesgoDesviada = madurezRiesgoId !== null;
        const objetivoMadurezRiesgo = madurezRiesgoId;
        const madurezRiesgoPendiente = objetivoMadurezRiesgo !== madurezRiesgoBase;

        // The threat's controls, minus the ones removed from this asset's group, with any
        // maturity edited on this sheet applied. A control marked as not applicable is
        // excluded from its own average: letting a single zero in is the defect the
        // applicability flag exists to prevent.
        const controles: ControlEnFila[] = amenaza.controles
          .filter((c) => !ctlEliminados.includes(`${amenaza.codigo}·${c.codigo}`))
          .map((c) => ({
            ...c,
            nivel: madOv[`${amenaza.codigo}·${c.codigo}`] ?? c.nivel,
            efecto: efectos[`${amenaza.codigo}·${c.codigo}`] ?? 'Previene',
          }));
        const aplicables = controles.filter((c) => c.soa !== 'no');

        // The group's average CMM level, which is what the expanded card leads with. It
        // is NOT what drives the residual: the efficacy below is the weighted mean capped
        // by the principal control (MET-SIG-01 §7.4), and the two differ on purpose. A
        // control with no assessment has no level to average in.
        const conNivel = aplicables
          .map((c) => c.nivel)
          .filter((n): n is number => n !== null);
        const madurezGrupo =
          conNivel.length === 0 ? null : conNivel.reduce((a, b) => a + b, 0) / conNivel.length;

        // THE ONE ARITHMETIC PATH (D3, REQ-SIG-20 tarea 2.2, spec risk-equation-
        // traceability "Single arithmetic source"). Every figure below — impacto,
        // inherente, eficacia, residual — comes out of `resolverEcuacion`, which only
        // composes `lib/sgsi/formulas.ts` and `lib/sgsi/madurez.ts`. Nothing in this file
        // multiplies a degradation or averages an efficacy on its own; the Ecuación tab
        // renders this SAME object, so the two screens cannot disagree.
        const ecuacion = resolverEcuacion({
          valores,
          degradaciones: factores,
          excepcionesDegradacion: {
            ...(desviada.D ? { D: justificacion.D } : {}),
            ...(desviada.I ? { I: justificacion.I } : {}),
            ...(desviada.C ? { C: justificacion.C } : {}),
          },
          aro,
          justificacionFrecuencia: frecuenciaDesviada
            ? (justFrec[amenaza.codigo] ?? '')
            : undefined,
          controles: aplicables.map((c) => ({
            codigo: c.codigo,
            nivel: c.nivel,
            peso: c.peso,
            esPrincipal: c.esPrincipal,
            relevancia: c.relevancia,
          })),
          deltaTechoEficacia: catalogos.deltaTechoEficacia,
        });
        const eficacia = ecuacion.eficacia;

        // CLASSIFY FROM THE DECIMAL, NARROW ONLY FOR DISPLAY.
        //
        // The thresholds arrive as strings and `clasificar` turns them into exact Decimals,
        // so narrowing the VALUE first makes the comparison asymmetric — and a boundary like
        // 4.999 has no exact float, so a figure sitting on it can land on the wrong side or,
        // worse, match no band at all and render with the fallback colour of the lowest one.
        // (The matrices screen narrows both sides with the same `Number()`, so its error
        // cancels; here only one side was narrowed.)
        const impactoExacto = ecuacion.impacto;
        const riesgoExacto = ecuacion.inherente;
        const impacto = impactoExacto.toNumber();
        const riesgo = riesgoExacto.toNumber();
        // The residual side stays null while the efficacy is unknown, exactly as
        // lib/sgsi/riesgos.ts leaves it in the database.
        const frecuenciaResidual = ecuacion.aroResidual === null ? null : ecuacion.aroResidual.toNumber();
        const residualExacto = ecuacion.residual;
        const residual = residualExacto === null ? null : residualExacto.toNumber();
        const bandaResidual =
          residualExacto === null
            ? null
            : indiceBanda(
                clasificar(residualExacto, catalogos.bandasRiesgo),
                catalogos.bandasRiesgo,
              );

        // --- The treatment, and the override rule of guardarTratamiento --------------
        //
        // The suggestion is derived from the residual band and never stored. With the
        // residual uncalculated there is no band, so there is no suggestion — and a
        // treatment that no suggestion backs is an override, which the action refuses
        // without text in `observacion`. The same arithmetic runs here so the requirement
        // shows up on the field instead of arriving as a rejection.
        const sugerido = tratamientoSugerido(bandaResidual === null ? null : bandaResidual.indice);
        const idSugerido =
          sugerido === null
            ? null
            : (catalogos.tratamientos.find((t) => t.nombre === sugerido)?.id ?? null);

        const tratamiento = trat[amenaza.codigo] ?? {};
        const previo = baseTrat[amenaza.codigo] ?? {};
        const cambiosTratamiento: DecisionTratamiento = {};
        if ((tratamiento.tratamientoId ?? null) !== (previo.tratamientoId ?? null)) {
          cambiosTratamiento.tratamientoId = tratamiento.tratamientoId ?? null;
        }
        if ((tratamiento.estadoId ?? null) !== (previo.estadoId ?? null)) {
          cambiosTratamiento.estadoId = tratamiento.estadoId ?? null;
        }
        if ((tratamiento.responsableId ?? null) !== (previo.responsableId ?? null)) {
          cambiosTratamiento.responsableId = tratamiento.responsableId ?? null;
        }
        if ((tratamiento.observacion ?? '').trim() !== (previo.observacion ?? '').trim()) {
          cambiosTratamiento.observacion = tratamiento.observacion ?? '';
        }
        const tratamientoPendiente = Object.keys(cambiosTratamiento).length > 0;
        // The action validates the treatment that will be STORED, whichever field the
        // change touched, so the requirement follows the final value and not the edit.
        const tratamientoFinal = tratamiento.tratamientoId ?? null;
        const sobrescribeTratamiento = tratamientoFinal !== null && tratamientoFinal !== idSugerido;
        const faltaObservacion =
          tratamientoPendiente &&
          sobrescribeTratamiento &&
          (tratamiento.observacion ?? '').trim() === '';

        return {
          amenaza,
          preclasificada,
          guardado: guardadoPorAmenaza.get(amenaza.id),
          degradacionId,
          desviada,
          justificacion,
          objetivoDegradacion,
          degradacionPendiente,
          frecuenciaId,
          frecuenciaDesviada,
          objetivoFrecuencia,
          frecuenciaPendiente,
          justificacionFrecuencia: justFrec[amenaza.codigo] ?? '',
          madurezRiesgoId,
          madurezRiesgoDesviada,
          objetivoMadurezRiesgo,
          madurezRiesgoPendiente,
          tratamiento,
          cambiosTratamiento,
          tratamientoPendiente,
          sobrescribeTratamiento,
          faltaObservacion,
          codigoRiesgo: codigoRiesgoPorAmenaza.get(amenaza.codigo) ?? null,
          aro,
          impacto,
          bandaImpacto: indiceBanda(
            clasificar(impactoExacto, catalogos.bandasImpacto),
            catalogos.bandasImpacto,
          ),
          riesgo,
          bandaRiesgo: indiceBanda(
            clasificar(riesgoExacto, catalogos.bandasRiesgo),
            catalogos.bandasRiesgo,
          ),
          zona: clasificarZona(impactoExacto, aro),
          controles,
          madurezGrupo,
          eficacia,
          frecuenciaResidual,
          residual,
          bandaResidual,
          ecuacion,
        };
      }),
    [
      entra,
      listaAmenazas,
      degOv,
      frecOv,
      justFrec,
      madOv,
      madurezRiesgoOv,
      efectos,
      ctlEliminados,
      trat,
      valores,
      baseDegOv,
      baseFrecOv,
      baseTrat,
      catalogos.bandasImpacto,
      catalogos.bandasRiesgo,
      catalogos.deltaTechoEficacia,
      catalogos.tratamientos,
      porId,
      guardadoPorAmenaza,
      codigoRiesgoPorAmenaza,
    ],
  );

  /// The chip. A threat is unmanaged when its inherent risk is Alto or Crítico on an
  /// asset that reaches the threshold and no control improves its residual — which today
  /// means every one of them, because the efficacy is unknown everywhere.
  const sinGestionar = useMemo(
    () =>
      filas.filter(
        (f) =>
          f.bandaRiesgo !== null &&
          f.bandaRiesgo.indice <= 1 &&
          entra &&
          (f.eficacia === null || f.eficacia === 0),
      ),
    [filas, entra],
  );
  const codigosSinGestionar = useMemo(
    () => new Set(sinGestionar.map((f) => f.amenaza.codigo)),
    [sinGestionar],
  );

  const visibles = soloSinGestionar
    ? filas.filter((f) => codigosSinGestionar.has(f.amenaza.codigo))
    : filas;

  // --- What the save would write ---------------------------------------------------
  //
  // One entry per action call, built by diffing the state against what the server sent.
  // Nothing is sent for a field that did not move: `guardarDatosGenerales` and
  // `guardarTratamiento` both answer "no había cambios que guardar", and a call that says
  // that is a call that should not have been made.
  const plan = useMemo(() => {
    // The general-data card. `DatosGenerales` has no key for the code: it is immutable
    // and never reused, so it is not editable from anywhere.
    const datos: DatosGeneralesActivo = {};
    // Compared after trimming, so a stray space is not counted as a change the action
    // would then answer with "no había cambios que guardar".
    const nombre = edicion.nombre.trim();
    if (nombre !== baseEdicion.nombre.trim()) datos.nombre = nombre;
    const descripcion = edicion.descripcion.trim();
    if (descripcion !== baseEdicion.descripcion.trim()) {
      datos.descripcion = descripcion === '' ? null : descripcion;
    }
    if (edicion.propietarioId !== baseEdicion.propietarioId) {
      datos.propietarioId = edicion.propietarioId;
    }
    if (edicion.criticidadId !== baseEdicion.criticidadId) {
      datos.criticidadId = edicion.criticidadId;
    }
    if (edicion.nivelId !== baseEdicion.nivelId) datos.nivelId = edicion.nivelId;
    if (edicion.cantidad !== baseEdicion.cantidad) datos.cantidad = edicion.cantidad;
    if (edicion.custodioId !== baseEdicion.custodioId) datos.custodioId = edicion.custodioId;
    if (edicion.ubicacionId !== baseEdicion.ubicacionId) datos.ubicacionId = edicion.ubicacionId;
    if (edicion.entornoId !== baseEdicion.entornoId) datos.entornoId = edicion.entornoId;
    if (edicion.proveedorId !== baseEdicion.proveedorId) datos.proveedorId = edicion.proveedorId;
    if (edicion.superiorId !== baseEdicion.superiorId) datos.superiorId = edicion.superiorId;
    if (edicion.datosCliente !== baseEdicion.datosCliente) datos.datosCliente = edicion.datosCliente;
    if (edicion.datosPersonales !== baseEdicion.datosPersonales) {
      datos.datosPersonales = edicion.datosPersonales;
    }
    if (edicion.expuestoInternet !== baseEdicion.expuestoInternet) {
      datos.expuestoInternet = edicion.expuestoInternet;
    }
    const nDatos = Object.keys(datos).length;

    // The MAGERIT classification. It IS saved, but the type deserves a warning rather
    // than silence: it decides which threats apply, so changing it rebuilds the asset's
    // whole risk set. The code stays as it is — immutable and never reused — so the
    // abbreviation it carries may stop matching the type, and the action records that in
    // the bitácora.
    const clasificacion: string[] = [];
    if (edicion.areaId !== baseEdicion.areaId) {
      datos.areaId = edicion.areaId ?? undefined;
      clasificacion.push('el proceso o área');
    }
    if (edicion.tipoId !== baseEdicion.tipoId) {
      datos.tipoId = edicion.tipoId ?? undefined;
      clasificacion.push('el tipo MAGERIT');
    }
    if (edicion.subtipoId !== baseEdicion.subtipoId) {
      datos.subtipoId = edicion.subtipoId ?? undefined;
      clasificacion.push('el subtipo');
    }

    const valoracion: CambioValoracion[] = [];
    for (const d of DIMS) {
      if (valores[d] !== baseValores[d]) {
        valoracion.push({ codigoActivo: activo?.codigo ?? '', dimension: d, valor: valores[d] });
      }
    }

    const tratamientos: {
      codigo: string;
      codigoRiesgo: string | null;
      decision: DecisionTratamiento;
    }[] = [];

    // REQ-SIG-20 §10 (D5, tareas 4.14-4.15) · degradación, frecuencia y madurez del
    // riesgo se agrupan UNA vez por riesgo tocado en un solo `BorradorSesionRiesgo` — el
    // guardado que las escribe (`guardarSesionRiesgo`) reemplaza el camino de
    // `excepcionDegradacion`/`excepcionFrecuencia` y pide UNA nota para todo el grupo, no
    // una por campo (spec `end-of-session-notes`, "Changes accumulate without prompting").
    const sesionRiesgos: {
      codigoRiesgo: string;
      amenazaCodigo: string;
      borrador: BorradorSesionRiesgo;
      cambios: { campo: string; anterior: string; nuevo: string }[];
    }[] = [];

    const nombreDegradacion = (id: number): string => porId.degradacion.get(id)?.nombre ?? `#${id}`;
    const nombreFrecuencia = (id: number): string => porId.frecuencia.get(id)?.nombre ?? `#${id}`;
    const nombreMadurez = (id: number): string => {
      const nivel = catalogos.escalaMadurez.find((m) => m.id === id)?.nivel;
      return nivel === undefined ? `#${id}` : `L${nivel}`;
    };

    for (const f of filas) {
      if (f.tratamientoPendiente) {
        tratamientos.push({
          codigo: f.amenaza.codigo,
          codigoRiesgo: f.codigoRiesgo,
          decision: f.cambiosTratamiento,
        });
      }

      if (f.codigoRiesgo === null) continue;

      const borradorDegradacion: Partial<Record<Dim, number | null>> = {};
      let tieneDegradacion = false;
      const cambios: { campo: string; anterior: string; nuevo: string }[] = [];

      for (const d of DIMS) {
        if (!f.degradacionPendiente[d]) continue;
        tieneDegradacion = true;
        borradorDegradacion[d] = f.objetivoDegradacion[d];
        const previa = baseDegOv[f.amenaza.codigo]?.[d]?.degradacionId ?? null;
        cambios.push({
          campo: `Degradación ${d} — ${f.amenaza.codigo}`,
          anterior:
            previa === null ? `hereda de ${f.amenaza.codigo}` : nombreDegradacion(previa),
          nuevo:
            f.objetivoDegradacion[d] === null
              ? `hereda de ${f.amenaza.codigo}`
              : nombreDegradacion(f.objetivoDegradacion[d]),
        });
      }

      if (f.frecuenciaPendiente) {
        const previa = baseFrecOv[f.amenaza.codigo] ?? null;
        cambios.push({
          campo: `Frecuencia — ${f.amenaza.codigo}`,
          anterior: previa === null ? `hereda de ${f.amenaza.codigo}` : nombreFrecuencia(previa),
          nuevo:
            f.objetivoFrecuencia === null
              ? `hereda de ${f.amenaza.codigo}`
              : nombreFrecuencia(f.objetivoFrecuencia),
        });
      }

      if (f.madurezRiesgoPendiente) {
        const previa = f.guardado?.madurezId ?? null;
        cambios.push({
          campo: `Madurez del riesgo — ${f.amenaza.codigo}`,
          anterior: previa === null ? 'hereda de los controles' : nombreMadurez(previa),
          nuevo:
            f.objetivoMadurezRiesgo === null
              ? 'hereda de los controles'
              : nombreMadurez(f.objetivoMadurezRiesgo),
        });
      }

      if (cambios.length === 0) continue;

      sesionRiesgos.push({
        codigoRiesgo: f.codigoRiesgo,
        amenazaCodigo: f.amenaza.codigo,
        borrador: {
          ...(tieneDegradacion ? { degradacion: borradorDegradacion } : {}),
          ...(f.frecuenciaPendiente ? { frecuenciaId: f.objetivoFrecuencia } : {}),
          ...(f.madurezRiesgoPendiente ? { madurezId: f.objetivoMadurezRiesgo } : {}),
        },
        cambios,
      });
    }

    const nCambiosSesion = sesionRiesgos.reduce((n, s) => n + s.cambios.length, 0);

    // A removal only counts while the risk is still in the live analysis. After the save
    // it is obsolete, so it drops out of here on its own and the band moves to the
    // "already removed" section with its Restaurar.
    const bajasAmenaza = Object.entries(eliminadas)
      .filter(([codigo]) => codigoRiesgoPorAmenaza.has(codigo))
      .map(([codigo, motivo]) => ({
        codigo,
        codigoRiesgo: codigoRiesgoPorAmenaza.get(codigo) ?? null,
        motivo,
      }));

    // What has no action at all. These move the figures on screen and stay out of the
    // count, so "guardado" is never claimed over them.
    const simulaciones: string[] = [];
    const nMadurez = Object.keys(madOv).length;
    if (nMadurez > 0) {
      simulaciones.push(
        `${nMadurez} ${nMadurez === 1 ? 'nivel' : 'niveles'} de madurez — la madurez es del CONTROL, no de este activo: se registra en la pantalla de controles`,
      );
    }
    if (Object.keys(efectos).length > 0) {
      simulaciones.push(
        'el efecto Previene / Limita — MET-SIG-01 §7.4 no lo usa en el cálculo y no tiene columna todavía',
      );
    }
    if (ctlEliminados.length > 0) {
      simulaciones.push(
        `${ctlEliminados.length} ${ctlEliminados.length === 1 ? 'control quitado' : 'controles quitados'} del grupo de una amenaza — la relación control–amenaza es de la parametrización`,
      );
    }
    if (agregadas.length > 0) {
      simulaciones.push(
        `${agregadas.length} ${agregadas.length === 1 ? 'amenaza agregada' : 'amenazas agregadas'} desde el catálogo — no hay acción que cree el riesgo de excepción`,
      );
    }

    const pendientes =
      nDatos +
      valoracion.length +
      nCambiosSesion +
      tratamientos.length +
      bajasAmenaza.length +
      (baja !== null ? 1 : 0);

    return {
      datos,
      nDatos,
      clasificacion,
      valoracion,
      sesionRiesgos,
      nCambiosSesion,
      tratamientos,
      bajasAmenaza,
      bajaActivo: baja,
      simulaciones,
      pendientes,
    };
  }, [
    activo,
    edicion,
    baseEdicion,
    valores,
    baseValores,
    filas,
    eliminadas,
    codigoRiesgoPorAmenaza,
    madOv,
    efectos,
    ctlEliminados,
    agregadas,
    baja,
    porId,
    baseDegOv,
    baseFrecOv,
    catalogos.escalaMadurez,
  ]);

  // --- Save gate ------------------------------------------------------------------
  //
  // Reasons the sheet refuses to save, in the user's own words. The button is disabled
  // while any of them stands. Every rule here is a rule one of the actions enforces too:
  // the point is that the user reads it BEFORE pressing Save, instead of getting a
  // rejection that was foreseeable — a Save that quietly drops a required justification
  // would try to write an exception with no author's reason, which is exactly what the
  // NOT NULL on `riesgo_degradacion.justificacion` exists to prevent.
  const impedimentos: string[] = [];

  // El alta SÍ existe: `crearActivo` emite el código contra `ContadorCodigo` dentro de su
  // propia transacción. El impedimento que vivía acá —«falta la acción que asigna el
  // código»— dejó de ser cierto cuando esa acción se escribió, y desde entonces era lo
  // único que impedía crear un activo desde esta pantalla.
  //
  // El código de la cabecera es una PREVISUALIZACIÓN: el definitivo lo emite el servidor, y
  // puede diferir si alguien más creó un activo del mismo par (área, tipo) mientras esta
  // ficha estaba abierta. Por eso no se manda desde acá.
  if (edicion.nombre.trim() === '') impedimentos.push('El nombre del activo está vacío.');
  if (nuevo && edicion.propietarioId === null) {
    impedimentos.push('Un activo nuevo requiere propietario.');
  }
  if (nuevo && edicion.custodioId === null) {
    impedimentos.push('Un activo nuevo requiere custodio.');
  }

  // No longer an impediment: the classification is saved. It stays listed as an advisory
  // because a type change rebuilds the risk set, and that is worth knowing before pressing
  // Save rather than after.

  for (const f of filas) {
    // REQ-SIG-20 §10 (D5) · degradación, frecuencia y madurez del riesgo ya NO piden su
    // propia justificación por campo — spec `end-of-session-notes`, "Changes accumulate
    // without prompting": no per-change reason modal. La única nota que las cubre es la
    // del diálogo de guardado (`dialogoNotas`, más abajo), obligatoria recién ahí.
    if (f.faltaObservacion) {
      impedimentos.push(
        `El tratamiento de ${f.amenaza.codigo} necesita justificación en observaciones: sin nivel residual calculado no hay sugerencia que lo respalde, así que cualquier decisión es una sobrescritura.`,
      );
    }
    // Every action in acciones/riesgos.ts is addressed by the risk's code, and a threat
    // with no risk row has nothing to change. Saving the valuation first is what creates
    // it, so the message says so.
    const pendienteDeRiesgo =
      f.tratamientoPendiente ||
      f.frecuenciaPendiente ||
      f.madurezRiesgoPendiente ||
      DIMS.some((d) => f.degradacionPendiente[d]);
    if (pendienteDeRiesgo && f.codigoRiesgo === null) {
      impedimentos.push(
        `${f.amenaza.codigo} no tiene riesgo generado en este activo${
          entra ? '' : ` — el valor ${valor} no alcanza el umbral de ${catalogos.umbralValoracion}`
        }, así que no hay riesgo al que aplicarle el cambio. Guardá primero la valoración.`,
      );
    }
  }

  for (const [codigo, motivo] of Object.entries(eliminadas)) {
    if (!codigoRiesgoPorAmenaza.has(codigo)) continue;
    if (motivo.trim() === '') impedimentos.push(`La baja de la amenaza ${codigo} no tiene motivo.`);
  }
  if (baja !== null && baja.trim() === '') {
    impedimentos.push('La baja del activo no tiene motivo.');
  }

  /// Undoing a removal on the server. `restaurarAmenaza` takes no justification — the
  /// reason it went out is already in the bitácora — so it runs on its own, without
  /// waiting for the Save of the rest.
  const restaurar = (codigoRiesgo: string): void => {
    setAviso(null);
    iniciarGuardado(async () => {
      const r = await restaurarAmenaza(codigoRiesgo);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) router.refresh();
    });
  };

  /// Corre el guardado de verdad. `notaSesion` es `null` cuando no hay ningún cambio de
  /// sesión pendiente (`plan.sesionRiesgos` vacío) — en ese caso `guardar()` de abajo llama
  /// acá directo, sin pasar por el diálogo. Cuando SÍ hay cambios de sesión, `guardar()`
  /// abre el diálogo primero y es su confirmación la que llama acá con la nota escrita.
  const ejecutarGuardado = (notaSesion: string | null): void => {
    if (activo === null) return;
    const codigoActivo = activo.codigo;
    setSync('guardando');
    setAviso(null);

    iniciarGuardado(async () => {
      const fallos: string[] = [];
      const logros: string[] = [];
      // REQ-SIG-20 §7 (D4, tarea 4.16) · lo que dejó el residual en Crítico esta vuelta.
      // El guardado que los llenó YA tuvo éxito — la cola solo decide si el popup se abre.
      const criticos: { activoCodigo: string; amenazaCodigo: string }[] = [];

      const aplicar = async (operacion: Promise<{ ok: boolean; mensaje: string }>) => {
        const r = await operacion;
        (r.ok ? logros : fallos).push(r.mensaje);
        return r.ok;
      };

      // The general data first: it touches no figure, so it can never be undone by the
      // recalculation the later actions run.
      if (plan.nDatos > 0) await aplicar(guardarDatosGenerales(codigoActivo, plan.datos));

      // The valuation before every per-risk change. A dimension crossing the threshold is
      // what brings the risks into existence, so an exception whose risk does not exist
      // yet needs this to have run — and the gate above refuses that case anyway.
      if (plan.valoracion.length > 0) await aplicar(guardarValoracion(plan.valoracion));

      // REQ-SIG-20 §10 (D5, tareas 4.14-4.16) · un `guardarSesionRiesgo` por riesgo
      // tocado, con la MISMA nota para todos — reemplaza el camino de
      // `excepcionDegradacion`/`excepcionFrecuencia`. `notaSesion` nunca es `null` acá
      // cuando `plan.sesionRiesgos` no está vacío: `guardar()` garantiza el diálogo pasó
      // antes de llegar a este punto.
      if (plan.sesionRiesgos.length > 0 && notaSesion !== null) {
        for (const s of plan.sesionRiesgos) {
          const r = await guardarSesionRiesgo(s.codigoRiesgo, s.borrador, notaSesion);
          (r.ok ? logros : fallos).push(r.mensaje);
          if (r.critico) criticos.push(r.critico);
        }
      }

      for (const t of plan.tratamientos) {
        if (t.codigoRiesgo === null) continue;
        await aplicar(guardarTratamiento(t.codigoRiesgo, t.decision));
      }

      for (const b of plan.bajasAmenaza) {
        if (b.codigoRiesgo === null) continue;
        await aplicar(quitarAmenazaDelActivo(b.codigoRiesgo, b.motivo));
      }

      // The asset's logical delete goes last: it takes the asset out of the inventory, the
      // matrices and the KPIs, and this route only serves assets that are still in it.
      const salir =
        plan.bajaActivo !== null && (await aplicar(darDeBajaActivo(codigoActivo, plan.bajaActivo)));

      if (criticos.length > 0) {
        // D17: nunca condiciona si el guardado valió — spec `critical-risk-treatment-
        // plan`, "Save succeeds, popup opens". Uno a la vez, en el orden en que llegaron.
        setColaCritica((cola) => [...cola, ...criticos]);
      }

      if (fallos.length === 0) {
        setSync('sincronizado');
        setAviso({ ok: true, texto: resumen(logros) });
      } else {
        // Some calls may have gone through before the failure, so the screen re-reads
        // either way: what is left pending is whatever still differs after the re-read.
        setSync('pendiente');
        setAviso({ ok: false, texto: resumen(fallos) });
      }

      if (salir) {
        router.push('/sgsi/inventario');
        return;
      }
      router.refresh();
    });
  };

  /// El botón Guardar. Con cambios de sesión pendientes (degradación/frecuencia/madurez
  /// del riesgo) abre el diálogo de notas en vez de guardar directo — spec `end-of-
  /// session-notes`, "Single save dialog with a mandatory notes field". Sin ellos, el
  /// resto del guardado no tiene por qué esperar ningún diálogo.
  /// El alta. El código NO viaja: lo emite `crearActivo` contra el contador, dentro de su
  /// transacción. Mandarlo desde acá sería mandar la previsualización, y dos pestañas
  /// abiertas sobre el mismo par (área, tipo) previsualizan el mismo número.
  const crear = (): void => {
    if (impedimentos.length > 0) return;
    setSync('guardando');
    setAviso(null);

    iniciarGuardado(async () => {
      const r = await crearActivo({
        nombre: edicion.nombre.trim(),
        descripcion: edicion.descripcion.trim() === '' ? null : edicion.descripcion.trim(),
        areaId: edicion.areaId,
        tipoId: edicion.tipoId,
        subtipoId: edicion.subtipoId,
        // Los dos son obligatorios en creación y los impedimentos ya lo garantizaron.
        custodioId: edicion.custodioId!,
        propietarioId: edicion.propietarioId,
        ubicacionId: edicion.ubicacionId,
        entornoId: edicion.entornoId,
        proveedorId: edicion.proveedorId,
        superiorId: edicion.superiorId,
        nivelId: edicion.nivelId,
        cantidad: edicion.cantidad,
        datosCliente: edicion.datosCliente,
        datosPersonales: edicion.datosPersonales,
        expuestoInternet: edicion.expuestoInternet,
        valores,
      });

      setAviso({ ok: r.ok, texto: r.mensaje });
      setSync(r.ok ? 'sincronizado' : 'limpio');
      // La ficha de creación no tiene a dónde volver: se navega al activo recién creado,
      // que ya tiene código y por lo tanto URL propia.
      if (r.ok && r.codigo) router.push(`/sgsi/inventario/${r.codigo}`);
    });
  };

  const guardar = (): void => {
    if (nuevo) {
      crear();
      return;
    }
    if (activo === null || impedimentos.length > 0 || plan.pendientes === 0) return;
    if (plan.sesionRiesgos.length > 0) {
      setDialogoNotas(true);
      return;
    }
    ejecutarGuardado(null);
  };

  /// Confirmar el diálogo de notas. Nota vacía no hace nada — ni cierra el diálogo ni
  /// guarda — el mismo bloqueo deliberado que `guardarSesionRiesgo` aplica del lado del
  /// servidor (spec `end-of-session-notes`, "Empty note blocks the save").
  const confirmarNotaSesion = (): void => {
    const razon = nota.trim();
    if (razon === '') return;
    setDialogoNotas(false);
    setNota('');
    ejecutarGuardado(razon);
  };

  // The indicator is DERIVED from what is actually pending, so it cannot disagree with
  // the diff: the moment the re-read makes the state and the server agree, "pendiente"
  // stops being true whether or not a handler remembered to say so.
  const syncVista: Sync = guardando
    ? 'guardando'
    : plan.pendientes > 0
      ? 'pendiente'
      : sync === 'sincronizado'
        ? 'sincronizado'
        : 'limpio';

  // --- Header figures -------------------------------------------------------------
  //
  // In creation mode the code is a PREVIEW built live from the process prefix, the type
  // abbreviation and the (area, type) consecutive. The counter is authoritative because
  // codes are never reused and deletes are logical: MAX()+1 would hand out a retired
  // number.
  const contador = catalogos.contadores.find(
    (c) => c.areaId === edicion.areaId && c.tipoId === edicion.tipoId,
  );
  const consecutivo = String((contador?.ultimoValor ?? 0) + 1).padStart(4, '0');
  const codigoVista = nuevo
    ? `${area?.prefijo ?? '???'}-${tipo?.abreviatura ?? '???'}-${consecutivo}`
    : (activo?.codigo ?? '—');

  const posicion = navegacion.codigos.indexOf(activo?.codigo ?? '');
  const total = navegacion.codigos.length;
  const anterior =
    nuevo || posicion < 0 ? null : navegacion.codigos[(posicion - 1 + total) % total];
  const siguiente = nuevo || posicion < 0 ? null : navegacion.codigos[(posicion + 1) % total];

  // Below the threshold, Amenazas and Matrices ("resumen") stay VISIBLE and DISABLED — a
  // tab that vanishes silently reads as a defect — and the hover states the value, the
  // threshold with its parameter source, and where to raise the valuation (D-2, REQ-SIG-20
  // §3). Valoración is never gated: it is where the value that decides the other two lives.
  const razonBloqueo = `Este activo vale ${valor}. El análisis de riesgos arranca en ${catalogos.umbralValoracion} — Parametro.umbral_valoracion. Subí su valoración en la pestaña Valoración si corresponde.`;

  const pestanas: { clave: Pestana; label: string; meta: string; bloqueada: boolean }[] = [
    { clave: 'valoracion', label: 'Valoración', meta: 'D · I · C', bloqueada: false },
    {
      clave: 'amenazas',
      label: 'Amenazas',
      meta: entra ? `${filas.length} riesgos` : 'no requiere',
      bloqueada: !entra,
    },
    { clave: 'resumen', label: 'Resumen del activo', meta: 'matrices', bloqueada: !entra },
    { clave: 'ecuacion', label: 'Ecuación', meta: 'solo lectura', bloqueada: !entra },
  ];

  return (
    <main className="flex flex-col">
      <div className="bg-surface px-8 pt-[18px]">
        <Link
          href="/sgsi/inventario"
          className="flex w-fit items-center gap-1.5 text-12 text-muted transition-colors hover:text-accent-500"
        >
          <span className="font-mono">←</span> Volver al inventario
        </Link>
      </div>

      <header className="flex flex-col gap-4 bg-surface px-8 pt-3.5">
        {/* La columna del nombre CRECE (`flex-1`). Sin eso su ancho lo fijaba el contenido,
            el campo del nombre quedaba más angosto que el título y un nombre largo se veía
            cortado a media palabra, con espacio de sobra a la derecha. */}
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-[2] basis-[420px] flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* The code is a chip, never an input. AAA-TTT-NNNN is generated by the
                  system, immutable and never reused: in creation mode it previews, and on
                  an existing asset changing the process or the type does not touch it —
                  that change goes to the bitácora. */}
              <span
                className="rounded-badge bg-accent-100 px-2 py-[3px] font-mono text-12 font-semibold text-accent-500"
                title={
                  nuevo
                    ? 'Previsualización: prefijo del proceso + abreviatura del tipo + consecutivo de esa combinación'
                    : 'Código inmutable y no reutilizable. Cambiar el proceso o el tipo no lo cambia.'
                }
              >
                {codigoVista}
              </span>
              <span className="font-mono text-10_5 text-label">
                {!nuevo && activo?.codigoHeredado
                  ? `heredado ${activo.codigoHeredado}`
                  : 'sin código heredado'}
              </span>
              <span className="text-10_5 text-label">
                {nuevo
                  ? 'previsualización — se asigna al crear el activo'
                  : 'código inmutable, generado por el sistema'}
              </span>
            </div>

            <h1 className="flex min-w-0">
              {/* `min-w-0` y no `min-w-[320px]`: un mínimo mayor que el espacio disponible
                  es lo que empujaba el campo fuera de la columna. El `title` deja leer
                  entero el nombre que aun así no quepa — un input no envuelve. */}
              <input
                value={edicion.nombre}
                onChange={(e) => editar('nombre', e.target.value)}
                placeholder="Nombre del activo…"
                aria-label="Nombre del activo"
                title={edicion.nombre === '' ? undefined : edicion.nombre}
                className="-ml-1.5 w-full min-w-0 rounded-campo border border-transparent bg-transparent px-1.5 py-[3px] text-24 font-bold tracking-[-0.02em] text-primary transition-colors placeholder:text-[var(--hf-text-placeholder)] hover:border-border-field hover:bg-subtle focus:border-accent-500 focus:bg-surface focus:outline-hidden"
              />
            </h1>

            <textarea
              value={edicion.descripcion}
              onChange={(e) => editar('descripcion', e.target.value)}
              rows={2}
              placeholder="Descripción del activo, su uso y su alcance…"
              aria-label="Descripción del activo"
              className="-ml-1.5 w-full max-w-[74ch] resize-y rounded-campo border border-transparent bg-transparent px-1.5 py-1 text-12_5 leading-relaxed text-muted transition-colors placeholder:text-[var(--hf-text-placeholder)] hover:border-border-field hover:bg-subtle focus:border-accent-500 focus:bg-surface focus:text-primary focus:outline-hidden"
            />
          </div>

          <JerarquiaActivo
            nivelId={edicion.nivelId}
            niveles={catalogos.niveles}
            onElegir={(v) => editar('nivelId', v)}
          />

          {/* PERSISTENCIA — la bitácora se lee de `bitacora` filtrando por tabla
              'activo' y registro_id; todavía no tiene pantalla. */}
          <button
            type="button"
            disabled
            title="La bitácora del activo se lee de la tabla `bitacora`. Su pantalla todavía no existe."
            className="rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12_5 text-faint disabled:cursor-not-allowed"
          >
            Ver bitácora
          </button>
        </div>

        {baja !== null && (
          <BandaBaja
            codigo={codigoVista}
            motivo={baja}
            onMotivo={(m) => {
              setBaja(m);
              tocar();
            }}
            onDeshacer={() => setBaja(null)}
          />
        )}

        {/* Two-column grid with auto-fit and min-width: 0 on the cards, per the handoff's
            layout rule. Fixed fractions are what made these cards clip. */}
        <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(380px,1fr))]">
          <DatosGenerales
            edicion={edicion}
            catalogos={catalogos}
            codigoActivo={activo?.codigo ?? ''}
            cuentas={activo?.cuentas ?? []}
            superior={
              edicion.superiorId === null ? null : (porId.activo.get(edicion.superiorId) ?? null)
            }
            valorD={valores.D}
            onEditar={editar}
            onBuscarSuperior={() => {
              setBusqueda('');
              setPopup('superior');
            }}
          />

          <ClasificacionMagerit
            edicion={edicion}
            catalogos={catalogos}
            subtipos={subtiposDelTipo}
            codigoTipo={tipo?.codigo ?? ''}
            aplicables={preclasificadas.length}
            valores={valores}
            valor={valor}
            nombreNivel={nombreNivel}
            entra={entra}
            riesgos={filas.length}
            onTipo={(id) => {
              // Changing the type changes which threats the parameterisation
              // pre-classifies, so the whole risk set is recomputed. The subtype list
              // depends on the type, so the first subtype of the new type is selected
              // rather than leaving an impossible pair behind.
              const primero = catalogos.subtipos.find((s) => s.tipoId === id);
              setEdicion((e) => ({ ...e, tipoId: id, subtipoId: primero?.id ?? e.subtipoId }));
              tocar();
            }}
            onSubtipo={(id) => editar('subtipoId', id)}
          />
        </div>

        <div className="flex items-stretch border-b border-border-default">
          {pestanas.map((p) => {
            const activa = pestana === p.clave;
            return (
              <button
                key={p.clave}
                type="button"
                disabled={p.bloqueada}
                onClick={() => setPestana(p.clave)}
                aria-current={activa ? 'page' : undefined}
                title={p.bloqueada ? razonBloqueo : undefined}
                className="flex items-center gap-2 border-b-2 px-[18px] py-[11px] text-13 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  color: activa ? 'var(--hf-accent-700)' : 'var(--hf-text-faint)',
                  borderBottomColor: activa ? 'var(--hf-accent-500)' : 'transparent',
                }}
              >
                <span>{p.label}</span>
                <span className="font-mono text-10 font-medium text-label">{p.meta}</span>
              </button>
            );
          })}
        </div>
      </header>

      {pestana === 'valoracion' && (
        <TabValoracion
          nuevo={nuevo}
          valores={valores}
          valor={valor}
          nombreNivel={nombreNivel}
          escala={catalogos.escalaValor}
          entra={entra}
          umbral={catalogos.umbralValoracion}
          nRiesgos={filas.length}
          onValor={(d, v) => {
            setValores((x) => ({ ...x, [d]: v }));
            tocar();
          }}
          onIrAmenazas={() => setPestana('amenazas')}
        />
      )}

      {pestana === 'amenazas' && (
        <TabAmenazas
          codigoActivo={activo?.codigo ?? ''}
          planes={planesPorAmenaza}
          filas={visibles}
          nFilas={filas.length}
          aplicables={preclasificadas.length}
          codigoTipo={tipo?.codigo ?? ''}
          catalogos={catalogos}
          abierta={abierta}
          nSinGestionar={sinGestionar.length}
          soloSinGestionar={soloSinGestionar}
          eliminadas={eliminadas}
          excluidas={excluidasEnServidor}
          guardando={guardando}
          onRestaurarAmenaza={restaurar}
          onAbrir={(codigo) => setAbierta((c) => (c === codigo ? null : codigo))}
          onToggleSinGestionar={() => setSoloSinGestionar((v) => !v)}
          onAbrirPopupAmenaza={() => setPopup('amenaza')}
          onRestaurar={() => {
            // Back to the parameterisation. A stored exception does not simply vanish:
            // `excepcionDegradacion` and `excepcionFrecuencia` both ask for a reason when
            // the row goes back to inheriting, so the entry survives as a pending return
            // with an empty justification and the save gate asks for it.
            setDegOv(() => {
              const revertidas: Record<string, Partial<Record<Dim, Excepcion>>> = {};
              for (const [codigo, fila] of Object.entries(baseDegOv)) {
                const pendiente: Partial<Record<Dim, Excepcion>> = {};
                for (const d of DIMS) {
                  if (fila[d] !== undefined) pendiente[d] = { degradacionId: null, justificacion: '' };
                }
                revertidas[codigo] = pendiente;
              }
              return revertidas;
            });
            setFrecOv({});
            setJustFrec({});
            setMadOv({});
            setEfectos({});
            setCtlEliminados([]);
            setEliminadas({});
            setAgregadas([]);
            tocar();
          }}
          onDegradacion={(codigo, dim, degradacionId) => {
            setDegOv((m) => ({
              ...m,
              [codigo]: {
                ...m[codigo],
                [dim]: { degradacionId, justificacion: m[codigo]?.[dim]?.justificacion ?? '' },
              },
            }));
            // The exception has to be justifiable in the same breath, so the row opens and
            // the reason field lands on screen instead of hiding behind a chevron.
            setAbierta(codigo);
            tocar();
          }}
          onJustificacion={(codigo, dim, justificacion) => {
            setDegOv((m) => {
              const previo = m[codigo]?.[dim];
              if (previo === undefined) return m;
              return { ...m, [codigo]: { ...m[codigo], [dim]: { ...previo, justificacion } } };
            });
            tocar();
          }}
          onQuitarExcepcion={(codigo, dim) => {
            setDegOv((m) => {
              const fila = { ...(m[codigo] ?? {}) };
              if (baseDegOv[codigo]?.[dim] !== undefined) {
                // The exception is STORED. Removing it is a call to
                // `excepcionDegradacion` with `null`, and that call needs a reason too, so
                // the entry stays as a pending return with its justification field.
                fila[dim] = { degradacionId: null, justificacion: fila[dim]?.justificacion ?? '' };
              } else {
                // Nothing was ever stored: there is no change to write and nothing to
                // justify.
                delete fila[dim];
              }
              return { ...m, [codigo]: fila };
            });
            tocar();
          }}
          onFrecuencia={(codigo, frecuenciaId) => {
            setFrecOv((m) => ({ ...m, [codigo]: frecuenciaId }));
            // The exception has to be justifiable in the same breath, so the row opens and
            // the reason field lands on screen instead of hiding behind a chevron.
            setAbierta(codigo);
            tocar();
          }}
          onJustificacionFrecuencia={(codigo, justificacion) => {
            setJustFrec((m) => ({ ...m, [codigo]: justificacion }));
            tocar();
          }}
          onMadurez={(clave, nivel) => {
            setMadOv((m) => ({ ...m, [clave]: nivel }));
            tocar();
          }}
          onEfecto={(clave, efecto) => {
            setEfectos((m) => ({ ...m, [clave]: efecto }));
            tocar();
          }}
          onQuitarControl={(clave) => {
            setCtlEliminados((c) => [...c, clave]);
            tocar();
          }}
          onRestaurarControles={(codigo) => {
            setCtlEliminados((c) => c.filter((k) => !k.startsWith(`${codigo}·`)));
            tocar();
          }}
          onEliminarAmenaza={(codigo) => {
            setEliminadas((m) => ({ ...m, [codigo]: '' }));
            setAgregadas((a) => a.filter((c) => c !== codigo));
            tocar();
          }}
          onMotivoEliminada={(codigo, motivo) => {
            setEliminadas((m) => ({ ...m, [codigo]: motivo }));
            tocar();
          }}
          onDeshacerEliminada={(codigo) => {
            setEliminadas((m) => {
              const resto = { ...m };
              delete resto[codigo];
              return resto;
            });
            tocar();
          }}
          onTratamiento={(codigo, cambio) => {
            setTrat((m) => ({ ...m, [codigo]: { ...m[codigo], ...cambio } }));
            tocar();
          }}
        />
      )}

      {pestana === 'resumen' && (
        <TabResumen filas={filas} catalogos={catalogos} entra={entra} />
      )}

      {pestana === 'ecuacion' && (
        <TabEcuacion
          filas={filas}
          seleccionada={abierta}
          onSeleccionar={(codigo) => setAbierta(codigo)}
          catalogos={catalogos}
        />
      )}

      <FranjaInferior
        codigo={codigoVista}
        nuevo={nuevo}
        posicion={posicion}
        total={total}
        anterior={anterior}
        siguiente={siguiente}
        sync={syncVista}
        impedimentos={impedimentos}
        clasificacion={{
          campos: plan.clasificacion,
          cambiaTipo: plan.datos.tipoId !== undefined,
        }}
        aviso={aviso}
        pendientes={plan.pendientes}
        simulaciones={plan.simulaciones}
        guardando={guardando}
        yaDeBaja={baja !== null}
        onEliminar={() => {
          setBaja('');
          tocar();
        }}
        onGuardar={guardar}
      />

      {dialogoNotas && (
        <DialogoNotas
          cambios={plan.sesionRiesgos.flatMap((s) =>
            s.cambios.map((c) => ({ clave: `${s.codigoRiesgo}·${c.campo}`, ...c })),
          )}
          nota={nota}
          onNota={setNota}
          onCancelar={() => setDialogoNotas(false)}
          onConfirmar={confirmarNotaSesion}
        />
      )}

      {/* REQ-SIG-20 §7 (D4, tarea 4.16) · uno a la vez, en el orden en que llegaron. El
          guardado que los dejó en banda Crítico YA tuvo éxito — la cola solo decide si el
          popup se abre, nunca si el cambio se guardó (D17, spec "Save succeeds, popup
          opens"). Key por (activo, amenaza) para que cada crítico monte una instancia
          nueva del popup en vez de reusar el estado de la anterior. */}
      {colaCritica.length > 0 && (
        <PopupPlanCritico
          key={`${colaCritica[0].activoCodigo}·${colaCritica[0].amenazaCodigo}`}
          activoCodigo={colaCritica[0].activoCodigo}
          amenazaCodigo={colaCritica[0].amenazaCodigo}
          onCerrar={() => setColaCritica((cola) => cola.slice(1))}
          onRegistrado={() => router.refresh()}
        />
      )}

      {popup === 'superior' && (
        <PopupSuperior
          activos={catalogos.activos.filter((a) => a.id !== activo?.id)}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          onElegir={(id) => {
            editar('superiorId', id);
            setPopup(null);
          }}
          onCerrar={() => setPopup(null)}
        />
      )}

      {popup === 'amenaza' && (
        <PopupAmenaza
          codigo={codigoVista}
          codigoTipo={tipo?.codigo ?? ''}
          disponibles={amenazas.filter(
            (a) => !a.tipos.includes(edicion.tipoId) && !agregadas.includes(a.codigo),
          )}
          onAgregar={(codigo) => {
            setAgregadas((a) => [...a, codigo]);
            setAbierta(codigo);
            setPopup(null);
            tocar();
          }}
          onCerrar={() => setPopup(null)}
        />
      )}
    </main>
  );
}

// ===========================================================================
// Initial state
// ===========================================================================

function inicial(activo: ActivoFicha | null, catalogos: Catalogos): Edicion {
  if (activo !== null) {
    return {
      nombre: activo.nombre,
      descripcion: activo.descripcion ?? '',
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
      cantidad: activo.cantidad,
      datosCliente: activo.datosCliente,
      datosPersonales: activo.datosPersonales,
      expuestoInternet: activo.expuestoInternet,
    };
  }
  // Creation mode. Name and description start empty; the classification starts on the
  // first type so the code preview and the threat list have something real to show; and
  // everything optional starts unset rather than pre-filled with a guess.
  const tipo = catalogos.tipos[0];
  const subtipo = catalogos.subtipos.find((s) => s.tipoId === tipo?.id);
  return {
    nombre: '',
    descripcion: '',
    areaId: catalogos.areas[0]?.id ?? 0,
    tipoId: tipo?.id ?? 0,
    subtipoId: subtipo?.id ?? 0,
    propietarioId: null,
    custodioId: null,
    ubicacionId: null,
    entornoId: null,
    proveedorId: null,
    superiorId: null,
    criticidadId: null,
    nivelId: null,
    cantidad: 1,
    datosCliente: 'POR_DEFINIR',
    datosPersonales: 'POR_DEFINIR',
    expuestoInternet: 'POR_DEFINIR',
  };
}

/// Degradation exceptions already stored on the risks, keyed by threat code. There are
/// none today — `riesgo_degradacion` is empty — but reading them back is what makes the
/// warn mark mean "deviates from the parameterisation" and not "was touched in this
/// session".
function excepcionesGuardadas(
  activo: ActivoFicha | null,
  amenazas: AmenazaCatalogo[],
): Record<string, Partial<Record<Dim, Excepcion>>> {
  if (activo === null) return {};
  const porId = new Map(amenazas.map((a) => [a.id, a.codigo]));
  const mapa: Record<string, Partial<Record<Dim, Excepcion>>> = {};
  for (const r of activo.riesgos) {
    const codigo = porId.get(r.amenazaId);
    if (codigo === undefined || r.degradacion.length === 0) continue;
    const fila: Partial<Record<Dim, Excepcion>> = {};
    for (const d of r.degradacion) {
      fila[d.dimension] = { degradacionId: d.degradacionId, justificacion: d.justificacion };
    }
    mapa[codigo] = fila;
  }
  return mapa;
}

function frecuenciasGuardadas(
  activo: ActivoFicha | null,
  amenazas: AmenazaCatalogo[],
): Record<string, number> {
  if (activo === null) return {};
  const porId = new Map(amenazas.map((a) => [a.id, a.codigo]));
  const mapa: Record<string, number> = {};
  for (const r of activo.riesgos) {
    const codigo = porId.get(r.amenazaId);
    if (codigo !== undefined && r.frecuenciaId !== null) mapa[codigo] = r.frecuenciaId;
  }
  return mapa;
}

/// The reason already on record for a frequency exception. `Riesgo.justificacion` is that
/// column — `excepcionFrecuencia` writes it there and nulls it when the exception is
/// cleared — so reading it back is what makes the band show the reason instead of an empty
/// box that looks like a missing one.
function justificacionesFrecuencia(
  activo: ActivoFicha | null,
  amenazas: AmenazaCatalogo[],
): Record<string, string> {
  if (activo === null) return {};
  const porId = new Map(amenazas.map((a) => [a.id, a.codigo]));
  const mapa: Record<string, string> = {};
  for (const r of activo.riesgos) {
    const codigo = porId.get(r.amenazaId);
    if (codigo !== undefined && r.frecuenciaId !== null && r.justificacion !== null) {
      mapa[codigo] = r.justificacion;
    }
  }
  return mapa;
}

function tratamientosGuardados(
  activo: ActivoFicha | null,
  amenazas: AmenazaCatalogo[],
): Record<string, Tratamiento> {
  if (activo === null) return {};
  const porId = new Map(amenazas.map((a) => [a.id, a.codigo]));
  const mapa: Record<string, Tratamiento> = {};
  for (const r of activo.riesgos) {
    const codigo = porId.get(r.amenazaId);
    if (codigo === undefined) continue;
    mapa[codigo] = {
      tratamientoId: r.tratamientoId,
      estadoId: r.estadoId,
      responsableId: r.responsableId,
      observacion: r.observacion ?? '',
    };
  }
  return mapa;
}

// ===========================================================================
// General data
// ===========================================================================

function DatosGenerales({
  edicion,
  catalogos,
  superior,
  valorD,
  codigoActivo,
  cuentas,
  onEditar,
  onBuscarSuperior,
}: {
  edicion: Edicion;
  catalogos: Catalogos;
  superior: ActivoBreve | null;
  /// Vacío en modo creación: todavía no hay activo al que atarle cuentas.
  codigoActivo: string;
  cuentas: CuentaDelActivo[];
  /// La disponibilidad EN VIVO (lo que se está editando, no solo lo guardado): la
  /// comprobación de coherencia (§11.3) tiene que reaccionar al mismo tiempo que la
  /// persona mueve el select de D, no solo después de guardar.
  valorD: number;
  onEditar: <K extends keyof Edicion>(campo: K, valor: Edicion[K]) => void;
  onBuscarSuperior: () => void;
}) {
  const criticidadElegida = catalogos.criticidades.find((c) => c.id === edicion.criticidadId) ?? null;
  // `[P] Personal` · el único tipo para el que «de quién está hecho este activo» significa
  // algo. Se mira el tipo EN EDICIÓN y no el guardado, para que la sección aparezca en
  // cuanto alguien reclasifique el activo, sin tener que guardar primero.
  const esPersonal = catalogos.tipos.find((t) => t.id === edicion.tipoId)?.codigo === '[P]';
  const sospechoso = esCriticidadSospechosa(criticidadElegida?.codigo ?? null, valorD);

  return (
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-x-5 gap-y-3.5 rounded-[9px] border border-border-default bg-subtle px-[18px] py-4">
      <Campo etiqueta="PROCESO O ÁREA">
        <SelectCampo
          valor={edicion.areaId}
          onChange={(v) => onEditar('areaId', v ?? edicion.areaId)}
          opciones={catalogos.areas.map((a) => ({
            id: a.id,
            nombre: `${a.prefijo} · ${a.nombre}`,
          }))}
          // The prefix forms the code, but the code already assigned never changes: this
          // edit moves who answers for the asset, not its identifier.
          titulo="El prefijo del proceso forma el código: al guardar, el activo recibe el siguiente código libre del proceso destino. El código anterior sigue resolviendo a este activo y la cadena queda en la bitácora."
        />
      </Campo>

      <Campo etiqueta="PROPIETARIO">
        <ConCatalogo catalogo="cargoPropietario">
          <SelectCampo
            valor={edicion.propietarioId}
            onChange={(v) => onEditar('propietarioId', v)}
            opciones={catalogos.cargosPropietario}
            vacio="— sin asignar —"
          />
        </ConCatalogo>
      </Campo>

      <Campo etiqueta="CUSTODIO">
        <ConCatalogo catalogo="cargoCustodio">
          <SelectCampo
            valor={edicion.custodioId}
            onChange={(v) => onEditar('custodioId', v)}
            opciones={catalogos.cargosCustodio}
            vacio="— sin asignar —"
          />
        </ConCatalogo>
      </Campo>

      <Campo etiqueta="UBICACIÓN">
        <ConCatalogo catalogo="ubicacion">
          <SelectCampo
            valor={edicion.ubicacionId}
            onChange={(v) => onEditar('ubicacionId', v)}
            opciones={catalogos.ubicaciones}
            vacio="— sin definir —"
          />
        </ConCatalogo>
      </Campo>

      <Campo etiqueta="ENTORNO">
        <ConCatalogo catalogo="entorno">
          <SelectCampo
            valor={edicion.entornoId}
            onChange={(v) => onEditar('entornoId', v)}
            opciones={catalogos.entornos}
            vacio="— sin definir —"
          />
        </ConCatalogo>
      </Campo>

      <Campo etiqueta="PROVEEDOR O SUBENCARGADO">
        <ConCatalogo catalogo="proveedor">
          <SelectCampo
            valor={edicion.proveedorId}
            onChange={(v) => onEditar('proveedorId', v)}
            opciones={catalogos.proveedores}
            vacio="— sin proveedor —"
          />
        </ConCatalogo>
      </Campo>

      {/* Ocupa dos celdas de la grilla: el nivel elegido se explica AL LADO del select, no
          en un `title` que hay que descubrir pasando el mouse. Lo que la criticidad
          significa —qué tan rápido hay que volver y cuánto se puede perder— es justo lo que
          se necesita para elegirla bien. */}
      <Campo etiqueta="CRITICIDAD DE NEGOCIO" className="sm:col-span-2">
        <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-[158px] flex-1">
            <SelectCampo
              valor={edicion.criticidadId}
              onChange={(v) => onEditar('criticidadId', v)}
              opciones={catalogos.criticidades.map((c) => ({ id: c.id, nombre: `${c.codigo} · ${c.nombre}` }))}
              vacio="— sin clasificar —"
              titulo="Cuánta interrupción tolera el negocio (RTO/RPO), declarada en FOR-SIG-12 columna 26. Nunca se calcula del riesgo residual."
            />
          </div>
          <DetalleCriticidad nivel={criticidadElegida} />
        </div>
      </Campo>

      {/* V21 · la cantidad existía en la base y viajaba a esta pantalla desde siempre, pero
          no se dibujaba en ningún lado: nadie podía verla ni corregirla. Va acá, entre los
          datos generales, porque es una propiedad del activo y no de su valoración. */}
      <Campo etiqueta="CANTIDAD">
        <input
          type="number"
          min={1}
          step={1}
          value={edicion.cantidad}
          aria-label="Cantidad de unidades del activo"
          title="Cuántas unidades representa este registro. Un activo es uno salvo que se diga otra cosa; «12 portátiles del mismo modelo» es una fila con cantidad 12."
          onChange={(e) => {
            // Nunca por debajo de uno: un activo que existe no puede ser cero, y el campo
            // vacío mientras se tipea tampoco puede escribirse como NaN.
            const n = Number(e.target.value);
            onEditar('cantidad', !Number.isFinite(n) || n < 1 ? 1 : Math.floor(n));
          }}
          className="w-full rounded-campo border border-border-field bg-surface px-2 py-[7px] text-12_5 font-medium text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        />
      </Campo>

      {sospechoso && (
        <div className="col-span-full flex flex-col gap-1 rounded-campo border border-warn-border bg-warn-100 px-3 py-2">
          <span className="text-11 leading-relaxed text-warn-text [text-wrap:pretty]">
            {/* REQ-SIG-20 §11.3 · avisa, no bloquea (D17): una criticidad exigente con
                disponibilidad baja es una de las dos declaraciones equivocada. */}
            <strong>{criticidadElegida?.codigo}</strong> exige una recuperación rápida y la
            disponibilidad (D) está en <strong>{valorD}</strong>: revisá si la valoración o la
            criticidad están al día. Esto no bloquea el guardado.
          </span>
        </div>
      )}

      {esPersonal && (
        <CuentasDelActivo
          codigoActivo={codigoActivo}
          cuentas={cuentas}
          personas={catalogos.personas}
          cantidad={edicion.cantidad}
        />
      )}

      <div className="col-span-full flex flex-col gap-1 border-t border-hairline-strong pt-[11px]">
        <span className="etiqueta-campo text-9">ACTIVO SUPERIOR</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBuscarSuperior}
            className="min-w-0 flex-1 truncate rounded-campo border border-border-field bg-surface px-[9px] py-[7px] text-left text-12_5 font-medium transition-colors hover:bg-app"
            style={{ color: superior === null ? 'var(--hf-text-label)' : 'var(--hf-text-primary)' }}
          >
            {superior === null ? '— sin activo superior —' : `${superior.codigo} · ${superior.nombre}`}
          </button>
          <button
            type="button"
            onClick={onBuscarSuperior}
            className="flex-none rounded-campo border border-accent-border bg-accent-100 px-[11px] py-[7px] text-11_5 font-semibold text-accent-700 transition-colors hover:bg-accent-border"
          >
            Buscar
          </button>
          {superior !== null && (
            <button
              type="button"
              onClick={() => onEditar('superiorId', null)}
              title="Quitar el activo superior"
              className="flex-none rounded-campo border border-danger-border bg-surface px-2.5 py-[7px] text-11_5 font-semibold text-danger-text transition-colors hover:bg-danger-bg"
            >
              Quitar
            </button>
          )}
        </div>
        {/* `superior` is empty on all 234 assets of the workbook, so an empty value reads
            as the normal state here and not as missing data. */}
        <span className="text-11 text-faint">
          La jerarquía es opcional y hoy está vacía en todo el inventario.
        </span>
      </div>

      <div className="col-span-full flex flex-col gap-2.5 border-t border-hairline-strong pt-[11px]">
        <span className="etiqueta-campo text-9">CONTENIDO SENSIBLE</span>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <SelectTernario
            etiqueta="Datos de cliente"
            valor={edicion.datosCliente}
            onChange={(v) => onEditar('datosCliente', v)}
          />
          <SelectTernario
            etiqueta="Datos personales · Ley 1581"
            valor={edicion.datosPersonales}
            onChange={(v) => onEditar('datosPersonales', v)}
          />
          <SelectTernario
            etiqueta="Expuesto a internet"
            valor={edicion.expuestoInternet}
            onChange={(v) => onEditar('expuestoInternet', v)}
          />
        </div>
        {/* "Por definir" is not "no". Under Ley 1581 an undecided personal-data question
            has to stay tellable apart from a negative answer, which is why `Ternario`
            exists in the schema. */}
        <span className="text-11 text-faint">
          «Por definir» no equivale a «No»: la respuesta pendiente se conserva como tal.
        </span>
      </div>
    </div>
  );
}

/// The `+` beside Proveedor, Propietario, Custodio, Ubicación and Entorno.
///
/// It was a link to /sgsi/parámetros, on the reasoning that two editors for one list would
/// give that list two owners. The reasoning was fine and the remedy was not: leaving the
/// sheet abandons whatever is being typed, so the value the person needed never got added
/// and the field stayed empty. There is still ONE editor — the popup renders the same
/// CatalogoEditable screen 9 renders — it just opens here instead of navigating away.
// ===========================================================================
// Hierarchy — E1/E2
// ===========================================================================

/// E1/E2 · dónde vive el activo dentro de la jerarquía de tres grados, en la cabecera y no
/// enterrado en una pestaña: es lo primero que se pregunta de un activo después de qué es.
///
/// **Se guarda un solo id: el del nivel 3.** Los grados 1 y 2 no son campos del activo —
/// se derivan subiendo por `padreId`— y acá existen únicamente como los dos pasos que
/// llevan a elegir el 3. Por eso, mientras la rama esté a medio elegir, no hay nada que
/// guardar y `nivelId` sigue en `null`.
function JerarquiaActivo({
  nivelId,
  niveles,
  onElegir,
}: {
  nivelId: number | null;
  niveles: NivelJerarquia[];
  onElegir: (v: number | null) => void;
}) {
  // La rama a medio elegir. Vive en el cliente y no en `Edicion` justamente porque no es
  // un dato del activo: nadie la guarda ni la compara contra lo guardado.
  const [rama, setRama] = useState<{ n1: number | null; n2: number | null }>({ n1: null, n2: null });

  const cadena = nivelId === null ? [] : cadenaDeNivel(nivelId, niveles);
  const guardado = (grado: number) => cadena.find((n) => n.grado === grado)?.id ?? null;

  const n1 = guardado(1) ?? rama.n1;
  const n2 = guardado(2) ?? rama.n2;

  const hijos = (grado: number, padreId: number | null) =>
    padreId === null ? [] : niveles.filter((n) => n.grado === grado && n.padreId === padreId);

  /// Si lo guardado no está entre las opciones —una rama rota, un nivel inactivado— se
  /// agrega igual. Un select que se dibuja vacío escondería el dato roto, que es
  /// exactamente lo que hay que ver.
  const conElegido = (opciones: NivelJerarquia[], elegidoId: number | null) => {
    if (elegidoId === null || opciones.some((o) => o.id === elegidoId)) return opciones;
    const suelto = niveles.find((n) => n.id === elegidoId);
    return suelto === undefined ? opciones : [...opciones, suelto];
  };

  // Bajar de grado invalida lo que colgaba abajo: quedarse con el nivel 3 de otra rama es
  // justamente el árbol imposible que E1 existe para impedir.
  const limpiarElegido = () => {
    if (nivelId !== null) onElegir(null);
  };

  return (
    <div className="flex min-w-0 flex-1 basis-[320px] flex-col gap-2 rounded-[9px] border border-border-default bg-subtle px-[18px] py-3.5">
      <span className="etiqueta-campo text-9">UBICACIÓN EN LA JERARQUÍA</span>

      <div className="grid gap-x-3 gap-y-2.5 [grid-template-columns:repeat(auto-fit,minmax(122px,1fr))]">
        <Campo etiqueta="NIVEL 1">
          <SelectCampo
            valor={n1}
            onChange={(v) => {
              setRama({ n1: v, n2: null });
              limpiarElegido();
            }}
            opciones={conElegido(
              niveles.filter((n) => n.grado === 1),
              n1,
            )}
            vacio="— sin ubicar —"
            titulo="La raíz de la jerarquía. Elegirla filtra los niveles 2 posibles."
          />
        </Campo>

        <Campo etiqueta="NIVEL 2">
          <SelectCampo
            valor={n2}
            onChange={(v) => {
              setRama({ n1, n2: v });
              limpiarElegido();
            }}
            opciones={conElegido(hijos(2, n1), n2)}
            vacio={n1 === null ? '— elegí el nivel 1 —' : '— sin ubicar —'}
            titulo="Sólo se listan los niveles 2 que cuelgan del nivel 1 elegido."
          />
        </Campo>

        <Campo etiqueta="NIVEL 3">
          <SelectCampo
            valor={nivelId}
            onChange={(v) => {
              setRama({ n1, n2 });
              onElegir(v);
            }}
            opciones={conElegido(hijos(3, n2), nivelId)}
            vacio={n2 === null ? '— elegí el nivel 2 —' : '— sin ubicar —'}
            titulo="El más específico, y el único que el activo guarda: los otros dos se derivan de él."
          />
        </Campo>
      </div>

      <p className="text-10_5 leading-relaxed text-label [text-wrap:pretty]">
        {nivelId === null
          ? 'El activo guarda el nivel 3; los otros dos se derivan. Sin nivel 3, queda sin ubicar.'
          : cadena.map((n) => n.nombre).join(' · ')}
      </p>
    </div>
  );
}

/// REQ-SIG-12 · las cuentas del dominio que un activo `[P] Personal` ENCARNA.
///
/// El inventario tiene activos que SON personas: «Personal de soporte», «FireFly». Hasta
/// ahora eran una fila con un nombre y una cantidad, sin forma de decir de quién estaban
/// hechos — y sin eso, «¿a qué activo pertenece esta cuenta?» no tenía respuesta.
///
/// Se muestra sólo para el tipo `[P]`: para un servidor o una base de datos la pregunta no
/// significa nada, y una sección vacía en cada ficha del inventario sería ruido en 298
/// pantallas para servir a dos.
function CuentasDelActivo({
  codigoActivo,
  cuentas,
  personas,
  cantidad,
}: {
  codigoActivo: string;
  cuentas: CuentaDelActivo[];
  personas: PersonaOpcion[];
  /// Cuántas unidades declara el activo. Se compara contra las cuentas atadas para
  /// SEÑALAR la diferencia — nunca para impedirla: cuál de los dos números está mal lo
  /// sabe la persona, no la pantalla (D17).
  cantidad: number;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [eligiendo, setEligiendo] = useState('');

  if (codigoActivo === '') return null;

  const atadas = new Set(cuentas.map((c) => c.personaId));
  const disponibles = personas.filter((p) => !atadas.has(p.id));

  const correr = (personaId: number, vincular: boolean) =>
    iniciar(async () => {
      const r = await vincularCuentaAlActivo(codigoActivo, personaId, vincular);
      setAviso({ ok: r.ok, texto: r.mensaje });
      if (r.ok) {
        setEligiendo('');
        router.refresh();
      }
    });

  return (
    <div className="col-span-full flex flex-col gap-2 border-t border-hairline-strong pt-[11px]">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="etiqueta-campo text-9">CUENTAS DEL DOMINIO QUE ESTE ACTIVO ENCARNA</span>
        <span className="text-10_5 text-label">
          {cuentas.length} de {cantidad} {cantidad === 1 ? 'unidad declarada' : 'unidades declaradas'}
        </span>
      </div>

      {cuentas.length === 0 ? (
        <p className="text-11 leading-relaxed text-label [text-wrap:pretty]">
          Sin cuentas declaradas. Este activo es personal: decir de quién está hecho es lo
          que permite responder, desde la ficha de una persona, a qué activo pertenece.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {cuentas.map((c) => (
            <li
              key={c.personaId}
              className="flex flex-wrap items-center gap-2 rounded-campo border border-border-default bg-subtle px-2.5 py-1.5"
            >
              <span className="text-11_5 font-semibold text-primary">{c.nombre}</span>
              <span className="font-mono text-10_5 text-muted">{c.correo}</span>
              {/* Una cuenta inactiva atada se sigue mostrando, y marcada: que alguien haya
                  salido de la organizacion es justo lo que hay que ver. */}
              {!c.activa && (
                <span className="rounded-badge border border-warn-border bg-warn-100 px-1.5 py-px text-9_5 font-semibold text-warn-text">
                  cuenta inactiva
                </span>
              )}
              <button
                type="button"
                disabled={pendiente}
                onClick={() => correr(c.personaId, false)}
                aria-label={`Quitar ${c.correo} de ${codigoActivo}`}
                className="ml-auto rounded-badge border border-danger-border px-1.5 py-0.5 font-mono text-9 uppercase tracking-[0.06em] text-danger-text disabled:opacity-40"
              >
                quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      {cuentas.length > cantidad && (
        <p className="text-11 leading-relaxed text-warn-text [text-wrap:pretty]">
          Hay {cuentas.length} cuentas atadas y la cantidad declarada es {cantidad}. Una de
          las dos cifras está mal; esto no bloquea el guardado.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={eligiendo}
          disabled={pendiente || disponibles.length === 0}
          onChange={(e) => setEligiendo(e.target.value)}
          aria-label="Cuenta del dominio para atar al activo"
          className="min-w-[240px] flex-1 rounded-campo border border-border-field bg-surface px-2 py-[7px] text-12_5 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300 disabled:opacity-50"
        >
          <option value="">
            {disponibles.length === 0
              ? '— ya están todas las cuentas del directorio —'
              : '— elegí una cuenta del dominio —'}
          </option>
          {disponibles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} · {p.correo}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pendiente || eligiendo === ''}
          onClick={() => correr(Number(eligiendo), true)}
          className="flex-none rounded-campo border border-accent-500 bg-accent-100 px-3 py-[7px] text-11_5 font-semibold text-accent-700 disabled:opacity-40"
        >
          {pendiente ? 'Guardando…' : 'Atar cuenta'}
        </button>
      </div>

      {aviso && (
        <span
          className="text-11 [text-wrap:pretty]"
          style={{ color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)' }}
        >
          {aviso.texto}
        </span>
      )}
    </div>
  );
}

function ConCatalogo({
  catalogo,
  children,
}: {
  catalogo: Catalogo;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Administrar el catálogo sin salir de la ficha: alta, renombrado y baja lógica, con el conteo de registros que lo usan"
        aria-label="Administrar el catálogo"
        className="flex h-8 w-8 flex-none items-center justify-center rounded-campo border border-accent-border bg-accent-100 text-14 font-bold leading-none text-accent-700 transition-colors hover:bg-accent-border"
      >
        +
      </button>
      {abierto && <PopupCatalogo catalogo={catalogo} onCerrar={() => setAbierto(false)} />}
    </div>
  );
}

function Campo({
  etiqueta,
  children,
  className,
}: {
  etiqueta: string;
  children: React.ReactNode;
  /// Para que un campo pueda ocupar más de una celda de la grilla sin que el resto tenga
  /// que saberlo — la criticidad lo usa para caber junto a su RTO/RPO.
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1${className === undefined ? '' : ` ${className}`}`}>
      <span className="etiqueta-campo text-9">{etiqueta}</span>
      {children}
    </label>
  );
}

/// REQ-SIG-20 §11 (P9) · lo que el nivel elegido significa, junto al select que lo elige.
/// El RTO y el RPO se pintan desde `rtoMinutos`/`rpoMinutos` —el minuto es el dato— pasados
/// por `formatearSla`, y no desde un texto guardado aparte que podría contradecirlos.
function DetalleCriticidad({ nivel }: { nivel: NivelCriticidad | null }) {
  if (nivel === null) {
    return (
      <p className="min-w-[180px] flex-[2] text-11 leading-relaxed text-label [text-wrap:pretty]">
        Sin clasificar. La declara el negocio en FOR-SIG-12 columna 26; no se deduce del
        riesgo residual.
      </p>
    );
  }

  return (
    <div className="flex min-w-[180px] flex-[2] flex-col gap-1.5">
      {nivel.descripcion !== null && (
        <p className="text-11 leading-relaxed text-muted [text-wrap:pretty]">{nivel.descripcion}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <ChipSla
          sigla="RTO"
          texto={formatearSla(nivel.rtoMinutos)}
          titulo="Tiempo objetivo de recuperación: cuánto puede estar caído el activo antes de que el negocio lo sienta."
        />
        <ChipSla
          sigla="RPO"
          texto={formatearSla(nivel.rpoMinutos)}
          titulo="Punto objetivo de recuperación: cuánto trabajo reciente se acepta perder al restaurar."
        />
      </div>
    </div>
  );
}

function ChipSla({ sigla, texto, titulo }: { sigla: string; texto: string; titulo: string }) {
  return (
    <span
      title={titulo}
      className="flex items-baseline gap-1.5 rounded-campo border border-border-default bg-subtle px-2.5 py-1"
    >
      <span className="font-mono text-9_5 tracking-[0.07em] text-label">{sigla}</span>
      <span className="text-11_5 font-semibold text-secondary">{texto}</span>
    </span>
  );
}

function SelectCampo({
  valor,
  onChange,
  opciones,
  vacio,
  titulo,
}: {
  valor: number | null;
  onChange: (v: number | null) => void;
  opciones: { id: number; nombre: string }[];
  vacio?: string;
  titulo?: string;
}) {
  return (
    <select
      value={valor === null ? '' : String(valor)}
      title={titulo}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className="w-full rounded-campo border border-border-field bg-surface px-2 py-[7px] text-12_5 font-medium text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
    >
      {vacio !== undefined && <option value="">{vacio}</option>}
      {opciones.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nombre}
        </option>
      ))}
    </select>
  );
}

function SelectTernario({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string;
  valor: Ternario;
  onChange: (v: Ternario) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-11 text-muted">{etiqueta}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value as Ternario)}
        className="w-full rounded-campo border border-border-field bg-surface px-2 py-[7px] text-12_5 font-medium text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
      >
        {TERNARIOS.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.etiqueta}
          </option>
        ))}
      </select>
    </label>
  );
}

/// The emphasis the handoff asks for: a 2px accent border and a floating mono label. Type
/// and subtype decide which threats apply, so they get the loudest card on the sheet.
///
/// It also carries the VALUATION SUMMARY, and the pairing is the point: the classification
/// decides WHICH threats apply and the valuation decides WHETHER they are analysed at all.
/// Read apart they are two facts; read together they are the reason this asset has 23 risks
/// and the one beside it has none. Every figure here is derived from the same D/I/C the
/// Valoración tab edits, so it moves as the selects move — none of it is a second copy.
function ClasificacionMagerit({
  edicion,
  catalogos,
  subtipos,
  codigoTipo,
  aplicables,
  valores,
  valor,
  nombreNivel,
  entra,
  riesgos,
  onTipo,
  onSubtipo,
}: {
  edicion: Edicion;
  catalogos: Catalogos;
  subtipos: { id: number; codigo: string; nombre: string }[];
  codigoTipo: string;
  aplicables: number;
  valores: Record<Dim, number>;
  valor: number;
  nombreNivel: string;
  entra: boolean;
  riesgos: number;
  onTipo: (id: number) => void;
  onSubtipo: (id: number) => void;
}) {
  // Which dimensions actually set the value. max() hides ties, and "the value is 4 because
  // Integridad and Confidencialidad are both 4" is the sentence somebody needs when they
  // ask why lowering Disponibilidad changed nothing.
  const manda = DIMS.filter((d) => valores[d] === valor);
  return (
    <div className="relative grid min-w-0 grid-cols-[repeat(auto-fit,minmax(168px,1fr))] gap-3 rounded-[9px] border-2 border-accent-500 bg-surface px-4 py-3.5">
      <div className="absolute -top-[9px] left-3.5 rounded-badge bg-accent-500 px-[7px] py-0.5 font-mono text-9 tracking-[0.08em] text-white">
        CLASIFICACIÓN MAGERIT
      </div>

      <div className="flex min-w-0 flex-col gap-1.5 pt-1.5">
        <span className="font-mono text-9_5 tracking-[0.07em] text-accent-700">TIPO</span>
        <select
          value={edicion.tipoId}
          onChange={(e) => onTipo(Number(e.target.value))}
          className="w-full rounded-campo border border-accent-border bg-accent-50 px-2.5 py-[9px] text-13_5 font-semibold text-accent-800 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        >
          {catalogos.tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.codigo} {t.nombre}
            </option>
          ))}
        </select>
        <span className="text-11 text-muted [text-wrap:pretty]">
          Determina qué amenazas del catálogo aplican. Cambiarlo recalcula el conjunto de
          riesgos.
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5 pt-1.5">
        <span className="font-mono text-9_5 tracking-[0.07em] text-accent-700">SUBTIPO</span>
        <select
          value={edicion.subtipoId}
          onChange={(e) => onSubtipo(Number(e.target.value))}
          className="w-full rounded-campo border border-accent-border bg-accent-50 px-2.5 py-[9px] text-13_5 font-semibold text-accent-800 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        >
          {subtipos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.codigo} {s.nombre}
            </option>
          ))}
        </select>
        <span className="text-11 text-muted [text-wrap:pretty]">
          Lista dependiente del tipo, con los subtipos del Libro II de MAGERIT.
        </span>
      </div>

      {/* --- Valuation summary ---------------------------------------------------- */}
      <div className="col-span-full flex flex-col gap-2 border-t border-hairline-strong pt-3">
        <span className="font-mono text-9_5 tracking-[0.07em] text-accent-700">
          RESUMEN DE VALORACIÓN
        </span>

        <div className="flex flex-wrap items-stretch gap-2">
          {DIMS.map((d) => {
            const decide = manda.includes(d);
            const nivel = catalogos.escalaValor.find((e) => e.valor === valores[d]);
            return (
              <div
                key={d}
                // The dimensions that set the value are outlined. Colour is not the only
                // carrier: the title says it in words too.
                className="flex min-w-[92px] flex-1 flex-col gap-0.5 rounded-campo border px-2.5 py-1.5"
                style={{
                  background: decide ? 'var(--hf-accent-100)' : 'var(--hf-bg-subtle)',
                  borderColor: decide ? 'var(--hf-accent-500)' : 'var(--hf-border-default)',
                }}
                title={
                  decide
                    ? `${d} es una de las dimensiones que fijan el valor del activo`
                    : `${d} está por debajo del valor del activo, así que no lo fija`
                }
              >
                <span className="font-mono text-9_5 tracking-[0.07em] text-label">
                  [{d}] {decide ? '· manda' : ''}
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span
                    className="cifra text-19"
                    style={{ color: decide ? 'var(--hf-accent-800)' : 'var(--hf-text-secondary)' }}
                  >
                    {valores[d]}
                  </span>
                  <span className="truncate text-10_5 text-muted">
                    {nivel ? etiquetaCorta(nivel.etiqueta) : ''}
                  </span>
                </span>
              </div>
            );
          })}

          <div
            className="flex min-w-[122px] flex-1 flex-col gap-0.5 rounded-campo border-2 px-2.5 py-1.5"
            style={{ background: 'var(--hf-accent-50)', borderColor: 'var(--hf-accent-500)' }}
          >
            <span className="font-mono text-9_5 tracking-[0.07em] text-accent-700">
              VALOR · CALCULADO
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="cifra text-19 text-accent-800">{valor}</span>
              <span className="truncate text-10_5 font-semibold text-accent-700">
                {nombreNivel}
              </span>
            </span>
          </div>
        </div>

        {/* The consequence, in one sentence. This is the line that connects the two halves
            of the card: the type says which threats exist, the value says whether they are
            analysed, and the product of the two is the risk count. */}
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-campo border px-2.5 py-2 text-11_5 [text-wrap:pretty]"
          style={
            entra
              ? {
                  background: 'var(--hf-warn-100)',
                  borderColor: 'var(--hf-warn-border)',
                  color: 'var(--hf-warn-text)',
                }
              : {
                  background: 'var(--hf-bg-subtle)',
                  borderColor: 'var(--hf-border-default)',
                  color: 'var(--hf-text-muted)',
                }
          }
        >
          {entra ? (
            <>
              <strong>Entra al análisis.</strong>
              <span>
                El valor {valor} alcanza el umbral de {catalogos.umbralValoracion}, así que las{' '}
                {aplicables} amenazas de {codigoTipo} se cruzan con este activo:{' '}
                <strong>{riesgos} riesgos</strong>. El propietario debe registrar tratamiento y
                madurez de controles.
              </span>
            </>
          ) : (
            <>
              <strong>Fuera del análisis.</strong>
              <span>
                El valor {valor} no alcanza el umbral de {catalogos.umbralValoracion}, así que
                las {aplicables} amenazas de {codigoTipo} no se cruzan con este activo y no
                genera riesgos. Sigue en el inventario: estar fuera del análisis no es estar
                fuera del alcance.
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-10_5 text-muted">{codigoTipo}</span>
          <span className="text-11_5 text-faint">
            {aplicables} amenazas aplicables según la parametrización del tipo · el valor es el
            mayor de D, I y C y no se captura
          </span>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Tab 1 · Valoración
// ===========================================================================

function TabValoracion({
  nuevo,
  valores,
  valor,
  nombreNivel,
  escala,
  entra,
  umbral,
  nRiesgos,
  onValor,
  onIrAmenazas,
}: {
  nuevo: boolean;
  valores: ValoresDimension;
  valor: number;
  nombreNivel: string;
  escala: NivelValor[];
  entra: boolean;
  umbral: number;
  nRiesgos: number;
  onValor: (d: Dim, v: number) => void;
  onIrAmenazas: () => void;
}) {
  const color = colorDeValor(valor);

  return (
    <div className="flex flex-col gap-[22px] px-8 pt-6 pb-[46px]">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-16 font-bold text-primary">Valoración del activo</h2>
        <p className="max-w-[76ch] text-12_5 text-muted [text-wrap:pretty]">
          Escala 0 a 5 en las tres dimensiones activas. Cada nivel se acompaña del ejemplo
          de la metodología MET-SIG-01 para que la valoración sea comparable entre
          procesos.
        </p>
      </div>

      {nuevo && (
        <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-accent-border bg-accent-50 px-3.5 py-2.5">
          <span className="flex-none font-mono text-9 tracking-[0.07em] text-accent-700">
            ACTIVO NUEVO
          </span>
          <span className="text-11_5 text-secondary [text-wrap:pretty]">
            El código se genera al crear el activo, con el prefijo del proceso y la
            abreviatura del tipo. Valora D, I y C para que se carguen las amenazas
            preclasificadas del tipo: por debajo del umbral de {umbral} el activo no entra
            al análisis y no genera riesgos.
          </span>
        </div>
      )}

      {/* The orange band lives HERE, on the Valoración tab, edge to edge above the cards.
          It appears when valor(a) ≥ umbral. */}
      {entra && (
        <div className="flex flex-wrap items-center gap-3.5 rounded-[8px] border border-warn-border bg-warn-100 px-[18px] py-3 [border-left-width:4px] [border-left-color:var(--hf-warn-500)]">
          <div
            className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-13 font-bold text-white"
            style={{ background: 'var(--hf-warn-500)' }}
            aria-hidden
          >
            !
          </div>
          <div className="flex-none text-12_5 font-bold text-warn-text">
            Este activo requiere gestión de riesgo
          </div>
          <div
            className="min-w-0 text-11_5 leading-snug [text-wrap:pretty]"
            style={{ color: 'var(--hf-warn-text-soft)' }}
          >
            El valor del activo es {valor} — {nombreNivel}, igual o superior al umbral de{' '}
            {umbral}. Se generan {nRiesgos} riesgos y el propietario debe registrar
            tratamiento y madurez de controles.
          </div>
          <button
            type="button"
            onClick={onIrAmenazas}
            className="ml-auto flex-none rounded-campo border bg-surface px-3 py-1.5 text-11_5 font-semibold text-warn-text transition-colors hover:bg-[#ffe9d2]"
            style={{ borderColor: 'var(--hf-warn-500)' }}
          >
            Ir a Amenazas
          </button>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        {DIMS.map((d) => (
          <TarjetaDimension
            key={d}
            dim={d}
            valor={valores[d]}
            escala={escala}
            onValor={(v) => onValor(d, v)}
          />
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        <div className="flex flex-col gap-1.5 rounded-tarjeta border border-border-default bg-surface px-[17px] py-4">
          <span className="etiqueta-campo text-9">VALOR DEL ACTIVO — CALCULADO</span>
          <div className="flex items-baseline gap-2.5">
            <span className="cifra text-34 text-primary">{valor}</span>
            <span
              className="inline-block rounded-[5px] px-2.5 py-[3px] text-12 font-bold"
              style={{ background: color.bg, color: color.fg }}
            >
              {nombreNivel}
            </span>
          </div>
          {/* max(v_D, v_I, v_C). One critical dimension is enough to make the asset
              critical, and the figure is derived: there is no column for it. */}
          <span className="text-11_5 text-muted">El mayor de D, I y C. No se captura.</span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-tarjeta border border-border-default bg-surface px-[17px] py-4">
          <span className="etiqueta-campo text-9">UMBRAL DE ENTRADA A VALORACIÓN</span>
          <span className="cifra text-34 text-primary">{umbral}</span>
          <span className="text-11_5 text-muted">
            Parámetro global <span className="font-mono">umbral_valoracion</span>. Un activo
            entra al análisis si su valor lo alcanza.
          </span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-tarjeta border border-border-default bg-surface px-[17px] py-4">
          <span className="etiqueta-campo text-9">RIESGOS GENERADOS</span>
          {/* Below the threshold the asset does not require the analysis. That is not the
              same as zero risks, so the card says so in words. */}
          <span className={entra ? 'cifra text-34 text-primary' : 'cifra text-22 text-faint'}>
            {entra ? nRiesgos : 'no requiere'}
          </span>
          <span className="text-11_5 text-muted">
            Producto del activo por las amenazas preclasificadas de su tipo.
          </span>
        </div>
      </div>
    </div>
  );
}

function TarjetaDimension({
  dim,
  valor,
  escala,
  onValor,
}: {
  dim: Dim;
  valor: number;
  escala: NivelValor[];
  onValor: (v: number) => void;
}) {
  const seleccionado = escala.find((e) => e.valor === valor);
  const otros = escala.filter((e) => e.valor !== valor).slice(0, 3);

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-tarjeta border border-border-default bg-surface px-[17px] py-4">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className="rounded-badge bg-accent-100 px-1.5 py-0.5 font-mono text-11 font-semibold text-accent-500">
            [{dim}]
          </span>
          <span className="text-14 font-semibold text-primary">{NOMBRE_DIM[dim]}</span>
        </div>
        <span
          className="cifra text-20"
          style={{ color: valor >= 4 ? 'var(--hf-risk-alto-bg)' : 'var(--hf-text-primary)' }}
        >
          {valor}
        </span>
      </div>

      <select
        value={valor}
        aria-label={NOMBRE_DIM[dim]}
        onChange={(e) => onValor(Number(e.target.value))}
        className="w-full rounded-campo border border-border-field bg-subtle px-2.5 py-[9px] text-13 font-medium text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
      >
        {escala.map((e) => (
          <option key={e.id} value={e.valor}>
            {e.etiqueta}
          </option>
        ))}
      </select>

      <div className="flex flex-col gap-1.5 rounded-[7px] border border-dashed border-border-field bg-subtle px-3 py-[11px]">
        <span className="etiqueta-campo text-9">
          EJEMPLO DEL MANUAL · {seleccionado ? etiquetaCorta(seleccionado.etiqueta) : valor}
        </span>
        <span className="text-12_5 leading-relaxed text-secondary [text-wrap:pretty]">
          {EJEMPLOS[dim][valor] ?? 'Sin ejemplo registrado para este nivel.'}
        </span>
      </div>

      <div className="flex flex-col gap-1 border-t border-hairline pt-2.5">
        <span className="etiqueta-campo text-9">OTROS NIVELES</span>
        {otros.map((e) => (
          <div key={e.id} className="flex gap-2 text-11_5 leading-snug text-faint">
            <span className="flex-none font-mono text-[var(--hf-text-placeholder)]">{e.valor}</span>
            <span className="[text-wrap:pretty]">{EJEMPLOS[dim][e.valor] ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// Tab 2 · Amenazas
// ===========================================================================

interface AccionesAmenazas {
  onAbrir: (codigo: string) => void;
  onDegradacion: (codigo: string, dim: Dim, degradacionId: number) => void;
  onJustificacion: (codigo: string, dim: Dim, justificacion: string) => void;
  onQuitarExcepcion: (codigo: string, dim: Dim) => void;
  onFrecuencia: (codigo: string, frecuenciaId: number) => void;
  onJustificacionFrecuencia: (codigo: string, justificacion: string) => void;
  onMadurez: (clave: string, nivel: number) => void;
  onEfecto: (clave: string, efecto: EfectoControl) => void;
  onQuitarControl: (clave: string) => void;
  onRestaurarControles: (codigo: string) => void;
  onEliminarAmenaza: (codigo: string) => void;
  onTratamiento: (codigo: string, cambio: Tratamiento) => void;
}

function TabAmenazas({
  codigoActivo,
  planes,
  filas,
  nFilas,
  aplicables,
  codigoTipo,
  catalogos,
  abierta,
  nSinGestionar,
  soloSinGestionar,
  eliminadas,
  excluidas,
  guardando,
  onToggleSinGestionar,
  onAbrirPopupAmenaza,
  onRestaurar,
  onMotivoEliminada,
  onDeshacerEliminada,
  onRestaurarAmenaza,
  ...acciones
}: AccionesAmenazas & {
  /// Vacío solo en modo creación, donde no hay amenazas que abrir todavía.
  codigoActivo: string;
  /// Amenaza → plan activo que ya la cubre. Sin entrada = sin plan, y el detalle ofrece
  /// crearlo en vez de afirmar que existe.
  planes: Map<string, PlanDeAmenaza>;
  filas: FilaAmenaza[];
  nFilas: number;
  aplicables: number;
  codigoTipo: string;
  catalogos: Catalogos;
  abierta: string | null;
  nSinGestionar: number;
  soloSinGestionar: boolean;
  eliminadas: Record<string, string>;
  /// Threat code → risk code, for the ones already out of the analysis on the server.
  excluidas: Map<string, string>;
  guardando: boolean;
  onToggleSinGestionar: () => void;
  onAbrirPopupAmenaza: () => void;
  onRestaurar: () => void;
  onMotivoEliminada: (codigo: string, motivo: string) => void;
  onDeshacerEliminada: (codigo: string) => void;
  onRestaurarAmenaza: (codigoRiesgo: string) => void;
}) {
  // Pending removals only: a threat whose removal is already saved has no risk left in the
  // live analysis, so it moves to the band below with its Restaurar.
  const listaEliminadas = Object.entries(eliminadas).filter(([codigo]) => !excluidas.has(codigo));
  const listaExcluidas = [...excluidas.entries()];

  return (
    <div className="flex flex-col gap-[18px] px-8 pt-[22px] pb-[46px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-16 font-bold text-primary">Amenazas del catálogo aplicables</h2>
          <p className="max-w-[82ch] text-12_5 text-muted [text-wrap:pretty]">
            Cargadas desde la parametrización de amenazas preclasificadas para el tipo{' '}
            {codigoTipo} — el mismo predicado que genera los riesgos, así que la lista, el
            contador y el detalle concuerdan. La degradación y la frecuencia llegan con el
            valor parametrizado; cambiarlas sobre este activo es una excepción y exige
            justificación.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-12 text-faint">
            {nFilas} de {aplicables} activas
          </span>
          <button
            type="button"
            onClick={onAbrirPopupAmenaza}
            className="rounded-campo border border-accent-border bg-accent-100 px-3 py-[7px] text-12 font-semibold text-accent-700 transition-colors hover:bg-accent-border"
          >
            + Agregar amenaza
          </button>
          <button
            type="button"
            onClick={onRestaurar}
            title="Devuelve degradación, frecuencia, madurez y bajas a lo que dice la parametrización"
            className="rounded-campo border border-border-field bg-surface px-3 py-[7px] text-12 text-secondary transition-colors hover:bg-app"
          >
            Restaurar parametrización
          </button>
          <BotonRecalcular codigoActivo={codigoActivo} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          aria-pressed={soloSinGestionar}
          onClick={onToggleSinGestionar}
          className="flex items-center gap-2.5 rounded-chip border px-3.5 py-[7px] text-12_5 font-semibold transition-colors"
          style={{
            borderColor: soloSinGestionar ? 'var(--hf-warn-500)' : 'var(--hf-border-field)',
            background: soloSinGestionar ? 'var(--hf-warn-100)' : 'var(--hf-bg-surface)',
            color: soloSinGestionar ? 'var(--hf-warn-text)' : 'var(--hf-text-secondary-soft)',
          }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background:
                nSinGestionar > 0 ? 'var(--hf-warn-500)' : 'var(--hf-text-placeholder-soft)',
            }}
          />
          <span>Amenazas sin gestionar</span>
          <span className="font-mono text-11_5 tabular-nums">{nSinGestionar}</span>
        </button>
        <span className="max-w-[78ch] text-11_5 text-faint [text-wrap:pretty]">
          Riesgo inherente Alto o Crítico en un activo que alcanza el umbral, sin ningún
          control que mejore el riesgo residual.
        </span>
      </div>

      {/* The grid owns its own horizontal overflow. The card inside it clips its corners;
          it is never the scrolling element. */}
      <div className="tabla-ancha rounded-tarjeta border border-border-default bg-surface">
        <div style={{ minWidth: ANCHO_MINIMO_AMENAZAS }} className="flex flex-col">
          <div
            className="grid items-end border-b border-border-default bg-subtle font-mono text-8_5 leading-tight tracking-[0.05em] text-faint"
            style={{ gridTemplateColumns: COLUMNAS_AMENAZAS, padding: '10px 14px' }}
          >
            <div>CÓD.</div>
            <div>AMENAZA</div>
            <div className="text-center text-accent-500">DEG D</div>
            <div className="text-center text-accent-500">DEG I</div>
            <div className="text-center text-accent-500">DEG C</div>
            <div className="text-center">IMPACTO</div>
            <div>FRECUENCIA</div>
            <div className="text-center">V/AÑO</div>
            <div className="text-center">R. INHERENTE</div>
            <div className="text-center">R. RESIDUAL</div>
            <div />
          </div>

          {filas.map((f) => (
            <RenglonAmenaza
              key={f.amenaza.codigo}
              f={f}
              abierta={abierta === f.amenaza.codigo}
              catalogos={catalogos}
              codigoActivo={codigoActivo}
              plan={planes.get(f.amenaza.codigo) ?? null}
              {...acciones}
            />
          ))}

          {filas.length === 0 && (
            <p className="px-4 py-6 text-12_5 text-muted">
              Ninguna amenaza cumple el filtro actual.
            </p>
          )}
        </div>
      </div>

      {/* Nothing is physically deleted. Removing a threat from an asset is a logical
          exception, and the reason travels with it: `bitacora.motivo` is where it lands,
          so the band asks for it here rather than after the fact. */}
      {/* Removals already written. `quitarAmenazaDelActivo` left the risk obsolete and
          `excluidoManual`, which is what keeps the generator from taking the pair back on
          its next run; `restaurarAmenaza` clears both and recomputes the figures, which may
          have moved while the threat was out. */}
      {listaExcluidas.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-[8px] border border-border-default bg-subtle px-4 py-3">
          <span className="text-12_5 text-muted [text-wrap:pretty]">
            {listaExcluidas.length}{' '}
            {listaExcluidas.length === 1 ? 'amenaza' : 'amenazas'} fuera del análisis de este
            activo, ya guardadas. Nada se borró: el riesgo conserva su código y su historia,
            y volver a incluirlo recalcula sus cifras.
          </span>
          {listaExcluidas.map(([codigo, codigoRiesgo]) => (
            <div key={codigo} className="flex flex-wrap items-center gap-2">
              <span className="w-[54px] flex-none font-mono text-11_5 font-semibold text-secondary">
                {codigo}
              </span>
              <span className="min-w-0 flex-1 font-mono text-11 text-faint">{codigoRiesgo}</span>
              <button
                type="button"
                disabled={guardando}
                onClick={() => onRestaurarAmenaza(codigoRiesgo)}
                className="flex-none rounded-campo border border-accent-border bg-accent-100 px-3 py-1.5 text-11_5 font-semibold text-accent-700 transition-colors hover:bg-accent-border disabled:cursor-not-allowed disabled:opacity-50"
              >
                {guardando ? 'Restaurando…' : 'Restaurar al análisis'}
              </button>
            </div>
          ))}
        </div>
      )}

      {listaEliminadas.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-[8px] border border-[#f0d9d6] bg-[#fdf6f5] px-4 py-3">
          <span className="text-12_5 text-[#7d2b23] [text-wrap:pretty]">
            {listaEliminadas.length}{' '}
            {listaEliminadas.length === 1 ? 'amenaza' : 'amenazas'} de baja en la
            parametrización de este activo. La baja es lógica: nada se borra físicamente y
            queda en la bitácora con autor, fecha y motivo.
          </span>
          {listaEliminadas.map(([codigo, motivo]) => (
            <div key={codigo} className="flex flex-wrap items-center gap-2">
              <span className="w-[54px] flex-none font-mono text-11_5 font-semibold text-[#7d2b23]">
                {codigo}
              </span>
              <input
                value={motivo}
                onChange={(e) => onMotivoEliminada(codigo, e.target.value)}
                placeholder="Motivo de la baja — obligatorio…"
                aria-label={`Motivo de la baja de ${codigo}`}
                className="min-w-0 flex-1 rounded-campo border bg-surface px-2.5 py-1.5 text-12 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                style={{
                  borderColor:
                    motivo.trim() === '' ? 'var(--hf-warn-500)' : 'var(--hf-border-field)',
                }}
              />
              <button
                type="button"
                onClick={() => onDeshacerEliminada(codigo)}
                className="flex-none rounded-campo border border-danger-border bg-surface px-3 py-1.5 text-12 font-semibold text-danger-text transition-colors hover:bg-danger-bg"
              >
                Deshacer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/// Recalcular los riesgos DE ESTE ACTIVO, a pedido.
///
/// Las filas de `Riesgo` están guardadas y solo se regeneran cuando una escritura las
/// dispara. El umbral, las escalas y las relevancias de los controles se cambian en otra
/// pantalla y no disparan nada: después de mover una de ellas, lo guardado y la
/// parametrización dicen cosas distintas y nadie se entera hasta que alguien edita el
/// activo por otro motivo. Este botón es la puerta explícita a esa recalculación.
///
/// No pide motivo ni escribe bitácora: no cambia ninguna decisión, recalcula lo derivable.
function BotonRecalcular({ codigoActivo }: { codigoActivo: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  if (codigoActivo === '') return null;

  return (
    <>
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await recalcularRiesgosDelActivo(codigoActivo);
            setAviso({ ok: r.ok, texto: r.mensaje });
            // Las cifras que la ficha tiene en la mano las derivó de lo que el servidor
            // mandó al cargar. Si el recálculo movió algo, sin esto seguirían mostrando lo
            // viejo con cara de recién calculado.
            if (r.ok) router.refresh();
          })
        }
        title="Vuelve a correr el cálculo sobre este activo con la parametrización de hoy — umbral, escalas y eficacias. Solo este activo; el resto del inventario no se toca."
        className="rounded-campo border border-border-field bg-surface px-3 py-[7px] text-12 text-secondary transition-colors hover:bg-app disabled:opacity-40"
      >
        {pendiente ? 'Recalculando…' : 'Recalcular riesgos'}
      </button>
      {aviso && (
        <span
          className="max-w-[58ch] text-11_5 [text-wrap:pretty]"
          style={{ color: aviso.ok ? 'var(--hf-accent-700)' : 'var(--hf-danger-text)' }}
        >
          {aviso.texto}
        </span>
      )}
    </>
  );
}

function RenglonAmenaza({
  f,
  abierta,
  catalogos,
  codigoActivo,
  plan,
  onAbrir,
  onDegradacion,
  onJustificacion,
  onQuitarExcepcion,
  onFrecuencia,
  onJustificacionFrecuencia,
  onMadurez,
  onEfecto,
  onQuitarControl,
  onRestaurarControles,
  onEliminarAmenaza,
  onTratamiento,
}: AccionesAmenazas & {
  f: FilaAmenaza;
  abierta: boolean;
  catalogos: Catalogos;
  codigoActivo: string;
  plan: PlanDeAmenaza | null;
}) {
  const codigo = f.amenaza.codigo;

  // Red row when the INHERENT risk is Alto or Crítico — the two worst bands of
  // umbral_riesgo, read by position so renaming a band does not stop colouring the row.
  const grave = f.bandaRiesgo !== null && f.bandaRiesgo.indice <= 1;
  const fondo = abierta
    ? 'var(--hf-accent-50)'
    : grave
      ? 'var(--hf-row-rojo)'
      : f.preclasificada
        ? 'var(--hf-row-blanco)'
        : '#fbfaf7';

  const impColor = colorDeBandaImpacto(
    f.bandaImpacto?.indice ?? catalogos.bandasImpacto.length - 1,
    catalogos.bandasImpacto.length,
  );
  const rColor = colorRiesgo(f.bandaRiesgo?.indice ?? RAMPA_RIESGO.length - 1);

  return (
    <div className="flex flex-col border-b border-hairline">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onAbrir(codigo)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onAbrir(codigo);
          }
        }}
        aria-expanded={abierta}
        className="grid cursor-pointer items-center text-12 transition-colors hover:bg-accent-50"
        style={{ gridTemplateColumns: COLUMNAS_AMENAZAS, padding: '9px 14px', background: fondo }}
      >
        {/* Colour is never the only carrier of meaning. */}
        <span className="sr-only">
          {grave
            ? 'Renglón rojo — riesgo inherente Alto o Crítico'
            : 'Riesgo inherente por debajo de Alto'}
          {f.preclasificada ? '' : ' · amenaza agregada como excepción'}
        </span>

        <div className="font-mono text-11_5 font-semibold text-accent-500">{codigo}</div>

        <div className="flex min-w-0 flex-col gap-px pr-3">
          <span className="truncate font-medium leading-tight text-primary" title={f.amenaza.nombre}>
            {f.amenaza.nombre}
          </span>
          <span className="truncate font-mono text-9_5 text-label" title={f.amenaza.grupo}>
            {f.amenaza.grupo}
            {f.preclasificada ? '' : ' · excepción'}
          </span>
        </div>

        {DIMS.map((d) => (
          <div key={d} className="px-[3px]" onClick={(e) => e.stopPropagation()}>
            <select
              value={f.degradacionId[d]}
              aria-label={`Degradación en ${NOMBRE_DIM[d]} de ${codigo}`}
              title={
                f.desviada[d]
                  ? 'Excepción: se desvía de la degradación parametrizada de la amenaza. Requiere justificación.'
                  : `Degradación parametrizada de la amenaza en ${NOMBRE_DIM[d]}`
              }
              onChange={(e) => onDegradacion(codigo, d, Number(e.target.value))}
              className="w-full rounded-badge border px-0.5 py-[3px] text-10 text-secondary-soft focus:outline-hidden focus:ring-2 focus:ring-accent-300"
              style={{
                borderColor: f.desviada[d] ? 'var(--hf-warn-500)' : 'var(--hf-border-field)',
                background: f.desviada[d] ? 'var(--hf-warn-100)' : 'var(--hf-bg-surface)',
              }}
            >
              {catalogos.escalaDegradacion.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div className="flex flex-col items-center gap-0.5">
          <span className="cifra text-12_5 text-primary">{cifra(f.impacto)}</span>
          <span
            className="inline-block rounded-badge px-1.5 py-px text-9_5 font-semibold"
            style={{ background: impColor.bg, color: impColor.fg }}
          >
            {f.bandaImpacto?.nombre ?? 'sin banda'}
          </span>
        </div>

        <div className="pr-1.5" onClick={(e) => e.stopPropagation()}>
          <select
            value={f.frecuenciaId}
            aria-label={`Frecuencia esperada de ${codigo}`}
            title={
              f.frecuenciaDesviada
                ? 'Excepción: se desvía de la frecuencia parametrizada de la amenaza'
                : 'Frecuencia parametrizada de la amenaza'
            }
            onChange={(e) => onFrecuencia(codigo, Number(e.target.value))}
            className="w-full rounded-badge border px-1 py-[3px] text-10_5 text-secondary-soft focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            style={{
              borderColor: f.frecuenciaDesviada ? 'var(--hf-warn-500)' : 'var(--hf-border-field)',
              background: f.frecuenciaDesviada ? 'var(--hf-warn-100)' : 'var(--hf-bg-surface)',
            }}
          >
            {catalogos.escalaFrecuencia.map((g) => (
              <option key={g.id} value={g.id}>
                {g.corto} · {cifra(Number(g.vecesAno))}/año
              </option>
            ))}
          </select>
        </div>

        <div className="text-center font-mono text-11 text-secondary">{cifra(f.aro)}</div>

        <div className="flex flex-col items-center gap-0.5">
          <span className="cifra text-12_5 text-primary">{cifra(f.riesgo)}</span>
          <span
            className="inline-block rounded-badge px-1.5 py-px text-9_5 font-semibold"
            style={{ background: rColor.bg, color: rColor.fg }}
          >
            {f.bandaRiesgo?.nombre ?? 'sin banda'}
          </span>
        </div>

        {/* NULL, and it says so. Never 0, never a bare dash: the efficacy of the controls
            that mitigate this threat is unknown, not zero. */}
        <div className="flex flex-col items-center gap-0.5">
          {f.residual === null ? (
            <span
              className="font-mono text-10 text-[var(--hf-text-placeholder)]"
              title="La eficacia de los controles de esta amenaza es desconocida: no hay relevancia asignada. Desconocida no es cero."
            >
              sin calcular
            </span>
          ) : (
            <>
              <span className="cifra text-12_5 text-primary">{cifra(f.residual)}</span>
              <span
                className="inline-block rounded-badge px-1.5 py-px text-9_5 font-semibold"
                style={{
                  background: colorRiesgo(f.bandaResidual?.indice ?? 3).bg,
                  color: colorRiesgo(f.bandaResidual?.indice ?? 3).fg,
                }}
              >
                {f.bandaResidual?.nombre ?? 'sin banda'}
              </span>
            </>
          )}
        </div>

        <div className="text-right">
          <button
            type="button"
            title="Dar de baja esta amenaza en este activo — baja lógica con motivo"
            aria-label={`Dar de baja la amenaza ${codigo}`}
            onClick={(e) => {
              e.stopPropagation();
              onEliminarAmenaza(codigo);
            }}
            className="h-6 w-6 rounded-[5px] border border-danger-border bg-surface text-13 leading-none text-danger-text transition-colors hover:bg-danger-bg"
          >
            ×
          </button>
        </div>
      </div>

      {/* Iteración 3: el clic en la fila abre el FORMULARIO de la amenaza (degradaciones,
          frecuencia, excepciones, controles, riesgo residual y tratamiento) en un dialogo
          superpuesto, no un detalle estirado en la tabla. */}
      {abierta && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 md:items-center"
          onClick={() => onAbrir(codigo)}
        >
          <div
            className="max-h-[85vh] w-full overflow-auto rounded-tarjeta border border-border-default bg-surface shadow-lg"
            style={{ maxWidth: ANCHO_DIALOGO_AMENAZA }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Formulario de la amenaza ${codigo}`}
          >
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline bg-surface px-4 py-2.5">
              <p className="min-w-0 flex-1 truncate font-mono text-11 text-secondary">
                {codigo} — amenaza del activo · {f.amenaza.nombre}
              </p>

              {/* El RESULTADO, arriba y fijo. Es la conclusión de todo lo que el diálogo
                  explica, y estaba solo al final: había que recorrer los controles enteros
                  para leer el número por el que se abrió la amenaza. */}
              <span className="flex flex-none items-baseline gap-1.5 rounded-campo border border-border-default bg-subtle px-2.5 py-1">
                <span className="font-mono text-9 tracking-[0.07em] text-label">RESIDUAL</span>
                {f.residual === null ? (
                  <span
                    className="text-11_5 font-semibold text-warn-text"
                    title="Sin eficacia no hay residual. Desconocido no es cero."
                  >
                    sin calcular
                  </span>
                ) : (
                  <>
                    <span className="cifra text-15 text-primary">{cifra(f.residual)}</span>
                    <span
                      className="rounded-badge px-1.5 py-px text-9_5 font-bold"
                      style={{
                        background: colorRiesgo(f.bandaResidual?.indice ?? 3).bg,
                        color: colorRiesgo(f.bandaResidual?.indice ?? 3).fg,
                      }}
                    >
                      {f.bandaResidual?.nombre ?? 'sin banda'}
                    </span>
                  </>
                )}
              </span>

              <button
                onClick={() => onAbrir(codigo)}
                className="flex-none rounded-campo border border-border-field px-3 py-1.5 font-mono text-11 text-muted hover:bg-subtle"
              >
                ✕ Cerrar
              </button>
            </div>
            <div className="px-4 py-3.5">
              <DetalleAmenaza
                f={f}
                catalogos={catalogos}
                codigoActivo={codigoActivo}
                plan={plan}
                onJustificacion={onJustificacion}
                onQuitarExcepcion={onQuitarExcepcion}
                onJustificacionFrecuencia={onJustificacionFrecuencia}
                onMadurez={onMadurez}
                onEfecto={onEfecto}
                onQuitarControl={onQuitarControl}
                onRestaurarControles={onRestaurarControles}
                onTratamiento={onTratamiento}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetalleAmenaza({
  f,
  catalogos,
  codigoActivo,
  plan,
  onJustificacion,
  onQuitarExcepcion,
  onJustificacionFrecuencia,
  onMadurez,
  onEfecto,
  onQuitarControl,
  onRestaurarControles,
  onTratamiento,
}: {
  f: FilaAmenaza;
  catalogos: Catalogos;
  codigoActivo: string;
  /// El plan activo que ya cubre este riesgo, o `null` si no hay ninguno.
  plan: PlanDeAmenaza | null;
  onJustificacion: (codigo: string, dim: Dim, justificacion: string) => void;
  onQuitarExcepcion: (codigo: string, dim: Dim) => void;
  onJustificacionFrecuencia: (codigo: string, justificacion: string) => void;
  onMadurez: (clave: string, nivel: number) => void;
  onEfecto: (clave: string, efecto: EfectoControl) => void;
  onQuitarControl: (clave: string) => void;
  onRestaurarControles: (codigo: string) => void;
  onTratamiento: (codigo: string, cambio: Tratamiento) => void;
}) {
  const codigo = f.amenaza.codigo;
  const tratamiento = f.tratamiento;
  const router = useRouter();
  const [creandoPlan, setCreandoPlan] = useState(false);
  const cmm = semaforo(f.madurezGrupo === null ? null : Math.round(f.madurezGrupo));
  // A stored exception shows so its reason is readable; a PENDING one shows because it is
  // the one the save has to justify — including the return to inheritance, which deviates
  // from nothing and still needs a reason.
  const excepciones = DIMS.filter((d) => f.desviada[d] || f.degradacionPendiente[d]);

  // The treatment suggested by the residual band, overridable. With the residual
  // uncalculated there is no band to suggest from, and the sheet says that instead of
  // guessing "Aceptar".
  const bandaParaSugerir = f.bandaResidual;
  const sugerido =
    bandaParaSugerir === null
      ? null
      : bandaParaSugerir.indice <= 1
        ? 'Mitigar'
        : 'Aceptar y monitorear';
  const idSugerido = catalogos.tratamientos.find((t) => t.nombre === sugerido)?.id ?? null;

  const PLAZOS = [
    'Plan a 15 días · ejecución 3 meses',
    'Plan a 30 días · ejecución 6 meses',
    'Plan a 60 días · ejecución 12 meses',
    'Sin plan · revisión anual',
  ];
  const plazo =
    bandaParaSugerir === null
      ? 'El plazo se deriva del nivel residual, todavía sin calcular.'
      : PLAZOS[Math.min(bandaParaSugerir.indice, PLAZOS.length - 1)];

  return (
    // Sin el sangrado de 76px ni el fondo de banda: los dos venían de cuando este detalle
    // se estiraba DENTRO de la tabla y tenía que alinearse con sus columnas. En un diálogo
    // esa sangría es un cuarto del ancho regalado, y el contenedor ya pone el margen.
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-start gap-3.5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="etiqueta-campo text-9">
            APLICACIÓN EN EL ESCENARIO DE CUÁNTICO · {f.zona}
          </span>
          <span className="text-12_5 leading-relaxed text-secondary [text-wrap:pretty]">
            {f.amenaza.nota ?? 'Sin nota de aplicación registrada para esta amenaza.'}
          </span>
        </div>

        {/* Group maturity, coloured with the CMM traffic light. The level shown is the
            average of the group; the EFFICACY beside it is the weighted mean capped by
            the principal control (MET-SIG-01 §7.4), which is the figure that actually
            drives the residual — the two are not the same number and neither is dropped. */}
        <div
          className="flex min-w-0 flex-col gap-1 rounded-[8px] border px-3 py-2.5"
          style={{ background: cmm.bg, borderColor: cmm.bd }}
        >
          <span className="font-mono text-9 tracking-[0.07em]" style={{ color: cmm.fg }}>
            MADUREZ DEL GRUPO DE CONTROLES · PROMEDIO
          </span>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="cifra text-19" style={{ color: cmm.fg }}>
              {f.madurezGrupo === null ? 'sin evaluar' : nivelTexto(Math.round(f.madurezGrupo))}
            </span>
            <span className="font-mono text-12 text-muted">
              {f.controles.length === 0
                ? 'ningún control asociado a esta amenaza'
                : `promedio ${nivelTexto(f.madurezGrupo).replace('L', '')} de ${f.controles.length} controles`}
            </span>
          </div>
          {f.eficacia === null ? (
            <span className="text-12 text-muted [text-wrap:pretty]">
              Eficacia <strong>sin calcular</strong>: no hay controles con relevancia
              asignada a esta amenaza, así que la eficacia es desconocida y no cero. Sin
              eficacia no hay frecuencia residual ni riesgo residual.
            </span>
          ) : (
            <span className="text-12 text-muted [text-wrap:pretty]">
              Eficacia {porcentaje(f.eficacia)} → frecuencia residual{' '}
              {cifra(f.frecuenciaResidual ?? 0)} veces/año. La eficacia es la media
              ponderada por relevancia con techo en el control principal, no la del nivel
              promedio.
              {f.ecuacion.desgloseEficacia?.sinRelevanciaAsignada && (
                <>
                  {' '}
                  <strong className="text-warn-text">Sin relevancia asignada</strong>: hoy es
                  media simple y el techo del principal no opera.
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {/* P7 (D3, REQ-SIG-20 tarea 2.4) · la aritmética en vivo, al lado del dato que la
          produce — no en un tooltip. Cada operando cambia con el combo antes de guardar
          (spec risk-equation-traceability, "Live arithmetic beside the data"), y viene del
          MISMO `f.ecuacion` que ya resolvió el paso 5 arriba y el residual más abajo: no
          hay una segunda cuenta acá. */}
      <div className="flex flex-col gap-1 rounded-[8px] border border-border-default bg-surface px-3 py-2.5">
        <span className="etiqueta-campo text-9">ARITMÉTICA — MET-SIG-01 §7</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-11_5 text-secondary">
          {f.ecuacion.impactosPorDimension.map((p) => (
            <span key={p.dimension}>
              {p.dimension}: ({p.valor} × {p.degradacion.toString()}) = {cifra(p.impacto.toNumber())}
            </span>
          ))}
          <span>impacto = max(…) = {cifra(f.ecuacion.impacto.toNumber())}</span>
          <span>
            frecuencia = {cifra(f.aro)}/año → inherente = {cifra(f.ecuacion.inherente.toNumber())}
          </span>
        </div>
      </div>

      {/* A per-risk degradation change is an EXCEPTION to the methodology: the limiting
          effect belongs to the THREAT. `riesgo_degradacion.justificacion` is NOT NULL,
          so the reason is asked for here and the save is blocked until it is written. */}
      {excepciones.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-[8px] border border-warn-border bg-warn-100 px-3.5 py-3">
          <span className="font-mono text-9 tracking-[0.07em] text-warn-text">
            EXCEPCIÓN DE DEGRADACIÓN · REQUIERE JUSTIFICACIÓN
          </span>
          <p className="text-11_5 leading-snug text-warn-text [text-wrap:pretty]">
            La degradación es un atributo de la amenaza (MET-SIG-01 §7.4): los controles
            que limitan el daño se reflejan bajando la degradación de la amenaza, no la de
            un riesgo. Cambiarla en este riesgo se registra como excepción con autor,
            fecha y motivo.
          </p>
          {excepciones.map((d) => {
            const vuelve = f.degradacionPendiente[d] && f.objetivoDegradacion[d] === null;
            const falta = f.degradacionPendiente[d] && f.justificacion[d].trim() === '';
            return (
              <div key={d} className="flex flex-wrap items-center gap-2">
                <span className="w-[104px] flex-none font-mono text-10_5 text-warn-text">
                  {NOMBRE_DIM[d]}
                  {vuelve ? ' · vuelve' : ''}
                </span>
                <input
                  value={f.justificacion[d]}
                  onChange={(e) => onJustificacion(codigo, d, e.target.value)}
                  placeholder={
                    vuelve
                      ? 'Por qué este riesgo vuelve a heredar la degradación de la amenaza…'
                      : 'Por qué esta amenaza degrada distinto en este activo…'
                  }
                  aria-label={`Justificación de la excepción en ${NOMBRE_DIM[d]}`}
                  className="min-w-0 flex-1 rounded-campo border bg-surface px-2.5 py-1.5 text-12 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                  style={{
                    borderColor: falta ? 'var(--hf-warn-500)' : 'var(--hf-border-field)',
                  }}
                />
                {!vuelve && (
                  <button
                    type="button"
                    onClick={() => onQuitarExcepcion(codigo, d)}
                    className="flex-none rounded-campo border border-warn-border bg-surface px-3 py-1.5 text-11_5 font-semibold text-warn-text transition-colors hover:bg-[#ffe9d2]"
                  >
                    Volver a la parametrización
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* The frequency is an attribute of the THREAT: one judgement per threat is what
          keeps the same amenaza from carrying two different AROs on two assets for no
          written reason. So a row here is an exception too, and `excepcionFrecuencia`
          refuses it without a justification — clearing it included. */}
      {(f.frecuenciaPendiente || f.frecuenciaDesviada) && (
        <div className="flex flex-col gap-2.5 rounded-[8px] border border-warn-border bg-warn-100 px-3.5 py-3">
          <span className="font-mono text-9 tracking-[0.07em] text-warn-text">
            {f.frecuenciaPendiente && f.objetivoFrecuencia === null
              ? 'VUELVE A LA FRECUENCIA DE LA AMENAZA · REQUIERE JUSTIFICACIÓN'
              : 'EXCEPCIÓN DE FRECUENCIA · REQUIERE JUSTIFICACIÓN'}
          </span>
          <p className="text-11_5 leading-snug text-warn-text [text-wrap:pretty]">
            La frecuencia esperada se parametriza en la amenaza {f.amenaza.codigo}: un solo
            juicio por amenaza es lo que evita que la misma tenga dos ARO distintos en dos
            activos sin razón escrita. Cambiarla sobre este riesgo queda en la bitácora con
            autor, fecha y motivo.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-[104px] flex-none font-mono text-10_5 text-warn-text">
              {cifra(f.aro)}/año
            </span>
            <input
              value={f.justificacionFrecuencia}
              onChange={(e) => onJustificacionFrecuencia(codigo, e.target.value)}
              placeholder={
                f.objetivoFrecuencia === null
                  ? 'Por qué este riesgo vuelve a heredar la frecuencia de la amenaza…'
                  : 'Por qué esta amenaza ocurre con otra frecuencia en este activo…'
              }
              aria-label={`Justificación de la excepción de frecuencia de ${codigo}`}
              className="min-w-0 flex-1 rounded-campo border bg-surface px-2.5 py-1.5 text-12 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
              style={{
                borderColor:
                  f.frecuenciaPendiente && f.justificacionFrecuencia.trim() === ''
                    ? 'var(--hf-warn-500)'
                    : 'var(--hf-border-field)',
              }}
            />
          </div>
        </div>
      )}

      <GrillaControles
        f={f}
        catalogos={catalogos}
        onMadurez={onMadurez}
        onEfecto={onEfecto}
        onQuitarControl={onQuitarControl}
        onRestaurarControles={onRestaurarControles}
      />

      <div
        className="flex flex-col gap-2 rounded-[8px] border border-border-default bg-surface px-3.5 py-3"
        style={{
          borderLeftWidth: 3,
          borderLeftColor:
            f.bandaResidual === null
              ? 'var(--hf-border-field)'
              : colorRiesgo(f.bandaResidual.indice).bg,
        }}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <span className="text-13 font-bold text-primary">Riesgo residual y tratamiento</span>

          {/* REQ-SIG-20 §7 · el plan, desde acá. Decidir el tratamiento y registrar el plan
              que lo ejecuta eran dos pantallas distintas, y la segunda había que ir a
              buscarla. El plan sigue siendo sobre el CONTROL y sigue viviendo en /sgsi/
              planes: esto es la puerta, no una lista propia. */}
          <PlanDelRiesgo
            plan={plan}
            onCrear={() => setCreandoPlan(true)}
            habilitado={codigoActivo !== ''}
            // Mismo criterio que usa el servidor para abrir el popup solo (`riesgos.ts`,
            // `BANDA_CRITICA`): por NOMBRE de banda, no por posición, para que renombrar o
            // reordenar las bandas no mueva en silencio quién puede registrar un plan.
            esCritico={f.bandaResidual?.nombre === 'Crítico'}
          />

          <span className="min-w-0 flex-1 text-11_5 text-muted [text-wrap:pretty]">
            El tratamiento sugerido se deriva del nivel residual y puede sobrescribirse con
            justificación en observaciones.
          </span>
        </div>

        {creandoPlan && codigoActivo !== '' && (
          <PopupPlanCritico
            activoCodigo={codigoActivo}
            amenazaCodigo={codigo}
            onCerrar={() => setCreandoPlan(false)}
            // El plan recién creado no está en `activo.planes`: esa lista la armó el
            // servidor al cargar la ficha. `refresh()` la vuelve a pedir y el botón pasa
            // solo de «Crear» a «Ver».
            onRegistrado={() => {
              setCreandoPlan(false);
              router.refresh();
            }}
          />
        )}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-start gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="etiqueta-campo text-9">RIESGO RESIDUAL</span>
            {f.residual === null ? (
              <>
                <span className="cifra text-19 text-warn-text">Sin calcular</span>
                <span className="text-11 text-faint [text-wrap:pretty]">
                  Desconocido, no cero: sin eficacia no hay residual. Inherente{' '}
                  {cifra(f.riesgo)} · {f.bandaRiesgo?.nombre ?? 'sin banda'}.
                </span>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2.5">
                  <span className="cifra text-24 text-primary">{cifra(f.residual)}</span>
                  <span
                    className="inline-block rounded-badge px-2 py-0.5 text-11 font-bold"
                    style={{
                      background: colorRiesgo(f.bandaResidual?.indice ?? 3).bg,
                      color: colorRiesgo(f.bandaResidual?.indice ?? 3).fg,
                    }}
                  >
                    {f.bandaResidual?.nombre}
                  </span>
                </div>
                <span className="text-11 text-faint">
                  inherente {cifra(f.riesgo)} · {f.bandaRiesgo?.nombre ?? 'sin banda'}
                </span>
                <span className="font-mono text-10_5 text-faint">
                  residual = impacto × (ARO × (1 − e)) = {cifra(f.impacto)} × (
                  {cifra(f.aro)} × (1 − {porcentaje(f.eficacia ?? 0)})) = {cifra(f.residual)}
                </span>
              </>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="etiqueta-campo text-9">TRATAMIENTO</span>
            <select
              value={String(tratamiento.tratamientoId ?? idSugerido ?? '')}
              aria-label={`Tratamiento del riesgo de ${codigo}`}
              onChange={(e) =>
                onTratamiento(codigo, {
                  tratamientoId: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              className="w-full rounded-campo border border-border-field bg-subtle px-2.5 py-[7px] text-12_5 font-medium text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            >
              <option value="">— sin decidir —</option>
              {catalogos.tratamientos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
            <span
              className="text-11 [text-wrap:pretty]"
              style={{
                color: f.sobrescribeTratamiento ? 'var(--hf-warn-text)' : 'var(--hf-text-faint)',
              }}
            >
              {f.sobrescribeTratamiento
                ? sugerido === null
                  ? 'Sobrescrito: sin nivel residual calculado no hay sugerencia que respalde la decisión. Requiere justificación en observaciones.'
                  : `Sobrescrito: se aparta de «${sugerido}». Requiere justificación en observaciones.`
                : sugerido === null
                  ? 'Sin sugerencia: el nivel residual todavía no está calculado.'
                  : `Sugerido por el nivel residual ${bandaParaSugerir?.nombre}.`}
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="etiqueta-campo text-9">RESPONSABLE</span>
            <select
              value={String(tratamiento.responsableId ?? '')}
              aria-label={`Responsable del tratamiento de ${codigo}`}
              onChange={(e) =>
                onTratamiento(codigo, {
                  responsableId: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              className="w-full rounded-campo border border-border-field bg-subtle px-2.5 py-[7px] text-12_5 font-medium text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            >
              <option value="">— hereda el propietario del activo —</option>
              {catalogos.cargos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <span className="text-11 text-faint">{plazo}</span>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="etiqueta-campo text-9">ESTADO</span>
            <select
              value={String(tratamiento.estadoId ?? '')}
              aria-label={`Estado del tratamiento de ${codigo}`}
              onChange={(e) =>
                onTratamiento(codigo, {
                  estadoId: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              className="w-full rounded-campo border border-border-field bg-subtle px-2.5 py-[7px] text-12_5 font-medium text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            >
              <option value="">— sin iniciar registro —</option>
              {catalogos.estados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
            <span className="text-11 text-faint">
              Registrar el tratamiento saca el riesgo de «altos sin tratamiento».
            </span>
          </div>
        </div>

        {/* `guardarTratamiento` reads any stored treatment as an override while the
            residual is uncalculated, and refuses it without text here. The requirement is
            shown on the field so it is read before Save, not after a rejection. */}
        <div className="flex flex-col gap-1.5">
          <span className="etiqueta-campo text-9">
            OBSERVACIONES
            {f.sobrescribeTratamiento && (
              <span className="ml-1.5 text-warn-text">· OBLIGATORIAS</span>
            )}
          </span>
          <textarea
            value={tratamiento.observacion ?? ''}
            rows={2}
            aria-label={`Observaciones del tratamiento de ${codigo}`}
            aria-required={f.sobrescribeTratamiento}
            aria-invalid={f.faltaObservacion}
            onChange={(e) => onTratamiento(codigo, { observacion: e.target.value })}
            placeholder={
              f.sobrescribeTratamiento
                ? 'Por qué se toma esta decisión de tratamiento — obligatorio…'
                : 'Justificación de la decisión, dependencias, fecha comprometida…'
            }
            className="w-full resize-y rounded-campo border bg-subtle px-2.5 py-2 text-12_5 leading-relaxed text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
            style={{
              borderColor: f.faltaObservacion ? 'var(--hf-warn-500)' : 'var(--hf-border-field)',
            }}
          />
          {f.faltaObservacion && (
            <span className="text-11 leading-snug text-warn-text [text-wrap:pretty]">
              El riesgo residual de {codigo} está sin calcular, así que ninguna sugerencia
              respalda esta decisión y se guarda como sobrescritura. Sin este texto,
              guardarTratamiento la rechaza.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/// REQ-SIG-20 §7.2 · la puerta al plan de tratamiento de ESTE riesgo, en sus dos estados.
///
/// Con plan, un enlace al plan concreto —`/sgsi/planes#PT-001`— y no a la lista entera: el
/// plan es del CONTROL y vive allá, así que esto lleva hasta él en vez de duplicarlo acá.
/// Sin plan, el botón que abre el mismo popup que el guardado de un residual crítico dispara
/// solo. Decidir «Mitigar» y no tener dónde registrar con qué, era el salto que faltaba.
///
/// ── SE PUEDE PLANIFICAR SOBRE CUALQUIER BANDA ───────────────────────────────────────────
///
/// Antes sólo se ofrecía sobre residual Crítico: REQ-SIG-20 §7 lo pide desde ahí, y abrirlo a
/// todo parecía convertir el plan en un campo más en vez de una respuesta a algo.
///
/// La realidad desmintió el razonamiento. Con las 272 relevancias control–amenaza todavía sin
/// asignar, la eficacia se agrega como media simple y TODOS los residuales salen reducidos:
/// 0 en banda Crítico, 0 en Alto. Con la puerta puesta, no había un solo riesgo en toda la
/// organización desde el cual registrar un plan — y en particular era imposible registrar una
/// ACEPTACIÓN formal, que es lo que el informe de valoración necesita para tener qué mostrar.
/// La puerta no estaba protegiendo el rigor del registro; estaba impidiendo que existiera.
///
/// El énfasis se conserva: en Crítico el botón es sólido y dice que el riesgo EXIGE plan; en
/// las demás bandas es discreto y dice que se puede. La diferencia entre «hay que» y «se
/// puede» la sigue marcando la pantalla, que es donde corresponde — no una restricción que
/// deja a la organización sin manera de decidir.
function PlanDelRiesgo({
  plan,
  onCrear,
  habilitado,
  esCritico,
}: {
  plan: PlanDeAmenaza | null;
  onCrear: () => void;
  /// En modo creación todavía no hay activo con código, y sin él no hay riesgo que cubrir.
  habilitado: boolean;
  /// El residual está en banda Crítico. Ya no decide SI se ofrece el botón, sino con cuánto
  /// énfasis: es la banda que obliga a planificar, y eso se dice, no se impone escondiendo la
  /// opción.
  esCritico: boolean;
}) {
  if (plan !== null) {
    return (
      <Link
        href={`/sgsi/planes#${plan.codigo}`}
        title={`${plan.accion} · estado ${plan.estado.toLowerCase().replace(/_/g, ' ')}`}
        className="flex-none rounded-campo border border-accent-500 bg-accent-100 px-2.5 py-1 text-11_5 font-semibold text-accent-700 transition-colors hover:bg-accent-border"
      >
        Ver plan {plan.codigo} →
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onCrear}
      disabled={!habilitado}
      title={
        !habilitado
          ? 'El activo todavía no existe: no hay riesgo al que asociarle un plan.'
          : esCritico
            ? 'Este residual está en banda Crítico: exige plan. Se registra sobre el control que más mueve el riesgo.'
            : 'Registra un plan sobre este riesgo — mitigar, aceptar, transferir o evitar. Este residual no lo exige, pero la decisión se puede dejar escrita.'
      }
      className={
        esCritico
          ? 'flex-none rounded-campo border border-accent-500 bg-accent-100 px-2.5 py-1 text-11_5 font-semibold text-accent-700 transition-colors hover:bg-accent-border disabled:opacity-40'
          : 'flex-none rounded-campo border border-dashed border-accent-border bg-transparent px-2.5 py-1 text-11_5 font-medium text-secondary-soft transition-colors hover:bg-accent-50 hover:text-accent-700 disabled:opacity-40'
      }
    >
      {esCritico ? '+ Crear plan de acción' : '+ Plan de tratamiento'}
    </button>
  );
}

/// Un bloque de la tabla: una clase de relevancia, o la bolsa de los que nadie clasificó.
/// `clase` en null NO es una cuarta clase — es la ausencia de decisión, y por eso no lleva
/// presupuesto ni entra al reparto.
interface GrupoControles {
  clase: ClaseRelevancia | null;
  controles: ControlEnFila[];
}

/// Reparte los controles en sus clases, EN ORDEN DE PRESUPUESTO: primero el que manda.
///
/// El orden no es cosmético. La pregunta que trae a alguien a esta tabla es «¿por qué la
/// eficacia dio esto?», y la respuesta casi siempre es el principal: su nivel pone el techo,
/// así que es el único cuya insuficiencia es una brecha. En una tira plana ordenada por
/// código ISO, ese control aparecía en cualquier parte.
///
/// Los sin clasificar van al final y aparte. Meterlos en una clase les inventaría un peso;
/// dejarlos fuera de la tabla los escondería, y siguen contando en la media plana v2.
function agruparPorRelevancia(controles: ControlEnFila[]): GrupoControles[] {
  const grupos: GrupoControles[] = CLASES_RELEVANCIA.map((clase) => ({
    clase,
    controles: controles.filter(
      (c) => c.relevancia !== null && claseDeControl(c) === clase,
    ),
  }));
  const sinClasificar = controles.filter((c) => c.relevancia === null);
  if (sinClasificar.length > 0) grupos.push({ clase: null, controles: sinClasificar });
  return grupos.filter((g) => g.controles.length > 0);
}

/// La cabecera de un grupo: cuánto presupuesto tiene esa clase y qué aportó de verdad.
///
/// El presupuesto NOMINAL (70/20/10) se muestra siempre, porque es la regla. El
/// renormalizado sólo cuando difiere — pasa cuando una clase no tiene controles y su
/// presupuesto se reparte entre las presentes (70/20 → 77.8/22.2). Decir sólo el
/// renormalizado escondería la regla; decir sólo el nominal mentiría sobre la cuenta.
function CabeceraGrupo({ clase, cuantos, aporte }: {
  clase: ClaseRelevancia | null;
  cuantos: number;
  aporte: AporteClase | null;
}) {
  if (clase === null) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-hairline bg-subtle px-3 py-1.5">
        <span
          aria-hidden
          className="h-2.5 w-2.5 flex-none self-center rounded-[2px] border border-dashed border-border-field"
        />
        <span className="font-mono text-9_5 tracking-[0.06em] text-label">SIN CLASIFICAR</span>
        <span className="text-10_5 text-faint [text-wrap:pretty]">
          {cuantos === 1 ? 'Este control no tiene' : `Estos ${cuantos} controles no tienen`}{' '}
          relevancia asignada, así que no entran al reparto por clase. Se asigna en «Asociar
          controles».
        </span>
      </div>
    );
  }

  const catalogo = catalogoDeClase(clase);
  const renormalizado =
    aporte !== null && Math.abs(aporte.presupuesto - aporte.presupuestoNominal) > 1e-9;

  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-hairline bg-subtle px-3 py-1.5">
      <span
        aria-hidden
        className="h-2.5 w-2.5 flex-none self-center rounded-[2px]"
        style={{ backgroundColor: TONO_CLASE[clase] }}
      />
      <span className="font-mono text-9_5 tracking-[0.06em] text-primary">
        {rotuloClase(clase)}
      </span>
      <span className="font-mono text-9_5 text-muted">
        {porcentaje(catalogo.presupuesto)}
        {renormalizado && ` → ${porcentaje(aporte!.presupuesto)} sin las clases vacías`}
        {' · '}
        {cuantos} {cuantos === 1 ? 'control' : 'controles'}
        {aporte !== null && ` · media ${porcentaje(aporte.media)}`}
      </span>
      {aporte !== null && (
        <span className="ml-auto font-mono text-10 text-primary">
          aporta {(aporte.aporte * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} pp
        </span>
      )}
      <p className="w-full text-10_5 text-faint [text-wrap:pretty]">
        {catalogo.criterio}
        {clase === 'principal' && ' Su nivel es el techo de la eficacia de la amenaza.'}
      </p>
    </div>
  );
}

/// The controls that mitigate the threat. The two highlighted columns are the ones that
/// move the calculation: the MATURITY of each control feeds the group's average and the
/// threat's efficacy, and the EFFECT says whether that efficacy lowers the frequency or
/// the degradation.
function GrillaControles({
  f,
  catalogos,
  onMadurez,
  onEfecto,
  onQuitarControl,
  onRestaurarControles,
}: {
  f: FilaAmenaza;
  catalogos: Catalogos;
  onMadurez: (clave: string, nivel: number) => void;
  onEfecto: (clave: string, efecto: EfectoControl) => void;
  onQuitarControl: (clave: string) => void;
  onRestaurarControles: (codigo: string) => void;
}) {
  const codigo = f.amenaza.codigo;
  const delCatalogo = f.amenaza.controles.length;
  const quitados = delCatalogo - f.controles.length;
  const [administrando, setAdministrando] = useState<{ codigo: string; nombre: string } | null>(
    null,
  );

  // CERO ARITMÉTICA PROPIA. La media de cada clase y lo que aporta ya vienen resueltas en
  // `desglosarEficaciaAmenaza`; acá sólo se indexan por clase para colgarlas del encabezado.
  // Recalcularlas sería una segunda aritmética que podría discrepar de la que escribe el
  // residual — que es exactamente la forma de los bugs que HARNESS.md documenta.
  //
  // El mapa viene vacío cuando la amenaza se agrega con la regla v2 (sin principal
  // designado): ahí no hay reparto por clase que mostrar y los encabezados salen sin media
  // ni aporte, sólo con su presupuesto nominal.
  const aportePorClase = new Map<string, AporteClase>(
    (f.ecuacion.desgloseEficacia?.agregacion.clases ?? []).map((a) => [a.clase, a]),
  );

  return (
    <div className="flex flex-col gap-2">
      {administrando && (
        <PopupControlesAmenaza
          codigoAmenaza={administrando.codigo}
          nombreAmenaza={administrando.nombre}
          onCerrar={() => setAdministrando(null)}
        />
      )}
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-13 font-bold text-primary">Controles implementados</span>
        <span className="text-11_5 text-muted [text-wrap:pretty]">
          Las dos columnas destacadas son las que mueven el cálculo: la{' '}
          <strong>madurez</strong> de cada control alimenta el promedio del grupo y la
          eficacia de la amenaza, y el <strong>efecto</strong> dice si esa eficacia baja la
          frecuencia o la degradación.
        </span>
      </div>

      <div className="tabla-ancha rounded-[8px] border border-border-default bg-surface">
        <div style={{ minWidth: ANCHO_MINIMO_CONTROLES }} className="flex flex-col">
          <div
            className="grid border-b border-border-default bg-subtle font-mono text-8_5 tracking-[0.05em] text-faint"
            style={{ gridTemplateColumns: COLUMNAS_CONTROLES, padding: '8px 12px' }}
          >
            <div>CÓDIGO</div>
            <div>CONTROL ISO 27001:2022</div>
            <div className="text-accent-700">◆ MADUREZ DEL CONTROL (CMM)</div>
            <div className="text-accent-700">◆ EFECTO SOBRE EL RIESGO</div>
            <div>EVIDENCIA</div>
            <div />
          </div>

          {agruparPorRelevancia(f.controles).map((grupo) => (
            <div
              key={grupo.clase ?? 'sin-clasificar'}
              role="group"
              aria-label={
                grupo.clase === null
                  ? `Sin clasificar · ${grupo.controles.length} controles de ${codigo}`
                  : `${catalogoDeClase(grupo.clase).nombre} · ${porcentaje(catalogoDeClase(grupo.clase).presupuesto)} de la eficacia de ${codigo}`
              }
            >
              <CabeceraGrupo
                clase={grupo.clase}
                cuantos={grupo.controles.length}
                aporte={aportePorClase.get(grupo.clase ?? '') ?? null}
              />
              {grupo.controles.map((c) => {
            const clave = `${codigo}·${c.codigo}`;
            const color = semaforo(c.nivel);
            return (
              <div
                key={c.codigo}
                className="grid items-center border-b border-hairline-faint text-12"
                style={{ gridTemplateColumns: COLUMNAS_CONTROLES, padding: '7px 12px' }}
              >
                <div className="font-mono text-11 font-semibold text-accent-500">{c.codigo}</div>
                <div className="pr-3.5 leading-snug text-primary" title={c.nombre}>
                  {/* La relevancia ya no va acá: la dice el grupo. Lo que sí queda es el
                      `no aplica` del SOA, que es lo único de la fila que la saca del
                      cálculo y que el encabezado del grupo no puede decir. */}
                  {c.nombre}
                  {c.soa === 'no' && (
                    <span className="ml-1.5 font-mono text-9_5 text-label">· no aplica</span>
                  )}
                </div>
                <div className="pr-3">
                  <select
                    value={c.nivel === null ? '' : String(c.nivel)}
                    aria-label={`Madurez CMM de ${c.codigo}`}
                    onChange={(e) => onMadurez(clave, Number(e.target.value))}
                    className="w-full rounded-[5px] border px-[7px] py-[5px] text-11_5 font-semibold focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                    style={{ borderColor: color.bd, background: color.bg, color: color.fg }}
                  >
                    {c.nivel === null && <option value="">sin evaluar</option>}
                    {catalogos.escalaMadurez.map((m) => (
                      <option key={m.id} value={m.nivel}>
                        L{m.nivel} — {m.nombre} · {porcentaje(Number(m.eficacia))}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pr-3">
                  <select
                    value={c.efecto}
                    aria-label={`Efecto de ${c.codigo} sobre el riesgo`}
                    title="El modelo solo cuantifica el efecto preventivo: la eficacia reduce la frecuencia. Un control que limita el daño se refleja bajando la degradación de la amenaza."
                    onChange={(e) => onEfecto(clave, e.target.value as EfectoControl)}
                    className="w-full rounded-[5px] border border-accent-border bg-accent-50 px-[7px] py-[5px] text-11_5 font-medium text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
                  >
                    <option value="Previene">Previene · reduce la frecuencia</option>
                    <option value="Limita">Limita el daño · reduce la degradación</option>
                  </select>
                </div>
                <div className="truncate text-11 text-faint" title={c.evidencia}>
                  {c.evidencia === '' ? 'sin evidencia' : c.evidencia}
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    title="Quitar el control del grupo de esta amenaza"
                    aria-label={`Quitar ${c.codigo} del grupo de ${codigo}`}
                    onClick={() => onQuitarControl(clave)}
                    className="h-[22px] w-[22px] rounded-[5px] border border-danger-border bg-surface text-12 leading-none text-danger-text transition-colors hover:bg-danger-bg"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
              })}
            </div>
          ))}

          {f.controles.length === 0 && (
            <p className="px-3 py-4 text-11_5 text-muted [text-wrap:pretty]">
              {delCatalogo === 0
                ? 'Esta amenaza no tiene ningún control asociado en `control_amenaza`, así que su eficacia es desconocida y el riesgo residual figura como «sin calcular». Escribir cero acá dejaría la matriz residual idéntica a la inherente.'
                : 'Todos los controles del grupo se quitaron en esta sesión. Restaurar la parametrización los devuelve.'}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 px-3 py-2">
            {/* Two different buttons on purpose, because they do two different things.
                «Restaurar» undoes what THIS SESSION removed from this asset's preview and
                touches nothing stored. «Asociar controles» opens the parameterisation of the
                pair itself — global, persisted, recalculating every residual risk of the
                threat. It used to be a link to /sgsi/controles because the pair could not be
                created without a relevance decision; `relevanciaId` is nullable now. */}
            {quitados > 0 && (
              <button
                type="button"
                onClick={() => onRestaurarControles(codigo)}
                className="rounded-campo border border-dashed border-accent-border bg-accent-50 px-2.5 py-1.5 text-11_5 font-semibold text-accent-700 transition-colors hover:bg-accent-100"
              >
                Restaurar {quitados} {quitados === 1 ? 'control quitado' : 'controles quitados'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setAdministrando({ codigo, nombre: f.amenaza.nombre })}
              className="rounded-campo border border-dashed border-accent-border bg-accent-50 px-2.5 py-1.5 text-11_5 font-semibold text-accent-700 transition-colors hover:bg-accent-100"
            >
              + Asociar controles a {codigo}
            </button>
            <span className="text-11 text-label [text-wrap:pretty]">
              {f.controles.length} de {delCatalogo} controles del catálogo asociados a esta
              amenaza. Asociar o quitar un control cambia la eficacia de la amenaza y con ella
              el riesgo residual de <strong>todos</strong> los activos que la tienen: es una
              decisión de parametrización, no de este activo.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Tab 3 · Resumen
// ===========================================================================

/// P8 (D3, REQ-SIG-20 tarea 2.3) · una amenaza a la vez, de solo lectura. La edición sigue
/// viviendo en Amenazas — acá se entiende el número que esa pestaña ya mostró, nunca se
/// cambia nada, y no hay ninguna escritura: ni una fila de bitácora por visitarla.
function TabEcuacion({
  filas,
  seleccionada,
  onSeleccionar,
  catalogos,
}: {
  filas: FilaAmenaza[];
  seleccionada: string | null;
  onSeleccionar: (codigo: string) => void;
  catalogos: Catalogos;
}) {
  const codigoActivo = seleccionada ?? filas[0]?.amenaza.codigo ?? null;
  const fila = filas.find((f) => f.amenaza.codigo === codigoActivo) ?? null;

  if (filas.length === 0) {
    return (
      <div className="px-8 pt-6 pb-[46px]">
        <p className="text-12_5 text-muted [text-wrap:pretty]">
          Este activo no tiene amenazas en el análisis todavía.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-8 pt-6 pb-[46px]">
      <div className="flex flex-col gap-1">
        <h2 className="text-16 font-bold text-primary">Ecuación del riesgo</h2>
        <p className="max-w-[86ch] text-12_5 text-muted [text-wrap:pretty]">
          Las siete pasos de MET-SIG-01 §7 para la amenaza elegida, resueltas por{' '}
          <code className="font-mono text-11">lib/sgsi/ecuacion.ts</code> — las mismas que ya
          mueven la fila en Amenazas, no un segundo cálculo.
        </p>
      </div>

      <label className="flex max-w-sm flex-col gap-1.5">
        <span className="etiqueta-campo text-9">AMENAZA</span>
        <select
          value={codigoActivo ?? ''}
          aria-label="Elegir la amenaza para ver su ecuación"
          onChange={(e) => onSeleccionar(e.target.value)}
          className="w-full rounded-campo border border-border-field bg-surface px-2.5 py-[7px] text-12_5 font-medium text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        >
          {filas.map((f) => (
            <option key={f.amenaza.codigo} value={f.amenaza.codigo}>
              {f.amenaza.codigo} — {f.amenaza.nombre}
            </option>
          ))}
        </select>
      </label>

      {fila && (
        <PestanaEcuacion
          codigoAmenaza={fila.amenaza.codigo}
          nombreAmenaza={fila.amenaza.nombre}
          ecuacion={fila.ecuacion}
          catalogos={catalogos}
        />
      )}
    </div>
  );
}

function TabResumen({
  filas,
  catalogos,
  entra,
}: {
  filas: FilaAmenaza[];
  catalogos: Catalogos;
  entra: boolean;
}) {
  // Frequency ascending across the columns, as in the matrices screen, so both read the
  // same way round.
  const columnas = useMemo(
    () =>
      [...catalogos.escalaFrecuencia].sort((a, b) => Number(a.vecesAno) - Number(b.vecesAno)),
    [catalogos.escalaFrecuencia],
  );

  const { inherente, residual, conResidual } = useMemo(() => {
    // Nearest frequency point to an ARO. A per-risk frequency override always lands on
    // one of the scale's own points, so this is exact for the inherent matrix; for the
    // residual it is the nearest column, since a residual frequency falls between points.
    const columnaDe = (aro: number) =>
      columnas.reduce(
        (mejor, c, i) =>
          Math.abs(Number(c.vecesAno) - aro) < Math.abs(Number(columnas[mejor].vecesAno) - aro)
            ? i
            : mejor,
        0,
      );
    const vacia = () => catalogos.bandasImpacto.map(() => columnas.map(() => 0));

    const a = vacia();
    const b = vacia();
    let n = 0;
    for (const f of filas) {
      const i = f.bandaImpacto?.indice ?? catalogos.bandasImpacto.length - 1;
      a[i][columnaDe(f.aro)] += 1;
      if (f.frecuenciaResidual !== null) {
        b[i][columnaDe(f.frecuenciaResidual)] += 1;
        n += 1;
      }
    }
    return { inherente: a, residual: b, conResidual: n };
  }, [filas, columnas, catalogos.bandasImpacto]);

  // KPIs. Every one of them is counted from the same rows the matrices are drawn from,
  // so a KPI can never disagree with the grid above it.
  const gravesInherentes = filas.filter(
    (f) => f.bandaRiesgo !== null && f.bandaRiesgo.indice <= 1,
  ).length;
  const gravesResiduales = filas.filter(
    (f) => f.bandaResidual !== null && f.bandaResidual.indice <= 1,
  ).length;
  const residualMaximo = filas.reduce<number | null>(
    (m, f) => (f.residual === null ? m : Math.max(m ?? 0, f.residual)),
    null,
  );

  return (
    <div className="flex flex-col gap-[22px] px-8 pt-6 pb-[46px]">
      <div className="flex flex-col gap-1">
        <h2 className="text-16 font-bold text-primary">Resumen del activo en la matriz de riesgo</h2>
        <p className="max-w-[86ch] text-12_5 text-muted [text-wrap:pretty]">
          Los {filas.length} riesgos de este activo distribuidos por nivel de impacto y
          frecuencia esperada. El eje de impacto no cambia entre las dos matrices: los
          controles preventivos reducen la frecuencia, y los que limitan el daño se
          reflejan bajando la degradación de la amenaza. No existe impacto residual.
        </p>
      </div>

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(440px,1fr))]">
        <MatrizActivo
          titulo="Riesgo inherente"
          subtitulo="Sin descontar la eficacia de los controles."
          rejilla={inherente}
          total={filas.length}
          columnas={columnas}
          catalogos={catalogos}
        />
        {conResidual === 0 ? (
          <TarjetaResidualSinCalcular total={filas.length} />
        ) : (
          <MatrizActivo
            titulo="Riesgo residual"
            subtitulo="Con la madurez de los controles preventivos registrada."
            rejilla={residual}
            total={conResidual}
            columnas={columnas}
            catalogos={catalogos}
            aviso={
              conResidual < filas.length
                ? `${filas.length - conResidual} de ${filas.length} riesgos siguen sin residual calculado y no están en esta matriz.`
                : undefined
            }
          />
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <Kpi
          etiqueta="RIESGOS DEL ACTIVO"
          valor={entra ? miles(filas.length) : 'no requiere'}
          nota="Producto del activo por las amenazas preclasificadas de su tipo."
        />
        <Kpi
          etiqueta="CRÍTICOS + ALTOS INHERENTES"
          valor={miles(gravesInherentes)}
          nota="Antes de aplicar controles."
        />
        <Kpi
          etiqueta="CRÍTICOS + ALTOS RESIDUALES"
          valor={conResidual === 0 ? 'sin calcular' : miles(gravesResiduales)}
          nota={
            conResidual === 0
              ? 'Desconocido, no cero: no hay eficacia de controles asignada.'
              : 'Después de descontar la eficacia preventiva.'
          }
        />
        <Kpi
          etiqueta="RIESGO RESIDUAL MÁXIMO"
          valor={residualMaximo === null ? 'sin calcular' : cifra(residualMaximo)}
          nota="Mayor valor de impacto × frecuencia residual."
        />
      </div>
    </div>
  );
}

function Kpi({
  etiqueta,
  valor,
  nota,
}: {
  etiqueta: string;
  valor: string;
  nota: string;
}) {
  const numerica = /^[\d.,]+$/.test(valor);
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-tarjeta border border-border-default bg-surface px-4 py-[15px]">
      <span className="etiqueta-campo text-9">{etiqueta}</span>
      <span className={numerica ? 'cifra text-26 text-primary' : 'cifra text-17 text-faint'}>
        {valor}
      </span>
      <span className="text-11_5 text-muted [text-wrap:pretty]">{nota}</span>
    </div>
  );
}

function MatrizActivo({
  titulo,
  subtitulo,
  rejilla,
  total,
  columnas,
  catalogos,
  aviso,
}: {
  titulo: string;
  subtitulo: string;
  rejilla: number[][];
  total: number;
  columnas: Catalogos['escalaFrecuencia'];
  catalogos: Catalogos;
  aviso?: string;
}) {
  // The band of every cell, and the totals per band accumulated from the very same cells
  // that are drawn. One pass, so the grid and the distribution cannot disagree.
  const bandas = useMemo(
    () =>
      catalogos.bandasImpacto.map((b) =>
        columnas.map(
          (c) =>
            indiceBanda(
              // A PRODUCT of two narrowed floats, classified against exact Decimal
              // thresholds — the same asymmetry the derivation block above was fixed for,
              // in the call site a grep for the known variable names did not reach. The
              // lesson is in the search: look for the FUNCTION, not for the operands.
              clasificar(new Decimal(b.medio).times(c.vecesAno), catalogos.bandasRiesgo),
              catalogos.bandasRiesgo,
            ) ?? { nombre: catalogos.bandasRiesgo[catalogos.bandasRiesgo.length - 1].nombre, indice: catalogos.bandasRiesgo.length - 1 },
        ),
      ),
    [catalogos.bandasImpacto, catalogos.bandasRiesgo, columnas],
  );

  const conteos = useMemo(() => {
    const acumulado = catalogos.bandasRiesgo.map(() => 0);
    rejilla.forEach((fila, i) => fila.forEach((n, j) => (acumulado[bandas[i][j].indice] += n)));
    const suma = acumulado.reduce((a, b) => a + b, 0) || 1;
    return catalogos.bandasRiesgo.map((b, i) => ({
      nombre: b.nombre,
      n: acumulado[i],
      pct: Math.round((acumulado[i] / suma) * 100),
    }));
  }, [rejilla, bandas, catalogos.bandasRiesgo]);

  return (
    <section className="flex min-w-0 flex-col gap-3.5 rounded-tarjeta border border-border-default bg-surface px-[20px] pt-[18px] pb-5">
      <div className="flex items-start justify-between gap-3.5">
        <div>
          <h3 className="text-14 font-bold text-primary">{titulo}</h3>
          <p className="mt-0.5 max-w-[46ch] text-11_5 text-muted [text-wrap:pretty]">{subtitulo}</p>
        </div>
        <div className="flex flex-none flex-col items-end">
          <span className="cifra text-20 text-primary">{miles(total)}</span>
          <span className="etiqueta-campo text-9">Riesgos</span>
        </div>
      </div>

      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `90px repeat(${columnas.length}, minmax(52px, 1fr))` }}
      >
        <div className="flex items-end justify-end pr-2 pb-1 text-right font-mono text-8_5 leading-tight text-[var(--hf-text-placeholder)]">
          IMPACTO ↓
          <br />
          FREC. →
        </div>
        {columnas.map((c) => (
          <div
            key={c.id}
            title={c.nombre}
            className="pb-[3px] text-center font-mono text-9 tracking-[0.04em] text-faint"
          >
            {c.corto}
          </div>
        ))}

        {catalogos.bandasImpacto.map((b, i) => (
          <div key={b.nombre} style={{ display: 'contents' }}>
            <div className="flex items-center justify-end pr-2 text-right text-11 text-secondary-soft">
              {b.nombre}
            </div>
            {columnas.map((c, j) => {
              const n = rejilla[i][j];
              const banda = bandas[i][j];
              const color = colorRiesgo(banda.indice);
              return (
                <div
                  key={c.id}
                  title={`${banda.nombre} · impacto ${b.nombre.toLowerCase()} · ${cifra(Number(c.vecesAno))} ${Number(c.vecesAno) === 1 ? 'vez' : 'veces'} al año · ${miles(n)} riesgos`}
                  className="flex flex-col items-center justify-center gap-px rounded-campo"
                  style={{
                    aspectRatio: '1.6 / 1',
                    background: n === 0 ? 'var(--hf-bg-app)' : color.bg,
                    color: n === 0 ? 'var(--hf-text-placeholder-soft)' : color.fg,
                  }}
                >
                  <span className="cifra text-17">{n === 0 ? '—' : miles(n)}</span>
                  {/* Colour is never the only carrier: every cell states its level. */}
                  <span className="text-8_5 tracking-[0.03em] opacity-85">
                    {abreviarRiesgo(banda.nombre)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {aviso !== undefined && (
        <p className="rounded-campo border border-warn-border bg-warn-100 px-3 py-2 text-11 leading-relaxed text-warn-text">
          {aviso}
        </p>
      )}

      <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
        {conteos.map((k, i) => {
          const color = colorRiesgo(i);
          return (
            <div key={k.nombre} className="flex items-center gap-2.5">
              <span
                className="h-[9px] w-[9px] flex-none rounded-swatch"
                style={{ background: color.bg }}
              />
              <span className="w-[62px] text-12 text-secondary">{k.nombre}</span>
              <span className="h-[7px] flex-1 overflow-hidden rounded-badge bg-hairline">
                <span
                  className="block h-full rounded-badge"
                  style={{ width: `${k.pct}%`, background: color.bg }}
                />
              </span>
              <span className="w-[42px] text-right font-mono text-12_5 font-semibold tabular-nums text-secondary">
                {miles(k.n)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/// The residual matrix while the residual risk is unknown.
///
/// This card exists instead of a grid on purpose. Efficacy comes from the maturity of the
/// controls mapped to each threat and no threat has that mapping yet, so the efficacy is
/// unknown — not zero. With efficacy zero the residual ARO equals the inherent one and
/// this matrix would come out cell for cell identical to the one beside it: consistent
/// with its inputs and wrong as a report. A greyed grid would not fix it either, because
/// a grid of empty cells reads as "everything is in the lowest band".
function TarjetaResidualSinCalcular({ total }: { total: number }) {
  return (
    <section className="flex min-w-0 flex-col gap-3.5 rounded-tarjeta border border-border-default bg-surface px-[20px] pt-[18px] pb-5">
      <div className="flex items-start justify-between gap-3.5">
        <div>
          <h3 className="text-14 font-bold text-primary">Riesgo residual</h3>
          <p className="mt-0.5 max-w-[46ch] text-11_5 text-muted [text-wrap:pretty]">
            Con la madurez de los controles preventivos registrada, que reducen la
            frecuencia.
          </p>
        </div>
        <div className="flex flex-none flex-col items-end">
          <span className="cifra text-20 text-faint">—</span>
          <span className="etiqueta-campo text-9">Riesgos</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-start justify-center gap-3 rounded-campo border border-dashed border-warn-border bg-warn-100 px-5 py-6">
        <span className="cifra text-22 text-warn-text">Sin calcular</span>
        <p className="text-12 leading-relaxed text-warn-text [text-wrap:pretty]">
          Ninguna de las amenazas de este activo tiene todavía controles con relevancia
          asignada, así que la eficacia es <strong>desconocida, no cero</strong>. Los{' '}
          {miles(total)} riesgos del activo tienen el residual en blanco.
        </p>
        <p className="text-11_5 leading-relaxed text-warn-text [text-wrap:pretty]">
          Dibujar aquí la matriz suponiendo eficacia cero la dejaría idéntica, casilla por
          casilla, a la inherente. Esta matriz aparece sola en cuanto se registre la
          relevancia de los pares control–amenaza.
        </p>
      </div>

      <div className="border-t border-hairline pt-3">
        <p className="text-11_5 text-faint">
          Sin distribución por nivel mientras el residual no esté calculado.
        </p>
      </div>
    </section>
  );
}

// ===========================================================================
// The fixed bottom bar
// ===========================================================================

const SYNC_TEXTO: Record<Sync, string> = {
  limpio: '',
  pendiente: 'Cambios sin guardar',
  guardando: 'Guardando…',
  // It is saved. The actions wrote it, logged it in the bitácora and recalculated the
  // risks, and the sheet re-read afterwards — so this says so without a qualifier.
  sincronizado: 'Cambios guardados',
};

const SYNC_PUNTO: Record<Sync, string> = {
  limpio: 'transparent',
  pendiente: 'var(--hf-risk-medio-bg)',
  guardando: 'var(--hf-warn-500)',
  sincronizado: 'var(--hf-accent-500)',
};

function FranjaInferior({
  codigo,
  nuevo,
  posicion,
  total,
  anterior,
  siguiente,
  sync,
  impedimentos,
  aviso,
  pendientes,
  clasificacion,
  simulaciones,
  guardando,
  yaDeBaja,
  onEliminar,
  onGuardar,
}: {
  codigo: string;
  nuevo: boolean;
  posicion: number;
  total: number;
  anterior: string | null;
  siguiente: string | null;
  sync: Sync;
  impedimentos: string[];
  aviso: { ok: boolean; texto: string } | null;
  pendientes: number;
  /// Which classification fields moved, and whether the type is among them: a type
  /// change rebuilds the risk set, so it is announced before Save, not after.
  clasificacion: { campos: string[]; cambiaTipo: boolean };
  simulaciones: string[];
  guardando: boolean;
  yaDeBaja: boolean;
  onEliminar: () => void;
  onGuardar: () => void;
}) {
  const puedeGuardar = impedimentos.length === 0 && pendientes > 0 && !guardando;

  /// Walking to another asset drops whatever is not saved yet, so it asks first — the
  /// what-if edits that have no action included, since those are lost for good.
  const confirmarSalida = (e: React.MouseEvent) => {
    if (pendientes === 0 && simulaciones.length === 0) return;
    if (!window.confirm('Hay cambios sin guardar en esta ficha. ¿Salir y perderlos?')) {
      e.preventDefault();
    }
  };

  return (
    <div className="sticky bottom-0 z-40 flex flex-col gap-2 border-t border-border-default bg-surface px-8 py-3 shadow-[0_-6px_20px_rgba(12,24,18,0.06)]">
      {/* What the action said, in its own words: the messages are written to be read. */}
      {aviso !== null && (
        <div
          className="rounded-campo border px-3.5 py-2 text-11_5 leading-snug [text-wrap:pretty]"
          role="status"
          style={
            aviso.ok
              ? {
                  borderColor: 'var(--hf-accent-border)',
                  background: 'var(--hf-accent-100)',
                  color: 'var(--hf-accent-700)',
                }
              : {
                  borderColor: 'var(--hf-danger-border)',
                  background: 'var(--hf-danger-bg)',
                  color: 'var(--hf-danger-text)',
                }
          }
        >
          {aviso.texto}
        </div>
      )}

      {impedimentos.length > 0 && (
        <div className="flex flex-col gap-1 rounded-campo border border-warn-border bg-warn-100 px-3 py-2">
          <span className="font-mono text-9 tracking-[0.07em] text-warn-text">
            FALTA ANTES DE GUARDAR
          </span>
          {impedimentos.slice(0, 4).map((m) => (
            <span key={m} className="text-11_5 leading-snug text-warn-text [text-wrap:pretty]">
              · {m}
            </span>
          ))}
          {impedimentos.length > 4 && (
            <span className="text-11_5 text-warn-text">
              · y {impedimentos.length - 4} más.
            </span>
          )}
        </div>
      )}

      {/* Advisory, not an impediment: the classification saves. The type is what decides
          which threats apply, so it is worth knowing the risk set will be rebuilt before
          pressing Save rather than reading it in the result afterwards. */}
      {clasificacion.campos.length > 0 && (
        <div className="flex flex-col gap-1 rounded-campo border border-brand-border bg-brand-100 px-3 py-2">
          <span
            className="font-mono text-9 tracking-[0.07em]"
            style={{ color: 'var(--hf-brand-nav)' }}
          >
            AL GUARDAR
          </span>
          <span
            className="text-11_5 leading-snug [text-wrap:pretty]"
            style={{ color: 'var(--hf-brand-nav)' }}
          >
            · Cambia {clasificacion.campos.join(' y ')}.
            {clasificacion.cambiaTipo &&
              ' El tipo decide qué amenazas aplican, así que se regenera el conjunto de riesgos del activo.'}{' '}
            El código no cambia: es inmutable y no se reutiliza, y el cambio queda en la
            bitácora.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3.5">
        <span className="font-mono text-11 font-semibold text-accent-500">{codigo}</span>

        <div className="flex items-center gap-1.5">
          {anterior === null ? (
            <span
              className="rounded-campo border border-border-field bg-app px-2.5 py-[7px] text-12_5 text-[var(--hf-text-placeholder)]"
              title={nuevo ? 'El activo todavía no está en el inventario' : undefined}
            >
              ← Atrás
            </span>
          ) : (
            <Link
              href={`/sgsi/inventario/${anterior}`}
              onClick={confirmarSalida}
              title={`Activo anterior · ${anterior}`}
              className="flex items-center gap-1.5 rounded-campo border border-border-field bg-surface px-2.5 py-[7px] text-12_5 text-secondary-soft transition-colors hover:bg-app"
            >
              <span className="font-mono">←</span> Atrás
            </Link>
          )}
          {siguiente === null ? (
            <span className="rounded-campo border border-border-field bg-app px-2.5 py-[7px] text-12_5 text-[var(--hf-text-placeholder)]">
              Siguiente →
            </span>
          ) : (
            <Link
              href={`/sgsi/inventario/${siguiente}`}
              onClick={confirmarSalida}
              title={`Activo siguiente · ${siguiente}`}
              className="flex items-center gap-1.5 rounded-campo border border-border-field bg-surface px-2.5 py-[7px] text-12_5 text-secondary-soft transition-colors hover:bg-app"
            >
              Siguiente <span className="font-mono">→</span>
            </Link>
          )}
          <span className="font-mono text-10_5 text-label">
            {nuevo ? 'activo nuevo' : posicion < 0 ? `— de ${total}` : `${posicion + 1} de ${total}`}
          </span>
        </div>

        <span
          className="flex items-center gap-2 text-12"
          style={{
            color: sync === 'pendiente' ? 'var(--hf-warn-text)' : 'var(--hf-text-muted)',
          }}
          aria-live="polite"
        >
          <span
            className="h-[7px] w-[7px] rounded-full"
            style={{ background: SYNC_PUNTO[sync] }}
            aria-hidden
          />
          {SYNC_TEXTO[sync]}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!nuevo && (
            <button
              type="button"
              onClick={onEliminar}
              disabled={yaDeBaja}
              className="rounded-campo border border-danger-border bg-surface px-3.5 py-2 text-12_5 font-semibold text-danger-text transition-colors hover:bg-danger-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              Eliminar activo
            </button>
          )}
          <Link
            href="/sgsi/inventario"
            onClick={confirmarSalida}
            className="rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12_5 text-secondary transition-colors hover:bg-app"
          >
            Cancelar
          </Link>
          <button
            type="button"
            onClick={onGuardar}
            disabled={!puedeGuardar}
            title={
              impedimentos.length > 0
                ? 'Resuelve lo que falta antes de guardar'
                : pendientes === 0
                  ? 'No hay cambios que guardar'
                  : 'Guarda los cambios, los registra en la bitácora y recalcula los riesgos'
            }
            className="rounded-campo bg-accent-500 px-[18px] py-2 text-12_5 font-semibold text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:bg-[var(--hf-text-placeholder)]"
          >
            {nuevo
              ? 'Crear activo'
              : guardando
                ? 'Guardando…'
                : pendientes === 0
                  ? 'Guardar cambios'
                  : `Guardar ${pendientes} ${pendientes === 1 ? 'cambio' : 'cambios'}`}
          </button>
        </div>
      </div>

      {/* Only what really has no action. Every other edit on this sheet is written by one
          of the actions in app/sgsi/acciones, logged in the bitácora and followed by a
          recalculation, and none of these is counted as an unsaved change. */}
      {simulaciones.length > 0 && (
        <p className="text-10_5 text-faint [text-wrap:pretty]">
          Sin acción que lo persista, así que queda como simulación y se pierde al recargar:{' '}
          {simulaciones.join('; ')}.
        </p>
      )}
    </div>
  );
}

/// The asset's logical delete. Nothing is physically deleted: the asset leaves the
/// inventory, the matrices and the KPIs, and the row stays with `activo = false`, its
/// `baja_en` and a bitácora entry. The undo band the handoff puts on the inventory
/// belongs to the same server action; this band is the confirmation and the reason.
function BandaBaja({
  codigo,
  motivo,
  onMotivo,
  onDeshacer,
}: {
  codigo: string;
  motivo: string;
  onMotivo: (m: string) => void;
  onDeshacer: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[8px] border border-danger-border bg-danger-bg px-4 py-3">
      <span className="text-12_5 font-semibold text-danger-text">
        {codigo} se dará de baja del inventario junto con sus riesgos
      </span>
      <span className="text-11_5 leading-snug text-danger-text [text-wrap:pretty]">
        La baja es lógica: nada se borra físicamente. El activo sale del inventario, de las
        matrices y de los KPI, y queda en la bitácora con autor, fecha y motivo. El
        inventario muestra la banda con «Deshacer» al volver.
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={motivo}
          onChange={(e) => onMotivo(e.target.value)}
          placeholder="Motivo de la baja — obligatorio…"
          aria-label="Motivo de la baja del activo"
          className="min-w-0 flex-1 rounded-campo border bg-surface px-2.5 py-1.5 text-12 text-primary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          style={{
            borderColor: motivo.trim() === '' ? 'var(--hf-warn-500)' : 'var(--hf-border-field)',
          }}
        />
        <button
          type="button"
          onClick={onDeshacer}
          className="flex-none rounded-campo border border-border-field bg-surface px-3 py-1.5 text-12 font-semibold text-secondary transition-colors hover:bg-app"
        >
          Deshacer
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// Popups
// ===========================================================================

function Marco({
  titulo,
  subtitulo,
  ancho,
  onCerrar,
  children,
}: {
  titulo: string;
  subtitulo: string;
  ancho: number;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-60 flex items-start justify-center px-5 py-[78px]"
      style={{ background: 'var(--hf-overlay)' }}
      role="dialog"
      aria-modal
      aria-label={titulo}
      onClick={onCerrar}
    >
      <div
        className="flex w-full flex-col overflow-hidden rounded-modal bg-surface"
        style={{ maxWidth: ancho, boxShadow: 'var(--hf-modal-shadow)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline-strong px-5 pt-[17px] pb-3.5">
          <div className="flex flex-col gap-0.5">
            <div className="text-15 font-bold text-primary">{titulo}</div>
            <div className="max-w-[62ch] text-12 text-muted [text-wrap:pretty]">{subtitulo}</div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="h-7 w-7 flex-none rounded-campo border border-border-default bg-surface text-15 leading-none text-muted transition-colors hover:bg-app"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PopupSuperior({
  activos,
  busqueda,
  onBusqueda,
  onElegir,
  onCerrar,
}: {
  activos: ActivoBreve[];
  busqueda: string;
  onBusqueda: (v: string) => void;
  onElegir: (id: number) => void;
  onCerrar: () => void;
}) {
  const q = busqueda.trim().toLowerCase();
  const resultados =
    q === ''
      ? activos.slice(0, 40)
      : activos
          .filter((a) =>
            [a.codigo, a.nombre, a.area, a.subtipo].some((v) => v.toLowerCase().includes(q)),
          )
          .slice(0, 40);

  return (
    <Marco
      titulo="Activo superior"
      subtitulo="La jerarquía es opcional. Un activo superior es el que este activo soporta o del que depende; hoy está vacía en todo el inventario."
      ancho={680}
      onCerrar={onCerrar}
    >
      <div className="border-b border-hairline-strong px-5 py-3.5">
        <input
          value={busqueda}
          autoFocus
          onChange={(e) => onBusqueda(e.target.value)}
          placeholder="Código, nombre, proceso o subtipo…"
          aria-label="Buscar activo superior"
          className="w-full rounded-campo border border-border-field bg-subtle px-2.5 py-2 text-13 text-primary focus:border-accent-500 focus:outline-hidden focus:ring-2 focus:ring-accent-300"
        />
      </div>
      <div className="flex max-h-[60vh] flex-col overflow-y-auto">
        {resultados.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onElegir(a.id)}
            className="grid items-center gap-3 border-b border-hairline px-5 py-2.5 text-left transition-colors hover:bg-accent-50"
            style={{ gridTemplateColumns: '128px minmax(0, 1fr) 170px' }}
          >
            <span className="font-mono text-11_5 font-semibold text-accent-500">{a.codigo}</span>
            <span className="min-w-0 truncate text-12_5 font-medium text-primary">{a.nombre}</span>
            <span className="truncate text-11 text-faint">{a.area}</span>
          </button>
        ))}
        {resultados.length === 0 && (
          <div className="px-5 py-[26px] text-center text-12_5 text-faint">
            Ningún activo coincide con la búsqueda.
          </div>
        )}
      </div>
    </Marco>
  );
}

function PopupAmenaza({
  codigo,
  codigoTipo,
  disponibles,
  onAgregar,
  onCerrar,
}: {
  codigo: string;
  codigoTipo: string;
  disponibles: AmenazaCatalogo[];
  onAgregar: (codigo: string) => void;
  onCerrar: () => void;
}) {
  return (
    <Marco
      titulo={`Agregar amenaza a ${codigo}`}
      subtitulo={`Amenazas del catálogo MAGERIT que la parametrización no preclasifica para ${codigoTipo}. Al agregarlas quedan marcadas como excepción justificada, con origen EXCEPCIÓN en el riesgo.`}
      ancho={760}
      onCerrar={onCerrar}
    >
      <div className="flex max-h-[62vh] flex-col overflow-y-auto">
        {disponibles.map((a) => (
          <div
            key={a.id}
            className="grid items-center gap-3 border-b border-hairline px-5 py-2.5"
            style={{ gridTemplateColumns: '62px minmax(0, 1fr) 128px 96px' }}
          >
            <span className="font-mono text-11_5 font-semibold text-accent-500">{a.codigo}</span>
            <span className="min-w-0 truncate text-12_5 font-medium text-primary" title={a.nombre}>
              {a.nombre}
            </span>
            <span className="truncate font-mono text-10 text-faint" title={a.grupo}>
              {a.grupo}
            </span>
            <button
              type="button"
              onClick={() => onAgregar(a.codigo)}
              className="rounded-campo border border-accent-border bg-accent-100 px-2.5 py-1.5 text-11_5 font-semibold text-accent-700 transition-colors hover:bg-accent-border"
            >
              Agregar
            </button>
          </div>
        ))}
        {disponibles.length === 0 && (
          <div className="px-5 py-[26px] text-center text-12_5 text-faint">
            Todas las amenazas del catálogo ya están asignadas a este activo.
          </div>
        )}
      </div>
    </Marco>
  );
}

/// REQ-SIG-20 §10 (D5, tarea 4.15) · el ÚNICO diálogo de guardado de fin de sesión. Lista
/// cada cambio de degradación/frecuencia/madurez del riesgo con su valor anterior → nuevo
/// (spec `end-of-session-notes`, "Dialog lists the pending changes") y pide UNA nota
/// obligatoria para todos — nunca una por campo. Confirmar con la nota vacía no hace nada:
/// el mismo bloqueo deliberado de D17 que `guardarSesionRiesgo` aplica del lado del
/// servidor, repetido acá para que se lea ANTES del rechazo, no después.
function DialogoNotas({
  cambios,
  nota,
  onNota,
  onCancelar,
  onConfirmar,
}: {
  cambios: { clave: string; campo: string; anterior: string; nuevo: string }[];
  nota: string;
  onNota: (v: string) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const vacia = nota.trim() === '';
  return (
    <Marco
      titulo="Notas de la sesión"
      subtitulo={`${cambios.length} ${cambios.length === 1 ? 'cambio' : 'cambios'} de degradación, frecuencia y madurez del riesgo. Una sola nota los explica a todos — sin ella no se guarda ninguno.`}
      ancho={620}
      onCerrar={onCancelar}
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <ul className="flex max-h-[30vh] flex-col gap-1.5 overflow-y-auto">
          {cambios.map((c) => (
            <li key={c.clave} className="text-11_5 leading-snug text-secondary [text-wrap:pretty]">
              <span className="font-semibold text-primary">{c.campo}</span>: {c.anterior} →{' '}
              {c.nuevo}
            </li>
          ))}
        </ul>

        <label className="flex flex-col gap-1">
          <span className="etiqueta-campo">Notas — qué cambió en la realidad y por qué</span>
          <textarea
            value={nota}
            autoFocus
            onChange={(e) => onNota(e.target.value)}
            rows={3}
            placeholder="Obligatorio: sin nota, ni los datos ni la bitácora se escriben."
            className="w-full rounded-campo border border-border-field bg-surface px-2.5 py-1.5 text-12_5 text-secondary focus:outline-hidden focus:ring-2 focus:ring-accent-300"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-hairline-strong px-5 py-3.5">
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-campo border border-border-field bg-surface px-3.5 py-2 text-12_5 text-secondary transition-colors hover:bg-app"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={vacia}
          title={vacia ? 'Las notas son obligatorias para guardar estos cambios.' : undefined}
          className="rounded-campo bg-accent-500 px-3.5 py-2 text-12_5 font-semibold text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:bg-[var(--hf-text-placeholder)]"
        >
          Confirmar y guardar
        </button>
      </div>
    </Marco>
  );
}
