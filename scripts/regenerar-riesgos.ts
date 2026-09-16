// scripts/regenerar-riesgos.ts
//
// Regenera los riesgos y NADA MÁS.
//
// POR QUÉ NO SE USA `prisma/seed.ts`. Esa siembra el inventario entero desde los JSON del
// repositorio —escalas, controles ISO, activos, plan, línea base— y sobreescribiría datos de
// producción con el contenido de un archivo versionado. Cuando lo único que hace falta es
// recalcular después de mover una madurez, correr la siembra completa es desproporcionado y
// destructivo.
//
// Acá se llama únicamente a `generarRiesgos`, que LEE el estado actual de la base y recalcula
// impacto, inherente, eficacia agregada y residual con la única implementación de la
// aritmética (`lib/sgsi/formulas.ts`). No escribe controles, ni activos, ni catálogos.
//
//   DATABASE_URL=… npx tsx scripts/regenerar-riesgos.ts

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { generarRiesgos } from '../lib/sgsi/riesgos';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL no está definida');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  console.log('Regenerando los riesgos con la madurez vigente…');
  const d = await generarRiesgos(prisma);
  console.log(`  activos en inventario:            ${d.activosEnInventario}`);
  console.log(`  activos en análisis:              ${d.activosEnAnalisis}`);
  console.log(`  riesgos generados:                ${d.riesgosGenerados}`);
  console.log(`  riesgos marcados obsoletos:       ${d.riesgosObsoletos}`);
  console.log(`  amenazas sin controles evaluados: ${d.amenazasSinControles}`);
  console.log(`  riesgos SIN residual:             ${d.residualSinCalcular}`);
  if (d.residualSinCalcular > 0) {
    console.log(
      '\n  Un residual «sin calcular» es el estado honesto: la amenaza no tiene ningún\n' +
        '  control evaluado, así que su eficacia es DESCONOCIDA, no cero. Escribir cero\n' +
        '  dejaría cada matriz residual idéntica a la inherente.',
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
