// prisma/seeds/iso.ts
//
// The 93 Annex A controls, their four domains and fifteen operational capabilities,
// from docs/handoff_v2/design/iso-controles.js — the real fields extracted from the
// workbook, not the abbreviated catalogue.
//
// The threat-to-control junction is seeded here too, but only when the relevance
// assignment exists. See seedControlAmenaza below.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';

const DATA = join(process.cwd(), 'prisma', 'data');

interface ControlSeed {
  c: string; // codigo
  n: string; // nombre
  dom: string; // dominio
  cap: string; // capacidad operativa
  ap: number; // 1 aplica, 0 no aplica
  base: number | null;
  act: number | null;
  obj: number | null;
  ev: string; // evidencia, o la justificacion de no aplicabilidad
  am: string; // codigos de amenaza separados por coma
}

/// Narrow columns and radar axes cannot fit the full capability name.
const NOMBRE_CORTO: Record<string, string> = {
  'Gobierno': 'Gobierno',
  'Gestión de amenazas y vulnerabilidades': 'Amenazas y vulns.',
  'Gestión de activos': 'Activos',
  'Protección de la información': 'Protección de info.',
  'Gestión de identidad y acceso': 'Identidad y acceso',
  'Seguridad de proveedores': 'Proveedores',
  'Gestión de eventos de seguridad': 'Eventos de seguridad',
  'Continuidad': 'Continuidad',
  'Legal y cumplimiento': 'Legal',
  'Aseguramiento': 'Aseguramiento',
  'Seguridad de recursos humanos': 'Recursos humanos',
  'Seguridad física': 'Física',
  'Configuración segura': 'Configuración',
  'Seguridad de aplicaciones': 'Aplicaciones',
  'Seguridad de sistemas y redes': 'Sistemas y redes',
};

/// Display order for the radar, which differs from the declaration order.
const ORDEN_CAPACIDAD = [
  'Gobierno',
  'Gestión de activos',
  'Protección de la información',
  'Gestión de identidad y acceso',
  'Seguridad de sistemas y redes',
  'Seguridad de aplicaciones',
  'Configuración segura',
  'Gestión de amenazas y vulnerabilidades',
  'Gestión de eventos de seguridad',
  'Continuidad',
  'Seguridad de proveedores',
  'Seguridad de recursos humanos',
  'Seguridad física',
  'Legal y cumplimiento',
  'Aseguramiento',
];

export function leerControles(): {
  dominios: string[];
  capacidades: string[];
  controles: ControlSeed[];
} {
  return JSON.parse(readFileSync(join(DATA, 'iso-controles.json'), 'utf8'));
}

export async function seedIso(prisma: PrismaClient): Promise<void> {
  const { dominios, capacidades, controles } = leerControles();

  for (const [i, nombre] of dominios.entries()) {
    await prisma.dominioAnexoA.upsert({
      where: { nombre },
      update: { orden: i + 1 },
      create: { nombre, orden: i + 1 },
    });
  }

  for (const nombre of capacidades) {
    const nombreCorto = NOMBRE_CORTO[nombre];
    if (!nombreCorto) throw new Error(`Capacidad sin nombre corto: ${nombre}`);
    const orden = ORDEN_CAPACIDAD.indexOf(nombre) + 1;
    if (orden === 0) throw new Error(`Capacidad fuera del orden declarado: ${nombre}`);
    await prisma.capacidadOperativa.upsert({
      where: { nombre },
      update: { nombreCorto, orden },
      create: { nombre, nombreCorto, orden },
    });
  }

  const dominioPorNombre = new Map(
    (await prisma.dominioAnexoA.findMany()).map((d) => [d.nombre, d.id]),
  );
  const capacidadPorNombre = new Map(
    (await prisma.capacidadOperativa.findMany()).map((c) => [c.nombre, c.id]),
  );
  const madurezPorNivel = new Map(
    (await prisma.escalaMadurez.findMany()).map((m) => [m.nivel, m.id]),
  );

  const nivel = (n: number | null): number | null =>
    n === null ? null : madurezPorNivel.get(n) ?? null;

  for (const c of controles) {
    // Maturity levels are null exactly when the control does not apply. Letting a
    // single zero into an average instead is the bug this invariant prevents.
    const aplica = Boolean(c.ap);
    if (aplica !== (c.act !== null)) {
      throw new Error(`Control ${c.c}: aplicabilidad y niveles inconsistentes`);
    }

    const datos = {
      nombre: c.n,
      dominioId: dominioPorNombre.get(c.dom)!,
      capacidadId: capacidadPorNombre.get(c.cap)!,
      aplica,
      lineaBaseId: nivel(c.base),
      actualId: nivel(c.act),
      objetivoId: nivel(c.obj),
      evidencia: c.ev,
    };
    await prisma.control.upsert({
      where: { codigo: c.c },
      update: datos,
      create: { codigo: c.c, ...datos },
    });
  }

  // The control's own text is the first, non-removable evidence entry: for a control
  // that does not apply it IS the justification the Committee approved.
  for (const c of controles) {
    const control = await prisma.control.findUnique({ where: { codigo: c.c } });
    if (!control) continue;
    const yaEsta = await prisma.evidencia.findFirst({
      where: { controlId: control.id, esBase: true },
    });
    if (yaEsta) continue;
    await prisma.evidencia.create({
      data: {
        controlId: control.id,
        tipo: 'NOTA',
        texto: c.ev,
        esBase: true,
        orden: 0,
        creadaPor: 'semilla',
      },
    });
  }
}

