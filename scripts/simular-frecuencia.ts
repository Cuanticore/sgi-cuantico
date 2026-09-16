// scripts/simular-frecuencia.ts
//
// SIMULA subir un nivel la frecuencia de las amenazas sobre los activos de PRODUCCIÓN, sin
// escribir nada. Un nivel de la escala es ×10 (0.01 · 0.1 · 1 · 10 · 100), así que no es un
// ajuste fino: multiplica el inherente por diez y el residual con él.
//
// DOS LECTURAS, y la diferencia importa:
//   · todas      — cada amenaza del activo sube un nivel
//   · solo-D     — sólo las que degradan DISPONIBILIDAD
//
// La segunda es la defendible: un ambiente de producción expuesto sufre caídas e
// interrupciones más seguido que un activo promedio, y eso se sostiene ante un auditor. Decir
// que sobre el mismo activo los usuarios se equivocan diez veces más, o que hay diez veces más
// accesos no autorizados exitosos, no se sostiene.
//
//   DATABASE_URL=… npx tsx scripts/simular-frecuencia.ts <csv-relevancias>

import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { desglosarEficaciaAmenaza, type ControlAgregable } from '../lib/sgsi/madurez';
import { EFICACIA_MAXIMA } from '../lib/sgsi/formulas';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL no está definida');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const PESO = { Principal: 3, Complementario: 2, 'De apoyo': 1 } as const;
const TOPE_ARO = 100; // «Muy alta — ocurre a diario». Una amenaza ahí ya no puede subir.

function banda(v: number): string {
  if (v >= 25) return 'Crítico';
  if (v >= 5) return 'Alto';
  if (v >= 0.5) return 'Medio';
  return 'Bajo';
}

