// lib/sgsi/analisis-riesgos.ts
//
// REQ-SIG-20 §5 (P4, D7) — la lista y las cinco tarjetas de «Análisis de riesgos»
// (`/sgsi/valoracion-riesgos`): los activos que alcanzan el umbral de valoración, ordenados
// por peor residual descendente, con seis filtros que reescopan la lista y las tarjetas a la
// vez.
//
// UNA SOLA FUENTE DE CONTEO. Las tarjetas nunca recorren el universo completo con su propio
// predicado aparte: `tarjetasAnalisis` llama a `filasAnalisis` con los MISMOS filtros para la
// tarjeta EN ANÁLISIS, y cada tarjeta que controla su propia dimensión de filtro se cuenta
// excluyendo esa dimensión de los filtros activos — el mismo patrón ya probado en
// `inventario-filtros.ts` (`preValor`/`conteoValor`, REQ-SIG-18 §7.4) para que un clic diga lo
// que pasaría a la lista sin mentir sobre lo que ya se ve. Nunca dos pasadas independientes:
// eso es exactamente el defecto que REQ-SIG-18 documentó para el inventario, y el que este
// cambio persigue en cada corte.
//
// LA BANDA DEL RESIDUAL (filtro `bandaResidual`) reusa sin cambios la regla de
// `lib/sgsi/riesgo-activo.ts` (`colorDeRenglon`) que la tarea 1.7 preservó al retirar el
// filtro `color` de la grilla del inventario (REQ-SIG-20 §4, D-6). No es una banda nueva.
//
// LA DEUDA DE PLANES (§7, D4) TODAVÍA NO EXISTE. `lib/sgsi/deuda-planes.ts` es tarea de la
// Fase 4 (4.10-4.11) y depende a su vez de `lib/sgsi/origen-plan.ts` (4.8-4.9) para saber si
// un `AccionPlan` corresponde al riesgo que lo disparó — el propio `AccionPlan.origen` sigue
// siendo texto libre sin el prefijo verificable hasta esa fase. Esta fase NO construye una
// segunda derivación de «sin plan»: define acá la interfaz que la Fase 4 implementa
// (`ResolverDeudaPlan`) y la pantalla la consume degradando con elegancia — la columna «Plan»
// y la tarjeta SIN PLAN muestran un estado explícito de «aún no determinado» en vez de asumir
// que no hay plan. Ver `tasks.md`, Open Items, y el reporte de la Fase 3b.
//
// LA CRITICIDAD (columna «Criticidad», P9) viaja como `criticidad: string | null` — el código
// de `CriticidadNegocio` (C1..C5), nunca su `id`: el código es el contrato con el negocio y el
// `id` un detalle de la base. `null` es «todavía no clasificado». No es una derivación con
// riesgo de duplicarse, así que no necesita una interfaz propia como `ResolverDeudaPlan`; la
// consulta del servidor (`analisis-riesgos.query.ts`) la trae de `Activo.criticidad.codigo`.
// `compararPorCriticidad`, más abajo, ordena por RTO —no alfabéticamente por código— contra un
// mapa `{ codigo → rtoMinutos }` que la pantalla arma desde `CriticidadNegocio`: un activo sin
// criticidad declarada y un C5 «sin SLA» comparten `rtoMinutos: null` (sin límite de tiempo) y
// van al final, aunque signifiquen cosas distintas — uno es trabajo pendiente, el otro una
// decisión — porque para efectos de ORDEN los dos son «sin urgencia de recuperación».

import { clasificar } from './clasificar';
import {
  evaluarBrecha,
  type EstadoBrecha,
  type HayVerificacionVigente,
} from './exigencia';
import { SIN_ASIGNAR } from './inventario-filtros';
import { colorDeRenglon, nivelDeRiesgoDelActivo, type ColorRenglon, type NivelRiesgo, type UmbralRiesgo } from './riesgo-activo';

export { SIN_ASIGNAR };

