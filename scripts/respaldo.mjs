/**
 * Respaldo de la base y prueba de restauración.
 *
 * Cubre `REQ-SIG-01 §7`: «Respaldo diario con retención de treinta días y prueba de
 * restauración documentada». Las tres partes importan por separado y hay un modo para
 * cada una:
 *
 *     node scripts/respaldo.mjs crear       toma el volcado y aplica la retención
 *     node scripts/respaldo.mjs verificar   restaura el último volcado y lo compara
 *     node scripts/respaldo.mjs listar      muestra lo que hay y su antigüedad
 *
 * Por qué existe `verificar`: un respaldo que nunca se restauró no es un respaldo, es un
 * archivo. La única forma de saber que sirve es devolverlo a una base y contar. Es además
 * lo que un auditor pide ver — no el archivo, la evidencia de que se probó.
 *
 * El volcado va en formato `custom` (-Fc): comprimido, y `pg_restore` lo lee de forma
 * selectiva. Un `.sql` plano de 2.256 riesgos no se restaura por partes.
 *
 * Va en Node y no en Python, aunque `scripts/` tenga scripts en Python, porque Node ya es
 * requisito del proyecto y este script tiene que poder correr en cualquier máquina que
 * pueda desplegar. Un procedimiento de recuperación que depende de un intérprete que no
 * está instalado es un procedimiento que falla el día que se necesita.
 *
 * IMPORTANTE — esto NO revierte una migración. Volver el código a un commit anterior deja
 * el esquema donde está; para deshacer una migración hay que restaurar un volcado tomado
 * ANTES de correrla. Por eso el respaldo se toma antes de desplegar, no después.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const DESTINO = join(RAIZ, 'var', 'respaldos');
const RETENCION_DIAS = 30;
const CONTENEDOR = 'sgi-postgres';

/// Tablas cuyo conteo se compara entre el original y la copia restaurada. No son todas:
/// son las que sostienen una auditoría. Si estas cuadran, el volcado sirve.
const TABLAS_TESTIGO = [
  'activo', 'riesgo', 'control', 'amenaza', 'accion_plan', 'bitacora',
  'persona', 'obligacion', 'asignacion', 'hallazgo',
  'riesgo_organizacional', 'auditoria', 'norma_auditable', 'requisito_norma',
];

function salir(mensaje) {
  console.error(`ERROR: ${mensaje}`);
  process.exit(1);
}

function urlBase() {
  let url = process.env.DATABASE_URL;
  if (!url) {
    const env = join(RAIZ, '.env');
    if (existsSync(env)) {
      for (const linea of readFileSync(env, 'utf8').split(/\r?\n/)) {
        const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(linea);
        if (m) {
          url = m[1].replace(/^["']|["']$/g, '');
          break;
        }
      }
    }
  }
  if (!url) salir('DATABASE_URL no está definida ni en el entorno ni en .env');
  // pg_dump no entiende `?schema=public`, que sí es válido para Prisma.
  return url.split('?')[0];
}

function conBase(url, base) {
  return url.replace(/\/[^/?]+$/, `/${base}`);
}

function nombreBase(url) {
  return new URL(url).pathname.replace(/^\//, '');
}

function hayEnPath(binario) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [binario], {
    encoding: 'utf8',
    shell: false,
  });
  return r.status === 0;
}

/**
 * Corre un cliente de Postgres: el del sistema si está, el del contenedor si no.
 *
 * En una máquina de desarrollo Windows rara vez está `pg_dump` en el PATH, pero el
 * contenedor trae los clientes. Se prefiere el del sistema porque su versión suele
 * coincidir con la del servidor de producción.
 */
function cliente(binario, url, args, entrada) {
  if (hayEnPath(binario)) {
    return spawnSync(binario, [url, ...args], { input: entrada, maxBuffer: 1 << 30 });
  }
  // Dentro del contenedor, «localhost» es el contenedor mismo: el puerto publicado no
  // aplica y hay que hablarle al 5432 interno.
  const interna = url.replace(/@(localhost|127\.0\.0\.1):\d+/, '@127.0.0.1:5432');
  return spawnSync('docker', ['exec', '-i', CONTENEDOR, binario, interna, ...args], {
    input: entrada,
    maxBuffer: 1 << 30,
  });
}

function volcados() {
  if (!existsSync(DESTINO)) return [];
  return readdirSync(DESTINO)
    .filter((f) => /^sgi-.*\.dump$/.test(f))
    .map((f) => join(DESTINO, f))
    .sort()
    .reverse();
}

function crear() {
  const url = urlBase();
  mkdirSync(DESTINO, { recursive: true });
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const archivo = join(DESTINO, `sgi-${sello}.dump`);

  console.log(`Volcando a ${relative(RAIZ, archivo)} ...`);
  const r = cliente('pg_dump', url, ['-Fc', '--no-owner', '--no-privileges']);
  if (r.status !== 0) {
    salir(`pg_dump falló:\n${String(r.stderr).slice(0, 600)}`);
  }
  if (!r.stdout || r.stdout.length === 0) {
    salir('el volcado salió vacío; no se conserva un archivo que no sirve');
  }
  writeFileSync(archivo, r.stdout);
  console.log(`  ${(statSync(archivo).size / 1024 / 1024).toFixed(1)} MB`);

  const limite = Date.now() - RETENCION_DIAS * 86400_000;
  let borrados = 0;
  for (const v of volcados()) {
    if (statSync(v).mtimeMs < limite) {
      unlinkSync(v);
      borrados++;
    }
  }
  console.log(`Retención ${RETENCION_DIAS} días: ${borrados} volcado(s) retirado(s).`);
  console.log(`Quedan ${volcados().length}.`);
  console.log('\nEste volcado todavía NO está probado. Corré:');
  console.log('  node scripts/respaldo.mjs verificar');
}

