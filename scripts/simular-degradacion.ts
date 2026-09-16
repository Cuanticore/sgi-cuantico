// scripts/simular-degradacion.ts
//
// SIMULA cambiar la degradación de UNA amenaza, sin escribir nada.
//
// La degradación es atributo de la AMENAZA y no del par (MET-SIG-01 §7.4), así que tocarla
// alcanza a todos los activos a los que esa amenaza aplica. Esto dice cuántos y con qué
// efecto antes de decidir.
//
//   DATABASE_URL=… npx tsx scripts/simular-degradacion.ts E.1 D=0.2,I=0.5,C=0.2

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { desglosarEficaciaAmenaza, type ControlAgregable } from '../lib/sgsi/madurez';
import { EFICACIA_MAXIMA } from '../lib/sgsi/formulas';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL no está definida');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function banda(v: number): string {
  if (v >= 25) return 'Crítico';
  if (v >= 5) return 'Alto';
  if (v >= 0.5) return 'Medio';
  return 'Bajo';
}

async function main(): Promise<void> {
  const codigo = process.argv[2];
  const nuevo: Record<string, number> = {};
  for (const t of (process.argv[3] ?? '').split(',').filter(Boolean)) {
    const [d, v] = t.split('=');
    nuevo[d.trim()] = Number(v);
  }

  const amenaza = await prisma.amenaza.findUnique({
    where: { codigo },
    select: {
      id: true,
      nombre: true,
      frecuencia: { select: { vecesAno: true } },
      degradacion: {
        select: {
          dimension: { select: { codigo: true } },
          degradacion: { select: { nombre: true, factor: true } },
        },
      },
      controles: {
        select: {
          relevancia: { select: { nombre: true, peso: true, esPrincipal: true } },
          control: { select: { soa: true, actual: { select: { nivel: true } } } },
        },
      },
    },
  });
  if (!amenaza) throw new Error(`No existe la amenaza ${codigo}`);

  const actual: Record<string, number> = {};
  for (const d of amenaza.degradacion) actual[d.dimension.codigo] = Number(d.degradacion.factor);

  const agregables: ControlAgregable[] = amenaza.controles
    .filter((c) => c.control.soa !== 'NO')
    .map((c) => ({
      nivel: c.control.actual?.nivel ?? null,
      peso: c.relevancia?.peso ?? 1,
      esPrincipal: c.relevancia?.esPrincipal ?? false,
    }));
  const e = desglosarEficaciaAmenaza(agregables).eficacia;
  const factor = e === null ? 1 : 1 - Math.min(e, EFICACIA_MAXIMA);

  console.log(`${codigo} — ${amenaza.nombre}`);
  console.log(`  frecuencia: ${Number(amenaza.frecuencia.vecesAno)} veces/año`);
  console.log(`  degradación HOY:   ${JSON.stringify(actual)}`);
  console.log(`  degradación NUEVA: ${JSON.stringify({ ...actual, ...nuevo })}`);
  console.log(`  eficacia agregada: ${((e ?? 0) * 100).toFixed(1)} %  → residual = inherente × ${factor.toFixed(3)}\n`);

  // Los riesgos de esta amenaza, con los valores por dimensión de su activo.
  const riesgos = await prisma.riesgo.findMany({
    where: { obsoleto: false, amenazaId: amenaza.id },
    select: {
      riesgoResidual: true,
      frecuencia: { select: { vecesAno: true } },
      activo: {
        select: {
          codigo: true,
          nombre: true,
          valores: {
            select: { dimension: { select: { codigo: true } }, valor: { select: { valor: true } } },
          },
        },
      },
    },
  });

  const conteo = { hoy: {} as Record<string, number>, nueva: {} as Record<string, number> };
  for (const b of ['Crítico', 'Alto', 'Medio', 'Bajo']) {
    conteo.hoy[b] = 0;
    conteo.nueva[b] = 0;
  }
  const cambian: { codigo: string; nombre: string; antes: number; despues: number }[] = [];

  for (const r of riesgos) {
    const v: Record<string, number> = {};
    for (const x of r.activo.valores) v[x.dimension.codigo] = x.valor.valor;
    const aro = Number(r.frecuencia?.vecesAno ?? amenaza.frecuencia.vecesAno);

    const impacto = (deg: Record<string, number>): number =>
      Math.max(...['D', 'I', 'C'].map((d) => (v[d] ?? 0) * (deg[d] ?? 0)));

    const antes = Number(r.riesgoResidual ?? 0);
    const despues = impacto({ ...actual, ...nuevo }) * aro * factor;
    conteo.hoy[banda(antes)] += 1;
    conteo.nueva[banda(despues)] += 1;
    if (banda(antes) !== banda(despues)) {
      cambian.push({ codigo: r.activo.codigo ?? '—', nombre: r.activo.nombre, antes, despues });
    }
  }

  console.log(`riesgos de ${codigo}: ${riesgos.length}`);
  console.log('  hoy  ', conteo.hoy);
  console.log('  nueva', conteo.nueva);
  console.log(`\nriesgos que CAMBIAN de banda: ${cambian.length}`);
  for (const c of cambian.slice(0, 12)) {
    console.log(
      `  ${c.codigo.padEnd(14)} ${c.antes.toFixed(2).padStart(6)} ${banda(c.antes).padEnd(7)} ->` +
        ` ${c.despues.toFixed(2).padStart(6)} ${banda(c.despues).padEnd(7)} ${c.nombre.slice(0, 30)}`,
    );
  }
  if (cambian.length > 12) console.log(`  … y ${cambian.length - 12} más`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