export const TODOS_PROCESOS = 'Todos los procesos';
export const TODOS_PROPIETARIOS_ANALISIS = 'Todos los propietarios';
export const TODAS_PERSONAS_ANALISIS = 'Todas las personas';
/// REQ-SIG-20 §11 (P9) · la criticidad declarada por el negocio. Para «sin clasificar» se
/// reusa el centinela `SIN_ASIGNAR` que ya usan propietario y persona — es una opción REAL
/// del desplegable y no la ausencia de filtro: hoy es el estado de casi todo el inventario,
/// y poder aislarlo es lo que permite ir cerrando la clasificación.
export const TODAS_CRITICIDADES = 'Todas las criticidades';

/// «4 · 5 · ambos» del §5.3. La lista de esta página solo contiene activos que ya alcanzan
/// el umbral, así que `'ambos'` no es un tercer filtro sino el estado sin filtrar.
export type ValorFiltroAnalisis = 'ambos' | 4 | 5;

/// Las cuatro opciones que el desplegable «estado del plan» ofrece. `'requiere-plan'` es un
/// quinto valor interno que solo la tarjeta CON BRECHA usa (ver `tarjetasAnalisis`); no
/// aparece en el desplegable porque no es una pregunta que alguien elija, es lo que la
/// tarjeta necesita contar.
export type EstadoPlanFiltro = 'todos' | 'pendiente' | 'con-plan' | 'no-requiere';
type EstadoPlanInterno = EstadoPlanFiltro | 'requiere-plan';

export interface FiltrosAnalisis {
  proceso: string;
  propietario: string;
  persona: string;
  /// El CÓDIGO de la criticidad (`C1`..`C5`), `SIN_CRITICIDAD`, o `TODAS_CRITICIDADES`.
  /// Por código y no por id: el id es un detalle de la base y el código es el contrato con
  /// el negocio, igual que en `criticidad-coherencia.ts`.
  criticidad: string;
  valor: ValorFiltroAnalisis;
  /// Reusa `ColorRenglon` de `riesgo-activo.ts` sin cambios (tarea 3.11). `null` = Todos.
  bandaResidual: ColorRenglon | null;
  estadoPlan: EstadoPlanInterno;
}

export const FILTROS_ANALISIS_VACIOS: FiltrosAnalisis = {
  proceso: TODOS_PROCESOS,
  propietario: TODOS_PROPIETARIOS_ANALISIS,
  persona: TODAS_PERSONAS_ANALISIS,
  criticidad: TODAS_CRITICIDADES,
  valor: 'ambos',
  bandaResidual: null,
  estadoPlan: 'todos',
};

/// Un (activo, amenaza) reducido a lo que esta pantalla necesita. Solo viajan los riesgos NO
/// obsoletos; `obsoleto` queda en la forma de todos modos para que una prueba pueda ejercer
/// el caso límite sin depender de que quien arma la consulta ya haya filtrado.
export interface RiesgoAnalizable {
  amenazaCodigo: string;
  amenazaNombre: string;
  /// `Riesgo.riesgoPotencial`, como string decimal — nunca un float, por la misma razón que
  /// en `InventarioActivos.tsx`.
  potencial: string | null;
  /// `Riesgo.riesgoResidual`, como string decimal.
  residual: string | null;
  obsoleto: boolean;
  /// REQ-SIG-24 §6 · la degradación de la AMENAZA por dimensión, como fracción de 0 a 1.
  /// Decide qué dimensiones gobiernan la exigencia: la criticidad sólo manda sobre las
  /// amenazas que degradan D, y una que sólo degrada C no recibe exigencia de ella.
  degradacion: { D: number; I: number; C: number };
  /// El control PRINCIPAL de la amenaza. `undefined` = la amenaza no tiene principal
  /// designado — hoy, las 57, porque los 272 pares de `ControlAmenaza` siguen con
  /// `relevanciaId` en null. `nivel: null` = lo tiene y nadie lo evaluó.
  ///
  /// Que sea opcional y no un `| null` es deliberado: `undefined` y `null` significan cosas
  /// distintas y `evaluarBrecha` las distingue. Colapsarlas produciría el «tablero que
  /// afirma con precisión que no hay brechas».
  principal?: { codigo: string; nivel: number | null };
}

