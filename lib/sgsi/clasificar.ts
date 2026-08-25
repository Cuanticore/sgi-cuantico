// lib/sgsi/clasificar.ts
//
// Bands and zones are classified at READ time, never stored. A stored band is a second
// place a figure can live, and two places is how a report ends up contradicting itself.
//
// The thresholds arrive as data because the scales are parametrizable: the organisation
// reserves the right to return to a 0-10 scale without a deployment, and the bands are
// rescaled with it.

import Decimal from 'decimal.js';

export interface Umbral {
  nombre: string;
  desde: Decimal.Value;
  hasta: Decimal.Value;
}

/// Returns the band whose range contains the value. Ranges are inclusive at both ends,
/// as the workbook's LOOKUP semantics are.
export function clasificar(valor: Decimal.Value, umbrales: readonly Umbral[]): string | null {
  const v = new Decimal(valor);
  for (const u of umbrales) {
    if (v.gte(u.desde) && v.lte(u.hasta)) return u.nombre;
  }
  return null;
}

export const ZONAS = [
  'Zona 1 — Crítica',
  'Zona 2 — Atención',
  'Zona 3 — Asumible',
  'Zona 4 — Catastrófica poco probable',
] as const;

export type Zona = (typeof ZONAS)[number];

export interface CortesZona {
  /// Impact at or above this is "high" for zoning purposes.
  impactoAlto: Decimal.Value;
  /// Impact below this is "low".
  impactoBajo: Decimal.Value;
  /// Occurring at least this often per year is "frequent".
  aroFrecuente: Decimal.Value;
}

/// MAGERIT Libro I, chapter 3. Evaluated in strict order: the first matching rule wins,
/// so "high impact and frequent" is decided before "high impact and rare".
///
/// Zona 1 — Crítica                      impact high and occurs at least once a year
/// Zona 4 — Catastrófica poco probable   impact high but exceptional
/// Zona 3 — Asumible                     impact low and very infrequent
/// Zona 2 — Atención                     everything else
export function clasificarZona(
  impacto: Decimal.Value,
  aro: Decimal.Value,
  cortes: CortesZona = { impactoAlto: 3, impactoBajo: 1.5, aroFrecuente: 1 },
): Zona {
  const i = new Decimal(impacto);
  const f = new Decimal(aro);

  if (i.gte(cortes.impactoAlto) && f.gte(cortes.aroFrecuente)) return 'Zona 1 — Crítica';
  if (i.gte(cortes.impactoAlto)) return 'Zona 4 — Catastrófica poco probable';
  if (i.lt(cortes.impactoBajo) && f.lt(cortes.aroFrecuente)) return 'Zona 3 — Asumible';
  return 'Zona 2 — Atención';
}

/// The treatment the methodology suggests for a residual risk, from its band's POSITION in
/// the ordered threshold list — index 0 and 1 being the two worst bands, Crítico and Alto.
///
/// It lives here because it was written TWICE: once in the asset sheet, so the requirement
/// shows up on the field as you drag a maturity, and once in `guardarTratamiento`, which
/// refuses an unbacked treatment without a justification. Two copies of one threshold is two
/// things to edit and one to forget — and the day they disagree, the sheet asks for a
/// justification the action does not want, or accepts one it does.
///
/// Null in, null out: with no band there is no suggestion, and a treatment that no
/// suggestion backs is an override the action requires text for.
export function tratamientoSugerido(indiceBanda: number | null): string | null {
  if (indiceBanda === null) return null;
  return indiceBanda <= 1 ? 'Mitigar' : 'Aceptar y monitorear';
}
