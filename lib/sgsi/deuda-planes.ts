// lib/sgsi/deuda-planes.ts
//
// REQ-SIG-20 §7 (P2, D4, tareas 4.10-4.11) · la deuda de planes de tratamiento sobre un
// residual Crítico. Todo acá es puro — ni Prisma, ni fechas del sistema salvo las que
// entran como parámetro — porque es exactamente la clase de decisión que este repositorio
// prueba: "las decisiones se prueban; el cableado no".
//
// INVARIANTE 1 — «SIN PLAN» SE DERIVA, NUNCA SE GUARDA. No existe ni existirá una columna
// `Riesgo.planPendienteEn`: el estado es (a) el riesgo está en banda Crítico y no es
// obsoleto, y (b) ningún `AccionPlan` activo lo cubre por origen (`lib/sgsi/origen-plan.ts`).
// Guardar ese booleano en cualquier parte sería la misma segunda-fuente-de-verdad que este
// cambio evita en cada corte.
//
// LA ANTIGÜEDAD CAMINA LA RACHA DE `RiesgoCalculo` (tarea 1.8, `construirSnapshotCalculo` en
// `lib/sgsi/riesgos.ts`), no un timestamp guardado: cuánto lleva el riesgo, SIN
// INTERRUPCIÓN, en banda Crítico hasta el cálculo más reciente. Si bajó de banda y volvió a
// subir, la antigüedad es desde que volvió a subir — la deuda es sobre el estado actual, no
// sobre el historial completo.

import { clasificar } from './clasificar';
import { origenCubreRiesgo, parsearOrigen } from './origen-plan';
import type { ResolverDeudaPlan } from './analisis-riesgos';
import type { UmbralRiesgo } from './riesgo-activo';

const BANDA_CRITICA = 'Crítico';

// ============================================================================
// El resolutor — implementa `ResolverDeudaPlan`, declarada en `analisis-riesgos.ts`
// (Fase 3b, tarea 3.9) a la espera de esta fase.
// ============================================================================

export interface AccionPlanParaDeuda {
  /// `AccionPlan.activa`. Una acción dada de baja no cubre nada: es exactamente como si no
  /// existiera para efectos de la deuda.
  activa: boolean;
  origen: string;
  /// `AccionPlan.control.codigo`. `null` cuando el plan no apunta a ningún control — sólo
  /// `MITIGAR` lo exige—, y entonces no cubre por esa vía.
  ///
  /// NO es opcional a propósito. Un campo opcional que se olvida no da error: da un resolutor
  /// que dice «sin plan» sobre riesgos que sí lo tienen, en silencio y con el tablero
  /// completo. Obligarlo hace que el compilador le pregunte a cada llamador.
  controlCodigo: string | null;
}