/// Writes the 272 control↔threat pairs, with or without relevance.
///
/// THE PAIRS ARE DATA. They come from `prisma/data/control-amenaza.json`, extracted by
/// `prisma/extraer-pares.ts` from the AVERAGE formulas of the AX column of «Amenazas
/// MAGERIT» — the workbook's own aggregation names the controls of each threat. The `am`
/// field of the ISO control file carries the same mapping, and the two are cross-checked
/// here: two sources that disagree mean one of them is stale, and picking silently would
/// bake the wrong efficacy into every residual risk.
///
/// RELEVANCE IS A REFINEMENT, NOT A PRECONDITION. This used to write nothing at all until
/// every pair carried one, on the reasoning that a nullable relevance is how a plain mean
/// sneaks in. The reasoning was right about the risk and wrong about the remedy: the table
/// stayed empty, every threat read as "no controls mapped", efficacy came back null, and
/// all 2256 residual risks rendered "sin calcular". The tool's whole residual half was dark
/// to protect a distinction nobody could see.
///
/// So a pair with no relevance is written with `relevanciaId: null`, and that null MEANS
/// something precise: aggregate this threat the way the workbook does — weight 1, no
/// principal, hence a plain mean, MET-SIG-01 v2. Assigning relevance upgrades that threat
/// to the weighted-and-capped v3 §7.4 rule. The screens say which of the two produced the
/// number, so the plain mean is never mistaken for the approved method.
export async function seedControlAmenaza(prisma: PrismaClient): Promise<{
  escritos: number;
  conRelevancia: number;
  sinRelevancia: number;
}> {
  const pares: { amenaza: string; control: string }[] = JSON.parse(
    readFileSync(join(DATA, 'control-amenaza.json'), 'utf8'),
  );

  // Cross-check against the second source. A disagreement is reported, never resolved by
  // preference: the workbook formula and the control file are supposed to say the same
  // thing, and if they do not, somebody has to look.
  const { controles } = leerControles();
  const desdeControles = new Set<string>();
  for (const c of controles) {
    for (const a of String(c.am).split(',').map((s) => s.trim()).filter(Boolean)) {
      desdeControles.add(`${a}|${c.c}`);
    }
  }
  const delLibro = new Set(pares.map((p) => `${p.amenaza}|${p.control}`));
  const soloLibro = [...delLibro].filter((k) => !desdeControles.has(k));
  const soloControles = [...desdeControles].filter((k) => !delLibro.has(k));
  if (soloLibro.length > 0 || soloControles.length > 0) {
    console.log(
      `  aviso: el libro y iso-controles no coinciden — ${soloLibro.length} sólo en el libro, ` +
        `${soloControles.length} sólo en los controles. Se usa el libro (es la fuente de la fórmula).`,
    );
    if (soloLibro.length > 0) console.log(`    sólo en el libro: ${soloLibro.slice(0, 6).join(' · ')}`);
    if (soloControles.length > 0) {
      console.log(`    sólo en controles: ${soloControles.slice(0, 6).join(' · ')}`);
    }
  }

  const asignacion = leerAsignacionRelevancia();

  // A threat with relevance on SOME of its pairs and not others is refused. That mixture
  // would weight one control at 3 and its sibling at 1 for no stated reason, which reads
  // as a decision and is an omission.
  const porAmenaza = new Map<string, { total: number; asignados: number; principales: number }>();
  for (const p of pares) {
    const clave = `${p.amenaza}|${p.control}`;
    const nombre = asignacion.get(clave);
    const acc = porAmenaza.get(p.amenaza) ?? { total: 0, asignados: 0, principales: 0 };
    acc.total++;
    if (nombre) acc.asignados++;
    if (nombre === 'Principal') acc.principales++;
    porAmenaza.set(p.amenaza, acc);
  }
  const parciales = [...porAmenaza.entries()].filter(
    ([, a]) => a.asignados > 0 && a.asignados < a.total,
  );
  if (parciales.length > 0) {
    throw new Error(
      `Estas amenazas tienen la relevancia asignada a medias: ` +
        parciales.map(([a, x]) => `${a} (${x.asignados}/${x.total})`).join(', '),
    );
  }
  // Exactly one Principal, but only for the threats that were actually assigned.
  const malPrincipal = [...porAmenaza.entries()].filter(
    ([, a]) => a.asignados === a.total && a.total > 0 && a.principales !== 1,
  );
  if (malPrincipal.length > 0) {
    throw new Error(
      `Estas amenazas no tienen exactamente un control Principal: ` +
        malPrincipal.map(([a, x]) => `${a} (${x.principales})`).join(', '),
    );
  }

  const relevanciaPorNombre = new Map(
    (await prisma.relevanciaControl.findMany()).map((r) => [r.nombre, r.id]),
  );
  const amenazaPorCodigo = new Map((await prisma.amenaza.findMany()).map((a) => [a.codigo, a.id]));
  const controlPorCodigo = new Map((await prisma.control.findMany()).map((c) => [c.codigo, c.id]));

  let escritos = 0;
  let conRelevancia = 0;
  const perdidos: string[] = [];

  for (const p of pares) {
    const amenazaId = amenazaPorCodigo.get(p.amenaza);
    const controlId = controlPorCodigo.get(p.control);
    if (!amenazaId || !controlId) {
      perdidos.push(`${p.amenaza}|${p.control}`);
      continue;
    }
    const nombre = asignacion.get(`${p.amenaza}|${p.control}`);
    const relevanciaId = nombre ? (relevanciaPorNombre.get(nombre) ?? null) : null;
    if (nombre && relevanciaId === null) {
      throw new Error(`Relevancia desconocida en el CSV: «${nombre}»`);
    }
    await prisma.controlAmenaza.upsert({
      where: { amenazaId_controlId: { amenazaId, controlId } },
      update: { relevanciaId },
      create: { amenazaId, controlId, relevanciaId },
    });
    escritos++;
    if (relevanciaId !== null) conRelevancia++;
  }

  // A pair whose threat or control does not exist is a data error, not a rounding issue:
  // the threat would silently aggregate over fewer controls than the workbook does.
  if (perdidos.length > 0) {
    throw new Error(
      `${perdidos.length} pares no encontraron su amenaza o su control: ${perdidos.slice(0, 8).join(' · ')}`,
    );
  }

  return { escritos, conRelevancia, sinRelevancia: escritos - conRelevancia };
}

/// Reads the worksheet the SIG lead fills in. An empty RELEVANCIA column means the
/// assignment has not been made yet.
function leerAsignacionRelevancia(): Map<string, string> {
  const asignacion = new Map<string, string>();
  let csv: string;
  try {
    csv = readFileSync(join(DATA, 'relevancia-pendiente.csv'), 'utf8');
  } catch {
    return asignacion;
  }

  const lineas = csv.replace(/^﻿/, '').trim().split(/\r?\n/).slice(1);
  for (const linea of lineas) {
    // nombre_control is JSON-quoted and may contain commas, so read the edges.
    const campos = linea.split(',');
    const amenaza = campos[0]?.trim();
    const control = campos[1]?.trim();
    const relevancia = campos[campos.length - 1]?.trim();
    if (amenaza && control && relevancia) {
      asignacion.set(`${amenaza}|${control}`, relevancia);
    }
  }
  return asignacion;
}
