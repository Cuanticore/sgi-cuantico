// lib/sig/prevision.ts
//
// «Antes de guardar · esto es lo que va a generar».
//
// Es la pieza del lienzo de Nueva obligación que la pantalla no tenía, y es la que importa:
// una obligación mensual con alcance TODOS sobre 34 personas produce 408 asignaciones al
// año. Sin esta cuenta, eso se descubre DESPUÉS de crearla — y las asignaciones ya
// generadas no se borran, porque cada una puede tener un registro de realizado detrás.
//
// La resolución del alcance vive acá y en `planificarGeneracion`, y eso es una duplicación
// consciente: la previsión responde «¿cuántas serían?» sin escribir nada, y la generación
// responde «¿cuáles faltan?» contra lo que ya existe. Comparten la regla del alcance y
// nada más, así que se prueba que las dos digan lo mismo sobre el mismo conjunto.

import { periodosHasta } from './periodos';
import type { Periodicidad } from '@prisma/client';
import type { Anclaje } from './generacion';

export type AlcanceObligacion =
  | 'PERSONA'
  | 'CARGO'
  | 'AREA'
  | 'TODOS'
  | 'ACTIVO'
  | 'TIPO_ACTIVO';

/// Un activo vigente con su tipo y su propietario (que es un CARGO, no una persona). Es lo
/// que la previsión necesita para contar el alcance por activo (D3).
export interface ActivoDelInventario {
  id: number;
  activo: boolean;
  tipoId: number;
  propietarioId: number | null;
}

export interface PersonaDelCenso {
  id: number;
  activa: boolean;
  areaId: number | null;
  cargoId: number | null;
}

export interface EntradaPrevision {
  alcance: AlcanceObligacion;
  alcancePersonaId?: number;
  alcanceCargoId?: number;
  alcanceAreaId?: number;
  alcanceActivoId?: number;
  alcanceTipoActivoId?: number;
  periodicidad: Periodicidad;
  fechaInicio: Date;
  plazoDias: number;
  /// R12. Ausente se lee como `ANCLADA`, igual que en la generación.
  anclaje?: Anclaje;
}

export interface Prevision {
  /// A cuántas personas alcanza HOY. El lienzo subraya que el alcance se resuelve al
  /// generar cada periodo, así que este número es de hoy y puede cambiar.
  personas: number;
  /// Cuantos ACTIVOS vigentes alcanza. Cero en los alcances por persona. Es la cifra que
  /// decide en el alcance por tipo: un tipo con 180 activos crea 180 asignaciones por
  /// periodo, y eso hay que verlo antes de guardar.
  activos: number;
  /// De esos activos, cuantos no tienen a quien dirigirse y van a caer en el responsable de
  /// seguimiento (D3). Es un aviso, no un error: un activo sin propietario es un hallazgo.
  activosSinDueno: number;
  periodosAlAnio: number;
  asignacionesAlAnio: number;
  /// Las primeras fechas límite, para ver si el plazo cae donde se espera.
  primerosVencimientos: string[];
  /// Lo que impide calcular, si algo falta.
  problemas: string[];
  /// Lo que se puede calcular pero conviene mirar dos veces antes de guardar.
  avisos: string[];
}

/// Cuántos periodos produce cada periodicidad en un año. `UNICA` es uno y sólo uno.
const PERIODOS_AL_ANIO: Record<Periodicidad, number> = {
  UNICA: 1,
  DIARIA: 365,
  SEMANAL: 52,
  MENSUAL: 12,
  TRIMESTRAL: 4,
  SEMESTRAL: 2,
  ANUAL: 1,
};

