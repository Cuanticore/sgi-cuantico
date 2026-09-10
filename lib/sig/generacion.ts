// lib/sig/generacion.ts
//
// Qué asignaciones faltan por crear. Puro a propósito: la idempotencia (R1) y el
// alcance resuelto al generar (R2) son decisiones que se prueban sin base de datos.
//
// Nunca toca lo ya generado: una obligación desactivada (R11) o una persona que entra
// después (R2) recibe solo lo que aún no existe.
//
// ── D3 · el alcance por activo ──
//
// Es la costura que vuelve al activo el eje del sistema. POL-TEC-01 exige que «los derechos
// de acceso sean revisados al menos una vez al año por el propietario de cada activo», y
// hasta ahora eso solo se podía cargar como una obligación anual sobre un cargo, con el
// activo nombrado en el título EN TEXTO LIBRE: se perdía la trazabilidad activo → tarea →
// registro, que es justo lo que un auditor pide.
//
// Con alcance por tipo, la generación produce **una asignación por activo vigente**,
// dirigida a su propietario. Una sola obligación cubre los 247 activos y sigue viva cuando
// entre el 248.

import type { AlcanceObligacion, Periodicidad } from '@prisma/client';
import {
  aplicarPiso,
  instanteMasTardio,
  periodosHasta,
  type PeriodoGenerable,
} from './periodos';

export interface ObligacionGenerable {
  id: number;
  contenidoId: number;
  alcance: AlcanceObligacion;
  alcancePersonaId: number | null;
  alcanceCargoId: number | null;
  alcanceAreaId: number | null;
  alcanceActivoId: number | null;
  alcanceTipoActivoId: number | null;
  alcanceNivelActivoId: number | null;
  /// A quién llega la asignación cuando el activo no tiene propietario. D3: «la asignación
  /// no se crea en el vacío — se dirige al responsable de seguimiento de la obligación y se
  /// marca el faltante. Un activo sin propietario es un hallazgo, no un error de
  /// generación.»
  responsableSeguimientoId: number;
  periodicidad: Periodicidad;
  fechaInicio: Date;
  plazoDias: number;
  activa: boolean;
  /// R12. Ausente se lee como `ANCLADA`, que es lo que el generador hacía antes de que la
  /// regla existiera: agregar el campo no cambia la conducta de nada que ya estuviera.
  anclaje?: Anclaje;
  /// **P16 · el piso.** No se puede exigir algo antes de que la obligación exista.
  ///
  /// Es lo que impide que una obligación creada hoy con `fechaInicio` retroactiva le cree a
  /// todo el mundo los periodos ya transcurridos, todos vencidos — el tercer caso de la tabla
  /// de §5.2. Ya está en el esquema (`Obligacion.creadaEn`).
  creadaEn: Date;
}

export type Anclaje = 'ANCLADA' | 'FLOTANTE';

export interface PersonaGenerable {
  id: number;
  activa: boolean;
  areaId: number | null;
  cargoId: number | null;
  /// **P16 · el piso.** Desde cuándo esta persona es colaboradora.
  ///
  /// `fechaIngreso ?? creadaEn`: quien no tiene fecha de ingreso cargada no puede quedar sin
  /// piso —eso le devolvería los nueve periodos vencidos que D-5 vino a prohibir— así que cae
  /// en la fecha en que el censo la trajo, que es lo más antiguo que la aplicación puede
  /// afirmar sobre ella.
  ingreso: Date;
  /// Desde cuándo pertenece al área y al cargo. **No es lo mismo que la bitácora**: la
  /// bitácora registra cuándo se digitó el cambio, y esto es desde cuándo la persona
  /// pertenece — que normalmente es anterior (el traslado fue el 1.º, se registró el 15).
  /// Generar contra la fecha de digitación le regalaría o le cobraría periodos según la
  /// diligencia de quien escribe en el sistema.
  areaDesde: Date | null;
  cargoDesde: Date | null;
}

