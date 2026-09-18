// scripts/preparar-bd-local.ts
//
// Crea el rol y la base LOCALES que `DATABASE_URL` nombra, una sola vez. Después de esto,
// `iniciar.bat` corre migraciones y semillas sin volver a pedir nada.
//
//   npx tsx scripts/preparar-bd-local.ts
//
// ── POR QUÉ ESTO NO ES UN .sql NI UN .bat CON LA CLAVE ADENTRO ─────────────────────────
//
// La clave del rol ya vive en `.env`, que está en `.gitignore`. Un `.sql` o un `.bat` con
// esa misma clave escrita adentro SÍ entraría al repositorio, y sería la segunda copia —la
// que nadie recuerda rotar el día que la primera se rota. Este script la lee de `.env` y no
// la escribe en ningún lado.
//
// La clave del SUPERUSUARIO no se guarda en ninguna parte: se pide al correrlo, con el eco
// apagado, y se usa para una conexión que se cierra al terminar.

import 'dotenv/config';
import { Client } from 'pg';
import { createInterface } from 'node:readline';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n  DATABASE_URL no está definida en .env. Sin ella no hay nada que crear.\n');
  process.exit(1);
}

const destino = new URL(url);

// ── La guarda ────────────────────────────────────────────────────────────────────────────
// La misma de `prisma/seeds/demo.ts`, y por la misma razón: este script CREA roles y bases.
// Contra una base compartida, «preparar el entorno local» sería una alteración de producción
// hecha por alguien que creía estar preparando su máquina.
if (destino.hostname !== 'localhost' && destino.hostname !== '127.0.0.1') {
  console.error(
    `\n  NEGADO. Este script sólo corre contra localhost, y DATABASE_URL apunta a «${destino.hostname}».\n` +
      '  Crea roles y bases: contra una base compartida eso no es preparar tu equipo.\n',
  );
  process.exit(1);
}

