// scripts/verificar-fusion.ts
//
// EJECUTA la fusión de niveles sobre una base efímera con la forma REAL del árbol, y la borra.
//
// POR QUÉ EXISTE. El 22/09/2026 `estandarizar-niveles.ts --aplicar` falló contra producción con
// `P2002` sobre `nivel_activo_identidad`. El plan se había verificado TRES veces —simulación
// contra la base local, simulación contra producción, y un `diff` entre las dos salidas— y las
// tres dijeron «0 conflictos». Las tres tenían razón: el plan es correcto **como estado final**.
// Lo que ninguna de las tres hacía era EJECUTAR el SQL, y el defecto vivía en la secuencia.
//
// Es la cicatriz del 18/09 con otro disfraz. Aquella decía «ninguna verificación previa ejecuta
// una migración», y se cerró con `verificar:migraciones`. Ésta dice lo mismo de un script que
// escribe sobre los únicos datos que no se pueden perder: `prisma/migrations/` tenía arnés y
// `scripts/` no.
//
// LO QUE ESTO SÍ ENCUENTRA, y una simulación no: un estado intermedio imposible. Se copia la
// forma del árbol de una base real —los 145 nodos, con sus nombres, padres y grados— y se corre
// el ejecutor de verdad contra un Postgres de verdad, con el índice único puesto.
//
// LO QUE NO ENCUENTRA: sólo copia `nivel_activo`. Los activos y los productos no viajan, así
// que un choque de `producto.nivel_id` —que es @unique— no aparecería acá. El plan lo cubre con
// su conflicto `PRODUCTO_DUPLICADO`, que sí se calcula sobre los datos reales.
//
//   $env:DATABASE_URL = 'postgresql://…@localhost:5432/sgi_sgsi'   # de dónde se copia el árbol
//   npx tsx --tsconfig tsconfig.scripts.json scripts/verificar-fusion.ts

import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { planDeEstandarizacion, type NivelCrudo } from '../lib/sig/fusion-niveles';
import { aplicarPlan } from '../lib/sig/aplicar-fusion';
import { normalizarNombreNivel } from '../lib/sig/nombre-nivel';

function haciaBase(url: string, nombre: string): string {
  const u = new URL(url);
  u.pathname = `/${nombre}`;
  return u.toString();
}

const citar = (id: string) => `"${id.replace(/"/g, '""')}"`;

