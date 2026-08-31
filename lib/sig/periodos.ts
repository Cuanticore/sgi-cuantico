// lib/sig/periodos.ts
//
// La etiqueta y la apertura de cada periodo. Puro a propósito: la unique tripla
// (obligación, persona, periodo) depende de que dos corridas de la generación etiqueten
// igual, y la frontera del día se prueba sin base de datos.
//
// America/Bogotá es UTC−5 sin DST: un día UTC es un día Bogotá, así que las fechas se
// tratan como días puros (medianoche UTC) y la comparación es por año-mes-día.

import type { Periodicidad } from '@prisma/client';

export interface PeriodoGenerable {
  etiqueta: string;
  apertura: Date;
  fechaLimite: Date;
}

interface EntradaPeriodos {
  periodicidad: Periodicidad;
  fechaInicio: Date;
  plazoDias: number;
}

function iso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/// Semana ISO: lunes como primer día. 2026-08-31 (lunes) es la semana 36 de 2026.
function semanaIso(fecha: Date): number {
  const copia = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  const dia = (copia.getUTCDay() + 6) % 7;
  copia.setUTCDate(copia.getUTCDate() - dia + 3);
  const primerJueves = new Date(Date.UTC(copia.getUTCFullYear(), 0, 4));
  const diaPrimero = (primerJueves.getUTCDay() + 6) % 7;
  primerJueves.setUTCDate(primerJueves.getUTCDate() - diaPrimero + 3);
  return 1 + Math.round((copia.getTime() - primerJueves.getTime()) / (7 * 24 * 3600 * 1000));
}

function diaDeSemana(periodicidad: Periodicidad, fecha: Date): number {
  switch (periodicidad) {
    case 'DIARIA':
    case 'UNICA':
      return fecha.getUTCDate();
    case 'SEMANAL':
      return fecha.getUTCDate() - ((fecha.getUTCDay() + 6) % 7);
    case 'MENSUAL':
    case 'TRIMESTRAL':
    case 'SEMESTRAL':
    case 'ANUAL':
      return 1;
  }
}

function mesDe(periodicidad: Periodicidad, fecha: Date): number {
  switch (periodicidad) {
    case 'TRIMESTRAL':
      return Math.floor(fecha.getUTCMonth() / 3) * 3;
    case 'SEMESTRAL':
      return Math.floor(fecha.getUTCMonth() / 6) * 6;
    default:
      return fecha.getUTCMonth();
  }
}

function desplazar(periodicidad: Periodicidad, fecha: Date, saltos: number): Date {
  const r = new Date(fecha);
  switch (periodicidad) {
    case 'DIARIA':
    case 'UNICA':
      r.setUTCDate(r.getUTCDate() + saltos);
      break;
    case 'SEMANAL':
      r.setUTCDate(r.getUTCDate() + saltos * 7);
      break;
    case 'MENSUAL':
      r.setUTCMonth(r.getUTCMonth() + saltos);
      break;
    case 'TRIMESTRAL':
      r.setUTCMonth(r.getUTCMonth() + saltos * 3);
      break;
    case 'SEMESTRAL':
      r.setUTCMonth(r.getUTCMonth() + saltos * 6);
      break;
    case 'ANUAL':
      r.setUTCFullYear(r.getUTCFullYear() + saltos);
      break;
  }
  return r;
}

/// `2026-S36`, `2026-09`, `2026-T3`, `2026-S2`, `2026`, o la fecha ISO en UNICA y DIARIA.
export function etiquetaDePeriodo(periodicidad: Periodicidad, fecha: Date): string {
  const año = fecha.getUTCFullYear();
  switch (periodicidad) {
    case 'DIARIA':
    case 'UNICA':
      return iso(fecha);
    case 'SEMANAL':
      return `${año}-S${String(semanaIso(fecha)).padStart(2, '0')}`;
    case 'MENSUAL':
      return `${año}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
    case 'TRIMESTRAL':
      return `${año}-T${Math.floor(fecha.getUTCMonth() / 3) + 1}`;
    case 'SEMESTRAL':
      return `${año}-S${Math.floor(fecha.getUTCMonth() / 6) + 1}`;
    case 'ANUAL':
      return String(año);
  }
}

/// El primer día del periodo que contiene a `fecha`.
export function aperturaDePeriodo(periodicidad: Periodicidad, fecha: Date): Date {
  if (periodicidad === 'DIARIA' || periodicidad === 'UNICA') return new Date(fecha);
  return new Date(
    Date.UTC(
      fecha.getUTCFullYear(),
      mesDe(periodicidad, fecha),
      diaDeSemana(periodicidad, fecha),
    ),
  );
}

/// Todos los periodos desde `fechaInicio` cuya apertura cae dentro del horizonte
/// (hoy + `horizonteDias`). UNICA produce exactamente uno. La fecha límite es la
/// apertura más `plazoDias` días (spec 3.4: «días desde la apertura del periodo»).
export function periodosHasta(
  entrada: EntradaPeriodos,
  hoy: Date,
  horizonteDias = 90,
): PeriodoGenerable[] {
  const { periodicidad, fechaInicio, plazoDias } = entrada;
  if (periodicidad === 'UNICA') {
    const apertura = aperturaDePeriodo(periodicidad, fechaInicio);
    return [{ etiqueta: iso(fechaInicio), apertura, fechaLimite: sumarDias(apertura, plazoDias) }];
  }

  const limite = sumarDias(hoy, horizonteDias);
  const periodos: PeriodoGenerable[] = [];
  let cursor = aperturaDePeriodo(periodicidad, fechaInicio);
  let saltos = 0;
  while (cursor.getTime() <= limite.getTime()) {
    periodos.push({
      etiqueta: etiquetaDePeriodo(periodicidad, cursor),
      apertura: cursor,
      fechaLimite: sumarDias(cursor, plazoDias),
    });
    saltos += 1;
    cursor = aperturaDePeriodo(periodicidad, desplazar(periodicidad, fechaInicio, saltos));
  }
  return periodos;
}

function sumarDias(fecha: Date, dias: number): Date {
  const r = new Date(fecha);
  r.setUTCDate(r.getUTCDate() + dias);
  return r;
}