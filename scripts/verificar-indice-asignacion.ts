// scripts/verificar-indice-asignacion.ts
//
// **La prueba que la migración 20260918120000_asignacion_manual no puede dejar de tener**, y
// que no cabe en la suite de Jest porque Jest no tiene base.
//
//   npx tsx scripts/verificar-indice-asignacion.ts
//
// ── QUÉ COMPRUEBA, Y POR QUÉ LAS TRES COSAS ─────────────────────────────────────────────
//
// 1. Con el índice VIEJO —sin el `WHERE`—, dos asignaciones manuales a la misma persona en
//    el mismo periodo **chocan**. Es el defecto, reproducido. Sin este escenario, el punto 2
//    no prueba nada: pasaría igual si el defecto nunca hubiera existido.
// 2. Con el índice NUEVO —parcial— las dos entran. Es el arreglo.
// 3. Con el índice NUEVO, dos asignaciones de la MISMA OBLIGACIÓN siguen chocando. Es la
//    mitad que más importa: la migración relaja la restricción para lo manual **sin** tocar
//    la idempotencia del cron. Si este escenario dejara entrar las dos, la migración habría
//    roto lo que el índice existía para proteger, y el cron dejaría de ser reintentable en
//    silencio —nadie lo notaría hasta ver asignaciones duplicadas en la bandeja de alguien—.
//
// ── POR QUÉ NO DEJA RASTRO ──────────────────────────────────────────────────────────────
//
// Todo corre dentro de una transacción que termina en `ROLLBACK`, y en PostgreSQL el DDL es
// transaccional: el `DROP INDEX` y el `CREATE INDEX` se revierten igual que los `INSERT`. La
// base queda exactamente como estaba, y el script lo comprueba contando al final en vez de
// afirmarlo.
//
// Aun así **sólo corre contra localhost**, con la misma guarda que `preparar-bd-local.ts` y
// `prisma/seeds/demo.ts`: reemplaza un índice de `asignacion` y toma un lock exclusivo sobre
// la tabla. Contra una base compartida eso no es verificar nada, es una interrupción.

import 'dotenv/config';
import { Client } from 'pg';

const INDICE = 'asignacion_obligacion_id_persona_id_periodo_activo_id_key';
const COLUMNAS = '(obligacion_id, persona_id, periodo, activo_id) NULLS NOT DISTINCT';
const VIEJO = `CREATE UNIQUE INDEX ${INDICE} ON asignacion ${COLUMNAS}`;
const NUEVO = `${VIEJO} WHERE obligacion_id IS NOT NULL`;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n  DATABASE_URL no está definida. Sin base no hay nada que verificar.\n');
  process.exit(1);
}

const destino = new URL(url);
if (destino.hostname !== 'localhost' && destino.hostname !== '127.0.0.1') {
  console.error(
    `\n  NEGADO. Este script sólo corre contra localhost, y DATABASE_URL apunta a «${destino.hostname}».\n` +
      '  Reemplaza un índice de `asignacion` y bloquea la tabla: contra una base compartida\n' +
      '  eso no es verificar, es una interrupción.\n',
  );
  process.exit(1);
}

/// Una asignación MANUAL: sin obligación y sin activo. Es exactamente la forma que escribe
/// `asignarAPersona`, y la que con el índice viejo sólo cabía una vez por persona y periodo.
function insercion(etiqueta: string, obligacionId: number | null): string {
  return `
    INSERT INTO asignacion (obligacion_id, contenido_id, titulo, descripcion, persona_id,
                            periodo, fecha_apertura, fecha_limite, estado, activo_id)
    VALUES (${obligacionId === null ? 'NULL' : obligacionId}, NULL,
            'Verificación ${etiqueta}', 'Verificación ${etiqueta}', $1, '2026-10',
            DATE '2026-09-18', DATE '2026-10-31', 'PENDIENTE', NULL)`;
}

/// Monta un índice, intenta las dos inserciones y deshace. Devuelve si la segunda entró.
async function escenario(
  c: Client,
  personaId: number,
  indice: string,
  obligacionId: number | null,
): Promise<{ entraronLasDos: boolean; detalle: string }> {
  await c.query('SAVEPOINT escenario');
  await c.query(`DROP INDEX ${INDICE}`);
  await c.query(indice);
  await c.query(insercion('A', obligacionId), [personaId]);
  try {
    await c.query(insercion('B', obligacionId), [personaId]);
    return { entraronLasDos: true, detalle: 'las dos entraron' };
  } catch (error) {
    const e = error as { code?: string; constraint?: string };
    return { entraronLasDos: false, detalle: `la segunda falló · ${e.code} ${e.constraint ?? ''}`.trim() };
  } finally {
    await c.query('ROLLBACK TO SAVEPOINT escenario');
  }
}

async function main(): Promise<void> {
  const c = new Client({ connectionString: url });
  await c.connect();

  const personas = await c.query<{ id: number; nombre: string }>(
    'select id, nombre from persona where activa order by id limit 1',
  );
  if (personas.rows.length === 0) {
    console.error('\n  No hay ninguna persona activa: no hay a quién asignarle nada.\n');
    process.exit(1);
  }
  const persona = personas.rows[0];

  const obligaciones = await c.query<{ id: number }>('select id from obligacion limit 1');
  const antes = await c.query<{ count: string }>('select count(*) from asignacion');

  console.log(`\n  Base    : ${destino.hostname}:${destino.port}${destino.pathname}`);
  console.log(`  Persona : #${persona.id} ${persona.nombre}`);
  console.log(`  Filas   : ${antes.rows[0].count} asignaciones\n`);

  await c.query('BEGIN');

  const viejo = await escenario(c, persona.id, VIEJO, null);
  const nuevo = await escenario(c, persona.id, NUEVO, null);
  const cron =
    obligaciones.rows.length === 0
      ? null
      : await escenario(c, persona.id, NUEVO, obligaciones.rows[0].id);

  await c.query('ROLLBACK');

  const despues = await c.query<{ count: string }>('select count(*) from asignacion');

  // El defecto reproducido: con el índice viejo la segunda manual NO entra.
  const uno = !viejo.entraronLasDos;
  // El arreglo: con el parcial, sí.
  const dos = nuevo.entraronLasDos;
  // Lo que no se puede haber roto: el cron sigue sin poder duplicar.
  const tres = cron === null ? null : !cron.entraronLasDos;
  const intacta = despues.rows[0].count === antes.rows[0].count;

  const linea = (ok: boolean | null, texto: string, detalle: string) =>
    console.log(`  ${ok === null ? '–' : ok ? 'OK  ' : 'FALLA'} ${texto.padEnd(42)} ${detalle}`);

  linea(uno, '1 · índice viejo, dos manuales', viejo.detalle);
  linea(dos, '2 · índice parcial, dos manuales', nuevo.detalle);
  linea(tres, '3 · índice parcial, misma obligación', cron?.detalle ?? 'sin obligaciones en esta base');
  linea(intacta, '4 · la base quedó como estaba', `${despues.rows[0].count} asignaciones`);

  await c.end();

  if (!uno || !dos || tres === false || !intacta) {
    console.error('\n  La migración NO quedó verificada. Revisar arriba cuál de los cuatro falló.\n');
    process.exit(1);
  }
  if (tres === null) {
    console.log(
      '\n  Verificada a medias: esta base no tiene obligaciones, así que la idempotencia del\n' +
        '  cron no se pudo comprobar. Correrlo contra una base sembrada.\n',
    );
    return;
  }
  console.log('\n  La migración quedó verificada: arregla lo manual y no toca lo del cron.\n');
}

void main();
