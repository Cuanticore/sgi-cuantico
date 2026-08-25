// prisma/extraer-pares.ts
//
// Extracts the control↔threat mapping from the MAGERIT workbook into
// prisma/data/control-amenaza.json.
//
// WHERE THE DATA ACTUALLY LIVES, and why it was missed
//
// The AX column of «Amenazas MAGERIT» is headed "Eficacia media de sus controles (aux.)"
// and reads, per threat:
//
//     IFERROR(AVERAGE('4. Controles y Madurez'!$J$55, $J$61, $J$77, …))
//
// That argument list IS the mapping. It was never in a table anybody could read as data,
// which is why four passes over this workbook treated the 272 pairs as absent from every
// source and left the whole residual-risk half of the tool showing "sin calcular".
//
// Column J of «4. Controles y Madurez» is "Eficacia actual", itself
// `IF($F="No aplica","",IFERROR(VLOOKUP(H,MgMad,2,0),0))` — the control's current level
// through the maturity scale. So the workbook's aggregation is a PLAIN MEAN over the
// applicable controls of the threat, with no notion of relevance. MET-SIG-01 v3 §7.4 is
// what adds the weights and the cap.
//
// Run with:  npx tsx prisma/extraer-pares.ts

import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LIBRO = join(
  process.cwd(),
  'docs/handoff_v2/requisitos/MATRIZ MAGERIT - Activos y Riesgos (base) v2.xlsx',
);
const SALIDA = join(process.cwd(), 'prisma/data/control-amenaza.json');

/// Sheet indexes, resolved once from workbook.xml rather than hardcoded: a reordered tab
/// would silently point this at the wrong grid.
const HOJA_AMENAZAS = 'Amenazas MAGERIT';
const HOJA_CONTROLES = '4. Controles y Madurez';

function entidades(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

interface Celda {
  texto: string | null;
  formula: string | null;
}

/// Cells are SCANNED, not matched with one big pattern. This workbook mixes
/// `t="inlineStr"` bodies (`<is><t>`) with `<f>`/`<v>` pairs, and a single regex that
/// tries to cover both silently covers neither — it cost a full debugging pass.
function leerHoja(dir: string, archivo: string): (ref: string) => Celda | null {
  const xml = readFileSync(join(dir, 'xl/worksheets', archivo), 'utf8');
  const celdas = new Map<string, Celda>();
  const partes = xml.split('<c ');
  for (let i = 1; i < partes.length; i++) {
    const p = partes[i];
    const ref = /^r="([A-Z]+\d+)"/.exec(p)?.[1];
    if (!ref) continue;
    const corte = p.indexOf('</c>');
    const cuerpo = corte === -1 ? p : p.slice(0, corte);
    const enLinea = /<is><t[^>]*>([\s\S]*?)<\/t>/.exec(cuerpo);
    const valor = /<v>([\s\S]*?)<\/v>/.exec(cuerpo);
    const formula = /<f[^>]*>([\s\S]*?)<\/f>/.exec(cuerpo);
    celdas.set(ref, {
      texto: enLinea ? entidades(enLinea[1]).trim() : (valor?.[1] ?? null),
      formula: formula ? entidades(formula[1]) : null,
    });
  }
  return (ref) => celdas.get(ref) ?? null;
}

export interface ParExtraido {
  amenaza: string;
  control: string;
}

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), 'magerit-'));
  execSync(`unzip -o -q "${LIBRO}" -d "${dir}"`);

  const wb = readFileSync(join(dir, 'xl/workbook.xml'), 'utf8');
  const rels = readFileSync(join(dir, 'xl/_rels/workbook.xml.rels'), 'utf8');
  // Target comes BEFORE Id in this file's attribute order, and the target is absolute.
  const porRid = new Map(
    [...rels.matchAll(/<Relationship\b[^>]*?Target="([^"]+)"[^>]*?Id="(rId\d+)"/g)].map((m) => [
      m[2],
      m[1].split('/').pop() as string,
    ]),
  );
  const hojas = new Map(
    [...wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)].map((m) => [
      m[1].trim(),
      porRid.get(m[2]) as string,
    ]),
  );

  const archivoAmenazas = hojas.get(HOJA_AMENAZAS);
  const archivoControles = hojas.get(HOJA_CONTROLES);
  if (!archivoAmenazas || !archivoControles) {
    throw new Error(
      `No encontré las hojas necesarias. Disponibles: ${[...hojas.keys()].join(' · ')}`,
    );
  }

  const amenazas = leerHoja(dir, archivoAmenazas);
  const controles = leerHoja(dir, archivoControles);

  // A $J$55 reference means "the control on row 55", so the row has to resolve to a code.
  const codigoPorFila = new Map<number, string>();
  for (let fila = 6; fila <= 98; fila++) {
    const codigo = controles(`B${fila}`)?.texto;
    if (codigo) codigoPorFila.set(fila, codigo);
  }

  const pares: ParExtraido[] = [];
  const sinControles: string[] = [];
  let leidas = 0;

  for (let fila = 6; fila <= 62; fila++) {
    const amenaza = amenazas(`B${fila}`)?.texto;
    if (!amenaza) continue;
    leidas++;

    const formula = amenazas(`AX${fila}`)?.formula;
    const filas = formula
      ? [
          ...new Set(
            [...formula.matchAll(/'4\. Controles y Madurez'!\$J\$(\d+)/g)].map((m) =>
              Number(m[1]),
            ),
          ),
        ]
      : [];
    const codigos = filas.map((n) => codigoPorFila.get(n)).filter((c): c is string => Boolean(c));

    if (codigos.length === 0) {
      sinControles.push(amenaza);
      continue;
    }
    for (const control of codigos) pares.push({ amenaza, control });
  }

  // Guardrails. A silent partial extraction is worse than a failure: it would seed a
  // plausible-looking subset and every efficacy downstream would be quietly wrong.
  if (leidas !== 57) throw new Error(`Esperaba 57 amenazas y leí ${leidas}.`);
  if (sinControles.length > 0) {
    throw new Error(`Amenazas sin controles en la fórmula: ${sinControles.join(', ')}`);
  }
  if (codigoPorFila.size !== 93) {
    throw new Error(`Esperaba 93 controles y mapeé ${codigoPorFila.size}.`);
  }

  pares.sort((a, b) => a.amenaza.localeCompare(b.amenaza) || a.control.localeCompare(b.control));
  writeFileSync(SALIDA, `${JSON.stringify(pares, null, 1)}\n`, 'utf8');

  const porAmenaza = new Map<string, number>();
  for (const p of pares) porAmenaza.set(p.amenaza, (porAmenaza.get(p.amenaza) ?? 0) + 1);
  const tamanos = [...porAmenaza.values()];

  console.log(`pares extraídos:        ${pares.length}`);
  console.log(`amenazas:               ${porAmenaza.size}`);
  console.log(`controles distintos:    ${new Set(pares.map((p) => p.control)).size}`);
  console.log(
    `controles por amenaza:  mínimo ${Math.min(...tamanos)} · máximo ${Math.max(...tamanos)}`,
  );
  console.log(`escrito en ${SALIDA}`);
}

main();