/// A quiénes alcanza. Sólo personas ACTIVAS: una obligación no le genera tareas a quien
/// salió de la organización, y contarla acá daría una previsión que la generación no
/// cumple.
export function personasAlcanzadas(
  entrada: EntradaPrevision,
  censo: readonly PersonaDelCenso[],
): PersonaDelCenso[] {
  const activas = censo.filter((p) => p.activa);
  switch (entrada.alcance) {
    case 'TODOS':
      return activas;
    case 'PERSONA':
      return activas.filter((p) => p.id === entrada.alcancePersonaId);
    case 'CARGO':
      return activas.filter((p) => p.cargoId === entrada.alcanceCargoId);
    case 'AREA':
      return activas.filter((p) => p.areaId === entrada.alcanceAreaId);
    // Los alcances por activo NO cuentan personas: cuentan activos. Una tarea por activo,
    // dirigida al cargo que lo posee. `activosAlcanzados` hace esa cuenta.
    case 'ACTIVO':
    case 'TIPO_ACTIVO':
      return [];
  }
}

/// Los activos VIGENTES que el alcance toca. Sólo vigentes: una obligación no le pide nada
/// a un activo que salió del inventario.
export function activosAlcanzados(
  entrada: EntradaPrevision,
  inventario: readonly ActivoDelInventario[],
): ActivoDelInventario[] {
  const vigentes = inventario.filter((a) => a.activo);
  switch (entrada.alcance) {
    case 'ACTIVO':
      return vigentes.filter((a) => a.id === entrada.alcanceActivoId);
    case 'TIPO_ACTIVO':
      return vigentes.filter((a) => a.tipoId === entrada.alcanceTipoActivoId);
    default:
      return [];
  }
}

function esPorActivo(alcance: AlcanceObligacion): boolean {
  return alcance === 'ACTIVO' || alcance === 'TIPO_ACTIVO';
}