/// Construye el `ResolverDeudaPlan` que `lib/sgsi/analisis-riesgos.ts` consume: dado un
/// riesgo (activo, amenaza) en banda Crítico, dice si hay un `AccionPlan` ACTIVO cuyo origen
/// lo cubre — cualquier `tipo`, incluido `ACEPTAR` (spec "ACEPTAR exits the band"; D-4 "el
/// caso ACEPTAR importa tanto como MITIGAR": aceptar formalmente también es planificar).
///
/// ── HAY DOS VÍAS, Y LAS DOS HACEN FALTA ─────────────────────────────────────────────────
///
/// 1 · POR ORIGEN. El prefijo verificable de `origen` nombra un par (activo, amenaza): es el
///     plan nacido de un riesgo puntual, desde la ficha del activo. Preciso y estrecho.
///
/// 2 · POR CONTROL PRINCIPAL. Un plan sobre el control principal de la amenaza cubre esa
///     brecha. Hace falta porque el plan es sobre un CONTROL (D-4) mientras que el prefijo
///     nombra un solo riesgo: un plan sobre A.8.12 no podía cubrir los 84 riesgos cuyo
///     principal es A.8.12 sin escribir ochenta y cuatro planes iguales.
///
///     Es el mismo eje con el que la exigencia decide si hay brecha —el nivel del control
///     PRINCIPAL contra lo que el activo le pide—, así que la compuerta y su cierre hablan
///     del mismo control. Y se deriva: no hay texto que mantener ni que reescribir cuando se
///     reemite el código de un activo.
///
/// Medido contra producción el 16-09-2026: los 18 planes vigentes traen el origen en prosa,
/// sin prefijo, así que con la vía 1 sola el sistema afirmaba que ninguno de los 584 riesgos
/// tenía plan — con 18 planes registrados y fechados.
///
/// Lo que NINGUNA de las dos hace es cubrir por «el plan toca algún control de la amenaza».
/// Un complementario que mejora no cierra la brecha del principal, y darlo por cubierto
/// convertiría cualquier plan en una coartada para la amenaza entera.
///
/// Un `origen` sin prefijo y sin control no cubre nada: no puede decir qué cubre sin que
/// alguien invente el dato.
export function construirResolverDeuda(
  acciones: readonly AccionPlanParaDeuda[],
): ResolverDeudaPlan {
  const activas = acciones.filter((a) => a.activa);

  const origenes = activas
    .map((a) => parsearOrigen(a.origen))
    .filter((o): o is NonNullable<ReturnType<typeof parsearOrigen>> => o !== null);

  const controlesConPlan = new Set(
    activas.map((a) => a.controlCodigo).filter((c): c is string => c !== null),
  );

  return (riesgo) => {
    if (origenes.some((o) => origenCubreRiesgo(o, riesgo))) return true;
    const principal = riesgo.principalCodigo;
    return principal !== undefined && principal !== null && controlesConPlan.has(principal);
  };
}

// ============================================================================
// El parser de plazo — CriterioAceptacion.plazoPlan / plazoEjecucion son texto libre
// ============================================================================

export type Plazo =
  | { tipo: 'dias'; dias: number }
  | { tipo: 'meses'; meses: number }
  /// "No requiere" — nunca escala, nunca tiene fecha objetivo.
  | { tipo: 'sin-plazo' }
  /// Lo que este parser NO adivina. El llamador decide qué hacer — avisar, nunca inventar.
  | { tipo: 'irreconocible'; texto: string };

const RE_DIAS = /^(\d+)\s*d[ií]as?$/i;
const RE_MESES = /^(\d+)\s*meses?$/i;
const RE_SIN_REQUERIR = /^no requiere$/i;

/// Cubre las formas confirmadas contra la base de desarrollo (2026-09-15, `criterio_
/// aceptacion`, las cuatro filas — una por banda):
///
///   plazoPlan:      «15 días» · «30 días» · «60 días» · «No requiere»
///   plazoEjecucion: «3 meses» · «6 meses» · «12 meses» · «Revisión anual»
///
/// «N días» y «No requiere» son EXACTAMENTE lo que el Open Item 5 de `tasks.md` anticipaba —
/// sin ambigüedad, y es la única forma que `plazoPlan` usa hoy en las cuatro bandas.
///
/// «N meses» NO estaba anticipado (el open question de `design.md` solo cubre «N días» /
/// «No requiere») pero es la forma real de `plazoEjecucion` en tres de las cuatro bandas, así
/// que se admite acá también — ver `sumarPlazo` para cómo se aplica a una fecha (mes de
/// calendario, nunca 30 días fijos).
///
/// «Revisión anual» (banda Bajo, `plazoEjecucion`) es la forma AMBIGUA que este parser NO
/// adivina: no dice si el plazo de ejecución de un plan de esa banda es «un año desde hoy» o
/// «no hay fecha propia porque se revisa junto con el resto en la revisión anual» — las dos
/// lecturas son razonables y this repo's rule is "no adivinar la intención". Devuelve
/// `irreconocible` a propósito; ver Open Items del reporte de esta fase. EN LA PRÁCTICA no
/// bloquea nada hoy: el popup de residual crítico (tarea 4.12) y la deuda de planes (tareas
/// 4.10-4.11) solo leen la banda Crítico, cuyo `plazoPlan` («15 días») y `plazoEjecucion»
/// («3 meses») son, los dos, casos sin ambigüedad.
export function parsearPlazo(texto: string): Plazo {
  const t = texto.trim();
  if (RE_SIN_REQUERIR.test(t)) return { tipo: 'sin-plazo' };
  const dias = RE_DIAS.exec(t);
  if (dias) return { tipo: 'dias', dias: Number(dias[1]) };
  const meses = RE_MESES.exec(t);
  if (meses) return { tipo: 'meses', meses: Number(meses[1]) };
  return { tipo: 'irreconocible', texto: t };
}

