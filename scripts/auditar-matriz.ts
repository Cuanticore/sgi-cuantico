// scripts/auditar-matriz.ts
//
// Comprueba si el COLOR de cada casilla de la matriz clásica dice la verdad sobre los riesgos
// que cayeron dentro de ella.
//
// El color de una casilla sale de su riesgo REPRESENTATIVO —el punto medio de la banda de
// impacto por la frecuencia nominal de la columna—, no de lo que contiene. Eso es
// deliberado: una casilla vacía en zona crítica sigue siendo crítica. Pero si una casilla
// pintada «Medio» contiene riesgos cuyo residual real es «Alto», el color deja de ser una
// lectura y pasa a ser un error.
//
//   DATABASE_URL=… npx tsx scripts/auditar-matriz.ts

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { columnaDeFrecuencia, type ColumnaFrecuencia, type FilaImpacto } from '../lib/sgsi/matriz-clasica';
import { clasificar } from '../lib/sgsi/clasificar';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL no está definida');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const [uImpacto, uRiesgo, frecuencias] = await Promise.all([
    prisma.umbralImpacto.findMany({ orderBy: { orden: 'asc' } }),
    prisma.umbralRiesgo.findMany({ orderBy: { orden: 'asc' } }),
    prisma.escalaFrecuencia.findMany({ orderBy: { vecesAno: 'asc' } }),
  ]);

  const filas: FilaImpacto[] = uImpacto.map((u) => ({
    nombre: u.nombre,
    desde: Number(u.desde),
    hasta: Number(u.hasta),
    medio: (Number(u.desde) + Number(u.hasta)) / 2,
  }));
  const columnas: ColumnaFrecuencia[] = frecuencias.map((f) => ({
    nombre: f.nombre.split('—')[0].trim(),
    lectura: f.nombre,
    vecesAno: Number(f.vecesAno),
  }));
  const bandas = uRiesgo.map((u) => ({
    nombre: u.nombre,
    desde: u.desde.toString(),
    hasta: u.hasta.toString(),
    orden: u.orden,
  }));
  const orden = new Map(bandas.map((b, i) => [b.nombre, bandas.length - i]));

  const riesgos = await prisma.riesgo.findMany({
    where: { obsoleto: false },
    select: {
      impacto: true,
      riesgoPotencial: true,
      riesgoResidual: true,
      frecuenciaResidual: true,
      frecuencia: { select: { vecesAno: true } },
      amenaza: { select: { codigo: true, frecuencia: { select: { vecesAno: true } } } },
      activo: { select: { codigo: true } },
    },
  });

  const filaDe = (imp: number): number => {
    const i = filas.findIndex((f) => imp >= f.desde && imp <= f.hasta);
    return i === -1 ? filas.length - 1 : i;
  };

  for (const cara of ['INHERENTE', 'RESIDUAL'] as const) {
    console.log(`\n${'='.repeat(78)}\n${cara}\n${'='.repeat(78)}`);
    // celda -> { bandaCelda, bandas reales de lo que cayó dentro }
    const celdas = new Map<string, { casilla: string; dentro: Map<string, number>; peor: number; ejemplo: string }>();

    let ubicados = 0;
    for (const r of riesgos) {
      if (r.impacto === null) continue;
      const imp = Number(r.impacto);
      const aro =
        cara === 'INHERENTE'
          ? Number(r.frecuencia?.vecesAno ?? r.amenaza.frecuencia.vecesAno)
          : r.frecuenciaResidual === null
            ? null
            : Number(r.frecuenciaResidual);
      const valor =
        cara === 'INHERENTE'
          ? Number(r.riesgoPotencial ?? 0)
          : r.riesgoResidual === null
            ? null
            : Number(r.riesgoResidual);
      if (aro === null || valor === null) continue;

      const i = filaDe(imp);
      const j = columnaDeFrecuencia(aro, columnas);
      const clave = `${i}|${j}`;
      // La banda de la CASILLA: punto medio de la fila × frecuencia nominal de la columna.
      const casilla = clasificar(filas[i].medio * columnas[j].vecesAno, bandas) ?? '—';
      const real = clasificar(valor, bandas) ?? '—';

      const e = celdas.get(clave) ?? { casilla, dentro: new Map(), peor: 0, ejemplo: '' };
      e.dentro.set(real, (e.dentro.get(real) ?? 0) + 1);
      if (valor > e.peor) {
        e.peor = valor;
        e.ejemplo = `${r.activo.codigo} × ${r.amenaza.codigo}`;
      }
      celdas.set(clave, e);
      ubicados += 1;
    }

    console.log(`riesgos ubicados: ${ubicados}\n`);
    let discrepan = 0;
    for (const [clave, e] of [...celdas].sort()) {
      const [i, j] = clave.split('|').map(Number);
      const peorReal = [...e.dentro.keys()].reduce((a, b) =>
        (orden.get(b) ?? 0) > (orden.get(a) ?? 0) ? b : a,
      );
      const marca = (orden.get(peorReal) ?? 0) > (orden.get(e.casilla) ?? 0) ? '  <<< SUBESTIMA' : '';
      if (marca) discrepan += 1;
      const dentro = [...e.dentro].map(([b, n]) => `${b} ${n}`).join(', ');
      console.log(
        `  [${filas[i].nombre.padEnd(12)} × ${columnas[j].nombre.padEnd(9)}]` +
          ` casilla=${e.casilla.padEnd(8)} dentro: ${dentro.padEnd(34)}` +
          ` peor=${e.peor.toFixed(2).padStart(7)} (${e.ejemplo})${marca}`,
      );
    }
    console.log(`\ncasillas que SUBESTIMAN lo que contienen: ${discrepan} de ${celdas.size}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