export function preverGeneracion(
  entrada: EntradaPrevision,
  censo: readonly PersonaDelCenso[],
  hoy: Date,
  inventario: readonly ActivoDelInventario[] = [],
): Prevision {
  const problemas: string[] = [];
  const avisos: string[] = [];

  // Exactamente UN destino, que es la regla R4 que el servidor valida. Acá se dice antes,
  // porque el punto de la previsión es no llegar al error.
  const destinos = [
    entrada.alcance === 'PERSONA' ? entrada.alcancePersonaId : undefined,
    entrada.alcance === 'CARGO' ? entrada.alcanceCargoId : undefined,
    entrada.alcance === 'AREA' ? entrada.alcanceAreaId : undefined,
    entrada.alcance === 'ACTIVO' ? entrada.alcanceActivoId : undefined,
    entrada.alcance === 'TIPO_ACTIVO' ? entrada.alcanceTipoActivoId : undefined,
  ].filter((d) => d !== undefined);
  if (entrada.alcance !== 'TODOS' && destinos.length === 0) {
    problemas.push(`falta elegir a quién alcanza: el alcance es ${entrada.alcance.toLowerCase()}`);
  }

  if (!Number.isInteger(entrada.plazoDias) || entrada.plazoDias < 1) {
    problemas.push('el plazo tiene que ser al menos un día');
  }
  if (Number.isNaN(entrada.fechaInicio.getTime())) {
    problemas.push('falta el primer periodo');
  }

  if (problemas.length > 0) {
    return {
      personas: 0,
      activos: 0,
      activosSinDueno: 0,
      periodosAlAnio: 0,
      asignacionesAlAnio: 0,
      primerosVencimientos: [],
      problemas,
      avisos,
    };
  }

  const alcanzadas = personasAlcanzadas(entrada, censo);
  const activosDelAlcance = activosAlcanzados(entrada, inventario);
  const periodosAlAnio = PERIODOS_AL_ANIO[entrada.periodicidad];

  // En el alcance por activo la unidad es el ACTIVO, no la persona: D3 dice «una asignacion
  // por activo vigente». Un activo cuyo cargo propietario lo ocupan dos personas produce
  // dos, igual que el alcance por cargo.
  const cargosOcupados = new Set(censo.filter((p) => p.activa).map((p) => p.cargoId));
  const asignacionesPorPeriodo = esPorActivo(entrada.alcance)
    ? activosDelAlcance.reduce((total, a) => {
        if (a.propietarioId === null || !cargosOcupados.has(a.propietarioId)) return total + 1;
        return (
          total +
          censo.filter((p) => p.activa && p.cargoId === a.propietarioId).length
        );
      }, 0)
    : alcanzadas.length;
  const asignacionesAlAnio = asignacionesPorPeriodo * periodosAlAnio;
  const activosSinDueno = activosDelAlcance.filter(
    (a) => a.propietarioId === null || !cargosOcupados.has(a.propietarioId),
  ).length;

  // Las primeras fechas límite reales, del mismo módulo que usa la generación: si acá
  // saliera otra cuenta, la previsión estaría mintiendo sobre lo que va a pasar.
  const periodos = periodosHasta(
    {
      periodicidad: entrada.periodicidad,
      fechaInicio: entrada.fechaInicio,
      plazoDias: entrada.plazoDias,
    },
    hoy,
    120,
  );
  const primerosVencimientos = periodos
    .slice(0, 4)
    .map((p) => p.fechaLimite.toISOString().slice(0, 10));

  if (!esPorActivo(entrada.alcance) && alcanzadas.length === 0) {
    avisos.push(
      'el alcance no resuelve a ninguna persona activa: la obligación se crea y no genera nada ' +
        'hasta que alguien entre en ese alcance',
    );
  }
  if (esPorActivo(entrada.alcance) && activosDelAlcance.length === 0) {
    avisos.push(
      'el alcance no resuelve a ningún activo vigente: la obligación se crea y no genera nada ' +
        'hasta que entre uno',
    );
  }
  // D3: «un activo sin propietario es un hallazgo, no un error de generación». La tarea SE
  // CREA y va al responsable de seguimiento; el aviso dice cuántas van a llegarle, porque
  // con 234 de 247 activos sin propietario eso puede ser toda la carga en una sola bandeja.
  if (activosSinDueno > 0) {
    avisos.push(
      `${activosSinDueno} de ${activosDelAlcance.length} activo(s) no tienen a quién dirigirse ` +
        '—sin propietario, o con un cargo que nadie ocupa— así que esas tareas van a caer en ' +
        'el responsable de seguimiento y quedan marcadas como faltante',
    );
  }
  // 500 es donde una obligación deja de ser una tarea y pasa a ser una campaña. No se
  // bloquea —puede ser deliberado— pero nadie debería enterarse después.
  if (asignacionesAlAnio > 500) {
    avisos.push(
      `son ${asignacionesAlAnio} asignaciones al año: ${asignacionesPorPeriodo} por periodo por ` +
        `${periodosAlAnio} periodo(s). Cada una aparece en la bandeja de alguien`,
    );
  }
  if (entrada.periodicidad === 'DIARIA') {
    avisos.push(
      'una obligación diaria genera una asignación por persona por día: revisá que el ' +
        'contenido lo justifique',
    );
  }
  // R12 · con anclaje flotante la cuenta anual es un TECHO, no una previsión: el
  // siguiente ciclo nace al cerrar el previo, así que si nadie cierra no nace ninguno.
  // Callarlo dejaría a la pantalla prometiendo un número que la generación no va a
  // producir, que es peor que no prever nada.
  if ((entrada.anclaje ?? 'ANCLADA') === 'FLOTANTE') {
    avisos.push(
      'con anclaje flotante esta cuenta es el máximo posible: cada ciclo nace al cerrarse ' +
        'el anterior, así que una verificación que nadie cierre deja de generar',
    );
  }
  // El plazo más largo que el periodo deja dos asignaciones abiertas a la vez, para siempre.
  const diasDelPeriodo = Math.round(365 / periodosAlAnio);
  if (entrada.periodicidad !== 'UNICA' && entrada.plazoDias > diasDelPeriodo) {
    avisos.push(
      `el plazo (${entrada.plazoDias} d) es más largo que el periodo (${diasDelPeriodo} d): ` +
        'cada persona va a tener dos asignaciones abiertas a la vez de forma permanente',
    );
  }

  return {
    personas: alcanzadas.length,
    activos: activosDelAlcance.length,
    activosSinDueno,
    periodosAlAnio,
    asignacionesAlAnio,
    primerosVencimientos,
    problemas,
    avisos,
  };
}