export interface ActivoAnalizable {
  codigo: string;
  nombre: string;
  /// `max(D, I, C)`, ya calculado por `lib/sgsi/formulas.ts` (`valorActivo`) — la única
  /// aritmética del valor, la misma que usan la ficha y el inventario.
  valor: number;
  /// REQ-SIG-24 §6 · los tres valores POR DIMENSIÓN. El máximo no alcanza para la
  /// exigencia: cada dimensión tiene su propio conductor, y un activo `D=3 I=5 C=1` exige
  /// 90 % sobre las amenazas que degradan I y nada sobre las que degradan D por la vía del
  /// valor. Con sólo el máximo, esa distinción se pierde.
  valores: { D: number; I: number; C: number };
  /// `Activo.criticidadId` (Fase 4, P9). Siempre `null` hasta esa fase.
  criticidad: string | null;
  /// `Activo.area.nombre` — «proceso» en el lenguaje del dominio, la misma convención que
  /// `evaluacion.query.ts` y `app/sgsi/inventario/page.tsx` ya usan.
  proceso: string;
  propietario: string | null;
  persona: string | null;
  personaCorreo: string | null;
  riesgos: readonly RiesgoAnalizable[];
}

/// La firma que `lib/sgsi/deuda-planes.ts` (Fase 4, tareas 4.10-4.11) implementa: dado el
/// activo y una de sus amenazas en banda residual Crítico, dice si ya existe un `AccionPlan`
/// activo que lo origina (round-trip de `lib/sgsi/origen-plan.ts`, también Fase 4). Que la
/// función esté AUSENTE significa «todavía no se sabe», nunca «no tiene» — de ahí que el
/// estado resultante sea `'sin-determinar'` y no `'pendiente'` cuando no se provee.
export type ResolverDeudaPlan = (riesgo: { activoCodigo: string; amenazaCodigo: string }) => boolean;

/// El estado de plan de un ACTIVO (no de un riesgo individual): basta que una de sus
/// amenazas tenga brecha sin plan activo para que el activo entero cuente como pendiente —
/// el §7.3 alerta nombrando el activo, no el riesgo.
///
/// REQ-SIG-24 §7 · LA COMPUERTA CAMBIÓ DE FUENTE, NO DE FORMA. Los cuatro valores y la firma
/// de `estadoPlanDe` son los mismos; lo único distinto es qué se pregunta:
///
///     antes:  peorResidual(a).banda === 'Crítico'     →  requiere plan
///     ahora:  alguna amenaza de `a` tiene brecha      →  requiere plan
///
/// El cambio es necesario porque la banda Crítico del residual es INALCANZABLE por
/// construcción: con la eficacia declarada el residual queda en el 5-10 % del inherente, y
/// llegar a 25 exigiría un inherente de 250 cuando el máximo del modelo es 50. Toda esta
/// maquinaria —la tarjeta, la cola, el envejecimiento, el escalado— estaba construida,
/// probada, y no podía dispararse nunca.
///
/// El residual no desaparece: pasa de ser la COMPUERTA a ser la MAGNITUD. Sigue ordenando la
/// lista (`compararPorResidual`), que es para lo que sirve.
export type EstadoPlanActivo = 'no-requiere' | 'con-plan' | 'pendiente' | 'sin-determinar';

export interface FilaAnalisis {
  codigo: string;
  nombre: string;
  valor: number;
  criticidad: string | null;
  proceso: string;
  propietario: string | null;
  persona: string | null;
  personaCorreo: string | null;
  cantidadAmenazas: number;
  peorInherente: NivelRiesgo | null;
  peorResidual: NivelRiesgo | null;
  /// REQ-SIG-24 §6.2 · la peor brecha de NIVEL del activo, en puntos. `null` cuando ninguna
  /// amenaza tiene brecha de nivel — que no es lo mismo que «cumple»: puede haber brecha de
  /// verificación (sin puntos) o brechas que no se pudieron evaluar. Para eso está
  /// `estadoPlan`, que sí distingue los tres casos.
  peorBrecha: number | null;
  estadoPlan: EstadoPlanActivo;
}

