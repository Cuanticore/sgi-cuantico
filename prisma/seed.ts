// prisma/seed.ts
//
// Seeds the SGSI domain from the handoff sources. Idempotent: every step upserts, so
// it can be re-run against a populated database.
//
// Run with:  npx prisma db seed        (or)  npx tsx prisma/seed.ts

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

import { seedEscalas } from './seeds/escalas';
import { seedMagerit } from './seeds/magerit';
import { seedIso, seedControlAmenaza } from './seeds/iso';
import { seedActivos } from './seeds/activos';
import { seedPlan } from './seeds/plan';
import { seedLineaBase } from './seeds/linea-base';
import { generarRiesgos } from '../lib/sgsi/riesgos';
import { verificarMetricas } from './seeds/verificar';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  console.log('Sembrando escalas, umbrales y parámetros…');
  await seedEscalas(prisma);

  console.log('Sembrando áreas, catálogos y taxonomía MAGERIT…');
  await seedMagerit(prisma);

  console.log('Sembrando controles ISO, dominios y capacidades…');
  await seedIso(prisma);

  console.log('Sembrando la línea base GAP 2 mar 2026…');
  await seedLineaBase(prisma);

  console.log('Sembrando el inventario de activos…');
  const { sembrados, sinCodigo } = await seedActivos(prisma);
  console.log(`  ${sembrados} activos${sinCodigo ? `, ${sinCodigo} sin código` : ''}.`);

  console.log('Sembrando el plan de tratamiento…');
  const acciones = await seedPlan(prisma);
  console.log(`  ${acciones} acciones.`);

  console.log('Cruce amenaza ↔ control…');
  const { escritos, conRelevancia, sinRelevancia } = await seedControlAmenaza(prisma);
  console.log(`  ${escritos} pares escritos.`);
  if (sinRelevancia > 0) {
    console.log(
      `  ${sinRelevancia} sin relevancia asignada: esas amenazas agregan la eficacia con\n` +
        '  la MEDIA PLANA de sus controles, que es lo que hace el AVERAGE de la columna AX\n' +
        '  del libro (MET-SIG-01 v2). El residual se calcula y las pantallas lo dicen.\n' +
        '  Para pasar a la regla ponderada con techo de la v3 §7.4, completá la columna\n' +
        '  RELEVANCIA de prisma/data/relevancia-pendiente.csv con Principal, Complementario\n' +
        '  o De apoyo. Cada amenaza necesita exactamente un Principal, y se asigna por\n' +
        '  amenaza completa: a medias se rechaza.',
    );
  }
  if (conRelevancia > 0) {
    console.log(`  ${conRelevancia} con relevancia: media ponderada con techo δ (v3 §7.4).`);
  }

  console.log('Generando los riesgos…');
  const d = await generarRiesgos(prisma);
  console.log(
    `  ${d.riesgosGenerados} riesgos sobre ${d.activosEnAnalisis} activos ` +
      `de ${d.activosEnInventario} en inventario` +
      (d.riesgosObsoletos ? `, ${d.riesgosObsoletos} marcados obsoletos` : '') +
      '.',
  );
  if (d.residualSinCalcular > 0) {
    console.log(
      `  ${d.residualSinCalcular} riesgos quedan SIN residual: ${d.amenazasSinControles} amenazas\n` +
        '  no tienen controles mapeados, así que su eficacia es desconocida, no cero.\n' +
        '  Escribir cero dejaría cada matriz residual idéntica a la inherente.',
    );
  }

  console.log('\nVerificando contra las cifras de referencia del libro…');
  const ok = await verificarMetricas(prisma);

  if (!ok) {
    throw new Error('La verificación de métricas falló: ver la tabla anterior.');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