function conteos(url, base) {
  const consulta = TABLAS_TESTIGO.map(
    (t) => `select '${t}' as tabla, count(*) from "${t}"`,
  ).join(' UNION ALL ');
  const r = cliente('psql', conBase(url, base), ['-t', '-A', '-F', '|', '-c', consulta]);
  if (r.status !== 0) {
    salir(`no se pudo contar en «${base}»:\n${String(r.stderr).slice(0, 600)}`);
  }
  const fuera = {};
  for (const linea of String(r.stdout).split(/\r?\n/)) {
    const i = linea.lastIndexOf('|');
    if (i > 0) fuera[linea.slice(0, i).trim()] = Number(linea.slice(i + 1).trim());
  }
  return fuera;
}

function verificar() {
  const disponibles = volcados();
  if (disponibles.length === 0) {
    salir('no hay volcados; corré primero: node scripts/respaldo.mjs crear');
  }
  const volcado = disponibles[0];
  const url = urlBase();
  const original = nombreBase(url);
  const prueba = `${original}_verificacion`;

  console.log(`Volcado  : ${volcado.split(/[\\/]/).pop()}`);
  console.log(`Original : ${original}`);
  console.log(`Restaurando en base desechable: ${prueba}\n`);

  const admin = conBase(url, 'postgres');
  cliente('psql', admin, ['-c', `DROP DATABASE IF EXISTS "${prueba}"`]);
  const creada = cliente('psql', admin, ['-c', `CREATE DATABASE "${prueba}"`]);
  if (creada.status !== 0) {
    salir(`no se pudo crear la base de prueba:\n${String(creada.stderr).slice(0, 600)}`);
  }

  const destino = conBase(url, prueba);
  const bytes = readFileSync(volcado);
  const restaurar = hayEnPath('pg_restore')
    ? spawnSync('pg_restore', ['-d', destino, '--no-owner', '--no-privileges', volcado], {
        maxBuffer: 1 << 30,
      })
    : spawnSync(
        'docker',
        ['exec', '-i', CONTENEDOR, 'pg_restore', '-d',
         destino.replace(/@(localhost|127\.0\.0\.1):\d+/, '@127.0.0.1:5432'),
         '--no-owner', '--no-privileges'],
        { input: bytes, maxBuffer: 1 << 30 },
      );
  // pg_restore devuelve != 0 por avisos que no impiden la restauración; lo que decide es
  // la comparación de conteos, no el código de salida.
  if (restaurar.status !== 0) {
    console.log('  (pg_restore reportó avisos; se comparan los conteos igual)\n');
  }

  const esperado = conteos(url, original);
  const obtenido = conteos(url, prueba);

  console.log(`  ${'tabla'.padEnd(26)}${'original'.padStart(9)}${'restaurado'.padStart(12)}`);
  console.log('  ' + '-'.repeat(50));
  let fallos = 0;
  for (const t of TABLAS_TESTIGO) {
    const a = esperado[t] ?? -1;
    const b = obtenido[t] ?? -1;
    const ok = a === b && a >= 0;
    if (!ok) fallos++;
    console.log(`  ${ok ? 'OK ' : '!! '}${t.padEnd(23)}${String(a).padStart(9)}${String(b).padStart(12)}`);
  }

  cliente('psql', admin, ['-c', `DROP DATABASE IF EXISTS "${prueba}"`]);

  console.log();
  if (fallos > 0) {
    salir(`${fallos} tabla(s) no coinciden: el volcado NO sirve para restaurar`);
  }
  const total = Object.values(esperado).reduce((a, b) => a + b, 0);
  console.log(`RESTAURACIÓN VERIFICADA · ${TABLAS_TESTIGO.length} tablas · ${total} filas`);
  console.log(`Volcado probado   : ${volcado.split(/[\\/]/).pop()}`);
  console.log(`Fecha de la prueba: ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`);
}

function listar() {
  const disponibles = volcados();
  if (disponibles.length === 0) {
    console.log('No hay volcados.');
    return;
  }
  console.log(`  ${'archivo'.padEnd(34)}${'MB'.padStart(7)}  antigüedad`);
  console.log('  ' + '-'.repeat(58));
  for (const v of disponibles) {
    const s = statSync(v);
    const dias = Math.floor((Date.now() - s.mtimeMs) / 86400_000);
    console.log(
      `  ${v.split(/[\\/]/).pop().padEnd(34)}${(s.size / 1024 / 1024).toFixed(1).padStart(7)}  ${dias} día(s)`,
    );
  }
  console.log(`\n  ${disponibles.length} volcado(s) · retención ${RETENCION_DIAS} días`);
}

const MODOS = { crear, verificar, listar };
const modo = process.argv[2] ?? '';
if (!(modo in MODOS)) {
  console.log(
    [
      'Respaldo de la base y prueba de restauración (REQ-SIG-01 §7).',
      '',
      '  node scripts/respaldo.mjs crear       toma el volcado y aplica la retención',
      '  node scripts/respaldo.mjs verificar   restaura el último volcado y lo compara',
      '  node scripts/respaldo.mjs listar      muestra lo que hay y su antigüedad',
    ].join('\n'),
  );
  process.exit(['', '-h', '--help'].includes(modo) ? 0 : 1);
}
MODOS[modo]();
