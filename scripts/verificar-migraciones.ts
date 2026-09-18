// scripts/verificar-migraciones.ts
//
// Aplica TODAS las migraciones sobre una base vacía y efímera, y la borra al terminar.
//
// POR QUÉ EXISTE. El 18/09/2026 la migración `20260916200000_identidad_de_nivel` tumbó el
// despliegue con `42703: column "nombre" does not exist`: hacía `UPDATE "plantilla_nivel"
// SET "nombre" = …` sobre una tabla cuya columna se llama `nombre_nivel_3` y nunca se llamó
// de otra forma.
//
// `npm run verificar:build` daba verde, y no por descuido: ninguno de sus cinco pasos
// EJECUTA una migración. `prisma generate` lee el schema, no las migraciones; `tsc`, ESLint,
// Jest y el build ni las miran. El SQL de `prisma/migrations/` sólo se ejecuta en un sitio
// —`prisma migrate deploy`— y ese sitio era producción.
//
// Una migración es código que corre una sola vez, en el peor momento posible y sobre los
// únicos datos que no se pueden perder. Que fuera lo ÚNICO sin verificación previa era el
// hueco, y costó un despliegue y una base con una migración marcada como fallida.
//
// LO QUE ESTO NO ENCUENTRA. Una base vacía no tiene los datos de producción, así que no
// detecta una violación de unicidad que sólo aparece con las filas reales. Encuentra lo otro
// —la columna que no existe, el tipo mal escrito, el orden imposible—, que es lo que tumbó
// el despliegue. Probar contra datos reales sigue siendo necesario y sigue siendo aparte.
//
// No usa `psql`: el runner de CI es el host de producción y no hay garantía de que el cliente
// esté instalado. `pg` ya es dependencia del proyecto.

import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import { Client } from 'pg';

/// La misma conexión, apuntando a otra base del mismo servidor.
function haciaBase(url: string, nombre: string): string {
  const u = new URL(url);
  u.pathname = `/${nombre}`;
  return u.toString();
}

/// Un identificador SQL citado. El nombre lo generamos nosotros y es hexadecimal, pero
/// construir SQL por concatenación sin citar es un hábito que después se copia a donde el
/// valor sí viene de afuera.
function citar(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

async function enPostgres(url: string, sql: string): Promise<void> {
  const cliente = new Client({ connectionString: haciaBase(url, 'postgres') });
  await cliente.connect();
  try {
    await cliente.query(sql);
  } finally {
    await cliente.end();
  }
}

async function main(): Promise<void> {
  const base = process.env.DATABASE_URL;
  if (!base) {
    console.error('\n  DATABASE_URL no está definida. Sin ella no hay servidor donde probar.\n');
    process.exit(1);
  }

  // El sufijo aleatorio evita chocar con una corrida anterior que muriera antes de limpiar, y
  // que dos personas sobre el mismo servidor se pisen.
  const nombre = `sgi_migraciones_${randomBytes(4).toString('hex')}`;
  let creada = false;

  try {
    await enPostgres(base, `CREATE DATABASE ${citar(nombre)}`);
    creada = true;

    // `npx` en Windows es `npx.cmd`, y `execFileSync` no resuelve extensiones de PATHEXT:
    // sin `shell`, acá muere con `spawnSync npx ENOENT` y el mensaje de arriba acusa a las
    // migraciones de algo que no hicieron. En CI —Linux— funcionaba de las dos formas, así
    // que el fallo sólo aparecía en la máquina donde alguien lo corre a mano, que es
    // justamente donde este script sirve para no esperar al despliegue.
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DATABASE_URL: haciaBase(base, nombre) },
      shell: process.platform === 'win32',
    });

    console.log('\n  Las migraciones aplican limpias sobre una base vacía.\n');
  } catch (error) {
    const e = error as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const salida = `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`.trim();
    console.error('\n  UNA MIGRACIÓN NO APLICA. Esto tumbaría el despliegue:\n');
    console.error((salida || e.message || String(error)).replace(/^/gm, '    '));
    console.error('');
    process.exitCode = 1;
  } finally {
    // Se borra siempre, incluso en rojo: una base huérfana por cada corrida fallida convierte
    // el servidor en un basurero, y es justo cuando uno se olvidaría de limpiar.
    if (creada) {
      try {
        await enPostgres(base, `DROP DATABASE ${citar(nombre)}`);
      } catch {
        console.error(`  Aviso: quedó la base de prueba «${nombre}», bórrala a mano.\n`);
      }
    }
  }
}

void main();
