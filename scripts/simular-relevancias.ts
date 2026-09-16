// scripts/simular-relevancias.ts
//
// SIMULA sin escribir una sola fila: aplica en memoria una asignación de relevancias
// (REQ-SIG-21) y, opcionalmente, bajadas de madurez, y dice qué residual saldría.
//
// Usa `desglosarEficaciaAmenaza` y la misma acotación de `calcularRiesgo` que
// `generarRiesgos` escribe, para que lo que se ve acá sea exactamente lo que quedaría y no
// una segunda aritmética que podría discrepar.
//
//   DATABASE_URL=… npx tsx scripts/simular-relevancias.ts <csv> [A.8.14=50,A.5.30=50]

import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { desglosarEficaciaAmenaza, type ControlAgregable } from '../lib/sgsi/madurez';
import { EFICACIA_MAXIMA } from '../lib/sgsi/formulas';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL no está definida');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const PESO = { Principal: 3, Complementario: 2, 'De apoyo': 1 } as const;
const BANDAS = ['Crítico', 'Alto', 'Medio', 'Bajo'] as const;

function banda(v: number): (typeof BANDAS)[number] {
  if (v >= 25) return 'Crítico';
  if (v >= 5) return 'Alto';
  if (v >= 0.5) return 'Medio';
  return 'Bajo';
}

interface Par {
  amenaza: string;
  control: string;
  nivel: number | null;
  relevancia: string | undefined;
}

/// Eficacia por amenaza bajo un escenario. `conRelevancia` false ignora la propuesta y deja
/// todo en peso 1 sin principal — la rama v2, que es como se calcula hoy.
function eficacias(
  pares: Par[],
  conRelevancia: boolean,
  override: Map<string, number>,
): { efi: Map<string, number | null>; techo: number } {
  const porAmenaza = new Map<string, ControlAgregable[]>();
  for (const p of pares) {
    const nivel = override.has(p.control) ? override.get(p.control)! : p.nivel;
    const lista = porAmenaza.get(p.amenaza) ?? [];
    lista.push(
      conRelevancia && p.relevancia
        ? {
            nivel,
            peso: PESO[p.relevancia as keyof typeof PESO],
            esPrincipal: p.relevancia === 'Principal',
          }
        : { nivel, peso: 1, esPrincipal: false },
    );
    porAmenaza.set(p.amenaza, lista);
  }
  const efi = new Map<string, number | null>();
  let techo = 0;
  for (const [cod, cs] of porAmenaza) {
    const d = desglosarEficaciaAmenaza(cs);
    efi.set(cod, d.eficacia);
    if (d.techoActua) techo += 1;
  }
  return { efi, techo };
}

async function main(): Promise<void> {
  const csv = readFileSync(process.argv[2], 'utf8').trim().split('\n').slice(1);
  const propuesta = new Map<string, string>();
  for (const l of csv) {
    const [a, c, r] = l.trim().split(',');
    propuesta.set(`${a}|${c}`, r);
  }

  const override = new Map<string, number>();
  for (const t of (process.argv[3] ?? '').split(',').filter(Boolean)) {
    const [c, n] = t.split('=');
    override.set(c.trim(), Number(n));
  }

  const crudos = await prisma.controlAmenaza.findMany({
    include: {
      amenaza: { select: { codigo: true } },
      control: { select: { codigo: true, soa: true, actual: { select: { nivel: true } } } },
    },
  });
  const pares: Par[] = crudos
    .filter((p) => p.control.soa !== 'NO')
    .map((p) => ({
      amenaza: p.amenaza.codigo,
      control: p.control.codigo,
      nivel: p.control.actual?.nivel ?? null,
      relevancia: propuesta.get(`${p.amenaza.codigo}|${p.control.codigo}`),
    }));

  const riesgos = await prisma.riesgo.findMany({
    where: { obsoleto: false },
    select: {
      riesgoPotencial: true,
      riesgoResidual: true,
      amenaza: { select: { codigo: true } },
      activo: { select: { codigo: true } },
    },
  });

  const residual = (efi: Map<string, number | null>) => (r: (typeof riesgos)[number]) => {
    const e = efi.get(r.amenaza.codigo);
    const inh = Number(r.riesgoPotencial ?? 0);
    return e === null || e === undefined ? inh : inh * (1 - Math.min(e, EFICACIA_MAXIMA));
  };

  const contar = (f: (r: (typeof riesgos)[number]) => number) => {
    const c: Record<string, number> = { Crítico: 0, Alto: 0, Medio: 0, Bajo: 0 };
    for (const r of riesgos) c[banda(f(r))] += 1;
    return BANDAS.map((b) => `${b} ${String(c[b]).padStart(3)}`).join('  ');
  };

  const sinOv = new Map<string, number>();
  const escenarios: [string, ReturnType<typeof eficacias>][] = [
    ['1. hoy — sin relevancias, madurez actual  ', eficacias(pares, false, sinOv)],
    ['2. sin relevancias + continuidad al 50 %  ', eficacias(pares, false, override)],
    ['3. CON relevancias, madurez actual        ', eficacias(pares, true, sinOv)],
    ['4. CON relevancias + continuidad al 50 %  ', eficacias(pares, true, override)],
  ];

  console.log(`Bajadas aplicadas: ${[...override].map(([c, n]) => `${c}->${n}%`).join(', ')}\n`);
  for (const [nombre, e] of escenarios) {
    console.log(`${nombre} ${contar(residual(e.efi))}   techo actúa en ${e.techo}/57`);
  }

  const focos = ['TEC-GEN-0004', 'TEC-EQU-0003', 'TEC-EQU-0007', 'TEC-GEN-0009', 'TEC-SER-0051'];
  console.log('\nPeor residual por activo — escenarios 1 y 4:');
  const r1 = residual(escenarios[0][1].efi);
  const r4 = residual(escenarios[3][1].efi);
  for (const cod of focos) {
    const suyos = riesgos.filter((r) => r.activo.codigo === cod);
    if (!suyos.length) continue;
    const a = Math.max(...suyos.map(r1));
    const b = Math.max(...suyos.map(r4));
    const peor = suyos.reduce((x, y) => (r4(x) >= r4(y) ? x : y));
    console.log(
      `  ${cod}  ${a.toFixed(2).padStart(6)} ${banda(a).padEnd(7)} ->` +
        ` ${b.toFixed(2).padStart(6)} ${banda(b).padEnd(7)} (por ${peor.amenaza.codigo})`,
    );
  }

  console.log('\nAmenazas de continuidad sobre MINTRACE producción (escenario 4):');
  const mint = riesgos.filter((r) => r.activo.codigo === 'TEC-GEN-0004');
  for (const c of ['A.24', 'E.24', 'I.5', 'I.6', 'I.8']) {
    const r = mint.find((x) => x.amenaza.codigo === c);
    if (!r) continue;
    const inh = Number(r.riesgoPotencial ?? 0);
    console.log(
      `  ${c.padEnd(5)} inherente ${inh.toFixed(2).padStart(6)}` +
        `   hoy ${r1(r).toFixed(2).padStart(6)} ${banda(r1(r)).padEnd(7)}` +
        ` ->  ${r4(r).toFixed(2).padStart(6)} ${banda(r4(r))}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