export interface DatosAnalisis {
  /// TODOS los activos vigentes (los 299), no solo los que entran al análisis. La gating —
  /// `valor >= umbral`— la aplica este módulo, con el mismo criterio que
  /// `lib/sgsi/riesgos.ts` (`entraAlAnalisis`): así «de 299» sale de contar el mismo arreglo,
  /// nunca de un segundo número que alguien podría dejar de actualizar (proposal AC3, tarea
  /// 1.10 — el umbral cambia sin recompilar).
  activos: readonly ActivoAnalizable[];
  bandas: readonly UmbralRiesgo[];
  /// `Parametro.umbral_valoracion`, nunca una constante.
  umbral: number;
}

export interface Tarjetas {
  enAnalisis: { n: number; deTotal: number };
  muyAltos: number;
  altos: number;
  /// REQ-SIG-24 §7 · era `residualCritico` y contaba activos cuyo peor residual caía en
  /// banda Crítico — una condición inalcanzable, así que la tarjeta era siempre 0. Ahora
  /// cuenta activos con una brecha MEDIDA: alguna amenaza cuyo control principal no alcanza
  /// lo que la criticidad o la valoración exigen, o que no tiene la verificación que C1 pide.
  conBrecha: number;
  /// Activos cuya brecha NO SE PUDO EVALUAR y que no tienen ninguna medida: sin control
  /// principal designado, o con el principal sin evaluar.
  ///
  /// Va aparte de `conBrecha` a propósito. Sumarlos diría que hay brechas donde nadie
  /// miró — el mismo «tablero que afirma con precisión» que REQ-SIG-23 §2 advierte, sólo
  /// que con el signo invertido. Y hoy no es un caso de borde: mientras REQ-SIG-21 no corra,
  /// las 57 amenazas caen acá, así que esta cifra es la medida de cuánto del análisis
  /// todavía no se puede hacer.
  sinDeterminar: number;
  /// `null` = la deuda de planes todavía no se puede determinar (no se proveyó
  /// `resolverDeuda`, porque la Fase 4 no existe todavía). Nunca `0` por ausencia: `0` es una
  /// afirmación —«no hay deuda»— que esta fase no puede hacer.
  sinPlan: number | null;
}

function figurasNoObsoletas(riesgos: readonly RiesgoAnalizable[], figura: 'potencial' | 'residual'): (string | null)[] {
  return riesgos.filter((r) => !r.obsoleto).map((r) => r[figura]);
}

function peorInherente(a: ActivoAnalizable, bandas: readonly UmbralRiesgo[]): NivelRiesgo | null {
  return nivelDeRiesgoDelActivo(figurasNoObsoletas(a.riesgos, 'potencial'), bandas);
}

function peorResidual(a: ActivoAnalizable, bandas: readonly UmbralRiesgo[]): NivelRiesgo | null {
  return nivelDeRiesgoDelActivo(figurasNoObsoletas(a.riesgos, 'residual'), bandas);
}

/// La brecha de un (activo, amenaza), con los datos que la fila ya trae. Es el único lugar
/// donde esta pantalla arma la entrada de `evaluarBrecha`: la exigencia y la brecha viven en
/// `lib/sgsi/exigencia.ts` y acá sólo se las consulta.
export function brechaDelRiesgo(
  a: ActivoAnalizable,
  r: RiesgoAnalizable,
  hayVerificacionVigente?: HayVerificacionVigente,
): EstadoBrecha {
  return evaluarBrecha({
    criticidad: a.criticidad,
    valores: a.valores,
    degradacion: r.degradacion,
    nivelPrincipal: r.principal === undefined ? undefined : r.principal.nivel,
    codigoPrincipal: r.principal?.codigo,
    hayVerificacionVigente,
  });
}

/// Una brecha que EXIGE plan: falta nivel, o falta la verificación que C1 pide. Las dos son
/// afirmaciones positivas sobre algo que se miró.
function esDeuda(e: EstadoBrecha): boolean {
  return e.tipo === 'brecha' || e.tipo === 'brecha-de-verificacion';
}

