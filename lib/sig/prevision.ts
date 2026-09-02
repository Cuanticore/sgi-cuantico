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

export type AlcanceObligacion = 'PERSONA' | 'CARGO' | 'AREA' | 'TODOS';

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
  periodicidad: Periodicidad;
  fechaInicio: Date;
  plazoDias: number;
}

export interface Prevision {
  /// A cuántas personas alcanza HOY. El lienzo subraya que el alcance se resuelve al
  /// generar cada periodo, así que este número es de hoy y puede cambiar.
  personas: number;
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
  }
}

export function preverGeneracion(
  entrada: EntradaPrevision,
  censo: readonly PersonaDelCenso[],
  hoy: Date,
): Prevision {
  const problemas: string[] = [];
  const avisos: string[] = [];

  // Exactamente UN destino, que es la regla R4 que el servidor valida. Acá se dice antes,
  // porque el punto de la previsión es no llegar al error.
  const destinos = [
    entrada.alcance === 'PERSONA' ? entrada.alcancePersonaId : undefined,
    entrada.alcance === 'CARGO' ? entrada.alcanceCargoId : undefined,
    entrada.alcance === 'AREA' ? entrada.alcanceAreaId : undefined,
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
      periodosAlAnio: 0,
      asignacionesAlAnio: 0,
      primerosVencimientos: [],
      problemas,
      avisos,
    };
  }

  const alcanzadas = personasAlcanzadas(entrada, censo);
  const periodosAlAnio = PERIODOS_AL_ANIO[entrada.periodicidad];
  const asignacionesAlAnio = alcanzadas.length * periodosAlAnio;

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

  if (alcanzadas.length === 0) {
    avisos.push(
      'el alcance no resuelve a ninguna persona activa: la obligación se crea y no genera nada ' +
        'hasta que alguien entre en ese alcance',
    );
  }
  // 500 es donde una obligación deja de ser una tarea y pasa a ser una campaña. No se
  // bloquea —puede ser deliberado— pero nadie debería enterarse después.
  if (asignacionesAlAnio > 500) {
    avisos.push(
      `son ${asignacionesAlAnio} asignaciones al año: ${alcanzadas.length} persona(s) por ` +
        `${periodosAlAnio} periodo(s). Cada una aparece en la bandeja de alguien`,
    );
  }
  if (entrada.periodicidad === 'DIARIA') {
    avisos.push(
      'una obligación diaria genera una asignación por persona por día: revisá que el ' +
        'contenido lo justifique',
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
    periodosAlAnio,
    asignacionesAlAnio,
    primerosVencimientos,
    problemas,
    avisos,
  };
}