const rol = decodeURIComponent(destino.username);
const clave = decodeURIComponent(destino.password);
const base = destino.pathname.replace(/^\//, '');
const puerto = destino.port === '' ? 5432 : Number(destino.port);

if (rol === '' || clave === '' || base === '') {
  console.error('\n  DATABASE_URL tiene que traer usuario, clave y nombre de base.\n');
  process.exit(1);
}

/// Pide la clave del superusuario sin mostrarla. `readline` con `terminal: true` y el
/// `_writeToOutput` anulado es la forma estándar en Node de no dejar la clave en la pantalla
/// —ni en el historial de la consola de quien mira por encima del hombro—.
function pedirClave(pregunta: string): Promise<string> {
  return new Promise((resolver) => {
    const lector = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const interno = lector as unknown as { _writeToOutput?: (s: string) => void };
    process.stdout.write(pregunta);
    interno._writeToOutput = () => {};
    lector.question('', (respuesta) => {
      lector.close();
      process.stdout.write('\n');
      resolver(respuesta);
    });
  });
}

/// `--comprobar` es lo que corre `iniciar.bat` en cada arranque: sólo mira si las credenciales
/// de `.env` conectan. Sin esto, una base sin preparar se manifiesta como una pantalla de error
/// de Next a los dos minutos, en vez de una línea en la consola antes de compilar nada.
async function comprobar(): Promise<void> {
  const cliente = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await cliente.connect();
    const { rows } = await cliente.query(
      "select count(*)::int as tablas from information_schema.tables where table_schema = 'public'," +
        ' inet_client_addr()::text as desde',
    );
    await cliente.end();

    // `localhost` no prueba que la base sea local: con el túnel SSM arriba, 127.0.0.1:5432
    // es producción. El servidor ve al cliente con la IP interna de la instancia, no con
    // 127.0.0.1, y ésa es la única señal honesta que hay desde este lado.
    if (esRemota(rows[0].desde)) {
      console.log(
        `  Base «${base}»: ${rows[0].tablas} tablas.  ATENCIÓN: es REMOTA (el túnel está arriba).\n` +
          '  DATABASE_URL apunta a producción. El player SCORM escribe: abrir un curso crea\n' +
          '  filas IntentoScorm y puede cerrar asignaciones reales.',
      );
      return;
    }
    if (rows[0].tablas === 0) {
      console.error(
        `\n  La base «${base}» existe pero no tiene tablas: faltan las migraciones.\n` +
          '  Corre:  preparar-bd.bat\n',
      );
      process.exit(1);
    }
    console.log(`  Base «${base}» lista: ${rows[0].tablas} tablas.`);
  } catch (error) {
    console.error(
      `\n  No se pudo conectar a «${base}» con las credenciales de .env.\n` +
        `  ${(error as Error).message}\n` +
        '  Si es la primera vez en este equipo, corre:  preparar-bd.bat\n',
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--comprobar')) {
    await comprobar();
    return;
  }

  console.log(`\n  Base local: ${base}  ·  rol: ${rol}  ·  127.0.0.1:${puerto}\n`);

  const superusuario = process.env.PGSUPERUSER ?? 'postgres';
  // `PGSUPERPASS` existe para las terminales sin entrada interactiva (un runner, un agente).
  // Cuando no está, se pide por teclado con el eco apagado, que es lo normal para una persona
  // corriendo el .bat. En ninguno de los dos casos la clave se escribe a disco.
  const claveSuper =
    process.env.PGSUPERPASS ??
    (await pedirClave(`  Clave de «${superusuario}» (no se muestra ni se guarda): `));

  const admin = new Client({
    host: '127.0.0.1',
    port: puerto,
    user: superusuario,
    password: claveSuper,
    database: 'postgres',
  });

  // ── La segunda guarda, y es la que de verdad protege ───────────────────────────────────
  //
  // La guarda de arriba mira el HOSTNAME de DATABASE_URL, y `localhost` deja de significar
  // «local» en el instante en que alguien levanta el túnel SSM sobre el puerto 5432: ahí
  // 127.0.0.1 ES producción, y este script crearía un rol en la base de la organización
  // creyendo que prepara un equipo.
  //
  // Lo que no se puede falsear es de qué dirección ve el servidor llegar la conexión: en una
  // conexión realmente local es 127.0.0.1; a través del túnel es la IP interna de la
  // instancia. Se pregunta ANTES de escribir nada.
  try {
    await admin.connect();
  } catch (error) {
    console.error(
      `\n  No se pudo entrar como «${superusuario}». ${(error as Error).message}\n` +
        '  Si el superusuario de tu instalación se llama de otro modo, definí PGSUPERUSER.\n',
    );
    process.exit(1);
  }

  const procedencia = await admin.query('select inet_client_addr()::text as desde');
  if (esRemota(procedencia.rows[0].desde)) {
    await admin.end();
    console.error(
      `\n  NEGADO. El servidor de 127.0.0.1:${puerto} ve esta conexión llegar desde\n` +
        `  «${procedencia.rows[0].desde}», no desde 127.0.0.1: NO es la base local, es el\n` +
        '  otro extremo del túnel SSM.\n\n' +
        '  Bajar el túnel y volver a levantar el PostgreSQL local:\n' +
        '    net start postgresql-x64-17\n',
    );
    process.exit(1);
  }

  // Idempotente a propósito: correrlo dos veces no es un error, es lo que pasa cuando alguien
  // no se acuerda de si ya lo corrió. Si el rol existe, se le fija la clave que `.env` dice —
  // que es la corrección que hace falta cuando el rol quedó de otro intento con otra clave.
  const existeRol = await admin.query('select 1 from pg_roles where rolname = $1', [rol]);
  if (existeRol.rowCount === 0) {
    await admin.query(`create role ${citar(rol)} login createdb password ${literal(clave)}`);
    console.log(`  Rol «${rol}» creado.`);
  } else {
    await admin.query(`alter role ${citar(rol)} login password ${literal(clave)}`);
    console.log(`  Rol «${rol}» ya existía; se le fijó la clave de .env.`);
  }

  const existeBase = await admin.query('select 1 from pg_database where datname = $1', [base]);
  if (existeBase.rowCount === 0) {
    // `create database` no admite parámetros vinculados ni corre dentro de una transacción.
    await admin.query(`create database ${citar(base)} owner ${citar(rol)}`);
    console.log(`  Base «${base}» creada, con «${rol}» de dueño.`);
  } else {
    console.log(`  Base «${base}» ya existía; no se toca.`);
  }

  await admin.end();

  // Comprobar con las credenciales REALES, no dar por hecho que funcionan. Es la diferencia
  // entre «el script terminó» y «la aplicación se va a poder conectar».
  const prueba = new Client({ connectionString: url });
  await prueba.connect();
  const { rows } = await prueba.query(
    "select count(*)::int as tablas from information_schema.tables where table_schema = 'public'",
  );
  await prueba.end();

  console.log(
    `\n  Conexión verificada con las credenciales de .env: ${rows[0].tablas} tablas en public.\n`,
  );
}

/// `inet_client_addr()` devuelve NULL cuando la conexión no es por TCP, y 127.0.0.1 / ::1
/// cuando es local de verdad. Cualquier otra cosa significa que del otro lado del puerto hay
/// un servidor que ve llegar la conexión desde otra máquina — el túnel.
///
/// El driver `pg` entrega el `inet` CON su máscara —`127.0.0.1/32`, `::1/128`—, no como el
/// texto pelado que muestra psql. Sin quitar el sufijo, una conexión perfectamente local se
/// leía como remota y la guarda negaba todo. Se recorta antes de comparar.
function esRemota(desde: string | null): boolean {
  if (desde === null) return false;
  const sinMascara = desde.split('/')[0];
  return sinMascara !== '127.0.0.1' && sinMascara !== '::1';
}

/// Identificadores: el rol lleva un punto (`daniel.medina`), así que sin comillas Postgres lo
/// leería como `medina` dentro del esquema `daniel`.
function citar(identificador: string): string {
  return `"${identificador.replace(/"/g, '""')}"`;
}

function literal(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

main().catch((error) => {
  console.error(`\n  ${(error as Error).message}\n`);
  process.exit(1);
});