/// Una brecha que NO SE PUDO EVALUAR. Nunca es `no-requiere`: decir «este activo no necesita
/// plan» porque nadie designó el control principal es exactamente el tablero que afirma con
/// precisión que no hay brechas. Hoy cubre las 57 amenazas (REQ-SIG-21 sin correr).
function esIndeterminada(e: EstadoBrecha): boolean {
  return (
    e.tipo === 'sin-principal' ||
    e.tipo === 'principal-sin-evaluar' ||
    e.tipo === 'verificacion-sin-determinar'
  );
}

/// El estado de plan del activo, por BRECHA (REQ-SIG-24 §7).
///
/// El orden de las preguntas es el que evita las dos mentiras posibles. Una brecha medida
/// manda sobre todo: si la hay, el activo requiere plan y sólo falta saber si ya lo tiene.
/// Si no hay ninguna medida pero alguna no se pudo evaluar, el estado es `sin-determinar` —
/// nunca `no-requiere`, porque «no miré» no es «no falta».
function estadoPlanDe(
  a: ActivoAnalizable,
  resolver: ResolverDeudaPlan | undefined,
  hayVerificacionVigente?: HayVerificacionVigente,
): EstadoPlanActivo {
  const vigentes = a.riesgos.filter((r) => !r.obsoleto);
  const conDeuda = vigentes.filter((r) => esDeuda(brechaDelRiesgo(a, r, hayVerificacionVigente)));

  if (conDeuda.length > 0) {
    if (resolver === undefined) return 'sin-determinar';
    const faltaAlguno = conDeuda.some(
      (r) => !resolver({ activoCodigo: a.codigo, amenazaCodigo: r.amenazaCodigo }),
    );
    return faltaAlguno ? 'pendiente' : 'con-plan';
  }

  const indeterminadas = vigentes.some((r) =>
    esIndeterminada(brechaDelRiesgo(a, r, hayVerificacionVigente)),
  );
  return indeterminadas ? 'sin-determinar' : 'no-requiere';
}

/// La peor brecha del activo, en puntos, para la columna «Brecha». `null` cuando ninguna
/// amenaza tiene una brecha de NIVEL — puede haberla de verificación, que no tiene puntos.
export function peorBrecha(
  a: ActivoAnalizable,
  hayVerificacionVigente?: HayVerificacionVigente,
): number | null {
  let peor: number | null = null;
  for (const r of a.riesgos) {
    if (r.obsoleto) continue;
    const e = brechaDelRiesgo(a, r, hayVerificacionVigente);
    if (e.tipo === 'brecha' && (peor === null || e.brecha > peor)) peor = e.brecha;
  }
  return peor;
}

/// Si el activo cumple los filtros. `excluir` deja pasar la dimensión que ese llamado no
/// quiere aplicar — así una tarjeta puede contar «lo que pasaría si» sin recorrer el universo
/// con un predicado aparte.
function coincideActivo(
  a: ActivoAnalizable,
  f: FiltrosAnalisis,
  bandas: readonly UmbralRiesgo[],
  resolver: ResolverDeudaPlan | undefined,
  umbral: number,
  excluir: keyof FiltrosAnalisis | null = null,
  hayVerificacionVigente?: HayVerificacionVigente,
): boolean {
  // La gating de P1: esta pantalla es «los activos que entran al análisis», siempre — no es
  // uno de los seis filtros que se puedan excluir para contar «lo que pasaría si».
  if (a.valor < umbral) return false;

  if (excluir !== 'proceso' && f.proceso !== TODOS_PROCESOS && a.proceso !== f.proceso) {
    return false;
  }

  if (excluir !== 'propietario' && f.propietario !== TODOS_PROPIETARIOS_ANALISIS) {
    if (f.propietario === SIN_ASIGNAR) {
      if (a.propietario !== null) return false;
    } else if (a.propietario !== f.propietario) return false;
  }

  if (excluir !== 'persona' && f.persona !== TODAS_PERSONAS_ANALISIS) {
    if (f.persona === SIN_ASIGNAR) {
      if (a.personaCorreo !== null) return false;
    } else if (a.personaCorreo !== f.persona) return false;
  }

  if (excluir !== 'criticidad' && f.criticidad !== TODAS_CRITICIDADES) {
    if (f.criticidad === SIN_ASIGNAR) {
      if (a.criticidad !== null) return false;
    } else if (a.criticidad !== f.criticidad) return false;
  }

  if (excluir !== 'valor' && f.valor !== 'ambos' && a.valor !== f.valor) return false;

  if (excluir !== 'bandaResidual' && f.bandaResidual !== null) {
    if (colorDeRenglon(peorInherente(a, bandas), peorResidual(a, bandas)) !== f.bandaResidual) {
      return false;
    }
  }

  if (excluir !== 'estadoPlan' && f.estadoPlan !== 'todos') {
    const estado = estadoPlanDe(a, resolver, hayVerificacionVigente);
    if (f.estadoPlan === 'requiere-plan') {
      if (estado === 'no-requiere') return false;
    } else if (estado !== f.estadoPlan) return false;
  }

  return true;
}

