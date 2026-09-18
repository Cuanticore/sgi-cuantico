// scripts/preparar-curso-prueba.ts
//
// Deja listo un curso para PROBAR EL PLAYER en local: carga un .zip SCORM en un contenido
// CURSO_VIRTUAL y crea una asignación a una persona. Imprime la URL del player.
//
//   npx tsx --tsconfig tsconfig.scripts.json scripts/preparar-curso-prueba.ts <curso.zip> [correo]
//
// SÓLO LOCAL. La guarda es la misma de `prisma/seeds/demo.ts`: crea una asignación de prueba,
// y eso contra una base compartida sería basura en la bandeja de una persona real.
//
// Usa `guardarPaquete` —el MISMO camino que la pantalla de Contenidos—: analiza el manifiesto,
// exige una edición soportada, comprueba el SCO de entrada, clasifica AUTOCONTENIDO/DESPACHO y
// extrae los dominios para la CSP. Un INSERT a mano se saltaría todo eso.

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { guardarPaquete } from '@/lib/sig/scorm-paquete';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL no está definida.'); process.exit(1); }
const host = new URL(url).hostname;
if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error(`\n  NEGADO. Sólo local, y DATABASE_URL apunta a «${host}».\n`);
  process.exit(1);
}

const zipPath = process.argv[2];
const correo = process.argv[3] ?? 'daniel.medina@cuantico.com';
if (!zipPath) {
  console.error('\n  Uso: npx tsx --tsconfig tsconfig.scripts.json scripts/preparar-curso-prueba.ts <curso.zip> [correo]\n');
  process.exit(2);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const MAX_ZIP_MB = Number(process.env.SCORM_TAMANO_MAX_MB ?? '200');

async function main(): Promise<void> {
  // 1 · el contenido CURSO_VIRTUAL donde vive el paquete.
  const contenido = await prisma.contenidoSig.findFirst({
    where: { tipo: 'CURSO_VIRTUAL', activo: true },
    select: { id: true, codigo: true, titulo: true },
  });
  if (!contenido) {
    console.error('\n  No hay ningún contenido CURSO_VIRTUAL. Corré antes la migración de cursos virtuales.\n');
    process.exit(1);
  }

  // 2 · cargar el paquete por el camino real.
  const zip = readFileSync(zipPath);
  const r = await guardarPaquete(contenido.id, zip, null, MAX_ZIP_MB);
  if (!r.ok) {
    console.error(`\n  El paquete NO pasó: ${r.motivo}\n`);
    process.exit(1);
  }
  console.log(`\n  ✓ Paquete v${r.guardado.version} cargado en ${contenido.codigo} «${contenido.titulo}».`);

  // 3 · la persona.
  const persona = await prisma.persona.findUnique({ where: { correo }, select: { id: true, nombre: true } });
  if (!persona) {
    console.error(`\n  No existe la persona «${correo}». Corré el seed demo primero.\n`);
    process.exit(1);
  }

  // 4 · una asignación de este contenido a esa persona. Idempotente: si ya hay una del mismo
  //     periodo, se reusa. `contenidoId` presente hace opcionales obligacion/periodo derivados;
  //     se le da un periodo y una fecha límite explícitos para no depender del motor.
  const periodo = String(new Date().getFullYear());
  const fechaApertura = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const fechaLimite = new Date(fechaApertura);
  fechaLimite.setDate(fechaLimite.getDate() + 30);

  const existente = await prisma.asignacion.findFirst({
    where: { contenidoId: contenido.id, personaId: persona.id, periodo },
    select: { id: true },
  });
  const asignacion = existente ?? await prisma.asignacion.create({
    data: {
      contenidoId: contenido.id,
      personaId: persona.id,
      periodo,
      fechaApertura,
      fechaLimite,
      estado: 'PENDIENTE',
    },
    select: { id: true },
  });

  const puerto = process.env.PORT ?? '3000';
  console.log(`  ✓ Asignación ${asignacion.id} para ${persona.nombre} (${correo}).`);
  console.log(`\n  Abrir el player en:  http://localhost:${puerto}/mi-sig/curso/${asignacion.id}\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(`\n  ${(e as Error).message}\n`);
  await prisma.$disconnect();
  process.exit(1);
});