async function main(): Promise<void> {
  const csv = readFileSync(process.argv[2], 'utf8').trim().split('\n').slice(1);
  const rel = new Map<string, string>();
  for (const l of csv) {
    const [a, c, r] = l.trim().split(',');
    rel.set(`${a}|${c}`, r);
  }

  // Eficacia por amenaza con las relevancias propuestas y la madurez vigente.
  const pares = await prisma.controlAmenaza.findMany({
    include: {
      amenaza: { select: { codigo: true } },
      control: { select: { codigo: true, soa: true, actual: { select: { nivel: true } } } },
    },
  });
  const porAmenaza = new Map<string, ControlAgregable[]>();
  for (const p of pares) {
    if (p.control.soa === 'NO') continue;
    const r = rel.get(`${p.amenaza.codigo}|${p.control.codigo}`);
    const lista = porAmenaza.get(p.amenaza.codigo) ?? [];
    lista.push({
      nivel: p.control.actual?.nivel ?? null,
      peso: r ? PESO[r as keyof typeof PESO] : 1,
      esPrincipal: r === 'Principal',
    });
    porAmenaza.set(p.amenaza.codigo, lista);
  }
  const efi = new Map<string, number | null>();
  for (const [cod, cs] of porAmenaza) efi.set(cod, desglosarEficaciaAmenaza(cs).eficacia);

  // Qué amenazas degradan D, y su ARO actual.
  const amenazas = await prisma.amenaza.findMany({
    where: { activa: true },
    select: {
      codigo: true,
      frecuencia: { select: { vecesAno: true } },
      degradacion: {
        select: { dimension: { select: { codigo: true } }, degradacion: { select: { factor: true } } },
      },
    },
  });
  const degradaD = new Map<string, boolean>();
  /// AMENAZA DE INDISPONIBILIDAD: aquella cuya degradación en D es ESTRICTAMENTE mayor que
  /// en I y en C — la que el activo sufre como caída, no como fuga ni como alteración.
  ///
  /// La distinción no es cosmética. «Degrada D en algo» incluye a `E.1 Errores de los
  /// usuarios`, que reparte 0.5 en las tres dimensiones: subirle la frecuencia diría que los
  /// usuarios tumban el CRM a diario, que no se sostiene. `A.24 Denegación de servicio`
  /// (D=1.00, I=0, C=0) sí es una amenaza de indisponibilidad, y sobre un ambiente de
  /// producción expuesto es genuinamente más frecuente que sobre un activo promedio.
  const dominanteD = new Map<string, boolean>();
  const aro = new Map<string, number>();
  for (const a of amenazas) {
    const f = (cod: string): number =>
      Number(a.degradacion.find((d) => d.dimension.codigo === cod)?.degradacion.factor ?? 0);
    degradaD.set(a.codigo, f('D') > 0);
    dominanteD.set(a.codigo, f('D') > f('I') && f('D') > f('C'));
    aro.set(a.codigo, Number(a.frecuencia.vecesAno));
  }

  // TODOS los riesgos vigentes, no solo los de produccion: el alza de frecuencia se aplica
  // solo a produccion, pero la pregunta «cuantos activos quedan con residual visible» es
  // sobre el registro entero.
  const riesgos = await prisma.riesgo.findMany({
    where: { obsoleto: false },
    select: {
      riesgoPotencial: true,
      amenaza: { select: { codigo: true } },
      activo: { select: { codigo: true, nombre: true, entorno: { select: { nombre: true } } } },
    },
  });
  const esProduccion = (r: { activo: { entorno: { nombre: string } | null } }): boolean =>
    r.activo.entorno?.nombre === 'Producción';

  const residual = (inh: number, cod: string): number => {
    const e = efi.get(cod);
    return e === null || e === undefined ? inh : inh * (1 - Math.min(e, EFICACIA_MAXIMA));
  };
  /// El inherente si la frecuencia sube un nivel. Una amenaza ya en el tope no sube.
  const inhSubido = (
    r: (typeof riesgos)[number],
    alcance: 'todas' | 'degrada-D' | 'dominante-D',
  ): number => {
    const inh = Number(r.riesgoPotencial ?? 0);
    const cod = r.amenaza.codigo;
    if (alcance !== 'todas' && !esProduccion(r)) return inh;
    if (alcance === 'degrada-D' && !degradaD.get(cod)) return inh;
    if (alcance === 'dominante-D' && !dominanteD.get(cod)) return inh;
    if ((aro.get(cod) ?? 0) >= TOPE_ARO) return inh;
    return inh * 10;
  };

  const contar = (f: (r: (typeof riesgos)[number]) => number) => {
    const c: Record<string, number> = { Crítico: 0, Alto: 0, Medio: 0, Bajo: 0 };
    for (const r of riesgos) c[banda(f(r))] += 1;
    return ['Crítico', 'Alto', 'Medio', 'Bajo'].map((b) => `${b} ${String(c[b]).padStart(3)}`).join('  ');
  };

  const base = (r: (typeof riesgos)[number]) => residual(Number(r.riesgoPotencial ?? 0), r.amenaza.codigo);
  const todas = (r: (typeof riesgos)[number]) => residual(inhSubido(r, 'todas'), r.amenaza.codigo);
  const soloD = (r: (typeof riesgos)[number]) => residual(inhSubido(r, 'degrada-D'), r.amenaza.codigo);
  const domD = (r: (typeof riesgos)[number]) => residual(inhSubido(r, 'dominante-D'), r.amenaza.codigo);

  console.log(`Riesgos sobre activos en entorno «Producción»: ${riesgos.length}\n`);
  console.log('sin subir frecuencia              ', contar(base));
  console.log('+1 nivel · INDISPONIBILIDAD (D dom)', contar(domD));
  console.log('+1 nivel · cualquiera que degrade D', contar(soloD));
  console.log('+1 nivel · TODAS las amenazas      ', contar(todas));
  const lista = [...dominanteD].filter(([, v]) => v).map(([k]) => k).sort();
  console.log(`
Amenazas de indisponibilidad (${lista.length}): ${lista.join(' ')}`);

  /// Cuántos ACTIVOS quedan en cada banda según su PEOR residual — que es la cifra que la
  /// pantalla de Análisis muestra en la columna «Peor residual» y por la que ordena.
  const porActivo = (f: (r: (typeof riesgos)[number]) => number) => {
    const peor = new Map<string, number>();
    for (const r of riesgos) {
      // `Activo.codigo` es nullable en el esquema; un activo sin codigo no se puede agrupar
      // y se cuenta aparte antes que colarse bajo una clave inventada.
      const clave = r.activo.codigo;
      if (clave === null) continue;
      const v = f(r);
      if (!peor.has(clave) || v > peor.get(clave)!) peor.set(clave, v);
    }
    const c: Record<string, number> = { Crítico: 0, Alto: 0, Medio: 0, Bajo: 0 };
    for (const v of peor.values()) c[banda(v)] += 1;
    return c;
  };
  const a1 = porActivo(base);
  const a2 = porActivo(domD);
  console.log('\nACTIVOS por la banda de su PEOR residual:');
  console.log(
    `  hoy           Crítico ${a1.Crítico}  Alto ${String(a1.Alto).padStart(2)}` +
      `  Medio ${String(a1.Medio).padStart(2)}  Bajo ${a1.Bajo}`,
  );
  console.log(
    `  con +1 nivel  Crítico ${a2.Crítico}  Alto ${String(a2.Alto).padStart(2)}` +
      `  Medio ${String(a2.Medio).padStart(2)}  Bajo ${a2.Bajo}`,
  );

  const activos = [...new Set(riesgos.filter(esProduccion).map((r) => r.activo.codigo))].sort();
  console.log('\nPeor residual por activo de producción — base  ->  indisponibilidad:');
  for (const cod of activos) {
    const s = riesgos.filter((r) => r.activo.codigo === cod);
    const b = Math.max(...s.map(base));
    const d = Math.max(...s.map(domD));
    const peorD = s.reduce((x, y) => (domD(x) >= domD(y) ? x : y));
    console.log(
      `  ${cod}  ${b.toFixed(2).padStart(7)} ${banda(b).padEnd(8)} ->` +
        ` ${d.toFixed(2).padStart(7)} ${banda(d).padEnd(8)} (por ${peorD.amenaza.codigo})`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
