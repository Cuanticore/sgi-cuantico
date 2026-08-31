// lib/sig/generacion.ts
//
// Qué asignaciones faltan por crear. Puro a propósito: la idempotencia (R1) y el
// alcance resuelto al generar (R2) son decisiones que se prueban sin base de datos.
//
// Nunca toca lo ya generado: una obligación desactivada (R11) o una persona que entra
// después (R2) recibe solo lo que aún no existe.

import type { AlcanceObligacion, Periodicidad } from '@prisma/client';
import { periodosHasta } from './periodos';

export interface ObligacionGenerable {
  id: number;
  contenidoId: number;
  alcance: AlcanceObligacion;
  alcancePersonaId: number | null;
  alcanceCargoId: number | null;
  alcanceAreaId: number | null;
  periodicidad: Periodicidad;
  fechaInicio: Date;
  plazoDias: number;
  activa: boolean;
}

export interface PersonaGenerable {
  id: number;
  activa: boolean;
  areaId: number | null;
  cargoId: number | null;
}

export interface AsignacionExistente {
  obligacionId: number | null;
  personaId: number;
  periodo: string;
}

export interface AsignacionACrear {
  obligacionId: number | null;
  contenidoId: number | null;
  personaId: number;
  periodo: string;
  fechaApertura: Date;
  fechaLimite: Date;
}

export interface PlanGeneracion {
  crear: AsignacionACrear[];
}

/// Quienes debe alcanzar una obligación, resuelto HOY (R2): quien ingrese después recibe
/// los periodos siguientes, nunca los pasados.
function resolverAlcance(
  obligacion: ObligacionGenerable,
  personas: readonly PersonaGenerable[],
): PersonaGenerable[] {
  const activas = personas.filter((p) => p.activa);
  switch (obligacion.alcance) {
    case 'PERSONA':
      return activas.filter((p) => p.id === obligacion.alcancePersonaId);
    case 'CARGO':
      return activas.filter((p) => p.cargoId === obligacion.alcanceCargoId);
    case 'AREA':
      return activas.filter((p) => p.areaId === obligacion.alcanceAreaId);
    case 'TODOS':
      return activas;
  }
}

export function planificarGeneracion(
  obligaciones: readonly ObligacionGenerable[],
  personas: readonly PersonaGenerable[],
  existentes: readonly AsignacionExistente[],
  hoy: Date,
  horizonteDias = 90,
): PlanGeneracion {
  const yaExiste = new Set(
    existentes.map((e) => `${e.obligacionId ?? 'x'}|${e.personaId}|${e.periodo}`),
  );
  const crear: AsignacionACrear[] = [];

  for (const obligacion of obligaciones) {
    if (!obligacion.activa) continue; // R11: no genera nada nuevo.

    const alcanzadas = resolverAlcance(obligacion, personas);
    if (alcanzadas.length === 0) continue;

    const periodos = periodosHasta(obligacion, hoy, horizonteDias);
    for (const persona of alcanzadas) {
      for (const periodo of periodos) {
        const clave = `${obligacion.id}|${persona.id}|${periodo.etiqueta}`;
        if (yaExiste.has(clave)) continue;
        yaExiste.add(clave);
        crear.push({
          obligacionId: obligacion.id,
          contenidoId: obligacion.contenidoId,
          personaId: persona.id,
          periodo: periodo.etiqueta,
          fechaApertura: periodo.apertura,
          fechaLimite: periodo.fechaLimite,
        });
      }
    }
  }

  return { crear };
}