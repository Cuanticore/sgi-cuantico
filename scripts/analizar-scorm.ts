// scripts/analizar-scorm.ts
//
// Analiza un `.zip` SCORM y dice qué haría la aplicación con él. NO toca la base y NO
// guarda nada.
//
//   npx tsx scripts/analizar-scorm.ts "C:\ruta\Curso.zip"
//
// ── PARA QUÉ ─────────────────────────────────────────────────────────────────────────────
//
// Es la verificación #3 de §13 del requerimiento —«análisis del manifiesto: con el paquete
// entregado, detecta la edición, el SCO de entrada, la clase y los dominios externos»—
// hecha sin base de datos, sin sesión y sin subir nada.
//
// Y sirve para la decisión que D-4 obliga a tomar ANTES de guardar: si el paquete resulta
// `DESPACHO`, el correo y el nombre de cada persona salen hacia el tercero que aparezca en
// `dominiosExternos`. Eso hay que verlo antes, no descubrirlo en la bitácora.
//
// Recorre exactamente los mismos pasos que `guardarPaquete` hasta justo antes de escribir:
// mismo `extraer`, mismo `analizarManifiesto`, mismos límites. Si acá pasa, en la pantalla
// de Contenidos pasa; si acá lo rechaza, ahí lo rechaza con el mismo motivo.

import { readFileSync } from 'node:fs';
import { extraer } from '@/lib/sig/scorm-paquete';
import { analizarManifiesto } from '@/lib/sig/scorm-manifiesto';
import { cspDelPaquete } from '@/lib/sig/scorm-origen';

const ruta = process.argv[2];
if (ruta === undefined) {
  console.error('\n  Uso:  npx tsx scripts/analizar-scorm.ts "<ruta al .zip>"\n');
  process.exit(1);
}

const maxZipMb = Number(process.env.SCORM_TAMANO_MAX_MB ?? '200');

async function main(): Promise<void> {
  const zip = readFileSync(ruta);
  console.log(`\n  ${ruta}`);
  console.log(`  ${zip.length.toLocaleString('es-CO')} bytes  ·  techo configurado: ${maxZipMb} MB\n`);

  const entradas = await extraer(zip, maxZipMb);
  console.log(`  ${entradas.length} archivos, todos con ruta segura.\n`);

  const manifiesto = entradas.find((e) => e.ruta === 'imsmanifest.xml');
  if (manifiesto === undefined) {
    console.error('  RECHAZADO: no hay imsmanifest.xml en la raíz.\n');
    process.exit(1);
  }

  // El mismo filtro de `guardarPaquete`: HTML y JavaScript entran al análisis; los `.xsd`
  // quedan fuera porque son los esquemas del estándar y están llenos de URLs de namespace
  // que no son orígenes de contenido.
  const contenidos: Record<string, string> = {};
  for (const e of entradas) {
    if (/\.(html?|m?js)$/i.test(e.ruta)) contenidos[e.ruta] = e.bytes.toString('utf8');
  }

  const resultado = analizarManifiesto(
    manifiesto.bytes.toString('utf8'),
    entradas.map((e) => e.ruta),
    contenidos,
  );

  if (!resultado.ok) {
    console.error(`  RECHAZADO: ${resultado.motivo}\n`);
    process.exit(1);
  }

  const p = resultado.paquete;
  console.log('  ACEPTADO');
  console.log(`    edición        ${p.edicion}`);
  console.log(`    organización   ${p.tituloOrganizacion}  (${p.organizacionId})`);
  console.log(`    SCO de entrada ${p.entradaHref}`);
  console.log(`    clase          ${p.clase}`);
  console.log(
    `    dominios       ${p.dominiosExternos.length === 0 ? '(ninguno)' : p.dominiosExternos.join(', ')}`,
  );

  console.log('\n  CSP que se le aplicaría al contenido:');
  for (const directiva of cspDelPaquete(p.dominiosExternos).split('; ')) {
    console.log(`    ${directiva}`);
  }

  if (p.clase === 'DESPACHO') {
    console.log(
      '\n  D-4 · ES UN DESPACHO. El contenido lo entrega un tercero, así que al lanzarlo\n' +
        '  el CORREO y el NOMBRE de cada persona viajan a:\n' +
        `    ${p.dominiosExternos.join(', ')}\n` +
        '  Y el SHA-256 del zip NO congela el curso: cubre la cáscara, no el contenido.\n',
    );
  } else {
    console.log('\n  Es AUTOCONTENIDO: el contenido no sale de la aplicación.\n');
  }

  console.log('  Archivos del paquete:');
  for (const e of [...entradas].sort((a, b) => a.ruta.localeCompare(b.ruta))) {
    console.log(`    ${e.bytes.length.toString().padStart(8)}  ${e.ruta}`);
  }
  console.log('');
}

main().catch((error) => {
  console.error(`\n  RECHAZADO: ${(error as Error).message}\n`);
  process.exit(1);
});