/// Aplica un `Plazo` a una fecha base. `null` para «sin-plazo» e «irreconocible»: ninguno de
/// los dos tiene una fecha que calcular, y devolver una inventada sería peor que no
/// mostrarla.
export function sumarPlazo(base: Date, plazo: Plazo): Date | null {
  if (plazo.tipo === 'dias') {
    const d = new Date(base);
    d.setDate(d.getDate() + plazo.dias);
    return d;
  }
  if (plazo.tipo === 'meses') {
    const d = new Date(base);
    d.setMonth(d.getMonth() + plazo.meses);
    return d;
  }
  return null;
}

/// Si `diasPendiente` ya superó el `plazoPlan` de la banda. `null` cuando el plazo es
/// irreconocible: no hay manera honesta de decir sí o no.
export function estaEscalado(diasPendiente: number, plazoPlanTexto: string): boolean | null {
  const plazo = parsearPlazo(plazoPlanTexto);
  if (plazo.tipo === 'dias') return diasPendiente > plazo.dias;
  if (plazo.tipo === 'sin-plazo') return false;
  if (plazo.tipo === 'meses') return diasPendiente > plazo.meses * 30;
  return null;
}

// ============================================================================
// La antigüedad — camina la racha de `RiesgoCalculo` (tarea 1.8)
// ============================================================================

export interface CalculoParaAntiguedad {
  calculadoEn: Date;
  /// `RiesgoCalculo.riesgoResidual`, como string decimal — nunca un float antes de
  /// clasificar (mismo criterio que el resto del módulo).
  riesgoResidual: string;
}

/// Desde cuándo el riesgo lleva, SIN INTERRUPCIÓN, en banda Crítico hasta el cálculo más
/// reciente. `null` cuando el cálculo más reciente no es Crítico (nada que envejecer) o
/// cuando no hay ningún cálculo todavía.
export function antiguedadEnCritico(
  calculos: readonly CalculoParaAntiguedad[],
  bandas: readonly UmbralRiesgo[],
): Date | null {
  const ordenados = [...calculos].sort((a, b) => b.calculadoEn.getTime() - a.calculadoEn.getTime());
  let desde: Date | null = null;
  for (const c of ordenados) {
    if (clasificar(c.riesgoResidual, bandas) !== BANDA_CRITICA) break;
    desde = c.calculadoEn;
  }
  return desde;
}