export interface ActivoGenerable {
  id: number;
  /// Baja lógica. Sólo los vigentes generan: una obligación no le pide nada a un activo
  /// que salió del inventario.
  activo: boolean;
  tipoId: number;
  /// El propietario es un CARGO, no una persona (`Activo.propietarioId → CargoResponsable`).
  /// Por eso hay dos formas de quedarse sin destinatario: que el activo no tenga
  /// propietario, o que el cargo no lo ocupe nadie. Las dos terminan igual.
  propietarioId: number | null;
}

export interface AsignacionExistente {
  obligacionId: number | null;
  personaId: number;
  periodo: string;
  activoId: number | null;
  /// R12 · sólo lo mira el anclaje flotante, que necesita saber si el ciclo previo se
  /// cerró y cuándo. El anclaje anclado no los usa: su calendario no depende de nadie.
  fechaApertura?: Date;
  fechaCierre?: Date | null;
}

export interface AsignacionACrear {
  obligacionId: number | null;
  contenidoId: number | null;
  personaId: number;
  periodo: string;
  fechaApertura: Date;
  fechaLimite: Date;
  /// El activo sobre el que se ejecuta, o `null` en los alcances por persona.
  activoId: number | null;
}

export interface ObligacionRechazada {
  obligacionId: number;
  motivo: string;
}

export interface PlanGeneracion {
  crear: AsignacionACrear[];
  /// Las que NO se pudieron planificar, con el porqué. Existe para que la generación no
  /// falle en silencio: una obligación que no genera nada y no lo dice es indistinguible
  /// de una que ya estaba al día.
  rechazadas: ObligacionRechazada[];
}

/// Un destinatario de la asignación: la persona, y el activo cuando hay uno.
interface Destinatario {
  personaId: number;
  activoId: number | null;
  /// **P16 · el tercer término del piso, ya elegido por el alcance.**
  ///
  /// Cuál de las fechas de pertenencia aplica lo decide el alcance, y el alcance sólo se
  /// conoce acá — no en el arreglo de personas. Por eso viaja en el destinatario y no en
  /// `PersonaGenerable`: un solo campo `desde` obligaría a rearmar el censo por obligación.
  ///
  /// `null` cuando el alcance no tiene una pertenencia con principio propio (`TODOS`,
  /// `PERSONA`) o cuando la persona llegó por ser responsable de seguimiento y no por
  /// pertenecer a nada.
  pertenenciaDesde: Date | null;
}

const ALCANCES_POR_ACTIVO: AlcanceObligacion[] = ['ACTIVO', 'TIPO_ACTIVO', 'NIVEL_ACTIVO'];

export function esAlcancePorActivo(alcance: AlcanceObligacion): boolean {
  return ALCANCES_POR_ACTIVO.includes(alcance);
}

/// Los activos que una obligación alcanza. Sólo vigentes.
///
/// **Exportada para que la equivalencia con `prevision.ts` se pueda probar.** La duplicación
/// entre los dos módulos es consciente y declarada (`prevision.ts:10-13`), pero lo único que
/// la sostiene es que las dos digan lo mismo — y eso no se comprobaba con esto privado.
export function activosAlcanzados(
  obligacion: ObligacionGenerable,
  activos: readonly ActivoGenerable[],
): ActivoGenerable[] {
  const vigentes = activos.filter((a) => a.activo);
  switch (obligacion.alcance) {
    case 'ACTIVO':
      return vigentes.filter((a) => a.id === obligacion.alcanceActivoId);
    case 'TIPO_ACTIVO':
      return vigentes.filter((a) => a.tipoId === obligacion.alcanceTipoActivoId);
    default:
      return [];
  }
}