function filaDe(
  a: ActivoAnalizable,
  bandas: readonly UmbralRiesgo[],
  resolver: ResolverDeudaPlan | undefined,
  hayVerificacionVigente?: HayVerificacionVigente,
): FilaAnalisis {
  return {
    codigo: a.codigo,
    nombre: a.nombre,
    valor: a.valor,
    criticidad: a.criticidad,
    proceso: a.proceso,
    propietario: a.propietario,
    persona: a.persona,
    personaCorreo: a.personaCorreo,
    cantidadAmenazas: a.riesgos.filter((r) => !r.obsoleto).length,
    peorInherente: peorInherente(a, bandas),
    peorResidual: peorResidual(a, bandas),
    peorBrecha: peorBrecha(a, hayVerificacionVigente),
    estadoPlan: estadoPlanDe(a, resolver, hayVerificacionVigente),
  };
}

/// Peor residual primero. Un activo sin ningún residual calculado (sin relevancia asignada
/// todavía) va al final, no al principio: no tiene un residual que sea «el peor».
function compararPorResidual(x: FilaAnalisis, y: FilaAnalisis): number {
  const nx = x.peorResidual?.nivel ?? -1;
  const ny = y.peorResidual?.nivel ?? -1;
  if (nx !== ny) return ny - nx;
  return x.codigo.localeCompare(y.codigo, 'es');
}

/// `criticidad.codigo → rtoMinutos`, la proyección de `CriticidadNegocio` que
/// `ordenarPorCriticidad` necesita. `null` es C5 («sin SLA») — un valor declarado, no una
/// ausencia — y también lo que devuelve `.get()` para un código que el mapa no trae.
export type MapaRtoPorCriticidad = ReadonlyMap<string, number | null>;

/// Reordena las filas por criticidad, siguiendo el RTO en minutos —no el código— de menor a
/// mayor: el nivel más exigente (RTO más corto) primero. Un activo sin criticidad declarada
/// y un C5 "sin SLA" comparten `rtoMinutos: null` y van al final, en orden estable por
/// código — significan cosas distintas (trabajo pendiente vs. decisión), pero ninguno de los
/// dos tiene un tiempo de recuperación que ordenar contra los demás.
export function ordenarPorCriticidad(
  filas: readonly FilaAnalisis[],
  rtoPorCodigo: MapaRtoPorCriticidad,
): FilaAnalisis[] {
  const rtoDe = (f: FilaAnalisis): number | null =>
    f.criticidad === null ? null : (rtoPorCodigo.get(f.criticidad) ?? null);

  return [...filas].sort((x, y) => {
    const rx = rtoDe(x);
    const ry = rtoDe(y);
    if (rx === null && ry === null) return x.codigo.localeCompare(y.codigo, 'es');
    if (rx === null) return 1;
    if (ry === null) return -1;
    if (rx !== ry) return rx - ry;
    return x.codigo.localeCompare(y.codigo, 'es');
  });
}

