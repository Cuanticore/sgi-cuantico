// Barrido de las acciones de servidor buscando la clase de defecto que encontramos en
// `crearObligacion`: un identificador que llega de un formulario, viaja sin validar hasta
// Prisma, y devuelve un error crudo en pantalla en vez de un mensaje accionable.
//
// No pretende ser un analizador: marca candidatos para leer. Lo que busca es la ausencia de
// una guarda antes del primer uso del identificador.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIRS = ['app/sig/acciones', 'app/sgsi/acciones'];

const archivos = DIRS.flatMap((d) =>
  readdirSync(d)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(d, f)),
);

/// Señales de que el identificador SÍ se comprueba antes de usarlo.
const GUARDAS = [
  /Number\.isInteger/,
  /Number\.isFinite/,
  /errores\.push/,
  /if \(!\w+\)/,
  /=== undefined/,
  /=== null/,
  /\?\?/,
  /Number\.isNaN/,
];

const hallazgos = [];
let total = 0;

for (const archivo of archivos) {
  const texto = readFileSync(archivo, 'utf8');
  // Cada acción, desde su `export async function` hasta el siguiente.
  const partes = texto.split(/(?=^export async function )/m).slice(1);

  for (const parte of partes) {
    const nombre = parte.match(/^export async function (\w+)/)?.[1];
    if (!nombre) continue;
    total++;

    // Identificadores que la acción recibe: `datos.algoId` o parámetros nombrados `algoId`.
    const deDatos = [...parte.matchAll(/datos\.(\w*[Ii]d)\b/g)].map((m) => m[1]);
    const firma = parte.match(/^export async function \w+\(([\s\S]*?)\)\s*:/)?.[1] ?? '';
    const deFirma = [...firma.matchAll(/\b(\w*[Ii]d)\s*:\s*number/g)].map((m) => m[1]);
    const ids = [...new Set([...deDatos, ...deFirma])].filter((v) => v !== 'id');
    if (ids.length === 0) continue;

    // ¿Se usa alguno dentro de un `where: { id: ... }` o de un `data: {`?
    const usaEnPrisma = /where:\s*\{\s*id:/.test(parte) || /data:\s*\{/.test(parte);
    if (!usaEnPrisma) continue;

    const tieneGuarda = GUARDAS.some((re) => re.test(parte));
    const validaExplicito = new RegExp(
      `(Number\\.isInteger|Number\\.isFinite|!datos\\.)(\\s*\\(\\s*)?datos\\.(${ids.join('|')})`,
    ).test(parte);

    if (!tieneGuarda) {
      hallazgos.push({ archivo, nombre, ids, nivel: 'SIN NINGUNA GUARDA' });
    } else if (!validaExplicito) {
      hallazgos.push({ archivo, nombre, ids, nivel: 'guarda parcial' });
    }
  }
}

console.log(`Acciones de servidor analizadas: ${total}`);
console.log(`Candidatas a revisar: ${hallazgos.length}\n`);

const graves = hallazgos.filter((h) => h.nivel === 'SIN NINGUNA GUARDA');
const parciales = hallazgos.filter((h) => h.nivel === 'guarda parcial');

for (const [titulo, lista] of [
  ['SIN NINGUNA GUARDA — ningún control sobre los identificadores', graves],
  ['GUARDA PARCIAL — comprueba algo, pero no los identificadores', parciales],
]) {
  console.log('='.repeat(74));
  console.log(`${titulo}  (${lista.length})`);
  console.log('='.repeat(74));
  const porArchivo = new Map();
  for (const h of lista) {
    if (!porArchivo.has(h.archivo)) porArchivo.set(h.archivo, []);
    porArchivo.get(h.archivo).push(h);
  }
  for (const [archivo, hs] of porArchivo) {
    console.log(`\n  ${archivo}`);
    for (const h of hs) {
      console.log(`    ${h.nombre}(${h.ids.join(', ')})`);
    }
  }
  console.log();
}