/// Quienes debe alcanzar una obligación, resuelto HOY (R2): quien ingrese después recibe
/// los periodos siguientes, nunca los pasados.
///
/// **Exportada para probar la equivalencia con `personasAlcanzadas` de `prevision.ts`.** Era
/// privada, y por eso la duplicación que `prevision.ts:10-13` declara —«se prueba que las dos
/// digan lo mismo sobre el mismo conjunto»— nunca se había probado. El precio ya se pagó una
/// vez: la previsión devolvía cero para `NIVEL_ACTIVO` en silencio mientras esto sí lo
/// conocía.
export function resolverAlcance(
  obligacion: ObligacionGenerable,
  personas: readonly PersonaGenerable[],
  activos: readonly ActivoGenerable[],
): { destinatarios: Destinatario[]; rechazo: string | null } {
  const activas = personas.filter((p) => p.activa);
  /// `desde` es el término de pertenencia que el alcance elige (P16). `null` cuando la
  /// pertenencia no tiene principio distinto del ingreso de la persona.
  const soloPersonas = (
    lista: PersonaGenerable[],
    desde: (p: PersonaGenerable) => Date | null,
  ): { destinatarios: Destinatario[]; rechazo: null } => ({
    destinatarios: lista.map((p) => ({
      personaId: p.id,
      activoId: null,
      pertenenciaDesde: desde(p),
    })),
    rechazo: null,
  });

  switch (obligacion.alcance) {
    case 'PERSONA':
      // Dirigida a una persona concreta: la pertenencia ES la persona, y su principio es su
      // ingreso, que el piso ya considera aparte.
      return soloPersonas(
        activas.filter((p) => p.id === obligacion.alcancePersonaId),
        () => null,
      );
    case 'CARGO':
      return soloPersonas(
        activas.filter((p) => p.cargoId === obligacion.alcanceCargoId),
        (p) => p.cargoDesde,
      );
    case 'AREA':
      return soloPersonas(
        activas.filter((p) => p.areaId === obligacion.alcanceAreaId),
        (p) => p.areaDesde,
      );
    case 'TODOS':
      // «Toda persona activa» no tiene principio distinto del ingreso (P16).
      return soloPersonas(activas, () => null);

    case 'NIVEL_ACTIVO':
      // Declarado en el enum y sin resolver todavía. **El motivo cambió y el mensaje estaba
      // viejo**: decía que `NivelActivo` «todavía no existe», y existe desde REQ-SIG-06 —
      // `Activo.nivelId` apunta a la jerarquía, está sembrada y `/tecnologia/mapa` la
      // recorre. Lo que falta es DECIDIR la semántica: si un alcance por nivel toca sólo
      // los activos de ese nivel exacto o también los de sus descendientes. Los tres grados
      // forman un árbol, y las dos lecturas dan conteos muy distintos.
      //
      // Se RECHAZA con motivo en vez de devolver una lista vacía, que se vería igual que
      // «ya estaba todo generado».
      return {
        destinatarios: [],
        rechazo:
          'el alcance por nivel de activo no está resuelto: falta decidir si toca sólo el ' +
          'nivel exacto o también sus descendientes',
      };

    case 'ACTIVO':
    case 'TIPO_ACTIVO': {
      const alcanzados = activosAlcanzados(obligacion, activos);
      if (alcanzados.length === 0) {
        return {
          destinatarios: [],
          rechazo:
            obligacion.alcance === 'ACTIVO'
              ? 'el activo del alcance no existe o está dado de baja'
              : 'ningún activo vigente pertenece a ese tipo',
        };
      }
      const destinatarios: Destinatario[] = [];
      for (const activo of alcanzados) {
        // El propietario es un cargo; los destinatarios son quienes lo ocupan. Se reparte
        // a TODOS los que lo ocupan, igual que el alcance por cargo: si dos personas
        // comparten el puesto, las dos son propietarias del activo.
        const duenos =
          activo.propietarioId === null
            ? []
            : activas.filter((p) => p.cargoId === activo.propietarioId);

        if (duenos.length === 0) {
          // D3: no se crea en el vacío. Va al responsable de seguimiento CON el activo, y
          // que sea un faltante se deriva al leer comparando contra `activo.propietarioId`
          // — no se guarda una marca que quedaría vieja el día que alguien le ponga
          // propietario.
          //
          // P16 · **sin término de pertenencia**: esta persona no llega por pertenecer a
          // nada, llega por ser la responsable del seguimiento. Su piso es el ingreso más la
          // fecha de la obligación, y nada más.
          destinatarios.push({
            personaId: obligacion.responsableSeguimientoId,
            activoId: activo.id,
            pertenenciaDesde: null,
          });
          continue;
        }
        // P16 · el término es `cargoDesde`: esta persona está sujeta a la revisión del activo
        // **desde que ocupa el cargo que lo posee**. Es lo que hace que ponerle un cargo a
        // alguien hoy no le cobre las revisiones del año pasado de sus cuarenta activos.
        for (const d of duenos) {
          destinatarios.push({
            personaId: d.id,
            activoId: activo.id,
            pertenenciaDesde: d.cargoDesde,
          });
        }
      }
      return { destinatarios, rechazo: null };
    }
  }
}