export function edadEnDias(desde: Date, ahora: Date): number {
  const ms = ahora.getTime() - desde.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// ============================================================================
// Las filas nombradas — lo que `FranjaSinPlan.tsx` (tarea 4.17) y `/sgsi/planes` necesitan
// ============================================================================

export interface RiesgoParaDeuda {
  activoCodigo: string;
  activoNombre: string;
  amenazaCodigo: string;
  amenazaNombre: string;
  /// El control principal de la amenaza. Viaja por la misma razón que en `ResolverDeudaPlan`
  /// y es obligatorio por la misma: si esta lista preguntara sin él mientras las tarjetas
  /// preguntan con él, la franja nombraría activos que el tablero ya da por cubiertos.
  principalCodigo: string | null;
  calculos: readonly CalculoParaAntiguedad[];
}

export interface FilaSinPlan {
  activoCodigo: string;
  activoNombre: string;
  amenazaCodigo: string;
  amenazaNombre: string;
  desde: Date;
  diasPendiente: number;
  /// `null` cuando el `plazoPlan` de la banda Crítico es irreconocible — ver `parsearPlazo`.
  escalado: boolean | null;
}

/// Una fila por ACTIVO — el mismo criterio que `analisis-riesgos.ts` usa para `estadoPlan`
/// ("basta que uno de sus riesgos en banda Crítico no tenga plan activo para que el activo
/// entero cuente como pendiente"): cuando un activo tiene más de un riesgo Crítico sin plan,
/// se muestra el MÁS ANTIGUO — es el que más apura, y el que decide si escala. Ordenado por
/// antigüedad descendente (§7.3: «hace 6 días» antes que «hace 2 días» antes que «hoy»).
export function activosSinPlan(
  riesgos: readonly RiesgoParaDeuda[],
  bandas: readonly UmbralRiesgo[],
  resolverDeuda: ResolverDeudaPlan,
  plazoPlanTexto: string,
  ahora: Date,
): FilaSinPlan[] {
  const pendientes: FilaSinPlan[] = [];

  for (const r of riesgos) {
    if (
      resolverDeuda({
        activoCodigo: r.activoCodigo,
        amenazaCodigo: r.amenazaCodigo,
        principalCodigo: r.principalCodigo,
      })
    ) {
      continue;
    }
    const desde = antiguedadEnCritico(r.calculos, bandas);
    if (desde === null) continue;
    const diasPendiente = edadEnDias(desde, ahora);
    pendientes.push({
      activoCodigo: r.activoCodigo,
      activoNombre: r.activoNombre,
      amenazaCodigo: r.amenazaCodigo,
      amenazaNombre: r.amenazaNombre,
      desde,
      diasPendiente,
      escalado: estaEscalado(diasPendiente, plazoPlanTexto),
    });
  }

  const porActivo = new Map<string, FilaSinPlan>();
  for (const p of pendientes) {
    const actual = porActivo.get(p.activoCodigo);
    if (!actual || p.diasPendiente > actual.diasPendiente) porActivo.set(p.activoCodigo, p);
  }

  return [...porActivo.values()].sort((a, b) => b.diasPendiente - a.diasPendiente);
}

// ============================================================================
// El prefill del popup (D-4, tarea 4.12) — decisiones puras que la acción de servidor
// (`app/sgsi/acciones/plan.ts`) resuelve con datos reales.
// ============================================================================

export interface ControlParaPlan {
  codigo: string;
  /// Madurez actual del control. `null` = sin evaluar, y eso cuenta como el más urgente de
  /// todos, no como un L0.
  nivel: number | null;
  esPrincipal: boolean;
}

/// El control que prellena el popup (tabla de prefill de la spec `critical-risk-treatment-
/// plan`): el PRINCIPAL de la amenaza crítica, o —cuando ninguno tiene relevancia asignada
/// todavía (Open Item 6 de la Fase 2: las 272 filas de `ControlAmenaza` sin relevancia)— el
/// de menor madurez, que es el que más aguja mueve si sube. `null` cuando la amenaza no
/// tiene ningún control mapeado: el popup deja el campo vacío en vez de inventar uno.
export function elegirControlParaPlan(
  controles: readonly ControlParaPlan[],
): ControlParaPlan | null {
  if (controles.length === 0) return null;
  const principal = controles.find((c) => c.esPrincipal);
  if (principal) return principal;
  return [...controles].sort((a, b) => (a.nivel ?? -1) - (b.nivel ?? -1))[0];
}

/// «Fecha = hoy + `CriterioAceptacion.plazoEjecucion`» (tabla de prefill). `null` cuando el
/// plazo es irreconocible: el popup muestra el campo vacío para completar a mano en vez de
/// una fecha inventada.
export function fechaObjetivoPlan(hoy: Date, plazoEjecucionTexto: string): Date | null {
  return sumarPlazo(hoy, parsearPlazo(plazoEjecucionTexto));
}