/// Las filas de la lista: un renglón por activo en análisis que cumple los seis filtros,
/// ordenadas por peor residual descendente (§5.2).
export function filasAnalisis(
  datos: DatosAnalisis,
  filtros: FiltrosAnalisis,
  resolverDeuda?: ResolverDeudaPlan,
  hayVerificacionVigente?: HayVerificacionVigente,
): FilaAnalisis[] {
  return datos.activos
    .filter((a) =>
      coincideActivo(a, filtros, datos.bandas, resolverDeuda, datos.umbral, null, hayVerificacionVigente),
    )
    .map((a) => filaDe(a, datos.bandas, resolverDeuda, hayVerificacionVigente))
    .sort(compararPorResidual);
}

/// Las cinco tarjetas (§5.1). `enAnalisis.n` es literalmente `filasAnalisis(...).length` con
/// los MISMOS filtros: la tarjeta y la lista no pueden desacordar porque son la misma cuenta.
export function tarjetasAnalisis(
  datos: DatosAnalisis,
  filtros: FiltrosAnalisis,
  resolverDeuda?: ResolverDeudaPlan,
  hayVerificacionVigente?: HayVerificacionVigente,
): Tarjetas {
  const contarExcluyendo = (
    dimension: keyof FiltrosAnalisis,
    cumple: (a: ActivoAnalizable) => boolean,
  ): number =>
    datos.activos.filter(
      (a) =>
        coincideActivo(
          a,
          filtros,
          datos.bandas,
          resolverDeuda,
          datos.umbral,
          dimension,
          hayVerificacionVigente,
        ) && cumple(a),
    ).length;

  return {
    enAnalisis: {
      n: filasAnalisis(datos, filtros, resolverDeuda, hayVerificacionVigente).length,
      deTotal: datos.activos.length,
    },
    muyAltos: contarExcluyendo('valor', (a) => a.valor === 5),
    altos: contarExcluyendo('valor', (a) => a.valor === 4),
    conBrecha: contarExcluyendo('estadoPlan', (a) =>
      a.riesgos.some((r) => !r.obsoleto && esDeuda(brechaDelRiesgo(a, r, hayVerificacionVigente))),
    ),
    sinDeterminar: contarExcluyendo(
      'estadoPlan',
      (a) =>
        !a.riesgos.some((r) => !r.obsoleto && esDeuda(brechaDelRiesgo(a, r, hayVerificacionVigente))) &&
        a.riesgos.some((r) => !r.obsoleto && esIndeterminada(brechaDelRiesgo(a, r, hayVerificacionVigente))),
    ),
    sinPlan:
      resolverDeuda === undefined
        ? null
        : contarExcluyendo(
            'estadoPlan',
            (a) => estadoPlanDe(a, resolverDeuda, hayVerificacionVigente) === 'pendiente',
          ),
  };
}

// ============================================================================
// URL ⇄ filtros (§5.3) — mismo patrón que `inventario-filtros.ts` (REQ-SIG-18 §7-§8),
// aplicado a las seis dimensiones de esta pantalla. Design D7: «seis filtros
// URL-driven».
// ============================================================================

export interface CatalogosFiltroAnalisis {
  procesos: readonly string[];
  propietarios: readonly string[];
  /// Correos.
  personas: readonly string[];
  /// Los códigos `C1`..`C5`, en el orden del catálogo. Sin `SIN_CRITICIDAD`: esa opción la
  /// agrega la pantalla, porque no es un nivel del catálogo sino la ausencia de uno.
  criticidades: readonly string[];
}

export interface ParametrosLeiblesAnalisis {
  get(clave: string): string | null;
}

export interface LecturaFiltrosAnalisis {
  filtros: FiltrosAnalisis;
  avisos: string[];
}

const BANDAS_VALIDAS: readonly ColorRenglon[] = ['rojo', 'verde', 'blanco'];
const ESTADOS_PLAN_VALIDOS: readonly EstadoPlanFiltro[] = ['todos', 'pendiente', 'con-plan', 'no-requiere'];

function delCatalogo(
  crudo: string | null,
  catalogo: readonly string[],
  todos: string,
  nombre: string,
  avisos: string[],
  admiteSinAsignar: boolean,
): string {
  if (crudo === null || crudo === '') return todos;
  if (admiteSinAsignar && crudo === SIN_ASIGNAR) return SIN_ASIGNAR;
  if (!catalogo.includes(crudo)) {
    avisos.push(`El parámetro «${nombre}» traía «${crudo}», que no está en el análisis: se ignoró.`);
    return todos;
  }
  return crudo;
}