/// R12 · el anclaje FLOTANTE. **El siguiente periodo nace al cerrarse el previo**, a
/// `plazoDias` de esa fecha de cierre.
///
/// Devuelve como mucho UN periodo, y a menudo ninguno. Las tres situaciones:
///
/// - **Sin ciclo previo** → nace el primero, en `fechaInicio`. Es el arranque.
/// - **El último ciclo está cerrado** → nace el siguiente, abriendo el día del cierre.
/// - **El último ciclo sigue abierto** → **no nace nada.** Ésta es la consecuencia que la
///   pantalla tiene que advertir al elegir el anclaje: una obligación flotante que nadie
///   cierra DEJA DE GENERAR, y su primera asignación vencida es el único aviso que habrá.
///   No es un defecto de esta función: es lo que «flotante» significa, y esconderlo
///   generando igual convertiría el flotante en un anclado con otro nombre.
///
/// La etiqueta del periodo es la fecha ISO de apertura y no la del calendario —`2026-T3`—
/// porque un ciclo flotante no cae en un trimestre: cae donde lo dejó el cierre anterior.
/// Dos ciclos podrían caer en el mismo trimestre, y la etiqueta del calendario los
/// colapsaría contra la unique de idempotencia.
function periodoFlotante(
  obligacion: ObligacionGenerable,
  destino: Destinatario,
  existentes: readonly AsignacionExistente[],
): PeriodoGenerable[] {
  const mias = existentes.filter(
    (e) =>
      e.obligacionId === obligacion.id &&
      e.personaId === destino.personaId &&
      (e.activoId ?? null) === destino.activoId,
  );

  if (mias.length === 0) {
    const apertura = obligacion.fechaInicio;
    // `finVentana: null` · un ciclo flotante NO tiene ventana de calendario: no termina en
    // una fecha, termina cuando alguien lo cierra. Por eso `aplicarPiso` lo corre y nunca lo
    // descarta, que es la conducta correcta — el primer ciclo de quien acaba de entrar abre
    // el día que entra, no en la `fechaInicio` de la obligación.
    return [
      {
        etiqueta: iso(apertura),
        apertura,
        fechaLimite: sumarDias(apertura, obligacion.plazoDias),
        finVentana: null,
      },
    ];
  }

  // La última por apertura. Sin `fechaApertura` no se puede ordenar, y adivinar el orden
  // sería peor que no generar: se prefiere no generar y que el vencimiento avise.
  const ordenadas = [...mias].sort(
    (a, b) => (a.fechaApertura?.getTime() ?? 0) - (b.fechaApertura?.getTime() ?? 0),
  );
  const ultima = ordenadas[ordenadas.length - 1];
  const cierre = ultima.fechaCierre ?? null;
  if (cierre === null) return [];

  const apertura = cierre;
  // El ciclo que nace del cierre del anterior tampoco tiene ventana de calendario, y su
  // apertura ya es posterior al piso por construcción: el ciclo previo se cerró después de
  // que la persona entró y de que la obligación existiera. `aplicarPiso` lo deja intacto.
  return [
    {
      etiqueta: iso(apertura),
      apertura,
      fechaLimite: sumarDias(apertura, obligacion.plazoDias),
      finVentana: null,
    },
  ];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function sumarDias(fecha: Date, dias: number): Date {
  const r = new Date(fecha);
  r.setUTCDate(r.getUTCDate() + dias);
  return r;
}

export function planificarGeneracion(
  obligaciones: readonly ObligacionGenerable[],
  personas: readonly PersonaGenerable[],
  existentes: readonly AsignacionExistente[],
  hoy: Date,
  horizonteDias = 90,
  activos: readonly ActivoGenerable[] = [],
): PlanGeneracion {
  const yaExiste = new Set(
    existentes.map(
      (e) => `${e.obligacionId ?? 'x'}|${e.personaId}|${e.periodo}|${e.activoId ?? 'x'}`,
    ),
  );
  const crear: AsignacionACrear[] = [];
  const rechazadas: ObligacionRechazada[] = [];
  // El censo por id, para resolver el piso de cada destinatario sin recorrer el arreglo.
  const porId = new Map(personas.map((p) => [p.id, p]));

  for (const obligacion of obligaciones) {
    if (!obligacion.activa) continue; // R11: no genera nada nuevo.

    const { destinatarios, rechazo } = resolverAlcance(obligacion, personas, activos);
    if (rechazo !== null) {
      rechazadas.push({ obligacionId: obligacion.id, motivo: rechazo });
      continue;
    }
    if (destinatarios.length === 0) continue;

    // R12 · el anclaje decide de dónde salen los periodos. El flotante los calcula POR
    // DESTINATARIO —cada uno lleva su propio ciclo— así que no se pueden calcular una vez
    // afuera como los anclados.
    const anclados = (obligacion.anclaje ?? 'ANCLADA') === 'ANCLADA';
    const periodosAnclados = anclados ? periodosHasta(obligacion, hoy, horizonteDias) : [];

    for (const destino of destinatarios) {
      // P16 · el piso es el más tardío de tres instantes, y es POR PERSONA. El calendario
      // (`periodosAnclados`) se sigue calculando una sola vez afuera porque es el mismo para
      // todos —es el calendario, no la deuda de nadie—; lo que cambia por persona es cuáles
      // de esos periodos le corresponden y desde cuándo corre su plazo.
      const persona = porId.get(destino.personaId);
      // Un destinatario que el alcance produjo y el censo no tiene: no se genera. Adivinarle
      // un piso sería devolverle los periodos vencidos que D-5 vino a prohibir.
      if (!persona) continue;
      const piso = instanteMasTardio([
        obligacion.creadaEn,
        persona.ingreso,
        destino.pertenenciaDesde,
      ]);

      const calendario = anclados
        ? periodosAnclados
        : periodoFlotante(obligacion, destino, existentes);
      const periodos = aplicarPiso(calendario, piso, obligacion.plazoDias);
      for (const periodo of periodos) {
        const clave = `${obligacion.id}|${destino.personaId}|${periodo.etiqueta}|${destino.activoId ?? 'x'}`;
        if (yaExiste.has(clave)) continue;
        yaExiste.add(clave);
        crear.push({
          obligacionId: obligacion.id,
          contenidoId: obligacion.contenidoId,
          personaId: destino.personaId,
          periodo: periodo.etiqueta,
          fechaApertura: periodo.apertura,
          fechaLimite: periodo.fechaLimite,
          activoId: destino.activoId,
        });
      }
    }
  }

  return { crear, rechazadas };
}

/// Si esta asignación llegó al responsable de seguimiento porque el activo no tenía a quién
/// dirigirse. Se DERIVA al leer (invariante 1): guardarlo como columna quedaría viejo el día
/// que alguien le ponga propietario al activo, y la pantalla seguiría acusando un faltante
/// que ya se resolvió.
///
/// «Un activo sin propietario es un hallazgo, no un error de generación» (D3), así que esto
/// es lo que la pantalla usa para marcarlo — no para esconderlo.
export function esFaltanteDePropietario(
  asignacion: { personaId: number; activoId: number | null },
  obligacion: { responsableSeguimientoId: number },
  activo: { propietarioId: number | null } | null,
): boolean {
  if (asignacion.activoId === null || activo === null) return false;
  if (asignacion.personaId !== obligacion.responsableSeguimientoId) return false;
  return activo.propietarioId === null;
}