async function enPostgres(url: string, sql: string): Promise<void> {
  const c = new Client({ connectionString: haciaBase(url, 'postgres') });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

type Fila = { id: number; grado: number; nombre: string; padreId: number | null; clase: string | null; activo: boolean; orden: number };

async function main(): Promise<void> {
  const base = process.env.DATABASE_URL;
  if (!base) {
    console.error('\n  DATABASE_URL no está definida: sin ella no hay árbol del cual copiar la forma.\n');
    process.exit(1);
  }

  // **De dónde se COPIA la forma y dónde se ENSAYA son dos servidores distintos.**
  //
  // Producción no deja crear una base —el rol no tiene `CREATEDB`, y es correcto que no lo
  // tenga—, así que la efímera se levanta donde `DATABASE_URL` apunte y el árbol se lee de
  // `ARBOL_DESDE`. Ensayar contra la forma de producción sin pedirle permiso de escritura a
  // producción es justamente lo que hace que este ensayo se pueda correr antes de aplicar.
  const fuente = process.env.ARBOL_DESDE ?? base;
  const origen = new PrismaClient({ adapter: new PrismaPg({ connectionString: fuente }) });
  const arbol = (await origen.nivelActivo.findMany({
    select: { id: true, grado: true, nombre: true, padreId: true, clase: true, activo: true, orden: true },
    orderBy: { id: 'asc' },
  })) as Fila[];
  // **Los conteos viajan, y no son un adorno.** `elegirSuperviviente` desempata por tamaño de
  // rama y por si el nodo encabeza un Producto: con todos en cero, el plan elige OTRO
  // superviviente que el real —el de menor id— y esta verificación estaría ejerciendo una
  // fusión que nunca va a ocurrir. La primera versión de este script los ponía en cero y por
  // eso daba rojo donde producción daba otra cosa. Es la norma del caso de control: un número
  // que no sale de lo que estás observando no prueba nada, aunque el rojo se vea convincente.
  const porNivel = await origen.activo.groupBy({ by: ['nivelId'], where: { activo: true }, _count: { _all: true } });
  const productos = await origen.producto.findMany({ select: { nivelId: true } });
  await origen.$disconnect();

  const activosDe = new Map<number, number>();
  for (const g of porNivel) if (g.nivelId !== null) activosDe.set(g.nivelId, g._count._all);
  const conProducto = new Set(productos.map((p) => p.nivelId));

  const nombre = `sgi_fusion_${randomBytes(4).toString('hex')}`;
  let creada = false;
  let fallo: string | null = null;

  try {
    await enPostgres(base, `CREATE DATABASE ${citar(nombre)}`);
    creada = true;
    const url = haciaBase(base, nombre);

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DATABASE_URL: url },
      shell: process.platform === 'win32',
    });

    const destino = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    try {
      // La plantilla que siembra `20260904090000` referencia el catálogo; los niveles que
      // siembre cualquier migración estorban a la copia, así que se vacía primero.
      await destino.$executeRawUnsafe('DELETE FROM "nivel_activo"');
      // En orden de id: un hijo no puede insertarse antes que su padre por la llave foránea.
      for (const n of [...arbol].sort((a, b) => (a.padreId ?? 0) - (b.padreId ?? 0) || a.id - b.id)) {
        await destino.$executeRawUnsafe(
          'INSERT INTO "nivel_activo" (id, grado, nombre, padre_id, clase, orden, activo) VALUES ($1,$2,$3,$4,$5::"clase_nivel",$6,$7)',
          n.id, n.grado, n.nombre, n.padreId, n.clase, n.orden, n.activo,
        );
      }

      const crudos: NivelCrudo[] = arbol.map((n) => ({
        id: n.id, grado: n.grado, nombre: n.nombre, padreId: n.padreId,
        clase: n.clase as NivelCrudo['clase'], activo: n.activo,
        activosDirectos: activosDe.get(n.id) ?? 0, encabezaProducto: conProducto.has(n.id),
      }));
      const plan = planDeEstandarizacion(crudos);
      console.log(`\n  Árbol copiado: ${arbol.length} nodos.`);
      console.log(`  Plan: ${plan.renombres.length} renombres · ${plan.fusiones.length} fusiones · ${plan.conflictos.length} conflictos`);

      // EL PASO QUE NINGUNA SIMULACIÓN DABA: ejecutar.
      await destino.$transaction(async (tx) => {
        // Envoltorio que narra cada escritura: cuando el índice rechaza una, el mensaje de
        // Prisma no dice cuál era, y sin eso el rojo no enseña nada.
        const narrado = {
          nivelActivo: {
            updateMany: (a: never) => tx.nivelActivo.updateMany(a),
            update: async (a: { where: { id: number }; data: Record<string, unknown> }) => {
              try {
                return await tx.nivelActivo.update(a as never);
              } catch (e) {
                const n = await destino.nivelActivo.findUnique({ where: { id: a.where.id } });
                throw new Error(
                  `al escribir #${a.where.id} «${n?.nombre}» (g${n?.grado}, padre ${n?.padreId}) ` +
                    `con ${JSON.stringify(a.data)}: ${(e as Error).message.split('\n').slice(-1)[0]}`,
                );
              }
            },
          },
          activo: { updateMany: (a: never) => tx.activo.updateMany(a) },
          producto: { updateMany: (a: never) => tx.producto.updateMany(a) },
        };
        await aplicarPlan(
          narrado as never,
          plan,
          async (padreId) =>
            (await tx.nivelActivo.findMany({ where: { padreId }, select: { id: true } })).map((h) => h.id),
        );
      });

      // Post-condiciones: entre los que quedan ACTIVOS, ningún par comparte identidad
      // normalizada bajo el mismo padre. Es lo que el plan prometía.
      const despues = await destino.nivelActivo.findMany({
        select: { id: true, grado: true, nombre: true, padreId: true, activo: true },
      });
      const vistos = new Map<string, number>();
      const choques: string[] = [];
      for (const n of despues.filter((x) => x.activo)) {
        const llave = `${n.grado}|${normalizarNombreNivel(n.nombre)}|${n.padreId ?? 'RAIZ'}`;
        const previo = vistos.get(llave);
        if (previo !== undefined) choques.push(`${llave} -> #${previo} y #${n.id}`);
        else vistos.set(llave, n.id);
      }
      const sinNormalizar = despues.filter((n) => n.activo && n.nombre !== normalizarNombreNivel(n.nombre));

      console.log(`  Activos tras la fusión: ${despues.filter((x) => x.activo).length} de ${despues.length}`);
      console.log(`  Colisiones de identidad entre activos: ${choques.length}`);
      for (const c of choques) console.log(`      ${c}`);
      console.log(`  Activos con el nombre sin normalizar: ${sinNormalizar.length}`);
      for (const n of sinNormalizar) console.log(`      #${n.id} «${n.nombre}»`);

      if (choques.length > 0 || sinNormalizar.length > 0) {
        fallo = 'la fusión terminó pero dejó el árbol sin estandarizar';
      }
    } finally {
      await destino.$disconnect();
    }
  } catch (error) {
    const e = error as { stdout?: Buffer; stderr?: Buffer; message?: string };
    fallo = `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`.trim() || e.message || String(error);
  } finally {
    if (creada) {
      try {
        await enPostgres(base, `DROP DATABASE ${citar(nombre)} WITH (FORCE)`);
      } catch {
        console.error(`  Aviso: quedó la base de prueba «${nombre}», bórrala a mano.`);
      }
    }
  }

  if (fallo !== null) {
    console.error('\n  LA FUSIÓN NO SE PUEDE APLICAR. Esto es lo que le pasaría a producción:\n');
    console.error(fallo.replace(/^/gm, '    '));
    console.error('');
    process.exitCode = 1;
    return;
  }
  console.log('\n  La fusión se aplica limpia sobre la forma real del árbol.\n');
}

void main();