export function filtrosAnalisisDesdeUrl(
  params: ParametrosLeiblesAnalisis,
  catalogos: CatalogosFiltroAnalisis,
): LecturaFiltrosAnalisis {
  const avisos: string[] = [];

  const valorCrudo = params.get('valor');
  let valor: ValorFiltroAnalisis = 'ambos';
  if (valorCrudo === '4' || valorCrudo === '5') valor = Number(valorCrudo) as 4 | 5;
  else if (valorCrudo !== null && valorCrudo !== '' && valorCrudo !== 'ambos') {
    avisos.push(`El parámetro «valor» traía «${valorCrudo}», que no es 4, 5 ni «ambos»: se ignoró.`);
  }

  const bandaCruda = params.get('bandaResidual');
  let bandaResidual: ColorRenglon | null = null;
  if (bandaCruda !== null && bandaCruda !== '') {
    if ((BANDAS_VALIDAS as readonly string[]).includes(bandaCruda)) {
      bandaResidual = bandaCruda as ColorRenglon;
    } else {
      avisos.push(`El parámetro «bandaResidual» traía «${bandaCruda}», que no es una banda: se ignoró.`);
    }
  }

  const estadoCrudo = params.get('estadoPlan');
  let estadoPlan: EstadoPlanInterno = 'todos';
  if (estadoCrudo !== null && estadoCrudo !== '') {
    if ((ESTADOS_PLAN_VALIDOS as readonly string[]).includes(estadoCrudo)) {
      estadoPlan = estadoCrudo as EstadoPlanFiltro;
    } else {
      avisos.push(`El parámetro «estadoPlan» traía «${estadoCrudo}», que no es un estado: se ignoró.`);
    }
  }

  return {
    filtros: {
      proceso: delCatalogo(params.get('proceso'), catalogos.procesos, TODOS_PROCESOS, 'proceso', avisos, false),
      propietario: delCatalogo(
        params.get('propietario'),
        catalogos.propietarios,
        TODOS_PROPIETARIOS_ANALISIS,
        'propietario',
        avisos,
        true,
      ),
      persona: delCatalogo(
        params.get('persona'),
        catalogos.personas,
        TODAS_PERSONAS_ANALISIS,
        'persona',
        avisos,
        true,
      ),
      // `admiteSinAsignar` en true: «Sin clasificar» es una respuesta del desplegable, no
      // un código de criticidad inválido — y hoy es el estado de casi todo el inventario.
      criticidad: delCatalogo(
        params.get('criticidad'),
        catalogos.criticidades,
        TODAS_CRITICIDADES,
        'criticidad',
        avisos,
        true,
      ),
      valor,
      bandaResidual,
      estadoPlan,
    },
    avisos,
  };
}

/// Solo los parámetros que no están en su valor por defecto — nueve parámetros diciendo
/// «todos» no es un enlace, es ruido (mismo criterio que `inventario-filtros.ts`).
export function parametrosDeFiltrosAnalisis(filtros: FiltrosAnalisis): Record<string, string> {
  const p: Record<string, string> = {};
  if (filtros.proceso !== TODOS_PROCESOS) p.proceso = filtros.proceso;
  if (filtros.propietario !== TODOS_PROPIETARIOS_ANALISIS) p.propietario = filtros.propietario;
  if (filtros.persona !== TODAS_PERSONAS_ANALISIS) p.persona = filtros.persona;
  if (filtros.criticidad !== TODAS_CRITICIDADES) p.criticidad = filtros.criticidad;
  if (filtros.valor !== 'ambos') p.valor = String(filtros.valor);
  if (filtros.bandaResidual !== null) p.bandaResidual = filtros.bandaResidual;
  if (filtros.estadoPlan !== 'todos') p.estadoPlan = filtros.estadoPlan;
  return p;
}

export function consultaDeFiltrosAnalisis(filtros: FiltrosAnalisis): string {
  const p = new URLSearchParams(parametrosDeFiltrosAnalisis(filtros));
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}
