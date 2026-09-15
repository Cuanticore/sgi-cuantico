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
import { SIN_ASIGNAR } from './inventario-filtros';
import { colorDeRenglon, nivelDeRiesgoDelActivo, type ColorRenglon, type NivelRiesgo, type UmbralRiesgo } from './riesgo-activo';

export { SIN_ASIGNAR };

export const TODOS_PROCESOS = 'Todos los procesos';
export const TODOS_PROPIETARIOS_ANALISIS = 'Todos los propietarios';
export const TODAS_PERSONAS_ANALISIS = 'Todas las personas';

/// «4 · 5 · ambos» del §5.3. La lista de esta página solo contiene activos que ya alcanzan
/// el umbral, así que `'ambos'` no es un tercer filtro sino el estado sin filtrar.
export type ValorFiltroAnalisis = 'ambos' | 4 | 5;

/// Las cuatro opciones que el desplegable «estado del plan» ofrece. `'requiere-plan'` es un
/// quinto valor interno que solo la tarjeta RESIDUAL CRÍTICO usa (ver `tarjetasAnalisis`); no
/// aparece en el desplegable porque no es una pregunta que alguien elija, es lo que la
/// tarjeta necesita contar.
export type EstadoPlanFiltro = 'todos' | 'pendiente' | 'con-plan' | 'no-requiere';
type EstadoPlanInterno = EstadoPlanFiltro | 'requiere-plan';

export interface FiltrosAnalisis {
  proceso: string;
  propietario: string;
  persona: string;
  valor: ValorFiltroAnalisis;
  /// Reusa `ColorRenglon` de `riesgo-activo.ts` sin cambios (tarea 3.11). `null` = Todos.
  bandaResidual: ColorRenglon | null;
  estadoPlan: EstadoPlanInterno;
}

export const FILTROS_ANALISIS_VACIOS: FiltrosAnalisis = {
  proceso: TODOS_PROCESOS,
  propietario: TODOS_PROPIETARIOS_ANALISIS,
  persona: TODAS_PERSONAS_ANALISIS,
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
}

export interface ActivoAnalizable {
  codigo: string;
  nombre: string;
  /// `max(D, I, C)`, ya calculado por `lib/sgsi/formulas.ts` (`valorActivo`) — la única
  /// aritmética del valor, la misma que usan la ficha y el inventario.
  valor: number;
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

/// El estado de plan de un ACTIVO (no de un riesgo individual): basta que uno de sus riesgos
/// en banda Crítico no tenga plan activo para que el activo entero cuente como pendiente —
/// el §7.3 alerta nombrando el activo, no el riesgo.
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
  residualCritico: number;
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

/// El estado de plan del activo. `'no-requiere'` no depende del resolutor: se decide solo con
/// la banda del peor residual, que ya se puede calcular hoy.
function estadoPlanDe(
  a: ActivoAnalizable,
  bandas: readonly UmbralRiesgo[],
  resolver: ResolverDeudaPlan | undefined,
): EstadoPlanActivo {
  const residual = peorResidual(a, bandas);
  if (residual === null || residual.banda !== 'Crítico') return 'no-requiere';
  if (resolver === undefined) return 'sin-determinar';

  const criticos = a.riesgos.filter(
    (r) => !r.obsoleto && r.residual !== null && clasificar(r.residual, bandas) === 'Crítico',
  );
  const faltaAlguno = criticos.some(
    (r) => !resolver({ activoCodigo: a.codigo, amenazaCodigo: r.amenazaCodigo }),
  );
  return faltaAlguno ? 'pendiente' : 'con-plan';
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

  if (excluir !== 'valor' && f.valor !== 'ambos' && a.valor !== f.valor) return false;

  if (excluir !== 'bandaResidual' && f.bandaResidual !== null) {
    if (colorDeRenglon(peorInherente(a, bandas), peorResidual(a, bandas)) !== f.bandaResidual) {
      return false;
    }
  }

  if (excluir !== 'estadoPlan' && f.estadoPlan !== 'todos') {
    const estado = estadoPlanDe(a, bandas, resolver);
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
    estadoPlan: estadoPlanDe(a, bandas, resolver),
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
): FilaAnalisis[] {
  return datos.activos
    .filter((a) => coincideActivo(a, filtros, datos.bandas, resolverDeuda, datos.umbral))
    .map((a) => filaDe(a, datos.bandas, resolverDeuda))
    .sort(compararPorResidual);
}

/// Las cinco tarjetas (§5.1). `enAnalisis.n` es literalmente `filasAnalisis(...).length` con
/// los MISMOS filtros: la tarjeta y la lista no pueden desacordar porque son la misma cuenta.
export function tarjetasAnalisis(
  datos: DatosAnalisis,
  filtros: FiltrosAnalisis,
  resolverDeuda?: ResolverDeudaPlan,
): Tarjetas {
  const contarExcluyendo = (
    dimension: keyof FiltrosAnalisis,
    cumple: (a: ActivoAnalizable) => boolean,
  ): number =>
    datos.activos.filter(
      (a) => coincideActivo(a, filtros, datos.bandas, resolverDeuda, datos.umbral, dimension) && cumple(a),
    ).length;

  return {
    enAnalisis: {
      n: filasAnalisis(datos, filtros, resolverDeuda).length,
      deTotal: datos.activos.length,
    },
    muyAltos: contarExcluyendo('valor', (a) => a.valor === 5),
    altos: contarExcluyendo('valor', (a) => a.valor === 4),
    residualCritico: contarExcluyendo(
      'estadoPlan',
      (a) => estadoPlanDe(a, datos.bandas, resolverDeuda) !== 'no-requiere',
    ),
    sinPlan:
      resolverDeuda === undefined
        ? null
        : contarExcluyendo(
            'estadoPlan',
            (a) => estadoPlanDe(a, datos.bandas, resolverDeuda) === 'pendiente',
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
