// scripts/estandarizar-niveles.ts
//
// Aplica a la base el plan que calcula `lib/sig/fusion-niveles.ts`.
//
// **Sin `--aplicar` no escribe nada.** Imprime el plan y termina. Esa es la forma de revisar
// una fusión antes de que ocurra: mudar hijos y activos de un nodo a otro no se deshace con
// un `undo`, y el plan es justamente lo que se puede leer de antemano.
//
//   $env:DATABASE_URL = 'postgresql://…@127.0.0.1:15432/sgi_sgsi?schema=public'
//   npx tsx scripts/estandarizar-niveles.ts              # simulación
//   npx tsx scripts/estandarizar-niveles.ts --aplicar     # escribe, en una transacción
//   npx tsx scripts/estandarizar-niveles.ts --aplicar --apagar-empresa
//
// Nada se borra. Un nodo absorbido queda `activo = false`, con su historia: si la fusión
// estuvo mal, el nodo sigue ahí para deshacerla.

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { planDeEstandarizacion, type NivelCrudo } from '../lib/sig/fusion-niveles';
import { planDeApagadoDeRaiz } from '../lib/sig/apagar-raiz';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL no está definida');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const APLICAR = process.argv.includes('--aplicar');
const APAGAR_EMPRESA = process.argv.includes('--apagar-empresa');

async function leerNiveles(): Promise<NivelCrudo[]> {
  const [niveles, porNivel, productos] = await Promise.all([
    prisma.nivelActivo.findMany({
      select: { id: true, grado: true, nombre: true, padreId: true, clase: true, activo: true },
      orderBy: [{ grado: 'asc' }, { orden: 'asc' }, { id: 'asc' }],
    }),
    prisma.activo.groupBy({ by: ['nivelId'], where: { activo: true }, _count: { _all: true } }),
    prisma.producto.findMany({ select: { nivelId: true } }),
  ]);

  const activos = new Map<number, number>();
  for (const g of porNivel) if (g.nivelId !== null) activos.set(g.nivelId, g._count._all);
  const conProducto = new Set(productos.map((p) => p.nivelId));

  return niveles.map((n) => ({
    ...n,
    activosDirectos: activos.get(n.id) ?? 0,
    encabezaProducto: conProducto.has(n.id),
  }));
}

async function main(): Promise<void> {
  const niveles = await leerNiveles();
  const porId = new Map(niveles.map((n) => [n.id, n]));
  const plan = planDeEstandarizacion(niveles);
  const apagado = APAGAR_EMPRESA ? planDeApagadoDeRaiz(niveles, 'EMPRESA') : null;

  const linea = (s = '') => console.log(s);
  const nombre = (id: number) => porId.get(id)?.nombre ?? `?${id}`;

  linea();
  linea(APLICAR ? 'ESTANDARIZAR NIVELES · APLICANDO' : 'ESTANDARIZAR NIVELES · SIMULACIÓN');
  linea('─'.repeat(88));

  linea();
  linea(`RENOMBRES: ${plan.renombres.length}`);
  for (const r of plan.renombres) linea(`  #${String(r.id).padStart(4)}  «${r.de}» → «${r.a}»`);

  linea();
  linea(`FUSIONES: ${plan.fusiones.length}`);
  for (const f of plan.fusiones) {
    linea(`  grado ${f.grado} · «${f.nombre}»`);
    linea(`      sobrevive #${f.sobrevive} «${nombre(f.sobrevive)}»`);
    for (const a of f.absorbe) linea(`      absorbe   #${a} «${nombre(a)}»`);
  }

  linea();
  linea(`CONFLICTOS (no se tocan): ${plan.conflictos.length}`);
  for (const c of plan.conflictos) {
    linea(`  ${c.tipo} · «${c.nombre}» · ids ${c.ids.join(', ')}`);
    linea(`      ${c.detalle}`);
  }

  if (apagado) {
    linea();
    if (apagado.apagar !== null) linea(`APAGAR EMPRESA: sí, #${apagado.apagar} (rama vacía)`);
    else if (apagado.impedimentos.length === 0) linea('APAGAR EMPRESA: no hay nada que hacer');
    else {
      linea('APAGAR EMPRESA: NO se puede todavía');
      for (const i of apagado.impedimentos) linea(`      ${i}`);
    }
  }

  if (!APLICAR) {
    linea();
    linea('Nada se escribió. Para aplicarlo: --aplicar');
    return;
  }

  if (plan.conflictos.length > 0) {
    linea();
    linea('NEGADO. Hay conflictos sin resolver: resolverlos a mano antes de aplicar.');
    process.exitCode = 1;
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Las fusiones primero, y en el orden del plan (grado 1 → 3): un hijo tiene que mudarse
    // a un padre que ya sobrevivió, no a uno que está por absorberse.
    for (const f of plan.fusiones) {
      for (const absorbido of f.absorbe) {
        await tx.nivelActivo.updateMany({
          where: { padreId: absorbido },
          data: { padreId: f.sobrevive },
        });
        await tx.activo.updateMany({
          where: { nivelId: absorbido },
          data: { nivelId: f.sobrevive },
        });
        // `producto.nivel_id` es @unique. El plan ya garantiza que no hay dos Producto en el
        // grupo, así que este movimiento no puede chocar.
        await tx.producto.updateMany({
          where: { nivelId: absorbido },
          data: { nivelId: f.sobrevive },
        });
        await tx.nivelActivo.update({ where: { id: absorbido }, data: { activo: false } });
      }
    }

    // Los renombres al final: antes de fundir, dos nombres distintos son lo único que
    // distingue a los dos nodos en los mensajes de arriba.
    for (const r of plan.renombres) {
      await tx.nivelActivo.update({ where: { id: r.id }, data: { nombre: r.a } });
    }

    if (apagado?.apagar !== null && apagado?.apagar !== undefined) {
      await tx.nivelActivo.update({ where: { id: apagado.apagar }, data: { activo: false } });
    }
  });

  linea();
  linea(
    `Aplicado: ${plan.fusiones.length} fusión(es), ${plan.renombres.length} renombre(s)` +
      `${apagado?.apagar !== null && apagado?.apagar !== undefined ? ', EMPRESA apagada' : ''}.`,
  );
  linea('Verificar con: npx tsx scripts/auditar-niveles.ts');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
