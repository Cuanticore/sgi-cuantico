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
  /// Dónde termina la ventana de este periodo: la apertura del siguiente.
  ///
  /// Existe para que `aplicarPiso` pueda decidir si el piso dejó este periodo atrás por
  /// completo (REQ-SIG-15 P17.1), y **no se puede derivar de `fechaLimite`**: el plazo suele
  /// ser más corto que el periodo. Con `plazoDias = 15` en una obligación mensual la ventana
  /// dura 30 días y el plazo 15, así que confundirlos descartaría el periodo en curso de
  /// quien entra el día 20 — justo la tarea que sí le corresponde.
  ///
  /// `null` en `UNICA`: un periodo único no cierra, así que nunca se descarta.
  finVentana: Date | null;
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
    return [
      {
        etiqueta: iso(fechaInicio),
        apertura,
        fechaLimite: sumarDias(apertura, plazoDias),
        finVentana: null,
      },
    ];
  }

  const limite = sumarDias(hoy, horizonteDias);
  const periodos: PeriodoGenerable[] = [];
  let cursor = aperturaDePeriodo(periodicidad, fechaInicio);
  let saltos = 0;
  while (cursor.getTime() <= limite.getTime()) {
    saltos += 1;
    // El siguiente cursor se calcula ANTES de empujar, porque es el fin de ventana de este
    // periodo. Es el mismo salto que el bucle ya hacía; sólo se adelanta una línea.
    const siguiente = aperturaDePeriodo(periodicidad, desplazar(periodicidad, fechaInicio, saltos));
    periodos.push({
      etiqueta: etiquetaDePeriodo(periodicidad, cursor),
      apertura: cursor,
      fechaLimite: sumarDias(cursor, plazoDias),
      finVentana: siguiente,
    });
    cursor = siguiente;
  }
  return periodos;
}

/// **P16–P18 · el piso de una asignación.** REQ-SIG-15 §5.2, decisión D-5.
///
/// «Ninguna asignación nace vencida.» La tarea es de la persona, así que su reloj empieza
/// cuando la persona la recibe. Dos efectos y ni uno más:
///
///   1. Un periodo cuya ventana **entera** terminó antes del piso no se genera. Los nueve
///      meses de enero a agosto no existen para quien llega en septiembre.
///   2. El periodo en curso se genera con el **plazo completo contado desde el piso**. Sin
///      esto, una obligación mensual con plazo de 15 días le crearía a quien entra el día 28
///      la tarea del mes con límite el día 16: vencida en el mismo instante en que se crea.
///
/// **Lo que NO hace, y es lo que sostiene la idempotencia (P18):** no toca la etiqueta. La
/// etiqueta es la del calendario —`2026-09`— y la unique es
/// `(obligacionId, personaId, periodo, activoId)`. Una etiqueta con la fecha de ingreso haría
/// que la corrida siguiente creara una SEGUNDA fila para el mismo periodo, y se perdería la
/// garantía T1 que permite reintentar sin miedo.
///
/// Consecuencia que hay que aceptar: dos personas pueden tener el mismo periodo de la misma
/// obligación con **fechas límite distintas**. Es correcto —el plazo es de la tarea de cada
/// uno, no del calendario— y ninguna pantalla necesita cambiar: `esVencida` ya se calcula
/// contra el `fechaLimite` de cada asignación.
export function aplicarPiso(
  periodos: readonly PeriodoGenerable[],
  piso: Date,
  plazoDias: number,
): PeriodoGenerable[] {
  const salida: PeriodoGenerable[] = [];
  for (const p of periodos) {
    // Sin ventana que cierre no hay nada que descartar: sólo se corre. Es `UNICA`, y
    // descartarla dejaría a quien entra hoy sin el compromiso de una sola vez —el acuerdo de
    // confidencialidad— que PRO-TAL-01 exige antes de habilitar cualquier acceso.
    if (p.finVentana !== null && piso.getTime() >= p.finVentana.getTime()) continue;
    if (piso.getTime() <= p.apertura.getTime()) {
      salida.push(p);
      continue;
    }
    const apertura = new Date(piso);
    salida.push({
      etiqueta: p.etiqueta,
      apertura,
      fechaLimite: sumarDias(apertura, plazoDias),
      finVentana: p.finVentana,
    });
  }
  return salida;
}

/// El más tardío de varios instantes, descartando los que no aplican. Es la fórmula del piso
/// de P16: no se puede exigir algo antes de que exista quien lo debe, la pertenencia que lo
/// obliga, o la obligación misma.
export function instanteMasTardio(fechas: readonly (Date | null | undefined)[]): Date {
  let maximo: Date | null = null;
  for (const f of fechas) {
    if (!f) continue;
    if (maximo === null || f.getTime() > maximo.getTime()) maximo = f;
  }
  // Sin ningún instante no hay piso: se devuelve el comienzo del tiempo, que deja el
  // calendario intacto. Es más seguro que inventar `hoy`, que descartaría periodos válidos.
  return maximo ?? new Date(0);
}

function sumarDias(fecha: Date, dias: number): Date {
  const r = new Date(fecha);
  r.setUTCDate(r.getUTCDate() + dias);
  return r;
}